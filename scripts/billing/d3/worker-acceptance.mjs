/**
 * [INPUT]: Bundled billing endpoint and controlled SQL/provider transports over loopback HTTP.
 * [OUTPUT]: Repeatable authentication, scope denial and concurrency evidence without external calls.
 * [POS]: D3 worker composition acceptance; does not establish deployed SQL or provider acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {bundle} from '../build.mjs'
import {config} from '../d1-http-fixtures.mjs'

const directory='output/tests/billing/desktop/d3-local'
await mkdir(directory,{recursive:true})
const checks=[],report={ok:false,scope:'Bundled endpoint through real loopback HTTP; controlled SQL and providers only.',realExternalCalls:0,checks,runtime:{node:process.version,os:process.platform,arch:process.arch}}
let server
try{
 const file=`${process.cwd()}/${directory}/endpoint-runtime.mjs`
 await writeFile(file,await bundle('supabase/functions/billing/endpoint.ts'))
 const {createBillingEndpoint}=await import(pathToFileURL(file).href)
 const cfg=config(),scopes=Array.from({length:7},()=>`${randomUUID()}.${'a'.repeat(64)}`),calls=[]
 let providerCalls=0,claims=0,guardCalls=0,workMode=false,voidMode=204
 const subject=randomUUID(),owner=randomUUID()
 const providers={verifyConfiguration:async()=>{providerCalls++}}
 const http=async(url,init)=>{
  assert(String(url).startsWith(`${cfg.url}/rest/v1/rpc/`),'Unexpected transport destination')
  const name=String(url).split('/').at(-1),scope=init.headers['x-goalloom-lifecycle-scope'],args=JSON.parse(init.body)
  calls.push({name,scope,args})
  if(name==='lifecycle_scope_check'){
   guardCalls++
   if(args.p_owner===subject||args.p_subject&&args.p_subject!==subject)return Response.json({message:'worker_scope_denied'},{status:403})
   if([scopes[2],scopes[3],scopes[4]].includes(scope))return Response.json({message:scope===scopes[4]?'worker_scope_denied':'worker_scope_invalid'},{status:400})
   if(scope===scopes[5])return Response.json({ok:true,scoped:false})
   if(scope===scopes[6]&&calls.filter(x=>x.scope===scope).length>1)return Response.json({message:'worker_scope_invalid'},{status:400})
   // Interleave the initial guards to expose shared mutable scope state.
   if(scope===scopes[0])await new Promise(resolve=>setTimeout(resolve,20))
   return Response.json({ok:true,scoped:true})
  }
  if(name==='billing_source')return Response.json({account_id:cfg.account,rc_project:cfg.rcProject,rc_app:cfg.rcApp,monthly_price:cfg.prices.monthly,annual_price:cfg.prices.annual})
  if(name==='billing_take_work'){claims++;return Response.json(workMode?{events:[{provider:'revenuecat',event_id:randomUUID(),event_type:'INITIAL_PURCHASE',object_id:null,subject_id:subject,lease:randomUUID()}],accounts:[]}:{events:[],accounts:[]})}
  if(name==='lifecycle_identity'){assert.equal(args.p_owner,subject);assert.equal(args.p_create,false);return Response.json({subjectId:subject,mode:'active',providerUserId:owner,revision:1})}
  if(name==='billing_lock')return Response.json({lease:randomUUID(),customer:null,mode:'active',providerUserId:owner,operations:[]})
  if(name==='billing_status')return Response.json({version:1,status:'none',eligible:false,serverNow:new Date().toISOString(),subscriptions:[]})
  if(['billing_unlock','billing_finish_work'].includes(name))return new Response(voidMode==='malformed'?'invalid-json':null,{status:typeof voidMode==='number'?voidMode:200})
  throw Error(`Unexpected controlled RPC ${name}`)
 }
 const endpoint=createBillingEndpoint(cfg,{fetch:http,providers})
 server=createServer(async(req,res)=>{
  try{const response=await endpoint(new Request(`http://127.0.0.1${req.url}`,{method:req.method,headers:req.headers}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text())}
  catch{res.writeHead(500);res.end('{}')}
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const base=`http://127.0.0.1:${server.address().port}`
 const call=async(scope,authorization=`Bearer ${cfg.workerSecret}`,path='/billing/worker',method='POST')=>{
  const response=await fetch(base+path,{method,headers:{...(authorization?{authorization}:{}),...(scope!==undefined?{'x-goalloom-lifecycle-scope':scope}:{})}})
  return {status:response.status,body:await response.json()}
 }
 for(const auth of [null,'Bearer incorrect'])assert.equal((await call(scopes[0],auth)).status,401)
 assert.equal(calls.length,0);assert.equal(providerCalls,0)
 checks.push('Authentication precedes scope, RPC and provider access')
 for(const scope of [undefined,'',randomUUID(),`${randomUUID()}.${'a'.repeat(65)}`,'x'.repeat(4096)])assert.equal((await call(scope)).status,503)
 assert.equal(calls.length,0);assert.equal(providerCalls,0)
 checks.push('Missing, malformed and overlong scope fail before RPC')
 for(const scope of scopes.slice(2,6))assert([403,503].includes((await call(scope)).status))
 assert.equal(claims,0);assert.equal(providerCalls,0)
 checks.push('Expired, wrong-project, foreign-target and unscoped SQL replies deny before claims/providers')
 for(const path of ['/worker','/billing/worker/','/other/billing/worker'])assert.equal((await call(scopes[0],undefined,path)).status,404)
 assert.equal((await call(scopes[0],undefined,'/billing/worker','GET')).status,401)
 assert.equal(claims,0);assert.equal(providerCalls,0)
 checks.push('Only canonical POST worker paths enter scoped dispatch')
 const before=calls.length
 const concurrent=await Promise.all([call(scopes[0]),call(scopes[1],undefined,'/functions/v1/billing/worker')])
 assert.deepEqual(concurrent.map(x=>x.status),[200,200]);assert.equal(claims,2)
 for(const scope of scopes.slice(0,2)){
  const own=calls.slice(before).filter(x=>x.scope===scope)
  assert(own.some(x=>x.name==='billing_take_work'));assert(own.filter(x=>x.name==='lifecycle_scope_check').length>=3)
 }
 assert(calls.slice(before).every(x=>scopes.slice(0,2).includes(x.scope)))
 checks.push('Concurrent worker requests retain independent scope through every RPC')
 workMode=true
 for(voidMode of [204,200]){
  const owned=await call(scopes[1]);assert.equal(owned.status,200);assert.equal(owned.body.complete,1);assert.equal(owned.body.retry,0)
 }
 for(voidMode of [503,'malformed'])assert.notEqual((await call(scopes[1])).status,200)
 assert(calls.some(row=>row.name==='lifecycle_scope_check'&&row.args.p_subject===subject))
 assert(calls.some(row=>row.name==='billing_unlock')&&calls.some(row=>row.name==='billing_finish_work'))
 checks.push('Subject identity is resolved and guarded; successful void204/empty200 acknowledgements pass, empty503 and malformed JSON fail')
 workMode=false
 const priorClaims=claims,priorProviders=providerCalls
 assert.equal((await call(scopes[6])).status,503)
 assert.equal(claims,priorClaims);assert.equal(providerCalls,priorProviders)
 checks.push('Scope expiry after admission prevents subsequent billing RPC/provider effects')
 const beforeOrdinary=guardCalls
 const ordinary=await call(scopes[0],null,'/billing','GET');assert.equal(ordinary.status,401);assert.equal(guardCalls,beforeOrdinary)
 const production={...cfg,environment:'production',url:'https://keqprrgvcefqdwnxaafv.supabase.co',stripeKey:'rk_live_controlled'}
 const productionHandler=createBillingEndpoint(production,{fetch:async(url,init)=>{
  assert(!Object.hasOwn(init.headers,'x-goalloom-lifecycle-scope'))
  return Response.json(String(url).endsWith('/billing_take_work')?{events:[],accounts:[]}:{account_id:cfg.account,rc_project:cfg.rcProject,rc_app:cfg.rcApp,monthly_price:cfg.prices.monthly,annual_price:cfg.prices.annual})
 },providers})
 const productionResponse=await productionHandler(new Request('http://localhost/billing/worker',{method:'POST',headers:{authorization:`Bearer ${cfg.workerSecret}`,'x-goalloom-lifecycle-scope':scopes[0]}}))
 assert.equal(productionResponse.status,200);assert.equal(guardCalls,beforeOrdinary)
 checks.push('Ordinary and production requests keep existing composition without injected scope')
 report.ok=true
}catch(error){report.error={name:error.name,message:error.message};process.exitCode=1}
finally{if(server)await new Promise(resolve=>server.close(resolve));await writeFile(`${directory}/worker-result.json`,JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify(report,null,2))
