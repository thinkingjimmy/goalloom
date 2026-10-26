/**
 * [INPUT]: Already prepared dedicated local Docker socket and volume-free PostgreSQL17 image.
 * [OUTPUT]: Actual production-install and0033 rollback SQL evidence in one disposable network-none container.
 * [POS]: Installer-only local PostgreSQL acceptance; no provider, hosted database, model or existing container access.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {spawn} from 'node:child_process'
import {mkdir,readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {setTimeout} from 'node:timers/promises'
import {ROOT,REF,inputs,hash,json,q,schemaSql,preservationSql,closedSql,jobsSql,jobStateSql} from './source.mjs'
import {postgresSql} from './postgres.mjs'
import {save,BASE} from './io.mjs'
import {assertIsolated,recoveryLabel,temporaryPaths} from '../../../lifecycle/recovery/isolation.mjs'
const socket='unix:///Users/jimmywong/.colima/bill29/docker.sock',id=randomUUID(),name=`goalloom-bill29-installer-${id}`,out=resolve(BASE,`postgres-local-${id}`),checks=[],commands=[]
await mkdir(out,{mode:0o700})
const source=await inputs(),fingerprints=source.fingerprints
const args=process.argv.slice(2)
if(args.length&&!(args.length===2&&args[0]==='--execution-package'))throw Error('invalid_arguments')
const execution=args.length?resolve(args[1]):null
let container=null,identity=null,report
async function docker(args,input){
 const value=await new Promise((resolve,reject)=>{
  const child=spawn('docker',['--host',socket,...args],{stdio:['pipe','pipe','pipe'],env:{...process.env,DOCKER_CONFIG:'/private/tmp/goalloom-bill29-docker'}})
  let stdout='',stderr='';const timer=globalThis.setTimeout(()=>child.kill('SIGTERM'),60000)
  child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject)
  child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})});child.stdin.end(input??'')
 })
 commands.push({args:args.map(a=>a.startsWith('initdb ')?'<Unix-socket-only PostgreSQL initialization>':a),exit:value.code,inputSha256:input?hash(input):null})
 if(value.code!==0)throw Object.assign(Error('docker_step_failed'),{detail:value.stderr.slice(-2000),step:commands.length})
 return (args[0]==='logs'?value.stdout+'\n'+value.stderr:value.stdout).trim()
}
const sql=async(text,db='postgres')=>{await isolation(false);return docker(['exec','--interactive',container,'psql','-h','/var/run/postgresql','-X','-q','-v','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate','-t','-A','-U','postgres','-d',db],text)}
const query=async(text,db)=>{const result=await sql(text,db);return JSON.parse(result.split('\n').filter(Boolean).at(-1))}
const check=(name,value)=>{if(!value)throw Object.assign(Error('local_sql_assertion'),{check:name});checks.push(name)}
async function isolation(record=true){
 const d=JSON.parse(await docker(['inspect',container]))[0]
 assertIsolated(d,identity)
 if(record)check('container_isolated_'+checks.length,d.Name===`/${name}`&&d.Config.Labels['com.goalloom.billing-installer-acceptance']===id)
 return{id:d.Id,image:d.Image,network:d.HostConfig.NetworkMode,mounts:d.Mounts,ports:d.NetworkSettings.Ports,privileged:d.HostConfig.Privileged,user:d.Config.User,readonlyRoot:d.HostConfig.ReadonlyRootfs,tmpfs:d.HostConfig.Tmpfs,memory:d.HostConfig.Memory,pidsLimit:d.HostConfig.PidsLimit}
}
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
async function base(){
 await sql(platform)
 const prefix=source.migrations.slice(0,13).map(m=>m.sql+`\ninsert into supabase_migrations.schema_migrations values(${q(m.version)},array[${q(m.sql)}],${q(m.name)});`).join('\n')
 await sql(prefix)
 await sql(`insert into public.ai_budget(id,limit_micro,spent_micro,environment,policy) values('integration-shared',10000000,123456,'production','authenticated');
 insert into auth.users(id,email) values('93300000-0000-4000-8000-000000000001','installer-local@goalloom.test');
 insert into public.ai_protection(user_id,blocked,reason) values('93300000-0000-4000-8000-000000000001',true,'manual_review');
 insert into public.ai_actions(user_id,action_id,capability,environment,eligibility,status,model,rate_version,reserved_micro,charged_micro)
 values('93300000-0000-4000-8000-000000000001','93300000-0000-4000-8000-000000000002','evaluate','production','authenticated','failed','synthetic','synthetic',500000,123456);
 insert into public.ai_limit_events(user_id,action_id,environment,reason) values('93300000-0000-4000-8000-000000000001','93300000-0000-4000-8000-000000000003','production','account_protection');`)
}
try{
 const image=JSON.parse(await docker(['image','inspect','goalloom-recovery-local:bill29']))[0]
 check('volume_free_prepared_postgres_image',image.Config.User==='postgres'&&Object.keys(image.Config.Volumes??{}).length===0&&Object.keys(image.Config.ExposedPorts??{}).length===0)
 const initSource=await readFile(resolve(ROOT,'scripts/lifecycle/recovery/postgres.sh'),'utf8')
 const initializer=initSource.replace('-c shared_preload_libraries= ','-c shared_preload_libraries=pg_cron,pg_net -c cron.database_name=postgres ')
 check('reused_recovery_initializer_with_only_required_extension_preloads',initializer!==initSource)
 const tmpfs=temporaryPaths.flatMap(path=>['--tmpfs',`${path}:rw,nosuid,nodev,noexec,size=${path==='/recovery'?805306368:67108864},mode=1777`])
 container=await docker(['run','--detach','--name',name,'--network','none','--read-only','--user','postgres','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','128','--memory','1g','--cpus','2','--label',`${recoveryLabel}=${id}`,'--label',`com.goalloom.billing-installer-acceptance=${id}`,...tmpfs,'--entrypoint','/bin/sh',image.Id,'-c',initializer])
 identity={id,containerId:container,image:image.Id,startedAt:JSON.parse(await docker(['inspect',container]))[0].State.StartedAt}
 const boundary=await isolation()
 let ready=false
 for(let i=0;i<40&&!ready;i++){
  try{await docker(['exec',container,'pg_isready','-h','/var/run/postgresql','-U','postgres']);ready=true}catch(error){if(i===39)throw error;await setTimeout(250)}
 }
 await base();check('exact_0001_0013_installed',true)
 const protectedBefore=await query(`select row_to_json(b) from(${preservationSql(false).trim().replace(/;$/,'')}) b;`)
 const baseline={history:source.migrations.slice(0,13).map(m=>({version:m.version,name:m.name,sha256:m.sha256})),historyDigest:(await query("select json_build_object('digest',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(h) order by version),'[]'::jsonb)::text,'UTF8')),'hex')) from supabase_migrations.schema_migrations h;")).digest,protected:protectedBefore.protected}
 const installSql=schemaSql(source,baseline,`bill29-install:${id}`);await save(resolve(out,'sql-inputs.json'),{schemaSha256:hash(installSql),migration0033:source.migrations.at(-1).sha256,fingerprints,recoveryInitializerSha256:hash(initSource),actualInitializerSha256:hash(initializer),isolationGuardSha256:hash(await readFile(resolve(ROOT,'scripts/lifecycle/recovery/isolation.mjs')))})
 await sql(installSql);check('actual_20_forward_migrations_committed_locally',true)
 const protectedAfter=await query(`select row_to_json(b) from(${preservationSql(true).trim().replace(/;$/,'')}) b;`)
 check('production_owner_rekey_preserves_original_ai_facts_budget_protection',json(protectedBefore)===json(protectedAfter))
 const closed=await query(`select row_to_json(c) from(${closedSql.trim().replace(/;$/,'')}) c;`);check('all_admission_readiness_source_flags_closed',closed.closed===true)
 const history=await query("select json_agg(json_build_object('version',version,'name',name,'sha256',encode(sha256(convert_to(array_to_string(statements,''),'UTF8')),'hex')) order by version) from supabase_migrations.schema_migrations;")
 check('exact_committed_migration_history',json(history)===json(source.migrations.map(m=>({version:m.version,name:m.name,sha256:m.sha256}))))
 await sql(jobsSql);const jobs=await query(`select json_agg(to_jsonb(j) order by jobname) from(${jobStateSql.trim().replace(/;$/,'')}) j;`)
 check('actual_three_minute_jobs_created_inactive',jobs.length===3&&jobs.every(j=>j.active===false&&j.schedule==='* * * * *'))
 if(execution){
  const pkg=JSON.parse(await readFile(resolve(execution,'package.json'),'utf8'))
  check('closed_execution_package_identity',pkg.project===REF&&pkg.closed&&pkg.activationIncluded===false&&pkg.canaryWindowSeconds===180)
  for(const file of pkg.files)check('execution_sql_hash_'+file.path,hash(await readFile(resolve(execution,file.path)))===file.sha256)
  const arm=await readFile(resolve(execution,'canary-arm.sql'),'utf8'),restore=await readFile(resolve(execution,'canary-restore.sql'),'utf8')
  const body=arm.trim().replace(/^begin;/,'').replace(/commit;$/,'')
  let refused=false
  try{await sql(`begin;update public.billing_policy set enabled=true where environment='production';${body}\nrollback;`)}catch(error){refused=error.detail?.includes('P0001')===true}
  check('closed_canary_refuses_open_gate',refused&&(await query(`select row_to_json(c) from(${closedSql.trim().replace(/;$/,'')}) c;`)).closed)
  const future=await query(`begin;${body}\nselect json_agg(jsonb_build_object('active',active,'wrapper',left(command,47) like '-- goalloom-production-install-canary-v1%')) from cron.job;rollback;`)
  check('canary_arms_only_uncommitted_owned_three_jobs',future.length===3&&future.every(j=>j.active&&j.wrapper))
  const beforeCanary=await query(`select json_agg(to_jsonb(j) order by jobname) from(${jobStateSql.trim().replace(/;$/,'')}) j;`)
  check('rolled_back_arm_keeps_original_jobs_inactive',json(beforeCanary)===json(jobs))
  check('canary_deadline_fixture_is_exact_single_injection',arm.split("interval '3 minutes'").length===2)
  await sql(arm.replace("interval '3 minutes'","interval '-1 second'"))
  const wrappers=await query(`select json_agg(command) from cron.job where command like '-- goalloom-production-install-canary-v1%';`)
  for(const command of wrappers??[])await sql(command)
  const expired=await query(`select json_agg(to_jsonb(j) order by jobname) from(${jobStateSql.trim().replace(/;$/,'')}) j;`)
  check('actual_wrappers_self_restore_inactive_at_original_deadline',json(expired)===json(jobs))
  await sql(restore)
  const queue=await query("select json_build_object('queued',count(*)) from net.http_request_queue;")
  check('closed_canary_controls_dispatch_no_http',queue.queued===0)
  await sql(await readFile(resolve(execution,'canary-final-observe.sql'),'utf8'))
  const finalObservation=await query("select json_build_object('observed',observed_at is not null,'retentionSkipped',retention_at is null) from service_private.worker_observation where id=1;")
  check('guarded_final_observation_keeps_product_retention_closed',finalObservation.observed&&finalObservation.retentionSkipped)
  await save(resolve(out,'execution-package-result.json'),{ok:true,packageSha256:hash(await readFile(resolve(execution,'package.json'))),expiredDeadlineInjected:true,productionWindowSeconds:180,jobStateRestored:true,httpDispatched:0})
 }
 const healthProof=await query(`begin;
 insert into service_private.account_lifecycle(environment,subject_id,owner_tag) values('production','93310000-0000-4000-8000-000000000001',decode(repeat('33',32),'hex'));
 insert into public.billing_sources(environment,source,account_id,rc_project,rc_app,monthly_price,annual_price)
 values('production','stripe','acct_LocalFixture','projd720c733','applocalfixture','price_LocalMonth','price_LocalYear');
 insert into public.billing_accounts(environment,subject_id) values('production','93310000-0000-4000-8000-000000000001');
 insert into public.billing_customers(environment,subject_id,customer_id) values('production','93310000-0000-4000-8000-000000000001','cus_LocalFixture');
 insert into public.billing_subscriptions(environment,subject_id,subscription_id,customer_id,status,price_id,period_start,period_end,cancel_at_period_end,verified_at)
 values('production','93310000-0000-4000-8000-000000000001','sub_LocalFixture','cus_LocalFixture','past_due','price_LocalMonth',now()-interval '33 days',now()-interval '72 hours 1 minute',false,now());
 insert into public.billing_grace(environment,invoice_id,subject_id,subscription_id,starts_at,ends_at,active) values
 ('production','in_LocalDue','93310000-0000-4000-8000-000000000001','sub_LocalFixture',now()-interval '72 hours 1 minute',now()-interval '1 minute',true),
 ('production','in_LocalFuture','93310000-0000-4000-8000-000000000001','sub_LocalFixture',now()-interval '71 hours 59 minutes',now()+interval '1 minute',true);
 insert into service_private.workspace_lifecycle(environment,subject_id,workspace_id,generation,state,reason,closed_at,online_delete_by,next_due_at,lease,lease_until) values
 ('production','93310000-0000-4000-8000-000000000001','93310000-0000-4000-8000-000000000002','93310000-0000-4000-8000-000000000003','queued','explicit_cloud',now()-interval '168 hours 1 minute',now()-interval '1 minute',now()-interval '1 minute','93310000-0000-4000-8000-000000000004',now()-interval '1 minute'),
 ('production','93310000-0000-4000-8000-000000000001','93310000-0000-4000-8000-000000000005','93310000-0000-4000-8000-000000000006','queued','explicit_cloud',now()-interval '156 hours',now()+interval '12 hours',now()-interval '1 minute',null,null);
 select jsonb_build_object('health',service_private.production_worker_health(),'originalCutoff',(select ends_at from public.billing_grace where invoice_id='in_LocalDue'),'stillClosed',(select closed from(${closedSql.trim().replace(/;$/,'')}) c));
 rollback;`)
 await save(resolve(out,'health-boundaries-result.json'),healthProof)
 check('original_72h_cutoff_overdue_count_and_timestamp',healthProof.health.billing.overdueGrace===1&&healthProof.health.billing.oldestGraceCutoff===healthProof.originalCutoff)
 check('online_deletion_deadline_risk_due_work_and_leases',healthProof.health.lifecycle.overdueDeletion===1&&healthProof.health.lifecycle.deadlineRisk===2&&healthProof.health.lifecycle.dueGenerations===2&&healthProof.health.lifecycle.expiredLeases===1&&healthProof.stillClosed)
 // A second local database uses the unchanged0032 prerequisite and the reviewed0033 rollback script.
 await sql('create database worker_acceptance;')
 await sql(platform.replace('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;','').replace('create extension pg_cron;',''),'worker_acceptance')
 const through32=source.migrations.slice(0,32).map(m=>m.sql).join('\n')
 await sql(through32,'worker_acceptance')
 const before=await query("select json_build_object('absent',to_regclass('service_private.worker_dispatches') is null,'policy',(select to_jsonb(p) from service_private.policy p),'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p));",'worker_acceptance')
 const acceptance=await postgresSql(id),result=await query(acceptance,'worker_acceptance'),sqlAcceptance=result.acceptance??result
 await save(resolve(out,'rollback-result.json'),sqlAcceptance)
 check('actual_0033_rollback_acceptance',sqlAcceptance.ok===true&&sqlAcceptance.checks>=18)
 const after=await query("select json_build_object('absent',to_regclass('service_private.worker_dispatches') is null,'policy',(select to_jsonb(p) from service_private.policy p),'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p));",'worker_acceptance')
 check('rollback_restores_original_policy_and_new_schema_absence',before.absent===true&&json(before)===json(after))
 const finalBoundary=await isolation()
 const version=await sql('select version();')
 check('source_inputs_unchanged',json((await inputs()).fingerprints)===json(fingerprints))
 report={ok:true,checks:checks.length,names:checks,postgres:version,sqlAcceptance,productionInstall:{migrations:20,historyMatched:true,closed:true,protectedStateMatched:true},healthBoundaries:{original72HourCutoff:true,onlineDeletionRisk:true,closed:true},boundary,finalBoundary,image:{id:image.Id,sourceTag:'goalloom-recovery-local:bill29'},runtime:{node:process.version,platform:process.platform,arch:process.arch},scope:'Actual PostgreSQL17 in Linux aarch64 VM. Minimal local Auth/Storage/Realtime schema ports; no Supabase API services. Exact migrations and actual pg_net/pg_cron/Vault extensions; no HTTP dispatch or provider/model call.',productionWrites:0,hostedWrites:0,commands}
}catch(error){report={ok:false,checks:checks.length,names:checks,error:{code:error.message,step:error.step??null,check:error.check??null,detail:error.detail??null},commands};if(container)try{report.localPostgresLog=await docker(['logs','--tail','30',container])}catch{}process.exitCode=1}
finally{
 if(container){try{await isolation();await docker(['stop','--time','5',container]);await docker(['rm',container]);report.containerRemoved=true}catch{report.containerRemoved=false;process.exitCode=1}}
 report.checks=checks.length;report.names=[...checks]
 await save(resolve(out,'report.json'),report);console.log(JSON.stringify({ok:report.ok,checks:report.checks,containerRemoved:report.containerRemoved,path:resolve(out,'report.json')}))
}
