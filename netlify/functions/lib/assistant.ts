import { createHmac, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import type { HandlerEvent } from "@netlify/functions";
import type { PoolClient } from "pg";
import { z } from "zod";

export const assistantActions = new Set(["assistant.search", "assistant.get", "assistant.save", "assistant.status"]);
export function assistantOrganization(defaultOrg:string,override:string|undefined,tenant:string|undefined){
  const valid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  const organization=override || (valid(defaultOrg) ? defaultOrg : tenant || "");
  if(!valid(organization))throw new Error("Missing authorization organization");
  return organization;
}

// Separate server credential: it never grants access to legacy/admin/export routes.
export function authenticateAssistant(event: HandlerEvent, secret: string | undefined, now = Date.now()) {
  const action=event.queryStringParameters?.action || "";
  if (!assistantActions.has(action) || !secret || secret.length<32 || event.httpMethod!=="POST")
    throw new Error("Invalid authorization for assistant");
  const stamp=event.headers["x-my-day-timestamp"] || "";
  const signature=event.headers["x-my-day-signature"] || "";
  if (!/^\d{10}$/.test(stamp) || Math.abs(now/1000-Number(stamp))>120 || !/^[a-f0-9]{64}$/.test(signature) || event.isBase64Encoded)
    throw new Error("Invalid authorization for assistant");
  const expected=createHmac("sha256",secret).update(`${stamp}\n${action}\n${event.body || ""}`).digest();
  if (!timingSafeEqual(expected,Buffer.from(signature,"hex"))) throw new Error("Invalid authorization for assistant");
}

const method=z.object({label:z.string().trim().max(120).optional(),value:z.string().trim().min(1).max(320)}).strict();
const httpUrl=z.string().url().refine(v=>/^https?:\/\//i.test(v),"An HTTP(S) URL is required");
const fieldsSchema=z.object({
  firstName:z.string().trim().min(1).max(120).optional(),lastName:z.string().trim().min(1).max(120).optional(),
  company:z.string().trim().max(240).nullable().optional(),role:z.string().trim().max(240).nullable().optional(),
  internalContact:z.string().trim().max(240).nullable().optional(),referredBy:z.string().trim().max(240).nullable().optional(),
  referredByContactId:z.string().uuid().nullable().optional(),linkedInProfileUrl:httpUrl.nullable().optional(),
  contactType:z.enum(["Advisor","Funder","Partner","Client","General"]).optional(),
  status:z.enum(["Active","Prospect","Inactive","Archived"]).optional(),
  emails:z.array(method.extend({value:z.string().email()})).max(25).optional(),
  phones:z.array(method).max(25).optional(),websites:z.array(method.extend({value:httpUrl})).max(25).optional()
}).strict().refine(v=>Object.keys(v).length>0,"No fields supplied");
export const saveSchema=z.object({
  requestId:z.string().uuid(), instructionHash:z.string().regex(/^[a-f0-9]{64}$/),
  businessPurpose:z.string().trim().min(3).max(240),
  operation:z.enum(["create","update"]), id:z.string().uuid().optional(),
  expectedVersion:z.string().min(1).max(80).optional(), fields:fieldsSchema
}).strict().superRefine((v,ctx)=>{
  if(v.operation==="create" && (!v.fields.firstName || !v.fields.lastName || v.id || v.expectedVersion))
    ctx.addIssue({code:"custom",message:"A new contact requires first/last name and no existing ID/version"});
  if(v.operation==="update" && (!v.id || !v.expectedVersion))
    ctx.addIssue({code:"custom",message:"An update requires an exact ID and version from a fresh read"});
});

export class AssistantError extends Error {
  constructor(public status:number, message:string, public details?:unknown){super(message);}
}

const columns:Record<string,string>={firstName:"first_name",lastName:"last_name",company:"organization",role:"role",internalContact:"internal_contact",referredBy:"referred_by",referredByContactId:"referred_by_contact_id",linkedInProfileUrl:"linkedin_profile_url",contactType:"contact_type",status:"status"};
const methods:Record<string,[string,string]>={emails:["contact_emails","email"],phones:["contact_phone_numbers","phone_number"],websites:["contact_websites","url"]};
type Context={orgId:string;userId:string};
type Helpers={actor:()=>Promise<string|null>;detail:(id:string)=>Promise<unknown>;audit:(id:string,metadata:Record<string,unknown>)=>Promise<void>};

export async function saveBusinessContact(client:PoolClient,ctx:Context,raw:unknown,helpers:Helpers){
  const input=saveSchema.parse(raw);
  const fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex");
  // Serializes assistant writes per organization, including duplicate checks and retries.
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["assistant:"+ctx.orgId]);
  const prior=await client.query<{metadata:Record<string,unknown>}>("select metadata from audit_log where organization_id=$1 and actor_subject=$2 and action='assistant.contact.save' and metadata->>'requestId'=$3 limit 1",[ctx.orgId,ctx.userId,input.requestId]);
  if(prior.rows[0]){
    const meta=prior.rows[0].metadata;
    if(meta.fingerprint!==fingerprint)throw new AssistantError(409,"Request ID was already used for different changes");
    return meta.receipt;
  }
  const id=input.id || randomUUID();
  let old:Record<string,unknown>|undefined;
  if(input.operation==="update"){
    const found=await client.query("select *,updated_at::text as version from contacts where unique_id=$1 and organization_id=$2 for update",[id,ctx.orgId]);
    old=found.rows[0];
    if(!old)throw new AssistantError(404,"Contact not found");
    if(old.version!==input.expectedVersion)throw new AssistantError(409,"Contact changed; read the latest version before updating");
  }
  const f=input.fields;
  const first=f.firstName ?? old?.first_name;const last=f.lastName ?? old?.last_name;
  const company=f.company===undefined ? old?.organization : f.company;
  const linkedin=f.linkedInProfileUrl===undefined ? old?.linkedin_profile_url : f.linkedInProfileUrl;
  const emails=(f.emails || []).map(e=>e.value.toLowerCase());
  const duplicates=await client.query("select unique_id,first_name,last_name from contacts c where organization_id=$1 and unique_id<>$2 and ((lower(first_name)=lower($3) and lower(last_name)=lower($4) and lower(coalesce(organization,''))=lower(coalesce($5,''))) or ($6::text is not null and lower(linkedin_profile_url)=lower($6)) or exists(select 1 from contact_emails e where e.organization_id=c.organization_id and e.contact_id=c.unique_id and lower(e.email)=any($7::text[]))) limit 5",[ctx.orgId,id,first,last,company ?? null,linkedin ?? null,emails]);
  if(duplicates.rows.length)throw new AssistantError(409,"Possible duplicate; choose the existing contact or clarify identity",duplicates.rows);
  if(f.referredByContactId){
    const ref=await client.query("select unique_id from contacts where organization_id=$1 and unique_id=$2",[ctx.orgId,f.referredByContactId]);
    if(!ref.rows.length || f.referredByContactId===id)throw new AssistantError(400,"Referrer must be another contact in this organization");
  }
  const actor=await helpers.actor();
  if(!actor)throw new AssistantError(403,"Integration actor is not provisioned");
  if(input.operation==="create"){
    await client.query("insert into contacts(unique_id,organization_id,first_name,last_name,contact_type,status,created_by,updated_by) values($1,$2,$3,$4,$5::contact_type_enum,$6::contact_status_enum,$7,$7)",[id,ctx.orgId,first,last,f.contactType || "General",f.status || "Active",actor]);
  }
  const values:unknown[]=[actor];const sets=["updated_by=$1","updated_at=clock_timestamp()"];
  for(const [key,column] of Object.entries(columns)){
    if(Object.hasOwn(f,key)){
      values.push(f[key as keyof typeof f]);
      const cast=key==="contactType" ? "::contact_type_enum" : key==="status" ? "::contact_status_enum" : "";
      sets.push(`${column}=$${values.length}${cast}`);
    }
  }
  values.push(id,ctx.orgId);
  await client.query(`update contacts set ${sets.join(",")} where unique_id=$${values.length-1} and organization_id=$${values.length}`,values);
  // Contact methods are additive in v1. Existing IDs/data are never deleted.
  for(const [key,[table,column]] of Object.entries(methods)){
    if(!Object.hasOwn(f,key))continue;
    const entries=f[key as "emails"|"phones"|"websites"] || [];
    for(const entry of entries)await client.query(`insert into ${table}(organization_id,contact_id,label,${column},created_by) select $1,$2,$3,$4,$5 where not exists(select 1 from ${table} where organization_id=$1 and contact_id=$2 and lower(${column})=lower($4))`,[ctx.orgId,id,entry.label || null,entry.value,actor]);
  }
  const version=await client.query<{version:string}>("select updated_at::text as version from contacts where organization_id=$1 and unique_id=$2",[ctx.orgId,id]);
  const receipt={id,version:version.rows[0].version,requestId:input.requestId,contact:await helpers.detail(id)};
  await helpers.audit(id,{requestId:input.requestId,fingerprint,instructionHash:input.instructionHash,businessPurpose:input.businessPurpose,fields:Object.keys(f),receipt});
  return receipt;
}
