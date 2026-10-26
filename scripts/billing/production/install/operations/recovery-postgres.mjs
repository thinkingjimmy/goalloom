/**
 * [INPUT]: Existing bill29 Docker socket/image, exact migrations and selected recovery SQL.
 * [OUTPUT]: Focused real PostgreSQL/pg_cron window, role or continuous-recovery evidence in one disposable network-none container.
 * [POS]: Selected recovery E2E only. Original installation/rollback acceptance is not rerun.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {setTimeout} from 'node:timers/promises'
import {ROOT,REF,inputs,hash,json,q,schemaSql,jobsSql,preservationSql,JOBS} from '../source.mjs'
import {save} from '../io.mjs'
import {windowSql,OUTPUT} from './recovery.mjs'
import {assertIsolated,recoveryLabel,temporaryPaths} from '../../../../lifecycle/recovery/isolation.mjs'
import {roleLockCases} from './recovery-role-acceptance.mjs'
import {reopenCases} from './reopen-postgres-cases.mjs'
const roleOnly=process.argv.length===3&&process.argv[2]==='--role-lock'
const reopenOnly=process.argv.length===3&&process.argv[2]==='--reopen'
if(process.argv.length!==2&&!roleOnly&&!reopenOnly)throw Error('invalid_arguments')
const socket='unix:///Users/jimmywong/.colima/bill29/docker.sock',id=randomUUID(),out=resolve(reopenOnly?resolve(ROOT,'output/tests/billing/desktop/bill29-reopen/backend'):OUTPUT,`postgres-${id}`),name=`goalloom-bill29-window-${id}`,commands=[],checks=[]
await mkdir(out,{recursive:true,mode:0o700})
let container,identity,report,cronEvidence=null,executionRole='postgres'
async function docker(args,input,{allowFailure=false}={}){
 const result=await new Promise((done,fail)=>{const p=spawn('docker',['--host',socket,...args],{env:{...process.env,DOCKER_CONFIG:'/private/tmp/goalloom-bill29-docker'},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';const timer=globalThis.setTimeout(()=>p.kill('SIGTERM'),60000);p.stdout.on('data',c=>stdout+=c);p.stderr.on('data',c=>stderr+=c);p.on('error',fail);p.on('close',code=>{clearTimeout(timer);done({code,stdout:stdout.trim(),stderr:stderr.trim()})});p.stdin.end(input??'')})
 commands.push({operation:args[0],argumentHash:hash(json(args)),inputSha256:input?hash(input):null,exit:result.code})
 if(result.code!==0&&!allowFailure)throw Object.assign(Error('local_postgres_step_failed'),{sqlState:result.stderr.match(/ERROR:\s+([A-Z0-9]{5})/)?.[1],detail:result.stderr.slice(-1600)})
 return result
}
async function boundary(){const data=JSON.parse((await docker(['inspect',container])).stdout)[0];assertIsolated(data,identity);return data}
const psql=['psql','-h','/var/run/postgresql','-X','-q','-v','ON_ERROR_STOP=1','--set','VERBOSITY=terse','-t','-A','-U','postgres','-d','postgres']
async function sql(text,{whole=false,allowFailure=false,sequence,role=executionRole}={}){
 await boundary()
 const options=[...psql];options[options.indexOf('-U')+1]=role
 return docker(['exec',...(whole||sequence?[]:['--interactive']),container,...options,...(sequence?sequence.flatMap(x=>['-c',x]):whole?['-c',text]:[])],whole||sequence?undefined:text,{allowFailure})
}
async function query(text){const r=await sql(text);return JSON.parse(r.stdout.split('\n').filter(Boolean).at(-1))}
const check=(name,condition)=>{assert(condition,name);checks.push(name)}
const platform=`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create schema auth;create table auth.users(id uuid primary key,email text,deleted_at timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users);
create table auth.identities(id uuid primary key,user_id uuid references auth.users,provider text,identity_data jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean);
create table storage.objects(id uuid primary key,bucket_id text,name text,metadata jsonb);
create schema realtime;create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;
create schema extensions;create schema vault;create extension pg_cron;create extension pg_net with schema extensions;create extension supabase_vault with schema vault;
create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);`
const snapshot=`select jsonb_build_object('serverNow',clock_timestamp(),'policy',(select to_jsonb(p) from service_private.policy p where id=1),'billingPolicy',(select to_jsonb(p) from public.billing_policy p where environment='production'),'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1),'source',(select to_jsonb(s) from public.billing_sources s where environment='production' and source='stripe'),'jobs',(select jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active,'command',command) order by jobname) from cron.job where jobname like 'goalloom-%-production'),'protected',(select protected from(${preservationSql(true).replace(/;\s*$/,'')}) p)) as state;`
const flags=`select jsonb_build_object('source',(select enabled from public.billing_sources where environment='production' and source='stripe'),'billing',(select enabled from public.billing_policy where environment='production'),'cloud',(select enabled from service_private.policy where id=1),'lifecycle',(select enabled or independent_ledger_ready or restore_admission_ready or cleanup_wiring_ready or restore_blocked from service_private.lifecycle_policy where id=1),'queued',(select count(*) from net.http_request_queue),'dispatches',(select count(*) from service_private.worker_dispatches)) as flags;`
try{
 const image=JSON.parse((await docker(['image','inspect','goalloom-recovery-local:bill29'])).stdout)[0]
 assert(image.Config.User==='postgres'&&!Object.keys(image.Config.Volumes??{}).length&&!Object.keys(image.Config.ExposedPorts??{}).length,'prepared_image_changed')
 const initializer=(await readFile(resolve(ROOT,'scripts/lifecycle/recovery/postgres.sh'),'utf8')).replace('-c shared_preload_libraries= ','-c shared_preload_libraries=pg_cron,pg_net -c cron.database_name=postgres -c cron.host=/var/run/postgresql ')
 const tmpfs=temporaryPaths.flatMap(p=>['--tmpfs',`${p}:rw,nosuid,nodev,noexec,size=${p==='/recovery'?805306368:67108864},mode=1777`])
 container=(await docker(['run','--detach','--name',name,'--network','none','--read-only','--user','postgres','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','128','--memory','1g','--cpus','2','--label',`${recoveryLabel}=${id}`,...tmpfs,'--entrypoint','/bin/sh',image.Id,'-c',initializer])).stdout
 const started=JSON.parse((await docker(['inspect',container])).stdout)[0];identity={id,containerId:container,image:image.Id,startedAt:started.State.StartedAt};await boundary()
 for(let attempt=0;;attempt++){const r=await docker(['exec',container,'pg_isready','-h','/var/run/postgresql','-U','postgres'],undefined,{allowFailure:true});if(!r.code)break;if(attempt>=39)throw Error('local_postgres_not_ready');await setTimeout(250)}
 const source=await inputs();await sql(platform)
 await sql('alter system set cron.launch_active_jobs=off;select pg_reload_conf();')
 await sql(source.migrations.slice(0,13).map(m=>m.sql+`\ninsert into supabase_migrations.schema_migrations values(${q(m.version)},array[${q(m.sql)}],${q(m.name)});`).join('\n'))
 await sql(`insert into auth.users values('93300000-0000-4000-8000-000000000001','window-local@goalloom.test',null);
 insert into public.ai_budget(id,limit_micro,spent_micro,environment,policy) values('integration-shared',10000000,123456,'production','authenticated');`)
 const protectedBefore=(await query(`select jsonb_build_object('protected',protected) from(${preservationSql(false).replace(/;\s*$/,'')}) p;`)).protected
 const historyDigest=(await query("select jsonb_build_object('digest',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(h) order by version),'[]'::jsonb)::text,'UTF8')),'hex')) from supabase_migrations.schema_migrations h;")).digest
 await sql(schemaSql(source,{history:source.migrations.slice(0,13),historyDigest,protected:protectedBefore},`bill29-install:${randomUUID()}`))
 if(roleOnly||reopenOnly){
  await sql(`create role window_operator login nosuperuser nocreatedb nocreaterole noinherit;
  grant usage on schema cron,auth,storage,net,extensions,service_private to window_operator;
  grant select on all tables in schema auth,storage,net to window_operator;
  grant select on cron.job,cron.job_run_details to window_operator;
  grant execute on function cron.alter_job(bigint,text,text,text,text,boolean),cron.schedule(text,text,text) to window_operator;
  do $ownership$ declare r record;begin
   for r in select c.oid::regclass name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','service_private') and c.relkind in('r','p') loop execute format('alter table %s owner to window_operator',r.name);end loop;
   for r in select p.oid::regprocedure name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','service_private') loop execute format('alter function %s owner to window_operator',r.name);end loop;
  end $ownership$;`)
  if(reopenOnly)await sql('alter role window_operator bypassrls;')
  executionRole='window_operator'
 }
 await sql(jobsSql)
 await sql(`insert into public.billing_sources(environment,source,account_id,rc_project,rc_app,monthly_price,annual_price) values('production','stripe','acct_1QvwdlITpGuR8ZMB','projd720c733','app31d218cbde','price_1UUS1EITpGuR8ZMB0dLbeL23','price_1UUS1OITpGuR8ZMBkPCS02CR');
 select cron.schedule('goalloom-sync-runtime-cleanup','*/5 * * * *','select 1;');`)
 const inspection={state:await query(snapshot)},window=windowSql(inspection,randomUUID()),originalCleanup=await query("select jsonb_build_object('command',command,'active',active,'schedule',schedule) from cron.job where jobname='goalloom-sync-runtime-cleanup';")
 await save(resolve(out,'inputs.json'),{image:image.Id,initializerSha256:hash(initializer),migrationSetup:source.migrations.map(({version,sha256})=>({version,sha256})),generated:Object.fromEntries(['arm','restore','finalize','read'].map(k=>[k,hash(window[k])])),recoverySourceSha256:hash(await readFile(resolve(ROOT,'scripts/billing/production/install/operations/recovery.mjs'))),setupOnly:'Exact migration load is fixture setup, not a rerun of installer31/rollback18 acceptance'})
 if(reopenOnly){
  const result=await reopenCases({sql,query,check,flags,snapshot,inspection,originalCleanup,out})
  report={ok:true,at:new Date().toISOString(),checks,commands,scope:'Only new continuous-recovery SQL, legacy-owner isolation and AI qualification cases. Exact migration load is fixture setup; historical installation/window/role/restore suites are not rerun.',...result,containerId:container,image:image.Id,platform:{node:process.version,os:process.platform,arch:process.arch,postgres:await query("select jsonb_build_object('version',version());")},productionWrites:0,providerCalls:0,modelCalls:0,realCredentialReads:0,launchReady:false}
 }else if(roleOnly){
  const result=await roleLockCases({sql,query,check,flags,snapshot,inspection,window,originalCleanup})
  report={ok:true,at:new Date().toISOString(),checks,commands,scope:'Focused non-superuser cron SELECT-only lock correction cases only; accepted13/22/9 suites not rerun.',...result,containerId:container,image:image.Id,platform:{node:process.version,os:process.platform,arch:process.arch,postgres:await query("select jsonb_build_object('version',version());")},productionWrites:0,providerCalls:0,modelCalls:0,realCredentialReads:0,launchReady:false}
 }else{
 await sql(window.arm);let state=await query(flags);check('arm_opens_exact_billing_source_and_policy_while_cloud_lifecycle_stay_closed',state.source&&state.billing&&!state.cloud&&!state.lifecycle)
 await sql(window.restore);check('restore_closes_owned_flags_and_restores_exact_original_commands',!(await query(flags)).source&&JSON.stringify((await query(snapshot)).jobs)===JSON.stringify(inspection.state.jobs))
 await sql("insert into public.billing_inbox(environment,provider,event_id,event_type,occurred_at,status,reason) values('production','revenuecat','fixture-test-event','TEST',clock_timestamp(),'ignored','source_disabled');")
 await sql(window.arm);check('ignored_revenuecat_test_row_does_not_become_actionable_work',(await query(flags)).source)
 // The observer proves the same exact-query guard without invoking a worker or needing any Vault credential.
 const rolled=await sql('',{sequence:['begin;',window.wrappers[2].command,"select jsonb_build_object('observations',(select count(*) from service_private.worker_observation));",'rollback;']})
 const inside=JSON.parse(rolled.stdout.split('\n').filter(Boolean).at(-1));check('whole_stored_command_matches_current_query_and_observation_is_rolled_back',inside.observations===1&&(await query("select jsonb_build_object('observations',count(*)) from service_private.worker_observation;")).observations===0&&(await query(flags)).queued===0)
 const substring=await sql(`begin;${window.wrappers[2].command}\nrollback;`,{whole:true,allowFailure:true});check('wrapper_substring_query_refuses_exact_command_mismatch',substring.code!==0&&substring.stderr.includes('worker_job_drift'))
 await sql(window.restore)
 await sql("insert into public.billing_inbox(environment,provider,event_id,event_type,occurred_at,status) values('production','stripe','evt_WindowPending','invoice.paid',clock_timestamp(),'pending');")
 let denied=await sql(window.arm,{allowFailure:true});check('pending_work_refuses_arm_without_opening_flags',denied.code!==0&&!(await query(flags)).source)
 await sql("update public.billing_inbox set status='ignored' where event_id='evt_WindowPending';update public.billing_sources set rc_app='appforeign' where environment='production';")
 denied=await sql(window.arm,{allowFailure:true});check('binding_drift_refuses_arm_without_opening_flags',denied.code!==0&&!(await query(flags)).source)
 await sql("update public.billing_sources set rc_app='app31d218cbde' where environment='production';")
 await sql(window.arm)
 await sql("update public.billing_inbox set status='pending',reason=null where event_id='evt_WindowPending';")
 await sql(window.wrappers[0].command,{whole:true});state=await query(flags)
 const pending=await query("select jsonb_build_object('status',status,'attempts',attempts,'lease',lease) from public.billing_inbox where event_id='evt_WindowPending';")
 check('new_pending_work_stops_dispatch_closes_flags_and_preserves_original_record',!state.source&&!state.billing&&state.queued===0&&pending.status==='pending'&&pending.attempts===0&&pending.lease===null)
 await sql(window.restore);await sql("update public.billing_inbox set status='ignored' where event_id='evt_WindowPending';")
 const expired=windowSql({state:{...inspection.state,serverNow:new Date(Date.now()-6*60_000).toISOString()}},randomUUID())
 await sql(window.arm)
 for(let i=0;i<JOBS.length;i++)await sql(`select cron.alter_job((select jobid from cron.job where jobname=${q(JOBS[i].name)}),command:=${q(expired.wrappers[i].command)},active:=true);`)
 for(const wrapper of expired.wrappers)await sql(wrapper.command,{whole:true})
 state=await query(flags);check('expired_exact_wrappers_self_close_and_restore_each_original_paused_job',!state.source&&!state.billing&&JSON.stringify((await query(snapshot)).jobs)===JSON.stringify(inspection.state.jobs)&&state.queued===0)
 await sql(window.finalize);const read=await query(window.read);check('actual_finalize_and_read_record_closed_policies_without_product_retention',read.policiesClosed&&read.source.enabled===false&&read.health.observation.retentionAt===null)
 // Actual pg_cron scheduling is isolated to one expired observation wrapper; no worker job is active.
 await sql(window.arm)
 await sql(`select cron.alter_job(jobid,active:=false) from cron.job;
 select cron.alter_job((select jobid from cron.job where jobname=${q(JOBS[2].name)}),command:=${q(expired.wrappers[2].command)},active:=true);alter system set cron.launch_active_jobs=on;select pg_reload_conf();`)
 let cronRun=null
 for(let elapsed=0;elapsed<75;elapsed++){
  const current=await query(`select jsonb_build_object('active',(select active from cron.job where jobname=${q(JOBS[2].name)}),'run',(select jsonb_build_object('status',status,'message',return_message,'startTime',start_time,'endTime',end_time) from cron.job_run_details where jobid=(select jobid from cron.job where jobname=${q(JOBS[2].name)}) order by runid desc limit 1));`)
  if(current.run)cronRun=current.run
  if(!current.active&&current.run?.endTime&&['succeeded','failed'].includes(current.run.status))break
  if(current.run?.status==='failed'&&current.run?.message?.includes('connection failed'))break
  await setTimeout(1000)
 }
 const cronFinal=await query(flags),cronJobs=(await query(snapshot)).jobs
 cronEvidence={cronRun,cronFinal,cronJobs}
 check('actual_cron_expiry_commit_closes_flags_and_restores_exact_own_command',cronRun!==null&&!cronFinal.source&&!cronFinal.billing&&cronJobs.find(j=>j.name===JOBS[2].name)?.command===JOBS[2].command&&cronJobs.find(j=>j.name===JOBS[2].name)?.active===false)
 await sql(window.restore)
 await sql("select cron.alter_job((select jobid from cron.job where jobname='goalloom-sync-runtime-cleanup'),active:=true);")
 const final=await query(snapshot);check('original_owner_ai_facts_and_cleanup_job_preserved',JSON.stringify(final.protected)===JSON.stringify(inspection.state.protected)&&JSON.stringify(originalCleanup)===JSON.stringify(await query("select jsonb_build_object('command',command,'active',active,'schedule',schedule) from cron.job where jobname='goalloom-sync-runtime-cleanup';")))
 state=await query(flags);check('no_network_request_committed_and_no_business_work_deleted',state.queued===0&&state.dispatches===0&&(await query("select jsonb_build_object('count',count(*)) from public.billing_inbox;")).count===2)
 report={ok:true,at:new Date().toISOString(),checks,commands,scope:'Focused generated-window SQL and actual expired pg_cron scheduling in PostgreSQL. Vault extension installed but no credentials required/read. No worker HTTP or original installer/rollback acceptance rerun.',cronRun,cronFinal,cronJobs,containerId:container,image:image.Id,platform:{node:process.version,os:process.platform,arch:process.arch,postgres:await query("select jsonb_build_object('version',version());")},productionWrites:0,providerCalls:0,modelCalls:0,realCredentialReads:0,launchReady:false}
 }
}catch(error){report={ok:false,at:new Date().toISOString(),checks,commands,code:error.message,sqlState:error.sqlState??null,detail:error.detail??null,cronEvidence,productionWrites:0};process.exitCode=1}
finally{
 if(container){try{const owned=JSON.parse((await docker(['inspect',container])).stdout)[0];assert(owned.Id===identity.containerId&&owned.Image===identity.image&&owned.Config.Labels[recoveryLabel]===id&&owned.Name===`/${name}`);await docker(['rm','--force',container]);report.ownedContainerRemoved=true}catch{report.ownedContainerRemoved=false;process.exitCode=1}}
 await save(resolve(out,'report.json'),report);console.log(JSON.stringify({ok:report.ok,checks:checks.length,evidence:resolve(out,'report.json'),code:report.code,detail:report.detail,ownedContainerRemoved:report.ownedContainerRemoved}))
}
