/**
 * [INPUT]: Exact development fixture manifest, guarded Stripe SDK and scoped database/CLI access.
 * [OUTPUT]: Resumable cleanup, read-only completion verification, bounded failure evidence and RC recovery.
 * [POS]: D1 browser/native acceptance cleanup only; no global source, policy, cron, budget or live mutation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {client,developmentRef,developmentUrl} from '../hosted-ai/client.mjs'
import {testStripe} from './stripe-client.mjs'
import {cleanupExactFixtures} from './cleanup-fixtures.mjs'
import {fixtureManifest} from './provider-fixtures.mjs'

const run=promisify(execFile),account='acct_1QvwdlITpGuR8ZMB',rcProject='projd720c733',rcApp='appc06dd78ed3'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const q=value=>`'${String(value).replaceAll("'","''")}'`,id=value=>typeof value==='string'?value:value?.id
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))
const list=(value,pattern)=>Array.isArray(value)&&value.length<=100&&value.every(x=>typeof x==='string'&&pattern.test(x))&&new Set(value).size===value.length
const networkCodes=new Set(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','EPIPE','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE'])
const finiteError=error=>({type:error?.name??'Error',code:typeof error?.code==='string'&&/^[A-Z0-9_]{1,60}$/i.test(error.code)?error.code:'cleanup_stage_failed',
 ...(networkCodes.has(error?.cause?.code)?{causeCode:error.cause.code}:{}),
 location:error?.stack?.match(/\b(?:d1-provider-cleanup|cleanup-fixtures|client|transport)\.mjs:\d+:\d+/)?.[0]??null})

export function validateProviderCleanupManifest(m){
 const allowed=['version','environment','project','account','user','email','createdAt','trialEndsAt','rcProject','rcApp','appUserId','customer','subscriptions','sessions','invoices','cleanup']
 assert(m&&typeof m==='object'&&Object.keys(m).every(key=>allowed.includes(key)),'Unknown cleanup manifest field')
 assert(m.version===1&&m.environment==='development'&&m.project===developmentRef&&m.account===account)
 assert(uuid.test(m.user)&&m.email===`billing-${m.user}@goalloom.test`&&m.appUserId===m.user)
 assert(m.rcProject===rcProject&&m.rcApp===rcApp&&date(m.createdAt)&&Date.parse(m.createdAt)<=Date.now()+60000)
 assert(m.trialEndsAt===null||date(m.trialEndsAt))
 assert(m.customer===null||/^cus_[A-Za-z0-9]+$/.test(m.customer))
 assert(list(m.subscriptions,/^sub_[A-Za-z0-9]+$/)&&list(m.sessions,/^cs_test_[A-Za-z0-9_]+$/)&&list(m.invoices,/^in_[A-Za-z0-9]+$/))
 assert(m.customer||!m.subscriptions.length&&!m.sessions.length&&!m.invoices.length,'Owned provider objects require the recorded customer')
 return m
}

/** rc api uses the existing OAuth profile. The read-only backend key is never upgraded or reused for DELETE. */
export async function cleanupRevenueCatRequest(method,path){
 assert(['GET','DELETE'].includes(method)&&path.startsWith(`/projects/${rcProject}/`)&&!path.includes('..'))
 const env={...process.env};delete env.RC_API_KEY
 try{
  const {stdout}=await run('rc',['api',method,path,'--project-id',rcProject,'--json','--no-input'],{env,timeout:20000,maxBuffer:2*1024*1024})
  const raw=stdout.trim()?JSON.parse(stdout):null
  return {status:200,body:raw?.data&&!raw?.id&&!raw?.items?raw.data:raw}
 }catch(error){
  for(const output of [error.stdout,error.stderr]){
   let body;try{body=JSON.parse(output??'null')}catch{continue} // Never return raw CLI output.
   const status=body?.error?.status??body?.error?.status_code??body?.status??body?.status_code
   if(status===404)return {status:404,body:null}
   if([401,403].includes(status))return {status:403,body:null}
   // v0.1.7 emits API-origin errors on stderr; operational errors use cli_error.
   // https://github.com/RevenueCat/cli/blob/v0.1.7/internal/cli/run.go
   // https://github.com/RevenueCat/cli/blob/v0.1.7/internal/api/error_predicates.go
   if(body?.schema_version===1&&body.error?.type==='resource_missing'&&
    typeof body.error.request_id==='string'&&body.error.request_id.length>0&&
    body.error.doc_url==='https://errors.rev.cat/resource-missing')return {status:404,body:null}
  }
  // A process exit code alone never establishes an HTTP response or absence.
  return {status:503,body:null}
 }
}
function page(response){assert.equal(response.status,200,'RC inspection unavailable');const value=response.body;assert(value&&Array.isArray(value.items)&&!value.next_page&&value.has_more!==true&&value.items.length<=100,'RC inspection must be complete');return value.items}
async function inspectRevenueCat(m,graph,request){
 const prefix=`/projects/${rcProject}/customers/${encodeURIComponent(m.user)}`
 const customer=await request('GET',prefix)
 if(customer.status===404)return {exclusive:true,absent:true}
 assert.equal(customer.status,200,'RC customer inspection unavailable');assert.equal(customer.body?.id,m.user,'RC canonical identity differs')
 const aliases=page(await request('GET',`${prefix}/aliases?limit=100`))
 assert(aliases.every(alias=>typeof alias==='string'?alias===m.user:alias.id===m.user),'RC identity aliases extend outside this fixture')
 // Omitting environment inspects BOTH environments. DELETE has no app/environment filter.
 const subscriptions=page(await request('GET',`${prefix}/subscriptions?limit=100`))
 const purchases=page(await request('GET',`${prefix}/purchases?limit=100`));assert.equal(purchases.length,0,'Non-subscription history is outside this fixture scope')
 for(const sub of subscriptions){
  assert(sub.store==='stripe'&&sub.environment==='sandbox'&&sub.customer_id===m.user&&(!sub.original_customer_id||sub.original_customer_id===m.user))
  assert(graph.items.includes(sub.store_subscription_identifier),'RC subscription item is outside the verified Stripe graph')
  assert(typeof sub.product_id==='string'&&/^[A-Za-z0-9_]+$/.test(sub.product_id))
  const product=await request('GET',`/projects/${rcProject}/products/${sub.product_id}`)
  assert.equal(product.status,200);assert.equal(product.body?.app_id,m.rcApp);assert(graph.prices.includes(product.body?.store_identifier))
 }
 return {exclusive:true,absent:false,subscriptions:subscriptions.length,aliases:aliases.length,purchases:0}
}
async function ownedEvents(stripe,m,objects){
 const known=new Set(objects),events=[]
 for await(const event of stripe.events.list({created:{gte:Math.floor(Date.parse(m.createdAt)/1000)-300},limit:100})){
  assert(event.livemode===false)
  const object=event.data.object
  if(typeof object.id!=='string'||!Number.isFinite(event.created))continue
  if(known.has(object.id)||id(object.customer)===m.customer||known.has(id(object.charge))||m.subscriptions.includes(id(object.subscription))){
   known.add(object.id);events.push({id:event.id,type:event.type,object:object.id,created:event.created})
   assert(events.length<=500,'Too many fixture events for one bounded cleanup')
  }
 }
 return {objects:[...known],events}
}
async function retireExactEvents(db,m,events,beforeMutate){
 assert(events.every(e=>/^evt_[A-Za-z0-9]+$/.test(e.id)&&/^[A-Za-z0-9._]+$/.test(e.type)&&/^[A-Za-z0-9_]+$/.test(e.object)&&Number.isFinite(e.created)))
 const values=events.map(e=>`('development','stripe',${q(e.id)},${q(e.type)},${q(e.object)},to_timestamp(${e.created}),'ignored','fixture_retired')`).join(',')
 if(values){await beforeMutate();const rows=await db.query(`insert into public.billing_inbox(environment,provider,event_id,event_type,object_id,occurred_at,status,reason) values ${values}
 on conflict(environment,provider,event_id) do update set status=case when billing_inbox.status='complete' then 'complete' else 'ignored' end,
 reason=case when billing_inbox.status='complete' then null else 'fixture_retired' end,lease=null,lease_until=null
 where billing_inbox.object_id is not distinct from excluded.object_id and billing_inbox.event_type=excluded.event_type returning event_id;`,false)
  assert.equal(rows.length,events.length,'Existing event identity mismatch; unknown object was not retired')}
 const rc=await db.query(`select event_id,object_id,reason from public.billing_inbox where environment='development' and provider='revenuecat' and user_id=${q(m.user)}`)
 assert(rc.length<=500&&rc.every(e=>e.object_id===null&&(e.reason===null||e.reason==='fixture_retired')),'Unknown RC event source must remain untouched')
 m.cleanup.rcEventIds=[...new Set([...(m.cleanup.rcEventIds??[]),...rc.map(e=>e.event_id)])]
 if(rc.length){await beforeMutate();await db.query(`update public.billing_inbox set user_id=null,status=case when status='complete' then 'complete' else 'ignored' end,
 reason=case when status='complete' then null else 'fixture_retired' end,lease=null,lease_until=null
 where environment='development' and provider='revenuecat' and user_id=${q(m.user)} and object_id is null
 and event_id=any(array[${rc.map(e=>q(e.event_id)).join(',')}]) and (reason is null or reason='fixture_retired');`,false)}
 return {stripe:events.length,revenuecat:rc.length}
}

