/**
 * [INPUT]: Exact closed production inspection and an immutable operation identity.
 * [OUTPUT]: Separate continuous Billing, paid-service/AI qualification, closure and read-only SQL; no execution.
 * [POS]: Minimal recovery transactions. Original business data, AI monetary accounting and protection fields are not owned.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {REF,JOBS,q,preservationSql} from '../source.mjs'

const value=x=>`${q(JSON.stringify(x))}::jsonb`
const row=(table,where='id=1')=>`(select to_jsonb(p) from ${table} p where ${where})`
const source=row('public.billing_sources',"environment='production' and source='stripe'")
const policy=row('service_private.policy'),lifecycle=row('service_private.lifecycle_policy')
const billing=row('public.billing_policy',"environment='production'")
const jobNames=JOBS.map(j=>q(j.name)).join(',')
const jobs=`(select jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active,'command',command) order by jobname) from cron.job where jobname in(${jobNames}))`
const locks=`perform pg_advisory_xact_lock(hashtextextended('goalloom-production-recovery',0));
 lock table service_private.policy,service_private.lifecycle_policy,public.billing_policy,public.billing_sources in share row exclusive mode;`
const transaction=(id,body)=>`begin;set local application_name=${q(id)};set local lock_timeout='5s';set local statement_timeout='30s';
do $reopen$ begin
${locks}
${body}
end $reopen$;commit;
`
const assert=(condition,error)=>`if not coalesce((${condition}),false) then raise exception ${q(error)};end if;`
export function reopenSql(inspection,id){
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('invalid_arguments')
 const s=inspection.state,enabledSource={...s.source,enabled:true},enabledBilling={...s.billingPolicy,enabled:true}
 const ready={...s.lifecycle,enabled:true,independent_ledger_ready:true,restore_admission_ready:true,cleanup_wiring_ready:true}
 const activeJobs=s.jobs.map(j=>({...j,active:true}))
 const protectedSql=preservationSql(true).replace(/;\s*$/,'')
 const original=`${policy}=${value(s.policy)} and ${lifecycle}=${value(s.lifecycle)}`
 const sourceGuard=`(${source}-'enabled')=${value(Object.fromEntries(Object.entries(s.source).filter(([k])=>k!=='enabled')))}
 and (${billing}-'enabled')=${value(Object.fromEntries(Object.entries(s.billingPolicy).filter(([k])=>k!=='enabled')))}
 and not exists(select 1 from public.billing_sources where (environment,source)<>('production','stripe') and enabled)
 and not exists(select 1 from public.billing_policy where environment<>'production' and enabled)`
 const fresh=assert(`clock_timestamp()<=${q(new Date(Date.parse(s.serverNow)+5*60_000).toISOString())}::timestamptz`,'inspection_stale')
 const protectedGuard=assert(`(select protected from(${protectedSql}) p)=${value(s.protected)}`,'protected_state_changed')
 const idle=assert(`not exists(select 1 from public.ai_actions where status in('running','unknown'))
 and not exists(select 1 from service_private.cloud_transfers where environment='production' and state in('dispatched','unknown'))
 and not exists(select 1 from service_private.worker_dispatches where completed_at is null)
 and not exists(select 1 from net.http_request_queue where url in('https://${REF}.supabase.co/functions/v1/billing/worker','https://${REF}.supabase.co/functions/v1/lifecycle/worker'))`,'accepted_work_unresolved')
 const aiLock='lock table public.ai_budget,public.ai_actions in share row exclusive mode;'
 const jobGuard=active=>assert(`${jobs}=${value(active?activeJobs:s.jobs)}`,'worker_job_drift')
 const billingSql=transaction(`bill29-billing:${id}`,`${fresh}
 ${assert(`${original} and ${source}=${value(s.source)} and ${billing}=${value(s.billingPolicy)} and ${sourceGuard}`,'closed_baseline_changed')}
 ${jobGuard(false)}
 ${protectedGuard}
 ${idle}
 update public.billing_policy set enabled=true where environment='production';
 update public.billing_sources set enabled=true where environment='production' and source='stripe';
 ${assert(`public.billing_source('production')=${value(enabledSource)}`,'source_binding_failed')}
 ${JOBS.map(j=>`perform cron.alter_job((select jobid from cron.job where jobname=${q(j.name)}),active:=true);`).join('\n ')}
`)
 const serviceSql=transaction(`bill29-service:${id}`,`${fresh}
 ${aiLock}
 ${assert(`${original} and ${source}=${value(enabledSource)} and ${billing}=${value(enabledBilling)} and ${sourceGuard}`,'billing_stage_changed')}
 ${jobGuard(true)}
 ${protectedGuard}
 ${idle}
 ${assert(`public.billing_source('production')=${value(enabledSource)}`,'source_binding_failed')}
 update service_private.policy set source_fingerprint=md5(public.billing_source('production')::text) where id=1;
 update service_private.lifecycle_policy set enabled=true,independent_ledger_ready=true,restore_admission_ready=true,cleanup_wiring_ready=true where id=1;
 update service_private.policy set enabled=true where id=1;
 update public.ai_budget set policy='trial_or_paid' where id='integration-shared' and environment='production' and policy='authenticated';
 ${assert(`(select policy='trial_or_paid' from public.ai_budget where id='integration-shared' and environment='production')`,'ai_policy_changed')}
 ${assert(`(select source_fingerprint is not null and source_fingerprint=md5(public.billing_source('production')::text) and min_service_version=2 from service_private.policy where id=1)`,'source_binding_failed')}
`)
 // Closure owns admission fields only. A changed restore barrier or foreign job/config is never overwritten.
 const close=transaction(`bill29-close-continuous:${id}`,`${assert(sourceGuard,'binding_drift')}
 ${assert(`(${policy}-array['enabled','source_fingerprint'])=${value(Object.fromEntries(Object.entries(s.policy).filter(([k])=>!['enabled','source_fingerprint'].includes(k))))}
 and (${policy}->>'source_fingerprint' is null or ${policy}->>'source_fingerprint'=md5(${value(enabledSource)}::text))
 and (${lifecycle}=${value(s.lifecycle)} or ${lifecycle}=${value(ready)})`,'service_or_restore_drift')}
 ${assert(`(select count(*)=3 and bool_and(schedule='* * * * *' and (${JOBS.map(j=>`(jobname=${q(j.name)} and command=${q(j.command)})`).join(' or ')})) from cron.job where jobname in(${jobNames}))`,'worker_job_drift')}
 update service_private.policy set enabled=false,source_fingerprint=${s.policy.source_fingerprint===null?'null':q(s.policy.source_fingerprint)} where id=1;
 update service_private.lifecycle_policy set enabled=false,independent_ledger_ready=false,restore_admission_ready=false,cleanup_wiring_ready=false where id=1;
 update public.billing_sources set enabled=false where environment='production' and source='stripe';
 update public.billing_policy set enabled=false where environment='production';
 ${JOBS.map(j=>`perform cron.alter_job((select jobid from cron.job where jobname=${q(j.name)}),active:=false);`).join('\n ')}
`)
 const read=`begin read only;select jsonb_build_object('serverNow',clock_timestamp(),'operationActive',exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and application_name in(${['billing','service'].map(stage=>q(`bill29-${stage}:${id}`)).join(',')}) and state<>'idle'),
 'policy',${policy},'lifecycle',${lifecycle},'billingPolicy',${billing},'source',${source},'sourceFingerprintMatches',(select source_fingerprint=md5(public.billing_source('production')::text) from service_private.policy where id=1),
 'jobs',${jobs},'aiBudget',(select to_jsonb(p) from public.ai_budget p where id='integration-shared'),'health',service_private.production_worker_health(),'protected',(select protected from(${protectedSql}) p),
 'queuedWorkers',(select count(*) from net.http_request_queue where url in('https://${REF}.supabase.co/functions/v1/billing/worker','https://${REF}.supabase.co/functions/v1/lifecycle/worker')),
 'unresolvedDispatches',(select count(*) from service_private.worker_dispatches where completed_at is null),
 'dispatches',(select coalesce(jsonb_agg(jsonb_build_object('requestId',request_id,'worker',worker,'at',dispatched_at,'completedAt',completed_at,'outcome',outcome,'httpStatus',http_status,'counters',counters) order by request_id),'[]'::jsonb) from service_private.worker_dispatches where dispatched_at>=${q(s.serverNow)}::timestamptz)) as observation;commit;
`
 return {billing:billingSql,service:serviceSql,close,read}
}
