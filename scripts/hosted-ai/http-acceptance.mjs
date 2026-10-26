/**
 * [INPUT]: Bundled production handler, controlled Auth/ledger/lifecycle-delivery/provider HTTP dependencies and synthetic accounts.
 * [OUTPUT]: Repeatable HTTP journey evidence for finite API validation, ownership, receipt-only recovery, content exclusion and usage settlement.
 * [POS]: Controlled integration acceptance. It does not claim real Supabase/Postgres concurrency or model quality.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { inputs } from './content-minimization/fixtures.mjs'
import { metadataOnly } from './content-minimization/scan.mjs'
import { actionId } from './content-minimization/identity.mjs'
const out=resolve('output/tests/hosted-ai/content-minimization')
await mkdir(out,{recursive:true})
await build({entryPoints:['supabase/functions/hosted-ai/handler.ts'],bundle:true,platform:'node',format:'esm',outfile:resolve(out,'handler.mjs'),logLevel:'silent'})
const {createHostedHandler}=await import(pathToFileURL(resolve(out,'handler.mjs')).href)
const owner=randomUUID(),stranger=randomUUID(),url='https://hosted-fixture.invalid'
const jwt=(id,changes={})=>`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,iss:`${url}/auth/v1`,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,...changes})).toString('base64url')}.verified-fixture`
const marker=randomUUID(), privateText=`Private fixture ${marker}`
const rows=new Map(),events=[],writes=[]
let providerGate=null,providerStarted=null
let spent=0,limit=10000000,providerCalls=0,providerMode='success',settlementMode='ready',policy=true,metadataMode='ready'
let admissionPolicy='authenticated',serviceState='none',metadataCalls=0,authStatus=200
const access=headers=>!policy?{eligible:false,error:'permission_denied'}:admissionPolicy==='authenticated'?{eligible:true,policy:admissionPolicy}
  :headers['x-goalloom-service-version']!=='1'?{eligible:false,error:'upgrade_required',minServiceVersion:1}
  :serviceState==='configuration'?{eligible:false,error:'billing_configuration'}
  :['trialing','active','grace'].includes(serviceState)?{eligible:true,policy:admissionPolicy}
  :{eligible:false,error:serviceState==='expired'?'service_expired':serviceState==='revoked'?'service_revoked':'service_not_started',billingStatus:serviceState}
const key=(user,action)=>`${user}/${action}`
const fetchFixture=async (target,init={})=>{
  const path=new URL(target).pathname
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}})
  if(path==='/auth/v1/user') {
    if(authStatus!==200)return json({},authStatus)
    const auth=init.headers.authorization
    if(!auth?.endsWith('.verified-fixture'))return json({},401)
    return json({id:JSON.parse(Buffer.from(auth.split('.')[1],'base64url')).sub})
  }
  if(path.startsWith('/rest/v1/rpc/')) {
    const input=JSON.parse(init.body)
    assert(metadataOnly(input,[marker]),'Persistence boundary rejected')
    writes.push(input)
    if(path.endsWith('lifecycle_delivery_allowed')) {
      assert.deepEqual(Object.keys(input).sort(),['p_environment','p_owner']);assert.equal(input.p_environment,'development');assert([owner,stranger].includes(input.p_owner))
      return json(true)
    }
    const id=key(input.p_user,input.p_action)
    if(path.endsWith('ai_eligibility'))return json(policy)
    if(path.endsWith('ai_service_status'))return json(access(init.headers))
    if(path.endsWith('ai_receipt')) {
      const row=rows.get(id)
      return json(row??null)
    }
    if(path.endsWith('ai_admit')) {
      const eligibility=access(init.headers);if(!eligibility.eligible)return json(eligibility)
      if(rows.has(id))return json({existing:true,receipt:rows.get(id)})
      const issued=parseInt(input.p_action.replaceAll('-','').slice(0,12),16)
      if(issued<Date.now()-300000 || issued>Date.now()+60000)return json({error:'action_expired'})
      if(spent+input.p_reserve>limit){events.push('platform_budget');return json({error:'platform_budget'})}
      spent+=input.p_reserve
      const row={user_id:input.p_user,action_id:input.p_action,status:'running',reserved_micro:input.p_reserve,charged_micro:input.p_reserve,confirmed:false,capability:input.p_capability,created_at:new Date().toISOString()}
      rows.set(id,row);return json({existing:false,receipt:row})
    }
    if(path.endsWith('ai_settle')) {
      if(settlementMode==='before-commit')return json({error:'unavailable'},503)
      const row=rows.get(id)
      if(!row.confirmed){const charge=input.p_confirmed?input.p_cost:row.reserved_micro;spent+=charge-row.charged_micro;Object.assign(row,{status:input.p_status,confirmed:input.p_confirmed,charged_micro:charge,failure:input.p_failure,provider_request_id:input.p_provider,input_tokens:input.p_input,output_tokens:input.p_output})}
      if(settlementMode==='lost-ack')return json({error:'unavailable'},503)
      return json(row)
    }
    throw Error('Unknown RPC')
  }
  assert.equal(new URL(target).origin,'https://openrouter.ai')
  if (path === '/api/v1/generation') return json({data:{id:new URL(target).searchParams.get('id'),total_cost:0.00005,tokens_prompt:60,tokens_completion:2,native_tokens_prompt:50,native_tokens_completion:0}})
  if (path.endsWith('/endpoints')) {metadataCalls++;if(metadataMode==='expire-after-access')serviceState='expired';return json({data:{endpoints:(path.includes('typesafe')?['typesafe']:path.includes('flash-1017')?['deepseek','deepinfra/fp8']:['deepinfra/fp8']).map(tag=>({tag,status:0,supported_parameters:metadataMode==='no-effort'?['response_format','structured_outputs']:metadataMode==='no-format'?['reasoning_effort']:['response_format','structured_outputs','reasoning_effort'],pricing:{prompt:metadataMode==='unknown'?null:metadataMode==='expensive'?'1':'0.000000042',completion:'0',...(metadataMode==='request-fee'?{request:'1'}:{})}}))}})}
  providerCalls++
  if(providerGate){providerStarted?.();await providerGate}
  const input=JSON.parse(init.body)
  assert(!('url'in input));assert(!('tools'in input))
  if(providerMode==='unknown')throw Error('Synthetic lost response')
  const usage=providerMode==='no-usage'?{}:{cost:0.000123,input_tokens:100,output_tokens:0,prompt_tokens:100,completion_tokens:20}
  if(providerMode==='provider-error')return json({error:{message:privateText}},500)
  if(providerMode==='invalid-json')return new Response(privateText,{status:200})
  if(providerMode==='invalid-envelope')return json(null)
  if(providerMode==='invalid-schema')return json({id:`gen-1792700000000-${providerCalls}`,usage,choices:[{message:{content:'{"headline":"","advice":"","flags":[]}'}}]})
  if(providerMode==='invalid')return json({id:`gen-1792700000000-${providerCalls}`,usage,answers:{}})
  if(path.endsWith('systemone'))return json({id:`gen-dec-1792700000000-${providerCalls}`,model:input.model,usage,answers:Object.fromEntries(Object.entries(input.questions).map(([id,q])=>[id,q.type==='noul'?{type:'noul',noul:0.9}:{type:'choice',choice:Object.keys(q.criteria)[0],probabilities:Object.fromEntries(Object.keys(q.criteria).map((name,index)=>[name,index===0?1:0]))}]))})
  assert.equal(input.model,providerMode.startsWith('assistance')||providerMode==='guidance'?'deepseek/deepseek-v4.1-flash-1017':'deepseek/deepseek-v4.1-flash');assert.deepEqual(input.provider.only,[providerMode.startsWith('assistance')?'deepseek':'deepinfra/fp8']);assert.equal(input.provider.allow_fallbacks,false)
  assert.equal(input.provider.data_collection,providerMode.startsWith('assistance')?'allow':'deny')
  if(providerMode.startsWith('assistance'))assert.deepEqual(input.reasoning,{effort:'none'})
  if(providerMode.startsWith('assistance'))assert.deepEqual(JSON.parse(input.messages[1].content).preserveVerbatim,providerMode==='assistance'?{completedCheckboxLines:[],linkTargets:[]}:{completedCheckboxLines:[`- [x] ${privateText}`],linkTargets:['https://example.com/keep']})
  if(providerMode==='guidance')return json({id:`gen-1792700000000-${providerCalls}`,provider:'DeepInfra',usage,choices:[{message:{content:JSON.stringify({kind:'clarify',question:'What is the next useful step?'})}}]})
  const user=JSON.parse(input.messages[1].content)
  const assistance=JSON.stringify({kind:'rewrite',description:user.description+'\n- [ ] Take a small step'})
  const content=providerMode==='assistance-lost-anchors'?JSON.stringify({kind:'rewrite',description:'Take one step'}):providerMode==='assistance' ? assistance : JSON.parse(input.messages[1].content).tasks ? JSON.stringify({items:JSON.parse(input.messages[1].content).tasks.map(task=>({id:task.id,title:'Write a synthetic outline',why:'First step'}))}) : JSON.stringify({headline:marker,advice:'Take one step',flags:[]})
  return json({id:`gen-1792700000000-${providerCalls}`,usage,choices:[{message:{content}}]})
}
let dropNext=false
const handler=createHostedHandler({url,serviceKey:'synthetic-server-secret',providerKey:'synthetic-provider-secret',environment:'development',fetch:fetchFixture})
const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk)
  const request=new Request(`http://127.0.0.1${req.url}`,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})})
  const response=await handler(request)
  if(dropNext && req.method==='POST'){dropNext=false;res.destroy();return}
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
})
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
const endpoint=`http://127.0.0.1:${server.address().port}`
const checks=[]
const check=name=>{checks.push(name);console.log(`pass ${name}`)}
const call=(body,token=jwt(owner),path='',headers={})=>fetch(endpoint+path,{method:body===undefined?'GET':'POST',headers:{...(token?{authorization:`Bearer ${token}`}:{}) ,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})})
const evaluate=(id=actionId())=>({version:2,consentScopeVersion:3,actionId:id,request:{capability:'evaluate',input:{state:{text:privateText},questions:{task:{type:'boolean',instructions:'Is this a task?',criteria:{true:'yes',false:'no'}}}}}})
const report={ok:false,scope:'Controlled HTTP with real production handler, shared schemas/prompts and full fixture-owned metadata boundaries; synthetic Auth, SQL ledger and provider dependencies. No live SQL concurrency, model quality or real cost claim.',runtime:{node:process.version,platform:process.platform,arch:process.arch},checks}
try {
  assert(metadataOnly({p_environment:'development',p_owner:owner},[marker]))
  for(const payload of [{p_owner:privateText},{p_owner:'-'.repeat(36)},{p_owner:owner,unexpected:owner}]) assert.equal(metadataOnly(payload,[marker]),false)
  check('Lifecycle metadata accepts only a UUID owner and rejects private text, malformed identities and unknown fields')
  assert.equal((await call(evaluate(),null)).status,401)
  assert.equal((await call(evaluate(),jwt(owner,{iss:'https://wrong-project.invalid/auth/v1'}))).status,401)
  assert.equal((await call(evaluate(),jwt(owner,{exp:1}))).status,401)
  assert.equal((await call(evaluate(),jwt(owner).replace('verified-fixture','forged'))).status,401)
  assert.equal((await call(evaluate(),`${Buffer.from('{}').toString('base64url')}.${Buffer.from('null').toString('base64url')}.verified-fixture`)).status,401)
  assert.equal(providerCalls,0);check('Missing, forged, expired and wrong-project sessions reject before provider admission')
  assert.equal((await call({...evaluate(),model:'arbitrary'})).status,400)
  const arbitrary=evaluate();arbitrary.request.url='https://evil.invalid';assert.equal((await call(arbitrary)).status,400)
  assert.equal((await call({version:2,consentScopeVersion:3,actionId:actionId(),request:{capability:'chat',input:{messages:[]}}})).status,400)
  const oversized=evaluate();oversized.request.input.state.text='x'.repeat(300000);assert.equal((await call(oversized)).status,413)
  const media=evaluate();media.request.input.state.text={type:'image_url',image_url:{url:'https://evil.invalid'}};assert.equal((await call(media)).status,400)
  assert.equal(providerCalls,0);check('Arbitrary model, URL, generic chat and oversized input reject without a model call')
  assert.equal((await (await call(undefined,jwt(owner),'?status=1')).json()).eligible,true)
  assert.equal(providerCalls,0);check('Eligibility uses no model call or sync operation')
  const consentCalls=providerCalls,consentRows=rows.size
  for(const consentScopeVersion of [undefined,1,2,null,'3']) {
    const oldClient={version:2,actionId:actionId(),request:{capability:'assistance',input:inputs.assistance},...(consentScopeVersion===undefined?{}:{consentScopeVersion})}
    assert.equal((await call(oldClient)).status,400)
    assert.equal(providerCalls,consentCalls);assert.equal(rows.size,consentRows);assert.equal(spent,0)
  }
  check('Valid old protocol-v2 clients with missing, stale or malformed consent scope reject before reservation or provider calls')
  for (const mode of ['unknown','expensive','request-fee']) { metadataMode=mode; assert.equal((await call(evaluate())).status,503) }
  assert.equal(providerCalls,0);assert.equal(rows.size,0);metadataMode='ready';check('Unknown pricing, higher rates and new request fees stop before admission or inference')
  const first=evaluate();const ready=await call(first);assert.equal(ready.status,200);assert.equal(ready.headers.get('cache-control'),'no-store');assert.equal((await ready.json()).result.answers.task.probability,0.9)
  assert.equal(spent,123);assert([...rows.values()].some(row=>row.provider_request_id?.startsWith('gen-dec-')));check('Successful Jev result validates and settles trusted usage with the documented decision generation ID')
  await Promise.all([call(first),call(first)]);assert.equal(providerCalls,1)
  assert.equal((await call(undefined,jwt(stranger),`?actionId=${first.actionId}`)).status,404)
  const receipt=await call(undefined,jwt(owner),`?actionId=${first.actionId}`);assert.equal(receipt.status,409);assert.equal((await receipt.json()).error,'result_not_delivered')
  for(const reply of await Promise.all([call(first),call(first)])){assert.equal(reply.status,409);assert(!('result' in await reply.json()))}
  assert.equal(providerCalls,1);assert(metadataOnly([...rows.values()],[marker]));check('Completed duplicate POST and GET return only receipts; one fee, no content persistence')
  const old=evaluate(actionId(Date.now()-91*86400000));assert.equal((await call(old)).status,409);assert.equal(providerCalls,1)
  assert.equal((await call({...evaluate(),version:1})).status,400);check('Expired timestamp identities and legacy protocol fail closed without a new inference')
  let releaseProvider,startedProvider
  const started=new Promise(resolve=>startedProvider=resolve);providerStarted=startedProvider;providerGate=new Promise(resolve=>releaseProvider=resolve)
  const concurrent=evaluate(),beforeConcurrent=providerCalls,original=call(concurrent);await started
  const duplicateRunning=await call(concurrent);assert.equal(duplicateRunning.status,202);assert(!Object.hasOwn(await duplicateRunning.json(),'result'));assert.equal(providerCalls,beforeConcurrent+1)
  releaseProvider();assert.equal((await original).status,200);providerGate=null;providerStarted=null;check('Concurrent duplicate during inference receives a running receipt without shared body or a second provider attempt')
  providerMode='invalid';const invalid=evaluate();assert.equal((await call(invalid)).status,409);assert.equal(rows.get(key(owner,invalid.actionId)).confirmed,true);check('Invalid output remains charged and does not return a usable result')
  providerMode='unknown';const unknown=evaluate();assert.equal((await call(unknown)).status,202)
  const count=providerCalls;await call(unknown);assert.equal(providerCalls,count);assert.equal(rows.get(key(owner,unknown.actionId)).charged_micro,500000);check('Lost provider outcome conservatively retains the reservation and duplicate requests never call again')
  providerMode='success';limit=spent;assert.equal((await call(evaluate())).status,402);assert.equal(providerCalls,count);check('Exhausted platform budget stops before the provider')
  limit=10000000;providerMode='no-usage';const unresolved=evaluate();assert.equal((await call(unresolved)).status,200)
  assert.equal(rows.get(key(owner,unresolved.actionId)).confirmed,false);const attempts=providerCalls
  assert.equal((await call(undefined,jwt(owner),`?actionId=${unresolved.actionId}`)).status,409)
  assert.equal(providerCalls,attempts);assert.equal(rows.get(key(owner,unresolved.actionId)).confirmed,true);assert.equal(rows.get(key(owner,unresolved.actionId)).charged_micro,50);assert.equal(rows.get(key(owner,unresolved.actionId)).input_tokens,50);assert.equal(rows.get(key(owner,unresolved.actionId)).output_tokens,0)
  check('Missing response usage retains a reservation; generation metadata reconciles it without repeating inference')
  providerMode='success'
  const board={today:'2026-10-23',periods:{},goals:[],unlinked:{half:[],cycle:[],month:[],week:[],day:[]}},prefs={about:'',stepSize:'smallest',stepNotes:'',tone:'direct',focus:[]}
  const review={version:2,consentScopeVersion:3,actionId:actionId(),request:{capability:'review',input:{requestId:randomUUID(),generation:randomUUID(),scope:'week',board,prefs,signals:[]}}}
  assert.equal((await call(review)).status,200)
  const draft={version:2,consentScopeVersion:3,actionId:actionId(),request:{capability:'draft',input:{requestId:randomUUID(),generation:randomUUID(),board,prefs,tasks:[{id:'synthetic',parent:'Publish a synthetic guide',goal:null,target:'Today',targetHorizon:'day',siblings:[]}]}}}
  assert.equal((await call(draft)).status,200);check('Finite draft/review inputs build fixed DeepSeek prompts and validate usable outputs')
  inputs.assistance.context.item.description=privateText
  inputs.assistance.request.text=privateText
  for(const missing of ['no-format','no-effort']) {
    metadataMode=missing;const before=providerCalls
    const denied={version:2,consentScopeVersion:3,actionId:actionId(),request:{capability:'assistance',input:inputs.assistance}}
    assert.equal((await call(denied)).status,503);assert.equal(providerCalls,before)
  }
  metadataMode='ready';check('Missing JSON-output or explicit reasoning-off support rejects rewriting before reservation or inference')
  providerMode='assistance';const assistance={version:2,consentScopeVersion:3,actionId:actionId(),request:{capability:'assistance',input:inputs.assistance}};assert.equal((await call(assistance)).status,200);check('Bounded assistance is delivered from the original POST without result storage')
  providerMode='guidance';const guidance={...inputs.assistance,request:{...inputs.assistance.request}};delete guidance.request.mode
  const clarification=await call({version:2,consentScopeVersion:3,actionId:actionId(),request:{capability:'assistance',input:guidance}})
  assert.equal(clarification.status,200);assert.equal((await clarification.json()).result.includes('clarify'),true)
  check('Legacy guidance keeps DeepInfra and denies data collection; only explicit rewrites permit the official operator')
  inputs.assistance.context.item.description=`- [x] ${privateText}\nhttps://example.com/keep`
  providerMode='assistance-lost-anchors';const missingAnchors={...assistance,actionId:actionId()},missingResponse=await call(missingAnchors)
  assert.equal(missingResponse.status,409);assert.equal((await missingResponse.json()).error,'malformed_response')
  check('A rewrite that discards completed work or links is rejected and retains its actual fee')
  for(const mode of ['invalid-json','invalid-envelope','invalid-schema','provider-error']){
    providerMode=mode
    const invalid={...review,actionId:actionId()},response=await call(invalid)
    assert.equal(response.status,409);assert.equal((await response.json()).error,mode==='provider-error'?'provider_failed':'malformed_response')
    const receipt=rows.get(key(owner,invalid.actionId));assert.equal(receipt.status,'failed');assert(!('result_cipher' in receipt))
    assert.equal(receipt.confirmed,mode==='invalid-schema')
  }
  check('Completed responses with malformed JSON or invalid writing schemas fail immediately and retain their actual or reserved fees')
  providerMode='success'
  for(const mode of ['before-commit','lost-ack']) {
    settlementMode=mode;const action=evaluate(),before=providerCalls,response=await call(action)
    assert.equal(response.status,503);assert(!Object.hasOwn(await response.json(),'result'));assert.equal(providerCalls,before+1)
    const row=rows.get(key(owner,action.actionId));assert.equal(row.charged_micro,mode==='before-commit'?500000:123)
    settlementMode='ready';const receipt=await call(undefined,jwt(owner),`?actionId=${action.actionId}`)
    assert.equal(receipt.status,mode==='before-commit'?202:409);assert(!Object.hasOwn(await receipt.json(),'result'))
    await call(action);assert.equal(providerCalls,before+1)
  }
  check('Failed settlement or lost ledger acknowledgement withholds the result and retains the original reservation or confirmed fee')
  const transportBundle=await build({stdin:{contents:"export {hostedAdapters} from './apps/desktop/src/main/smart/hosted'",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'})
  const {hostedAdapters}=await import(`data:text/javascript;base64,${Buffer.from(transportBundle.outputFiles[0].text).toString('base64')}`)
  const adapter=hostedAdapters({id:()=>owner,session:async()=>({userId:owner,accessToken:jwt(owner)}),config:()=>({url:endpoint,anonKey:'synthetic-anon'})})
  dropNext=true;const beforeDrop=providerCalls,identity=randomUUID(),sample=evaluate().request.input
  const lost=()=>adapter.evaluate('',{...sample,actionId:identity,signal:new AbortController().signal})
  await assert.rejects(lost(),error=>error.failure?.kind==='result_not_delivered')
  assert.equal(providerCalls,beforeDrop+1);await assert.rejects(lost());assert.equal(providerCalls,beforeDrop+1)
  check('Original POST response is dropped only after ledger settlement; transport GET and repeated attempt cannot recover content or repeat inference')
  const callsBeforePolicy=providerCalls
  policy=false;assert.equal((await call(evaluate())).status,403);assert.equal(providerCalls,callsBeforePolicy);check('Unknown or unavailable authorization policy fails closed')
  policy=true;admissionPolicy='trial_or_paid';const serviceHeaders={'x-goalloom-service-version':'1'}
  const paidBefore={calls:providerCalls,metadata:metadataCalls,spent,rows:rows.size}
  assert.equal((await call(evaluate())).status,409)
  for(const [state,error,status] of [['none','service_not_started',403],['expired','service_expired',403],['revoked','service_revoked',403],['configuration','billing_configuration',503]]){
    serviceState=state;const denied=await call(evaluate(),jwt(owner),'',serviceHeaders);assert.equal(denied.status,status);assert.equal((await denied.json()).error,error)
    assert.equal((await call(undefined,jwt(owner),'?status=1',serviceHeaders)).status,status)
  }
  assert.deepEqual({calls:providerCalls,metadata:metadataCalls,spent,rows:rows.size},paidBefore)
  check('Paid-mode version, inactive/revoked and missing-configuration denials precede model metadata, inference and reservation')
  for(const state of ['trialing','active','grace']){serviceState=state;assert.equal((await (await call(undefined,jwt(owner),'?status=1',serviceHeaders)).json()).eligible,true)}
  serviceState='trialing';providerMode='success';limit=10000000;const trialAction=evaluate();assert.equal((await call(trialAction,jwt(owner),'',serviceHeaders)).status,200)
  serviceState='expired';const receiptCalls=providerCalls,receiptSpent=spent
  assert.equal((await call(undefined,jwt(owner),`?actionId=${trialAction.actionId}`)).status,409)
  assert.equal((await call(trialAction,jwt(owner),'',serviceHeaders)).status,403);assert.equal(providerCalls,receiptCalls);assert.equal(spent,receiptSpent)
  check('Trial/paid/grace eligibility uses the original fee path; receipt-only recovery remains available after expiry without a second inference')
  serviceState='active';metadataMode='expire-after-access';const atomicBefore={calls:providerCalls,spent,rows:rows.size}
  const atomicDenied=await call(evaluate(),jwt(owner),'',serviceHeaders);assert.equal(atomicDenied.status,403);assert.equal((await atomicDenied.json()).error,'service_expired')
  assert.deepEqual({calls:providerCalls,spent,rows:rows.size},atomicBefore);metadataMode='ready'
  check('Atomic admission rechecks service after the early gate and retains all existing accounting when access changes')
  for(const status of [429,503]){authStatus=status;assert.equal((await call(evaluate(),jwt(owner),'',serviceHeaders)).status,503)}authStatus=200
  check('Transient Auth failures remain unavailable rather than authentication expiry')
  assert(metadataOnly([...rows.values()],[marker]));assert(writes.every(write=>metadataOnly(write,[marker])));check('Full nested persistence inputs and records contain only approved metadata, including failed upstream bodies')
  report.ok=true;report.providerCalls=providerCalls;report.realProviderCalls=0;report.realCostUsd=0;report.syntheticLedgerMicro=spent
} catch(error){report.error='acceptance_failed';report.location=error.stack?.match(/http-acceptance\.mjs:\d+:\d+/)?.[0]??null;process.exitCode=1} finally {await new Promise(resolve=>server.close(resolve));await writeFile(resolve(out,'http-acceptance.json'),JSON.stringify(report,null,2)+'\n');console.log(`Evidence: ${resolve(out,'http-acceptance.json')}`)}
