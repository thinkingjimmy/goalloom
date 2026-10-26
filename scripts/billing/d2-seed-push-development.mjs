/**
 * [INPUT]: Frozen Core three-operation rollback candidate, exact installed D2 metadata and reviewed Root development window.
 * [OUTPUT]: One targeted rollback dispatch, immutable intent and independent row/catalog/sequence readback.
 * [POS]: Backend-only seed scope acceptance adapter; no persistent installation, provider, fixture recreation or general runner.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,open} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {client,developmentRef} from '../hosted-ai/client.mjs'
import {sha256} from '../deploy/schema.mjs'
import {literal as q} from './d1-sync-fixtures.mjs'
import {inventorySql,businessSql,catalogSql,validateInventory,isRuntime} from './d2-populated-gate.mjs'
import {attestCronRuntimeInventory} from './d2-cron-runtime.mjs'
import {operatorReadOnlySql,verifyWindowStopReferences} from './d2-fixture-window-stop.mjs'
import {acquireDeploymentLock} from './d2-deploy-lock.mjs'

const root='output/tests/billing/desktop/d2-seed-push-rollout',core='output/tests/billing/desktop/d2-seed-push-fix'
const window='output/tests/billing/desktop/d2-deployment/window-stop/windows/d13fde954bd65ff8fce4253fef833b7491d5e379873eeeae8bfa52be6bf96ac6'
const snapshotPath=`${window}/snapshot-7123490f57a7967a79244cad81fa27d395108b5c1cfe3ef2591745136d2806bc.json`
const observationPath=`${window}/metadata-observed-4fca397f1ee5dce5f4407a74bf6d9e1e87d011128b3f0d290bd8d7b0b5d98052.json`
const sequence='public.control_events_id_seq',authSequence='auth.refresh_tokens_id_seq'
const same=(a,b)=>canonicalJson(a)===canonicalJson(b)
const noSemi=s=>s.trim().replace(/;$/,'')
const json=async p=>JSON.parse(await readFile(p,'utf8'))
const descriptor=async path=>{const b=await readFile(path);return{path:resolve(path),sha256:sha256(b),bytes:b.length}}
async function immutable(path,value){
 await mkdir(dirname(path),{recursive:true,mode:0o700});const b=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n'
 try{await writeFile(path,b,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(path,'utf8'),b,'Immutable seed evidence changed')}
 return descriptor(path)
}
const policiesSql=`select jsonb_build_object('service',(select to_jsonb(p) from service_private.policy p where id=1),'billing',(select to_jsonb(p) from public.billing_policy p where environment='development'),'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1)) as policies;`
const sequenceSql=`select last_value::text as last_value,is_called from ${sequence};`
const authSequenceSql=`select last_value::text as last_value,is_called from ${authSequence};`
const sequenceMetadataSql=`select jsonb_build_object('name',(select nspname from pg_namespace where oid=c.relnamespace)||'.'||c.relname,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'type',format_type(s.seqtypid,null),'start',s.seqstart::text,'increment',s.seqincrement::text,'min',s.seqmin::text,'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle,'identity',(select attidentity from pg_attribute where attrelid='public.control_events'::regclass and attname='id'),'ownedSequence',pg_get_serial_sequence('public.control_events','id'),'dependencies',(select encode(pg_catalog.sha256(convert_to(coalesce(jsonb_agg(to_jsonb(d) order by d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype)::text,''),'UTF8')),'hex') from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid or d.refclassid='pg_class'::regclass and d.refobjid=c.oid)) as metadata from pg_class c join pg_sequence s on s.seqrelid=c.oid where c.oid=${q(sequence)}::regclass;`
const usageSql=`select encode(pg_catalog.sha256(convert_to(to_jsonb(u)::text,'UTF8')),'hex') as row_sha256,kind,window_start from public.sync_account_usage u order by kind,window_start,row_sha256 limit 50001;`
const receiptSql='select bucket,window_at,hits from service_private.receipt_rate order by bucket limit 65;'
const functionSql=`select encode(pg_catalog.sha256(convert_to(prosrc,'UTF8')),'hex') as body_sha256,encode(pg_catalog.sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') as definition_sha256,jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'arguments',pg_get_function_identity_arguments(oid),'result',pg_get_function_result(oid),'language',prolang,'definer',prosecdef,'volatility',provolatile,'settings',proconfig) as contract from pg_proc where oid='public.push_ops(uuid,uuid,uuid,jsonb)'::regprocedure;`
const activitySql=applicationName=>`select jsonb_build_object('role',current_user,'readOnly',current_setting('transaction_read_only')='on','visible',(select rolsuper from pg_roles where rolname=current_user) or pg_has_role(current_user,'pg_read_all_stats','USAGE'),'tracking',current_setting('track_activities')='on','hidden',(select count(*) from pg_stat_activity where pid<>pg_backend_pid() and datname=current_database() and backend_type='client backend' and (state is null or state='disabled' or query='<insufficient privilege>')),'writers',(select count(distinct a.pid) from pg_stat_activity a join pg_locks l on l.pid=a.pid join pg_class c on c.oid=l.relation join pg_namespace n on n.oid=c.relnamespace where a.pid<>pg_backend_pid() and a.datname=current_database() and a.state<>'idle' and l.granted and l.mode in('RowShareLock','RowExclusiveLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock') and n.nspname in('public','service_private','auth','realtime','storage')),'executors',(select count(*) from pg_stat_activity where pid<>pg_backend_pid() and state<>'idle' and (application_name like 'd2-install:%' or application_name like 'd2-race-%' or application_name=${q(applicationName)})),'leases',(select count(*) from public.billing_accounts where environment='development' and lease is not null and lease_until>clock_timestamp())+(select count(*) from public.billing_inbox where environment='development' and status='processing' and lease_until>clock_timestamp()),'queuedWorkers',(select count(*) from net.http_request_queue where url in(${q(`https://${developmentRef}.supabase.co/functions/v1/billing/worker`)},${q(`https://${developmentRef}.supabase.co/functions/v1/lifecycle/worker`)}))) as activity;`
function inactive(proof,{readOnly=true}={}){
 assert(proof?.visible===true&&proof.tracking===true&&(!readOnly||proof.readOnly===true),'Operator activity visibility unavailable')
 for(const key of ['hidden','writers','executors','leases','queuedWorkers'])assert(Number(proof[key])===0,'Original relevant activity remains unverified')
}
const readonlyPort=raw=>({query:sql=>raw.request('/database/query',{method:'POST',json:{query:operatorReadOnlySql(sql).replace('begin read only;','begin read only;set local timezone=\'UTC\';set local datestyle=\'ISO,YMD\';'),read_only:false}})})
const businessTables=tables=>tables.filter(t=>!isRuntime(t)&&`${t.schema}.${t.name}`!==sequence)
async function readState(db,applicationName){
 const runtime=await attestCronRuntimeInventory(db,validateInventory(await db.query(inventorySql))),tables=runtime.tables
 const state={observedAt:new Date().toISOString(),databaseClock:(await db.query('select clock_timestamp() as at'))[0].at,tables,runtimeSequenceProof:runtime.proof,runtimeSequenceObservations:runtime.observations,
  policies:(await db.query(policiesSql))[0].policies,function:(await db.query(functionSql))[0],sequence:(await db.query(sequenceSql))[0],sequenceMetadata:(await db.query(sequenceMetadataSql))[0].metadata,authSequence:(await db.query(authSequenceSql))[0],
  usage:await db.query(usageSql),receiptBuckets:await db.query(receiptSql),activity:(await db.query(activitySql(applicationName)))[0].activity,
  business:(await db.query(businessSql(businessTables(tables))))[0].fingerprints,catalog:(await db.query(catalogSql))[0].fingerprints}
 assert(state.usage.length<=50000&&state.receiptBuckets.length<=64,'Runtime observations exceed finite scope')
 return state
}
async function sources(){
 const entry=resolve('scripts/billing/d2-seed-push-development.mjs'),analysis=await build({entryPoints:[entry],bundle:true,write:false,metafile:true,platform:'node',format:'esm',target:'es2022',external:['node:*'],logLevel:'silent'})
 const req=createRequire(import.meta.url),esbuildEntry=req.resolve('esbuild'),esbuildRequire=createRequire(esbuildEntry)
 const files=[...Object.keys(analysis.metafile.inputs),process.execPath,esbuildEntry,resolve(dirname(esbuildEntry),'../package.json'),esbuildRequire.resolve(`@esbuild/${process.platform}-${process.arch}/bin/esbuild`),'package.json','pnpm-lock.yaml',`${root}/failure-cases.md`,`${core}/prepare.mjs`,`${core}/acceptance.sql`,`${core}/fixture-public.json`,`${core}/original-push-ops.sql`,'supabase/migrations/0029_seed_push_scope.sql',snapshotPath,observationPath,
  `${window}/run-d680aa08-8003-426d-947a-ba6557b20121.json`,`${root}/realtime-boundary/send-04a80377f90ec7bb645857399d8ab66608f14ed40003ff3fd01de8152b4882ea.json`,`${root}/realtime-boundary/closure-8d956e9c047addf4dd8f6d69bf22d8020a45af25cbc8aa754e775b42447dc7e1.json`]
 return Promise.all([...new Set(files.map(p=>resolve(p)))].sort().map(descriptor))
}
export async function buildSeedRollbackSql(plan,before){
 const coreSql=await readFile(`${core}/acceptance.sql`,'utf8'),old=await readFile(`${core}/original-push-ops.sql`,'utf8'),fixture=await json(`${core}/fixture-public.json`)
 assert(sha256(old.match(/as \$\$([\s\S]*?)\$\$;/i)[1])===plan.originalBodySha256,'Original push body changed')
 const markers=['create temporary table seed_fix_checks','-- Existing fixture identities/qualification;','set local role authenticated;','do $reproduce$','-- Copyright (C) 2026 Jimmy Wong',"set local role authenticated;\ninsert into pg_temp.seed_fix_checks values('pushResult'","select jsonb_build_object('scope','isolated PostgreSQL"]
 const positions=markers.map((m,i)=>coreSql.indexOf(m,i===5?coreSql.indexOf(markers[4]):0));assert(positions.every((v,i)=>v>=0&&(!i||v>positions[i-1])),'Core authoritative stage shape changed')
 const names=['original-contract','fixture-setup','signed-create','original-reproduction','fixed-replacement','signed-push-finish-replay']
 const stages=names.map((name,i)=>({name,sql:coreSql.slice(positions[i],positions[i+1])}))
 const originalTrial=`insert into public.billing_accounts(environment,subject_id,trial_request,trial_started_at,trial_ends_at)
 select 'development',subject_id,${q(fixture.trialRequest)},clock_timestamp()-interval '1 hour',clock_timestamp()+interval '7 days'
 from service_private.account_lifecycle where environment='development' and user_id=${q(fixture.user)};`
 assert(stages[1].sql.split(originalTrial).length===2,'Core trial qualification source changed')
 stages[1].sql=stages[1].sql.replace(originalTrial,`with t as(select clock_timestamp()-interval '1 hour' as started_at)
 insert into public.billing_accounts(environment,subject_id,trial_request,trial_started_at,trial_ends_at)
 select 'development',a.subject_id,${q(fixture.trialRequest)},t.started_at,t.started_at+interval '192 hours'
 from service_private.account_lifecycle a cross join t where a.environment='development' and a.user_id=${q(fixture.user)};`)
 const replay="insert into pg_temp.seed_fix_checks values('pushReplay'",replayAt=stages[5].sql.indexOf(replay);assert(replayAt>0)
 stages[5].sql=stages[5].sql.slice(0,replayAt)+`reset role;\ninsert into pg_temp.seed_fix_checks values('sequenceAfterFirstPush',to_jsonb(currval(${q(sequence)})));\nset local role authenticated;\n`+stages[5].sql.slice(replayAt)
 stages[5].sql+=`do $allocation$ begin if (select count(*) from public.control_events where device_id=${q(fixture.device)})<>1 or (select id from public.control_events where device_id=${q(fixture.device)})<>currval(${q(sequence)}) or (select value from pg_temp.seed_fix_checks where key='sequenceAfterFirstPush')<>to_jsonb(currval(${q(sequence)})) then raise exception 'unexpected_seed_allocation';end if;end $allocation$;`
 const baselineStart=coreSql.indexOf('insert into seed_fix_baseline values('),baselineEnd=coreSql.indexOf(",('data',",baselineStart);assert(baselineStart>0&&baselineEnd>baselineStart)
 const baselineInsert=coreSql.slice(baselineStart,baselineEnd)+';'
 const acceptStart=positions.at(-1),acceptEnd=coreSql.indexOf(' as seed_push_acceptance;',acceptStart);assert(acceptEnd>acceptStart)
 const acceptance=coreSql.slice(acceptStart,acceptEnd).replace("'isolated PostgreSQL signed create/three-op push/finish; row/DDL/ACL rollback; no shared database, HTTP, provider or desktop claim'","'development targeted SQL rollback; bounded natural sequence allocation; no HTTP/provider/desktop claim'")
 const locks=before.tables.filter(t=>['r','p','m'].includes(t.kind)&&(['public','service_private'].includes(t.schema)||t.schema==='realtime'&&t.name==='messages')).map(t=>`"${t.schema}"."${t.name}"`).sort()
 const guard=`do $seed_guard$ begin
 if (select environment=${q('development')} and project_ref=${q(developmentRef)} from service_private.policy where id=1) is distinct from true then raise exception 'seed_project_changed';end if;
 if current_setting('plpgsql.variable_conflict',true) is distinct from 'error' then raise exception 'seed_variable_conflict_unsupported';end if;
 if (select policies from (${noSemi(policiesSql)}) p) is distinct from ${q(JSON.stringify(plan.closedPolicies))}::jsonb then raise exception 'seed_closed_policy_changed';end if;
 if (select body_sha256 from (${noSemi(functionSql)}) f)<>${q(plan.originalBodySha256)} then raise exception 'seed_original_source_changed';end if;
 if (select fingerprints from (${noSemi(businessSql(businessTables(before.tables)))}) b) is distinct from ${q(JSON.stringify(before.business))}::jsonb or (select fingerprints from (${noSemi(catalogSql)}) c) is distinct from ${q(JSON.stringify(before.catalog))}::jsonb then raise exception 'seed_before_state_changed';end if;
 if (select to_jsonb(s) from (${noSemi(sequenceSql)}) s) is distinct from ${q(JSON.stringify(before.sequence))}::jsonb then raise exception 'seed_sequence_before_changed';end if;
 if (select metadata from (${noSemi(sequenceMetadataSql)}) s) is distinct from ${q(JSON.stringify(before.sequenceMetadata))}::jsonb then raise exception 'seed_sequence_definition_changed';end if;
 end $seed_guard$;`
 const activity=noSemi(activitySql(plan.applicationName))
 const sql=`begin;set local application_name=${q(plan.applicationName)};set local timezone='UTC';set local datestyle='ISO,YMD';set local statement_timeout='15s';set local lock_timeout='3s';
 create temporary table seed_dev_result(payload jsonb) on commit drop;
 do $seed_journey$ declare names text[]:=array[${names.map(q).join(',')}];scripts text[]:=array[${stages.map(s=>q(s.sql)).join(',')}];i integer;stage text:='before-journey';v_sqlstate text;accepted jsonb;proof jsonb;begin
 begin
 stage:='original-activity';${activity.replace(' as activity',' into proof')};
 if (proof->>'visible')::boolean is distinct from true or (proof->>'tracking')::boolean is distinct from true or exists(select 1 from jsonb_each(proof) e where e.key in('hidden','writers','executors','leases','queuedWorkers') and e.value<>'0'::jsonb) then raise exception 'seed_active_writer';end if;
 stage:='original-locks';perform pg_advisory_xact_lock(hashtextextended('goalloom-development-d2-install',0));
 execute ${q(`lock table ${locks.join(',')} in share row exclusive mode;`)};
 stage:='original-cas';execute ${q(guard)};
 execute 'create temporary table seed_fix_baseline(key text primary key,value jsonb) on commit drop;';
 execute ${q(baselineInsert)};
 for i in 1..array_length(names,1) loop stage:=names[i];execute scripts[i];end loop;
 execute ${q(acceptance)} into accepted;
 insert into pg_temp.seed_dev_result values(jsonb_build_object('ok',true,'stage','complete','acceptance',accepted,'sequenceBefore',${q(JSON.stringify(before.sequence))}::jsonb,'sequenceAfter',(select to_jsonb(s) from (${noSemi(sequenceSql)}) s),'variableConflict',current_setting('plpgsql.variable_conflict',true)));
 exception when query_canceled or assert_failure then get stacked diagnostics v_sqlstate=returned_sqlstate;insert into pg_temp.seed_dev_result values(jsonb_build_object('ok',false,'stage',stage,'sqlstate',v_sqlstate));
 when others then get stacked diagnostics v_sqlstate=returned_sqlstate;insert into pg_temp.seed_dev_result values(jsonb_build_object('ok',false,'stage',stage,'sqlstate',v_sqlstate));end;
 end $seed_journey$;
 select payload as seed_push_diagnostic from pg_temp.seed_dev_result;
 rollback;`
 return{sql,stages:stages.map(s=>({name:s.name,sha256:sha256(s.sql)})),lockTargets:locks}
}
function sequencePreserved(before,after){
 assert(same(before.sequenceMetadata,after.sequenceMetadata),'Sequence definition/configuration changed')
 const m=before.sequenceMetadata;assert(m.name===sequence&&m.ownedSequence===sequence&&m.identity==='a'&&m.cycle===false&&BigInt(m.increment)>0n,'Expected owned GENERATED ALWAYS sequence required')
 const delta=BigInt(after.sequence.last_value)-BigInt(before.sequence.last_value),bound=BigInt(m.cache)*BigInt(m.increment)
 assert(delta>=0n&&delta<=bound&&delta%BigInt(m.increment)===0n&&!(!after.sequence.is_called&&before.sequence.is_called),'Sequence movement exceeds one natural cached allocation')
 return{ok:true,maximumNextvalCalls:1,delta:delta.toString(),maximumNaturalAdvance:bound.toString(),before:before.sequence,after:after.sequence,metadata:m,resetPerformed:false,limitation:'The source/currval checks bound the fixture call; a global counter delta alone does not identify concurrent callers.'}
}
function verifyBefore(plan,state){
 inactive(state.activity);assert(same(state.policies,plan.closedPolicies),'Complete closed policy CAS mismatch')
 assert(state.function?.body_sha256===plan.originalBodySha256,'Original installed push body differs')
 assert(same(state.tables,plan.tables),'Installed relation inventory changed')
 assert(same(state.catalog,plan.catalog),'Installed source/default/trigger/catalog changed')
 assert(state.business['cron.job']?.sha256===plan.cronFingerprint.sha256,'Exact original cron configuration changed')
 sequencePreserved(state,state)
}
function preservation(before,after){
 const businessDiff=Object.keys(before.business).filter(k=>!same(before.business[k],after.business[k]))
 const removed=before.usage.filter(row=>!after.usage.some(x=>same(x,row))),added=after.usage.filter(row=>!before.usage.some(x=>same(x,row)))
 const expired=removed.every(row=>['minute','day','registration'].includes(row.kind)&&Date.parse(row.window_start)<Date.parse(after.databaseClock)-(row.kind==='minute'?86400000:604800000))
 const usageMatched=added.length===0&&expired&&(businessDiff.every(k=>k!=='public.sync_account_usage')||removed.length>0)
 const checks={businessRestored:businessDiff.filter(k=>k!=='public.sync_account_usage').length===0&&usageMatched,catalogRestored:same(before.catalog,after.catalog),policiesRestored:same(before.policies,after.policies),functionRestored:same(before.function,after.function),authSequencePreserved:same(before.authSequence,after.authSequence),receiptBucketsPreserved:same(before.receiptBuckets,after.receiptBuckets)}
 return{checks,businessDiff,usage:{added:added.length,removed:removed.length,removedWindowsExpired:expired,verified:usageMatched},sequence:sequencePreserved(before,after)}
}
async function planSeedRollback(baselinePath){
 const snapshot=await json(snapshotPath),observation=await json(observationPath),closedPolicies=structuredClone(snapshot.policies)
 for(const [kind,fields] of Object.entries({service:['enabled'],billing:['enabled'],lifecycle:['enabled','independent_ledger_ready','restore_admission_ready','cleanup_wiring_ready']}))for(const field of fields)closedPolicies[kind][field]=false
 const old=await readFile(`${core}/original-push-ops.sql`,'utf8'),plan={version:1,project:developmentRef,sourceOnly:true,remoteExecuted:false,rollbackOnly:true,applicationName:`d2-install:${randomUUID()}`,maximumWriteRequests:1,statementMs:15000,lockMs:3000,originalBodySha256:sha256(old.match(/as \$\$([\s\S]*?)\$\$;/i)[1]),closedPolicies,tables:observation.tables,catalog:observation.catalog,cronFingerprint:observation.business['cron.job'],sources:await sources(),privateEvidence:[snapshot.journal,await descriptor(resolve(dirname(snapshot.journal.path),'independent-deletion-ledger.sqlite'))],runtime:{node:process.version,platform:process.platform,arch:process.arch},scope:'Exact Core signed three-operation original reproduction/fixed push/finish/replay in ROLLBACK. One proven control_events identity allocation only; no persistent migration or separate fixture journey.'}
 if(baselinePath){
  const baseline=await json(baselinePath);assert(baseline.project===developmentRef&&baseline.readOnly===true&&baseline.remoteWrites===0,'Read-only seed baseline required')
  plan.before=baseline.state;plan.baseline=await descriptor(baselinePath);verifyBefore(plan,plan.before)
  const built=await buildSeedRollbackSql(plan,plan.before);plan.sqlSha256=sha256(built.sql);plan.stages=built.stages;plan.lockTargets=built.lockTargets
 }
 plan.reviewedSetSha256=sha256(canonicalJson(plan));const directory=`${root}/plans/${plan.reviewedSetSha256}`
 if(plan.before)await immutable(`${directory}/rollback.sql`,(await buildSeedRollbackSql(plan,plan.before)).sql)
 return{plan,reference:await immutable(`${directory}/plan.json`,plan)}
}
async function reviewed(path,set){
 const plan=await json(path),{reviewedSetSha256,...material}=plan
 assert(plan.project===developmentRef&&plan.version===1&&set===reviewedSetSha256&&sha256(canonicalJson(material))===set,'Exact reviewed targeted seed plan required')
 await verifyWindowStopReferences([...plan.sources,...plan.privateEvidence,...(plan.baseline?[plan.baseline]:[])]);return plan
}
async function execute(mode,path,set){
 const plan=await reviewed(path,set),directory=`${root}/plans/${set}`,intentPath=`${directory}/dispatch-intent.json`,attempt=randomUUID(),report={version:1,ok:false,project:developmentRef,mode,reviewedSet:set,applicationName:plan.applicationName,writes:0,errors:[]}
 if(mode==='--run')assert(plan.before&&plan.sqlSha256,'Reviewed baseline and exact rollback SQL required; draft cannot load credentials')
 let raw,db,before,intent,lock
 try{
  try{intent=await json(intentPath)}catch(e){if(e.code!=='ENOENT')throw e}
  if(mode==='--run')assert(!intent,'Original dispatch intent exists; use --check without replay')
  else assert(intent,'Original dispatch intent required; no replacement baseline')
  if(mode==='--run')lock=await acquireDeploymentLock(directory,set,plan.applicationName.slice('d2-install:'.length))
  raw=await client();db=readonlyPort(raw)
  if(intent){
   assert(intent.version===1&&intent.reviewedSet===set&&intent.applicationName===plan.applicationName&&intent.maximumWriteRequests===1&&intent.outcome==='unknown'
    &&plan.sqlSha256&&intent.sqlSha256===plan.sqlSha256&&same(intent.before,plan.before)&&same(intent.stages,plan.stages)&&same(intent.lockTargets,plan.lockTargets),'Original intent identity, SQL or preservation baseline changed')
   before=intent.before
  }
  else{
   assert(plan.before&&plan.sqlSha256,'Reviewed baseline and exact rollback SQL required; draft cannot execute')
   before=plan.before;const current=await readState(db,plan.applicationName);verifyBefore(plan,current)
   assert(same(current.business,before.business)&&same(current.sequence,before.sequence)&&same(current.sequenceMetadata,before.sequenceMetadata)&&same(current.authSequence,before.authSequence),'Reviewed seed baseline changed before dispatch')
   const built=await buildSeedRollbackSql(plan,before);assert(sha256(built.sql)===plan.sqlSha256,'Reviewed seed SQL changed')
   intent={version:1,reviewedSet:set,applicationName:plan.applicationName,maximumWriteRequests:1,before,sqlSha256:sha256(built.sql),stages:built.stages,lockTargets:built.lockTargets,outcome:'unknown'}
   const handle=await open(intentPath,'wx',0o600);try{await handle.writeFile(JSON.stringify(intent,null,2)+'\n');await handle.sync()}finally{await handle.close()}
   const parent=await open(directory,'r');try{await parent.sync()}finally{await parent.close()}
   report.writes=1
   try{const rows=await raw.query(built.sql,false);report.diagnostic=rows.find(r=>r.seed_push_diagnostic)?.seed_push_diagnostic??null;report.responseReceived=true}
   catch(e){const known=e.message?.match(/^Management POST \/database\/query: HTTP ([1-5][0-9]{2})$/);if(known)report.httpStatus=Number(known[1]);else report.responseLost=true}
  }
 }catch(e){report.errors.push({type:e.name==='AssertionError'?'guard_failed':'seed_rollback_unverified',reason:e.name==='AssertionError'?e.message:'inspect_original_intent_no_retry'})}
 finally{
  if(db&&before)try{
   const after=await readState(db,plan.applicationName);inactive(after.activity);report.originalTransactionsAbsent=true
   report.after=await immutable(`${directory}/after-${attempt}.json`,after)
   report.preservation=preservation(before,after);await verifyWindowStopReferences([...plan.sources,...plan.privateEvidence]);report.originalEvidencePreserved=true
   report.rollbackVerified=Object.values(report.preservation.checks).every(Boolean)&&report.preservation.sequence.ok
  }catch{report.errors.push({type:'independent_postflight_unverified'})}
  if(lock&&report.originalTransactionsAbsent)try{await lock.release()}catch{report.errors.push({type:'executor_lock_retained'})}
  else if(lock)report.errors.push({type:'executor_lock_retained_until_original_transaction_absence'})
 }
 report.executionAccepted=report.diagnostic?.ok===true&&report.diagnostic.acceptance?.originalFailure?.sqlstate==='42702'&&report.diagnostic.acceptance?.finalAccepted===true&&report.diagnostic.variableConflict==='error'
 report.ok=report.rollbackVerified===true&&report.originalEvidencePreserved===true&&report.errors.length===0&&report.executionAccepted
 report.scope=mode==='--check'?'Original intent rollback/preservation readback only; missing original journey response stays unverified.':'Targeted actual PostgreSQL rollback only; no Auth/Storage HTTP, SDK, races, restore, provider, desktop, Windows or persistent installation acceptance.'
 report.runtime={node:process.version,platform:process.platform,arch:process.arch}
 return{report,reference:await immutable(`${directory}/${mode.slice(2)}-${attempt}.json`,report)}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),mode=args[0]??'--plan',flag=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1]}
 assert(['--plan','--capture','--run','--check'].includes(mode),'Use --plan/--capture or exact reviewed --run/--check')
 if(mode==='--plan'){const result=await planSeedRollback(flag('--baseline'));console.log(JSON.stringify({remoteExecuted:false,executionReady:!!result.plan.before,reviewedSet:result.plan.reviewedSetSha256,...result.reference}))}
 else if(mode==='--capture'){
  assert(process.env.D2_SEED_ROLLBACK_READ==='development','Exact Root read-only seed baseline window required before credentials')
  const plan=await reviewed(args[1],flag('--reviewed-set')),state=await readState(readonlyPort(await client()),plan.applicationName);verifyBefore(plan,state)
  await verifyWindowStopReferences([...plan.sources,...plan.privateEvidence]);const baseline={version:1,project:developmentRef,readOnly:true,remoteWrites:0,draftSet:plan.reviewedSetSha256,state}
  const bytes=JSON.stringify(baseline,null,2)+'\n';console.log(JSON.stringify(await immutable(`${root}/baselines/${sha256(bytes)}.json`,bytes)))
 }
 else{assert((mode==='--run'?process.env.D2_SEED_ROLLBACK_WINDOW:process.env.D2_SEED_ROLLBACK_READ)==='development','Exact Root targeted rollback/read-only window required before credentials');const result=await execute(mode,args[1],flag('--reviewed-set'));console.log(JSON.stringify({...result.reference,...result.report}));if(!result.report.ok)process.exitCode=1}
}
