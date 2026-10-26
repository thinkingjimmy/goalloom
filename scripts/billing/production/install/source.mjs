/**
 * [INPUT]: Local reviewed migrations, six Edge entries and pinned build dependencies.
 * [OUTPUT]: Exact executable artifacts, input hashes and production-only SQL stages.
 * [POS]: Credential-free production installation preparation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {readFile,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {resolve,dirname} from 'node:path'
export const ROOT=resolve(new globalThis.URL('../../../../',import.meta.url).pathname)
export const REF='keqprrgvcefqdwnxaafv',URL=`https://${REF}.supabase.co`
export const hash=value=>createHash('sha256').update(value).digest('hex')
export const json=value=>JSON.stringify(value,null,2)+'\n'
export const q=value=>`'${String(value).replaceAll("'","''")}'`
export const MODES=[['billing',false],['hosted-ai',true],['snapshot-url',true],['lifecycle',false],['deletion-receipt',false],['retained-retrieval',true]]
export const NAMES=['BILLING_CONFIG','BILLING_STRIPE_KEY','BILLING_STRIPE_WEBHOOK_SECRET','BILLING_RC_PUBLIC_KEY','BILLING_RC_SECRET_KEY','BILLING_RC_WEBHOOK_SECRET','BILLING_WORKER_SECRET','LIFECYCLE_WORKER_SECRET','DELETION_LEDGER_URL','DELETION_LEDGER_TOKEN','DELETION_LEDGER_STORE_ID','SNAPSHOT_PRODUCER_SHA256']
export const JOBS=[
 {name:'goalloom-billing-worker-production',command:"select service_private.dispatch_production_worker('billing');"},
 {name:'goalloom-lifecycle-worker-production',command:"select service_private.dispatch_production_worker('lifecycle');"},
 {name:'goalloom-worker-observation-production',command:'select service_private.observe_production_workers();'},
]
export async function inputs(){
 delete process.env.ESBUILD_BINARY_PATH
 const {build}=await import('esbuild'),require=createRequire('/private/tmp/goalloom-billing-runtime/package.json'),stripe=require.resolve('stripe')
 if(JSON.parse(await readFile(resolve(dirname(stripe),'../package.json'),'utf8')).version!=='22.6.0')throw Error('pinned_sdk_required')
 const paths=new Set((await readdir(resolve(ROOT,'scripts/billing/production/install'))).filter(x=>x.endsWith('.mjs')&&!x.startsWith('acceptance')).map(x=>'scripts/billing/production/install/'+x))
 paths.add('scripts/deploy/edge-source.mjs');paths.add('package.json');paths.add('pnpm-lock.yaml')
 const migrations=await Promise.all((await readdir(resolve(ROOT,'supabase/migrations'))).filter(x=>/^\d{4}_.*\.sql$/.test(x)).sort().map(async file=>{
  const path='supabase/migrations/'+file,sql=await readFile(resolve(ROOT,path),'utf8');paths.add(path)
  return{version:file.slice(0,4),name:file.slice(5,-4),path,sql,sha256:hash(sql)}
 }))
 if(migrations.length!==33||migrations.some((m,i)=>Number(m.version)!==i+1))throw Error('migration_set_changed')
 const edges=[]
 for(const [slug,verifyJwt] of MODES){
  const result=await build({absWorkingDir:ROOT,entryPoints:[`supabase/functions/${slug}/index.ts`],bundle:true,write:false,metafile:true,format:'esm',platform:'node',target:'es2022',alias:{stripe:resolve(dirname(stripe),'../esm/stripe.esm.worker.js')},external:['node:*'],logLevel:'silent'})
  for(const path of Object.keys(result.metafile.inputs))paths.add(path)
  edges.push({slug,verifyJwt,source:result.outputFiles[0].text,sha256:hash(result.outputFiles[0].contents)})
 }
 const fingerprints=await Promise.all([...paths].sort().map(async path=>({path,sha256:hash(await readFile(resolve(ROOT,path)))})))
 return{migrations,edges,fingerprints}
}
export const closedSql=`select (select environment='production' and project_ref='${REF}' and not enabled from service_private.policy where id=1)
 and not exists(select 1 from public.billing_policy where enabled)
 and not exists(select 1 from public.billing_sources where enabled)
 and (select not enabled and not independent_ledger_ready and not restore_admission_ready and not cleanup_wiring_ready from service_private.lifecycle_policy where id=1) as closed;`
const digest=expr=>`encode(sha256(convert_to((${expr})::text,'UTF8')),'hex')`
// Map subjects back to their original owners when checking original AI accounting after0025.
export function preservationSql(installed=false){
 const rows=table=>installed?`select (to_jsonb(x)-'subject_id')||jsonb_build_object('user_id',a.user_id) body from public.${table} x join service_private.account_lifecycle a on a.subject_id=x.subject_id`:`select to_jsonb(x) body from public.${table} x`
 const fp=sql=>`(select ${digest("coalesce(string_agg(h,'' order by h),'')")} from(select ${digest('body')} h from(${sql}) b) d)`
 return `select jsonb_build_object('budget',${fp('select to_jsonb(x) body from public.ai_budget x')},
 'protection',${fp(rows('ai_protection'))},'actions',${fp(rows('ai_actions'))},'limits',${fp(rows('ai_limit_events'))},
 'workspaces',${fp('select to_jsonb(x) body from public.workspaces x')},
 'devices',${fp("select to_jsonb(x)-'service_version' body from public.devices x")},
 'authUsers',(select count(*) from auth.users),'storageObjects',(select count(*) from storage.objects)) as protected;`
}
export function schemaSql(source,baseline,intent){
 if(!/^bill29-install:[a-f0-9-]{36}$/.test(intent)||baseline.history.length!==13)throw Error('schema_baseline_required')
 const pending=source.migrations.slice(13)
 return `begin;set local application_name=${q(intent)};set local timezone='UTC';set local lock_timeout='5s';set local statement_timeout='50s';
 select pg_advisory_xact_lock(hashtextextended('goalloom-production-deploy',0));
 lock table supabase_migrations.schema_migrations,public.ai_budget,public.ai_actions,public.ai_protection,public.ai_limit_events,public.workspaces,public.devices in access exclusive mode;
 do $preflight$ begin
 if exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and application_name like 'bill29-install:%' and state<>'idle')
 or exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid join pg_class c on c.oid=l.relation join pg_namespace n on n.oid=c.relnamespace
  where l.pid<>pg_backend_pid() and a.state<>'idle' and l.granted and n.nspname in ('public','service_private','auth','storage')
  and l.mode in ('RowExclusiveLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock'))
 or exists(select 1 from public.ai_actions where status in ('running','unknown')) then raise exception 'accepted_work_not_drained';end if;
 if (select ${digest("coalesce(jsonb_agg(to_jsonb(h) order by version),'[]'::jsonb)")} from supabase_migrations.schema_migrations h)<>${q(baseline.historyDigest)} then raise exception 'migration_history_changed';end if;
 if (select protected from(${preservationSql(false).trim().replace(/;$/,'')}) b)<>${q(JSON.stringify(baseline.protected))}::jsonb then raise exception 'protected_state_changed';end if;
 end $preflight$;
 ${pending.map(m=>`${m.sql}
 ${m.version==='0018'?`update service_private.policy set environment='production',project_ref='${REF}' where id=1 and not enabled and environment='development';
 insert into service_private.migrations(version,sha256) values ${source.migrations.slice(13,18).map(x=>`(${q(x.version)},${q(x.sha256)})`).join(',')};`:Number(m.version)>18?`insert into service_private.migrations(version,sha256) values(${q(m.version)},${q(m.sha256)});`:''}
 insert into supabase_migrations.schema_migrations(version,name,statements) values(${q(m.version)},${q(m.name)},array[${q(m.sql)}]::text[]);`).join('\n')}
 do $postflight$ begin
 if not (select closed from(${closedSql.trim().replace(/;$/,'')}) c) then raise exception 'readiness_not_closed';end if;
 if (select protected from(${preservationSql(true).trim().replace(/;$/,'')}) b)<>${q(JSON.stringify(baseline.protected))}::jsonb then raise exception 'protected_state_changed';end if;
 end $postflight$;
 notify pgrst,'reload schema';commit;`
}
export const jobStateSql=`select jobname,schedule,active,command from cron.job where jobname in(${JOBS.map(x=>q(x.name)).join(',')}) order by jobname;`
export const jobsSql=`begin;set local lock_timeout='5s';set local statement_timeout='30s';
 select pg_advisory_xact_lock(hashtextextended('goalloom-production-deploy',0));
 do $closed$ begin if not(select closed from(${closedSql.trim().replace(/;$/,'')}) c) then raise exception 'readiness_not_closed';end if;
 if exists(select 1 from cron.job where jobname in(${JOBS.map(x=>q(x.name)).join(',')})) then raise exception 'worker_job_exists';end if;end $closed$;
 ${JOBS.map(job=>`select cron.schedule(${q(job.name)},'* * * * *',${q(job.command)});
 select cron.alter_job((select jobid from cron.job where jobname=${q(job.name)}),active:=false);`).join('\n')}
 commit;`
export const pauseSql=`begin;set local lock_timeout='5s';set local statement_timeout='10s';
 ${JOBS.map(job=>`select cron.alter_job(jobid,active:=false) from cron.job where jobname=${q(job.name)};`).join('\n')}
 commit;`
