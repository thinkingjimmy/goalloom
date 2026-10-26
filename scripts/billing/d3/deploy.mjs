/**
 * [INPUT]: Current billing bundle, explicit D3 window and existing operator SQL READ ONLY inspections.
 * [OUTPUT]: Source-only deployment/readback or finite phase/cause evidence for original-outcome recovery.
 * [POS]: D3 deployment seam; never changes secrets, cron, readiness, budgets or production.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {bundle} from '../build.mjs'
import {requireWindow} from './cli.mjs'
import {fixtureErrorDetails} from '../../lifecycle/fixture-http.mjs'
const mode=process.argv[2]??'--plan',lease=process.argv[3]
const report={ok:false,mode,project:'asqyvcnxdltzzfutbbqy',remoteExecuted:false,sourceOnly:true}
try{
 assert(['--plan','--apply'].includes(mode),'Use --plan or --apply')
 if(mode==='--apply')requireWindow(lease)
 report.phase='bundle'
 const source=await bundle('supabase/functions/billing/index.ts'),sha=value=>createHash('sha256').update(value).digest('hex')
 report.sha256=sha(source)
 if(mode==='--apply'){
  const {client}=await import('../../hosted-ai/client.mjs'),{eszipOriginalSource}=await import('../../deploy/edge-source.mjs')
  const db=await client()
  const read=sql=>db.query(`begin read only;set local statement_timeout='15s';${sql};commit;`,false)
  const inspect=async()=>({
   cron:await read("select jobid,jobname,schedule,active,encode(sha256(convert_to(command,'UTF8')),'hex') command_sha256 from cron.job where jobname='goalloom-billing-worker-development' order by jobid"),
   budget:await read('select environment,policy,limit_micro,spent_micro,blocked from ai_budget order by id'),
   flags:await read("select (select to_jsonb(p) from service_private.policy p where id=1) service,(select to_jsonb(p) from public.billing_policy p where environment='development') billing,(select to_jsonb(p) from service_private.lifecycle_policy p where id=1) lifecycle"),
  })
  report.phase='inspect'
  const before=await inspect();assert(before.cron.every(row=>row.active===false),'Keep old unscoped development cron inactive')
  const form=new FormData();form.set('metadata',JSON.stringify({name:'billing',entrypoint_path:'index.ts',verify_jwt:false}));form.append('file',new Blob([source],{type:'application/typescript'}),'index.ts')
  report.remoteExecuted=true
  report.phase='deploy'
  await db.request('/functions/deploy?slug=billing',{method:'POST',form})
  report.phase='source_readback'
  const metadata=await db.request('/functions/billing');assert(metadata.status==='ACTIVE'&&metadata.verify_jwt===false)
  const downloaded=await db.request('/functions/billing/body',{binary:true})
  const original=downloaded.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(downloaded):downloaded.toString('utf8')
  assert.equal(sha(original),report.sha256,'Downloaded source differs')
  report.phase='state_readback';assert.deepEqual(await inspect(),before,'Source-only deployment changed unrelated development state')
  report.readback={sourceMatches:true,verifyJwt:false,active:true,cronPreserved:true,flagsPreserved:true,budgetsPreserved:true}
 }
 report.ok=true
 report.phase='complete'
}catch(error){const cause=fixtureErrorDetails(error);report.error={type:cause?.name??'unknown',code:'d3_source_deployment_incomplete',cause};process.exitCode=1}
const output=resolve('output/tests/billing/desktop/d3-local');await mkdir(output,{recursive:true})
const file=resolve(output,`deployment-${mode.slice(2)}-${randomUUID()}.json`);await writeFile(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({...report,evidence:file},null,2))
