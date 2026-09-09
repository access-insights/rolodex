const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac,randomUUID}=require('node:crypto');
const {readFileSync,readdirSync}=require('node:fs');
const {Pool}=require('pg');
const {authenticateAssistant,assistantOrganization,saveBusinessContact,saveSchema}=require('../dist-functions/lib/assistant.js');
test('organization mirrors valid default or configured tenant and fails closed on bad overrides',()=>{
  const tenant=randomUUID(),override=randomUUID();
  assert.equal(assistantOrganization('11111111-1111-1111-1111-111111111111',undefined,tenant),tenant);
  assert.equal(assistantOrganization(tenant,override,undefined),override);
  assert.throws(()=>assistantOrganization('',undefined,undefined));
  assert.throws(()=>assistantOrganization(tenant,'bad-override',tenant));
});
const secret='x'.repeat(64);
function signed(action='assistant.status',body='{}',stamp=String(Math.floor(Date.now()/1000))){return {httpMethod:'POST',headers:{'x-my-day-timestamp':stamp,'x-my-day-signature':createHmac('sha256',secret).update(`${stamp}\n${action}\n${body}`).digest('hex')},queryStringParameters:{action},body};}
test('signature binds body, action and freshness; legacy writes cannot use integration identity',()=>{
  authenticateAssistant(signed(),secret);
  for(const e of [{...signed(),body:'{"admin":true}'},signed('users/update-role'),signed('assistant.status','{}','1000000000'),{...signed(),httpMethod:'GET'}])assert.throws(()=>authenticateAssistant(e,secret));
  assert.throws(()=>authenticateAssistant(signed(),undefined));
});
test('write schema rejects private notes, invented fields and missing version',()=>{
  assert.throws(()=>saveSchema.parse({requestId:randomUUID(),instructionHash:'a'.repeat(64),businessPurpose:'Advisor',operation:'update',id:randomUUID(),fields:{role:'CEO'}}));
  assert.throws(()=>saveSchema.parse({requestId:randomUUID(),instructionHash:'a'.repeat(64),businessPurpose:'Advisor',operation:'create',fields:{firstName:'Test',lastName:'Person',privateNotes:'private'}}));
});

const database=process.env.ROLODEX_TEST_DATABASE_URL;
test('isolated Postgres: preservation, RLS, concurrency, receipts, duplicates and rollback',{skip:!database},async()=>{
  // Dedicated throwaway database only. Never point this at production.
  if(!database.includes(':55439/') || !database.includes('127.0.0.1'))throw new Error('Isolated localhost database required');
  const pool=new Pool({connectionString:database});const admin=await pool.connect();
  try{
    for(const file of readdirSync('db').filter(f=>f.endsWith('.sql')&&!f.startsWith('003')).sort())await admin.query(readFileSync('db/'+file,'utf8'));
    const org=randomUUID(),otherOrg=randomUUID(),actor=randomUUID(),otherActor=randomUUID();
    await admin.query("insert into organizations(id,name) values($1,'Test business'),($2,'Other business')",[org,otherOrg]);
    await admin.query("insert into users(id,organization_id,subject,role) values($1,$2,'integration:my-day','creator'),($3,$4,'other','creator')",[actor,org,otherActor,otherOrg]);
    await admin.query('create role assistant_test_runtime nologin nosuperuser nobypassrls');
    await admin.query('grant usage on schema public to assistant_test_runtime; grant select,insert,update,delete on all tables in schema public to assistant_test_runtime; grant usage,select on all sequences in schema public to assistant_test_runtime');
    const ctx={orgId:org,userId:'integration:my-day'};
    async function tx(fn,orgId=org){const c=await pool.connect();try{await c.query('begin');await c.query('set local role assistant_test_runtime');await c.query("select set_config('app.current_sub',$1,true),set_config('app.current_role','creator',true),set_config('app.current_org_id',$2,true)",[ctx.userId,orgId]);const result=await fn(c);await c.query('commit');return result;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
    function helpers(c){return {actor:async()=>actor,detail:async(id)=>(await c.query('select * from contacts where unique_id=$1',[id])).rows[0],audit:async(id,metadata)=>{await c.query("insert into audit_log(organization_id,actor_subject,action,entity_id,metadata) values($1,$2,'assistant.contact.save',$3,$4)",[org,ctx.userId,id,metadata]);}};}
    const input={requestId:randomUUID(),instructionHash:'a'.repeat(64),businessPurpose:'Business accountant',operation:'create',fields:{firstName:'Test',lastName:'Person',company:'Fixture Inc',emails:[{value:'fixture@example.com'}],websites:[{value:'https://example.com'}]}};
    const created=await tx(c=>saveBusinessContact(c,ctx,input,helpers(c)));
    const retry=await tx(c=>saveBusinessContact(c,ctx,input,helpers(c)));
    assert.equal(retry.id,created.id);
    assert.equal((await admin.query("select count(*) from audit_log where action='assistant.contact.save'")).rows[0].count,'1');
    await assert.rejects(tx(c=>saveBusinessContact(c,ctx,{...input,fields:{...input.fields,role:'Changed'}},helpers(c))),/already used/);
    await assert.rejects(tx(c=>saveBusinessContact(c,ctx,{...input,requestId:randomUUID(),fields:{firstName:'Different',lastName:'Name',emails:[{value:'FIXTURE@example.com'}]}},helpers(c))),/duplicate/);
    const patch={requestId:randomUUID(),instructionHash:'b'.repeat(64),businessPurpose:'Business accountant',operation:'update',id:created.id,expectedVersion:created.version,fields:{role:'Partner',websites:[{value:'https://example.org'}]}};
    const updated=await tx(c=>saveBusinessContact(c,ctx,patch,helpers(c)));
    assert.equal(updated.contact.organization,'Fixture Inc');assert.equal(updated.contact.role,'Partner');
    assert.equal((await admin.query('select count(*) from contact_emails where contact_id=$1',[created.id])).rows[0].count,'1');
    assert.equal((await admin.query('select count(*) from contact_websites where contact_id=$1',[created.id])).rows[0].count,'2');
    await assert.rejects(tx(c=>saveBusinessContact(c,ctx,{...patch,requestId:randomUUID()},helpers(c))),/changed/);
    assert.equal((await tx(c=>c.query('select * from contacts where unique_id=$1',[created.id]),otherOrg)).rowCount,0);
    await assert.rejects(tx(c=>saveBusinessContact(c,ctx,{...patch,requestId:randomUUID(),expectedVersion:updated.version,fields:{company:null}}, {...helpers(c),audit:async()=>{throw new Error('audit failure');}})),/audit failure/);
    assert.equal((await admin.query('select organization from contacts where unique_id=$1',[created.id])).rows[0].organization,'Fixture Inc');
    // Concurrent retry shares a receipt, even while both are in flight.
    const concurrent={...input,requestId:randomUUID(),fields:{firstName:'Another',lastName:'Fixture'}};
    const [a,b]=await Promise.all([tx(c=>saveBusinessContact(c,ctx,concurrent,helpers(c))),tx(c=>saveBusinessContact(c,ctx,concurrent,helpers(c)))]);
    assert.equal(a.id,b.id);
  }finally{admin.release();await pool.end();}
});
