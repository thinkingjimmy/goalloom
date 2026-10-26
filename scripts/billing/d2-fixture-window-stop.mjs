/**
 * [INPUT]: Exact initial/resume activation, validated child-stage lineage, held journal and current policy/restore snapshot.
 * [OUTPUT]: Immutable plans and one six-flag stop intent per window, with independent preservation readback.
 * [POS]: Thin D2 closure composition over the unchanged recovery SQL; no fixture lifecycle or billing engine.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,open,lstat} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {client,developmentRef} from '../hosted-ai/client.mjs'
import {sha256} from '../deploy/schema.mjs'
import {literal as q} from './d1-sync-fixtures.mjs'
import {fixtureStopSql,fixtureStopSnapshotSql} from './d2-fixture-stop-recovery.mjs'
import {inventorySql,businessSql,catalogSql,validateInventory,isRuntime} from './d2-populated-gate.mjs'
import {attestCronRuntimeInventory} from './d2-cron-runtime.mjs'
import {journalDigest} from '../lifecycle/fixture-support.mjs'
import {checkIntegrationChild} from '../lifecycle/fixture-continuation.mjs'

const root='output/tests/billing/desktop/d2-deployment/window-stop'
const same=(a,b)=>canonicalJson(a)===canonicalJson(b)
const six={service:['enabled'],billing:['enabled'],lifecycle:['enabled','independent_ledger_ready','restore_admission_ready','cleanup_wiring_ready']}
const policySql=`select jsonb_build_object('service',(select to_jsonb(p) from service_private.policy p where id=1),
 'billing',(select to_jsonb(p) from public.billing_policy p where environment='development'),
 'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1)) policies;`
const targets=['service_private.policy','public.billing_policy','service_private.lifecycle_policy']
const descriptor=async path=>{const bytes=await readFile(path);return{path:resolve(path),sha256:sha256(bytes),bytes:bytes.length}}
const json=async path=>JSON.parse(await readFile(path,'utf8'))
async function immutable(path,value){
 await mkdir(dirname(path),{recursive:true,mode:0o700});const bytes=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n'
 try{await writeFile(path,bytes,{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST')throw error;assert((await readFile(path,'utf8'))===bytes,'Immutable window artifact changed')}
 return descriptor(path)
}
function verifyPlan(plan){const {reviewedSetSha256,...body}=plan;assert(plan.project===developmentRef&&sha256(canonicalJson(body))===reviewedSetSha256,'Fixture plan checksum mismatch')}
async function journalFor(path,identityDigest){
 const info=await lstat(path);assert(info.isFile()&&!info.isSymbolicLink()&&(info.mode&0o077)===0,'Original owner-only journal required')
 const reference=await descriptor(path),journal=await json(path)
 assert(journal.project===developmentRef&&journalDigest(journal)===identityDigest,'Original fixture identity changed')
 return{reference,journal}
}
export async function verifyWindowStopReferences(references){
 for(const reference of references){
  assert(typeof reference?.path==='string'&&/^[a-f0-9]{64}$/.test(reference.sha256),'Invalid window reference')
  const current=await descriptor(reference.path)
  assert(current.path===resolve(reference.path)&&current.sha256===reference.sha256,'Window source/evidence/journal changed')
  if(Object.hasOwn(reference,'bytes'))assert(Number.isSafeInteger(reference.bytes)&&reference.bytes>=0&&current.bytes===reference.bytes,'Window reference byte length changed')
 }
}
async function sourceSet(){
 const entry=resolve('scripts/billing/d2-fixture-window-stop.mjs'),analysis=await build({entryPoints:[entry],bundle:true,write:false,metafile:true,platform:'node',format:'esm',target:'es2022',external:['node:*'],logLevel:'silent'})
 const require=createRequire(import.meta.url),esbuildEntry=require.resolve('esbuild'),esbuildRequire=createRequire(esbuildEntry)
 const paths=[...new Set([...Object.keys(analysis.metafile.inputs),process.execPath,esbuildEntry,resolve(dirname(esbuildEntry),'../package.json'),esbuildRequire.resolve(`@esbuild/${process.platform}-${process.arch}/bin/esbuild`),'package.json','pnpm-lock.yaml',`${root}/failure-cases.md`,`${root}/contract.md`].map(p=>resolve(p)))].sort()
 return Promise.all(paths.map(descriptor))
}
function initialPolicies(context){
 const result=structuredClone(context.basePolicies)
 for(const [table,fields] of Object.entries(six))for(const field of fields)result[table][field]=true
 return result
}
function applications(journal,additional=[]){
 const names=new Set()
 for(const name of [journal.readinessActivation?.applicationName,journal.readinessResumption?.applicationName,journal.cleanup?.sqlApplicationName,...(journal.cleanup?.sqlAttempts??[]).map(x=>x.applicationName),...additional])if(name)names.add(name)
 for(const entry of journal.races??[])for(const kind of ['setup','holder','waiter'])names.add(`d2-race-${kind}:${entry.fixture.ownerId}`)
 assert([...names].every(name=>/^d2-(?:install|race-(?:setup|holder|waiter)):[a-f0-9-]{36}$/.test(name)),'Original transaction name invalid')
 return [...names].sort()
}
export function windowStopKey({project,identityDigest,readinessIntentId}){
 assert(project===developmentRef&&/^[a-f0-9]{64}$/.test(identityDigest)&&/^[a-f0-9]{64}$/.test(readinessIntentId),'Stable readiness activation identity required')
 return sha256(canonicalJson({project,identityDigest,readinessIntentId}))
}
async function contextFor({originalPlanPath,resumePlanPath,readinessReceiptPath,restoreReceiptPath,journalHeld}){
 assert(journalHeld===true,'Lifecycle must hold journal writes and producers before capture')
 if(!resumePlanPath)return initialContext({originalPlanPath,readinessReceiptPath,restoreReceiptPath})
 const original=await json(originalPlanPath),resume=await json(resumePlanPath),readiness=await json(readinessReceiptPath)
 verifyPlan(original);verifyPlan(resume)
 const continuation=resume.resumeContinuation
 assert(continuation&&original.identityDigest===resume.identityDigest&&continuation.identityDigest===original.identityDigest&&same(resolve(original.privatePath),resolve(resume.privatePath))&&same(resolve(original.directory),resolve(resume.directory)),'Original fixture/resume identity mismatch')
 assert(continuation.parentPlan.sha256===(await descriptor(originalPlanPath)).sha256,'Resume parent differs from original plan')
 assert(readiness.ok&&readiness.remoteExecuted&&readiness.mode==='readiness'&&readiness.project===developmentRef&&readiness.reviewedSet===resume.reviewedSetSha256&&readiness.result?.developmentReadiness&&readiness.result.resumptionIntentVerified,'Successful original resume receipt required')
 assert(readiness.result.closedStopSha256===continuation.closedStop.sha256&&readiness.result.originalReadinessPreserved===true,'Resume receipt closure provenance differs')
 const held=await journalFor(original.privatePath,original.identityDigest),intent=held.journal.readinessResumption
 assert(intent?.verified&&intent.dispatchAttempted&&intent.reviewedSet===resume.reviewedSetSha256&&intent.intentId===continuation.intentId,'Original verified readiness intent missing')
 assert(/^d2-install:[a-f0-9-]{36}$/.test(intent.applicationName)&&intent.closedStopSha256===continuation.closedStop.sha256,'Original activation transaction/closure changed')
 const references=await Promise.all([originalPlanPath,resumePlanPath,readinessReceiptPath,...(restoreReceiptPath?[restoreReceiptPath]:[])].map(descriptor))
 await verifyWindowStopReferences([continuation.closedStop,continuation.stopPlan,continuation.originalReadiness,continuation.finalClosureContract])
 references.push(held.reference,continuation.closedStop,continuation.stopPlan,continuation.originalReadiness,continuation.finalClosureContract)
 const restore=restoreReceiptPath?await json(restoreReceiptPath):null
 if(restore)assert(typeof restore.ok==='boolean'&&restore.remoteExecuted===true&&restore.project===developmentRef&&restore.mode==='restore-fixture'&&restore.reviewedSet===resume.reviewedSetSha256,'Restore receipt belongs to another window or was not executed')
 const receipt=references.find(r=>r.path===resolve(readinessReceiptPath)),activation={intentId:intent.intentId,reviewedSet:intent.reviewedSet,applicationName:intent.applicationName,closedStopSha256:intent.closedStopSha256}
 const windowKey=windowStopKey({project:developmentRef,identityDigest:original.identityDigest,readinessIntentId:intent.intentId})
 return{original,resume,readiness,held,restore,references,windowKey,receipt,activation,basePolicies:continuation.closedPolicies,cron:continuation.cron}
}
async function initialContext({originalPlanPath,readinessReceiptPath,restoreReceiptPath}){
 const original=await json(originalPlanPath),readiness=await json(readinessReceiptPath)
 verifyPlan(original)
 assert(!original.cleanupContinuation&&!original.resumeContinuation,'Initial stop requires an original fixture plan')
 assert(readiness.ok===true&&readiness.remoteExecuted===true&&readiness.mode==='readiness'&&readiness.project===developmentRef
  &&readiness.reviewedSet===original.reviewedSetSha256&&readiness.result?.developmentReadiness===true,'Successful original initial readiness receipt required')
 const held=await journalFor(original.privatePath,original.identityDigest),journal=held.journal,intent=journal.readinessActivation
 assert(!journal.readinessResumption,'Initial stop cannot use a resumed activation')
 assert(intent?.kind==='initial'&&intent.verified===true&&intent.dispatchAttempted===true&&intent.reviewedSet===original.reviewedSetSha256
  &&/^d2-install:[a-f0-9-]{36}$/.test(intent.applicationName),'Original verified initial activation missing')
 assert(intent.intentId===sha256(canonicalJson({kind:'initial',project:developmentRef,identityDigest:original.identityDigest,runId:journal.runId,reviewedSet:original.reviewedSetSha256}))
  &&journal.readinessBefore&&intent.beforeSha256===sha256(canonicalJson(journal.readinessBefore)),'Initial activation identity or original policy digest changed')
 assert(readiness.result.initialActivationVerified===true&&readiness.result.activationIntentId===intent.intentId,'Initial readiness receipt activation differs')
 const handoff=readiness.finalStopHandoff
 assert(handoff?.verified===true&&handoff.project===developmentRef&&handoff.reviewedSet===original.reviewedSetSha256
  &&handoff.identityDigest===original.identityDigest&&handoff.originalTransactionsAbsent===true&&handoff.journalHoldRequired===true
  &&resolve(handoff.privateJournal?.path??'')===resolve(original.privatePath)&&/^[a-f0-9]{64}$/.test(handoff.privateJournal?.sha256),'Verified initial readiness handoff required')
 assert(Array.isArray(handoff.originalApplications)&&handoff.originalApplications.includes(intent.applicationName)
  &&handoff.originalApplications.every(name=>/^d2-(?:install|race-(?:setup|holder|waiter)):[a-f0-9-]{36}$/.test(name)),'Initial activation transaction missing from handoff')
 const cron=handoff.cron
 assert(Number.isSafeInteger(cron?.jobid)&&cron.jobid>0&&cron.jobname==='goalloom-billing-worker-development'&&cron.active===false
  &&typeof cron.schedule==='string'&&/^[a-f0-9]{64}$/.test(cron.command_sha256),'Initial handoff requires the exact inactive billing cron')
 const activation={kind:'initial',intentId:intent.intentId,reviewedSet:intent.reviewedSet,applicationName:intent.applicationName,beforeSha256:intent.beforeSha256}
 const context={original,readiness,held,activation,basePolicies:journal.readinessBefore,cron}
 assert(same(handoff.policies,initialPolicies(context)),'Initial readiness handoff policy differs from original activation')
 const references=await Promise.all([originalPlanPath,readinessReceiptPath,...(restoreReceiptPath?[restoreReceiptPath]:[])].map(descriptor))
 references.push(held.reference)
 const additionalApplications=[]
 const restore=restoreReceiptPath?await json(restoreReceiptPath):null
 if(restore){
  assert(typeof restore.ok==='boolean'&&restore.remoteExecuted===true&&restore.project===developmentRef&&restore.mode==='restore-fixture','Restore receipt belongs to another initial window or was not executed')
  if(restore.reviewedSet!==original.reviewedSetSha256){
   await verifyWindowStopReferences([restore.fixturePlan]);const child=await json(restore.fixturePlan.path),c=child.integrationContinuation
   assert(child.reviewedSetSha256===restore.reviewedSet&&c&&c.allowedStages.includes('restore-fixture')&&resolve(c.parentPlan.path)===resolve(originalPlanPath)&&c.parentPlan.sha256===(await descriptor(originalPlanPath)).sha256,'Restore child belongs to another initial activation')
   const {reports}=await checkIntegrationChild(child,{journal,lease:c.lease,select:false})
   additionalApplications.push(...c.originalApplications,...(restore.finalStopHandoff?.originalApplications??[]),...(journal.integrationContinuations??[]).map(entry=>entry.intent.applicationName))
   references.push(restore.fixturePlan,c.parentPlan,c.acceptedBoundary,...c.failures,...c.cleanups,...reports.map(report=>report.fixturePlan),...(c.readOnlyNoProgressResume?[c.readOnlyNoProgressEvidence]:[]))
  }
 }
 const receipt=references.find(r=>r.path===resolve(readinessReceiptPath))
 return{...context,restore,references,receipt,additionalApplications,windowKey:windowStopKey({project:developmentRef,identityDigest:original.identityDigest,readinessIntentId:intent.intentId})}
}
function restoreTuple(run){
 assert(run?.beginAttempted&&typeof run.head?.storeId==='string'&&run.head.storeId.length>0&&run.head.storeId.length<=200
  &&typeof run.head.cursor==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(run.head.cursor)&&BigInt(run.head.cursor)<=9223372036854775807n&&/^[a-f0-9]{64}$/.test(run.keyDigest),'Original persisted restore tuple missing')
 return{environment:'development',storeId:run.head.storeId,throughCursor:run.head.cursor,keyDigest:run.keyDigest}
}
export function restoreCompleted(receipt,run){return receipt?.ok===true&&receipt.result?.complete===true&&run?.verified===true}
export function operatorReadOnlySql(sql){
 assert(/^\s*(select|with)\b/i.test(sql),'Window inspection requires SELECT or WITH')
 return `begin read only;set local lock_timeout='3s';set local statement_timeout='15s';${sql};rollback;`
}
function operatorPort(raw){
 return{...raw,query:(sql,readOnly=true)=>readOnly?raw.request('/database/query',{method:'POST',json:{query:operatorReadOnlySql(sql),read_only:false}}):raw.query(sql,false)}
}
const restoreQuiescenceValue=`jsonb_build_object('operatorRole',current_user,'readOnly',current_setting('transaction_read_only')='on',
 'statsVisible',(select rolsuper from pg_roles where rolname=current_user) or pg_has_role(current_user,'pg_read_all_stats','USAGE'),
 'trackingEnabled',current_setting('track_activities')='on',
 'unobservableSessions',(select count(*) from pg_stat_activity where pid<>pg_backend_pid() and datname=current_database() and backend_type='client backend'
  and (state is null or state='disabled' or query='<insufficient privilege>')),
 'activeRestoreRpc',(select count(*) from pg_stat_activity where pid<>pg_backend_pid() and datname=current_database() and state is distinct from 'idle'
  and query~'\\mlifecycle_restore_(begin|capture|project)\\M'),
 'restoreTableLocks',(select count(*) from pg_locks where pid<>pg_backend_pid() and database=(select oid from pg_database where datname=current_database())
  and relation in('service_private.restore_runs'::regclass,'service_private.restore_events'::regclass,'service_private.lifecycle_policy'::regclass)
  and mode in('RowShareLock','RowExclusiveLock','ShareUpdateExclusiveLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock')))`
export const restoreQuiescenceSql=`select ${restoreQuiescenceValue} as restore_quiescence;`
export function verifyRestoreQuiescence(proof){
 assert(proof?.readOnly===true&&proof.statsVisible===true&&proof.trackingEnabled===true,'Original restore inactivity unverified: operator READ ONLY/full statistics visibility required')
 const zero=value=>value===0||value==='0'
 assert(typeof proof.operatorRole==='string'&&zero(proof.unobservableSessions)&&zero(proof.activeRestoreRpc)&&zero(proof.restoreTableLocks),'Original restore inactivity unverified: hidden session, active restore RPC or related table lock')
}
export function restoreRunLookupSql(run){
 const tuple=restoreTuple(run)
 return `select id,environment,store_id,through_cursor::text as through_cursor,key_digest,phase,
  (select count(*) from pg_stat_activity where pid<>pg_backend_pid() and state<>'idle' and (application_name like 'd2-install:%' or application_name like 'd2-race-%' or application_name like 'd2-fixture-stop:%')) as original_active,
  ${restoreQuiescenceValue} as restore_quiescence
 from service_private.restore_runs where environment=${q(tuple.environment)} and store_id=${q(tuple.storeId)}
 and through_cursor=${q(tuple.throughCursor)}::bigint and key_digest=${q(tuple.keyDigest)} limit 2;`
}
export function resolveRestoreRunRows(run,rows){
 const tuple=restoreTuple(run)
 assert(rows.length===1,'Original restore tuple unverified: expected exactly one run')
 const row=rows[0]
 assert(Number(row.original_active)===0,'Original restore tuple unverified: original transaction active')
 verifyRestoreQuiescence(row.restore_quiescence)
 assert(/^[a-f0-9-]{36}$/.test(row.id)&&row.environment===tuple.environment&&row.store_id===tuple.storeId&&row.through_cursor===tuple.throughCursor
  &&row.key_digest===tuple.keyDigest&&['capture','project','replayed'].includes(row.phase)&&(!run.runId||run.runId===row.id),'Original restore tuple unverified: run identity mismatch')
 return{source:'read_only_original_tuple',runId:row.id,phase:row.phase,tupleSha256:sha256(canonicalJson(tuple)),querySha256:sha256(restoreRunLookupSql(run)),
  quiescenceSqlSha256:sha256(restoreQuiescenceSql),quiescence:row.restore_quiescence,uniqueRows:1,originalTransactionsAbsent:true}
}
function continuity(context,policies,resolution=null){
 const expected=initialPolicies(context),barrier=policies.lifecycle?.restore_blocked
 assert(typeof barrier==='boolean','Actual restore barrier missing')
 assert(!(expected.lifecycle.restore_blocked===true&&barrier===false),'Restore barrier cannot be released')
 let restoreProof=null
 if(barrier)assert(context.held.journal.quarantine?.held===true,'Held restore barrier requires original external quarantine')
 if(barrier!==expected.lifecycle.restore_blocked){
  const run=context.held.journal.restore
  assert(barrier===true&&run&&context.held.journal.quarantine?.held===true&&context.restore,'Restore transition lacks original run/receipt/quarantine')
  const completed=restoreCompleted(context.restore,run)
  if(completed)assert(run.runId&&context.restore.result.originalDeadlinesPreserved&&context.restore.result.externalFixtureQuarantineHeld,'Completed restore proof missing')
  else{assert(resolution?.source==='read_only_original_tuple'&&resolution.uniqueRows===1&&resolution.originalTransactionsAbsent===true
   &&resolution.tupleSha256===sha256(canonicalJson(restoreTuple(run)))&&resolution.querySha256===sha256(restoreRunLookupSql(run))
   &&resolution.quiescenceSqlSha256===sha256(restoreQuiescenceSql)&&(!run.runId||resolution.runId===run.runId)&&/^[a-f0-9-]{36}$/.test(resolution.runId)
   &&['capture','project','replayed'].includes(resolution.phase),'Interrupted restore tuple unverified');verifyRestoreQuiescence(resolution.quiescence)}
  restoreProof={runId:run.runId??resolution.runId,state:completed?'completed':'interrupted',barrierHeld:true,quarantineHeld:true,...(!completed?{resolution}:{})}
  expected.lifecycle.restore_blocked=true
 }
 for(const [table,fields] of Object.entries(six))for(const field of fields){assert(typeof policies[table]?.[field]==='boolean','Current flag missing');expected[table][field]=policies[table][field]}
 assert(same(expected,policies),'Current policy changed outside this window or evidenced restore transition')
 return restoreProof
}
export {continuity as validateWindowStopPolicy}
async function observe(db,names){
 const inventory=validateInventory(await db.query(inventorySql)),runtime=await attestCronRuntimeInventory(db,inventory),stable=runtime.tables.filter(t=>!isRuntime(t)&&!targets.includes(`${t.schema}.${t.name}`))
 const state=(await db.query(fixtureStopSnapshotSql))[0],policies=(await db.query(policySql))[0].policies
 const exactActive=Number((await db.query(`select count(*) n from pg_stat_activity where pid<>pg_backend_pid() and state<>'idle' and application_name=any(array[${names.map(q).join(',')}]::text[])`))[0].n)
 return{state,policies,exactActive,business:(await db.query(businessSql(stable)))[0].fingerprints,catalog:(await db.query(catalogSql))[0].fingerprints,runtimeSequenceProof:runtime.proof}
}
const closed=o=>Object.values(o.state.flags).length===6&&Object.values(o.state.flags).every(x=>x===false)
const inactive=o=>Number(o.state.original_active)===0&&o.exactActive===0
export function buildWindowStopSql({policies,job},applicationName){return fixtureStopSql(applicationName,policies,job)}

export async function captureWindowStop(options,providedDb){
 const context=await contextFor(options),names=applications(context.held.journal,context.additionalApplications),sources=await sourceSet(),db=operatorPort(providedDb??await client())
 const observed=await observe(db,names);assert(inactive(observed),'Original fixture transaction remains active')
 let resolution=null
 if(observed.policies.lifecycle.restore_blocked&&!initialPolicies(context).lifecycle.restore_blocked&&context.restore&&!restoreCompleted(context.restore,context.held.journal.restore)){
  assert(inactive(observed),'Original restore transaction still active')
  verifyRestoreQuiescence((await db.query(restoreQuiescenceSql))[0]?.restore_quiescence)
  const run=context.held.journal.restore;resolution=resolveRestoreRunRows(run,await db.query(restoreRunLookupSql(run)))
 }
 const restore=continuity(context,observed.policies,resolution),job=context.cron
 const actual=(await db.query(`select jobid,jobname,schedule,active,encode(pg_catalog.sha256(convert_to(command,'UTF8')),'hex') command_sha256 from cron.job where jobname=${q(job.jobname)}`))
 assert(actual.length===1&&same(actual[0],job)&&job.active===false,'Original inactive cron changed')
 await verifyWindowStopReferences([...context.references,...sources]);await journalFor(context.held.reference.path,context.original.identityDigest)
 const snapshot={version:1,readOnly:true,remoteWrites:0,project:developmentRef,windowKey:context.windowKey,activation:context.activation,identityDigest:context.original.identityDigest,readinessReceipt:context.receipt,
  inputs:context.references,sources,options:{...options,journalHeld:true},journal:context.held.reference,applications:names,policies:observed.policies,job,restore,
  barrierExpected:observed.policies.lifecycle.restore_blocked,quarantineHeld:context.held.journal.quarantine?.held===true,observed}
 const bytes=JSON.stringify(snapshot,null,2)+'\n',path=`${root}/windows/${snapshot.windowKey}/snapshot-${sha256(bytes)}.json`
 return{snapshot,reference:await immutable(path,bytes)}
}
async function reviewSnapshot(path){
 assert(resolve(path).startsWith(resolve(`${root}/windows`)+ '/'),'Expected window snapshot path')
 const snapshot=await json(path);assert(snapshot.version===1&&snapshot.project===developmentRef&&snapshot.readOnly&&snapshot.remoteWrites===0,'Read-only snapshot required')
 const context=await contextFor(snapshot.options)
 assert(context.windowKey===snapshot.windowKey&&same(context.activation,snapshot.activation)&&same(context.references,snapshot.inputs)&&snapshot.identityDigest===context.original.identityDigest&&same(context.held.reference,snapshot.journal),'Snapshot window/journal changed')
 assert(same(continuity(context,snapshot.policies,snapshot.restore?.resolution??null),snapshot.restore)&&inactive(snapshot.observed)&&same(snapshot.observed.policies,snapshot.policies),'Snapshot policy provenance changed')
 await verifyWindowStopReferences([...snapshot.inputs,...snapshot.sources]);return snapshot
}
export async function createWindowStopPlan(snapshotPath){
 const snapshot=await reviewSnapshot(snapshotPath),applicationName=`d2-fixture-stop:${randomUUID()}`,sql=buildWindowStopSql(snapshot,applicationName)
 const plan={version:1,project:developmentRef,sourceOnly:true,remoteExecuted:false,windowKey:snapshot.windowKey,activation:snapshot.activation,identityDigest:snapshot.identityDigest,
  snapshot:await descriptor(snapshotPath),applicationName,sqlSha256:sha256(sql),sources:await sourceSet(),maximumWrites:1,
  intentPath:resolve(`${root}/windows/${snapshot.windowKey}/dispatch-intent.json`)}
 plan.reviewedSetSha256=sha256(canonicalJson(plan));const directory=`${root}/windows/${snapshot.windowKey}/plans/${plan.reviewedSetSha256}`
 const reference=await immutable(`${directory}/plan.json`,plan);await immutable(`${directory}/stop.sql`,sql+'\n');return{plan,reference}
}
async function reviewStopPlan(path,set){
 const plan=await json(path),{reviewedSetSha256,...body}=plan
 assert(plan.version===1&&plan.project===developmentRef&&set===reviewedSetSha256&&sha256(canonicalJson(body))===set,'Exact reviewed stop set required')
 assert(plan.intentPath===resolve(`${root}/windows/${plan.windowKey}/dispatch-intent.json`),'Window dispatch path changed')
 await verifyWindowStopReferences([plan.snapshot,...plan.sources]);const snapshot=await reviewSnapshot(plan.snapshot.path)
 assert(snapshot.windowKey===plan.windowKey&&same(snapshot.activation,plan.activation)&&snapshot.identityDigest===plan.identityDigest,'Stop belongs to another window')
 const sql=buildWindowStopSql(snapshot,plan.applicationName);assert(sha256(sql)===plan.sqlSha256,'Reviewed stop SQL changed');return{plan,snapshot,sql}
}
async function executeWindowStop(mode,path,set){
 const {plan,snapshot,sql}=await reviewStopPlan(path,set),report={version:1,ok:false,project:developmentRef,windowKey:plan.windowKey,reviewedSetSha256:set,mode,writes:0,dispatchEvidence:false,errors:[]}
 let db,baseline,intent
 try{
  try{intent=await json(plan.intentPath)}catch(error){if(error.code!=='ENOENT')throw error}
  if(intent)assert(intent.windowKey===plan.windowKey&&same(intent.activation,plan.activation)&&intent.identityDigest===plan.identityDigest&&intent.reviewedSetSha256===set&&intent.sqlSha256===plan.sqlSha256,'Original window intent belongs to another candidate; inspect that original plan')
  if(mode==='--run')assert(!intent,'Window already has a dispatch intent; use original --check, never replay')
  db=operatorPort(await client());const before=await observe(db,snapshot.applications);report.before=before.state
  assert(inactive(before),'Original fixture executor remains active')
  if(intent){baseline=intent.before;report.dispatchEvidence=true;report.originalIntentCompared=true}
  if(mode==='--run'&&!closed(before)){
   assert(same(before.policies,snapshot.policies)&&before.state.protected_sha256===snapshot.observed.state.protected_sha256,'Current policy CAS/protected state drift')
   await verifyWindowStopReferences([...snapshot.inputs,...snapshot.sources,...plan.sources])
   const handle=await open(plan.intentPath,'wx',0o600)
   try{await handle.writeFile(JSON.stringify({version:1,windowKey:plan.windowKey,activation:plan.activation,identityDigest:plan.identityDigest,reviewedSetSha256:set,sqlSha256:plan.sqlSha256,applicationName:plan.applicationName,planPath:resolve(path),before,outcome:'unknown',writes:1})+'\n');await handle.sync()}finally{await handle.close()}
   const directory=await open(dirname(plan.intentPath),'r');try{await directory.sync()}finally{await directory.close()}
   baseline=before;report.dispatchEvidence=true;report.writes=1
   try{await db.query(sql,false);report.responseReceived=true}catch(error){const known=String(error?.message).match(/^Management POST \/database\/query: HTTP ([1-5][0-9]{2})$/);if(known)report.httpStatus=Number(known[1]);else report.responseLost=true}
  }
 }catch(error){report.errors.push({type:error?.name==='AssertionError'?'guard_failed':'window_stop_incomplete',reason:error?.name==='AssertionError'?error.message:'inspect_original_window_intent_no_retry'})}
 finally{
  if(db)try{
   const after=await observe(db,snapshot.applications);report.after=after.state;report.closed=closed(after);report.originalTransactionsAbsent=inactive(after)
   report.barrierPreserved=after.policies.lifecycle.restore_blocked===snapshot.barrierExpected
   report.protectedConfigurationMatched=baseline?after.state.protected_sha256===baseline.state.protected_sha256:null
   report.unrelatedBusinessMatched=baseline?same(after.business,baseline.business):null;report.catalogMatched=baseline?same(after.catalog,baseline.catalog):null
   await reviewStopPlan(path,set);report.originalJournalAndEvidencePreserved=true
   report.ok=report.closed&&report.originalTransactionsAbsent&&report.barrierPreserved&&(!report.dispatchEvidence||report.protectedConfigurationMatched&&report.unrelatedBusinessMatched&&report.catalogMatched)&&report.errors.length===0
   report.executionVerified=report.dispatchEvidence&&report.ok;report.outcome=report.dispatchEvidence?(report.ok?'confirmed_by_readback':'original_outcome_unverified'):(report.closed?'already_closed_not_executed':'open_not_executed')
  }catch{report.errors.push({type:'independent_postflight_unverified'})}
 }
 const output=`${root}/windows/${plan.windowKey}/${mode.slice(2)}-${randomUUID()}.json`,reference=await immutable(output,report);return{report,reference}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),mode=args[0]??'--plan',flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
 assert(['--capture','--plan','--run','--check'].includes(mode))
 if(mode==='--capture'){
  assert(process.env.D2_WINDOW_STOP_READ==='development','Exact Root read-only handoff required before credentials')
  const result=await captureWindowStop({originalPlanPath:flag('--original-plan'),resumePlanPath:flag('--resume-plan'),readinessReceiptPath:flag('--readiness'),restoreReceiptPath:flag('--restore'),journalHeld:args.includes('--journal-held')})
  console.log(JSON.stringify({readOnly:true,remoteWrites:0,windowKey:result.snapshot.windowKey,...result.reference}))
 }else if(mode==='--plan'){
  if(!flag('--snapshot'))console.log(JSON.stringify({sourceOnly:true,remoteExecuted:false,ready:false,requires:'Original successful initial/resume receipt and held final current-policy snapshot; no credentials loaded.'}))
  else{const result=await createWindowStopPlan(flag('--snapshot'));console.log(JSON.stringify({sourceOnly:true,remoteExecuted:false,windowKey:result.plan.windowKey,reviewedSetSha256:result.plan.reviewedSetSha256,...result.reference}))}
 }else{
  assert((mode==='--run'?process.env.D2_WINDOW_STOP_WINDOW:process.env.D2_WINDOW_STOP_READ)==='development','Exact Root stop/read-only window required before credentials')
  const result=await executeWindowStop(mode,args[1],flag('--reviewed-set'));console.log(JSON.stringify({...result.reference,...result.report}));if(!result.report.ok)process.exitCode=1
 }
}
