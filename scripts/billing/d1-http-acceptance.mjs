/**
 * [INPUT]: Real bundled D1 billing/snapshot handlers and controlled Auth/RPC/provider/Storage transports.
 * [OUTPUT]: Repeatable loopback HTTP contract evidence, with no remote, PostgreSQL or model acceptance claim.
 * [POS]: D1 local integration feedback before the root-allocated development window.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {bundle} from './build.mjs'
import {identity,jwt,config,authFetch,billingFixture,snapshotFixture} from './d1-http-fixtures.mjs'
const directory='output/tests/billing/desktop/d1-backend';await mkdir(directory,{recursive:true})
const load=async(name,entry)=>{const file=`${process.cwd()}/${directory}/${name}-runtime.mjs`;await writeFile(file,await bundle(entry));return import(pathToFileURL(file).href)}
const {createBillingHandler}=await load('billing','supabase/functions/billing/handler.ts')
const {BillingProviders}=await load('providers','supabase/functions/billing/providers.ts')
const {createSnapshotHandler}=await load('snapshot','supabase/functions/snapshot-url/handler.ts')
const owner=identity(),peer={user:owner.user,session:randomUUID()},cfg=config(),billing=billingFixture(cfg,owner),snapshot=snapshotFixture(owner)
const handler=createBillingHandler(cfg,{rpc:billing.rpc,fetch:authFetch([owner,peer]),providers:new BillingProviders(cfg,billing.provider.rcFetch,billing.provider.stripe)})
const transfer=createSnapshotHandler({url:cfg.url,serviceKey:cfg.serviceKey,fetch:snapshot.http})
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const request=new Request(`http://127.0.0.1${req.url}`,{method:req.method,headers:req.headers,...(body.length?{body}:{})});const response=await(req.url.startsWith('/snapshot')?transfer:handler)(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch{res.writeHead(500);res.end('{}')}})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`
const checks=[],report={ok:false,scope:'Real loopback HTTP with bundled handlers; controlled Auth/RPC/Stripe/RC/Storage. Not real database, provider, browser, desktop or concurrency acceptance.',realExternalCalls:0,checks,runtime:{node:process.version,os:process.platform,arch:process.arch}}
const mark=name=>checks.push(name)
const call=async(body,who=owner)=>{const response=await fetch(base+'/billing',{method:body?'POST':'GET',headers:{authorization:`Bearer ${jwt(who)}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()}}
const continuation=()=>({version:1,id:randomUUID(),locale:'en',transport:'loopback',port:54321})
const snapshotCall=(method='GET',options={})=>fetch(`${base}/snapshot?${options.query??snapshot.query()}`,{method,headers:{authorization:`Bearer ${jwt(owner)}`,'x-goalloom-service-version':'1',...(method==='PUT'?{'content-type':'application/octet-stream'}:{}),...options.headers},...(options.body?{body:options.body}:{})})
try{
 let result=await call();assert.equal(result.status,200);assert.equal(result.body.environment,'development');assert.equal(result.body.priceCatalog.monthly.amount,899);assert.equal(result.body.priceCatalog.annual.amount,7900)
 billing.state.status.subscriptions=[{price:cfg.prices.monthly,nextPrice:cfg.prices.annual}];result=await call();assert.equal(result.body.subscriptions[0].cycle,'monthly');assert.equal(result.body.subscriptions[0].nextCycle,'annual')
 billing.state.status.subscriptions[0].nextPrice='price_Unknown';result=await call();assert.equal(result.status,409);assert.equal(result.body.error,'billing_review_required');billing.state.status.subscriptions=[]
 mark('Safe fixed minor-unit catalogue and exact price/cycle mapping; unknown non-null price cannot invent a plan')
 const unknownIntent={requestId:randomUUID(),action:'checkout',cycle:'monthly',continuation:continuation()}
 const unknownProbe=await call({action:'reconcile',operation:unknownIntent});assert.equal(unknownProbe.status,200);assert(!unknownProbe.body.operation);assert.equal(billing.state.operations.size,0);assert.equal(billing.provider.state.createCalls,0)
 const requestId=randomUUID(),original=continuation(),input={action:'checkout',requestId,cycle:'monthly',continuation:original}
 assert.equal((await call({...input,continuation:undefined})).status,400)
 for(const value of [{...original,transport:'app',port:undefined},{...original,port:80},{...original,url:'https://invalid.invalid'},{...original,locale:'xx'},{...original,version:2}])assert.equal((await call({...input,continuation:value})).status,400)
 assert.equal(billing.provider.state.createCalls,0)
 billing.provider.state.dropCheckout=true;assert.equal((await call(input)).status,503)
 result=await call(input);assert.equal(result.status,200);assert.equal(result.body.requestId,requestId);assert.equal(result.body.returnToThisDevice,true);assert(Date.parse(result.body.continuationExpiresAt)>Date.now())
 assert.equal(billing.provider.state.sessions.length,1)
 const beforeProbe=billing.provider.state.createCalls;result=await call({action:'reconcile',operation:input});assert.equal(result.status,200);assert(!result.body.operation);assert.equal(billing.provider.state.createCalls,beforeProbe)
 const written=billing.provider.state.writes.find(x=>x.mode==='subscription'),success=new URL(written.success_url),cancel=new URL(written.cancel_url)
 assert.equal(success.origin,'https://www.goalloom.com');assert.equal(success.pathname,'/billing/return/');assert.equal(cancel.pathname,'/billing/continue/')
 assert.deepEqual([...success.searchParams.keys()],['v','environment','continue','transport','port']);assert.equal(success.searchParams.get('continue'),original.id);assert.equal(success.searchParams.get('port'),String(original.port));assert(!success.href.includes(owner.user))
 const conflicting=await call({...input,continuation:continuation()});assert.equal(conflicting.status,409);assert.equal(conflicting.body.error,'billing_request_conflict');assert(!conflicting.body.operation);assert.equal(billing.state.operations.get(requestId).status,'pending')
 const peerIntent=continuation(),peerRequest=randomUUID();result=await call({...input,requestId:peerRequest,continuation:peerIntent},peer)
 assert.equal(result.status,200);assert.equal(result.body.requestId,requestId);assert.equal(result.body.returnToThisDevice,false);assert.equal(billing.provider.state.sessions.length,1);assert.deepEqual(billing.state.continuations.get(requestId).value,original)
 const blockedInputs=[{...input,requestId:randomUUID(),cycle:'annual',continuation:continuation()},
  {action:'portal',requestId:randomUUID(),continuation:continuation()},{action:'cancel',requestId:randomUUID()}]
 for(const blocked of blockedInputs){const denied=await call(blocked,peer);assert.equal(denied.status,409);assert.equal(denied.body.operation.requestId,blocked.requestId);assert.equal(denied.body.operation.status,'closed');assert.equal(denied.body.operation.reason,'billing_request_conflict')}
 mark('Finite immutable continuation before provider creation, original unknown-result recovery and cross-session canonical recovery without stealing callback intent')
 billing.provider.state.sessions[0].status='expired'
 result=await call(input);assert.equal(result.status,409);assert.equal(result.body.environment,'development');assert.deepEqual(result.body.operation,{requestId,action:'checkout',cycle:'monthly',status:'closed',reason:'checkout_expired'});assert.equal(billing.state.operations.get(requestId).status,'closed')
 result=await call(input);assert.equal(result.body.operation.requestId,requestId);assert.equal(result.body.operation.status,'closed')
 const altered=await call({...input,action:'portal',cycle:undefined});assert.equal(altered.status,409);assert(!altered.body.operation)
 const alteredContinuation=await call({...input,continuation:continuation()});assert.equal(alteredContinuation.status,409);assert(!alteredContinuation.body.operation)
 billing.state.continuations.get(requestId).expiresAt=new Date(Date.now()-1).toISOString();assert.equal((await call(input)).body.operation.status,'closed')
 const peerInput={...input,requestId:peerRequest,continuation:peerIntent}
 result=await call(peerInput,peer);assert.equal(result.status,409);assert.equal(result.body.operation.requestId,requestId);assert.equal(result.body.operation.requestedId,peerRequest);assert.equal(result.body.operation.status,'closed');assert.equal(billing.provider.state.sessions.length,1)
 result=await call({action:'reconcile',operation:peerInput},peer);assert.equal(result.body.operation.requestedId,peerRequest);assert.equal(result.body.operation.requestId,requestId);assert.equal(result.body.operation.status,'closed')
 assert.equal((await call({...peerInput,continuation:continuation()},peer)).body.error,'billing_request_conflict')
 assert.equal((await call({...peerInput,cycle:'annual'},peer)).body.error,'billing_request_conflict')
 const newId=randomUUID(),newIntent=continuation();result=await call({...input,requestId:newId,continuation:newIntent});assert.equal(result.status,200)
 for(const blocked of blockedInputs){const denied=await call(blocked,peer);assert.equal(denied.body.operation.requestId,blocked.requestId);assert.equal(denied.body.operation.status,'closed');assert.equal(billing.state.operations.get(newId).status,'pending')}
 const alteredBlocked=await call({...blockedInputs[0],continuation:continuation()},peer);assert.equal(alteredBlocked.body.error,'billing_request_conflict');assert(!alteredBlocked.body.operation)
 result=await call(peerInput,peer);assert.equal(result.body.operation.requestId,requestId);assert.equal(result.body.operation.status,'closed');assert.equal(billing.state.operations.get(newId).status,'pending');assert.equal(billing.provider.state.sessions.length,2)
 result=await call(input);assert.equal(result.body.operation.requestId,requestId);assert.equal(billing.state.operations.get(newId).status,'pending')
 billing.state.continuations.get(newId).expiresAt=new Date(Date.now()-1).toISOString();result=await call({...input,requestId:newId,continuation:newIntent});assert.equal(result.status,409);assert.equal(result.body.error,'continuation_expired');assert(!result.body.operation);assert.equal((await call({action:'reconcile'})).status,200)
 billing.provider.state.sessions[1].status='expired';billing.state.projectPendingCheckout=true
 result=await call({action:'reconcile'});assert.equal(result.status,200);assert.deepEqual(result.body,(await call()).body,'Bare reconcile must return status after closing the unique expired Checkout')
 billing.state.projectPendingCheckout=false
 result=await call({...input,requestId:newId,continuation:newIntent});assert.equal(result.body.operation.requestId,newId);assert.equal(result.body.operation.reason,'checkout_expired');assert.equal(billing.provider.state.sessions.length,2);assert.deepEqual(billing.state.continuations.get(newId).value,newIntent)
 mark('Only a durable matching closed operation emits a closure receipt; altered intents and unresolved continuation expiry cannot falsely close another pending journal')
 const completedId=randomUUID(),completedIntent=continuation(),completedInput={...input,requestId:completedId,continuation:completedIntent}
 result=await call(completedInput);assert.equal(result.status,200)
 const completedPeerId=randomUUID(),completedPeerIntent=continuation(),completedPeerInput={...input,requestId:completedPeerId,continuation:completedPeerIntent}
 assert.equal((await call(completedPeerInput,peer)).body.requestId,completedId)
 const completedOp=billing.state.operations.get(completedId);completedOp.status='complete';completedOp.result={status:'verification_pending'}
 billing.state.continuations.get(completedId).expiresAt=new Date(Date.now()-1).toISOString()
 const creates=billing.provider.state.createCalls
 for(const state of ['expired','revoked','verification_pending']){
  billing.state.status.status=state;billing.state.status.eligible=false
  result=await call(completedInput);assert.equal(result.status,200);assert.equal(result.body.version,1);assert.equal(result.body.environment,'development');assert.equal(result.body.status,state);assert.equal(result.body.priceCatalog.monthly.amount,899)
  assert.deepEqual(result.body.operation,{requestId:completedId,action:'checkout',cycle:'monthly',status:'complete'});assert(!result.body.url)
  const old=billing.state.operations.get(completedId);old.created_at=new Date(Date.now()-2*86400000).toISOString()
  const recovered=await call(completedPeerInput,peer);assert.equal(recovered.body.operation.requestId,completedId);assert.equal(recovered.body.operation.requestedId,completedPeerId);assert.equal(recovered.body.status,state);assert.equal(recovered.body.operation.status,'complete')
 }
 assert.equal((await call({...completedInput,continuation:continuation()})).status,409)
 const newerId=randomUUID();assert.equal((await call({...input,requestId:newerId,continuation:continuation()})).status,200)
 result=await call(completedPeerInput,peer);assert.equal(result.body.operation.requestId,completedId);assert.equal(result.body.operation.status,'complete');assert.equal(billing.state.operations.get(newerId).status,'pending')
 result=await call({action:'reconcile',operation:completedPeerInput},peer);assert.equal(result.body.operation.requestedId,completedPeerId);assert.equal(result.body.operation.requestId,completedId);assert.equal(result.body.operation.status,'complete');assert.equal(billing.state.operations.get(newerId).status,'pending')
 const unrelated=await call({action:'reconcile',operation:unknownIntent});assert.equal(unrelated.status,200);assert(!unrelated.body.operation);assert(!billing.state.operations.has(unknownIntent.requestId))
 const invalidProbe=await call({action:'reconcile',operation:{...completedPeerInput,continuation:continuation()}},peer);assert.equal(invalidProbe.body.error,'billing_request_conflict');assert(!invalidProbe.body.operation)
 const probeCounts={creates:billing.provider.state.createCalls,operations:billing.state.operations.size,continuations:billing.state.continuations.size}
 billing.state.status.status='active';billing.state.status.eligible=true
 for(const operation of [unknownIntent,{...input,requestId:newerId,continuation:billing.state.continuations.get(newerId).value}]){
  const probe=await call({action:'reconcile',operation});assert.equal(probe.body.status,'active');assert(!probe.body.operation)
 }
 for(const operation of [null,{...unknownIntent,url:'https://invalid.invalid'},{...unknownIntent,action:'portal'},{...unknownIntent,cycle:'weekly'}])assert.equal((await call({action:'reconcile',operation})).status,400)
 assert.deepEqual({creates:billing.provider.state.createCalls,operations:billing.state.operations.size,continuations:billing.state.continuations.size},probeCounts)
 billing.state.status.status='verification_pending';billing.state.status.eligible=false
 result=await call(completedInput);assert.equal(result.body.operation.requestId,completedId);assert.equal(result.body.operation.status,'complete');assert.equal(billing.state.operations.get(newerId).status,'pending')
 billing.state.continuations.delete(completedId);result=await call(completedInput);assert.equal(result.status,200);assert.equal(result.body.operation.status,'complete');assert(!billing.state.continuations.has(completedId));assert.equal(billing.provider.state.createCalls,creates+1)
 const managementId=randomUUID();billing.state.operations.set(managementId,{request_id:managementId,action:'cancel',cycle:null,status:'complete',result:{status:'active'},provider_id:'sub_Fixture',created_at:new Date().toISOString()})
 result=await call({action:'cancel',requestId:managementId});assert.equal(result.body.status,'verification_pending');assert.equal(result.body.operation.status,'complete');assert.equal(result.body.operation.requestId,managementId)
 for(const stored of [{status:'complete'},{version:1,status:'active',eligible:true}]){
  const historical=billing.state.operations.get(managementId);historical.created_at=new Date(Date.now()-2*86400000).toISOString();historical.result=stored
  result=await call({action:'cancel',requestId:managementId});assert.equal(result.body.status,'verification_pending');assert.equal(result.body.environment,'development');assert.equal(result.body.operation.requestId,managementId);assert.equal(result.body.operation.status,'complete')
 }
 billing.state.status.status='active';billing.state.status.eligible=true;billing.state.projectPendingCheckout=true
 billing.provider.state.sessions.at(-1).status='complete'
 const beforeBareComplete=billing.provider.state.createCalls
 result=await call({action:'reconcile'});assert.equal(result.status,200);assert.deepEqual(result.body,(await call()).body,'Bare reconcile must return status after completing the unique paid Checkout')
 assert.equal(billing.state.operations.get(newerId).status,'complete');assert.equal(billing.provider.state.createCalls,beforeBareComplete);billing.state.projectPendingCheckout=false
 mark('Completed Checkout/management replays return current authoritative status and matching completion receipts, including thin legacy results and expired continuations without another provider session')
 let response=await snapshotCall('POST');assert.equal(response.status,409);assert.equal((await response.json()).error,'upgrade_required')
 response=await snapshotCall('GET',{headers:{'x-goalloom-service-version':'0'}});assert.equal(response.status,409)
 response=await snapshotCall('GET',{query:snapshot.query()+'&seq=1'});assert.equal(response.status,400)
 response=await snapshotCall('GET',{headers:{origin:'https://www.goalloom.com'}});assert.equal(response.status,403)
 snapshot.state.error='service_expired';const reads=snapshot.state.storageReads;response=await snapshotCall();assert.equal(response.status,403);assert.equal((await response.json()).error,'service_expired');assert.equal(snapshot.state.storageReads,reads);snapshot.state.error=null
 snapshot.state.authStatus=503;assert.equal((await snapshotCall()).status,503);snapshot.state.authStatus=200
 mark('Snapshot old signer/version, duplicate query, browser-origin and expired-service paths reject before private Storage; Auth unavailability stays 503')
 response=await snapshotCall('PUT',{body:snapshot.state.bytes});assert.equal(response.status,200);let upload=await response.json();assert.deepEqual(upload,{version:1,method:'upload',sha256:snapshot.state.hash,size:snapshot.state.bytes.length});assert(!JSON.stringify(upload).includes(cfg.serviceKey));assert(!('signedUrl'in upload))
 response=await snapshotCall('PUT',{body:snapshot.state.bytes});assert.equal(response.status,200);assert.equal(snapshot.state.storageWrites,2)
 response=await snapshotCall();assert.equal(response.status,200);assert.equal(response.headers.get('x-goalloom-content-sha256'),snapshot.state.hash);assert.deepEqual(Buffer.from(await response.arrayBuffer()),snapshot.state.bytes)
 const writes=snapshot.state.storageWrites;response=await snapshotCall('PUT',{body:new Uint8Array(2097153)});assert.equal(response.status,413);assert.equal(snapshot.state.storageWrites,writes)
 response=await snapshotCall('PUT',{body:Buffer.from('wrong')});assert.equal(response.status,409);assert.equal(snapshot.state.storageWrites,writes)
 mark('Bounded binary proxy, immutable hash/size tuple and create-only retry; no signed URL or server credential reaches the client')
 snapshot.state.afterRead=()=>{snapshot.state.error='service_revoked'};response=await snapshotCall();assert.equal(response.status,403);assert.equal((await response.json()).error,'service_revoked');snapshot.state.error=null;snapshot.state.afterRead=null
 snapshot.state.afterRead=()=>{snapshot.state.generation=randomUUID()};response=await snapshotCall();assert.equal(response.status,409);assert.equal((await response.json()).error,'snapshot_conflict');snapshot.state.afterRead=null
 mark('Post-transfer qualification/generation rechecks withhold ciphertext when access changes during the Storage read')
 report.ok=true
}catch(error){report.error={type:error.name,message:error.name==='AssertionError'?error.message:'controlled_http_incomplete',location:error.stack?.match(/d1-http-acceptance\.mjs:\d+:\d+/)?.[0]??null};process.exitCode=1}
finally{await new Promise(resolve=>server.close(resolve));await writeFile(`${directory}/http-acceptance.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))}
