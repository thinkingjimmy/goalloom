/**
 * [INPUT]: Deployed development billing scheduler, signed inbox and private evidence ledgers.
 * [OUTPUT]: Actual cron/HTTP/inbox completion evidence and reconciled readiness fields.
 * [POS]: Read-only service inspection; local reports contain no credentials or raw provider payloads.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {client} from '../hosted-ai/client.mjs'
const db=await client(),dir='output/tests/billing/desktop'
const runs=await db.query("select d.status,d.start_time,d.end_time from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='goalloom-billing-worker-development' order by d.runid desc limit 5")
const jobs=await db.query("select jobname from cron.job where active and command like '%net.http_post(%'")
const responses=await db.query("select id,status_code,timed_out,error_msg,created,case when status_code=200 then content::jsonb else null end as result from net._http_response order by id desc limit 10")
const historicalFailures=await db.query("select id,status_code,timed_out,error_msg,created from net._http_response where timed_out or status_code>=400 order by id desc limit 5")
const deployment=JSON.parse(await readFile(`${dir}/edge-deployment.json`,'utf8'))
const currentResponses=responses.filter(x=>Date.parse(x.created)>Date.parse(deployment.deployedAt))
const verified=jobs.length===1&&jobs[0].jobname==='goalloom-billing-worker-development'&&currentResponses.some(x=>x.status_code===200&&!x.timed_out&&Number.isFinite(x.result?.elapsedMs)&&runs.some(run=>run.status==='succeeded'&&Math.abs(Date.parse(run.start_time)-Date.parse(x.created))<5000))
await writeFile(`${dir}/worker-invocation.json`,JSON.stringify({verified,at:new Date().toISOString(),deployedAt:deployment.deployedAt,attribution:'Only one active cron HTTP job; response creation matches its successful scheduled run after current deployment',jobs,runs,currentResponses,responses,historicalFailures},null,2)+'\n')
deployment.worker.verifiedInvocation=verified;await writeFile(`${dir}/edge-deployment.json`,JSON.stringify(deployment,null,2)+'\n')
const deliveries=await db.query("select provider,event_id,event_type,status,reason from billing_inbox where environment='development' and provider='revenuecat' and status='complete' and reason is null order by received_at limit 10")
const notification=JSON.parse(await readFile(`${dir}/notification-preparation.json`,'utf8'));notification.revenuecatToBackend.signedDeliveryVerified=deliveries.length>0;notification.revenuecatToBackend.completedEvents=deliveries;await writeFile(`${dir}/notification-preparation.json`,JSON.stringify(notification,null,2)+'\n')
console.log(JSON.stringify({workerVerified:verified,revenuecatSignedDeliveries:deliveries.length,responses},null,2));assert(verified,'No attributed successful scheduled HTTP invocation');assert(deliveries.length,'No completed real signed RevenueCat delivery')
