/**
 * [INPUT]: Explicit environment, synthetic saved runs/private session and existing API-key/deployment access.
 * [OUTPUT]: Independent provider receipt metadata and verified removal of a source-matched temporary worker.
 * [POS]: Manual read-only fee verification. Provider key stays server-side; no inference endpoint or budget mutation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {build} from 'esbuild'
import {client,readFetch} from './client.mjs'
import {acceptanceTarget} from './acceptance-target.mjs'
import {eszipOriginalSource} from '../deploy/edge-source.mjs'
import {sha256} from '../deploy/schema.mjs'

const {args,environment,projectRef,projectUrl,config,sessionFile,prefix}=acceptanceTarget()
const allFixture=args.length===1 && args[0]==='--fixture'
assert(process.argv.includes('--environment') && (allFixture || args.length>0 && args.length<=6 && args.every(v=>/^[a-z0-9-]{1,48}$/.test(v))),'Use <saved-runs...>|--fixture --environment')
const db=await client(config,environment),env=parseEnv(await readFile(sessionFile,'utf8'))
assert(env.SUPABASE_PROJECT_REF===projectRef && /^[a-f0-9-]{36}$/.test(env.HOSTED_AI_SYNTHETIC_USER_ID),'Exact synthetic session required')
const actions=[]
if(allFixture) {
  const keys=await db.request('/api-keys?reveal=true'),anon=keys.find(k=>k.name==='anon')?.api_key
  assert(anon,'Auth key required for synthetic owner verification')
  const response=await readFetch(`${projectUrl}/auth/v1/user`,{headers:{authorization:`Bearer ${env.HOSTED_AI_SESSION_TOKEN}`,apikey:anon},signal:AbortSignal.timeout(15000),redirect:'error'})
  const user=await response.json()
  assert(response.ok && user.id===env.HOSTED_AI_SYNTHETIC_USER_ID && user.app_metadata?.hosted_acceptance_fixture==='v1','Marked synthetic owner required')
  const rows=await db.query(`select action_id from public.ai_actions where user_id='${user.id}' order by created_at;`)
  assert(rows.length>0 && rows.length<=32,'Bounded synthetic receipt set required')
  actions.push(...rows.map(r=>({actionId:r.action_id,stage:'sent'})))
}
for(const run of allFixture?[]:args){const r=JSON.parse(await readFile(`output/tests/hosted-ai/${prefix}live-${run}.json`,'utf8'));assert(r.project===projectRef && r.owner===sha256(env.HOSTED_AI_SYNTHETIC_USER_ID),'Saved run owner/project differs');actions.push(...r.actions)}
const ids=[...new Set(actions.filter(a=>a.stage!=='planned').map(a=>a.actionId))]
assert(ids.every(id=>/^[a-f0-9-]{36}$/.test(id)),'Invalid action allowlist')
const file=`output/tests/hosted-ai/content-minimization/${prefix}provider-receipts.json`,slug='hosted-ai-receipt-check'
const bundle=await build({entryPoints:['scripts/hosted-ai/content-minimization/provider-receipt-runtime.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022',logLevel:'silent',define:{__OWNER__:JSON.stringify(env.HOSTED_AI_SYNTHETIC_USER_ID),__ACTIONS__:JSON.stringify(ids),__ENVIRONMENT__:JSON.stringify(environment)}})
const source=bundle.outputFiles[0].text,hash=sha256(source),report={ok:false,environment,project:projectRef,at:new Date().toISOString(),sourceSha256:hash,realNewProviderCalls:0,actionIds:ids}
let submitted=false
try {
  assert(!(await db.request('/functions')).some(f=>f.slug===slug),'Temporary receipt worker already exists; inspect its owner/source')
  const keys=await db.request('/api-keys?reveal=true'),service=keys.find(k=>k.name==='service_role')?.api_key,anon=keys.find(k=>k.name==='anon')?.api_key
  assert(service && anon,'Project API-key access required')
  const auth=await readFetch(`${projectUrl}/auth/v1/user`,{headers:{authorization:`Bearer ${env.HOSTED_AI_SESSION_TOKEN}`,apikey:anon},signal:AbortSignal.timeout(15000),redirect:'error'})
  const user=await auth.json();assert(auth.ok && user.id===env.HOSTED_AI_SYNTHETIC_USER_ID && user.app_metadata?.hosted_acceptance_fixture==='v1','Synthetic owner verification failed')
  await writeFile(file,JSON.stringify(report,null,2)+'\n',{mode:0o600})
  const form=new FormData();form.set('metadata',JSON.stringify({name:slug,entrypoint_path:'index.ts',verify_jwt:true}));form.append('file',new Blob([source],{type:'application/typescript'}),'index.ts')
  submitted=true;await db.request(`/functions/deploy?slug=${slug}`,{method:'POST',form})
  const metadata=await db.request(`/functions/${slug}`);assert(metadata.verify_jwt && metadata.status==='ACTIVE','Receipt worker unavailable')
  const response=await readFetch(`${projectUrl}/functions/v1/${slug}`,{headers:{authorization:`Bearer ${service}`,apikey:anon},signal:AbortSignal.timeout(45000),redirect:'error'})
  const result=await response.json();assert(response.ok && Array.isArray(result.receipts),'Receipt request unavailable')
  report.receipts=result.receipts;report.allRequestedFeesMatched=ids.every(id=>report.receipts.some(row=>row.actionId===id && row.verified));report.ok=true
}catch(e){report.error='provider_receipt_check_incomplete';report.transportStatus=e.message.match(/HTTP \d{3}/)?.[0]??null;process.exitCode=1}
finally {
  if(submitted)try{
    const bytes=await db.request(`/functions/${slug}/body`,{binary:true}),deployed=bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8')
    assert(sha256(deployed)===hash,'Temporary source differs; do not delete another worker')
    await db.request(`/functions/${slug}`,{method:'DELETE'})
    report.temporaryWorkerRemoved=!(await db.request('/functions')).some(f=>f.slug===slug)
  }catch{report.temporaryWorkerRemoved=false}
  if(submitted && !report.temporaryWorkerRemoved){report.ok=false;process.exitCode=1}
  await writeFile(file,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report,null,2))
}
