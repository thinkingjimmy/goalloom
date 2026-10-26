/**
 * [INPUT]: Immutable original readiness/fixture/install/lease evidence and an explicit new recovery window.
 * [OUTPUT]: Local six-flag stop plan or one journaled closure with independent preservation readback.
 * [POS]: Fixture-window recovery only. Original journals/locks, schema, deployments and Auth remain untouched.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile,open,stat} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {client,developmentRef} from '../hosted-ai/client.mjs'
import {sha256} from '../deploy/schema.mjs'
import {literal as q} from './d1-sync-fixtures.mjs'
import {inventorySql,businessSql,catalogSql,validateInventory,isRuntime} from './d2-populated-gate.mjs'
import {attestCronRuntimeInventory} from './d2-cron-runtime.mjs'
import {journalDigest} from '../lifecycle/fixture-support.mjs'
const root='output/tests/billing/desktop/d2-deployment/fixture-stop-recovery'
const fixture='output/tests/billing/desktop/d2-lifecycle/development/970b180a-cbf5-4d01-b64c-64c73180ebdc'
const installed='output/tests/billing/desktop/d2-deployment/windows/ef4e96e05a745b44546c'
const refs={readiness:`${fixture}/readiness-bd97fc19-64c6-4a89-8273-f5ddf4496b74.json`,
 fixturePlan:`${fixture}/plan-0b1950d83fa9331a564ee4ba7efb236b662c01a4da9791446acdfd7826c4d2fe.json`,
 fixtureLease:'output/reviews/desktop-subscription-d1-d3-2026-10-23/d2-development-fixture-lease.json',
 installerPlan:'output/tests/billing/desktop/d2-deployment/plans/ef4e96e05a745b44546c/plan.json',
 originalStop:`${installed}/stop-b06bb704-7912-43d1-9de3-6b881dd3bd04.json`,failedStop:`${installed}/stop-f74dac13-248c-4867-b019-8048a67bff11.json`,installerJournal:`${installed}/journal.json`,privateJournal:`${fixture}/.fixtures-private.json`}
const sources=['scripts/billing/d2-fixture-stop-recovery.mjs','scripts/hosted-ai/client.mjs','scripts/deploy/transport.mjs','scripts/deploy/schema.mjs',
 'packages/contracts/src/canonical.ts','scripts/billing/d1-sync-fixtures.mjs','scripts/billing/d2-populated-gate.mjs','scripts/billing/d2-cron-runtime.mjs','scripts/lifecycle/fixture-support.mjs',`${root}/failure-cases.md`]
const targets=['service_private.policy','public.billing_policy','service_private.lifecycle_policy']
const same=(a,b)=>canonicalJson(a)===canonicalJson(b)
const hash=s=>`encode(pg_catalog.sha256(convert_to((${s})::text,'UTF8')),'hex')`
const allRows=table=>`(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from ${table} t)`
const policyValue=`jsonb_build_object('service',(select to_jsonb(p) from service_private.policy p where id=1),
 'billing',(select to_jsonb(p) from public.billing_policy p where environment='development'),
 'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1))`
const protectedValue=`jsonb_build_object('service',(select to_jsonb(p)-'enabled' from service_private.policy p where id=1),
 'billing',(select jsonb_agg(case when p.environment='development' then to_jsonb(p)-'enabled' else to_jsonb(p) end order by p.environment) from public.billing_policy p),
 'lifecycle',(select to_jsonb(p)-array['enabled','independent_ledger_ready','restore_admission_ready','cleanup_wiring_ready'] from service_private.lifecycle_policy p where id=1),
 'cron',${allRows('cron.job')},'budget',${allRows('public.ai_budget')},'drain',${allRows('service_private.transfer_drain_policy')},'access',${allRows('service_private.worker_access')},'source',${allRows('public.billing_sources')})`
const flagValue=`jsonb_build_object('service',(select enabled from service_private.policy where id=1),
 'billing',(select enabled from public.billing_policy where environment='development'),
 'lifecycle',(select enabled from service_private.lifecycle_policy where id=1),
 'ledger',(select independent_ledger_ready from service_private.lifecycle_policy where id=1),
 'restore',(select restore_admission_ready from service_private.lifecycle_policy where id=1),
 'cleanup',(select cleanup_wiring_ready from service_private.lifecycle_policy where id=1))`
const activeValue=`(select count(*) from pg_stat_activity where pid<>pg_backend_pid() and state<>'idle' and
 (application_name like 'd2-install:%' or application_name like 'd2-race-%' or application_name like 'd2-fixture-stop:%'))`
export const fixtureStopSnapshotSql=`select ${flagValue} as flags,${hash(protectedValue)} as protected_sha256,${activeValue} as original_active;`
export function fixtureStopSql(applicationName,expectedPolicies,job){
 assert(/^d2-fixture-stop:[a-f0-9-]{36}$/.test(applicationName))
 assert(expectedPolicies?.service?.project_ref===developmentRef&&expectedPolicies.service.environment==='development'&&expectedPolicies.billing.environment==='development','Original policy CAS required')
 assert(job?.jobid===2&&job.jobname==='goalloom-billing-worker-development'&&job.active===false&&/^[a-f0-9]{64}$/.test(job.command_sha256),'Original inactive cron identity required')
 return `begin;set local application_name=${q(applicationName)};set local lock_timeout='3s';set local statement_timeout='15s';
 select 1 from public.ai_budget where id='integration-shared' for update;
 select pg_advisory_xact_lock(hashtextextended('goalloom-development-d2-install',0));
 lock table service_private.policy,public.billing_policy,service_private.lifecycle_policy in share row exclusive mode;
 do $fixture_stop$ declare before_protected text;begin
 if not exists(select 1 from service_private.policy where id=1 and environment='development' and project_ref=${q(developmentRef)} and min_service_version=2)
  or (select count(*) from service_private.policy)<>1 or (select count(*) from service_private.lifecycle_policy)<>1
  or not exists(select 1 from public.billing_policy where environment='development')
  or not exists(select 1 from public.ai_budget where id='integration-shared' and environment='development')
  or ${activeValue}<>0 then raise exception 'fixture_stop_scope_invalid';end if;
 if ${policyValue} is distinct from ${q(JSON.stringify(expectedPolicies))}::jsonb then raise exception 'fixture_stop_policy_changed';end if;
 if not exists(select 1 from cron.job where jobid=${job.jobid} and jobname=${q(job.jobname)} and schedule=${q(job.schedule)} and active=false
  and ${hash('command')}=${q(job.command_sha256)}) or (select count(*) from cron.job where jobname=${q(job.jobname)})<>1 then raise exception 'fixture_stop_cron_changed';end if;
 if exists(select 1 from pg_trigger where tgrelid in('service_private.policy'::regclass,'public.billing_policy'::regclass,'service_private.lifecycle_policy'::regclass) and not tgisinternal and tgenabled<>'D') then raise exception 'fixture_stop_trigger_unreviewed';end if;
 before_protected:=${hash(protectedValue)};
 update service_private.policy set enabled=false where id=1;
 update public.billing_policy set enabled=false where environment='development';
 update service_private.lifecycle_policy set enabled=false,independent_ledger_ready=false,restore_admission_ready=false,cleanup_wiring_ready=false where id=1;
 if ${flagValue} is distinct from '{"service":false,"billing":false,"lifecycle":false,"ledger":false,"restore":false,"cleanup":false}'::jsonb
  or ${hash(protectedValue)} is distinct from before_protected then raise exception 'fixture_stop_preservation_failed';end if;
 end $fixture_stop$;commit;`
}
const record=async path=>{const b=await readFile(path);return{path,sha256:sha256(b),bytes:b.length}}
async function originalPolicies(){
 const path=refs.privateJournal;assert(((await stat(path)).mode&0o077)===0,'Owner-only original fixture journal required')
 const journal=JSON.parse(await readFile(path,'utf8')),before=journal.readinessBefore
 const fixturePlan=JSON.parse(await readFile(refs.fixturePlan,'utf8')),identityDigest=journalDigest(journal)
 assert(identityDigest===fixturePlan.identityDigest,'Original fixture identity digest changed')
 assert(before?.service?.enabled===false&&before.billing.enabled===false&&['enabled','independent_ledger_ready','restore_admission_ready','cleanup_wiring_ready'].every(k=>before.lifecycle[k]===false),'Original closed readiness baseline required')
 const expectedPolicies={service:{...before.service,enabled:true},billing:{...before.billing,enabled:true},lifecycle:{...before.lifecycle,enabled:true,independent_ledger_ready:true,restore_admission_ready:true,cleanup_wiring_ready:true}}
 const installer=JSON.parse(await readFile(refs.installerJournal,'utf8')),job={...installer.originalState.cron.find(j=>j.jobname==='goalloom-billing-worker-development'),active:false}
 return{readinessBeforeSha256:sha256(canonicalJson(before)),privateJournalIdentityDigest:identityDigest,expectedPolicies,job}
}
async function evidence(){
 const descriptors=await Promise.all([...Object.values(refs),...sources].map(record))
 const values=Object.fromEntries(await Promise.all(Object.entries(refs).map(async([k,p])=>[k,JSON.parse(await readFile(p,'utf8'))])))
 const r=values.readiness,f=values.fixturePlan,l=values.fixtureLease,i=values.installerPlan
 assert(r.ok&&r.remoteExecuted&&r.attempt==='bd97fc19-64c6-4a89-8273-f5ddf4496b74'&&r.reviewedSet===f.reviewedSetSha256&&r.result.developmentReadiness,'Original successful readiness required')
 assert(f.reviewedSetSha256==='0b1950d83fa9331a564ee4ba7efb236b662c01a4da9791446acdfd7826c4d2fe'&&l.reviewedSetSha256===f.reviewedSetSha256&&l.directUserApproval&&l.project===developmentRef,'Original approved fixture/lease required')
 assert(i.planSha256==='ef4e96e05a745b44546c918902efd0b1854929c34530da9aaafd03ee62885252'&&values.installerJournal.planSha256===i.planSha256,'Original installer required')
 assert(values.originalStop.ok&&values.originalStop.writes===1&&values.failedStop.writes===0&&!values.failedStop.ok,'Preserved original stop attempts required')
 return descriptors
}
const closed=state=>Object.values(state.flags).length===6&&Object.values(state.flags).every(x=>x===false)
async function observe(db){
 const inventory=validateInventory(await db.query(inventorySql)),runtime=await attestCronRuntimeInventory(db,inventory)
 const stable=runtime.tables.filter(t=>!isRuntime(t)&&!targets.includes(`${t.schema}.${t.name}`))
 return{state:(await db.query(fixtureStopSnapshotSql))[0],business:(await db.query(businessSql(stable)))[0].fingerprints,catalog:(await db.query(catalogSql))[0].fingerprints,
  runtimeSequenceProof:runtime.proof}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),mode=args[0]??'--plan',flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
 assert(['--plan','--run','--check'].includes(mode))
 if(mode==='--plan'){
  const original=await originalPolicies(),applicationName=`d2-fixture-stop:${randomUUID()}`,sql=fixtureStopSql(applicationName,original.expectedPolicies,original.job),plan={version:1,project:developmentRef,sourceOnly:true,remoteExecuted:false,
   ...original,applicationName,inputs:await evidence(),sqlSha256:sha256(sql),writeRequestsMax:1,scope:'Close exactly six flags for original bd97 readiness. No cron, restore barrier, drain, scope, AI, Auth, schema, deploy, original journal or lock change.'}
  plan.reviewedSetSha256=sha256(canonicalJson(plan));const directory=`${root}/plans/${plan.reviewedSetSha256.slice(0,20)}`;await mkdir(directory,{recursive:true,mode:0o700})
  const path=`${directory}/plan.json`;await writeFile(path,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});await writeFile(`${directory}/stop.sql`,sql+'\n',{flag:'wx',mode:0o600})
  console.log(JSON.stringify({path,reviewedSetSha256:plan.reviewedSetSha256,sqlSha256:plan.sqlSha256,sourceOnly:true,remoteExecuted:false}))
 }else{
  if(mode==='--run')assert(process.env.D2_FIXTURE_STOP_WINDOW==='development','Exact Root stop recovery window required before credentials')
  assert(new RegExp(`^${root}/plans/[a-f0-9]+/plan\\.json$`).test(args[1]),'Exact immutable stop recovery plan required')
  const plan=JSON.parse(await readFile(args[1],'utf8')),{reviewedSetSha256,...material}=plan
  assert(plan.project===developmentRef&&reviewedSetSha256===flag('--reviewed-set')&&sha256(canonicalJson(material))===reviewedSetSha256&&same(plan.inputs,await evidence()),'Stop recovery source/evidence drift')
  const original=await originalPolicies();assert(same(original,{readinessBeforeSha256:plan.readinessBeforeSha256,privateJournalIdentityDigest:plan.privateJournalIdentityDigest,expectedPolicies:plan.expectedPolicies,job:plan.job}),'Original readiness policy baseline changed')
  const sql=fixtureStopSql(plan.applicationName,plan.expectedPolicies,plan.job);assert(sha256(sql)===plan.sqlSha256,'Stop SQL changed')
  const directory=resolve(args[1],'..'),intentPath=`${directory}/dispatch-intent.json`
  if(mode==='--run')try{await readFile(intentPath);throw Error('Original stop dispatch exists; use --check, never replay')}catch(error){if(error.code!=='ENOENT')throw error}
  const report={version:1,ok:false,project:developmentRef,reviewedSetSha256,mode,applicationName:plan.applicationName,writes:0,dispatchEvidence:false,errors:[]};let db,before,baseline
  try{
   db=await client();before=await observe(db);report.before=before.state
   if(mode==='--check')try{const original=JSON.parse(await readFile(intentPath,'utf8'));assert(original.reviewedSetSha256===reviewedSetSha256&&original.sqlSha256===plan.sqlSha256&&original.before,'Original recovery intent changed');baseline=original.before;report.originalIntentCompared=true;report.dispatchEvidence=true}catch(error){if(error.code!=='ENOENT')throw error}
   assert(Number(before.state.original_active)===0,'Original executor still active')
   if(mode==='--run'&&!closed(before.state)){
    const h=await open(intentPath,'wx',0o600);try{await h.writeFile(JSON.stringify({reviewedSetSha256,applicationName:plan.applicationName,sqlSha256:plan.sqlSha256,before,outcome:'unknown',writes:1})+'\n');await h.sync()}finally{await h.close()}
    report.writes=1;baseline=before;report.dispatchEvidence=true
    try{await db.query(sql,false);report.responseReceived=true}catch(error){const m=String(error?.message).match(/^Management POST \/database\/query: HTTP ([1-5][0-9]{2})$/);if(m)report.httpStatus=Number(m[1]);else report.responseLost=true}
   }
  }catch(error){report.errors.push({type:error?.name==='AssertionError'?'guard_failed':'stop_inspection_incomplete',reason:error?.name==='AssertionError'?error.message:'inspect_original_intent_no_retry'})}
  finally{
   if(db)try{
    const after=await observe(db);report.after=after.state;report.closed=closed(after.state);report.originalTransactionsAbsent=Number(after.state.original_active)===0
    report.protectedConfigurationMatched=baseline?after.state.protected_sha256===baseline.state.protected_sha256:null
    report.unrelatedBusinessMatched=baseline?same(after.business,baseline.business):null;report.catalogMatched=baseline?same(after.catalog,baseline.catalog):null
    assert(same(plan.inputs,await evidence()),'Original evidence changed during recovery');await originalPolicies();report.originalEvidencePreserved=true
    const preservation=!report.dispatchEvidence||report.protectedConfigurationMatched&&report.unrelatedBusinessMatched&&report.catalogMatched
    report.ok=report.closed&&report.originalTransactionsAbsent&&preservation&&report.errors.length===0
    report.executionVerified=report.dispatchEvidence&&report.ok
    report.outcome=report.dispatchEvidence?(report.ok?'confirmed_by_readback':'original_outcome_unverified'):(report.closed?'already_closed_not_executed':'open_not_executed')
   }catch{report.errors.push({type:'independent_postflight_unverified'})}
  }
  const path=`${directory}/${mode.slice(2)}-${randomUUID()}.json`,bytes=JSON.stringify(report,null,2)+'\n';await writeFile(path,bytes,{flag:'wx',mode:0o600})
  console.log(JSON.stringify({path,sha256:sha256(bytes),...report}));if(!report.ok)process.exitCode=1
 }
}
