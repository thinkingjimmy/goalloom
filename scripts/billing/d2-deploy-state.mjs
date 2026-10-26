/**
 * [INPUT]: Fresh fixed-project metadata, reviewed migrations and the existing populated fingerprint builders.
 * [OUTPUT]: Read-only installation inventory and bounded pause/install/stop SQL strings; no implicit execution.
 * [POS]: D2 development installer structure. The caller owns the Root lease and unknown-outcome journal.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {developmentRef} from '../hosted-ai/client.mjs'
import {eszipOriginalSource} from '../deploy/edge-source.mjs'
import {sha256} from '../deploy/schema.mjs'
import {literal as q} from './d1-sync-fixtures.mjs'
import {LIMITS,inventorySql,catalogSql,businessSql,validateInventory,isRuntime,inboxRoutesSql,verifyInboxRoutesSql} from './d2-populated-gate.mjs'
import {defaultReadinessSql,CLOSED_DEFAULTS,normalizedSchemaSql} from './d2-schema-attestation.mjs'
import {attestCronRuntimeInventory} from './d2-cron-runtime.mjs'
export {defaultReadinessSql,CLOSED_DEFAULTS,normalizedSchemaSql,schemaAttestationScope} from './d2-schema-attestation.mjs'

export const BILLING_JOB='goalloom-billing-worker-development'
export const EDGE_MODES=[
 {slug:'billing',verifyJwt:false,authentication:'Existing manual Auth, signed provider ingress and worker secret; cron remains paused.'},
 {slug:'hosted-ai',verifyJwt:true,authentication:'Existing gateway JWT and strict handler Auth; no policy/allocation change.'},
 {slug:'snapshot-url',verifyJwt:true,authentication:'Existing gateway JWT; source-bound producer digest required.'},
 {slug:'lifecycle',verifyJwt:true,authentication:'Gateway JWT plus handler Auth; development worker runs locally only.'},
 {slug:'deletion-receipt',verifyJwt:false,authentication:'Bounded no-Auth status secret; no initiation or data access.'},
 {slug:'retained-retrieval',verifyJwt:true,authentication:'Gateway JWT plus verified owner session and recovery proof.'},
]
const hash=expression=>`encode(pg_catalog.sha256(convert_to((${expression})::text,'UTF8')),'hex')`
const noSemi=sql=>sql.trim().replace(/;$/,'')
const fingerprint=sql=>`(select fingerprints from (${noSemi(sql)}) deployment_fingerprint)`
export const d2MarkersSql=`select jsonb_build_object(${['account_lifecycle','deletion_requests','retrieval_builds','restore_runs','worker_scopes','transfer_drain_policy'].map(name=>`${q(name)},to_regclass(${q(`service_private.${name}`)}) is not null`).join(',')}) as markers;`
export const cronInventorySql=`select jobid,jobname,schedule,active,${hash('command')} as command_sha256
 from cron.job order by jobid;`
const dispatchPaths=['billing/worker','lifecycle/worker'].map(path=>q(`https://${developmentRef}.supabase.co/functions/v1/${path}`)).join(',')
export const drainStateSql=`select jsonb_build_object(
 'runningAi',(select count(*) from public.ai_actions where status='running'),
 'unknownAi',(select count(*) from public.ai_actions where status='unknown'),
 'liveBillingLeases',(select count(*) from public.billing_accounts where environment='development' and lease is not null and lease_until>clock_timestamp()),
 'liveInboxLeases',(select count(*) from public.billing_inbox where environment='development' and status='processing' and lease_until>clock_timestamp()),
 'queuedWorkerRequests',(select count(*) from net.http_request_queue where url in (${dispatchPaths})),
 'otherActiveWriters',(select count(distinct l.pid) from pg_locks l join pg_stat_activity a on a.pid=l.pid join pg_class c on c.oid=l.relation join pg_namespace n on n.oid=c.relnamespace
  where l.pid<>pg_backend_pid() and a.state<>'idle' and l.granted and l.mode in ('RowShareLock','RowExclusiveLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock')
  and n.nspname in ('public','service_private','auth','storage')),
 'activeInstallerTransactions',(select count(*) from pg_stat_activity where pid<>pg_backend_pid() and state<>'idle' and (application_name like 'd2-install:%' or application_name like 'd2-rollback:%'))
 ) as drain;`
const admissionValue=`jsonb_build_object('service',(select to_jsonb(p) from service_private.policy p where id=1),
 'billing',(select to_jsonb(p) from public.billing_policy p where environment='development'))`
export const admissionStateSql=`select ${hash(admissionValue)} as admission_sha256,
 ${hash("jsonb_build_object('service',(select to_jsonb(p)-'enabled'-'min_service_version' from service_private.policy p where id=1),'billing',(select to_jsonb(p)-'enabled' from public.billing_policy p where environment='development'))")} as protected_fields_sha256,
 (select enabled from service_private.policy where id=1) as service_enabled,
 (select min_service_version from service_private.policy where id=1) as min_service_version,
 (select enabled from public.billing_policy where environment='development') as billing_enabled;`
const protectedEnvironment=`if not exists(select 1 from service_private.policy where id=1 and environment='development' and project_ref=${q(developmentRef)})
 or not exists(select 1 from public.ai_budget where id='integration-shared' and environment='development') then raise exception 'deployment_project_invalid';end if;`
const start=applicationName=>{
 assert(/^d2-install:[a-f0-9-]{36}$/.test(applicationName),'Exact installer transaction identity required')
 return `begin;set local application_name=${q(applicationName)};set local timezone='UTC';set local lock_timeout='${LIMITS.lockMs}ms';set local statement_timeout='${LIMITS.statementMs}ms';
 select 1 from public.ai_budget where id='integration-shared' for update;
 select pg_advisory_xact_lock(hashtextextended('goalloom-development-d2-install',0));`
}
function jobGuard(job,{active=true}={}){
 assert(Number.isSafeInteger(job?.jobid)&&job.jobid>0&&job.jobname===BILLING_JOB&&typeof job.schedule==='string'&&/^[a-f0-9]{64}$/.test(job.command_sha256)&&typeof job.active==='boolean','Exact observed billing job required')
 return `if not exists(select 1 from cron.job where jobid=${job.jobid} and jobname=${q(BILLING_JOB)} and schedule=${q(job.schedule)}
 and ${hash('command')}=${q(job.command_sha256)}${active?` and active=${job.active}`:''}) or (select count(*) from cron.job where jobname=${q(BILLING_JOB)})<>1
 then raise exception 'deployment_cron_changed';end if;`
}
export function buildPauseSql({applicationName,job,admissionSha256}){
 assert(/^[a-f0-9]{64}$/.test(admissionSha256),'Fresh admission fingerprint required')
 return `${start(applicationName)}
 do $pause$ begin ${protectedEnvironment}${jobGuard(job)}
 if ${hash(admissionValue)}<>${q(admissionSha256)} then raise exception 'deployment_admission_changed';end if;
 end $pause$;
 update service_private.policy set enabled=false where id=1;
 update public.billing_policy set enabled=false where environment='development';
 select cron.alter_job(${job.jobid},active:=false);
 commit;`
}
export function historyFingerprintSql({coreHistoryPresent,oldPrivateOnly=false}){
 assert(typeof coreHistoryPresent==='boolean','Observed history mode required')
 const core=coreHistoryPresent?`(select coalesce(jsonb_agg(to_jsonb(h) order by version),'[]') from supabase_migrations.schema_migrations h)`:`'null'::jsonb`
 const value=`jsonb_build_object('core',${core},'private',(select coalesce(jsonb_agg(to_jsonb(h) order by version),'[]') from service_private.migrations h${oldPrivateOnly?" where version<'0025'":''}))`
 return `select ${hash(value)} as history_sha256;`
}
export function buildInstallSql({applicationName,migrations,tables,coreHistoryPresent,historySha256,drainEvidenceSha256}){
 assert(/^[a-f0-9]{64}$/.test(historySha256)&&/^[a-f0-9]{64}$/.test(drainEvidenceSha256),'Reviewed history and actual paused drain observation required')
 assert.deepEqual(migrations.map(m=>m.file),['0025_service_lifecycle.sql','0026_account_deletion.sql','0027_retained_retrieval.sql','0028_lifecycle_cleanup.sql'])
 for(const m of migrations)assert(sha256(m.sql)===m.sha256,'Frozen migration changed')
 const stable=validateInventory(tables).filter(t=>!isRuntime(t)),oldBusiness=stable.filter(t=>`${t.schema}.${t.name}`!=='service_private.migrations')
 const appTables=stable.filter(t=>['public','service_private'].includes(t.schema)&&['r','p','m'].includes(t.kind))
 assert(appTables.length>0,'Original application lock targets required')
 const lockNames=appTables.map(t=>[t.schema,t.name].map(s=>`"${s.replaceAll('"','""')}"`).join('.')).join(',')
 const history=noSemi(historyFingerprintSql({coreHistoryPresent,oldPrivateOnly:true}))
 const before=fingerprint(businessSql(oldBusiness,{normalizePolicy:true})),after=fingerprint(businessSql(oldBusiness,{forward:true}))
 return `${start(applicationName)}
 lock table ${lockNames} in share row exclusive mode;
 do $install_guard$ begin ${protectedEnvironment}
 if exists(select 1 from service_private.policy where enabled) or exists(select 1 from public.billing_policy where environment='development' and enabled)
  or exists(select 1 from cron.job where jobname=${q(BILLING_JOB)} and active)
  or exists(select 1 from public.ai_actions where status='running')
  or exists(select 1 from public.billing_accounts where environment='development' and lease is not null and lease_until>clock_timestamp())
  or exists(select 1 from public.billing_inbox where environment='development' and status='processing' and lease_until>clock_timestamp())
  or exists(select 1 from net.http_request_queue where url in (${dispatchPaths})) then raise exception 'deployment_not_drained';end if;
 if (${history})<>${q(historySha256)} or (select count(*) from service_private.migrations)<>7
  or ${['account_lifecycle','deletion_requests','retrieval_builds','restore_runs','worker_scopes','transfer_drain_policy'].map(name=>`to_regclass(${q(`service_private.${name}`)}) is not null`).join(' or ')} then raise exception 'deployment_history_changed';end if;
 end $install_guard$;
 create temporary table d2_gate_evidence(key text primary key,value jsonb) on commit drop;
 ${inboxRoutesSql}
 insert into pg_temp.d2_gate_evidence values('originalBusiness',${before});
 ${migrations.map(m=>`${m.sql}\ninsert into service_private.migrations(version,sha256) values(${q(m.file.slice(0,4))},${q(m.sha256)});`).join('\n')}
 set constraints all immediate;
 ${verifyInboxRoutesSql}
 do $install_proof$ begin
 if (${history})<>${q(historySha256)} then raise exception 'deployment_old_history_changed';end if;
 if (select (value->>'count')::bigint from pg_temp.d2_gate_evidence where key='inboxRouteViolations')<>0
  or (select value from pg_temp.d2_gate_evidence where key='originalBusiness') is distinct from ${after} then raise exception 'deployment_original_fields_changed';end if;
 if (select readiness from (${noSemi(defaultReadinessSql)}) d) is distinct from ${q(JSON.stringify(CLOSED_DEFAULTS))}::jsonb
  or exists(select 1 from service_private.policy where enabled or min_service_version<>2) then raise exception 'deployment_defaults_open';end if;
 end $install_proof$;
 select ${fingerprint(catalogSql)} as installed_catalog,${after} as preserved_original_fields;
 commit;`
}
export function buildStopSql({applicationName,job}){
 return `${start(applicationName)}
 do $stop$ begin ${protectedEnvironment}${jobGuard(job,{active:false})}end $stop$;
 update service_private.policy set enabled=false where id=1;
 update public.billing_policy set enabled=false where environment='development';
 do $stop_lifecycle$ begin if to_regclass('service_private.lifecycle_policy') is not null then
  update service_private.lifecycle_policy set enabled=false,independent_ledger_ready=false,restore_admission_ready=false,cleanup_wiring_ready=false where id=1;
 end if;end $stop_lifecycle$;
 select cron.alter_job(${job.jobid},active:=false);
 commit;`
}
export async function collectDeploymentState(db){
 const inventory=validateInventory(await db.query(inventorySql)),runtime=await attestCronRuntimeInventory(db,inventory),tables=runtime.tables,markers=(await db.query(d2MarkersSql))[0].markers
 const cron=await db.query(cronInventorySql),admission=(await db.query(admissionStateSql))[0],drain=(await db.query(drainStateSql))[0].drain
 const coreHistoryPresent=(await db.query("select to_regclass('supabase_migrations.schema_migrations') is not null as present"))[0].present
 const history=(await db.query(historyFingerprintSql({coreHistoryPresent})))[0].history_sha256
 const coreHistory=coreHistoryPresent?await db.query(`select version,name,${hash("array_to_string(statements,'')")} as sha256 from supabase_migrations.schema_migrations order by version`):[]
 const privateHistory=await db.query('select version,sha256 from service_private.migrations order by version')
 const metadata=await db.request('/functions'),edges=[]
 for(const expected of EDGE_MODES){
  const prior=metadata.find(m=>m.slug===expected.slug)
  if(!prior){edges.push({slug:expected.slug,present:false});continue}
  const bytes=await db.request(`/functions/${expected.slug}/body`,{binary:true})
  const source=bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8')
  edges.push({slug:expected.slug,present:true,version:prior.version,status:prior.status,verifyJwt:prior.verify_jwt,sha256:sha256(source)})
 }
 return {project:developmentRef,observedAt:new Date().toISOString(),tables,runtimeSequenceProof:runtime.proof,runtimeSequenceObservations:runtime.observations,markers,cron,admission,drain,coreHistoryPresent,history,coreHistory,privateHistory,edges,
  business:(await db.query(businessSql(tables)))[0].fingerprints,catalog:(await db.query(catalogSql))[0].fingerprints,
  runtime:(await db.query("select version() as postgresql,current_setting('server_version_num') as server_version_num"))[0],
  limitation:'Read-only observation, not a drain, source-freeze review or execution lease. No decrypted Vault rows or raw Edge source is retained.'}
}
