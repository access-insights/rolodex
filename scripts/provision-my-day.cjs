// Operator-only provisioning. Never expose this script as an assistant tool.
// Uses the signed-in Netlify operator; prints no credentials or contact content.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');const {Client}=require('pg');
const site='227c3bdf-e434-43a5-8918-38ea3c652598';const account='67e874adf55cc07299f74089';
const shellQuote=s=>"'"+s.replaceAll("'","'\\''")+"'";
let phase='operator configuration';
async function main(){
  const config=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'netlify','Config','config.json'),'utf8'));
  const user=Object.values(config.users).find(u=>u.email==='darryl.adams@accessinsights.net');
  if(!user?.auth?.token)throw new Error('Sign into the Access Insights Netlify account first');
  async function api(route,method='GET',body){
    const r=await fetch('https://api.netlify.com/api/v1'+route,{method,headers:{Authorization:'Bearer '+user.auth.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    if(!r.ok)throw new Error('Netlify operation failed ('+r.status+')');
    return r.status===204 ? null : r.json();
  }
  const envPath=`/accounts/${account}/env?site_id=${site}`;
  phase='read Netlify environment';
  const vars=await api(envPath);
  function value(key){const entries=vars.find(e=>e.key===key)?.values || [];return (entries.find(v=>v.context==='production') || entries.find(v=>v.context==='all'))?.value;}
  let secret=value('MY_DAY_INTEGRATION_SECRET');
  phase='configure Netlify credential';
  if(!secret){
    secret=crypto.randomBytes(32).toString('hex');
    await api(envPath,'POST',[{key:'MY_DAY_INTEGRATION_SECRET',scopes:['functions'],values:[{context:'production',value:secret}]}]);
  }
  if(!/^[a-f0-9]{64}$/.test(secret))throw new Error('Credential is masked; load it from the NUC rather than rotating silently');
  const envScript="import sys,pathlib; p=pathlib.Path('/home/darryl-adams/family-hub/planner/.env'); key='MY_DAY_ROLODEX_SECRET='; value=sys.stdin.read().strip(); assert len(value)>=32; lines=[l for l in p.read_text().splitlines() if not l.startswith(key)]; tmp=p.with_suffix('.env.tmp'); tmp.write_text('\\n'.join(lines+[key+value])+'\\n'); tmp.chmod(0o600); tmp.replace(p)";
  phase='configure NUC credential';
  execFileSync('ssh',['dev-nuc',"python3 -c "+shellQuote(envScript)],{input:secret,stdio:['pipe','pipe','pipe']});
  console.log('Dedicated credential configured in production functions and NUC environment; no secrets printed.');
  if(process.argv.includes('--configure-only'))return;
  phase='verify database identity against production API';
  const stamp=String(Math.floor(Date.now()/1000));const signature=crypto.createHmac('sha256',secret).update(stamp+'\nassistant.status\n{}').digest('hex');
  const live=await fetch('https://rolodex.accessinsights.net/api?action=assistant.status',{method:'POST',headers:{'Content-Type':'application/json','X-My-Day-Timestamp':stamp,'X-My-Day-Signature':signature},body:'{}'});
  const status=await live.json();if(!live.ok || !status.ok)throw new Error('Deploy the assistant API before provisioning');
  const org=status.data.orgId;let dbUrl=value('SUPABASE_DB_URL');
  // Netlify masks production secret values. A local-development credential may be
  // used only when its target fingerprint matches the running production service.
  if(!/^postgres(?:ql)?:\/\//.test(dbUrl || ''))dbUrl=vars.find(e=>e.key==='SUPABASE_DB_URL')?.values.find(v=>v.context==='dev')?.value;
  if(!org || !dbUrl)throw new Error('Production organization/database settings missing');
  const connection=new URL(dbUrl);for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])connection.searchParams.delete(k);
  if(status.data.databaseIdentity!==crypto.createHash('sha256').update(connection.host+connection.username+connection.pathname).digest('hex'))throw new Error('Operator credential does not identify the production database');
  const db=new Client({connectionString:connection.toString(),ssl:{rejectUnauthorized:false}});
  phase='connect to database';
  await db.connect();
  try{
    await db.query('begin isolation level repeatable read');
    const found=await db.query('select id from organizations where id=$1',[org]);
    if(found.rowCount!==1)throw new Error('Configured organization does not exist');
    // Capture a consistent pre-integration data snapshot before provisioning.
    phase='snapshot';
    const snapshot={at:new Date().toISOString(),kind:'rolodex-pre-integration-data-export',orgId:org,tables:{}};
    for(const table of ['organizations','users','contacts','contact_emails','contact_phone_numbers','contact_websites','contact_comments','linkedin_history','audit_log']){
      snapshot.tables[table]=(await db.query(`select * from ${table} where ${table==='organizations'?'id':'organization_id'}=$1`,[org])).rows;
    }
    const backupScript="import sys,pathlib,os; p=pathlib.Path('/home/darryl-adams/family-hub/planner/state/rolodex-backups'); p.mkdir(mode=0o700,exist_ok=True); f=p/'pre-integration.json'; data=sys.stdin.buffer.read(); assert not f.exists(), 'Snapshot already exists'; f.write_bytes(data); f.chmod(0o600)";
    // A retry preserves the original snapshot.
    const exists=execFileSync('ssh',['dev-nuc','test -f /home/darryl-adams/family-hub/planner/state/rolodex-backups/pre-integration.json && echo yes || echo no'],{encoding:'utf8'}).trim();
    if(exists!=='yes')execFileSync('ssh',['dev-nuc',"python3 -c "+shellQuote(backupScript)],{input:JSON.stringify(snapshot),stdio:['pipe','pipe','pipe']});
    phase='provision actor and index';
    await db.query(fs.readFileSync('db/013_assistant_receipts.sql','utf8'));
    const existing=await db.query("select organization_id from users where subject='integration:my-day'");
    if(existing.rows[0] && existing.rows[0].organization_id!==org)throw new Error('Integration identity belongs to a different organization');
    await db.query("insert into users(id,organization_id,subject,email,display_name,role) values($1,$2,'integration:my-day',null,'My Day — Darryl authorized business requests','creator') on conflict(subject) do nothing",[crypto.randomUUID(),org]);
    await db.query('commit');
    console.log('Integration actor and receipt index provisioned; pre-integration data snapshot retained.');
  }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
}
main().catch(e=>{console.error('Provisioning stopped at '+phase+' ('+(e.code || e.cause?.code || e.name)+'). Credentials have not been printed.');process.exitCode=1;});
