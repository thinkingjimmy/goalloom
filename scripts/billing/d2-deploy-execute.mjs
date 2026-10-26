/**
 * [INPUT]: Exact reviewed development plan, optional immutable paused provenance, final rollback and an externally granted Root window.
 * [OUTPUT]: One-shot pause/schema/Edge/stop actions with an immutable attempt journal and independent readback.
 * [POS]: D2 forward-only installation executor. No activation, provider/model call, fixture or lifecycle worker.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {mkdir,readFile,open,rename} from 'node:fs/promises'
import {dirname} from 'node:path'
import {randomUUID} from 'node:crypto'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {client,developmentRef} from '../hosted-ai/client.mjs'
import {sha256} from '../deploy/schema.mjs'
import {eszipOriginalSource} from '../deploy/edge-source.mjs'
import {literal as q} from './d1-sync-fixtures.mjs'
import {businessSql,isRuntime} from './d2-populated-gate.mjs'
import {collectDeploymentState,BILLING_JOB,admissionStateSql,drainStateSql,historyFingerprintSql,buildPauseSql,buildInstallSql,buildStopSql} from './d2-deploy-state.mjs'
import {normalizedSchemaSql,CLOSED_DEFAULTS} from './d2-schema-attestation.mjs'
import {acquireDeploymentLock,recoverDeploymentLock} from './d2-deploy-lock.mjs'
const same=(a,b)=>canonicalJson(a)===canonicalJson(b)
const noSemi=s=>s.trim().replace(/;$/,'')
const drop=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)))
const stableState=state=>Object.fromEntries(Object.entries(state.business).filter(([key])=>!state.tables.some(t=>`${t.schema}.${t.name}`===key&&isRuntime(t))))
const oldTables=state=>state.tables.filter(t=>!isRuntime(t)&&`${t.schema}.${t.name}`!=='service_private.migrations')
const pausedJob=state=>state.cron.find(job=>job.jobname===BILLING_JOB)
const closed=state=>state.admission.service_enabled===false&&state.admission.billing_enabled===false&&pausedJob(state)?.active===false
async function atomicJson(path,value){
 const temporary=`${path}.${randomUUID()}.tmp`,handle=await open(temporary,'wx',0o600)
 try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync()}finally{await handle.close()}
 await rename(temporary,path)
}
function verifyPausedState(original,after){
 assert(closed(after),'Pause outcome remains unknown or admission is open')
 assert(after.admission.protected_fields_sha256===original.admission.protected_fields_sha256&&after.admission.min_service_version===original.admission.min_service_version,'Pause changed protected policy fields')
 assert(same(after.cron,original.cron.map(j=>j.jobname===BILLING_JOB?{...j,active:false}:j)),'Pause changed an unrelated cron field')
 assert(same(drop(stableState(after),['service_private.policy','public.billing_policy','cron.job']),drop(stableState(original),['service_private.policy','public.billing_policy','cron.job']))&&same(after.catalog,original.catalog),'Pause changed original protected data/schema')
}
export function originalBusinessReadbackSql(tables){
 const sql=businessSql(tables,{forward:true}),relation='pg_temp.d2_original_inbox'
 if(!sql.includes(relation))return sql
 return `with d2_live_original_inbox as (
  select i.environment,i.provider,i.event_id,a.user_id is not null as known_owner from public.billing_inbox i
  left join service_private.account_lifecycle a on a.environment=i.environment and a.subject_id=i.subject_id
 ) ${sql.replaceAll(relation,'d2_live_original_inbox')}`
}
async function edgeReadback(db,slug){
 const metadata=(await db.request('/functions')).find(e=>e.slug===slug)
 if(!metadata)return {slug,present:false}
 const bytes=await db.request(`/functions/${slug}/body`,{binary:true}),source=bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8')
 return {slug,present:true,version:metadata.version,status:metadata.status,verifyJwt:metadata.verify_jwt,sha256:sha256(source)}
}
async function snapshotSecretReadback(db,plan,journal){
 const producer=plan.snapshotProducer,original=journal.snapshotProducerBefore
 assert(original?.name===producer.secretName,'Original producer/Secret metadata journal required')
 const metadata=await db.request('/secrets')
 assert(metadata.every(s=>typeof s.name==='string'&&/^[a-f0-9]{64}$/.test(s.value)),'Expected digest-only Secret metadata')
 assert(metadata.find(s=>s.name===producer.secretName)?.value===sha256(producer.value),'Snapshot producer Secret digest metadata mismatch; never reveal Secret values')
 const unrelated=metadata.filter(s=>s.name!==producer.secretName).map(s=>({name:s.name,digest:s.value})).sort((a,b)=>a.name.localeCompare(b.name))
 assert(sha256(canonicalJson(unrelated))===original.unrelatedSecretDigest,'Unrelated original Secret metadata changed')
 return {name:producer.secretName,sourceSha256:producer.value,valueDigestMatched:true,unrelatedSecretDigestsMatched:true}
}
async function installedReadback(db,reviewed,journal,{finalStop=false}={}){
 const {plan,sqlEvidence}=reviewed
 const history=await db.query('select version,sha256 from service_private.migrations order by version')
 const expected=[...plan.history.privatePrefix,...plan.inputs.migrations.map(m=>({version:m.file.slice(0,4),sha256:m.sha256}))]
 assert(same(history,expected),'Installed private history mismatch; do not replay migrations')
 const schema=(await db.query(normalizedSchemaSql))[0].schema_attestation,accepted=sqlEvidence.installedSchemaAttestation
 assert(same(drop(schema,['configuration']),drop(accepted,['configuration'])),'Installed function/config/ACL/RLS/schema differs from final rollback')
 const configuration=schema.configuration
 assert(same(drop(configuration.service,['enabled']),drop(accepted.configuration.service,['enabled']))&&configuration.service.enabled===false,'Installed service source/config differs or admission is open')
 const readiness=configuration.readiness
 assert(same(drop(readiness,finalStop?['restoreBlocked']:[]),drop(CLOSED_DEFAULTS,finalStop?['restoreBlocked']:[])),'Installed readiness or worker-scope defaults differ')
 const oldHistory=(await db.query(historyFingerprintSql({coreHistoryPresent:journal.pausedState.coreHistoryPresent,oldPrivateOnly:true})))[0].history_sha256
 assert(oldHistory===journal.pausedState.history,'Original migration history changed')
 const original=(await db.query(originalBusinessReadbackSql(oldTables(journal.pausedState))))[0].fingerprints
 assert(same(original,journal.originalFields),'Original data/config/AI/source/sequence projection changed')
 const admission=(await db.query(admissionStateSql))[0]
 assert(admission.service_enabled===false&&admission.billing_enabled===false&&admission.protected_fields_sha256===journal.pausedState.admission.protected_fields_sha256,'Admission or protected policy/source fields changed')
 return {historyMatched:true,schemaMatched:true,originalFieldsMatched:true,originalHistoryMatched:true,readiness,admission,
  scope:accepted.scope,oldTransportRetirementVerified:false,fixtureAbsence:'Lifecycle fixture owner must supply its exact manifest cleanup evidence separately.'}
}
export async function executeDeploymentStage(mode,reviewed){
 const {plan,path}=reviewed,stage=mode.slice(2),directory=`output/tests/billing/desktop/d2-deployment/windows/${plan.planSha256.slice(0,20)}`
 assert(['pause','schema','edges','stop','check','recover'].includes(stage))
 assert(!(reviewed.continuation&&stage==='pause'),'Continuation preserves the original pause; a second pause is forbidden')
 if(!['check','recover'].includes(stage))assert(process.env.D2_INSTALL_WINDOW==='development','Exact Root mutation window required')
 await mkdir(directory,{recursive:true,mode:0o700})
 const attempt=randomUUID(),report={version:1,ok:false,project:developmentRef,planSha256:plan.planSha256,stage,attempt,outcome:'not_started',writes:0,startedAt:new Date().toISOString()}
 if(stage==='recover'){
  const evidence=`${directory}/recover-${attempt}.json`
  try{report.readback=await recoverDeploymentLock(directory,plan.planSha256);report.ok=true;report.outcome='read_only_recovery_verified'}
  catch(error){report.error={type:'recovery_not_verified',reason:error?.name==='AssertionError'?error.message:'retain_original_lock_and_journal'}}
  report.evidence=evidence;report.finishedAt=new Date().toISOString();await atomicJson(evidence,report);return report
 }
 const lock=await acquireDeploymentLock(directory,plan.planSha256,attempt)
 const journalPath=`${directory}/journal.json`,attemptPath=`${directory}/${stage}-${attempt}.json`
 let journal={version:1,project:developmentRef,planSha256:plan.planSha256,operations:[]},db
 const save=async()=>{await atomicJson(journalPath,journal);await atomicJson(attemptPath,report)}
 async function mutation(kind,send,observe){
  assert(!journal.operations.some(o=>o.kind===kind),'Original operation already exists; use read-only check, never automatic write replay')
  const operation={id:randomUUID(),kind,outcome:'unknown',startedAt:new Date().toISOString()};journal.operations.push(operation)
  report.outcome='unknown';report.writes++;await save()
  let sendFailed=false
  try{await send(operation);operation.outcome='response_received';await save()}
  catch(error){
   sendFailed=true
   const known=String(error?.message).match(/^Management (POST|PUT|PATCH|DELETE) (\/[a-z0-9_/-]+): HTTP ([1-5][0-9]{2})$/i)
   if(known)operation.responseError={method:known[1],path:known[2],httpStatus:Number(known[3])}
   else operation.transportResponseLost=true
   await save()
  }
  try{const observation=await observe(operation);operation.readback=observation;operation.outcome=sendFailed?'confirmed_by_readback':'verified';operation.finishedAt=new Date().toISOString();report.outcome=operation.outcome;await save();return observation}
  catch(error){operation.readbackError='required_state_unverified';await save();throw error}
 }
 try{
  try{journal=JSON.parse(await readFile(journalPath,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
  assert(journal.project===developmentRef&&journal.planSha256===plan.planSha256,'Another installation journal owns this window')
  await save();db=await client()
  if(reviewed.continuation){
   if(!journal.continuation){
    assert(stage==='schema'&&journal.operations.length===0,'Only one new schema attempt may adopt the original paused baseline')
    const original=reviewed.continuation.journal,fresh=await collectDeploymentState(db)
    assert(Number((await db.query(`select count(*) as n from pg_stat_activity where application_name=${q(original.installApplicationName)} and state<>'idle'`))[0].n)===0,'Original installation transaction is still active')
    assert(closed(fresh)&&Object.values(fresh.markers).every(v=>v===false)&&fresh.history===original.pausedState.history&&same(stableState(fresh),stableState(original.pausedState))&&same(fresh.catalog,original.pausedState.catalog)&&same(fresh.edges,original.pausedState.edges)&&same(fresh.cron,original.pausedState.cron),'Original paused baseline changed; continuation refused')
    journal.continuation={reference:reviewed.continuation.reference,originalSet:reviewed.continuation.manifest.originalSet,baselineReadbackVerified:true,adoptedAt:fresh.observedAt}
    journal.originalState=original.originalState;journal.pausedState=original.pausedState;journal.originalFields=original.originalFields
    await save()
   }
   assert(same(journal.continuation.reference,reviewed.continuation.reference),'Another continuation owns this journal')
  }
  const priorStage=journal.operations.find(o=>o.kind===stage)
  if(priorStage&&['pause','schema','stop'].includes(stage)){
   // A resumed original operation only reads its outcome; no write is replayed.
   if(stage==='pause'){
    const after=await collectDeploymentState(db);verifyPausedState(journal.originalState,after)
    journal.pausedState=after;journal.originalFields=(await db.query(businessSql(oldTables(after),{normalizePolicy:true})))[0].fingerprints
    report.readback={closed:true,originalPauseMatched:true}
   }else if(stage==='schema'){
    const active=(await db.query(`select count(*) as n from pg_stat_activity where application_name=${q(journal.installApplicationName)} and state<>'idle'`))[0].n
    assert(Number(active)===0,'Original installation transaction is still active')
    report.readback=await installedReadback(db,reviewed,journal)
   }else{
    const after=await collectDeploymentState(db);assert(closed(after),'Original stop outcome is not verified')
    assert(same(after.cron,journal.originalState.cron.map(j=>j.jobname===BILLING_JOB?{...j,active:false}:j)),'Original stop scheduler scope changed')
    report.readback=Object.values(after.markers).every(Boolean)?await installedReadback(db,reviewed,journal,{finalStop:true}):{closed:true,d2Installed:false}
   }
   priorStage.outcome='confirmed_by_readback';priorStage.readback=report.readback;report.outcome='confirmed_by_readback'
  }else if(stage==='pause'){
   const fresh=await collectDeploymentState(db),recorded=reviewed.preflight.observed
   assert(same(fresh.catalog,recorded.catalog),'Original preflight catalog changed before fresh runtime proof')
   // Equal full catalogs bind the fresh dependency proof to the earlier inventory;
   // the historical report itself stays unchanged.
   const original={...recorded,tables:recorded.tables.map(t=>{
    const proved=fresh.tables.find(candidate=>candidate.schema===t.schema&&candidate.name===t.name&&candidate.runtime_sequence)
    return proved&&t.kind==='S'&&t.owned_by===null?{...t,runtime_sequence:proved.runtime_sequence}:t
   })}
   assert(Object.values(fresh.markers).every(v=>v===false)&&same(stableState(fresh),stableState(original))&&same(fresh.edges,original.edges)&&same(fresh.cron,original.cron)&&fresh.history===original.history,'Fresh D1 preflight drift; no pause was sent')
   journal.originalState=fresh;await save()
   const app=lock.metadata.applicationName,sql=buildPauseSql({applicationName:app,job:pausedJob(fresh),admissionSha256:fresh.admission.admission_sha256})
   report.readback=await mutation('pause',()=>db.query(sql,false),async()=>{
    const after=await collectDeploymentState(db)
    verifyPausedState(fresh,after)
    journal.pausedState=after
    journal.originalFields=(await db.query(businessSql(oldTables(after),{normalizePolicy:true})))[0].fingerprints
    return {closed:true,aiAndProtectedDataMatched:true,billingJobId:pausedJob(after).jobid,oldTransportRetirementVerified:false}
   })
  }else if(stage==='schema'){
   assert(journal.pausedState&&(journal.continuation?.baselineReadbackVerified||journal.operations.some(o=>o.kind==='pause'&&['verified','confirmed_by_readback'].includes(o.outcome))),'Verified original pause journal required')
   const fresh=await collectDeploymentState(db);assert(closed(fresh)&&Object.values(fresh.markers).every(v=>v===false),'Paused D1 state required')
   assert(fresh.history===journal.pausedState.history&&same(stableState(fresh),stableState(journal.pausedState))&&same(fresh.catalog,journal.pausedState.catalog)&&same(fresh.edges,journal.pausedState.edges)&&same(fresh.cron,journal.pausedState.cron),'Paused original data/catalog/source/cron changed before installation')
   assert(Object.entries(fresh.drain).filter(([key])=>key!=='unknownAi').every(([,n])=>Number(n)===0),'Accepted writer/lease/queued worker remains active')
   journal.drainObservation={at:fresh.observedAt,counts:fresh.drain,oldEdges:fresh.edges,
    limitation:'Actual SQL/lease/queued-request quiescence only. No old Edge/Storage hard-lifetime or transport-retirement proof; all admission/readiness stays closed and only later exact scoped fixtures may run.'}
   const drainEvidenceSha256=sha256(canonicalJson(journal.drainObservation)),app=lock.metadata.applicationName
   const sql=buildInstallSql({applicationName:app,migrations:reviewed.migrations,tables:fresh.tables,coreHistoryPresent:fresh.coreHistoryPresent,historySha256:fresh.history,drainEvidenceSha256})
   journal.installApplicationName=app;await save()
   report.readback=await mutation('schema',()=>db.query(sql,false),async()=>{
    const active=(await db.query(`select count(*) as n from pg_stat_activity where application_name=${q(app)} and state<>'idle'`))[0].n
    assert(Number(active)===0,'Original install transaction remains active; stop before any write')
    return installedReadback(db,reviewed,journal)
   })
  }else if(stage==='edges'){
   assert(journal.operations.some(o=>o.kind==='schema'&&['verified','confirmed_by_readback'].includes(o.outcome)),'Verified exact schema journal required')
   await installedReadback(db,reviewed,journal)
   for(const edge of plan.bundles){
    const current=await edgeReadback(db,edge.slug),old=reviewed.preflight.observed.edges.find(e=>e.slug===edge.slug)
    const prior=journal.operations.find(o=>o.kind===`edge:${edge.slug}`)
    if(prior){assert(current.present&&current.status==='ACTIVE'&&current.verifyJwt===edge.verifyJwt&&current.sha256===edge.sha256,'Original Edge outcome is not verified; no write replay');prior.outcome='confirmed_by_readback';prior.readback=current;await save();continue}
    assert(same(current,old),'Old Edge version/source changed before dispatch')
    const source=await readFile(`${dirname(path)}/${edge.path}`),form=new FormData()
    form.set('metadata',JSON.stringify({name:edge.slug,entrypoint_path:'index.ts',verify_jwt:edge.verifyJwt}))
    form.append('file',new Blob([source],{type:'application/typescript'}),'index.ts')
    await mutation(`edge:${edge.slug}`,()=>db.request(`/functions/deploy?slug=${edge.slug}`,{method:'POST',form}),async()=>{
     const next=await edgeReadback(db,edge.slug)
     assert(next.present&&next.status==='ACTIVE'&&next.verifyJwt===edge.verifyJwt&&next.sha256===edge.sha256,'Deployed Edge metadata/source not verified; do not retry')
     return {...next,oldVersion:old.version??null,oldLastDispatchObserved:false,oldTransportRetirementVerified:false}
    })
   }
   const producer=plan.snapshotProducer
   const secretMetadata=await db.request('/secrets')
   assert(secretMetadata.every(s=>typeof s.name==='string'&&/^[a-f0-9]{64}$/.test(s.value)),'Expected digest-only Secret metadata')
   const unrelatedSecretDigest=sha256(canonicalJson(secretMetadata.filter(s=>s.name!==producer.secretName).map(s=>({name:s.name,digest:s.value})).sort((a,b)=>a.name.localeCompare(b.name))))
   journal.snapshotProducerBefore??={name:producer.secretName,priorDigest:secretMetadata.find(s=>s.name===producer.secretName)?.value??null,unrelatedSecretDigest};await save()
   assert(unrelatedSecretDigest===journal.snapshotProducerBefore.unrelatedSecretDigest,'Unrelated original Secret metadata changed')
   const verifyProducer=()=>snapshotSecretReadback(db,plan,journal)
   const previousProducer=journal.operations.find(o=>o.kind==='snapshot-producer-digest')
   if(previousProducer){previousProducer.readback=await verifyProducer();previousProducer.outcome='confirmed_by_readback';await save()}
   else await mutation('snapshot-producer-digest',()=>db.request('/secrets',{method:'POST',json:[{name:producer.secretName,value:producer.value}]}),verifyProducer)
   report.readback=await installedReadback(db,reviewed,journal)
   report.snapshotProducer=await snapshotSecretReadback(db,plan,journal)
   if(report.writes===0)report.outcome='read_only_verified'
  }else if(stage==='stop'){
   assert(journal.originalState,'Original exact scheduler/policy journal required')
   const app=lock.metadata.applicationName,sql=buildStopSql({applicationName:app,job:pausedJob(journal.originalState)})
   report.readback=await mutation('stop',()=>db.query(sql,false),async()=>{
    const after=await collectDeploymentState(db);assert(closed(after),'Final stop is not verified')
    assert(same(after.cron,journal.originalState.cron.map(j=>j.jobname===BILLING_JOB?{...j,active:false}:j)),'Final cron differs from exact captured stop scope')
    return Object.values(after.markers).every(Boolean)?installedReadback(db,reviewed,journal,{finalStop:true}):{closed:true,d2Installed:false}
   })
  }else{
   assert(journal.pausedState,'Exact original installation journal required for comparison')
   report.readback=await installedReadback(db,reviewed,journal,{finalStop:!!journal.finalStop})
   report.edges=[]
   for(const expected of plan.bundles){const observed=await edgeReadback(db,expected.slug);assert(observed.present&&observed.status==='ACTIVE'&&observed.verifyJwt===expected.verifyJwt&&observed.sha256===expected.sha256,'Final exact Edge source/JWT mismatch');report.edges.push(observed)}
   report.snapshotProducer=await snapshotSecretReadback(db,plan,journal)
   report.outcome='read_only_verified'
  }
  if(stage==='stop')journal.finalStop={billingCronInactive:true,oldActive:pausedJob(journal.originalState).active,readinessClosed:true,
   reason:'Original unscoped development billing cron cannot be restarted under D2 scope enforcement. No old schema or automatic readiness restore.',fixtureCleanupVerified:false}
  report.ok=true
 }catch(error){report.error={type:error?.name==='AssertionError'?'guard_failed':'installation_incomplete',reason:error?.name==='AssertionError'?error.message:'stop_inspect_original_journal_no_write_retry',
  location:error?.stack?.match(/d2-deploy-(?:execute|state)\.mjs:\d+:\d+/)?.[0]??null}}
 finally{
  report.finishedAt=new Date().toISOString();report.evidence=attemptPath;await save();await lock.release()
 }
 return report
}