/** Persist must save this exact metadata-only manifest before any external mutation. */
export async function cleanupD1ProviderFixture({db,stripe,manifest,persist,rcRequest=cleanupRevenueCatRequest}){
 const m=validateProviderCleanupManifest(manifest);assert.equal(typeof persist,'function')
 m.cleanup??={};const state=m.cleanup,report={ok:false,user:m.user,stages:[],errors:[],retainedRevenueCat:false,globalMutations:false}
 const save=()=>persist(m)
 const stage=async(name,work)=>{try{await work();report.stages.push({name,ok:true});await save();return true}catch(error){report.stages.push({name,ok:false});report.errors.push({stage:name,...finiteError(error)});await save();return false}}
 const keys=await db.request('/api-keys?reveal=true'),service=keys.find(x=>x.name==='service_role')?.api_key;assert(service);db.hide(service)
 const auth=async method=>{const response=await fetch(`${developmentUrl}/auth/v1/admin/users/${m.user}`,{method,headers:{apikey:service,authorization:`Bearer ${service}`},signal:AbortSignal.timeout(15000),redirect:'error'});return {status:response.status,body:response.status===200&&method==='GET'?await response.json():null}}
 if(!await stage('identity-and-environment',async()=>{
  const policy=(await db.query('select project_ref,environment from service_private.policy where id=1'))[0];assert.equal(policy?.project_ref,developmentRef);assert.equal(policy.environment,'development')
  assert.equal((await stripe.accounts.retrieve(account)).id,account)
  const identity=await auth('GET')
  if(identity.status===404)assert(state.identityVerified&&state.authDeleteStarted,'Missing identity requires its saved verified deletion intent')
  else{assert.equal(identity.status,200);assert.equal(identity.body.id,m.user);assert.equal(identity.body.email,m.email);state.identityVerified=true}
 }))return report
 const graph={customer:m.customer,items:[],prices:[],objects:[],events:[],schedules:[]}
 if(!await stage('exact-test-object-graph',async()=>{
  if(!m.customer){assert(!m.subscriptions.length&&!m.sessions.length&&!m.invoices.length);state.graph=graph;return}
  const customer=await stripe.customers.retrieve(m.customer)
  if(customer.deleted){assert(state.customerDeleteStarted&&state.graph?.customer===m.customer,'Deleted customer requires prior verified graph');Object.assign(graph,state.graph);return}
  assert(customer.livemode===false&&customer.metadata.app_user_id===m.user&&customer.metadata.environment==='development')
  const rows=await db.query(`select user_id from public.billing_customers where environment='development' and customer_id=${q(m.customer)}`);assert(rows.every(row=>row.user_id===m.user))
  graph.objects=[m.customer,...m.subscriptions,...m.sessions,...m.invoices]
  for(const subscription of m.subscriptions){const sub=await stripe.subscriptions.retrieve(subscription);assert(sub.livemode===false&&id(sub.customer)===m.customer&&sub.metadata.app_user_id===m.user&&sub.metadata.environment==='development');graph.items.push(...sub.items.data.map(x=>x.id));graph.prices.push(...sub.items.data.map(x=>id(x.price)));if(sub.schedule)graph.schedules.push(id(sub.schedule))}
  for(const session of m.sessions){const value=await stripe.checkout.sessions.retrieve(session);assert(value.livemode===false&&id(value.customer)===m.customer&&value.metadata.app_user_id===m.user&&value.metadata.environment==='development')}
  for(const invoice of m.invoices){const value=await stripe.invoices.retrieve(invoice);assert(value.livemode===false&&id(value.customer)===m.customer&&m.subscriptions.includes(id(value.parent?.subscription_details?.subscription)))}
  const all=await stripe.subscriptions.list({customer:m.customer,status:'all',limit:100});assert(!all.has_more&&all.data.every(sub=>m.subscriptions.includes(sub.id)),'Unrecorded subscription must not be canceled')
  const sessions=await stripe.checkout.sessions.list({customer:m.customer,limit:100});assert(!sessions.has_more&&sessions.data.every(session=>m.sessions.includes(session.id)),'Unrecorded Checkout must remain untouched')
  const invoices=await stripe.invoices.list({customer:m.customer,limit:100});assert(!invoices.has_more&&invoices.data.every(invoice=>m.invoices.includes(invoice.id)),'Unrecorded invoice is outside the manifest')
  for(const scheduleId of graph.schedules){const schedule=await stripe.subscriptionSchedules.retrieve(scheduleId);assert(schedule.livemode===false&&id(schedule.customer)===m.customer&&m.subscriptions.includes(id(schedule.subscription)))}
  const seed=await fixtureManifest(stripe,{account:m.user,customer:m.customer,subscription:m.subscriptions[0],invoice:m.invoices[0],checkout:m.sessions[0],trialEndsAt:m.trialEndsAt??new Date(Date.parse(m.createdAt)+192*3600000).toISOString()})
  graph.objects=[...new Set([...graph.objects,...seed.objects])];graph.events=seed.events;state.graph=graph
 }))return report
 // Inspect before deleting Stripe objects; only this exact UUID's known Stripe sandbox data may be erased.
 let rcProof
 await stage('revenuecat-exclusive-sandbox-proof',async()=>{rcProof=await inspectRevenueCat(m,graph,rcRequest);state.rcProof=rcProof})
 let stripeSafe=true
 for(const schedule of graph.schedules)if(!await stage('release-exact-schedule',async()=>{const value=await stripe.subscriptionSchedules.retrieve(schedule);if(['active','not_started'].includes(value.status)){state.scheduleReleaseStarted=schedule;await save();await stripe.subscriptionSchedules.release(schedule,{}, {idempotencyKey:`goalloom-d1-cleanup-${m.user}-${schedule}`})}}))stripeSafe=false
 for(const subscription of m.subscriptions)if(!await stage('cancel-exact-subscription',async()=>{const value=await stripe.subscriptions.retrieve(subscription);assert(id(value.customer)===m.customer&&value.livemode===false);if(!['canceled','incomplete_expired'].includes(value.status)){state.subscriptionCancelStarted=subscription;await save();await stripe.subscriptions.cancel(subscription,{invoice_now:false,prorate:false})}assert(['canceled','incomplete_expired'].includes((await stripe.subscriptions.retrieve(subscription)).status))}))stripeSafe=false
 for(const session of m.sessions)if(!await stage('expire-exact-checkout',async()=>{const value=await stripe.checkout.sessions.retrieve(session);assert(id(value.customer)===m.customer&&value.livemode===false);if(value.status==='open'){state.sessionExpireStarted=session;await save();await stripe.checkout.sessions.expire(session)}}))stripeSafe=false
 if(m.customer)await stage('retire-owned-pre-delete-events',async()=>{const found=await ownedEvents(stripe,m,graph.objects);graph.objects=found.objects;graph.events=found.events;state.graph=graph;await save();state.retirement=await retireExactEvents(db,m,found.events,save)})
 if(stripeSafe&&m.customer)stripeSafe=await stage('delete-exact-test-customer',async()=>{state.customerDeleteStarted=true;await save();const value=await stripe.customers.retrieve(m.customer);if(!value.deleted)await stripe.customers.del(m.customer);assert((await stripe.customers.retrieve(m.customer)).deleted===true);state.customerDeleted=true})
 if(m.customer)await stage('retire-owned-post-delete-events',async()=>{const found=await ownedEvents(stripe,m,graph.objects);state.graph={...graph,objects:found.objects,events:found.events};await save();state.retirement=await retireExactEvents(db,m,found.events,save)})
 if(rcProof?.exclusive)await stage('revenuecat-delete-and-verify',async()=>{
  const path=`/projects/${rcProject}/customers/${encodeURIComponent(m.user)}`
  if(!rcProof.absent&&!state.rcDeleteAccepted){state.rcDeleteStarted=true;await save();const deleted=await rcRequest('DELETE',path);assert([200,202,204,404].includes(deleted.status),'RC deletion permission unavailable');state.rcDeleteAccepted=true;await save()}
  const final=await rcRequest('GET',path);state.rcAbsent=final.status===404;report.retainedRevenueCat=!state.rcAbsent;assert(state.rcAbsent,'RC deletion is asynchronous or record retained; cleanup is incomplete')
 });else report.retainedRevenueCat=true
 if(!state.rcAbsent)report.retainedRevenueCat=true
 if(stripeSafe)await stage('exact-database-and-auth-cleanup',async()=>{
  // Do not allow a broad inbox delete to hide an unverified object/source.
  const unknown=await db.query(`select count(*) as n from public.billing_inbox where environment='development' and user_id=${q(m.user)} and
   (provider<>'revenuecat' or object_id is not null or reason is not null and reason<>'fixture_retired')`);assert.equal(Number(unknown[0].n),0,'Unverified inbox row must remain untouched')
  state.authDeleteStarted=true;await save();const result=await cleanupExactFixtures(db,[m.user]);assert(result.ok)
  assert.equal((await auth('GET')).status,404)
  const remaining=(await db.query(`select (select count(*) from public.billing_accounts where user_id=${q(m.user)})+(select count(*) from public.billing_operations where user_id=${q(m.user)})+(select count(*) from service_private.operation_aliases where user_id=${q(m.user)})+(select count(*) from service_private.continuations where user_id=${q(m.user)})+(select count(*) from public.workspaces where user_id=${q(m.user)})+(select count(*) from public.devices where user_id=${q(m.user)}) as n`))[0].n
  assert.equal(Number(remaining),0);state.authAbsent=true;state.databaseAbsent=true
 })
 const ids=state.graph?.events?.map(e=>q(e.id))??[]
 const pending=(await db.query(`select count(*) as n from public.billing_inbox where environment='development' and status in ('pending','processing') and (user_id=${q(m.user)}${ids.length?` or provider='stripe' and event_id=any(array[${ids.join(',')}])`:''})`))[0].n
 report.pendingFixtureEvents=Number(pending);report.ok=report.errors.length===0&&stripeSafe&&state.authAbsent===true&&state.rcAbsent===true&&Number(pending)===0
 state.lastResult=report;await save();return report
}

