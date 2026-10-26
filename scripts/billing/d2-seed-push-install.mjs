/**
 * [INPUT]: Accepted targeted rollback, original D2 chain, exact 0029 source and a separately reviewed development set.
 * [OUTPUT]: One atomic function/history installation, independent preservation readback and explicit lifecycle patch manifest.
 * [POS]: Finite forward installer over existing operator transport/lock/attestation tools; no fixture, activation or general runner.
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
import {eszipOriginalSource} from '../deploy/edge-source.mjs'
import {literal as q} from './d1-sync-fixtures.mjs'
import {businessSql,catalogSql,isRuntime} from './d2-populated-gate.mjs'
import {collectDeploymentState,normalizedSchemaSql,EDGE_MODES,drainStateSql} from './d2-deploy-state.mjs'
import {operatorReadOnlySql,verifyWindowStopReferences} from './d2-fixture-window-stop.mjs'
import {acquireDeploymentLock} from './d2-deploy-lock.mjs'
const root='output/tests/billing/desktop/d2-seed-push-install'
const acceptedDir='output/tests/billing/desktop/d2-seed-push-rollout/plans/2708e67f66b2ced6bcd0592678f3f7bd43614eb0de5021d4cb2ec9c7bb3ea9ce'
const acceptedPath=`${acceptedDir}/run-1cca939c-a831-4446-8b13-1534d0d0f033.json`
const originalPath='output/tests/billing/desktop/d2-lifecycle/development/970b180a-cbf5-4d01-b64c-64c73180ebdc/plan-0b1950d83fa9331a564ee4ba7efb236b662c01a4da9791446acdfd7826c4d2fe.json'
const migrationPath='supabase/migrations/0029_seed_push_scope.sql'
const same=(a,b)=>canonicalJson(a)===canonicalJson(b),noSemi=s=>s.trim().replace(/;$/,'')
const json=async path=>JSON.parse(await readFile(path,'utf8'))
const descriptor=async path=>{const b=await readFile(path);return{path:resolve(path),sha256:sha256(b),bytes:b.length}}
async function immutable(path,value){await mkdir(dirname(path),{recursive:true,mode:0o700});const b=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';try{await writeFile(path,b,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(path,'utf8'),b,'Immutable patch evidence changed')}return descriptor(path)}
const without=(v,keys)=>Object.fromEntries(Object.entries(v).filter(([k])=>!keys.includes(k)))
const policiesSql=`select jsonb_build_object('service',(select to_jsonb(p) from service_private.policy p where id=1),'billing',(select to_jsonb(p) from public.billing_policy p where environment='development'),'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1)) as policies;`
const targetSql=`select jsonb_build_object('bodySha256',encode(pg_catalog.sha256(convert_to(p.prosrc,'UTF8')),'hex'),'definitionSha256',encode(pg_catalog.sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'contract',to_jsonb(p)-'prosrc') as target from pg_proc p where p.oid='public.push_ops(uuid,uuid,uuid,jsonb)'::regprocedure;`
const otherFunctionsSql=`select jsonb_build_object('rows',count(*),'capped',count(*)>50000,'sha256',encode(pg_catalog.sha256(convert_to(coalesce(string_agg(h,'' order by oid),''),'UTF8')),'hex')) as other_functions from(select p.oid,encode(pg_catalog.sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex') h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname!~'^pg_(toast_)?temp_' and p.oid<>'public.push_ops(uuid,uuid,uuid,jsonb)'::regprocedure order by p.oid limit 50001) bounded;`
const historySql='select coalesce(jsonb_agg(jsonb_build_object(\'version\',version,\'sha256\',sha256) order by version),\'[]\') as private_history from service_private.migrations;'
const countersSql=`select jsonb_build_object('control',(select jsonb_build_object('last_value',last_value::text,'is_called',is_called) from public.control_events_id_seq),'auth',(select jsonb_build_object('last_value',last_value::text,'is_called',is_called) from auth.refresh_tokens_id_seq)) as counters;`
const activitySql=applicationName=>`select jsonb_build_object('visible',(select rolsuper from pg_roles where rolname=current_user) or pg_has_role(current_user,'pg_read_all_stats','USAGE'),'tracking',current_setting('track_activities')='on','hidden',(select count(*) from pg_stat_activity a where a.pid<>pg_backend_pid() and a.datname=current_database() and a.backend_type='client backend' and(a.state is null or a.state='disabled' or a.query='<insufficient privilege>')),'writers',(select count(distinct a.pid) from pg_stat_activity a join pg_locks l on l.pid=a.pid join pg_class c on c.oid=l.relation join pg_namespace n on n.oid=c.relnamespace where a.pid<>pg_backend_pid() and a.datname=current_database() and a.state<>'idle' and l.granted and l.mode in('RowShareLock','RowExclusiveLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock') and n.nspname in('public','service_private','auth','realtime','storage')),'executors',(select count(*) from pg_stat_activity a where a.pid<>pg_backend_pid() and a.state<>'idle' and(a.application_name like 'd2-install:%' or a.application_name like 'd2-race-%' or a.application_name=${q(applicationName)}))) as activity;`
const coreMetadataSql=`select (select target from(${noSemi(targetSql)}) t) as target,(select other_functions from(${noSemi(otherFunctionsSql)}) f) as other_functions,(select schema_attestation from(${noSemi(normalizedSchemaSql)}) s) as schema_attestation,(select private_history from(${noSemi(historySql)}) h) as private_history,(select fingerprints from(${noSemi(catalogSql)}) c) as catalog;`
const stableTables=tables=>tables.filter(t=>!isRuntime(t)&&`${t.schema}.${t.name}`!=='public.control_events_id_seq')
const readonlyPort=raw=>({...raw,query:sql=>raw.request('/database/query',{method:'POST',json:{query:operatorReadOnlySql(sql).replace('begin read only;',"begin read only;set local timezone='UTC';set local datestyle='ISO,YMD';"),read_only:false}})})
function inactivity(activity,drain){assert(activity.visible===true&&activity.tracking===true&&['hidden','writers','executors'].every(k=>Number(activity[k])===0),'Original activity is not quiescent/visible');assert(Object.values(drain).every(n=>Number(n)===0),'Accepted writer/lease/worker remains active')}
async function supplement(db,edgeSnapshot){
 const metadata=(await db.query(coreMetadataSql))[0];assert(metadata.target&&metadata.other_functions.capped===false,'Target/function inventory unavailable')
 const edges=edgeSnapshot??[]
 if(!edgeSnapshot){const listing=await db.request('/functions');for(const expected of EDGE_MODES){const item=listing.find(e=>e.slug===expected.slug);assert(item,'Original Edge missing');const bytes=await db.request(`/functions/${expected.slug}/body`,{binary:true}),source=bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8');edges.push({slug:expected.slug,present:true,version:item.version,status:item.status,verifyJwt:item.verify_jwt,sha256:sha256(source)})}}
 const secrets=await db.request('/secrets');assert(secrets.every(s=>typeof s.name==='string'&&/^[a-f0-9]{64}$/.test(s.value)),'Digest-only Secret metadata required')
 const secretMetadataSha256=sha256(canonicalJson(secrets.map(s=>({name:s.name,digest:s.value})).sort((a,b)=>a.name.localeCompare(b.name))))
 return{...metadata,edges,secretMetadataSha256}
}
async function context(){
 const acceptance=await json(acceptedPath),acceptedPlan=await json(`${acceptedDir}/plan.json`),{reviewedSetSha256,...body}=acceptedPlan
 assert(acceptance.version===1&&acceptance.mode==='--run'&&acceptance.writes===1&&acceptance.responseReceived===true&&acceptance.project===developmentRef&&acceptance.ok&&acceptance.executionAccepted&&acceptance.rollbackVerified&&acceptance.reviewedSet===reviewedSetSha256&&sha256(canonicalJson(body))===reviewedSetSha256&&acceptance.diagnostic.acceptance.originalFailure.sqlstate==='42702'&&acceptance.diagnostic.acceptance.finalAccepted===true&&acceptance.diagnostic.variableConflict==='error','Actual accepted seed rollback required')
 const after=await json(acceptance.after.path);await verifyWindowStopReferences([...acceptedPlan.sources,...acceptedPlan.privateEvidence,acceptance.after])
 const original=await json(originalPath),base={deploymentPlan:original.deployment,sqlEvidence:original.sqlEvidence,installedCheck:original.installed,finalState:original.finalState};await verifyWindowStopReferences(Object.values(base))
 const sqlEvidence=await json(base.sqlEvidence.path),deployment=await json(base.deploymentPlan.path),migration=await readFile(migrationPath,'utf8'),beforeSource=await readFile('supabase/migrations/0025_service_lifecycle.sql','utf8')
 const bodyOf=s=>s.match(/create or replace function public\.push_ops\([\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1]
 const beforeBodySha256=sha256(bodyOf(beforeSource)),afterBodySha256=sha256(bodyOf(migration));assert(after.function.body_sha256===beforeBodySha256&&sha256(migration)==='ccbcf338043fff8198cba04a73f0ab60784820989aa71436fab95dcb4e8c595a','Exact old/new push source required')
 assert(acceptedPlan.originalBodySha256===beforeBodySha256&&acceptedPlan.sources.some(s=>resolve(s.path)===resolve(migrationPath)&&s.sha256===sha256(migration))&&acceptance.diagnostic.acceptance.migrationSHA256===sha256(migration)&&acceptance.diagnostic.acceptance.functionContractPreserved===true&&acceptance.diagnostic.acceptance.otherFunctionsPreserved===true,'Executed rollback did not bind this migration and original function')
 return{acceptance,acceptedPlan,after,base,sqlEvidence,deployment,migration,beforeBodySha256,afterBodySha256}
}
async function sources(input){
 const entry=resolve('scripts/billing/d2-seed-push-install.mjs'),analysis=await build({entryPoints:[entry],bundle:true,write:false,metafile:true,platform:'node',format:'esm',target:'es2022',external:['node:*'],logLevel:'silent'}),require=createRequire(import.meta.url),esbuildEntry=require.resolve('esbuild'),esbuildRequire=createRequire(esbuildEntry)
 const paths=[...Object.keys(analysis.metafile.inputs),process.execPath,esbuildEntry,resolve(dirname(esbuildEntry),'../package.json'),esbuildRequire.resolve(`@esbuild/${process.platform}-${process.arch}/bin/esbuild`),'package.json','pnpm-lock.yaml',`${root}/failure-cases.md`,migrationPath,originalPath,acceptedPath,`${acceptedDir}/plan.json`,`${acceptedDir}/dispatch-intent.json`,input.acceptance.after.path,...Object.values(input.base).map(x=>x.path)]
 return Promise.all([...new Set(paths.map(p=>resolve(p)))].sort().map(descriptor))
}
export function buildSeedInstallSql(plan,migration){
 const before=plan.before,expected=plan.metadata
 const bad=(condition,reason)=>`if (${condition}) is distinct from true then raise exception ${q(reason)};end if;`
 const sql=`begin;set local application_name=${q(plan.applicationName)};set local timezone='UTC';set local datestyle='ISO,YMD';set local statement_timeout='15s';set local lock_timeout='3s';
 create temporary table seed_install_result(payload jsonb) on commit drop;
 do $seed_install$ declare v_stage text:='activity';v_sqlstate text;v_activity jsonb;v_drain jsonb;v_before jsonb;v_after jsonb;v_others jsonb;v_schema jsonb;begin
 begin
 ${noSemi(activitySql(plan.applicationName)).replace(' as activity',' into v_activity')};
 ${noSemi(drainStateSql).replace(' as drain',' into v_drain')};
 ${bad("(v_activity->>'visible')::boolean and (v_activity->>'tracking')::boolean and not exists(select 1 from jsonb_each(v_activity) e where e.key in('hidden','writers','executors') and e.value<>'0'::jsonb) and not exists(select 1 from jsonb_each(v_drain) e where e.value<>'0'::jsonb)",'patch_active_writer')}
 v_stage:='locks';perform pg_advisory_xact_lock(hashtextextended('goalloom-development-d2-install',0));
 lock table service_private.policy,public.billing_policy,service_private.lifecycle_policy,service_private.migrations in share row exclusive mode;
 v_stage:='original-cas';
 ${bad(`(select environment='development' and project_ref=${q(developmentRef)} from service_private.policy where id=1)`,'patch_project_changed')}
 ${bad(`(select policies from(${noSemi(policiesSql)}) p)=${q(JSON.stringify(before.policies))}::jsonb`,'patch_policy_changed')}
 ${bad(`(select fingerprints from(${noSemi(businessSql(stableTables(before.tables)))}) b)=${q(JSON.stringify(before.business))}::jsonb`,'patch_business_changed')}
 ${bad(`(select fingerprints from(${noSemi(catalogSql)}) c)=${q(JSON.stringify(before.catalog))}::jsonb`,'patch_catalog_changed')}
 ${bad(`(select counters from(${noSemi(countersSql)}) c)=${q(JSON.stringify({control:before.sequence,auth:before.authSequence}))}::jsonb`,'patch_sequence_changed')}
 ${bad(`(select private_history from(${noSemi(historySql)}) h)=${q(JSON.stringify(expected.private_history))}::jsonb`,'patch_history_changed')}
 select target into v_before from(${noSemi(targetSql)}) t;
 ${bad(`v_before=${q(JSON.stringify(expected.target))}::jsonb`,'patch_original_function_changed')}
 ${bad(`(select other_functions from(${noSemi(otherFunctionsSql)}) f)=${q(JSON.stringify(expected.other_functions))}::jsonb`,'patch_other_function_changed')}
 v_stage:='forward-function';execute ${q(migration)};
 v_stage:='history';insert into service_private.migrations(version,sha256) values('0029',${q(plan.migration.sha256)});
 v_stage:='definition-proof';select target into v_after from(${noSemi(targetSql)}) t;
 select other_functions into v_others from(${noSemi(otherFunctionsSql)}) f;
 select schema_attestation into v_schema from(${noSemi(normalizedSchemaSql)}) s;
 ${bad(`v_after->>'bodySha256'=${q(plan.target.afterBodySha256)} and v_after->'contract'=v_before->'contract'`,'patch_contract_or_source_changed')}
 ${bad(`v_others=${q(JSON.stringify(expected.other_functions))}::jsonb`,'patch_other_functions_changed')}
 ${bad(`v_schema-'functions'=${q(JSON.stringify(without(expected.schema_attestation,['functions'])))}::jsonb`,'patch_schema_changed')}
 ${bad(`(select private_history from(${noSemi(historySql)}) h)=${q(JSON.stringify(plan.privateHistory))}::jsonb`,'patch_history_append_changed')}
 insert into pg_temp.seed_install_result values(jsonb_build_object('ok',true,'stage','complete','target',v_after,'schemaAttestation',v_schema,'otherFunctions',v_others));
 exception when query_canceled or assert_failure then get stacked diagnostics v_sqlstate=returned_sqlstate;insert into pg_temp.seed_install_result values(jsonb_build_object('ok',false,'stage',v_stage,'sqlstate',v_sqlstate));
 when others then get stacked diagnostics v_sqlstate=returned_sqlstate;insert into pg_temp.seed_install_result values(jsonb_build_object('ok',false,'stage',v_stage,'sqlstate',v_sqlstate));end;
 end $seed_install$;
 select payload as seed_installation from pg_temp.seed_install_result;
 commit;`
 return sql
}
async function makePlan(metadataPath){
 const input=await context(),sourcesNow=await sources(input),report={version:1,project:developmentRef,sourceOnly:true,remoteExecuted:false,applicationName:`d2-install:${randomUUID()}`,maximumWriteRequests:1,base:input.base,acceptance:{plan:await descriptor(`${acceptedDir}/plan.json`),report:await descriptor(acceptedPath)},migration:{file:'0029_seed_push_scope.sql',sha256:sha256(input.migration)},target:{signature:'public.push_ops(uuid,uuid,uuid,jsonb)',beforeBodySha256:input.beforeBodySha256,afterBodySha256:input.afterBodySha256,contractPreserved:true,otherFunctionsPreserved:true},before:input.after,sources:sourcesNow,privateEvidence:input.acceptedPlan.privateEvidence,scope:'Only exact 0029 CREATE OR REPLACE plus one private history row; six flags closed, no activation, fixture, provider or production.'}
 if(metadataPath){
  const inspected=await json(metadataPath);assert(inspected.project===developmentRef&&inspected.readOnly===true&&inspected.remoteWrites===0,'Read-only installation metadata required');report.metadata=inspected.metadata;report.metadataReference=await descriptor(metadataPath)
  assert(same(report.metadata.catalog,report.before.catalog)&&report.metadata.target.bodySha256===report.target.beforeBodySha256,'Metadata differs from accepted original source/catalog')
  assert(same(report.metadata.schema_attestation,input.sqlEvidence.installedSchemaAttestation),'Original closed schema/configuration differs from accepted129')
  assert(same(report.metadata.edges,input.deployment.bundles.map(b=>({slug:b.slug,present:true,version:report.metadata.edges.find(e=>e.slug===b.slug).version,status:'ACTIVE',verifyJwt:b.verifyJwt,sha256:b.sha256}))))
  const expectedHistory=[...input.deployment.history.privatePrefix,...input.deployment.inputs.migrations.map(m=>({version:m.file.slice(0,4),sha256:m.sha256}))]
  assert(same(report.metadata.private_history,expectedHistory)&&expectedHistory.length===11&&!expectedHistory.some(r=>r.version==='0029'),'Exact unpatched history required')
  report.privateHistory=[...report.metadata.private_history,{version:'0029',sha256:report.migration.sha256}]
  report.sqlSha256=sha256(buildSeedInstallSql(report,input.migration))
 }
 report.reviewedSetSha256=sha256(canonicalJson(report));const directory=`${root}/plans/${report.reviewedSetSha256}`
 if(report.sqlSha256)await immutable(`${directory}/install.sql`,buildSeedInstallSql(report,input.migration))
 return{plan:report,reference:await immutable(`${directory}/plan.json`,report)}
}
async function reviewPlan(path,set){const plan=await json(path),{reviewedSetSha256,...body}=plan;assert(plan.project===developmentRef&&plan.version===1&&set===reviewedSetSha256&&sha256(canonicalJson(body))===set,'Exact reviewed patch set required');await verifyWindowStopReferences([...plan.sources,...plan.privateEvidence,...(plan.metadataReference?[plan.metadataReference]:[])]);return plan}
async function readback(db,plan){
 const state=await collectDeploymentState(db),meta=await supplement(db,state.edges),policies=(await db.query(policiesSql))[0].policies,counters=(await db.query(countersSql))[0].counters,activity=(await db.query(activitySql(plan.applicationName)))[0].activity;inactivity(activity,state.drain)
 const business=Object.fromEntries(Object.entries(state.business).filter(([k])=>stableTables(state.tables).some(t=>`${t.schema}.${t.name}`===k)))
 const checks={schemaMatched:same(without(meta.schema_attestation,['functions']),without(plan.metadata.schema_attestation,['functions']))&&meta.schema_attestation.functions.rows===plan.metadata.schema_attestation.functions.rows&&meta.schema_attestation.functions.capped===false&&meta.schema_attestation.functions.sha256!==plan.metadata.schema_attestation.functions.sha256,
 historyMatched:same(meta.private_history,plan.privateHistory),sourceMatched:meta.target.bodySha256===plan.target.afterBodySha256,contractPreserved:same(meta.target.contract,plan.metadata.target.contract),otherFunctionsPreserved:same(meta.other_functions,plan.metadata.other_functions),businessPreserved:same(without(business,['service_private.migrations']),without(plan.before.business,['service_private.migrations']))&&same(counters,{control:plan.before.sequence,auth:plan.before.authSequence}),closed:same(policies,plan.before.policies)}
 const preservation={catalogExceptTargetMatched:same(without(state.catalog,['pg_proc']),without(plan.before.catalog,['pg_proc'])),cronMatched:state.business['cron.job'].sha256===plan.before.business['cron.job'].sha256,edgesMatched:same(meta.edges,plan.metadata.edges),secretMetadataMatched:meta.secretMetadataSha256===plan.metadata.secretMetadataSha256,activityVerified:true}
 return{checks,preservation,metadata:meta,counters,activity,state}
}
async function execute(mode,path,set){
 const plan=await reviewPlan(path,set);assert(plan.sqlSha256&&plan.metadata,'Reviewed complete patch plan required before credentials');const migration=await readFile(migrationPath,'utf8'),sql=buildSeedInstallSql(plan,migration);assert(sha256(sql)===plan.sqlSha256,'Reviewed installation SQL changed')
 const dir=`${root}/plans/${set}`,intentPath=`${dir}/dispatch-intent.json`,id=randomUUID(),report={version:1,project:developmentRef,reviewedSet:set,mode,ok:false,remoteExecuted:false,writes:0,migration:plan.migration,errors:[]};let db,lock,intent
 try{
  try{intent=await json(intentPath)}catch(e){if(e.code!=='ENOENT')throw e}
  if(mode==='--run')assert(!intent,'Original installation intent exists; check only, never replay');else assert(intent,'Original installation intent required')
  if(intent)assert(intent.version===1&&intent.project===developmentRef&&intent.reviewedSet===set&&intent.applicationName===plan.applicationName&&intent.sqlSha256===plan.sqlSha256&&intent.outcome==='unknown'&&intent.maximumWriteRequests===1&&same(intent.before,plan.before)&&same(intent.metadata,plan.metadata),'Original installation intent changed')
  if(mode==='--run')lock=await acquireDeploymentLock(dir,set,plan.applicationName.slice('d2-install:'.length))
  const raw=await client();db=readonlyPort(raw)
  if(!intent){
   const current=await collectDeploymentState(db),meta=await supplement(db,current.edges),policies=(await db.query(policiesSql))[0].policies,activity=(await db.query(activitySql(plan.applicationName)))[0].activity,counters=(await db.query(countersSql))[0].counters;inactivity(activity,current.drain)
   const business=Object.fromEntries(Object.entries(current.business).filter(([k])=>stableTables(current.tables).some(t=>`${t.schema}.${t.name}`===k)))
   assert(same(meta,plan.metadata)&&same(current.catalog,plan.before.catalog)&&same(business,plan.before.business)&&same(policies,plan.before.policies)&&same(counters,{control:plan.before.sequence,auth:plan.before.authSequence}),'Reviewed patch baseline drift; no dispatch')
   const handle=await open(intentPath,'wx',0o600);try{await handle.writeFile(JSON.stringify({version:1,project:developmentRef,reviewedSet:set,applicationName:plan.applicationName,sqlSha256:plan.sqlSha256,before:plan.before,metadata:plan.metadata,maximumWriteRequests:1,outcome:'unknown'},null,2)+'\n');await handle.sync()}finally{await handle.close()}
   const parent=await open(dir,'r');try{await parent.sync()}finally{await parent.close()}
   report.writes=1;report.remoteExecuted=true
   try{report.result=(await raw.query(sql,false)).find(r=>r.seed_installation)?.seed_installation??null;report.responseReceived=true}catch(e){const code=e.message?.match(/^Management POST \/database\/query: HTTP ([1-5][0-9]{2})$/);if(code)report.httpStatus=Number(code[1]);else report.responseLost=true}
  }else report.remoteExecuted=true
 }catch(e){report.errors.push({type:e.name==='AssertionError'?'guard_failed':'patch_unknown',reason:e.name==='AssertionError'?e.message:'inspect_original_intent_no_retry'})}
 finally{
  if(db)try{const observed=await readback(db,plan);report.readback=observed.checks;report.preservation=observed.preservation;if(report.result?.ok===true)report.preservation.transactionAttestationMatched=same(report.result.schemaAttestation,observed.metadata.schema_attestation)&&same(report.result.target,observed.metadata.target)&&same(report.result.otherFunctions,observed.metadata.other_functions);report.schemaAttestation=observed.metadata.schema_attestation;report.privateHistory=observed.metadata.private_history;report.target=observed.metadata.target;report.counters=observed.counters;report.originalTransactionsAbsent=true;report.after=await immutable(`${dir}/after-${id}.json`,observed);await verifyWindowStopReferences([...plan.sources,...plan.privateEvidence,plan.metadataReference]);report.originalEvidencePreserved=true}catch{report.errors.push({type:'independent_patch_postflight_unverified'})}
  if(lock&&report.originalTransactionsAbsent)try{await lock.release()}catch{report.errors.push({type:'executor_lock_retained'})}
  else if(lock)report.errors.push({type:'executor_lock_retained_until_original_transaction_absence'})
 }
 report.ok=report.remoteExecuted&&report.originalEvidencePreserved&&(!report.result||report.result.ok===true)&&Object.values(report.readback??{}).length===7&&Object.values(report.readback??{}).every(Boolean)&&Object.values(report.preservation??{}).every(Boolean)&&report.errors.length===0
 const reference=await immutable(`${dir}/${mode.slice(2)}-${id}.json`,report)
 if(report.ok){const manifest={version:1,kind:'d2-seed-push-scope',project:developmentRef,base:plan.base,migration:plan.migration,target:plan.target,acceptance:plan.acceptance,installation:{plan:await descriptor(path),report:reference},schemaAttestation:report.schemaAttestation,privateHistory:report.privateHistory};report.manifest=await immutable(`${dir}/manifest-${sha256(canonicalJson(manifest))}.json`,manifest)}
 return{report,reference}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),mode=args[0]??'--plan',flag=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1]};assert(['--plan','--inspect','--run','--check'].includes(mode))
 if(mode==='--plan'){const result=await makePlan(flag('--metadata'));console.log(JSON.stringify({remoteExecuted:false,executionReady:!!result.plan.sqlSha256,reviewedSet:result.plan.reviewedSetSha256,...result.reference}))}
 else if(mode==='--inspect'){assert(process.env.D2_SEED_INSTALL_READ==='development','Development read-only metadata scope required before credentials');const input=await context(),metadata=await supplement(readonlyPort(await client()));assert(same(metadata.catalog,input.after.catalog)&&metadata.target.bodySha256===input.beforeBodySha256,'Original accepted catalog/source changed');const value={version:1,project:developmentRef,readOnly:true,remoteWrites:0,metadata},bytes=JSON.stringify(value,null,2)+'\n';console.log(JSON.stringify(await immutable(`${root}/metadata-${sha256(bytes)}.json`,bytes)))}
 else{assert((mode==='--run'?process.env.D2_SEED_INSTALL_WINDOW:process.env.D2_SEED_INSTALL_READ)==='development','Exact Root install/read-only window required before credentials');const result=await execute(mode,args[1],flag('--reviewed-set'));console.log(JSON.stringify({...result.reference,...result.report}));if(!result.report.ok)process.exitCode=1}
}
