/**
 * [INPUT]: Exact0033 source and a parent-leased development PostgreSQL0032 window.
 * [OUTPUT]: A bounded rollback-only SQL acceptance artifact; default never loads credentials.
 * [POS]: Actual PostgreSQL installation/observation acceptance, separate from production apply.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {ROOT,hash,json,inputs,schemaSql,jobsSql,pauseSql} from './source.mjs'
import {save,BASE,finiteError,readJson} from './io.mjs'
export async function postgresSql(id){
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('invalid_arguments')
 const migration=await readFile(resolve(ROOT,'supabase/migrations/0033_billing_worker_observation.sql'),'utf8')
 return `begin;set local application_name='bill29-pg:${id}';set local lock_timeout='3s';set local statement_timeout='40s';
 select pg_advisory_xact_lock(hashtextextended('goalloom-bill29-0033-acceptance',0));
 do $guard$ begin
 if not exists(select 1 from service_private.policy where environment='development' and project_ref='asqyvcnxdltzzfutbbqy' and not enabled)
 or exists(select 1 from public.billing_policy where enabled) or exists(select 1 from service_private.lifecycle_policy where enabled or independent_ledger_ready or restore_admission_ready or cleanup_wiring_ready)
 or to_regclass('service_private.worker_dispatches') is not null then raise exception 'acceptance_precondition';end if;
 end $guard$;
 ${migration}
 create temporary table acceptance_checks(name text primary key);
 create function pg_temp.check(p_ok boolean,p_name text) returns void language plpgsql as $$ begin
 if p_ok is distinct from true then raise exception 'acceptance_failed:%',p_name;end if;
 insert into acceptance_checks values(p_name);end $$;
 select pg_temp.check((select count(*)=2 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='service_private'
 and c.relname in ('worker_dispatches','worker_observation') and c.relrowsecurity),'private_tables_rls');
 select pg_temp.check(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='service_private'
 and c.relname in ('worker_dispatches','worker_observation') and (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE'))),'no_client_table_access');
 select pg_temp.check(not exists(select 1 from pg_proc p where p.oid in ('service_private.dispatch_production_worker(text)'::regprocedure,'service_private.observe_production_workers()'::regprocedure,'service_private.production_worker_health()'::regprocedure)
 and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))),'no_client_function_access');
 do $wrong$ begin
 begin perform service_private.dispatch_production_worker('other');raise exception 'missing_refusal';exception when others then if sqlerrm<>'worker_configuration' then raise;end if;end;
 begin perform service_private.dispatch_production_worker('billing');raise exception 'missing_refusal';exception when others then if sqlerrm<>'worker_configuration' then raise;end if;end;
 end $wrong$;
 select pg_temp.check(true,'wrong_worker_and_environment_refused');
 -- This policy change is transaction-local and rolls back; no existing business job is dispatched.
 update service_private.policy set environment='production',project_ref='keqprrgvcefqdwnxaafv' where id=1;
 insert into service_private.worker_dispatches(request_id,worker,dispatched_at) values
 (-933001,'billing',clock_timestamp()),(-933002,'lifecycle',clock_timestamp()),
 (-933003,'billing',clock_timestamp()),(-933004,'billing',clock_timestamp()),(-933005,'billing',clock_timestamp()),
 (-933006,'billing',clock_timestamp()),(-933007,'billing',clock_timestamp()),
 (-933008,'billing',clock_timestamp()-interval '4 minutes'),(-933009,'billing',clock_timestamp());
 select pg_temp.check(service_private.dispatch_production_worker('billing') is null,'pending_dispatch_not_duplicated');
 insert into net._http_response(id,status_code,timed_out,error_msg,content) values
 (-933001,200,false,null,'{"complete":2,"retry":1,"elapsedMs":21,"ignored":"private-payload-marker"}'),
 (-933002,200,false,null,'{"version":1,"exported":1,"progressed":2,"pending":1,"authDeleted":0,"renewalPending":1}'),
 (-933003,500,false,null,'private-payload-marker'),(-933004,null,true,'private-error-marker',null),
 (-933005,200,false,null,'invalid-json-private-payload-marker'),
 (-933006,200,false,null,'{"complete":"1","retry":0,"elapsedMs":1}'),
 (-933007,200,false,null,'{"complete":-1,"retry":0,"elapsedMs":1}');
 select service_private.observe_production_workers();
 select pg_temp.check((select outcome='complete' and counters='{"complete":2,"retry":1,"elapsedMs":21}'::jsonb from service_private.worker_dispatches where request_id=-933001),'billing_completion_exact_counters');
 select pg_temp.check((select outcome='complete' and counters->>'pending'='1' and counters->>'renewalPending'='1' from service_private.worker_dispatches where request_id=-933002),'lifecycle_pending_is_observable');
 select pg_temp.check((select outcome='http_failure' and http_status=500 and counters is null from service_private.worker_dispatches where request_id=-933003),'http_failure_attributed');
 select pg_temp.check((select outcome='transport_failure' and counters is null from service_private.worker_dispatches where request_id=-933004),'transport_failure_attributed');
 select pg_temp.check((select count(*)=3 from service_private.worker_dispatches where request_id in(-933005,-933006,-933007) and outcome='invalid_result' and counters is null),'malformed_and_nonfinite_results_refused');
 select pg_temp.check((select outcome='response_missing' from service_private.worker_dispatches where request_id=-933008),'missing_response_after_boundary');
 select pg_temp.check((select completed_at is null from service_private.worker_dispatches where request_id=-933009),'queued_request_not_completion');
 create temporary table completed_before as select request_id,completed_at,outcome,counters from service_private.worker_dispatches where completed_at is not null;
 select service_private.observe_production_workers();
 select pg_temp.check(not exists(select * from completed_before except select request_id,completed_at,outcome,counters from service_private.worker_dispatches),'completion_readback_idempotent');
 select pg_temp.check((select retention_at is null and retention_ok is null from service_private.worker_observation where id=1),'closed_readiness_skips_retention');
 select pg_temp.check((service_private.production_worker_health()->'workers'->'billing'->>'recentFailures')::integer=6,'health_failure_count');
 select pg_temp.check((service_private.production_worker_health()->'billing'->>'overdueGrace')::integer=0,'health_original_grace_projection');
 select pg_temp.check(service_private.production_worker_health()::text not like '%private-%','health_has_no_raw_payload');
 select pg_temp.check((select count(*)=0 from net.http_request_queue where url like '%keqprrgvcefqdwnxaafv.supabase.co/functions/v1/%/worker'),'no_external_worker_dispatch');
 select jsonb_build_object('ok',true,'checks',(select count(*) from acceptance_checks),'names',(select jsonb_agg(name order by name) from acceptance_checks),
 'postgres',current_setting('server_version'),'scope','Actual PostgreSQL0033 installation/observations under rollback. No real worker dispatch or persistent change.') as acceptance;
 rollback;`
}
if(process.argv[1]===new globalThis.URL(import.meta.url).pathname){
 try{
  const args=process.argv.slice(2)
  if(args.length===1&&args[0]==='--plan'){
   const id=randomUUID(),sql=await postgresSql(id),plan={version:1,project:'asqyvcnxdltzzfutbbqy',id,sql,sha256:hash(sql),productionWrites:0,run:false}
   const path=resolve(BASE,`postgres-${id}.json`);await save(path,plan);console.log(JSON.stringify({ok:true,path,sha256:plan.sha256,credentialReads:0,networkRequests:0}))
  }else if(args.length===2&&args[0]==='--grammar'){
   const evidence=await readJson(resolve(args[1])),source=await inputs(),{sqlGrammarProgram}=await import('../../d2-sql-grammar.mjs')
   const sqlInputs=[{name:'schema-install',sql:schemaSql(source,evidence.baseline,evidence.intent)},{name:'jobs',sql:jobsSql},{name:'pause',sql:pauseSql},{name:'0033-acceptance',sql:await postgresSql(randomUUID())}]
   const result=spawnSync('/Applications/Xcode.app/Contents/Developer/usr/bin/python3',['-c',sqlGrammarProgram,'/private/tmp/goalloom-d2-sql-parser'],{input:JSON.stringify({sqlInputs}),encoding:'utf8',maxBuffer:16*1024*1024,timeout:60000})
   if(result.status!==0||result.error)throw Error('grammar_parser_failed')
   const report=JSON.parse(result.stdout),path=resolve(BASE,`grammar-${randomUUID()}.json`);await save(path,report)
   console.log(JSON.stringify({ok:report.ok,path,reports:report.reports.map(r=>({name:r.name,sha256:r.sha256,statements:r.statements,errors:r.errors})),remoteRequests:0,credentialReads:0}));if(!report.ok)process.exitCode=1
  }else if(args.length===5&&args[0]==='--run'&&args[2]==='--reviewed'&&args[4]==='--development-lease'){
   // Parent dispatches this exact command only after granting its exclusive development window.
   const plan=await readJson(resolve(args[1]));if(plan.project!=='asqyvcnxdltzzfutbbqy'||hash(plan.sql)!==args[3]||plan.sha256!==args[3]||await postgresSql(plan.id)!==plan.sql)throw Error('plan_changed')
   await save(resolve(BASE,`postgres-${plan.id}.intent.json`),{project:plan.project,sqlSha256:plan.sha256,at:new Date().toISOString()})
   const {client}=await import('../../../hosted-ai/client.mjs'),db=await client()
   const snapshot="select to_regclass('service_private.worker_dispatches') is null and to_regclass('service_private.worker_observation') is null and to_regprocedure('service_private.dispatch_production_worker(text)') is null and to_regprocedure('service_private.observe_production_workers()') is null and to_regprocedure('service_private.production_worker_health()') is null as absent, (select jsonb_agg(to_jsonb(b) order by id) from public.ai_budget b) as budget, (select to_jsonb(p) from service_private.policy p where id=1) as policy, (select to_jsonb(p) from service_private.lifecycle_policy p where id=1) as lifecycle, (select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by subject_id),'')) from public.ai_protection p) as protection, (select jsonb_agg(jsonb_build_object('jobid',jobid,'active',active,'commandHash',md5(command)) order by jobid) from cron.job) as cron;"
   const before=await db.query(snapshot)
   const rows=await db.query(plan.sql,false),result=rows.find(r=>r.acceptance)?.acceptance
   const after=await db.query(snapshot)
   if(!result?.ok||!before[0]?.absent||JSON.stringify(before)!==JSON.stringify(after))throw Error('protected_state_changed')
   const report={ok:true,sqlSha256:plan.sha256,result,restored:true,productionWrites:0,persistentWrites:0,modelCalls:0}
   await save(resolve(BASE,`postgres-${plan.id}.result.json`),report);console.log(JSON.stringify(report))
  }else throw Error('invalid_arguments')
 }catch(error){console.log(JSON.stringify({ok:false,...finiteError(error),noReplay:true}));process.exitCode=1}
}