/** Verify postconditions only. The caller appends this result without rewriting the original failed stage. */
export async function verifyD1ProviderCleanup({db,stripe,manifest,rcRequest=cleanupRevenueCatRequest}){
 const result={ok:false,scope:'Exact original manifest; database/Auth/Stripe/RC read-only postcondition verification',remoteMutations:0,originalFailurePreserved:true}
 try{
  const m=validateProviderCleanupManifest(manifest),state=m.cleanup,graph=state?.graph
  assert(state?.identityVerified&&state.authDeleteStarted&&state.customerDeleteStarted&&graph?.customer===m.customer,'Original saved identity/deletion/graph proof required')
  assert(list(graph.objects,/^[A-Za-z0-9_]+$/)&&[m.customer,...m.subscriptions,...m.sessions,...m.invoices].every(value=>graph.objects.includes(value)))
  assert(list(graph.items,/^si_[A-Za-z0-9]+$/)&&list(graph.prices,/^price_[A-Za-z0-9]+$/))
  assert(Array.isArray(graph.events)&&graph.events.length<=500&&graph.events.every(event=>/^evt_[A-Za-z0-9]+$/.test(event.id)))
  const rcIds=state.rcEventIds??[];assert(Array.isArray(rcIds)&&rcIds.length<=500&&rcIds.every(value=>typeof value==='string'&&value.length>0&&value.length<=200))
  const keys=await db.request('/api-keys?reveal=true'),service=keys.find(key=>key.name==='service_role')?.api_key;assert(service);db.hide(service)
  const response=await fetch(`${developmentUrl}/auth/v1/admin/users/${m.user}`,{headers:{apikey:service,authorization:`Bearer ${service}`},signal:AbortSignal.timeout(15000),redirect:'error'})
  result.authHttp=response.status;await response.body?.cancel();assert.equal(response.status,404)
  const tables=['public.billing_accounts','public.billing_customers','public.billing_subscriptions','public.billing_transactions','public.billing_grace','public.billing_compensations','public.billing_operations','public.billing_inbox','service_private.operation_aliases','service_private.continuations','public.workspaces','public.devices','auth.sessions']
  const known=[...graph.events.map(event=>`(provider='stripe' and event_id=${q(event.id)})`),...rcIds.map(event=>`(provider='revenuecat' and event_id=${q(event)})`)]
  const counts=await db.query(`begin read only;set local statement_timeout='3s';set local lock_timeout='150ms';
   select jsonb_build_object(${tables.map(table=>`${q(table)},(select count(*) from ${table} where user_id=${q(m.user)})`).join(',')}) as rows,
    (select count(*) from public.billing_inbox where environment='development' and status in ('pending','processing') and (user_id=${q(m.user)}${known.length?` or ${known.join(' or ')}`:''})) as pending_known_events,
    exists(select 1 from service_private.policy where id=1 and project_ref=${q(developmentRef)} and environment='development') as expected_project;
   rollback;`)
  result.rows=counts[0].rows;result.pendingKnownEvents=Number(counts[0].pending_known_events)
  assert(counts[0].expected_project&&Object.values(result.rows).every(value=>Number(value)===0)&&result.pendingKnownEvents===0)
  assert.equal((await stripe.accounts.retrieve(account)).id,account)
  assert.equal((await stripe.customers.retrieve(m.customer)).deleted,true);result.stripeCustomerDeleted=true
  for(const subscription of m.subscriptions){const sub=await stripe.subscriptions.retrieve(subscription)
   assert(sub.livemode===false&&id(sub.customer)===m.customer&&sub.metadata.app_user_id===m.user&&sub.metadata.environment==='development'&&['canceled','incomplete_expired'].includes(sub.status))
   assert(!sub.items.has_more&&sub.items.data.every(item=>graph.items.includes(item.id)&&graph.prices.includes(id(item.price))))}
  for(const session of m.sessions){const value=await stripe.checkout.sessions.retrieve(session)
   assert(value.livemode===false&&id(value.customer)===m.customer&&value.metadata.app_user_id===m.user&&value.metadata.environment==='development'&&['complete','expired'].includes(value.status))}
  for(const invoice of m.invoices){const value=await stripe.invoices.retrieve(invoice);assert(value.livemode===false&&id(value.customer)===m.customer&&m.subscriptions.includes(id(value.parent?.subscription_details?.subscription)))}
  result.stripeListedObjectsTerminal=true
  const rc=await rcRequest('GET',`/projects/${rcProject}/customers/${encodeURIComponent(m.user)}`);result.revenueCatHttp=rc.status;assert.equal(rc.status,404)
  result.controlScope='Per-user private control/session rows checked. Provider-only journey has no recorded sync device/workspace IDs; no global orphan-control claim.'
  result.ok=true
 }catch(error){result.error=finiteError(error)}
 return result
}

