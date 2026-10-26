/**
 * [INPUT]: Exact local installation plan, closed production metadata and explicit reviewed negative-probe plan.
 * [OUTPUT]: Finite gateway/handler rejection evidence and original protected-state readback.
 * [POS]: Twelve bounded denial probes only. No valid callback/worker/user mutation, provider/model request or activation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {readFile} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {randomUUID} from 'node:crypto'
import {REF,URL as ORIGIN,MODES,hash,json,closedSql,preservationSql} from '../source.mjs'
import {directory,save,readJson,BASE} from '../io.mjs'
import {load} from '../run.mjs'
const ownPath=new URL(import.meta.url).pathname
const manual='authentication_failed'
export const CASES=[
 {name:'billing_missing_auth',path:'billing',method:'GET',status:401,code:manual},
 {name:'billing_forged_auth',path:'billing',method:'GET',auth:'forged',status:401,code:manual},
 {name:'billing_wrong_worker',path:'billing/worker',method:'POST',auth:'wrong_worker',status:401,code:manual},
 {name:'stripe_invalid_signature',path:'billing/stripe',method:'POST',signature:'stripe-signature',status:401,code:'signature_invalid'},
 {name:'revenuecat_invalid_signature',path:'billing/revenuecat',method:'POST',signature:'x-revenuecat-webhook-signature',status:401,code:'signature_invalid'},
 {name:'lifecycle_missing_auth',path:'lifecycle/status',method:'POST',status:401,code:manual},
 {name:'lifecycle_forged_auth',path:'lifecycle/status',method:'POST',auth:'forged',status:401,code:manual},
 {name:'lifecycle_wrong_worker',path:'lifecycle/worker',method:'POST',auth:'wrong_worker',status:401,code:manual},
 {name:'receipt_missing_authority',path:'deletion-receipt',method:'POST',status:404,code:'deletion_receipt_unavailable'},
 {name:'snapshot_gateway_missing_auth',path:'snapshot-url',method:'GET',status:401},
 {name:'ai_gateway_missing_auth',path:'hosted-ai',method:'POST',status:401},
 {name:'retrieval_gateway_missing_auth',path:'retained-retrieval/bootstrap',method:'POST',version:'2',status:401},
]
const safeCodes=new Set(['authentication_failed','signature_invalid','deletion_receipt_unavailable','billing_configuration','retrieval_configuration','lifecycle_unavailable','invalid_request','upgrade_required'])
const emptySql=`select not exists(select 1 from public.billing_inbox where environment='production' and status in ('pending','processing'))
 and not exists(select 1 from public.billing_accounts where environment='production' and (lease_until>clock_timestamp() or reconcile_at<=clock_timestamp()))
 and not exists(select 1 from service_private.deletion_outbox where environment='production' and acknowledged_at is null)
 and not exists(select 1 from service_private.workspace_lifecycle where environment='production' and state<>'deleted' and boundary_verified and next_due_at<=clock_timestamp())
 and not exists(select 1 from service_private.account_lifecycle where environment='production' and state in ('deleting','deleted')) as empty;`
const sourceHash=async()=>hash(await readFile(ownPath))
export async function prepareGateway(path){
 const installation=await directory(path),loaded=await load(installation)
 const plan={version:1,kind:'goalloom-production-gateway-negative-checks',project:REF,id:randomUUID(),installation,installationPlanSha256:loaded.plan.sha256,sourceSha256:await sourceHash(),cases:CASES,validCredentialsUsed:false,businessMutations:0,sourceActivation:false}
 plan.sha256=hash(json(plan));const file=resolve(BASE,`gateway-plan-${plan.id}.json`);await save(file,plan)
 return{ok:true,mode:'plan',path:file,reviewedHash:plan.sha256,cases:CASES.length,credentialReads:0,networkRequests:0}
}
async function probe(test,signal){
 const headers={...(test.method==='POST'?{'content-type':'application/json'}:{}),...(test.version?{'x-goalloom-service-version':test.version}:{})}
 if(test.auth==='wrong_worker')headers.authorization='Bearer invalid-production-probe-credential'
 if(test.auth==='forged'){
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
  headers.authorization=`Bearer ${encode({alg:'HS256',typ:'JWT'})}.${encode({iss:ORIGIN+'/auth/v1',role:'authenticated',sub:'93320000-0000-4000-8000-000000000001',session_id:'93320000-0000-4000-8000-000000000002',exp:Math.floor(Date.now()/1000)+300})}.invalid-signature`
 }
 if(test.signature)headers[test.signature]='t=0,v1='+'0'.repeat(64)
 const started=Date.now()
 try{
  const response=await fetch(`${ORIGIN}/functions/v1/${test.path}`,{method:test.method,headers,...(test.method==='POST'?{body:'{}'}:{}),redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])})
  const chunks=[];let size=0
  if(response.body)for await(const chunk of response.body){size+=chunk.length;if(size>4096)throw Error('response_limit');chunks.push(chunk)}
  let payload;try{payload=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{payload=null}
  const code=safeCodes.has(payload?.error)?payload.error:null,requestId=response.headers.get('sb-request-id')
  return{name:test.name,ok:response.status===test.status&&(!test.code||code===test.code),status:response.status,code,elapsedMs:Date.now()-started,requestId:/^[a-f0-9-]{32,36}$/.test(requestId??'')?requestId:null}
 }catch(error){return{name:test.name,ok:false,error:error.message==='response_limit'?'response_limit':'transport_failed',elapsedMs:Date.now()-started}}
}
export async function runGateway(planPath,expected){
 if(dirname(resolve(planPath))!==BASE||!/^gateway-plan-[a-f0-9-]{36}\.json$/.test(resolve(planPath).split('/').at(-1))||!/^[a-f0-9]{64}$/.test(expected??''))throw Error('reviewed_gateway_required')
 const plan=await readJson(resolve(planPath)),{sha256,...body}=plan
 if(plan.project!==REF||plan.kind!=='goalloom-production-gateway-negative-checks'||hash(json(body))!==sha256||sha256!==expected||plan.sourceSha256!==await sourceHash()||json(plan.cases)!==json(CASES))throw Error('gateway_plan_changed')
 const loaded=await load(await directory(plan.installation));if(loaded.plan.sha256!==plan.installationPlanSha256)throw Error('gateway_plan_changed')
 const {client}=await import('../client.mjs'),db=await client(),report={ok:false,mode:'run',project:REF,planSha256:sha256,checks:[],businessMutations:0,sourceActivation:false,modelCalls:0,providerCalls:0,sourceReadbackByThisCommand:false}
 const output=resolve(BASE,`gateway-result-${randomUUID()}.json`)
 try{
  const project=await db.request('');if(project.id!==REF||project.status!=='ACTIVE_HEALTHY')throw Error('production_identity')
  if((await db.query(closedSql))[0]?.closed!==true)throw Error('readiness_not_closed')
  if((await db.query(emptySql))[0]?.empty!==true)throw Error('gateway_work_not_empty')
  const history=await db.query('select version,sha256 from service_private.migrations order by version;')
  if(json(history)!==json(loaded.source.migrations.slice(13).map(m=>({version:m.version,sha256:m.sha256}))))throw Error('migration_history_changed')
  const edges=await db.request('/functions')
  if(!MODES.every(([slug,jwt])=>edges.some(e=>e.slug===slug&&e.status==='ACTIVE'&&e.verify_jwt===jwt)))throw Error('gateway_metadata_changed')
  const before=(await db.query(preservationSql(true)))[0].protected
  const signal=AbortSignal.timeout(45000)
  for(const test of CASES)report.checks.push(await probe(test,signal))
  const after=(await db.query(preservationSql(true)))[0].protected
  report.protectedStateMatched=json(before)===json(after);report.stillClosed=(await db.query(closedSql))[0]?.closed===true
  report.workStillEmpty=(await db.query(emptySql))[0]?.empty===true
  report.sourceStillMatched=(await load(plan.installation)).plan.sha256===plan.installationPlanSha256
  report.ok=report.checks.every(c=>c.ok)&&report.protectedStateMatched&&report.stillClosed&&report.workStillEmpty&&report.sourceStillMatched
 }catch(error){report.error=['production_identity','readiness_not_closed','gateway_work_not_empty','migration_history_changed','gateway_metadata_changed','source_changed'].includes(error.message)?error.message:'gateway_acceptance_incomplete'}
 await save(output,report)
 return{ok:report.ok,mode:'run',path:output,checks:report.checks.length,passed:report.checks.filter(c=>c.ok).length,protectedStateMatched:report.protectedStateMatched??false,businessMutations:0,sourceActivation:false,modelCalls:0,providerCalls:0}
}
if(process.argv[1]===ownPath){
 try{
  const args=process.argv.slice(2);let result
  if(!args.length||args.length===1&&args[0]==='--help'){console.log('Limited production gateway checks: --plan <installation-directory> | --run <gateway-plan.json> --reviewed <hash>. Negative probes only; no deploy, valid worker, callbacks or activation.');process.exit(0)}
  if(args.length===2&&args[0]==='--plan')result=await prepareGateway(args[1])
  else if(args.length===4&&args[0]==='--run'&&args[2]==='--reviewed')result=await runGateway(args[1],args[3])
  else throw Error('invalid_arguments')
  console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1
 }catch(error){const code=['invalid_arguments','reviewed_gateway_required','gateway_plan_changed','source_changed','plan_changed','invalid_evidence_directory'].includes(error.message)?error.message:'gateway_preflight_failed';console.log(JSON.stringify({ok:false,code,businessMutations:0,sourceActivation:false}));process.exitCode=1}
}
