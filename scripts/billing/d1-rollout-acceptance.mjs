/**
 * [INPUT]: Coordinator-authorized exclusive development window and reviewed D1 SQL evidence.
 * [OUTPUT]: Ordered rollout, actual SDK receipts and persistent pre-cutover Realtime drain observation.
 * [POS]: D1 acceptance orchestration. No production, model, provider mutation or budget allocation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {client,developmentRef,developmentUrl} from '../hosted-ai/client.mjs'
import {d1Migrations,sameMigrations} from './d1-schema.mjs'

assert(process.argv[2]==='--run','Use --run only in the assigned exclusive development window')
const directory='output/tests/billing/desktop/d1-backend',db=await client()
await mkdir(directory,{recursive:true})
const report={ok:false,project:developmentRef,stages:[],legacyLivePending:true,
 scope:'Authorized development rollout and real synthetic SDK acceptance; no model or live payment; legacy drain separately bounded'}
const save=()=>writeFile(`${directory}/rollout.json`,JSON.stringify(report,null,2)+'\n')
const state=async()=>{
 const rows=await db.query(`select jsonb_build_object('budget',(select jsonb_agg(to_jsonb(b) order by id) from public.ai_budget b),
  'fees',(select md5(coalesce(string_agg(user_id::text||':'||action_id::text||':'||charged_micro::text||':'||confirmed::text,',' order by user_id,action_id),'')) from public.ai_actions),
  'protections',(select coalesce(jsonb_agg(to_jsonb(p) order by user_id),'[]') from public.ai_protection p)) as state`)
 return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}
const before=await state()
report.aiBeforeFingerprint=before
const secretValues=[]
const redact=value=>secretValues.reduce((text,secret)=>text.replaceAll(secret,'[redacted]'),String(value))
 .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted-jwt]')
 .replace(/([?&](?:token|signature|sig)=)[^&\s"']+/gi,'$1[redacted]')
async function run(name,args,env={}){
 const startedAt=new Date().toISOString(),chunks=[]
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']})
  child.stdout.on('data',chunk=>chunks.push(chunk));child.stderr.on('data',chunk=>chunks.push(chunk))
  child.on('error',reject);child.on('exit',resolve)
 })
 const output=redact(Buffer.concat(chunks).toString()),path=`${directory}/${name}.txt`
 await writeFile(path,output)
 report.stages.push({name,code,startedAt,finishedAt:new Date().toISOString(),evidence:path});await save()
 assert.equal(code,0,`${name} failed; inspect its redacted evidence`)
 console.log(JSON.stringify({stage:name,ok:true,evidence:path}))
}
let legacy
try{
 const migrations=await d1Migrations(db),evidence=JSON.parse(await readFile(`${directory}/sql-acceptance.json`,'utf8'))
 assert(evidence.ok&&sameMigrations(evidence,migrations),'Current successful rollback SQL evidence required')
 assert(migrations.every(x=>!x.installed),'Initial rollout requires pre-D1 development schema')
 await writeFile(`${directory}/preflight.json`,JSON.stringify({project:developmentRef,at:new Date().toISOString(),aiFingerprint:before,
  configuration:await db.query("select 'billing_policy' as kind,to_jsonb(p) as value from public.billing_policy p where environment='development' union all select 'source',to_jsonb(s) from public.billing_sources s where environment='development'"),
  functions:(await db.request('/functions')).filter(x=>['billing','hosted-ai','snapshot-url'].includes(x.slug)).map(({slug,version,status,verify_jwt})=>({slug,version,status,verify_jwt})),
  worker:await db.query("select jobid,active,schedule from cron.job where jobname='goalloom-billing-worker-development'")},null,2)+'\n')
 await run('legacy-prepare',['scripts/billing/d1-transport-acceptance.mjs','--prepare-legacy'])
 const {startLegacyConnection}=await import('./d1-transport-acceptance.mjs')
 legacy=await startLegacyConnection({onReady:async metadata=>{report.legacyConnection={...metadata,openedBeforeMigration:true};await save()}})
 for(const stage of ['schema','edges','activate'])await run(`deploy-${stage}`,['scripts/billing/d1-deploy-development.mjs',`--${stage}`])
 report.cutover=await legacy.verifyAfterDeployment({phase:'cutover'});await save()
 await run('concurrency',['scripts/billing/d1-concurrency.mjs'])
 const keys=await db.request('/api-keys?reveal=true'),anon=keys.find(x=>x.name==='anon')?.api_key,service=keys.find(x=>x.name==='service_role')?.api_key
 assert(anon&&service,'Development fixture keys unavailable');secretValues.push(anon,service)
 await run('phase0',['scripts/phase0-prototype.mjs'],{SUPABASE_URL:developmentUrl,SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service})
 await run('transport',['scripts/billing/d1-transport-acceptance.mjs','--verify'])
 assert.equal(await state(),before,'AI accounting/configuration changed during D1 acceptance')
 report.aiUnchanged=true;report.ok=true;report.sensitiveStagesCompleteAt=new Date().toISOString();await save()
 console.log(JSON.stringify({ok:true,sensitiveStagesComplete:true,legacyDrainPending:true,evidence:`${directory}/rollout.json`}))
 while(report.legacyLivePending){
  const result=await legacy.verifyAfterDeployment({phase:'jwt-expiry'})
  report.legacyJwt=result
  if(result.pending===false){report.legacyLivePending=false;await save();break}
  await save();await new Promise(resolve=>setTimeout(resolve,30000))
 }
}catch(error){report.ok=false;report.error={type:error.name,message:error.name==='AssertionError'?error.message:'d1_rollout_incomplete'};process.exitCode=1}
finally{await legacy?.close();await save()}