/** Resume only RC cleanup from the original saved browser journey; no Stripe/DB/Auth mutation. */
export async function cleanupD1RetiredRevenueCatFixture({db,stripe,report,persist,rcRequest=cleanupRevenueCatRequest}){
 assert.equal(typeof persist,'function')
 const m=validateProviderCleanupManifest({version:1,environment:'development',project:developmentRef,account,
  user:report.account,email:report.email,appUserId:report.account,createdAt:report.createdAt,trialEndsAt:report.trialEndsAt,
  rcProject,rcApp,customer:report.customer,subscriptions:[report.subscription],sessions:[report.checkout],invoices:[report.invoice]})
 assert(report.stage==='cleanup'&&report.cleanup?.stripe===true&&report.cleanup?.backendAndAuth===true,'Original retired journey proof required')
 assert(Array.isArray(report.checks)&&report.checks.includes('Actual password Auth reaches explicit Plus choice without trial, sync or calendar writes')&&
  report.checks.includes('Actual Stripe Test browser payment returns through canonical local export and real loopback; exact receipt and RevenueCat-verified invoice resolve native paid status'),'Original Auth and paid journey evidence required')
 const saved=report.fixtureManifest
 assert(saved?.customer===m.customer&&list(saved.objects,/^[A-Za-z0-9_]+$/)&&[m.customer,...m.subscriptions,...m.sessions,...m.invoices].every(x=>saved.objects.includes(x)))
 assert(Array.isArray(saved.events)&&saved.events.length>0&&saved.events.length<=500&&saved.events.every(e=>/^evt_[A-Za-z0-9]+$/.test(e.id)&&/^[A-Za-z0-9._]+$/.test(e.type)&&saved.objects.includes(e.object)&&Number.isFinite(e.created)))
 assert(Array.isArray(report.retiredEvents)&&report.retiredEvents.length<=500&&report.retiredEvents.every(e=>
  ['stripe','revenuecat'].includes(e.provider)&&typeof e.event_id==='string'&&e.event_id.length<=200&&
  (e.status==='complete'||e.status==='ignored'&&e.reason==='fixture_retired')))
 assert(saved.events.every(e=>report.retiredEvents.some(r=>r.provider==='stripe'&&r.event_id===e.id)),'Saved event retirement proof is incomplete')
 const result={ok:false,user:m.user,stages:[],errors:[],retainedRevenueCat:true,globalMutations:false,scope:'RevenueCat-only resume; Stripe/PostgreSQL/Auth read-only'}
 const state=report.cleanup.rcResume??={}
 const save=async()=>{state.lastResult=result;await persist(report)}
 const stage=async(name,work)=>{try{await work();result.stages.push({name,ok:true});await save();return true}catch(error){result.stages.push({name,ok:false});result.errors.push({stage:name,...finiteError(error)});await save();return false}}
 await save()
 const graph={items:[],prices:[]}
 if(!await stage('verify-retired-journey-identity-and-graph',async()=>{
  const policy=(await db.query('select project_ref,environment from service_private.policy where id=1'))[0]
  assert(policy?.project_ref===developmentRef&&policy.environment==='development')
  assert.equal((await stripe.accounts.retrieve(account)).id,account)
  const keys=await db.request('/api-keys?reveal=true'),service=keys.find(x=>x.name==='service_role')?.api_key;assert(service);db.hide(service)
  const auth=await fetch(`${developmentUrl}/auth/v1/admin/users/${m.user}`,{headers:{apikey:service,authorization:`Bearer ${service}`},signal:AbortSignal.timeout(15000),redirect:'error'})
  assert.equal(auth.status,404,'Retired fixture Auth must still be absent');await auth.body?.cancel()
  assert.equal((await stripe.customers.retrieve(m.customer)).deleted,true)
  const sub=await stripe.subscriptions.retrieve(m.subscriptions[0])
  assert(sub.id===m.subscriptions[0]&&sub.livemode===false&&id(sub.customer)===m.customer&&sub.metadata.app_user_id===m.user&&sub.metadata.environment==='development'&&['canceled','incomplete_expired'].includes(sub.status))
  assert(sub.items?.data?.length>0&&!sub.items.has_more)
  graph.items=sub.items.data.map(x=>x.id);graph.prices=sub.items.data.map(x=>id(x.price))
  assert(list(graph.items,/^si_[A-Za-z0-9]+$/)&&list(graph.prices,/^price_[A-Za-z0-9]+$/))
  const session=await stripe.checkout.sessions.retrieve(m.sessions[0])
  assert(session.id===m.sessions[0]&&session.livemode===false&&id(session.customer)===m.customer&&session.metadata.app_user_id===m.user&&session.metadata.environment==='development'&&session.client_reference_id===m.user)
  assert(session.status==='complete'&&session.payment_status==='paid'&&id(session.subscription)===sub.id&&id(session.invoice)===m.invoices[0])
  const invoice=await stripe.invoices.retrieve(m.invoices[0])
  assert(invoice.id===m.invoices[0]&&invoice.livemode===false&&id(invoice.customer)===m.customer&&id(invoice.parent?.subscription_details?.subscription)===sub.id&&invoice.status==='paid'&&invoice.amount_paid>0)
  const remaining=(await db.query(`select (select count(*) from public.billing_accounts where user_id=${q(m.user)})+(select count(*) from public.billing_operations where user_id=${q(m.user)})+(select count(*) from service_private.operation_aliases where user_id=${q(m.user)})+(select count(*) from service_private.continuations where user_id=${q(m.user)})+(select count(*) from public.workspaces where user_id=${q(m.user)})+(select count(*) from public.devices where user_id=${q(m.user)}) as n`))[0].n
  assert.equal(Number(remaining),0,'Retired fixture database rows must remain absent')
  const pending=(await db.query(`select count(*) as n from public.billing_inbox where environment='development' and status in ('pending','processing') and (user_id=${q(m.user)} or (provider,event_id) in (${report.retiredEvents.map(e=>`(${q(e.provider)},${q(e.event_id)})`).join(',')}))`))[0].n
  assert.equal(Number(pending),0,'Pending retired fixture events require separate reviewed cleanup')
 }))return result
 let proof
 if(!await stage('revenuecat-exclusive-sandbox-proof',async()=>{proof=await inspectRevenueCat(m,graph,rcRequest);state.proof=proof}))return result
 await stage('revenuecat-delete-and-verify',async()=>{
  const path=`/projects/${rcProject}/customers/${encodeURIComponent(m.user)}`
  if(!proof.absent&&!state.deleteAccepted){state.deleteStarted=true;await save();const deleted=await rcRequest('DELETE',path);assert([200,202,204,404].includes(deleted.status),'RC deletion permission unavailable');state.deleteAccepted=true;await save()}
  const response=await rcRequest('GET',path);assert.equal(response.status,404,'RC deletion is asynchronous or record retained; cleanup is incomplete')
  state.absent=true;result.retainedRevenueCat=false
  report.cleanup.revenueCat='absent';report.cleanup.errors=report.cleanup.errors.filter(error=>error!=='revenuecat_fixture_cleanup_pending')
  report.cleanup.ok=report.cleanup.errors.length===0
 })
 result.ok=result.errors.length===0&&!result.retainedRevenueCat;await save();return result
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const [mode,path]=process.argv.slice(2);assert(['--plan','--apply'].includes(mode)&&path,'Use --plan|--apply <exact-manifest.json>')
  const manifest=validateProviderCleanupManifest(JSON.parse(await readFile(path,'utf8')))
  if(mode==='--plan')console.log(JSON.stringify({ready:true,environment:'development',user:manifest.user,providerObjects:{customer:!!manifest.customer,subscriptions:manifest.subscriptions.length,sessions:manifest.sessions.length,invoices:manifest.invoices.length},revenuecat:'Existing OAuth CLI; delete only after exclusive known Stripe sandbox inspection; async absence must be observed',globalMutations:false}))
  else{const db=await client(),{stripe}=await testStripe();const result=await cleanupD1ProviderFixture({db,stripe,manifest,persist:value=>writeFile(path,JSON.stringify(value,null,2)+'\n')});console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1}
 }catch(error){console.error(JSON.stringify({ok:false,error:finiteError(error)}));process.exitCode=1}
}
