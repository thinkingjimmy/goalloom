/**
 * [INPUT]: Read-only persistent relation inventory and exact reviewed forward SQL strings.
 * [OUTPUT]: Hash-only snapshots, reusable original-inbox projection proofs and one bounded rollback gate transaction.
 * [POS]: D2 populated migration acceptance; no network, provider, worker or persistent configuration action.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {literal as q} from './d1-sync-fixtures.mjs'
export const LIMITS={statementMs:45000,lockMs:3000,maxRelations:256,maxRowsPerRelation:50000}
export const RUNTIME_TABLES=['cron.job_run_details','net.http_request_queue','net._http_response']
export const TOUCHED_OLD_TABLES=['auth.users','auth.sessions','public.devices','public.workspaces','public.device_roster','public.recovery_checkpoints','public.key_envelopes','public.ops','public.op_receipts',
 'service_private.policy','public.billing_accounts','public.billing_customers','public.billing_subscriptions','public.billing_transactions','public.billing_grace','public.billing_operations','public.billing_compensations','public.billing_inbox',
 'service_private.continuations','service_private.operation_aliases','public.ai_actions','public.ai_protection','public.ai_limit_events']
const ident=s=>`"${s.replaceAll('"','""')}"`
const table=t=>`${ident(t.schema)}.${ident(t.name)}`
const hash=s=>`encode(pg_catalog.sha256(convert_to(${s},'UTF8')),'hex')`
const aggregate=(source)=>`(select jsonb_build_object('rows',count(*),'capped',count(*)>${LIMITS.maxRowsPerRelation},'sha256',${hash("coalesce(string_agg(h,'' order by h),'')")}) from (select ${hash('body::text')} h from (${source} limit ${LIMITS.maxRowsPerRelation+1}) bounded) digests)`
const persistent="n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname!~'^pg_(toast_)?temp_'"
export const inventorySql=`select n.nspname as schema,c.relname as name,c.relkind as kind,
 (select onsp.nspname||'.'||o.relname from pg_depend d join pg_class o on o.oid=d.refobjid join pg_namespace onsp on onsp.oid=o.relnamespace
  where c.relkind='S' and d.classid='pg_class'::regclass and d.objid=c.oid and d.refclassid='pg_class'::regclass and d.deptype in ('a','i') limit 1) as owned_by,
 coalesce((select jsonb_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'[]'::jsonb) as columns
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where ${persistent} and c.relkind in ('r','p','m','S') order by n.nspname,c.relname;`
const rekeyed=new Set(['public.billing_accounts','public.billing_customers','public.billing_subscriptions','public.billing_transactions',
 'public.billing_grace','public.billing_operations','public.billing_compensations','public.billing_inbox','service_private.continuations',
 'service_private.operation_aliases','public.ai_actions','public.ai_protection','public.ai_limit_events'])
export function validateInventory(tables){
 assert(Array.isArray(tables)&&tables.length>0&&tables.length<=LIMITS.maxRelations,'Persistent inventory exceeds bounded gate scope')
 for(const t of tables)assert(typeof t.schema==='string'&&typeof t.name==='string'&&['r','p','m','S'].includes(t.kind)&&Array.isArray(t.columns)&&t.columns.every(x=>typeof x==='string'))
 return tables
}
export const isRuntime=t=>RUNTIME_TABLES.includes(`${t.schema}.${t.name}`)||t.kind==='S'&&(RUNTIME_TABLES.includes(t.owned_by)
 ||t.schema==='cron'&&t.name==='runid_seq'&&t.runtime_sequence==='pg_cron:1.6.4/cron.job_run_details.runid')
export const splitBusiness=(business,tables)=>({stable:Object.fromEntries(Object.entries(business).filter(([key])=>!tables.some(t=>`${t.schema}.${t.name}`===key&&isRuntime(t)))),
 runtime:Object.fromEntries(Object.entries(business).filter(([key])=>tables.some(t=>`${t.schema}.${t.name}`===key&&isRuntime(t))))})
export const safetySql=`select jsonb_build_object(
 'enabledUserTriggers',coalesce((select jsonb_agg(n.nspname||'.'||c.relname||':'||t.tgname order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and t.tgenabled<>'D' and n.nspname||'.'||c.relname=any(array[${TOUCHED_OLD_TABLES.map(q).join(',')}])), '[]'::jsonb),
 'ownedPersistentSequences',coalesce((select jsonb_agg(ns.nspname||'.'||s.relname order by ns.nspname,s.relname) from pg_class s join pg_namespace ns on ns.oid=s.relnamespace join pg_depend d on d.classid='pg_class'::regclass and d.objid=s.oid and d.refclassid='pg_class'::regclass and d.deptype in ('a','i') join pg_class o on o.oid=d.refobjid join pg_namespace no on no.oid=o.relnamespace
  where s.relkind='S' and no.nspname||'.'||o.relname=any(array[${TOUCHED_OLD_TABLES.map(q).join(',')}])), '[]'::jsonb),
 'unsafeDefaults',coalesce((select jsonb_agg(distinct n.nspname||'.'||c.relname||':'||a.attname) from pg_attrdef ad join pg_class c on c.oid=ad.adrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=ad.adnum
  where n.nspname||'.'||c.relname=any(array[${TOUCHED_OLD_TABLES.map(q).join(',')}]) and
   (pg_get_expr(ad.adbin,ad.adrelid)~*'nextval|net[.]|http|dblink|pg_notify|realtime[.]' or exists(select 1 from pg_depend d join pg_proc p on d.refclassid='pg_proc'::regclass and d.refobjid=p.oid join pg_namespace pn on pn.oid=p.pronamespace
    where d.classid='pg_attrdef'::regclass and d.objid=ad.oid and pn.nspname<>'pg_catalog' and not(p.proname='gen_random_uuid' and pn.nspname in ('public','extensions'))))), '[]'::jsonb)) as safety;`
export function businessSql(tables,{forward=false,normalizePolicy=forward}={}){
 validateInventory(tables)
 return `select jsonb_object_agg(key,value order by key) as fingerprints from (${tables.map(t=>{
  const key=`${t.schema}.${t.name}`
  let source
  if(t.kind==='S')source=`select jsonb_build_object('last_value',last_value,'is_called',is_called) as body from ${table(t)}`
  else{
   let body='to_jsonb(t)';let join=''
   if(forward&&rekeyed.has(key)){
    join=` left join service_private.account_lifecycle a on a.subject_id=t.subject_id and a.environment=${key==='public.ai_protection'?"(select environment from public.ai_budget where id='integration-shared')":'t.environment'}`
    body="(to_jsonb(t)-'subject_id')||jsonb_build_object('user_id',a.user_id)"
    if(key==='public.billing_inbox'){
     join+=' join pg_temp.d2_original_inbox r on (r.environment,r.provider,r.event_id)=(t.environment,t.provider,t.event_id)'
     body="(to_jsonb(t)-'subject_id')||jsonb_build_object('user_id',case when r.known_owner then a.user_id else t.subject_id end)"
    }
   }
   const columns=t.columns.filter(c=>!(normalizePolicy&&key==='service_private.policy'&&['enabled','min_service_version'].includes(c)))
   source=`select (select jsonb_object_agg(k,v order by k) from jsonb_each(${body}) e(k,v) where k=any(array[${columns.map(q).join(',')}]::text[])) as body from ${table(t)} t${join}`
  }
  return `select ${q(key)} as key,${aggregate(source)} as value`
 }).join('\nunion all\n')}) fingerprints;`
}

// Logical definitions exclude backend-local temp objects and physical/statistical
// fields. No pg_statistic samples, role passwords, subscription credentials or
// decrypted Vault view are read. All selected catalog rows leave SQL as hashes.
const namespace="select oid from pg_namespace where nspname!~'^pg_(toast_)?temp_'"
const classes=`select c.oid from pg_class c where c.relnamespace in (${namespace})`
const functions=`select p.oid from pg_proc p where p.pronamespace in (${namespace})`
const types=`select t.oid from pg_type t where t.typnamespace in (${namespace})`
const visibleObject=(classId,objectId)=>`(${classId}<>'pg_class'::regclass or ${objectId} in (${classes})) and (${classId}<>'pg_proc'::regclass or ${objectId} in (${functions})) and (${classId}<>'pg_type'::regclass or ${objectId} in (${types})) and (${classId}<>'pg_namespace'::regclass or ${objectId} in (${namespace}))`
const catalogs=[
 ['pg_namespace',`select to_jsonb(x) body from pg_namespace x where oid in (${namespace})`],
 ['pg_class',`select to_jsonb(x)-array['relpages','reltuples','relallvisible','relallfrozen','relfrozenxid','relminmxid'] body from pg_class x where oid in (${classes})`],
 ['pg_proc',`select to_jsonb(x) body from pg_proc x where oid in (${functions})`],
 ['pg_type',`select to_jsonb(x) body from pg_type x where oid in (${types})`],
 ...[['pg_attribute','attrelid'],['pg_attrdef','adrelid'],['pg_index','indexrelid'],['pg_trigger','tgrelid'],['pg_rewrite','ev_class'],['pg_policy','polrelid'],['pg_sequence','seqrelid'],['pg_inherits','inhrelid'],['pg_publication_rel','prrelid']].map(([name,column])=>[name,`select to_jsonb(x) body from pg_catalog.${name} x where ${column} in (${classes})`]),
 ['pg_constraint',`select to_jsonb(x) body from pg_constraint x where connamespace in (${namespace}) and (conrelid=0 or conrelid in (${classes}))`],
 ['pg_depend',`select to_jsonb(x) body from pg_depend x where ${visibleObject('classid','objid')} and ${visibleObject('refclassid','refobjid')}`],
 ['pg_description',`select to_jsonb(x) body from pg_description x where ${visibleObject('classoid','objoid')}`],
 ['pg_seclabel',`select to_jsonb(x) body from pg_seclabel x where ${visibleObject('classoid','objoid')}`],
 ['pg_default_acl',`select to_jsonb(x) body from pg_default_acl x where defaclnamespace=0 or defaclnamespace in (${namespace})`],
 ['pg_roles','select to_jsonb(x) body from pg_roles x'],
 ['pg_database',"select to_jsonb(x)-array['datfrozenxid','datminmxid'] body from pg_database x where datname=current_database()"],
 ...['pg_extension','pg_enum','pg_collation','pg_conversion','pg_cast','pg_operator','pg_opclass','pg_opfamily','pg_am','pg_amop','pg_amproc','pg_language','pg_range','pg_transform','pg_event_trigger','pg_foreign_data_wrapper','pg_foreign_server','pg_foreign_table','pg_publication','pg_auth_members','pg_db_role_setting','pg_ts_config','pg_ts_config_map','pg_ts_dict','pg_ts_parser','pg_ts_template'].map(name=>[name,`select to_jsonb(x) body from pg_catalog.${name} x`]),
]
export const catalogSql=`select jsonb_object_agg(key,value order by key) as fingerprints from (${catalogs.map(([name,source])=>`select ${q(name)} as key,${aggregate(source)} as value`).join('\nunion all\n')}) catalog;`
export const catalogScope={catalogs:catalogs.map(([name])=>name),excluded:'Temporary namespaces/objects, physical statistics/XID aging, pg_statistic samples, role passwords, subscription credentials; no decrypted Vault view'}
export function selectSummary(business){
 const select=prefix=>Object.fromEntries(Object.entries(business).filter(([key])=>prefix.some(p=>key===p||key.startsWith(p))))
 return {migrations:select(['service_private.migrations','supabase_migrations.']),config:select(['service_private.policy','public.billing_policy','public.billing_sources','public.ai_budget','cron.','vault.']),
  ai:select(['public.ai_budget','public.ai_actions','public.ai_limit_events','public.ai_protection']),business}
}
const into=(query,key)=>`insert into pg_temp.d2_gate_evidence(key,value) select ${q(key)},fingerprints from (${query.trim().replace(/;$/,'')}) s;`
const safetyStageSql=`insert into pg_temp.d2_gate_evidence(key,value) select 'effectSafety',safety from (${safetySql.replace(/;$/,'')}) s;
 do $effect_safety$ begin if exists(select 1 from jsonb_each((select value from pg_temp.d2_gate_evidence where key='effectSafety')) e where jsonb_array_length(e.value)>0) then raise exception 'unexpected_persistent_effect' using errcode='P7104';end if;end $effect_safety$;`
export const inboxRoutesSql=`create temporary table d2_original_inbox on commit drop as
 with owners as (
  select environment,user_id from public.billing_accounts union select environment,user_id from public.ai_actions union
  select environment,user_id from public.ai_limit_events union
  select (select environment from public.ai_budget where id='integration-shared'),user_id from public.ai_protection union
  select (select environment from service_private.policy where id=1),user_id from public.workspaces union
  select (select environment from service_private.policy where id=1),user_id from public.devices
 ) select i.environment,i.provider,i.event_id,i.user_id as original_owner,exists(select 1 from owners o where (o.environment,o.user_id)=(i.environment,i.user_id)) as known_owner from public.billing_inbox i;
 insert into pg_temp.d2_gate_evidence values('inboxRoutes',jsonb_build_object('mapped', (select count(*) from d2_original_inbox where known_owner),
 'legacyUnmapped',(select count(*) from d2_original_inbox where not known_owner and original_owner is not null),'nullOwner',(select count(*) from d2_original_inbox where original_owner is null)));`
export const verifyInboxRoutesSql=`insert into pg_temp.d2_gate_evidence(key,value) select 'inboxRouteViolations',jsonb_build_object('count',count(*)) from public.billing_inbox i join pg_temp.d2_original_inbox r on (r.environment,r.provider,r.event_id)=(i.environment,i.provider,i.event_id)
  left join service_private.account_lifecycle a on a.environment=i.environment and a.subject_id=i.subject_id
  where r.known_owner and (a.subject_id is null or a.user_id is distinct from r.original_owner)
   or not r.known_owner and (i.subject_id is distinct from r.original_owner or a.subject_id is not null);`
export function gateSql({migrations,prepared,tables,applicationName}){
 const stable=tables.filter(t=>!isRuntime(t)),baseline=businessSql(tables),populated=businessSql(stable,{normalizePolicy:true}),forward=businessSql(stable,{forward:true})
 const stages=[
  ['baseline',`${safetyStageSql}${into(catalogSql,'catalogBefore')}${into(baseline,'businessBefore')}`],
  ['populate-d1-fixture',prepared.populatedSql],
  ['populated-baseline',inboxRoutesSql+into(populated,'populatedBefore')],
  ['pause-admission',"select 1 from public.ai_budget where id='integration-shared' for update;update service_private.policy set enabled=false where id=1;"],
  ...migrations.map(m=>[m.file,m.sql]),
  ['populated-rekey-proof',`${verifyInboxRoutesSql}${into(forward,'forwardBusiness')}insert into pg_temp.d2_gate_evidence values('stagedServicePolicyValid',to_jsonb(exists(select 1 from service_private.policy where id=1 and not enabled and min_service_version=2)));`],
  ['retrieval-fixtures-and-probes',prepared.retrievalSql],
  ['canonical-vector',prepared.vectorSql],
 ]
 assert(/^d2-rollback:[0-9a-f-]{36}$/.test(applicationName))
 return `begin;set local application_name=${q(applicationName)};set local timezone='UTC';set local datestyle='ISO,YMD';set local lock_timeout='${LIMITS.lockMs}ms';set local statement_timeout='${LIMITS.statementMs}ms';
create temporary table d2_gate_stages(position integer,name text,ok boolean,state text,elapsed_ms bigint) on commit drop;
create temporary table d2_gate_evidence(key text primary key,value jsonb) on commit drop;
create temporary table d2_gate_result(payload jsonb) on commit drop;
do $d2_populated_gate$
declare names text[]:=array[${stages.map(([name])=>q(name)).join(',')}];scripts text[]:=array[${stages.map(([,sql])=>q(sql)).join(',')}];i integer;started timestamptz;good boolean;state text;result jsonb;
begin
 for i in 1..array_length(names,1) loop
  started:=clock_timestamp();good:=true;state:=null;
  begin execute scripts[i];
  exception when query_canceled or assert_failure then get stacked diagnostics state=returned_sqlstate;good:=false;
   when others then get stacked diagnostics state=returned_sqlstate;good:=false;end;
  -- Keep hash diagnostics on a semantic failure; raising inside that stage would
  -- roll back the evidence along with its subtransaction.
  if good and names[i]='populated-rekey-proof' then
   if (select value from pg_temp.d2_gate_evidence where key='stagedServicePolicyValid') is distinct from 'true'::jsonb then good:=false;state:='P7103';
   elsif (select (value->>'count')::bigint from pg_temp.d2_gate_evidence where key='inboxRouteViolations')<>0 then good:=false;state:='P7102';
   elsif (select value from pg_temp.d2_gate_evidence where key='populatedBefore') is distinct from (select value from pg_temp.d2_gate_evidence where key='forwardBusiness') then good:=false;state:='P7101';end if;
  end if;
  insert into pg_temp.d2_gate_stages values(i,names[i],good,state,round(extract(epoch from clock_timestamp()-started)*1000)::bigint);
  exit when not good;
 end loop;
 if to_regclass('pg_temp.d2_checks') is not null then
  begin execute ${q(prepared.resultSql)} into result;insert into pg_temp.d2_gate_result values(result);
  exception when query_canceled or assert_failure then insert into pg_temp.d2_gate_stages values(100,'result-readback',false,sqlstate,0);
   when others then insert into pg_temp.d2_gate_stages values(100,'result-readback',false,sqlstate,0);end;
 end if;
end $d2_populated_gate$;
select jsonb_build_object('stages',(select jsonb_agg(to_jsonb(s) order by position) from d2_gate_stages s),
 'catalogBefore',(select value from d2_gate_evidence where key='catalogBefore'),'businessBefore',(select value from d2_gate_evidence where key='businessBefore'),
 'populatedBefore',(select value from d2_gate_evidence where key='populatedBefore'),'forwardBusiness',(select value from d2_gate_evidence where key='forwardBusiness'),
 'inboxRoutes',(select value from d2_gate_evidence where key='inboxRoutes'),'inboxRouteViolations',(select value from d2_gate_evidence where key='inboxRouteViolations'),
 'effectSafety',(select value from d2_gate_evidence where key='effectSafety'),'acceptance',(select payload from d2_gate_result limit 1)) as populated_gate;
rollback;`
}
