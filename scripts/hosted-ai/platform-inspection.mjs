/**
 * [INPUT]: Explicit environment, platform metadata access and the deployed privacy contract.
 * [OUTPUT]: Fixed-field logging/backup/replica/Secret inventory; inaccessible surfaces remain unverified.
 * [POS]: Read-only rollout evidence, not proof of historical physical erasure or live log payload safety.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { client } from './client.mjs'
import { acceptanceTarget } from './acceptance-target.mjs'

const {args,environment,projectRef,config,prefix}=acceptanceTarget()
assert(process.argv.includes('--environment') && args.length===0,'Use an explicit --environment')
const db=await client(config,environment)
const report={ok:false,environment,project:projectRef,at:new Date().toISOString(),realProviderCalls:0,historicalPhysicalDeletionVerified:false,fullLogPayloadsVerified:false,surfaces:{}}
const check=async(name,run)=>{
  try{report.surfaces[name]={verified:true,...await run()}}
  catch(error){report.surfaces[name]={verified:false,status:error.message.match(/HTTP \d{3}/)?.[0]??'inspection_incomplete'}}
}
await check('databaseLogging',async()=>({settings:await db.query("select name,setting from pg_settings where name in ('log_statement','log_min_error_statement','log_parameter_max_length','log_parameter_max_length_on_error','pgaudit.log','pgaudit.log_parameter','log_min_messages');")}))
await check('replicas',async()=>({states:await db.query('select state,sync_state,count(*)::int as count from pg_stat_replication group by state,sync_state;')}))
await check('backups',async()=>{
  const b=await db.request('/database/backups')
  assert(Array.isArray(b.backups),'Backup inventory unavailable')
  return {walgEnabled:b.walg_enabled,pitrEnabled:b.pitr_enabled,count:b.backups.length,
    oldestListedAt:b.backups.map(r=>r.inserted_at).sort().at(0)??null,newestListedAt:b.backups.map(r=>r.inserted_at).sort().at(-1)??null,
    physicalWindow:b.physical_backup_data?{earliestUnix:b.physical_backup_data.earliest_physical_backup_date_unix??null,latestUnix:b.physical_backup_data.latest_physical_backup_date_unix??null}:null,
    restoreRequiresReclean:true,physicalErasureVerified:false}
})
await check('logDrains',async()=>{
  const data=await db.request('/analytics/log-drains',{apiVersion:2})
  const rows=Array.isArray(data)?data:data?.data
  assert(Array.isArray(rows),'Unrecognized drain inventory')
  return {count:rows.length,noConfiguredDrains:rows.length===0}
})
await check('secrets',async()=>{
  const rows=await db.request('/secrets')
  assert(Array.isArray(rows),'Secret inventory unavailable')
  return {cacheKeyPresent:rows.some(r=>r.name==='HOSTED_AI_CACHE_KEY'),providerKeyPresent:rows.some(r=>r.name==='HOSTED_AI_OPENROUTER_KEY'),
    customTelemetrySecretPresent:rows.some(r=>/SENTRY|OTEL|TRACE|LOGFLARE|DATADOG|HONEYCOMB|UPSTASH|REDIS/i.test(r.name))}
})
await check('logsAccess',async()=>{
  const end=new Date().toISOString(),start=new Date(Date.now()-3600000).toISOString()
  const data=await db.request('/analytics/endpoints/logs?'+new URLSearchParams({sql:"select count() as count from logs where source in ('function_edge_logs','function_logs')",iso_timestamp_start:start,iso_timestamp_end:end}))
  assert(!data.error && Array.isArray(data.result),'Platform log query unavailable')
  return {readable:true,aggregateOnly:true}
})
await check('schema',async()=>{
  const rows=await db.query("select table_name,column_name from information_schema.columns where table_schema='public' and table_name in ('ai_actions','ai_budget','ai_protection','ai_limit_events');")
  return {contentColumnsAbsent:!rows.some(r=>['result_cipher','result_expires_at'].includes(r.column_name)),tableCount:new Set(rows.map(r=>r.table_name)).size}
})
report.ok=Object.values(report.surfaces).every(s=>s.verified)
if(!report.ok)process.exitCode=1
await mkdir('output/tests/hosted-ai/content-minimization',{recursive:true})
await writeFile(`output/tests/hosted-ai/content-minimization/${prefix}platform-inspection.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600})
console.log(JSON.stringify(report,null,2))
