/**
 * [INPUT]: Existing development synthetic session, accepted source and one new diagnostic run name.
 * [OUTPUT]: Metadata-only upstream shape facts, costs and verified temporary-worker removal.
 * [POS]: One bounded admitted diagnostic; sent identities are never POSTed again.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile,writeFile,stat} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {build} from 'esbuild'
import {client,readFetch} from './client.mjs'
import {actionId} from './content-minimization/identity.mjs'
import {inputs} from './content-minimization/fixtures.mjs'
import {metadataOnly} from './content-minimization/scan.mjs'
import {eszipOriginalSource} from '../deploy/edge-source.mjs'
import {sha256} from '../deploy/schema.mjs'
const [run]=process.argv.slice(2)
assert(process.argv.length===3 && /^[a-z0-9-]{1,40}$/.test(run),'Use one new diagnostic run name')
const file=`output/tests/hosted-ai/content-minimization/rewrite-check-${run}.json`,slug='hosted-ai-rewrite-check'
try{await stat(file);throw Error('Existing diagnostic must not be replayed')}catch(e){if(e.code!=='ENOENT')throw e}
const db=await client(),env=parseEnv(await readFile('.env.hosted-ai-session.local','utf8'))
assert(env.SUPABASE_PROJECT_REF==='asqyvcnxdltzzfutbbqy' && /^[a-f0-9-]{36}$/.test(env.HOSTED_AI_SYNTHETIC_USER_ID),'Exact synthetic development session required')
const id=actionId(),owner=env.HOSTED_AI_SYNTHETIC_USER_ID
const bundle=await build({entryPoints:['scripts/hosted-ai/content-minimization/rewrite-check-runtime.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022',external:['node:*'],logLevel:'silent',define:{__OWNER__:JSON.stringify(owner),__ACTION__:JSON.stringify(id)}})
const source=bundle.outputFiles[0].text,hash=sha256(source),projectUrl=`https://${env.SUPABASE_PROJECT_REF}.supabase.co`
const report={ok:false,project:env.SUPABASE_PROJECT_REF,actionId:id,sourceSha256:hash,stage:'prepared',at:new Date().toISOString(),realProviderCalls:0,capabilityAcceptance:false}
await writeFile(file,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
let submitted=false
try {
  const budget=(await db.query("select limit_micro,spent_micro,policy from public.ai_budget where id='integration-shared';"))[0]
  assert(budget.policy==='authenticated' && budget.limit_micro-budget.spent_micro>=500000,'Existing enabled reservation required')
  assert(!(await db.request('/functions')).some(f=>f.slug===slug),'Inspect existing diagnostic worker')
  const form=new FormData();form.set('metadata',JSON.stringify({name:slug,entrypoint_path:'index.ts',verify_jwt:true}));form.append('file',new Blob([source],{type:'application/typescript'}),'index.ts')
  submitted=true;await db.request(`/functions/deploy?slug=${slug}`,{method:'POST',form})
  const bytes=await db.request(`/functions/${slug}/body`,{binary:true});assert(sha256(bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8'))===hash,'Diagnostic source mismatch')
  const identity=await readFetch(`${projectUrl}/auth/v1/user`,{headers:{authorization:`Bearer ${env.HOSTED_AI_SESSION_TOKEN}`,apikey:env.SUPABASE_ANON_KEY},signal:AbortSignal.timeout(15000),redirect:'error'})
  const user=await identity.json();assert(identity.ok && user.id===owner && user.app_metadata?.hosted_acceptance_fixture==='v1','Synthetic identity preflight failed')
  const marker=`synthetic-${randomUUID()}`;inputs.assistance.context.item.description+=`\nSynthetic context: ${marker}`
  report.stage='sent';await writeFile(file,JSON.stringify(report,null,2)+'\n',{mode:0o600})
  const response=await fetch(`${projectUrl}/functions/v1/${slug}`,{method:'POST',headers:{authorization:`Bearer ${env.HOSTED_AI_SESSION_TOKEN}`,apikey:env.SUPABASE_ANON_KEY,'content-type':'application/json'},body:JSON.stringify({version:2,consentScopeVersion:3,actionId:id,request:{capability:'assistance',input:inputs.assistance}}),signal:AbortSignal.timeout(45000),redirect:'error'})
  const result=await response.json()
  assert(response.ok && typeof result.ready==='boolean' && typeof result.facts?.upstreamObserved==='boolean','No finite diagnostic response')
  const fields=new Set('upstreamObserved upstreamOk envelopeBounded envelopeObject providerCorrect choicesCount finishReason contentString contentLength jsonValid resultObject kind descriptionString unexpectedFieldCount schemaValid anchorsRetained envelopeValid httpStatus errorMentionsReasoning errorMentionsFormat errorMentionsAuth errorMentionsBudget errorMentionsRate errorMentionsRoute errorMentionsUnsupported errorMentionsPolicy errorMentionsRegion errorCode'.split(' '))
  assert(Object.entries(result.facts).every(([k,v])=>fields.has(k) && (typeof v==='boolean'||Number.isSafeInteger(v)&&v>=0&&v<=262144||['stop','length','content_filter','tool_calls','error','other','rewrite','clarify','proposal'].includes(v))),'Unknown diagnostic field')
  assert(Number.isInteger(result.httpStatus) && result.httpStatus>=200 && result.httpStatus<=599 && [null,'malformed_response','provider_failed','outcome_pending','result_not_delivered','permission_denied','routing_policy'].includes(result.failure),'Unknown diagnostic status')
  report.result=result;report.stage='diagnosed';report.ok=true
}catch(e){report.error='rewrite_diagnostic_incomplete';report.networkCode=['UND_ERR_SOCKET','ECONNRESET','ETIMEDOUT'].includes(e.cause?.code)?e.cause.code:null;process.exitCode=1}
finally {
 try{const rows=await db.query(`select * from public.ai_actions where user_id='${owner}' and action_id='${id}';`);assert(metadataOnly(rows),'Non-metadata persistence');report.fullPersistencePayloadsMetadataOnly=true;report.receipts=rows.map(({action_id,status,model,provider_request_id,input_tokens,output_tokens,charged_micro,confirmed})=>({action_id,status,model,provider_request_id,input_tokens,output_tokens,charged_micro,confirmed}));report.realProviderCalls=rows.length}catch{report.accountingUnverified=true;report.ok=false;process.exitCode=1}
 if(submitted)try{const bytes=await db.request(`/functions/${slug}/body`,{binary:true});assert(sha256(bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8'))===hash);await db.request(`/functions/${slug}`,{method:'DELETE'});report.temporaryWorkerRemoved=!(await db.request('/functions')).some(f=>f.slug===slug)}catch{report.temporaryWorkerRemoved=false}
 if(submitted&&!report.temporaryWorkerRemoved){report.ok=false;process.exitCode=1}
 await writeFile(file,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report,null,2))
}
