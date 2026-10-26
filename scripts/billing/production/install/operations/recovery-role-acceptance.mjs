/**
 * [INPUT]: The existing isolated PostgreSQL fixture executing as a non-superuser application/job owner.
 * [OUTPUT]: Focused SELECT-only cron lock, exact-guard, restore and real expired-scheduling evidence.
 * [POS]: Cases for recovery-postgres.mjs --role-lock; no production credential, schema or permission change.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {randomUUID} from 'node:crypto'
import {setTimeout} from 'node:timers/promises'
import {JOBS,q,json} from '../source.mjs'
import {windowSql} from './recovery.mjs'
export async function roleLockCases({sql,query,check,flags,snapshot,inspection,window,originalCleanup}){
 const metadata=await query("select jsonb_build_object('role',current_user,'superuser',(select rolsuper from pg_roles where rolname=current_user),'extension',(select extversion from pg_extension where extname='pg_cron'),'api',(select pg_get_functiondef('cron.alter_job(bigint,text,text,text,text,boolean)'::regprocedure)),'select',has_table_privilege(current_user,'cron.job','SELECT'),'maintain',has_table_privilege(current_user,'cron.job','MAINTAIN'),'update',has_table_privilege(current_user,'cron.job','UPDATE'),'delete',has_table_privilege(current_user,'cron.job','DELETE'),'truncate',has_table_privilege(current_user,'cron.job','TRUNCATE'),'execute',has_function_privilege(current_user,'cron.alter_job(bigint,text,text,text,text,boolean)','EXECUTE'));"),allJobs="select jsonb_agg(to_jsonb(j) order by jobid) from cron.job j;",before=await query(allJobs)
 check('non_superuser_select_only_cron_with_actual_alter_api_execute',metadata.superuser===false&&metadata.select&&metadata.execute&&['maintain','update','delete','truncate'].every(k=>metadata[k]===false))
 const oldLock=await sql('begin;lock table cron.job in share row exclusive mode;rollback;',{allowFailure:true});check('original_unsupported_table_lock_refused',oldLock.code!==0&&oldLock.stderr.includes('permission denied'))
 const nullCall=await sql(`select cron.alter_job(${before[0].jobid},null::text,null::text,null::text,null::text,null::boolean);`,{allowFailure:true});check('all_null_alter_job_rejected_without_metadata_change',nullCall.code!==0&&nullCall.stderr.includes('no updates specified')&&json(before)===json(await query(allJobs)))
 await sql(window.arm);let state=await query(flags);check('corrected_arm_succeeds_as_restricted_role_with_cloud_lifecycle_closed',state.source&&state.billing&&!state.cloud&&!state.lifecycle)
 await sql(window.restore);check('restricted_restore_returns_exact_original_commands_and_paused_jobs',!((await query(flags)).source)&&json((await query(snapshot)).jobs)===json(inspection.state.jobs))
 const target=before.find(j=>j.jobname===JOBS[0].name)
 await sql(`select cron.alter_job(${target.jobid},command:='select 2;');`)
 const denied=await sql(window.arm,{allowFailure:true}),foreign=await query(`select to_jsonb(j) from cron.job j where jobid=${target.jobid};`)
 check('observed_foreign_command_refuses_arm_and_is_not_overwritten',denied.code!==0&&denied.stderr.includes('worker_job_drift')&&foreign.command==='select 2;'&&!(await query(flags)).source)
 await sql(`select cron.alter_job(${target.jobid},command:=${q(target.command)});`)
 const expired=windowSql({state:{...inspection.state,serverNow:new Date(Date.now()-6*60_000).toISOString()}},randomUUID())
 await sql(window.arm)
 for(let n=0;n<JOBS.length;n++)await sql(`select cron.alter_job((select jobid from cron.job where jobname=${q(JOBS[n].name)}),command:=${q(expired.wrappers[n].command)},active:=true);`)
 for(const wrapper of expired.wrappers)await sql(wrapper.command,{whole:true})
 state=await query(flags);check('all_expired_wrappers_close_and_restore_as_restricted_role',!state.source&&!state.billing&&state.queued===0&&state.dispatches===0&&json((await query(snapshot)).jobs)===json(inspection.state.jobs))
 await sql(window.finalize);const observed=await query(window.read);check('restricted_finalize_read_keeps_retention_skipped',observed.policiesClosed&&observed.source.enabled===false&&observed.health.observation.retentionAt===null)
 await sql(window.arm)
 await sql(`select cron.alter_job(jobid,active:=false) from cron.job;select cron.alter_job((select jobid from cron.job where jobname=${q(JOBS[2].name)}),command:=${q(expired.wrappers[2].command)},active:=true);`)
 await sql('alter system set cron.launch_active_jobs=on;select pg_reload_conf();',{role:'postgres'})
 let cronRun=null
 for(let n=0;n<75;n++){
  const current=await query(`select jsonb_build_object('active',(select active from cron.job where jobname=${q(JOBS[2].name)}),'run',(select jsonb_build_object('status',status,'message',return_message,'startTime',start_time,'endTime',end_time,'username',username) from cron.job_run_details where jobid=(select jobid from cron.job where jobname=${q(JOBS[2].name)}) order by runid desc limit 1));`)
  if(current.run)cronRun=current.run
  if(!current.active&&current.run?.endTime&&['succeeded','failed'].includes(current.run.status))break
  if(current.run?.status==='failed'&&current.run?.message?.includes('connection failed'))break
  await setTimeout(1000)
 }
 const cronFinal=await query(flags),cronJobs=(await query(snapshot)).jobs,own=cronJobs.find(j=>j.name===JOBS[2].name)
 check('actual_restricted_cron_run_commits_closed_flags_and_original_own_command',cronRun?.username==='window_operator'&&cronRun?.endTime&&!cronFinal.source&&!cronFinal.billing&&own?.command===JOBS[2].command&&own?.active===false)
 await sql(window.restore)
 await sql("select cron.alter_job((select jobid from cron.job where jobname='goalloom-sync-runtime-cleanup'),active:=true);")
 const final=await query(snapshot),cleanup=await query("select jsonb_build_object('command',command,'active',active,'schedule',schedule) from cron.job where jobname='goalloom-sync-runtime-cleanup';")
 check('final_commands_owner_facts_cleanup_and_privileges_preserved',json(final.jobs)===json(inspection.state.jobs)&&json(final.protected)===json(inspection.state.protected)&&json(cleanup)===json(originalCleanup)&&!(await query("select jsonb_build_object('update',has_table_privilege(current_user,'cron.job','UPDATE'),'maintain',has_table_privilege(current_user,'cron.job','MAINTAIN'));")).update)
 return {metadata,oldLockFailure:oldLock.stderr,nullApiFailure:nullCall.stderr,cronRun,cronFinal,cronJobs,finalJobs:final.jobs,concurrencyBoundary:'Root-approved sole cron writer or all writers obeying the same advisory lock. Observed drift is rejected; an administrator bypassing coordination can race the guard/API write. No stronger external-editor serialization is claimed.',upstream:'https://github.com/citusdata/pg_cron/blob/v1.6.4/src/job_metadata.c',productionMetadata:'cron-api-production-readback.json'}
}
