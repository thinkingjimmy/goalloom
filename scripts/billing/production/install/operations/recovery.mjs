/**
 * [INPUT]: Current source, immutable read-only production inspection, coordinated sole cron operator and explicit output directory.
 * [OUTPUT]: Credential-safe readiness facts and a reviewed finite billing window SQL package; no apply mode.
 * [POS]: Post-install recovery preparation. Original installation history and owner data remain intact.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {readFile,mkdir,writeFile,realpath} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {isDeepStrictEqual} from 'node:util'
import {ROOT,REF,inputs,hash,json,q,JOBS,MODES,preservationSql} from '../source.mjs'
import {save,readJson} from '../io.mjs'
import {client} from '../client.mjs'
import {edgeState} from '../run.mjs'

export const OUTPUT=resolve(ROOT,'output/tests/billing/desktop/bill29-continuation/backend')
const same=isDeepStrictEqual
const stamp=()=>new Date().toISOString()
const policyClosed=`(select environment='production' and project_ref='${REF}' and not enabled from service_private.policy where id=1)
 and not exists(select 1 from public.billing_policy where enabled)
 and (select not enabled and not independent_ledger_ready and not restore_admission_ready and not cleanup_wiring_ready and not restore_blocked from service_private.lifecycle_policy where id=1)`
const empty=`not exists(select 1 from public.ai_actions where status in ('running','unknown'))
 and not exists(select 1 from public.billing_accounts where environment='production')
 and not exists(select 1 from public.billing_inbox where environment='production' and status in ('pending','processing'))
 and not exists(select 1 from public.billing_operations where environment='production' and status='pending')
 and not exists(select 1 from public.billing_compensations where environment='production' and status<>'complete')
 and not exists(select 1 from public.billing_grace where environment='production' and active)
 and not exists(select 1 from service_private.deletion_outbox where environment='production' and acknowledged_at is null)
 and not exists(select 1 from service_private.deletion_requests where environment='production' and confirmed_at is not null)
 and not exists(select 1 from service_private.account_lifecycle where environment='production' and state<>'active')
 and not exists(select 1 from service_private.workspace_lifecycle where environment='production' and (lease_until>clock_timestamp() or state in ('queued','deleting') or next_due_at<=clock_timestamp()))
 and not exists(select 1 from service_private.cloud_transfers where environment='production' and state in ('dispatched','unknown'))`
const sourceRow=`select to_jsonb(s) from public.billing_sources s where environment='production' and source='stripe'`
const jobRows=`select jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active,'command',command) order by jobname) from cron.job where jobname in (${JOBS.map(j=>q(j.name)).join(',')})`
const sourceManifest=source=>({fingerprints:source.fingerprints,migrations:source.migrations.map(({version,name,sha256})=>({version,name,sha256})),edges:source.edges.map(({slug,sha256,verifyJwt})=>({slug,sha256,verifyJwt}))})
async function fingerprint(){
 const source=await inputs(),paths=['scripts/billing/production/install/operations/recovery.mjs','scripts/billing/production/install/operations/recovery-failure-cases.md','scripts/billing/production/install/operations/README.md']
 return {source,manifest:{...sourceManifest(source),continuation:await Promise.all(paths.map(async path=>({path,sha256:hash(await readFile(resolve(ROOT,path)))})))}}
}
const stateSql=`begin read only;select jsonb_build_object(
 'serverNow',clock_timestamp(),'postgres',version(),'policy',(select to_jsonb(p) from service_private.policy p where id=1),
 'billingPolicy',(select to_jsonb(p) from public.billing_policy p where environment='production'),
 'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1),'source',(${sourceRow}),
 'transferDrain',(select to_jsonb(p) from service_private.transfer_drain_policy p where id=1),
 'jobs',(${jobRows}),'otherJobs',(select coalesce(jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active,'commandHash',encode(sha256(convert_to(command,'UTF8')),'hex')) order by jobname),'[]'::jsonb) from cron.job where jobname not in(${JOBS.map(j=>q(j.name)).join(',')})),
 'health',service_private.production_worker_health(),'empty',(${empty}),
 'queuedWorkers',(select count(*) from net.http_request_queue where url in ('https://${REF}.supabase.co/functions/v1/billing/worker','https://${REF}.supabase.co/functions/v1/lifecycle/worker')),
 'unresolvedDispatches',(select count(*) from service_private.worker_dispatches where completed_at is null),
 'counts',jsonb_build_object('authUsers',(select count(*) from auth.users),'sessions',(select count(*) from auth.sessions),'workspaces',(select count(*) from public.workspaces),'devices',(select count(*) from public.devices),'storageObjects',(select count(*) from storage.objects),'transfers',(select count(*) from service_private.cloud_transfers),'billingAccounts',(select count(*) from public.billing_accounts),'billingInbox',(select count(*) from public.billing_inbox),'deletionRequests',(select count(*) from service_private.deletion_requests),'unresolvedAI',(select count(*) from public.ai_actions where status in ('running','unknown'))),
 'lifecycleStates',(select coalesce(jsonb_agg(jsonb_build_object('state',state,'boundaryVerified',boundary_verified,'profileVerified',profile_verified,'count',n)),'[]'::jsonb) from(select state,boundary_verified,profile_verified,count(*) n from service_private.workspace_lifecycle where environment='production' group by 1,2,3)x),
 'history',(select jsonb_agg(jsonb_build_object('version',version,'name',name,'sha256',encode(sha256(convert_to(array_to_string(statements,''),'UTF8')),'hex')) order by version) from supabase_migrations.schema_migrations),
 'privateHistory',(select jsonb_agg(jsonb_build_object('version',version,'sha256',sha256) order by version) from service_private.migrations),
 'protected',(select protected from(${preservationSql(true).replace(/;\s*$/,'')}) p),
 'lifecycleKeyDigest',(select encode(sha256(key),'hex') from service_private.lifecycle_keys where id=1)) as state;commit;`

export async function inspect(db){
 const {source,manifest}=await fingerprint(),project=await db.request('')
 if(project.id!==REF||project.status!=='ACTIVE_HEALTHY')throw Error('production_identity')
 const postgrest=await db.request('/postgrest'),schemas=String(postgrest.db_schema??'').split(',').map(s=>s.trim())
 if(!schemas.includes('public')||['net','vault','service_private'].some(s=>schemas.includes(s)))throw Error('private_schema_exposed')
 const auth=await db.request('/config/auth'),jwtExpirySeconds=auth.jwt_exp
 if(!Number.isInteger(jwtExpirySeconds)||jwtExpirySeconds<1||jwtExpirySeconds>604800)throw Error('auth_lifetime_unverified')
 const state=(await db.query(stateSql,false))[0]?.state
 if(!state||!Array.isArray(state.history)||!Array.isArray(state.privateHistory))throw Error('management_response')
 const history=manifest.migrations
 if(!same(state.history,history)||!same(state.privateHistory,history.slice(13).map(({version,sha256})=>({version,sha256}))))throw Error('migration_history_changed')
 const listing=await db.request('/functions'),edges=[]
 for(const [slug] of MODES)edges.push(await edgeState(db,slug,null,listing))
 const edgesMatch=source.edges.every(e=>edges.some(x=>x.slug===e.slug&&x.sha256===e.sha256&&x.verifyJwt===e.verifyJwt&&x.status==='ACTIVE'))
 const report={version:1,kind:'goalloom-production-recovery-inspection',project:REF,at:stamp(),manifest,state,edges,edgesMatch,jwtExpirySeconds,privateSchemasNotExposed:true,
  readOnly:true,productionWrites:0,providerCalls:0,modelCalls:0,naturalExpiryObserved:false,legacyDrainVerified:false,transferDrainVerified:state.transferDrain?.verified===true,launchReady:false}
 report.sha256=hash(json(report));return report
}
async function outputDirectory(path){
 path=resolve(path)
 if(dirname(path)!==OUTPUT||!/^[-a-zA-Z0-9_.]+$/.test(path.slice(OUTPUT.length+1)))throw Error('invalid_evidence_directory')
 await mkdir(OUTPUT,{recursive:true,mode:0o700});if(await realpath(OUTPUT)!==OUTPUT)throw Error('invalid_evidence_directory')
 await mkdir(path,{mode:0o700});return path
}
export function assess(inspection){
 const s=inspection.state,blockers=[]
 if(!inspection.edgesMatch)blockers.push('current_deployed_source_mismatch')
 if(s.policy?.enabled||s.policy?.environment!=='production'||s.policy?.project_ref!==REF||s.policy?.source_fingerprint!==null)blockers.push('service_policy_changed')
 if(s.billingPolicy?.enabled!==false)blockers.push('billing_policy_not_closed')
 if(!s.source||s.source.enabled!==false)blockers.push('source_not_closed')
 const binding={environment:'production',source:'stripe',account_id:'acct_1QvwdlITpGuR8ZMB',rc_project:'projd720c733',rc_app:'app31d218cbde',monthly_price:'price_1UUS1EITpGuR8ZMB0dLbeL23',annual_price:'price_1UUS1OITpGuR8ZMBkPCS02CR',currency:'usd',monthly_cents:899,annual_cents:7900,inclusive:true,enabled:false}
 if(!same(s.source,binding))blockers.push('source_binding_changed')
 if(['enabled','independent_ledger_ready','restore_admission_ready','cleanup_wiring_ready','restore_blocked'].some(k=>s.lifecycle?.[k]!==false))blockers.push('lifecycle_not_closed')
 if(!s.empty||s.queuedWorkers!==0||s.unresolvedDispatches!==0)blockers.push('original_work_not_empty')
 const jobs=JOBS.map(j=>({name:j.name,schedule:'* * * * *',active:false,command:j.command})).sort((a,b)=>a.name.localeCompare(b.name))
 if(!same(s.jobs,jobs))blockers.push('worker_job_drift')
 return blockers
}
function guardState(s,{sourceEnabled=false,billingEnabled=false}={}){
 const source={...s.source,enabled:sourceEnabled},billing={...s.billingPolicy,enabled:billingEnabled}
 return `(select to_jsonb(p) from service_private.policy p where id=1)=${q(JSON.stringify(s.policy))}::jsonb
 and (select to_jsonb(p) from service_private.lifecycle_policy p where id=1)=${q(JSON.stringify(s.lifecycle))}::jsonb
 and (select to_jsonb(p) from public.billing_policy p where environment='production')=${q(JSON.stringify(billing))}::jsonb
 and (${sourceRow})=${q(JSON.stringify(source))}::jsonb
 and not exists(select 1 from public.billing_policy where environment<>'production' and enabled)
 and not exists(select 1 from public.billing_sources where (environment,source)<>('production','stripe') and enabled)`
}
const locks=`perform pg_advisory_xact_lock(hashtextextended('goalloom-production-recovery',0));
 lock table service_private.policy,service_private.lifecycle_policy,public.billing_policy,public.billing_sources in share row exclusive mode;`
const transaction=(name,body)=>`begin;set local application_name=${q(name)};set local lock_timeout='5s';set local statement_timeout='30s';\ndo $operation$ begin\n${body}\nend $operation$;commit;\n`
export function windowSql(inspection,id){
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('invalid_arguments')
 const s=inspection.state,armTransaction=`bill29-window:${id}`,deadline=new Date(Date.parse(s.serverNow)+2*60_000).toISOString()
 // The absolute dispatch deadline is embedded into the jobs. Neither a restart nor a late operator can extend it.
 const windowDeadline=new Date(Date.parse(s.serverNow)+5*60_000).toISOString()
 const reset=`update public.billing_sources set enabled=false where environment='production' and source='stripe';
 update public.billing_policy set enabled=false where environment='production';`
 const closed=guardState(s),opened=guardState(s,{sourceEnabled:true,billingEnabled:true})
 const ownPolicyGuard=`if ((${sourceRow})-'enabled') is distinct from ${q(JSON.stringify(Object.fromEntries(Object.entries(s.source).filter(([k])=>k!=='enabled'))))}::jsonb
 or ((select to_jsonb(p) from public.billing_policy p where environment='production')-'enabled') is distinct from ${q(JSON.stringify(Object.fromEntries(Object.entries(s.billingPolicy).filter(([k])=>k!=='enabled'))))}::jsonb then raise exception 'window_binding_drift';end if;`
 const common=`${locks}\n${ownPolicyGuard}`
 // Exact guards reject observed drift. Cron writers must share this advisory lock or be externally excluded.
 const wrappers=JOBS.map(j=>({name:j.name,command:`-- bill29-window:${id}:${j.name}
do $bounded$ begin
 ${common}
 if (select command from cron.job where jobname=${q(j.name)}) is distinct from current_query() then raise exception 'worker_job_drift';end if;
 if clock_timestamp()>=${q(windowDeadline)}::timestamptz or not coalesce((${opened}),false) or not(${empty}) then
 ${reset}
 perform cron.alter_job((select jobid from cron.job where jobname=${q(j.name)}),command:=${q(j.command)},active:=false);
 else ${j.command.replace(/^select /,'perform ')} end if;
 end $bounded$;`}))
 const expectedOriginal=JSON.stringify(s.jobs)
 const jobsGuard=`if (select count(*) from cron.job where jobname in(${JOBS.map(j=>q(j.name)).join(',')}))<>3 or exists(select 1 from cron.job where jobname in(${JOBS.map(j=>q(j.name)).join(',')}) and not(${JOBS.map((j,i)=>`(jobname=${q(j.name)} and schedule='* * * * *' and ((command=${q(j.command)} and not active) or command=${q(wrappers[i].command)}))`).join(' or ')})) then raise exception 'worker_job_drift';end if;`
 const protectedGuard=`if (select protected from(${preservationSql(true).replace(/;\s*$/,'')}) p) is distinct from ${q(JSON.stringify(s.protected))}::jsonb then raise exception 'protected_state_changed';end if;`
 const arm=transaction(armTransaction,`${locks}
 if clock_timestamp()>${q(deadline)}::timestamptz then raise exception 'inspection_stale';end if;
 if not coalesce((${closed}),false) or not(${empty}) or exists(select 1 from service_private.worker_dispatches where completed_at is null)
 or exists(select 1 from net.http_request_queue where url in('https://${REF}.supabase.co/functions/v1/billing/worker','https://${REF}.supabase.co/functions/v1/lifecycle/worker')) then raise exception 'window_precondition_changed';end if;
 if (${jobRows}) is distinct from ${q(expectedOriginal)}::jsonb then raise exception 'worker_job_drift';end if;
 ${protectedGuard}
 update public.billing_sources set enabled=true where environment='production' and source='stripe';
 update public.billing_policy set enabled=true where environment='production';
 ${wrappers.map(j=>`perform cron.alter_job((select jobid from cron.job where jobname=${q(j.name)}),command:=${q(j.command)},active:=true);`).join('\n')}`)
 const restore=transaction(`bill29-close:${id}`,`${common}\n${jobsGuard}\n${reset}\n${JOBS.map(j=>`perform cron.alter_job((select jobid from cron.job where jobname=${q(j.name)}),command:=${q(j.command)},active:=false);`).join('\n')}`)
 const finalize=transaction(`bill29-observe:${id}`,`${locks}\nif not coalesce((${closed}),false) then raise exception 'closed_state_required';end if;
 if (${jobRows}) is distinct from ${q(expectedOriginal)}::jsonb then raise exception 'worker_job_drift';end if;
 if exists(select 1 from net.http_request_queue where url in('https://${REF}.supabase.co/functions/v1/billing/worker','https://${REF}.supabase.co/functions/v1/lifecycle/worker'))
 or exists(select 1 from service_private.worker_dispatches d left join net._http_response r on r.id=d.request_id where d.completed_at is null and r.id is null and d.dispatched_at>clock_timestamp()-interval '3 minutes') then raise exception 'worker_response_pending';end if;
 perform service_private.observe_production_workers();`)
 const read=`begin read only;select jsonb_build_object('serverNow',clock_timestamp(),'originalArmActive',exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and application_name=${q(armTransaction)} and state<>'idle'),
 'policiesClosed',(${policyClosed}),'source',(${sourceRow}),'jobs',(${jobRows}),
 'servicePolicy',(select to_jsonb(p) from service_private.policy p where id=1),'billingPolicy',(select to_jsonb(p) from public.billing_policy p where environment='production'),'lifecyclePolicy',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1),
 'otherJobs',(select coalesce(jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active,'commandHash',encode(sha256(convert_to(command,'UTF8')),'hex')) order by jobname),'[]'::jsonb) from cron.job where jobname not in(${JOBS.map(j=>q(j.name)).join(',')})),
 'empty',(${empty}),
 'dispatches',(select coalesce(jsonb_agg(jsonb_build_object('requestId',d.request_id,'worker',d.worker,'dispatchedAt',d.dispatched_at,'completedAt',d.completed_at,'outcome',d.outcome,'httpStatus',d.http_status,'counters',d.counters,'responsePresent',r.id is not null,'responseStatus',r.status_code,'timedOut',r.timed_out,'transportError',r.error_msg is not null) order by d.request_id),'[]'::jsonb) from service_private.worker_dispatches d left join net._http_response r on r.id=d.request_id where d.dispatched_at>=${q(s.serverNow)}::timestamptz),
 'health',service_private.production_worker_health(),'protected',(select protected from(${preservationSql(true).replace(/;\s*$/,'')}) p),
 'queuedWorkers',(select count(*) from net.http_request_queue where url in('https://${REF}.supabase.co/functions/v1/billing/worker','https://${REF}.supabase.co/functions/v1/lifecycle/worker'))) as observation;commit;\n`
 return {armTransaction,armExpiresAt:deadline,dispatchDeadline:windowDeadline,arm,restore,finalize,read,wrappers}
}
export async function prepare(inspectionPath,path){
 const inspection=await readJson(resolve(inspectionPath)),{sha256,...body}=inspection
 if(inspection.kind!=='goalloom-production-recovery-inspection'||inspection.project!==REF||hash(json(body))!==sha256)throw Error('inspection_changed')
 const {manifest}=await fingerprint();if(!same(inspection.manifest,manifest))throw Error('source_changed')
 const blockers=assess(inspection);if(blockers.length)throw Object.assign(Error('window_blocked'),{blockers})
 const id=randomUUID(),sql=windowSql(inspection,id),dir=await outputDirectory(path),plan={version:1,kind:'goalloom-production-billing-window',id,project:REF,at:stamp(),inspectionSha256:sha256,manifest,
  armTransaction:sql.armTransaction,armExpiresAt:sql.armExpiresAt,dispatchDeadline:sql.dispatchDeadline,
  exposure:'Authenticated billing status, trial, Checkout, Portal and subscription actions become available while billing policy/source are true. Ordinary cloud, hosted AI admission and all lifecycle readiness stay closed. Website/public sale gates are separate and unchanged.',
  duration:'Arm is valid for 2 minutes after inspection; dispatch stops at inspection +5 minutes. The next successful cron run/manual restore closes admission; this is not a hard HTTP admission lease during a cron/project outage. Review the generator first, then inspect and prepare just before dispatch. No timer proves legacy drain.',
  providerEffects:'Each empty Billing invocation performs four configured Stripe GETs. A real event arriving before claim may cause normal reconciliation. No artificial provider events, customers, purchases or model requests are authorized by this package.',
  recovery:'Close source and billing policy, restore/pause the exact three jobs, retain accepted work/facts/unknown outcomes. Read original transaction, request IDs and responses before any further arm.',
  cronConcurrency:'One coordinated cron writer. Advisory locking serializes participants; exact guards reject observed command drift. An administrator bypassing that coordination can race the cron API check/write and is outside this bounded execution guarantee.',
  sql:Object.fromEntries(['arm','restore','finalize','read'].map(name=>[name,{file:name+'.sql',sha256:hash(sql[name])}])),productionWrites:0,activationExecuted:false,launchReady:false}
 plan.sha256=hash(json(plan));await save(resolve(dir,'plan.json'),plan)
 for(const name of ['arm','restore','finalize','read'])await writeFile(resolve(dir,name+'.sql'),sql[name],{mode:0o600,flag:'wx'})
 await save(resolve(dir,'inspection.json'),inspection)
 return {ok:true,directory:dir,planSha256:plan.sha256,armTransaction:plan.armTransaction,armExpiresAt:plan.armExpiresAt,dispatchDeadline:plan.dispatchDeadline,exposure:plan.exposure,productionWrites:0,launchReady:false}
}
async function main(){
 const args=process.argv.slice(2)
 try{
  if(!args.length||args.length===1&&args[0]==='--help'){console.log('Recovery preparation: --inspect | --plan <inspection.json> --output <new-directory>. Inspection uses existing production credentials read-only. Plan is offline. No apply, activation, provider call or installation replay.');return}
  let report
  if(args.length===1&&args[0]==='--inspect'){
   report=await inspect(await client());await mkdir(OUTPUT,{recursive:true,mode:0o700});if(await realpath(OUTPUT)!==OUTPUT)throw Error('invalid_evidence_directory');const path=resolve(OUTPUT,`inspection-${randomUUID()}.json`);await save(path,report)
   console.log(JSON.stringify({ok:true,path,sha256:report.sha256,blockers:assess(report),readOnly:true,productionWrites:0,legacyDrainVerified:false,launchReady:false}));return
  }
  if(args.length===4&&args[0]==='--plan'&&args[2]==='--output')report=await prepare(args[1],args[3]);else throw Error('invalid_arguments')
  console.log(JSON.stringify(report))
 }catch(error){const allowed=['invalid_arguments','invalid_evidence_directory','production_identity','management_transport','management_http','management_response','migration_history_changed','private_schema_exposed','auth_lifetime_unverified','inspection_changed','source_changed','window_blocked'];console.log(JSON.stringify({ok:false,code:allowed.includes(error.message)?error.message:error.code==='EEXIST'?'evidence_exists':'recovery_preparation_failed',...(error.httpStatus?{httpStatus:error.httpStatus}:{}),...(error.blockers?{blockers:error.blockers}:{}),productionWrites:0,launchReady:false}));process.exitCode=1}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main()
