/**
 * [INPUT]: Empty development fixture ownership, saved real source and explicit controlled HTTP runner.
 * [OUTPUT]: Short recorded development-only pause, worker HTTP acceptance and exact source/policy/job restoration.
 * [POS]: Acceptance orchestration after provider fixture cleanup; never touches personal accounts or production.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
import {client} from '../hosted-ai/client.mjs'
const db=await client(),file='output/tests/billing/desktop/controlled-window.json'
const quote=x=>`'${String(x).replaceAll("'","''")}'`
const report={ok:false,startedAt:new Date().toISOString(),scope:'Temporary development billing source/worker pause after all disposable provider ownership is removed; exact restoration in finally'}
let source,policy,job,paused=false
try{
 report.stage='read_empty_source'
 assert.equal(Number((await db.query('select count(*) as n from billing_accounts'))[0].n),0,'Clean disposable provider accounts first; never pause a populated source')
 const sources=await db.query('select * from billing_sources');assert.equal(sources.length,1);source=sources[0];assert.equal(source.environment,'development');assert.equal(source.rc_app,'appc06dd78ed3');assert.equal(source.account_id,'acct_1QvwdlITpGuR8ZMB')
 policy=(await db.query("select * from billing_policy where environment='development'"))[0]
 job=(await db.query("select jobid,active from cron.job where jobname='goalloom-billing-worker-development'"))[0];assert(job)
 report.saved={source,policy,job};await writeFile(file,JSON.stringify(report,null,2)+'\n')
 report.stage='pause';paused=true
 await db.query(`begin;update billing_policy set enabled=false where environment='development';select cron.alter_job(${job.jobid},active:=false);delete from billing_sources where environment='development' and rc_app='appc06dd78ed3';commit;`,false)
 report.stage='http_acceptance'
 execFileSync(process.execPath,['scripts/billing/http-acceptance.mjs'],{stdio:'inherit',timeout:300000})
 report.ok=true
}catch(error){report.error={type:error.name,code:error.code??null,message:error.name==='AssertionError'||/^Management [A-Z]+ \/[\w/?=-]+: HTTP \d+$/.test(error.message)?error.message:'controlled_acceptance_incomplete'};process.exitCode=1}
finally{
 if(paused)try{
  await db.query(`begin;insert into billing_sources select * from jsonb_populate_record(null::billing_sources,${quote(JSON.stringify(source))}::jsonb) on conflict(environment,source) do nothing;update billing_policy set enabled=${policy.enabled} where environment='development';select cron.alter_job(${job.jobid},active:=${job.active});commit;`,false)
  assert.deepEqual((await db.query("select * from billing_sources where environment='development'"))[0],source)
  assert.deepEqual((await db.query("select * from billing_policy where environment='development'"))[0],policy)
  assert.equal((await db.query(`select active from cron.job where jobid=${job.jobid}`))[0].active,job.active)
  report.restored=true
 }catch{report.restored=false;report.ok=false;process.exitCode=1}
 report.endedAt=new Date().toISOString();await writeFile(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,startedAt:report.startedAt,endedAt:report.endedAt,restored:report.restored,error:report.error},null,2))
}
