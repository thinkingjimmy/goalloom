/**
 * [INPUT]: Current billing source, real development Auth/PostgreSQL and controlled payment adapters.
 * [OUTPUT]: Loopback alias/closed-intent/lost-response evidence with scoped synthetic cleanup.
 * [POS]: Backend HTTP-to-SQL integration; no real Stripe/RevenueCat connectivity, model or browser claim.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {randomUUID,createHash} from 'node:crypto'
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {client,developmentRef,developmentUrl} from '../hosted-ai/client.mjs'
import {privateConfig} from './private-config.mjs'
import {cleanupExactFixtures} from './cleanup-fixtures.mjs'
import {billingFixture} from './d1-http-fixtures.mjs'
import {bundle} from './build.mjs'

const directory='output/tests/billing/desktop/d1-backend',reportFile=`${directory}/alias-http-acceptance.json`,manifestFile=`${directory}/alias-http-manifest.json`
assert(process.argv.length===2||process.argv.length===3&&process.argv[2]==='--receipt-only','Use no selector or --receipt-only')
const receiptOnly=process.argv[2]==='--receipt-only',selection=receiptOnly?'receipt-only':'full'
const q=value=>`'${String(value).replaceAll("'","''")}'`
const user=randomUUID(),email=`billing-${user}@goalloom.test`,password=`${randomUUID()}aA!`
const requests=Object.fromEntries(['A','B','C','D','B2','E','blockedAnnual','blockedPortal','blockedCancel'].map(name=>[name,randomUUID()]))
const report={ok:false,selection,project:developmentRef,fixture:user,checks:[],rpcTrace:[],stage:'planned',realProviderCalls:0,realModelCalls:0,
 scope:'Real Auth sessions and installed development PostgreSQL behind the bundled billing HTTP handler on loopback. Stripe/RevenueCat adapters are controlled; no real provider purchase or browser/desktop acceptance.',platform:{node:process.version,os:process.platform,arch:process.arch}}
const manifest={project:developmentRef,user,requests,authCreated:false,cleaned:false}
await mkdir(directory,{recursive:true})
if(receiptOnly)try{
 const previous=JSON.parse(await readFile(reportFile,'utf8'))
 if(!previous.ok&&(!previous.selection||previous.selection==='full')){
  const archive=`${directory}/alias-http-full-failed-${new Date().toISOString().replaceAll(':','-')}.json`
  await copyFile(reportFile,archive);report.priorFullFailureEvidence=archive
 }
}catch(error){if(error.code!=='ENOENT')throw error}
// A crash at any subsequent external write has a fixed cleanup identity and request manifest.
await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n')
const save=()=>writeFile(reportFile,JSON.stringify(report,null,2)+'\n')
const saveManifest=()=>writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n')
await save()
const db=await client(),keys=await db.request('/api-keys?reveal=true'),serviceKey=keys.find(x=>x.name==='service_role')?.api_key,anon=keys.find(x=>x.name==='anon')?.api_key
assert(serviceKey&&anon,'Development Auth keys unavailable');db.hide(serviceKey);db.hide(anon)
const secret=await privateConfig(),cfg={...JSON.parse(secret.BILLING_CONFIG??'{}'),url:developmentUrl,serviceKey,
 stripeKey:secret.BILLING_STRIPE_KEY,stripeWebhookSecret:secret.BILLING_STRIPE_WEBHOOK_SECRET,rcPublicKey:secret.BILLING_RC_PUBLIC_KEY,
 rcSecretKey:secret.BILLING_RC_SECRET_KEY,rcWebhookSecret:secret.BILLING_RC_WEBHOOK_SECRET,workerSecret:secret.BILLING_WORKER_SECRET}
assert.equal(cfg.environment,'development');assert.equal(cfg.account,'acct_1QvwdlITpGuR8ZMB')
const api=async(path,{method='GET',body,token=serviceKey}={})=>{
 const response=await fetch(`${developmentUrl}${path}`,{method,headers:{authorization:`Bearer ${token}`,apikey:token===serviceKey?serviceKey:anon,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'})
 const raw=await response.text();assert(raw.length<1024*1024,'Auth/RPC response exceeded bound');return {status:response.status,body:raw.trim()?JSON.parse(raw):null}
}
const expectSuccess=(response,label)=>{assert(response.status>=200&&response.status<300,label);return response.body}
const policyState=async()=>{
 const rows=await db.query(`select jsonb_build_object('billingPolicy',(select jsonb_agg(to_jsonb(p) order by environment) from public.billing_policy p),
 'billingSources',(select jsonb_agg(to_jsonb(s) order by environment,source) from public.billing_sources s),
 'aiBudget',(select jsonb_agg(to_jsonb(b) order by id) from public.ai_budget b),
 'cron',(select jsonb_agg(jsonb_build_object('id',jobid,'active',active,'schedule',schedule) order by jobid) from cron.job where jobname='goalloom-billing-worker-development')) as state;`)
 return createHash('sha256').update(JSON.stringify(rows[0].state)).digest('hex')
}
let server,beforePolicy
try{
 report.stage='source-and-schema'
 assert((await db.query("select to_regprocedure('public.service_operation_alias(text,uuid,uuid,uuid,text,text,jsonb,uuid)') is not null as installed"))[0].installed,'Install reviewed R12 migration first')
 assert((await db.query("select to_regprocedure('public.service_reject_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid,uuid)') is not null as installed"))[0].installed,'Install reviewed R13 migration first')
 beforePolicy=await policyState();report.policyBeforeFingerprint=beforePolicy
 const load=async(name,entry)=>{const file=`${process.cwd()}/${directory}/alias-${name}-runtime.mjs`;await writeFile(file,await bundle(entry));return import(pathToFileURL(file).href)}
 const {createBillingHandler}=await load('billing','supabase/functions/billing/handler.ts')
 const {BillingProviders}=await load('providers','supabase/functions/billing/providers.ts')
 report.stage='real-auth-create';await save()
 const made=expectSuccess(await api('/auth/v1/admin/users',{method:'POST',body:{id:user,email,password,email_confirm:true}}),'Synthetic Auth creation failed');assert.equal(made.id,user)
 manifest.authCreated=true;await saveManifest()
 const tokens=[]
 for(let i=0;i<2;i++){
  const session=expectSuccess(await api('/auth/v1/token?grant_type=password',{method:'POST',token:anon,body:{email,password}}),'Real sign-in failed')
  assert.equal(session.user.id,user);db.hide(session.access_token);tokens.push(session.access_token)
 }
 const sessionIds=tokens.map(token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8')).session_id)
 assert.notEqual(sessionIds[0],sessionIds[1]);assert(sessionIds.every(id=>/^[0-9a-f-]{36}$/.test(id)))
 report.stage='real-trial'
 await db.query(`insert into public.billing_accounts(environment,user_id,reconcile_at) values('development',${q(user)},clock_timestamp()+interval '1 day');`,false)
 const trial=expectSuccess(await api('/rest/v1/rpc/billing_claim_trial',{method:'POST',body:{p_environment:'development',p_user:user,p_request:randomUUID()}}),'Real trial RPC failed');assert.equal(trial.status,'trialing');assert.equal(Date.parse(trial.trialEndsAt)-Date.parse(trial.trialStartedAt),192*3600000)
 await db.query(`update public.billing_accounts set test_now=trial_ends_at where environment='development' and user_id=${q(user)};`,false)
 report.fixtureClock='injected exact original trial expiry, no permanent grant'
 const controlled=billingFixture(cfg,{user}),provider=controlled.provider
 // Provider IDs remain unique to this synthetic owner; the actual provider APIs are never used.
 const createCustomer=provider.stripe.customers.create
 provider.stripe.customers.create=async(...args)=>{const result=await createCustomer(...args);result.id=`cus_D1Alias${user.replaceAll('-','')}`;return result}
 const external={auth:0,rpc:0}
 const trustedFetch=async(target,init)=>{
  const url=new URL(target);assert.equal(url.origin,developmentUrl,'Unexpected network destination')
  if(url.pathname==='/auth/v1/user')external.auth++
  else if(url.pathname.startsWith('/rest/v1/rpc/'))external.rpc++
  else throw Error('unexpected_external_request')
  const rpcName=url.pathname.startsWith('/rest/v1/rpc/')?url.pathname.split('/').at(-1):null
  const started=performance.now();let status=null,failed=false,networkCode=null
  try{const response=await fetch(target,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000),redirect:'error'});status=response.status;return response}
  catch(error){failed=true;const code=error.cause?.code??error.code;networkCode=typeof code==='string'&&/^[A-Z0-9_]{1,60}$/.test(code)?code:null;throw error}
  finally{
   const trace=rpcName?report.rpcTrace:(report.authTrace??=[])
   if(trace.length<512)trace.push({name:rpcName??'auth_user',status,elapsedMs:Math.round(performance.now()-started),stage:report.stage,...(failed?{error:'network_error',networkErrorCode:networkCode}:{})})
   else report.rpcTraceDropped=(report.rpcTraceDropped??0)+1
  }
 }
 const handler=createBillingHandler(cfg,{providers:new BillingProviders(cfg,provider.rcFetch,provider.stripe),fetch:trustedFetch})
 server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req){chunks.push(chunk);if(chunks.reduce((n,x)=>n+x.length,0)>8192)throw Error('request_bound')}const body=Buffer.concat(chunks)
  const response=await handler(new Request(`http://127.0.0.1${req.url}`,{method:req.method,headers:req.headers,...(body.length?{body}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
 }catch{res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"controlled_transport_failed"}')}})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port,base=`http://127.0.0.1:${port}`
 const continuation=()=>({version:1,id:randomUUID(),locale:'en',transport:'loopback',port})
 const inputs=Object.fromEntries(Object.entries(requests).map(([name,requestId])=>[name,{action:'checkout',requestId,cycle:'monthly',continuation:continuation()}]))
 const call=async(input,session=0,{discard=false}={})=>{
  const response=await fetch(`${base}/billing`,{method:input?'POST':'GET',headers:{authorization:`Bearer ${tokens[session]}`,'content-type':'application/json'},body:input?JSON.stringify(input):undefined,signal:AbortSignal.timeout(30000),redirect:'error'})
  report.lastHttpStatus=response.status
  if(response.status===202){
   const lease=(await db.query(`select jsonb_build_object('present',lease is not null,'active',coalesce(lease_until>clock_timestamp(),false),
    'remainingSeconds',greatest(0,extract(epoch from lease_until-clock_timestamp()))::integer) as lease from public.billing_accounts where environment='development' and user_id=${q(user)};`))[0]?.lease??null
   report.pendingLeaseSamples??=[];report.pendingLeaseSamples.push({stage:report.stage,lease});await save()
  }
  if(discard){assert.equal(response.status,200,'First simulated-lost response must have committed successfully');await response.arrayBuffer();report.lastFiniteError=null;return {discarded:true}}
  const body=await response.json();report.lastFiniteError=typeof body.error==='string'&&/^[a-z_]{1,60}$/.test(body.error)?body.error:null
  return {status:response.status,body}
 }
 const operation=async id=>(await db.query(`select request_id,status,result,provider_id from public.billing_operations where environment='development' and user_id=${q(user)} and request_id=${q(id)};`))[0]
 const alias=async id=>(await db.query(`select canonical_request_id from service_private.operation_aliases where environment='development' and user_id=${q(user)} and request_id=${q(id)};`))[0]
 const intentCounts=async()=>({database:(await db.query(`select jsonb_build_object('operations',(select count(*) from public.billing_operations where user_id=${q(user)}),
  'aliases',(select count(*) from service_private.operation_aliases where user_id=${q(user)}),'continuations',(select count(*) from service_private.continuations where user_id=${q(user)}),
  'customers',(select count(*) from public.billing_customers where user_id=${q(user)}),'sessions',(select count(*) from auth.sessions where user_id=${q(user)})) as counts`))[0].counts,
  providerCreates:provider.state.createCalls,providerSessions:provider.state.sessions.length})
 const close=(result,id,requested=id)=>{assert.equal(result.status,409);assert.equal(result.body.environment,'development');assert.equal(result.body.error,'checkout_expired');assert.deepEqual(result.body.operation,{requestId:id,...(requested!==id?{requestedId:requested}:{}),action:'checkout',cycle:'monthly',status:'closed',reason:'checkout_expired'})}
 const ownConflict=(result,input)=>{assert.equal(result.status,409);assert.equal(result.body.environment,'development');assert.equal(result.body.error,'billing_request_conflict');assert.deepEqual(result.body.operation,{requestId:input.requestId,action:input.action,cycle:input.cycle??null,status:'closed',reason:'billing_request_conflict'})}
 const currentComplete=(result,id,requested=id)=>{assert.equal(result.status,200);assert.equal(result.body.environment,'development');assert.equal(result.body.version,1);assert.equal(result.body.eligible,false);assert(['expired','verification_pending'].includes(result.body.status));assert.equal(result.body.priceCatalog.monthly.amount,899);assert.deepEqual(result.body.operation,{requestId:id,...(requested!==id?{requestedId:requested}:{}),action:'checkout',cycle:'monthly',status:'complete'});assert(!result.body.url)}
 report.stage='receipt-only-unknown-intent'
 const missing={...inputs.A,requestId:randomUUID(),continuation:continuation()},initialCounts=await intentCounts()
 const missingProbe=await call({action:'reconcile',operation:missing});assert.equal(missingProbe.status,200);assert(!missingProbe.body.operation)
 assert.deepEqual(await intentCounts(),initialCounts);assert.equal(await operation(missing.requestId),undefined)
 report.unknownIntentNoCreates=true
 report.checks.push('receipt-only missing intent creates no operation, alias, continuation, customer, Auth session or provider session')
 report.stage='A-B-pending'
 const a=await call(inputs.A);assert.equal(a.status,200);assert.equal(a.body.requestId,requests.A);assert.equal(a.body.returnToThisDevice,true)
 const pendingCounts=await intentCounts(),pendingProbe=await call({action:'reconcile',operation:inputs.A});assert.equal(pendingProbe.status,200);assert(!pendingProbe.body.operation);assert.deepEqual(await intentCounts(),pendingCounts)
 assert((await call(inputs.B,1,{discard:true})).discarded);assert.equal(provider.state.sessions.length,1)
 report.lostFirstResponse={B:true,B2:false};report.clientCanonicalReference={B:null,B2:null}
 assert.equal((await alias(requests.B)).canonical_request_id,requests.A)
 report.checks.push('real independent Auth sessions bind B immutably to A; first B URL response discarded before parsing so peer has no canonical reference; one controlled session')
 const blockedInputs=[{...inputs.blockedAnnual,cycle:'annual'},
  {action:'portal',requestId:requests.blockedPortal,continuation:inputs.blockedPortal.continuation},
  {action:'cancel',requestId:requests.blockedCancel}]
 if(!receiptOnly){
  report.stage='fresh-blocked-requests-close-own-receipts'
  for(const input of blockedInputs){ownConflict(await call(input,1),input);const own=await operation(input.requestId);assert.equal(own.status,'closed');assert.deepEqual(own.result,{error:'billing_request_conflict'});assert.equal(await alias(input.requestId),undefined)}
  assert.equal(provider.state.sessions.length,1);assert.equal((await operation(requests.A)).status,'pending')
  report.checks.push('fresh annual/Portal/cancel blocked by monthly A persist only their own closed conflict receipts; A and provider session unchanged')
 }
 report.stage='B-resolves-closed-A'
 provider.state.sessions[0].status='expired';close(await call({action:'reconcile',operation:inputs.B},1),requests.A,requests.B);assert.equal((await operation(requests.A)).status,'closed')
 const c=await call(inputs.C);assert.equal(c.status,200);assert.equal(c.body.requestId,requests.C);assert.equal(provider.state.sessions.length,2)
 close(await call(receiptOnly?{action:'reconcile',operation:inputs.B}:inputs.B,1),requests.A,requests.B);assert.equal((await operation(requests.C)).status,'pending')
 const creates=provider.state.createCalls
 if(!receiptOnly){
  for(const input of blockedInputs){ownConflict(await call(input,1),input);assert.equal((await operation(requests.C)).status,'pending')}
  const changedBlocked=await call({...blockedInputs[0],continuation:continuation()},1);assert.equal(changedBlocked.status,409);assert.equal(changedBlocked.body.error,'billing_request_conflict');assert(!changedBlocked.body.operation)
  for(const conflict of [{...inputs.B,continuation:continuation()},{...inputs.B,cycle:'annual'},{action:'portal',requestId:requests.B,continuation:inputs.B.continuation}]){
   const denied=await call(conflict,1);assert.equal(denied.status,409);assert.equal(denied.body.error,'billing_request_conflict');assert(!denied.body.operation)
  }
  report.checks.push('blocked own-request closure remains replayable after A closes/new C appears; changed blocked continuation conflicts without another closure')
  report.checks.push('closed canonical A survives newer pending C; changed B continuation/cycle/action conflicts without closure receipt or another create')
 }
 assert.equal(provider.state.createCalls,creates);assert.equal((await alias(requests.B)).canonical_request_id,requests.A);assert.equal((await operation(requests.C)).status,'pending')
 report.checks.push('closed alias receipt carries requestedId B and canonical A despite client never learning the first canonical response')
 report.stage='D-completion-through-handler'
 provider.state.sessions[1].status='expired'
 const bareClosed=await call({action:'reconcile'}),closedCurrent=await call()
 assert.equal(bareClosed.status,200);assert.equal(closedCurrent.status,200);assert.equal(bareClosed.body.status,closedCurrent.body.status);assert.equal(bareClosed.body.eligible,closedCurrent.body.eligible);assert(!bareClosed.body.operation)
 assert.equal((await operation(requests.C)).status,'closed');assert.equal(provider.state.createCalls,2)
 report.bareClosedStatusComparison={resolved:bareClosed.body.status,fresh:closedCurrent.body.status}
 close(await call(receiptOnly?{action:'reconcile',operation:inputs.C}:inputs.C),requests.C)
 report.checks.push('bare reconciliation closes unique expired C and returns authoritative post-transition status equal to GET without a new provider session')
 const d=await call(inputs.D);assert.equal(d.status,200);assert.equal(d.body.requestId,requests.D)
 assert((await call(inputs.B2,1,{discard:true})).discarded);report.lostFirstResponse.B2=true;assert.equal(provider.state.sessions.length,3)
 assert.equal((await alias(requests.B2)).canonical_request_id,requests.D)
 provider.state.sessions[2].status='complete';assert.equal(provider.state.subscriptions.length,0)
 const completed=await call(receiptOnly?{action:'reconcile',operation:inputs.B2}:inputs.B2,1);currentComplete(completed,requests.D,requests.B2)
 if(!receiptOnly)currentComplete(await call({action:'reconcile',operation:inputs.B2},1),requests.D,requests.B2)
 const durableD=await operation(requests.D);assert.equal(durableD.status,'complete')
 if(receiptOnly){assert.equal(durableD.result.version,1);const current=await call();assert.equal(completed.body.status,current.body.status);assert.equal(completed.body.eligible,current.body.eligible)}
 else assert.deepEqual(durableD.result,{status:'verification_pending'})
 report.firstCompletedAuthoritativeStatus=completed.body.status
 report.checks.push(receiptOnly?'lost-first-response B2 resolves via receipt-only reconciliation with canonical D/requested B2 and post-transition status equal to current GET':'lost-first-response B2 completes via handler with requestedId B2/canonical D; empty subscription snapshot and thin stored result cannot grant eligibility')
 report.stage='aged-complete-alias-with-new-E'
 await db.query(`with boundary as(select clock_timestamp()-interval '26 hours' as t), aged as(
 update public.billing_operations set created_at=boundary.t from boundary where environment='development' and user_id=${q(user)} and request_id=${q(requests.D)} returning request_id)
 update service_private.continuations set created_at=boundary.t,expires_at=boundary.t+interval '24 hours' from boundary where environment='development' and user_id=${q(user)} and request_id=${q(requests.D)};`,false)
 const e=await call(inputs.E);assert.equal(e.status,200);assert.equal(e.body.requestId,requests.E);assert.equal(provider.state.sessions.length,4)
 const beforeReplay=provider.state.createCalls
 if(!receiptOnly)for(const [input,session] of [[inputs.B2,1],[inputs.D,0]])currentComplete(await call(input,session),requests.D,input.requestId)
 const resolvedCounts=await intentCounts()
 for(const [input,session] of [[inputs.B2,1],[inputs.D,0]])currentComplete(await call({action:'reconcile',operation:input},session),requests.D,input.requestId)
 const unknownWithNewer=await call({action:'reconcile',operation:missing});assert.equal(unknownWithNewer.status,200);assert(!unknownWithNewer.body.operation)
 const resolutionConflicts=[{operation:{...inputs.B2,continuation:continuation()},status:409,error:'billing_request_conflict'}]
 if(receiptOnly)resolutionConflicts.push({operation:{...inputs.B2,cycle:'annual'},status:409,error:'billing_request_conflict'},
  {operation:{action:'portal',requestId:requests.B2,continuation:inputs.B2.continuation},status:400,error:'invalid_request'})
 for(const conflict of resolutionConflicts){const denied=await call({action:'reconcile',operation:conflict.operation},1);assert.equal(denied.status,conflict.status);assert.equal(denied.body.error,conflict.error);assert(!denied.body.operation)}
 assert.deepEqual(await intentCounts(),resolvedCounts)
 assert.equal(provider.state.createCalls,beforeReplay);assert.equal((await operation(requests.E)).status,'pending');assert.equal((await alias(requests.B2)).canonical_request_id,requests.D)
 assert.equal(Number((await db.query(`select count(*) as n from public.billing_transactions where environment='development' and user_id=${q(user)}`))[0].n),0)
 report.checks.push('canonical D is resolved before pending selection even beyond 24h with expired continuation; B2 and original D cannot rebase to E or create another provider session')
 report.checks.push('receipt-only reconciliation resolves closed/complete original aliases beyond 24h, keeps missing/pending intents unresolved and rejects changed intent without creating rows or sessions')
 report.stage='receipt-only-completion-returns-fresh-status'
 provider.state.sessions[3].status='complete'
 const bareCompleted=await call({action:'reconcile'}),bareCurrent=await call()
 assert.equal(bareCompleted.status,200);assert.equal(bareCurrent.status,200);assert.equal(bareCompleted.body.status,bareCurrent.body.status);assert.equal(bareCompleted.body.eligible,bareCurrent.body.eligible);assert(!bareCompleted.body.operation)
 report.bareCompletedStatusComparison={resolved:bareCompleted.body.status,fresh:bareCurrent.body.status}
 const completedE=await call({action:'reconcile',operation:inputs.E}),freshStatus=await call()
 currentComplete(completedE,requests.E);assert.equal(freshStatus.status,200)
 report.completedStatusComparison={resolved:completedE.body.status,fresh:freshStatus.body.status}
 assert.equal(completedE.body.status,freshStatus.body.status,'Completed receipt must include current status after pending operation transition')
 assert.equal(completedE.body.eligible,freshStatus.body.eligible);assert.equal(provider.state.createCalls,beforeReplay);assert.equal(provider.state.sessions.length,4)
 report.checks.push('existing E provider completion through bare reconcile and exact receipt recovery return fresh post-transition status equal to authenticated GET, with no additional provider create')
 report.controlledProviderCreates=provider.state.createCalls;report.controlledSessions=provider.state.sessions.length;report.realSupabaseRequests=external
 report.globalPoliciesUnchanged=await policyState()===beforePolicy;assert(report.globalPoliciesUnchanged)
 report.ok=true;report.stage='passed'
}catch(error){report.error={type:error.name,code:'alias_http_acceptance_incomplete',location:error.stack?.match(/d1-alias-http-acceptance\.mjs:\d+:\d+/)?.[0]??null};process.exitCode=1}
finally{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
 try{
  const cleanup=await cleanupExactFixtures(db,[user]);assert(cleanup.ok)
  const identity=await api(`/auth/v1/admin/users/${user}`);assert.equal(identity.status,404)
  const remaining=(await db.query(`select jsonb_build_object('aliases',(select count(*) from service_private.operation_aliases where user_id=${q(user)}),
   'continuations',(select count(*) from service_private.continuations where user_id=${q(user)}),'operations',(select count(*) from public.billing_operations where user_id=${q(user)}),
   'accounts',(select count(*) from public.billing_accounts where user_id=${q(user)}),'inbox',(select count(*) from public.billing_inbox where user_id=${q(user)} and status in ('pending','processing'))) as remaining;`))[0].remaining
  assert(Object.values(remaining).every(n=>Number(n)===0));report.cleanup={ok:true,authStatus:404,remaining};manifest.cleaned=true;await saveManifest()
  if(beforePolicy){report.globalPoliciesUnchanged=await policyState()===beforePolicy;assert(report.globalPoliciesUnchanged)}
 }catch{report.cleanup={ok:false,error:'scoped_cleanup_incomplete'};report.ok=false;process.exitCode=1}
 await save();console.log(JSON.stringify({ok:report.ok,selection,checks:report.checks,stage:report.stage,lastHttpStatus:report.lastHttpStatus,lastFiniteError:report.lastFiniteError,cleanup:report.cleanup,evidence:reportFile,error:report.error??null},null,2))
}
