/**
 * [INPUT]: Real loopback HTTP failures, original fixture request transport and D3 attempt reporting.
 * [OUTPUT]: Repeatable reset/body/timeout/HTTP/redaction and scope-check recovery evidence without external calls or credentials.
 * [POS]: Focused D3 transport E2E; controlled error redaction does not establish the old remote cause.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {randomUUID} from 'node:crypto'
import {mkdir,readFile,readdir,writeFile,stat} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fixtureHttpRequest,fixtureRequestFailure,fixtureErrorDetails} from '../../lifecycle/fixture-http.mjs'
import {executeStage} from './execute.mjs'

assert(process.argv.length===2||process.argv.length===3&&['--reports','--scope-recovery'].includes(process.argv[2]),'Use no options, --reports or --scope-recovery')
const reportsOnly=process.argv[2]==='--reports',scopeRecoveryOnly=process.argv[2]==='--scope-recovery',runId=randomUUID(),owner=randomUUID(),directory=resolve('output/tests/billing/desktop/d3-local',`transport-${Date.now()}-${runId}`)
await mkdir(directory,{recursive:true,mode:0o700})
const sentinel=`private_fixture_${randomUUID().replaceAll('-','')}`,counts=new Map(),checks=[]
const report={ok:false,selection:reportsOnly?'reports':scopeRecoveryOnly?'scope-recovery':'all',scope:'Real loopback HTTP and actual attempt reports; controlled context/provider ports, no external Auth/provider/desktop acceptance.',realExternalCalls:0,credentialsRead:false,checks,observations:[],runtime:{node:process.version,os:process.platform,arch:process.arch},directory}
const previousEnvironment={window:process.env.D3_BILLING_WINDOW,lease:process.env.D3_BILLING_LEASE}
let server
try{
 server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://127.0.0.1').pathname
  counts.set(path,(counts.get(path)??0)+1)
  for await(const _ of req){}
  const mode=req.headers['x-loopback-case']
  if(mode){
   const count=(counts.get(mode)??0)+1;counts.set(mode,count)
   if(mode==='shared-deadline'){
    if(count===1){const timer=setTimeout(()=>req.socket.resetAndDestroy(),12000);req.socket.once('close',()=>clearTimeout(timer))}
    return
   }
   if(mode==='http-no-retry'){res.writeHead(503);res.end('{}');return}
   if(mode==='parse-no-retry'){res.end(sentinel);return}
   if(mode==='body-no-retry'){res.writeHead(200,{'content-length':'512'});res.write('{"ok":');res.socket.end();return}
   if(mode==='socket-no-retry'){req.socket.destroy();return}
   if(mode!=='reset-success'||count===1){req.socket.resetAndDestroy();return}
   res.end('{"ok":true}');return
  }
  if(path==='/reset'){req.socket.destroy();return}
  if(path==='/truncated'){
   res.writeHead(200,{'content-type':'application/json','content-length':'512'})
   res.write('{"ok":');res.socket.end();return
  }
  if(path==='/timeout')return
  if(path==='/timeout-body'){res.writeHead(200,{'content-type':'application/json'});res.write('{"ok":');return}
  if(path==='/void'){res.writeHead(204);res.end();return}
  if(path==='/bytes'){res.end(Buffer.from([0,1,2,255]));return}
  if(path==='/malformed'){res.end(sentinel);return}
  if(path==='/oversize'){res.end(Buffer.alloc(4*1024*1024+1,'x'));return}
  const original={
   '/charge':{id:'ch_local'},
   '/disputes':{has_more:false,data:[{id:'du_local',charge:'ch_local',livemode:false}]},
   '/subscription':{id:'sub_local',customer:'cus_local',livemode:false,metadata:{app_user_id:owner},cancel_at_period_end:true},
   '/status':{status:'revoked',eligible:false,grace:false,effectiveEnd:null,subscriptions:[]},
  }
  if(original[path]){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(original[path]));return}
  res.writeHead(path==='/http-error'?503:200,{'content-type':'application/json','x-private-fixture':sentinel})
  res.end(JSON.stringify(path==='/http-error'?{code:'PGRST123',message:sentinel}:{ok:true,private:sentinel}))
 })
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
 const base=`http://127.0.0.1:${server.address().port}`
 const request=async path=>{
  try{
   const result=await fixtureHttpRequest(base+path,{method:'POST',headers:{authorization:`Bearer ${sentinel}`,'content-type':'application/json'},body:JSON.stringify({private:sentinel}),redirect:'error',signal:AbortSignal.timeout(20000)},'function:billing')
   report.observations.push({path,diagnostic:result.requestDiagnostic});return result
  }catch(error){if(error.requestDiagnostic)report.observations.push({path,diagnostic:error.requestDiagnostic});throw error}
 }
 const capture=async run=>{try{await run()}catch(error){return error}assert.fail('Expected an actual request failure')}
 const safe=diagnostic=>{
  const text=JSON.stringify(diagnostic)
  assert(!text.includes(sentinel)&&!text.includes(base))
  for(const key of ['message','stack','headers','url','body','bytes','authorization'])assert(!text.includes(`"${key}":`))
 }

 if(!reportsOnly){
 const scopePath='/rest/v1/rpc/lifecycle_scope_check'
 const scopeRequest=(mode,{path=scopePath,method='POST',operation='rpc:lifecycle_scope_check',recover=true,signal=AbortSignal.timeout(20000)}={})=>fixtureHttpRequest(base+path,{
  method,headers:{'x-loopback-case':mode,authorization:`Bearer ${sentinel}`},...(method==='GET'?{}:{body:JSON.stringify({private:sentinel})}),redirect:'error',signal,
 },operation,recover)
 const recovered=await scopeRequest('reset-success')
 assert.equal(recovered.status,200);assert.equal(recovered.body.ok,true);assert.equal(counts.get('reset-success'),2)
 assert.equal(recovered.requestDiagnostic.attempt,2);assert.equal(recovered.requestDiagnostic.previousAttempts.length,1)
 assert.equal(recovered.requestDiagnostic.previousAttempts[0].cause.cause.code,'ECONNRESET');safe(recovered.requestDiagnostic)
 checks.push({case:'scope_reset_recovers_once_and_keeps_first_failure',passed:true,dispatches:2,diagnostic:recovered.requestDiagnostic})

 const twice=await capture(()=>scopeRequest('reset-twice'))
 assert.equal(counts.get('reset-twice'),2);assert.equal(twice.requestDiagnostic.attempt,2)
 assert.equal(twice.requestDiagnostic.previousAttempts.length,1);assert.equal(twice.requestDiagnostic.cause.cause.code,'ECONNRESET');safe(twice.requestDiagnostic)
 checks.push({case:'second_scope_reset_stops_after_two_dispatches',passed:true,dispatches:2,diagnostic:twice.requestDiagnostic})

 for(const [mode,options]of [
  ['default-no-retry',{recover:false}],['write-no-retry',{path:'/functions/v1/billing',operation:'function:billing'}],
  ['delete-no-retry',{method:'DELETE'}],['auth-no-retry',{path:'/auth/v1/token?grant_type=refresh_token',operation:'auth:session'}],
  ['rpc-write-no-retry',{path:'/rest/v1/rpc/billing_commit',operation:'rpc:billing_commit'}],
  ['wrong-operation-no-retry',{operation:'rpc:billing_commit'}],['query-no-retry',{path:scopePath+'?mode=other'}],
  ['get-no-retry',{method:'GET'}],['socket-no-retry',{}],['body-no-retry',{}],
 ]){
  const failed=await capture(()=>scopeRequest(mode,options));assert.equal(counts.get(mode),1);assert(!failed.requestDiagnostic.previousAttempts);safe(failed.requestDiagnostic)
  checks.push({case:mode,passed:true,dispatches:1,diagnostic:failed.requestDiagnostic})
 }
 for(const mode of ['http-no-retry','parse-no-retry']){
  const response=await scopeRequest(mode);assert.equal(counts.get(mode),1);assert(!response.requestDiagnostic.previousAttempts);safe(response.requestDiagnostic)
  assert.equal(response.status,mode==='http-no-retry'?503:200);if(mode==='parse-no-retry')assert.equal(response.body,null)
  checks.push({case:mode,passed:true,dispatches:1,diagnostic:response.requestDiagnostic})
 }
 const expired=AbortSignal.abort(new DOMException('Controlled cancellation','AbortError'))
 const aborted=await capture(()=>scopeRequest('aborted-no-retry',{signal:expired}));assert(!counts.has('aborted-no-retry'));safe(aborted.requestDiagnostic)
 checks.push({case:'already_aborted_signal_cannot_dispatch_recovery',passed:true,dispatches:0})

 const budget=await capture(()=>scopeRequest('shared-deadline'))
 assert.equal(counts.get('shared-deadline'),2);assert.equal(budget.requestDiagnostic.attempt,2)
 assert.equal(budget.requestDiagnostic.previousAttempts[0].cause.cause.code,'ECONNRESET')
 assert.equal(budget.requestDiagnostic.abortReason.name,'TimeoutError')
 assert(budget.requestDiagnostic.elapsedMs>=19000&&budget.requestDiagnostic.elapsedMs<24000)
 assert(budget.requestDiagnostic.previousAttempts[0].elapsedMs>=11000);safe(budget.requestDiagnostic)
 checks.push({case:'late_reset_and_second_attempt_share_original_20_second_deadline',passed:true,dispatches:2,diagnostic:budget.requestDiagnostic})
 const support=await readFile('scripts/lifecycle/fixture-support.mjs','utf8')
 assert(support.includes('signal:AbortSignal.timeout(20000)'));assert(support.includes("method==='POST'&&path==='/rest/v1/rpc/lifecycle_scope_check'"))
 checks.push({case:'caller_keeps_original_deadline_and_exact_scope_route_opt_in',passed:true})
 }

 if(!reportsOnly&&!scopeRecoveryOnly){
 const reset=await capture(()=>request('/reset'))
 assert.equal(reset.name,'FixtureRequestError');assert.equal(reset.requestDiagnostic.kind,'transport_failure')
 assert.equal(reset.requestDiagnostic.phase,'fetch');assert.equal(reset.requestDiagnostic.status,null)
 assert.equal(reset.requestDiagnostic.cause.cause.code,'UND_ERR_SOCKET');assert.equal(counts.get('/reset'),1);safe(reset.requestDiagnostic)
 checks.push({case:'reset_before_headers',passed:true,diagnostic:reset.requestDiagnostic,dispatches:1})

 const truncated=await capture(()=>request('/truncated'))
 assert.equal(truncated.requestDiagnostic.kind,'transport_failure');assert.equal(truncated.requestDiagnostic.phase,'body')
 assert.equal(truncated.requestDiagnostic.status,200);assert.equal(truncated.requestDiagnostic.cause.cause.code,'UND_ERR_SOCKET')
 assert.equal(counts.get('/truncated'),1);safe(truncated.requestDiagnostic)
 checks.push({case:'truncated_body_preserves_status',passed:true,diagnostic:truncated.requestDiagnostic,dispatches:1})

 const [timeout,bodyTimeout]=await Promise.all([capture(()=>request('/timeout')),capture(()=>request('/timeout-body'))])
 assert.equal(timeout.requestDiagnostic.phase,'fetch');assert.equal(timeout.requestDiagnostic.status,null)
 assert.equal(timeout.requestDiagnostic.cause.name,'TimeoutError');assert(timeout.requestDiagnostic.elapsedMs>=19000)
 assert.equal(timeout.requestDiagnostic.abortReason.name,'TimeoutError')
 assert.equal(counts.get('/timeout'),1);safe(timeout.requestDiagnostic)
 checks.push({case:'unchanged_20_second_deadline',passed:true,diagnostic:timeout.requestDiagnostic,dispatches:1})

 assert.equal(bodyTimeout.requestDiagnostic.phase,'body');assert.equal(bodyTimeout.requestDiagnostic.status,200)
 assert(['AbortError','TimeoutError'].includes(bodyTimeout.requestDiagnostic.cause.name));assert.equal(bodyTimeout.requestDiagnostic.abortReason.name,'TimeoutError')
 assert(bodyTimeout.requestDiagnostic.elapsedMs>=19000);assert.equal(counts.get('/timeout-body'),1);safe(bodyTimeout.requestDiagnostic)
 checks.push({case:'body_deadline_preserves_status_and_timeout_reason',passed:true,diagnostic:bodyTimeout.requestDiagnostic,dispatches:1})

 const http=await request('/http-error'),httpError=fixtureRequestFailure(http.requestDiagnostic)
 assert.equal(http.status,503);assert.equal(http.body.code,'PGRST123');assert.equal(httpError.requestDiagnostic.kind,'http_response')
 assert.equal(httpError.requestDiagnostic.code,'PGRST123');assert.equal(httpError.requestDiagnostic.phase,'complete')
 assert.equal(counts.get('/http-error'),1);safe(httpError.requestDiagnostic)
 checks.push({case:'received_http_error_is_distinct',passed:true,diagnostic:httpError.requestDiagnostic,dispatches:1})

 const success=await request('/success'),empty=await request('/void'),bytes=await request('/bytes'),malformed=await request('/malformed')
 assert.equal(success.body.ok,true);assert.equal(success.body.private,sentinel)
 assert.equal(empty.status,204);assert.equal(empty.body,null);assert.equal(empty.bytes.length,0)
 assert.equal(bytes.body,null);assert.deepEqual(bytes.bytes,Buffer.from([0,1,2,255]))
 assert.equal(malformed.body,null);assert.equal(malformed.requestDiagnostic.bodyFormat,'non_json')
 for(const result of [success,empty,bytes,malformed]){assert.equal(result.requestDiagnostic.kind,'http_response');safe(result.requestDiagnostic)}
 checks.push({case:'existing_json_void_storage_and_non_json_semantics',passed:true})

 const oversized=await capture(()=>request('/oversize'))
 assert.equal(oversized.message,'Fixture response byte cap exceeded');assert.equal(oversized.requestDiagnostic.status,200)
 assert.equal(oversized.requestDiagnostic.phase,'body');assert.equal(counts.get('/oversize'),1);safe(oversized.requestDiagnostic)
 checks.push({case:'existing_response_byte_cap',passed:true})
 }

 if(!scopeRecoveryOnly){
 process.env.D3_BILLING_WINDOW='development';process.env.D3_BILLING_LEASE=runId
 const profile={journey:'F',stage:'dispute',lease:runId,output:resolve(directory,'attempts')}
 const first=await executeStage(profile,{openContext:async()=>{await request('/reset');assert.fail('Reset cannot open a context')}})
 assert.equal(first.ok,false);assert.equal(first.phase,'context_open');assert.equal(first.error.request.phase,'fetch')
 assert.equal(first.error.request.cause.cause.code,'UND_ERR_SOCKET');assert(!first.observation&&!first.nativeInput)
 const firstBytes=await readFile(first.evidence)
 const second=await executeStage(profile,{openContext:async()=>{const result=await request('/http-error');throw fixtureRequestFailure(result.requestDiagnostic)}})
 assert.equal(second.phase,'context_open');assert.equal(second.error.request.status,503)
 assert.notEqual(second.evidence,first.evidence);assert.deepEqual(await readFile(first.evidence),firstBytes)
 assert.equal((await stat(first.evidence)).mode&0o077,0)
 safe(first.error);safe(second.error)
 checks.push({case:'context_open_http_failures_write_immutable_attempts',passed:true,evidence:[first.evidence,second.evidence]})

 const privateError=Object.assign(new Error(sentinel),{name:sentinel,code:sentinel,syscall:sentinel,headers:{authorization:sentinel},url:sentinel})
 const aggregate=new AggregateError(Array.from({length:20},()=>privateError),sentinel);aggregate.cause=aggregate
 const redacted=await executeStage(profile,{openContext:async()=>{await request('/success');throw aggregate}})
 assert.equal(redacted.error.type,'AggregateError');assert.equal(redacted.phase,'context_open')
 assert.equal(redacted.error.cause.errors.length,4);assert.equal(redacted.error.cause.errors[0].name,'unknown')
 assert.equal(redacted.error.cause.errors[0].code,'unknown');assert.equal(redacted.error.cause.errors[0].syscall,'unknown')
 assert.deepEqual(redacted.error.cause.cause,{truncated:true});assert.equal(redacted.error.cause.truncated,true)
 assert(JSON.stringify(redacted.error).length<1500);safe(redacted.error)
 assert(!(await readFile(redacted.evidence,'utf8')).includes(sentinel))
 assert.equal((await readdir(profile.output)).length,3)
 checks.push({case:'bounded_unknown_and_cyclic_error_redaction_in_actual_reports',passed:true,evidence:redacted.evidence})

 const cached={version:1,readOnly:true,remoteWrites:0,reason:'assert_recognized',v2:{ok:true,items:[]}}
 for(const mode of ['success','stage_failure','getter_failure']){
  let getterCalls=0,closed=false
  const ctx={fixture:{journey:'F',ownerId:owner,d3:{completed:{setup:true}}},journal:{runId,initialPeriod:false},state:{invoice:'in_local',subscription:'sub_local',customer:'cus_local'},
   privatePath:resolve(directory,`context-${mode}.json`),apiOrigin:base,lifecycle:{anon:'local-controlled-anon'},
   charge:async invoice=>{assert.equal(invoice,'in_local');return(await request('/charge')).body},
   stripe:{disputes:{list:async({charge})=>{assert.equal(charge,'ch_local');return(await request('/disputes')).body}},subscriptions:{retrieve:async subscription=>{assert.equal(subscription,'sub_local');return(await request('/subscription')).body}}},
   reconcile:async()=>(await request(mode==='success'?'/status':'/reset')).body,
   checkpoint:async()=>({publicState:(await request('/status')).body}),
   recognitionDiagnostic:()=>{getterCalls++;if(mode==='getter_failure')throw privateError;return structuredClone(cached)},
   close:async()=>{closed=true},
  }
  ctx.journal.fixtures=[ctx.fixture];ctx.save=async()=>writeFile(ctx.privatePath,JSON.stringify(ctx.journal),{mode:0o600})
  await ctx.save()
  const result=await executeStage(profile,{openContext:async()=>ctx})
  assert.equal(getterCalls,1);assert.equal(closed,true)
  if(mode==='success'){assert.equal(result.ok,true);assert.equal(result.phase,'complete');assert(ctx.fixture.d3.completed.dispute)}
  else{assert.equal(result.ok,false);assert.equal(result.error.request.cause.cause.code,'UND_ERR_SOCKET');assert(!ctx.fixture.d3.completed.dispute)}
  if(mode==='getter_failure')assert.deepEqual(result.recognitionDiagnostic,{ok:false,reason:'cached_diagnostic_unavailable',errorType:'unknown'})
  else assert.deepEqual(result.recognitionDiagnostic,cached)
  assert(!(await readFile(result.evidence,'utf8')).includes(sentinel))
  checks.push({case:`cached_recognition_${mode}`,passed:true,evidence:result.evidence,getterCalls})
 }
 }
 report.ok=true
}catch(error){
 report.failure={code:'transport_acceptance_failed',cause:fixtureErrorDetails(error)}
 process.exitCode=1
}finally{
 if(previousEnvironment.window===undefined)delete process.env.D3_BILLING_WINDOW;else process.env.D3_BILLING_WINDOW=previousEnvironment.window
 if(previousEnvironment.lease===undefined)delete process.env.D3_BILLING_LEASE;else process.env.D3_BILLING_LEASE=previousEnvironment.lease
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
 report.finishedAt=new Date().toISOString()
 const path=resolve(directory,'report.json');await writeFile(path,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'})
 await writeFile(resolve('output/tests/billing/desktop/d3-local',reportsOnly?'transport-reports-result.json':scopeRecoveryOnly?'transport-scope-recovery-result.json':'transport-result.json'),JSON.stringify({...report,evidence:path},null,2)+'\n',{mode:0o600})
 process.exitCode=report.ok?0:1
 console.log(JSON.stringify({ok:report.ok,checks:checks.length,evidence:path}))
}
