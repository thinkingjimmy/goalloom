/**
 * [INPUT]: Development lease, protected synthetic journal, fixed-project read-only transaction client, bounded fixture HTTP and optional branded D3 policy.
 * [OUTPUT]: Bounded Auth/RPC/Storage, finite diagnostics, one safe scope-check recovery and exact subject/event ownership checks.
 * [POS]: Shared fixture support; default D2 rejects provider customers and D3 opts into one exact policy.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { readFile, open, rename, lstat, mkdir } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { client, developmentRef, developmentUrl } from '../hosted-ai/client.mjs'
import { canonicalJson } from '../../packages/contracts/src/canonical.ts'
import {assertD3ProviderPolicy,attachD3ProviderPolicy,assertD3DatabaseOwnership,guardD3BillingRpc,d3WorkerMethods} from './provider-fixture.mjs'
import {fixtureHttpRequest,fixtureRequestFailure} from './fixture-http.mjs'
export const sha=value=>createHash('sha256').update(value).digest('hex')
export const q=value=>value===null?'null':`'${String(value).replaceAll("'","''")}'`
export const json=value=>`${q(JSON.stringify(value))}::jsonb`
export const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
export function requireLease(lease){assert.equal(process.env.D2_LIFECYCLE_FIXTURE_WINDOW,'development','Explicit Root fixture window required');assert(lease&&process.env.D2_LIFECYCLE_FIXTURE_LEASE===lease,'Exact Root fixture lease required')}
export async function savePrivate(path,value){
 assert(isAbsolute(path),'Explicit absolute protected journal required');await mkdir(dirname(path),{recursive:true,mode:0o700})
 const temporary=`${path}.${randomUUID()}.tmp`,handle=await open(temporary,'wx',0o600)
 try{await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync()}finally{await handle.close()}
 await rename(temporary,path)
 const directory=await open(dirname(path),'r');try{await directory.sync()}finally{await directory.close()}
}
export async function loadPrivate(path){const info=await lstat(path);assert(info.isFile()&&!info.isSymbolicLink()&&(info.mode&0o077)===0,'Protected journal permissions required');return JSON.parse(await readFile(path,'utf8'))}
export function identityMaterial(journal){return{project:journal.project,runId:journal.runId,
 races:(journal.races??[]).map(entry=>({id:entry.id,scenario:entry.scenario,materialDigest:sha(canonicalJson(entry.material)),cleanupSessionId:entry.cleanupSessionId,ledgerPath:entry.ledgerPath,
  identity:identityMaterial({project:journal.project,runId:entry.id,fixtures:[entry.fixture],scopes:entry.scopes})})),
 scopes:Object.fromEntries(Object.entries(journal.scopes).map(([name,value])=>[name,{id:value.id,secretDigest:sha(Buffer.from(value.secret,'hex'))}])),
 fixtures:journal.fixtures.map(f=>({ownerId:f.ownerId,email:f.email,passwordDigest:sha(f.password),sessionCount:f.sessionCount,
  devices:f.devices.map(d=>({secretsDigest:sha(canonicalJson(d.secrets))})),
  targets:f.targets.map(t=>({workspaceId:t.workspaceId,generation:t.generation,path:t.path,bodyDigest:sha(Buffer.from(t.bodyHex,'hex')),transportCase:t.transportCase}))}))}}
export async function verifySources(plan){for(const entry of plan.sources)assert.equal(sha(await readFile(entry.path)),entry.sha256,'Reviewed fixture input changed');assert.equal(sha(await readFile(plan.runtime.path)),plan.runtime.sha256,'Reviewed fixture runtime changed')}
const serviceMethods=new Set(['lifecycle_scope_check','lifecycle_identity','lifecycle_take_work','lifecycle_ack_export','lifecycle_retry_work','lifecycle_prepare_job','lifecycle_inventory_page','lifecycle_reconcile_transfers',
 'lifecycle_delete_batch','lifecycle_object_result','lifecycle_storage_scan_status','lifecycle_storage_scan_page','lifecycle_purge_content','lifecycle_account_ready','lifecycle_account_deleted','lifecycle_account_work_done',
 'lifecycle_renewal_result','lifecycle_settlement_operation','lifecycle_transfer_finish','lifecycle_restore_begin','lifecycle_restore_status','lifecycle_restore_capture','lifecycle_restore_project',
 'billing_source','billing_status','billing_lock','billing_unlock','billing_assert_lease','billing_bind_customer','billing_prior_facts','billing_closeouts','billing_operation','billing_compensation','billing_commit'])
const userMethods=new Set(['register_device','bootstrap_workspace','create_new_workspace','push_ops','get_sync_status','pull_ops','get_roster','get_key_envelopes'])
function requestOperation(path){
 const route=path.split('?')[0],rpc=route.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1]
 if(rpc)return serviceMethods.has(rpc)||userMethods.has(rpc)||d3WorkerMethods.has(rpc)?`rpc:${rpc}`:'rpc:other'
 if(route.startsWith('/auth/v1/admin/users'))return'auth:identity'
 if(route==='/auth/v1/token')return'auth:session'
 if(route.startsWith('/storage/v1/object'))return'storage:object'
 if(['/functions/v1/billing','/functions/v1/deletion-receipt'].includes(route))return route.endsWith('/billing')?'function:billing':'function:deletion-receipt'
 const action=route.match(/^\/functions\/v1\/lifecycle\/(status|prepare|confirm|finish-initialization)$/)?.[1]
 return action?`lifecycle:${action}`:'fixture:other'
}
export async function fixtureContext({lease,journal,privatePath,scope='work',applicationName,providerPolicy=null}){
 requireLease(lease);assert.equal(journal.project,developmentRef);for(const f of journal.fixtures){assert(uuid.test(f.ownerId));assert.equal(f.email,`billing-${f.ownerId}@goalloom.test`)}
 if(providerPolicy)assertD3ProviderPolicy(providerPolicy,journal)
 assert(/^d2-install:[a-f0-9-]{36}$/.test(applicationName),'Exact shared executor identity required')
 const rawDb=await client(),db={...rawDb,query:(sql,readOnly=true)=>{
  const setup=`set local application_name=${q(applicationName)};set local lock_timeout='3s';set local statement_timeout='15s';`
  if(readOnly){
   assert(/^\s*(select|with)\b/i.test(sql),'Fixture inspection requires SELECT or WITH')
   return rawDb.queryReadOnlyTransaction(sql,applicationName)
  }
  return rawDb.query(/^\s*begin\s*;/i.test(sql)?sql.replace(/^\s*begin\s*;/i,`begin;${setup}`):`begin;${setup}${sql};commit;`,false)
 }},keys=await db.request('/api-keys?reveal=true'),serviceKey=keys.find(k=>k.name==='service_role')?.api_key,anon=keys.find(k=>k.name==='anon')?.api_key
 assert(serviceKey&&anon,'Existing development keys unavailable');db.hide(serviceKey);db.hide(anon)
 for(const f of journal.fixtures){db.hide(f.password);for(const s of f.sessions??[]){db.hide(s.access_token);db.hide(s.refresh_token)}for(const r of Object.values(f.deletions??{}))db.hide(r.secret)}
 for(const capability of Object.values(journal.scopes))db.hide(capability.secret)
 const context={db,journal,privatePath,serviceKey,anon,scope,lease,applicationName,save:()=>savePrivate(privatePath,journal)}
 context.fixture=owner=>{const found=journal.fixtures.find(f=>f.ownerId===owner);assert(found,'Owner outside reviewed fixture manifest');return found}
 context.target=workspace=>{for(const f of journal.fixtures){const found=f.targets.find(t=>t.workspaceId===workspace&&(!f.activeGeneration||t.generation===f.activeGeneration));if(found)return{fixture:f,target:found}}throw Error('Workspace outside reviewed fixture manifest')}
 context.scopeHeader=()=>{const capability=journal.scopes[context.scope];assert(capability?.registered&&Date.parse(capability.expiresAt)>Date.now(),'Registered unexpired fixture scope required');return`${capability.id}.${capability.secret}`}
 context.http=async(path,{method='GET',body,token=serviceKey,raw=false,scopeHeader=false,headers={}}={})=>{
  assert(path.startsWith('/')&&!path.startsWith('//')&&!path.includes('#'),'Fixed-project relative route required')
  assert(['GET','POST','PUT','PATCH','DELETE','HEAD'].includes(method),'Finite fixture HTTP method required')
  const init={method,headers:{apikey:token===serviceKey?serviceKey:anon,authorization:`Bearer ${token}`,
   ...(!raw?{'content-type':'application/json'}:{}),...(scopeHeader?{'x-goalloom-lifecycle-scope':context.scopeHeader()}:{}),...headers},
   ...(body===undefined?{}:{body:raw?body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000),redirect:'error'}
  return fixtureHttpRequest(developmentUrl+path,init,requestOperation(path),method==='POST'&&path==='/rest/v1/rpc/lifecycle_scope_check')
 }
 context.good=(result)=>{if(result.status<200||result.status>=300)throw fixtureRequestFailure(result.requestDiagnostic);return result.body}
 context.guard=async(target={})=>{
  const capability=journal.scopes[context.scope];assert(capability,'Fixture scope missing')
  if(target.subjectId)assert(capability.manifest?.subjects.some(s=>s.subjectId===target.subjectId),'Subject outside fixture scope')
  if(target.ownerId)assert(capability.manifest?.subjects.some(s=>s.ownerId===target.ownerId),'Owner outside fixture scope')
  if(target.workspaceId)assert(capability.manifest?.targets.some(t=>t.workspaceId===target.workspaceId&&(!target.generation||t.generation===target.generation)),'Target outside fixture scope')
  if(target.paths)for(const path of target.paths)assert(target.workspaceId&&target.generation&&path.startsWith(`workspaces/${target.workspaceId}/${target.generation}/`)&&!path.includes('..'),'Object outside exact fixture namespace')
  const checked=context.good(await context.http('/rest/v1/rpc/lifecycle_scope_check',{method:'POST',scopeHeader:true,body:{p_environment:'development',p_subject:target.subjectId??null,p_workspace:target.workspaceId??null,p_generation:target.generation??null,p_owner:target.ownerId??null}}))
  assert(checked?.ok&&checked.scoped&&checked.scopeId===capability.id,'Authoritative fixture capability rejected')
 }
 context.rpc=async(name,args)=>{
  const providerWorker=!!context.providerPolicy&&d3WorkerMethods.has(name)
  assert(serviceMethods.has(name)||providerWorker,'RPC outside reviewed fixture worker port');assert(!Object.hasOwn(args,'p_environment')||args.p_environment==='development')
  const target={subjectId:args.p_subject??args.p_user,workspaceId:args.p_workspace,generation:args.p_generation}
  if(args.p_owner){const known=journal.fixtures.find(f=>f.ownerId===args.p_owner||f.subjectId===args.p_owner);assert(known,'RPC owner outside fixture manifest');target.ownerId=known.ownerId;target.subjectId??=known.subjectId}
  if(args.p_paths)target.paths=args.p_paths;if(args.p_path)target.paths=[args.p_path]
  await context.guard(target)
  if(providerWorker)await guardD3BillingRpc(context,name,args)
  const response=await context.http(`/rest/v1/rpc/${name}`,{method:'POST',body:args,scopeHeader:true})
  const result=context.good(response)
  if(providerWorker)await guardD3BillingRpc(context,name,args,result,true)
  return result
 }
 context.userRpc=async(f,name,args,sessionIndex=0)=>{
  assert(journal.fixtures.includes(f));assert(userMethods.has(name),'User RPC outside fixture port')
  if(args.p_workspace){const known=context.target(args.p_workspace);assert.equal(known.fixture.ownerId,f.ownerId);assert(!args.p_generation||args.p_generation===known.target.generation)}
  await context.refresh(f,sessionIndex);return context.good(await context.http(`/rest/v1/rpc/${name}`,{method:'POST',token:f.sessions[sessionIndex].access_token,body:args,headers:{'x-goalloom-service-version':'2'}}))
 }
 context.refresh=async(f,index=0)=>{const session=f.sessions[index];assert(session,'Protected original session missing');const old=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url'));if(old.exp*1000>Date.now()+60000)return;
  const result=context.good(await context.http('/auth/v1/token?grant_type=refresh_token',{method:'POST',token:anon,body:{refresh_token:session.refresh_token}}));assert.equal(result.user.id,f.ownerId);const next=JSON.parse(Buffer.from(result.access_token.split('.')[1],'base64url'));assert.equal(next.session_id,old.session_id,'Refresh changed original session');db.hide(result.access_token);db.hide(result.refresh_token);Object.assign(session,{access_token:result.access_token,refresh_token:result.refresh_token});await context.save()}
 context.lifecycle=async(f,action,body)=>{assert(journal.fixtures.includes(f));assert(['status','prepare','confirm','finish-initialization'].includes(action));await context.refresh(f);return context.http(`/functions/v1/lifecycle/${action}`,{method:'POST',token:f.sessions[0].access_token,body,headers:{'x-goalloom-service-version':'2'}})}
 context.authIdentity=async(f)=>{assert(journal.fixtures.includes(f));const value=await context.http(`/auth/v1/admin/users/${f.ownerId}`);if(value.status===404)return false;const row=context.good(value);assert(row.id===f.ownerId&&row.email===f.email,'Refuse non-fixture Auth identity');return true}
 if(providerPolicy)attachD3ProviderPolicy(context,providerPolicy)
 return context
}
export async function assertFixtureRows(ctx,f){
 ctx.fixture(f.ownerId)
 const targets=f.targets.map(t=>`(${q(t.workspaceId)}::uuid,${q(t.generation)}::uuid)`).join(',')
 const devices=f.devices.filter(d=>d.id).map(d=>q(d.id)).join(',')||'null'
 const rows=await ctx.db.query(`select jsonb_build_object('account',(select jsonb_build_object('subjectId',subject_id,'ownerTag',encode(owner_tag,'hex'),'mappedOwner',user_id) from service_private.account_lifecycle where environment='development' and owner_tag=service_private.owner_tag(${q(f.ownerId)})),
 'foreignWorkspace',exists(select 1 from public.workspaces where user_id=${q(f.ownerId)} and ${targets?`(id,generation) not in(values ${targets})`:'true'}),
 'foreignDevice',exists(select 1 from public.devices where user_id=${q(f.ownerId)} and id not in(${devices})),
 'foreignTarget',exists(select 1 from service_private.workspace_lifecycle where environment='development' and subject_id=${q(f.subjectId)} and ${targets?`(workspace_id,generation) not in(values ${targets})`:'true'}),
 'billingCustomer',exists(select 1 from public.billing_customers where environment='development' and subject_id=${q(f.subjectId)})) as proof`)
 const proof=rows[0].proof;assert(!proof.foreignWorkspace&&!proof.foreignDevice&&!proof.foreignTarget,'Fixture scope has unlisted dependencies')
 if(ctx.providerPolicy)await assertD3DatabaseOwnership(ctx,f)
 else assert(!proof.billingCustomer,'Unexpected provider customer in synthetic no-provider fixture')
 if(proof.account){assert.equal(proof.account.subjectId,f.subjectId);assert.equal(proof.account.ownerTag,f.ownerTag);assert(!proof.account.mappedOwner||proof.account.mappedOwner===f.ownerId)}
 return proof
}
export async function registerFixtureScope(ctx,name,owners){
 const capability=ctx.journal.scopes[name];assert(capability&&!capability.registered,'Fresh immutable scope required')
 const fixtures=owners.map(owner=>ctx.fixture(owner));for(const f of fixtures){assert(f.subjectId&&f.ownerTag);await assertFixtureRows(ctx,f);await ctx.authIdentity(f)}
 const tags=await ctx.db.query(`select distinct encode(tag,'hex') tag from (
 select service_private.owner_tag(id,'trial-owner') tag from auth.users where id in(${owners.map(q).join(',')}) union all
 select service_private.tag_value(provider||'|'||(identity_data->>'sub'),'trial-provider') from auth.identities where user_id in(${owners.map(q).join(',')}) and identity_data->>'sub' is not null) t`)
 const manifest={version:1,environment:'development',projectRef:developmentRef,subjects:fixtures.map(f=>({subjectId:f.subjectId,ownerId:f.ownerId,ownerTag:f.ownerTag})),
  targets:fixtures.flatMap(f=>f.targets.map(t=>({subjectId:f.subjectId,workspaceId:t.workspaceId,generation:t.generation}))),
  devices:fixtures.flatMap(f=>f.devices.filter(d=>d.id).map(d=>({deviceId:d.id,ownerId:f.ownerId,sessionId:d.sessionId}))),trialTags:[...new Set([...tags.map(t=>t.tag),...fixtures.flatMap(f=>f.trialTags??[])])].sort()}
 capability.manifest=manifest;capability.digest=sha(Buffer.from(capability.secret,'hex'));await ctx.save()
 const existing=(await ctx.db.query(`select encode(secret_digest,'hex') digest,manifest,created_at,expires_at,revoked_at from service_private.worker_scopes where id=${q(capability.id)}`))[0]
 if(existing){assert(existing.digest===capability.digest&&canonicalJson(existing.manifest)===canonicalJson(manifest)&&!existing.revoked_at,'Original scope registration conflicts');capability.createdAt=existing.created_at;capability.expiresAt=existing.expires_at;capability.registered=true;await ctx.save();ctx.scope=name;await ctx.guard();return capability}
 const rows=await ctx.db.query(`begin;set local statement_timeout='10s';set local lock_timeout='3s';with timing as(select clock_timestamp() t)
 insert into service_private.worker_scopes(id,secret_digest,manifest,created_at,expires_at) select ${q(capability.id)},decode(${q(capability.digest)},'hex'),${json(manifest)},t,t+interval '1 hour' from timing
 returning created_at,expires_at;commit;`,false)
 const row=rows.find(value=>value.expires_at);assert(row,'Scope registration has unknown outcome');capability.createdAt=row.created_at;capability.expiresAt=row.expires_at;capability.registered=true;await ctx.save()
 ctx.scope=name;await ctx.guard();return capability
}
export async function advanceFixtureWork(ctx){
 await ctx.guard();const capability=ctx.journal.scopes[ctx.scope],ids=capability.manifest.subjects.map(s=>q(s.subjectId)).join(',')
 for(const f of ctx.journal.fixtures.filter(f=>capability.manifest.subjects.some(s=>s.subjectId===f.subjectId)))await assertFixtureRows(ctx,f)
 await ctx.db.query(`begin;set local statement_timeout='10s';set local lock_timeout='3s';
 update service_private.deletion_outbox set retry_at=clock_timestamp() where environment='development' and subject_id in(${ids}) and acknowledged_at is null and lease is null;
 update service_private.workspace_lifecycle set next_due_at=service_private.lifecycle_now(environment,subject_id) where environment='development' and subject_id in(${ids}) and state in('queued','deleting') and lease is null;
 update service_private.account_lifecycle set work_retry_at=clock_timestamp() where environment='development' and subject_id in(${ids}) and state in('deleting','deleted') and work_lease is null;
 commit;`,false)
}
export const journalDigest=journal=>sha(canonicalJson(identityMaterial(journal)))
export function objectAbsent(response){return response.status===404||response.status===400&&['NoSuchKey','not_found'].includes(response.body?.code??response.body?.error)}
