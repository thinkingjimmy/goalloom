/**
 * [INPUT]: Current development0032 state or immutable base/0029/0030 and fixed single Edge installation evidence, Root's exact lease and protected original IDs.
 * [OUTPUT]: Guarded fixture stages, selected fresh case5–12 plans and source-bound strict prefix continuations.
 * [POS]: Development acceptance driver. It never installs/deploys code, changes cron or calls paid providers/models.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { stripePath,bundle } from '../billing/build.mjs'
import { eszipOriginalSource } from '../deploy/edge-source.mjs'
import { normalizedSchemaSql } from '../billing/d2-schema-attestation.mjs'
import { acquireDeploymentLock,recoverDeploymentLock } from '../billing/d2-deploy-lock.mjs'
import { client } from '../hosted-ai/client.mjs'
import { LocalSqliteLedger } from './ledger.mjs'
import { canonicalJson } from '../../packages/contracts/src/canonical.ts'
import { sha,q,json,savePrivate,loadPrivate,journalDigest,fixtureContext,requireLease,verifySources,assertFixtureRows } from './fixture-support.mjs'
import { prepareFixtures,exerciseDeletions,driveFixtureWorker,verifyFixtureDeletion } from './fixture-journeys.mjs'
import { planRaceCases,ownedRaceCallbacks,originalSdkMaterial,cleanupOwnedRaceCases } from './fixture-integration.mjs'
import { integrationRoot,suffixStages,suffixSources,checkIntegrationChild } from './fixture-continuation.mjs'
import {remainingCaseIds,remainingStages,remainingPrefixStages,reviewRemainingEvidence,assertFreshRemainingIdentity,checkRemainingPlan,captureCurrentFixtureState,assertCurrentFixtureInstalled,createFreshJournal,closeFreshReadiness} from './fixture-remaining.mjs'
const integrationDefault='output/tests/billing/desktop/d2-lifecycle/integration-staging/12daee2e5cf8f8e2f7ae/manifest.json'
const helperEntries=['scripts/lifecycle/fixture-crypto.ts','scripts/billing/d2-retrieval-client-interop.ts','supabase/functions/lifecycle/worker.ts','supabase/functions/lifecycle/storage.ts','supabase/functions/lifecycle/restore.ts','supabase/functions/lifecycle/ledger.ts','supabase/functions/billing/service.ts','supabase/functions/snapshot-url/handler.ts']
const ownSources=['scripts/lifecycle/development-fixtures.mjs','scripts/lifecycle/fixture-support.mjs','scripts/lifecycle/fixture-journeys.mjs','scripts/lifecycle/fixture-maintenance.mjs','scripts/lifecycle/ledger.mjs',
 'scripts/billing/d2-schema-attestation.mjs','scripts/billing/d2-deploy-lock.mjs','scripts/billing/d1-sync-fixtures.mjs','scripts/billing/build.mjs','scripts/hosted-ai/client.mjs','scripts/deploy/transport.mjs','scripts/deploy/edge-source.mjs']
const coreSeamSources=['packages/store-core/src/index.ts','packages/store-core/src/retired.ts','packages/store-core/src/binding-epoch.ts','packages/schema/src/index.ts','packages/schema/src/sync-baseline.ts']
async function descriptor(path){const value=await readFile(path);return{path:resolve(path),sha256:sha(value)}}
async function immutable(path,bytes){await mkdir(dirname(path),{recursive:true,mode:0o700});try{await writeFile(path,bytes,{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST')throw error;assert.equal(sha(await readFile(path)),sha(bytes),'Immutable fixture plan artifact changed')}}
function material(plan){const {reviewedSetSha256,...value}=plan;return value}
async function readBound(reference){
 assert(reference?.path&&/^[a-f0-9]{64}$/.test(reference.sha256),'Complete immutable evidence reference required')
 const bytes=await readFile(reference.path);assert.equal(sha(bytes),reference.sha256,'Bound forward evidence changed')
 if(reference.bytes!==undefined)assert.equal(bytes.length,reference.bytes,'Bound forward evidence length changed')
 return JSON.parse(bytes.toString('utf8'))
}
export async function reviewFixturePatchEvidence(path,{base}){
 assert(path,'Accepted0029 forward installation evidence required')
 const reference=await descriptor(path),manifest=await readBound(reference)
 assert(manifest.version===1&&manifest.kind==='d2-seed-push-scope'&&manifest.project==='asqyvcnxdltzzfutbbqy','Exact development0029 manifest required')
 const original={}
 for(const name of ['deploymentPlan','sqlEvidence','installedCheck','finalState']){
  const expected=typeof base[name]==='string'?await descriptor(base[name]):base[name],bound=manifest.base?.[name]
  assert(expected&&bound&&resolve(expected.path)===resolve(bound.path)&&expected.sha256===bound.sha256,'Forward chain replaced original installation evidence')
  original[name]=await readBound(bound)
 }
 const migration=manifest.migration
 assert(migration?.file==='0029_seed_push_scope.sql','Only the reviewed0029 forward migration is supported')
 const migrationSource=await descriptor(`supabase/migrations/${migration.file}`);assert.equal(migration.sha256,migrationSource.sha256,'Forward migration source changed')
 const body=source=>source.match(/create or replace function public\.push_ops\([\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1]
 const before=body(await readFile('supabase/migrations/0025_service_lifecycle.sql','utf8')),after=body(await readFile(migrationSource.path,'utf8')),target=manifest.target
 assert(before&&after&&target?.signature==='public.push_ops(uuid,uuid,uuid,jsonb)'&&target.beforeBodySha256===sha(before)&&target.afterBodySha256===sha(after)&&target.contractPreserved===true&&target.otherFunctionsPreserved===true,'Exact push_ops forward source/contract proof required')
 const inputs=[migrationSource],sameReference=(a,b)=>a?.path&&b?.path&&resolve(a.path)===resolve(b.path)&&a.sha256===b.sha256
 let acceptedPlan,acceptedAfter
 for(const name of ['acceptance','installation']){
  const section=manifest[name],plan=await readBound(section?.plan),report=await readBound(section?.report),{reviewedSetSha256,...planBody}=plan
  assert(plan.project===manifest.project&&sha(canonicalJson(planBody))===reviewedSetSha256&&report.reviewedSet===reviewedSetSha256&&report.project===manifest.project&&report.ok===true,'Forward plan/report linkage is not accepted')
  assert(plan.version===1&&plan.controlledMetadataOnly!==true&&plan.sourceOnly===true&&plan.remoteExecuted===false&&plan.maximumWriteRequests===1&&/^d2-install:[a-f0-9-]{36}$/.test(plan.applicationName)&&/^[a-f0-9]{64}$/.test(plan.sqlSha256)&&plan.before&&Array.isArray(plan.sources)&&plan.sources.length>0,'Complete bounded execution plan required; placeholders are not evidence')
  assert(plan.sources.some(input=>sameReference(input,migrationSource)),'Execution plan does not bind exact0029 source')
  for(const input of [...plan.sources,...(plan.privateEvidence??[])]){const actual=await descriptor(input.path);assert.equal(actual.sha256,input.sha256,'Execution source/private evidence changed');inputs.push(actual)}
  assert(report.originalTransactionsAbsent===true&&report.originalEvidencePreserved===true&&Array.isArray(report.errors)&&report.errors.length===0,'Execution transaction/evidence preservation missing')
  const observed=await readBound(report.after);inputs.push(await descriptor(report.after.path))
  if(name==='acceptance'){
   assert(plan.rollbackOnly===true&&plan.statementMs===15000&&plan.lockMs===3000&&plan.originalBodySha256===target.beforeBodySha256,'Exact single-write rollback contract required')
   const originalSource=plan.sources.find(input=>input.path.endsWith('/original-push-ops.sql'))
   assert(originalSource&&sha(body(await readFile(originalSource.path,'utf8'))??'')===target.beforeBodySha256,'Rollback plan does not bind the original function source')
   assert.equal(canonicalJson(plan.stages?.map(stage=>stage.name)),canonicalJson(['original-contract','fixture-setup','signed-create','original-reproduction','fixed-replacement','signed-push-finish-replay']),'Targeted rollback stage contract changed')
   assert(plan.stages.every(stage=>/^[a-f0-9]{64}$/.test(stage.sha256)),'Rollback stage hashes required')
   const baseline=await readBound(plan.baseline);assert(baseline.readOnly===true&&baseline.remoteWrites===0&&baseline.project===manifest.project,'Original read-only rollback baseline required')
   assert.equal(canonicalJson(baseline.state),canonicalJson(plan.before),'Rollback baseline differs from reviewed execution');inputs.push(await descriptor(plan.baseline.path))
   const diagnostic=report.diagnostic,proof=diagnostic?.acceptance
   assert(report.mode==='--run'&&report.writes===1&&report.responseReceived===true&&report.applicationName===plan.applicationName&&report.executionAccepted===true&&report.rollbackVerified===true&&diagnostic?.ok===true&&diagnostic.stage==='complete'&&diagnostic.variableConflict==='error','Actual targeted PostgreSQL dispatch required')
   assert(proof?.originalFailure?.sqlstate==='42702'&&proof.originalFailure.ambiguousId===true&&proof.finalAccepted===true&&proof.migrationSHA256===migration.sha256&&proof.variableConflict==='error'&&proof.receiptCount===3&&proof.functionContractPreserved===true&&proof.otherFunctionsPreserved===true,'Actual exact-migration seed proof required')
   assert.equal(canonicalJson(proof.sequence),canonicalJson([1,2,3]),'Actual three-operation acceptance missing')
   assert(proof.finalTuple?.seq===3&&/^[a-f0-9-]{36}$/.test(proof.finalTuple.opId)&&/^[a-f0-9]{64}$/.test(proof.finalTuple.payloadHash),'Original accepted final tuple missing')
   for(const key of ['businessRestored','catalogRestored','policiesRestored','functionRestored','authSequencePreserved','receiptBucketsPreserved'])assert.equal(report.preservation?.checks?.[key],true,'Rollback preservation is incomplete')
   assert(report.preservation?.sequence?.ok===true&&report.preservation.sequence.resetPerformed===false,'Natural sequence proof missing')
   assert(observed.function?.body_sha256===target.beforeBodySha256,'Rollback after snapshot has wrong original function')
   for(const key of ['function','catalog','policies','authSequence','receiptBuckets'])assert.equal(canonicalJson(observed[key]),canonicalJson(plan.before[key]),'Rollback after snapshot differs from original protected state')
   assert.equal(canonicalJson(observed.business),canonicalJson(plan.before.business),'Accepted0029 rollback durable business snapshot differs')
   acceptedPlan=plan;acceptedAfter=observed
  }
  else{
   for(const key of ['deploymentPlan','sqlEvidence','installedCheck','finalState'])assert(sameReference(plan.base?.[key],manifest.base[key]),'Installation plan changed original base chain')
   for(const key of ['plan','report'])assert(sameReference(plan.acceptance?.[key],manifest.acceptance[key]),'Installation plan references another acceptance')
   assert.equal(canonicalJson(plan.migration),canonicalJson(migration),'Installation plan migration differs')
   assert.equal(canonicalJson(plan.target),canonicalJson(target),'Installation plan target proof differs')
   assert.equal(canonicalJson(plan.before),canonicalJson(acceptedAfter),'Installation does not inherit accepted rollback after state')
   assert.equal(canonicalJson(plan.privateHistory),canonicalJson(manifest.privateHistory),'Installation plan effective history differs')
   const metadata=await readBound(plan.metadataReference);assert(metadata.readOnly===true&&metadata.remoteWrites===0&&metadata.project===manifest.project,'Independent install metadata required')
   assert.equal(canonicalJson(metadata.metadata),canonicalJson(plan.metadata),'Installation metadata baseline changed');inputs.push(await descriptor(plan.metadataReference.path))
   assert(plan.metadata.target?.bodySha256===acceptedPlan.originalBodySha256,'Installation baseline has another original body')
   assert(['--run','--check'].includes(report.mode)&&report.writes===(report.mode==='--run'?1:0),'Actual original installation dispatch/readback shape required')
   assert(report.remoteExecuted===true&&report.migration?.file===migration.file&&report.migration.sha256===migration.sha256,'Persistent0029 installation is not proved')
   for(const key of ['schemaMatched','historyMatched','sourceMatched','contractPreserved','otherFunctionsPreserved','businessPreserved','closed'])assert.equal(report.readback?.[key],true,'Forward installation readback incomplete')
   for(const key of ['catalogExceptTargetMatched','cronMatched','edgesMatched','secretMetadataMatched','activityVerified'])assert.equal(report.preservation?.[key],true,'Independent install preservation missing')
   assert.equal(canonicalJson(observed.checks),canonicalJson(report.readback),'Install report differs from independent after checks')
   for(const key of ['catalogExceptTargetMatched','cronMatched','edgesMatched','secretMetadataMatched','activityVerified'])assert.equal(observed.preservation?.[key],true,'Independent install after preservation failed')
   assert.equal(canonicalJson(observed.metadata?.schema_attestation),canonicalJson(manifest.schemaAttestation),'Install after snapshot schema differs')
   assert.equal(canonicalJson(observed.metadata?.private_history),canonicalJson(manifest.privateHistory),'Install after snapshot history differs')
   assert(observed.metadata?.target?.bodySha256===target.afterBodySha256,'Install after snapshot target source differs')
   assert.equal(canonicalJson(observed.metadata.target.contract),canonicalJson(plan.metadata.target.contract),'Install after snapshot target contract differs')
   assert.equal(canonicalJson(observed.metadata.other_functions),canonicalJson(plan.metadata.other_functions),'Install after snapshot other functions differ')
   assert.equal(canonicalJson(report.schemaAttestation),canonicalJson(manifest.schemaAttestation),'Forward schema differs from accepted postflight')
   assert.equal(canonicalJson(report.privateHistory),canonicalJson(manifest.privateHistory),'Forward history differs from accepted postflight')
  }
  inputs.push(await descriptor(section.plan.path),await descriptor(section.report.path))
 }
 const expectedHistory=[...original.deploymentPlan.history.privatePrefix,...original.deploymentPlan.inputs.migrations.map(m=>({version:m.file.slice(0,4),sha256:m.sha256})),{version:'0029',sha256:migration.sha256}]
 assert.equal(canonicalJson(manifest.privateHistory),canonicalJson(expectedHistory),'Forward private history changed original prefix or patch')
 const baseline=original.sqlEvidence.installedSchemaAttestation,effective=manifest.schemaAttestation
 assert(baseline&&effective&&effective.functions?.rows===baseline.functions.rows&&effective.functions.capped===false&&/^[a-f0-9]{64}$/.test(effective.functions.sha256)&&effective.functions.sha256!==baseline.functions.sha256,'Forward function attestation missing or unchanged')
 const withoutFunctions=value=>Object.fromEntries(Object.entries(value).filter(([name])=>name!=='functions'))
 assert.equal(canonicalJson(withoutFunctions(effective)),canonicalJson(withoutFunctions(baseline)),'Forward schema changed outside the accepted function definition')
 return{reference,inputs,migrationSource,manifest}
}
export function assertFixtureInstalledState(history,schema,{privateHistory,schemaAttestation}){
 assert.equal(canonicalJson(history),canonicalJson(privateHistory),'Installed private history differs from accepted chain')
 const {configuration:actualConfiguration,...actual}=schema,{configuration:expectedConfiguration,...expected}=schemaAttestation
 assert.equal(canonicalJson(actual),canonicalJson(expected),'Installed normalized schema changed')
 const service=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='enabled'))
 assert.equal(canonicalJson(service(actualConfiguration.service)),canonicalJson(service(expectedConfiguration.service)),'Installed protected service configuration changed')
 assert(actualConfiguration.readiness.developmentRequiresScope===true&&actualConfiguration.readiness.drainVerified===false,'Development scope or unproved drain default changed')
}
export async function reviewFixtureSnapshotPatchEvidence(path,{patchEvidence}){
 assert(path&&patchEvidence?.reference&&patchEvidence.manifest,'Accepted0030 evidence and reviewed0029 parent required')
 const reference=await descriptor(path),manifest=await readBound(reference),parent=patchEvidence.manifest
 assert(manifest.version===1&&manifest.kind==='d2-snapshot-access-volatility'&&manifest.project===parent.project,'Exact development0030 manifest required')
 const sameReference=(a,b)=>a?.path&&b?.path&&resolve(a.path)===resolve(b.path)&&a.sha256===b.sha256
 assert(sameReference(manifest.base?.patchEvidence,patchEvidence.reference),'Snapshot patch references another0029 chain')
 assert.equal(canonicalJson(await readBound(manifest.base.patchEvidence)),canonicalJson(parent),'Reviewed0029 parent changed')
 const migration=manifest.migration,target=manifest.target
 assert(migration?.file==='0030_snapshot_access_volatility.sql'&&migration.sha256==='910b7c82d79f4a0b6b16fffcf7be6ba193103db2d8ae7342a3564f2fc9f42827','Only the reviewed0030 property correction is supported')
 const migrationSource=await descriptor(`supabase/migrations/${migration.file}`);assert.equal(migrationSource.sha256,migration.sha256,'Snapshot migration source changed')
 assert(target?.signature==='public.snapshot_transfer_access(uuid,uuid,uuid,bigint,text,text)'&&target.bodySha256==='e5d97abfbc8e327b72ab823cea4b3ffed0c14f47bb243d8cdc8d34c80aca1a28'&&target.beforeVolatility==='s'&&target.afterVolatility==='v'&&target.contractPreservedExceptVolatility===true&&target.otherFunctionsPreserved===true,'Exact snapshot volatility/body contract required')
 const section=manifest.installation,plan=await readBound(section?.plan),report=await readBound(section?.report),{reviewedSetSha256,...planBody}=plan
 assert(plan.version===1&&plan.project===manifest.project&&plan.sourceOnly===true&&plan.remoteExecuted===false&&plan.controlledMetadataOnly!==true&&sha(canonicalJson(planBody))===reviewedSetSha256&&plan.maximumWriteRequests===1&&/^d2-install:[a-f0-9-]{36}$/.test(plan.applicationName)&&/^[a-f0-9]{64}$/.test(plan.sqlSha256)&&Object.keys(plan.before?.business??{}).length>0&&Object.keys(plan.before?.catalog??{}).length>0,'Complete single-write0030 plan required')
 assert(sameReference(plan.base?.patchEvidence,manifest.base.patchEvidence),'Snapshot installation plan changed parent')
 assert.equal(canonicalJson(plan.migration),canonicalJson(migration),'Snapshot installation plan changed migration')
 const {afterBodySha256,...planTarget}=plan.target??{}
 if(afterBodySha256!==undefined)assert.equal(afterBodySha256,target.bodySha256,'Snapshot plan body alias conflicts with unchanged body')
 assert.equal(canonicalJson(planTarget),canonicalJson(target),'Snapshot installation plan changed target')
 assert(Array.isArray(plan.sources)&&plan.sources.some(input=>sameReference(input,migrationSource)),'Snapshot execution plan lacks exact migration source')
 const inputs=[migrationSource]
 for(const input of [...plan.sources,...(plan.privateEvidence??[])]){const actual=await descriptor(input.path);assert.equal(actual.sha256,input.sha256,'Snapshot execution source/private evidence changed');inputs.push(actual)}
 const baseline=await readBound(plan.metadataReference);assert(baseline.readOnly===true&&baseline.remoteWrites===0&&baseline.project===manifest.project,'Read-only snapshot metadata baseline required')
 assert.equal(canonicalJson(baseline.metadata),canonicalJson(plan.metadata),'Snapshot installation metadata differs')
 assert.equal(canonicalJson(plan.metadata.schema_attestation),canonicalJson(parent.schemaAttestation),'Snapshot baseline does not inherit0029 schema')
 assert.equal(canonicalJson(plan.metadata.private_history),canonicalJson(parent.privateHistory),'Snapshot baseline does not inherit0029 history')
 assert(plan.metadata.target?.bodySha256===target.bodySha256&&plan.metadata.target.contract?.provolatile==='s','Snapshot baseline body/volatility differs')
 assert(report.version===1&&report.project===manifest.project&&report.reviewedSet===reviewedSetSha256&&report.ok===true&&report.remoteExecuted===true&&['--run','--check'].includes(report.mode)&&report.writes===(report.mode==='--run'?1:0)&&report.originalTransactionsAbsent===true&&report.originalEvidencePreserved===true&&Array.isArray(report.errors)&&report.errors.length===0,'Actual0030 installation dispatch/readback required')
 assert.equal(canonicalJson(report.migration),canonicalJson(migration),'Snapshot installation report changed migration')
 for(const key of ['schemaMatched','historyMatched','sourceMatched','contractPreservedExceptVolatility','otherFunctionsPreserved','businessPreserved','closed'])assert.equal(report.readback?.[key],true,'Snapshot installation readback incomplete')
 const observed=await readBound(report.after)
 const same=(a,b)=>canonicalJson(a)===canonicalJson(b),omit=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key))),afterMetadata=observed.meta
 assert(afterMetadata&&observed.state&&observed.business&&observed.policies&&observed.counters,'Complete raw0030 after snapshot required')
 const afterChecks={schemaMatched:same(omit(afterMetadata.schema_attestation,['functions']),omit(plan.metadata.schema_attestation,['functions']))&&afterMetadata.schema_attestation.functions.rows===plan.metadata.schema_attestation.functions.rows&&afterMetadata.schema_attestation.functions.capped===false&&afterMetadata.schema_attestation.functions.sha256!==plan.metadata.schema_attestation.functions.sha256,
  historyMatched:same(afterMetadata.private_history,plan.privateHistory),sourceMatched:afterMetadata.target.bodySha256===target.bodySha256&&afterMetadata.target.contract.provolatile==='v',
  contractPreservedExceptVolatility:same(omit(afterMetadata.target.contract,['provolatile']),omit(plan.metadata.target.contract,['provolatile'])),otherFunctionsPreserved:same(afterMetadata.other_functions,plan.metadata.other_functions),
  businessPreserved:same(omit(observed.business,['service_private.migrations']),omit(plan.before.business,['service_private.migrations']))&&same(observed.counters,{control:plan.before.sequence,auth:plan.before.authSequence}),closed:same(observed.policies,plan.before.policies)}
 assert.equal(canonicalJson(afterChecks),canonicalJson(report.readback),'Raw snapshot after facts differ from accepted readback')
 const afterPreservation={catalogExceptTargetMatched:same(omit(observed.state.catalog,['pg_proc']),omit(plan.before.catalog,['pg_proc'])),cronMatched:observed.state.business['cron.job']?.sha256===plan.before.business['cron.job']?.sha256,
  edgesMatched:same(observed.state.edges,plan.metadata.edges),secretMetadataMatched:observed.secrets===plan.metadata.secretMetadataSha256}
 for(const [key,value] of Object.entries(afterPreservation))assert(value===true&&report.preservation?.[key]===true,'Raw snapshot after preservation differs')
 assert(observed.activity?.visible===true&&observed.activity.tracking===true&&Number(observed.activity.hidden)===0&&Number(observed.activity.executors)===0&&Object.keys(observed.state.drain??{}).length>=7&&Object.values(observed.state.drain).every(value=>Number(value)===0),'Snapshot after transaction visibility/quiescence missing')
 if(report.result?.ok===true)assert(report.preservation.transactionAttestationMatched===true&&same(report.result.schemaAttestation,afterMetadata.schema_attestation)&&same(report.result.target,afterMetadata.target)&&same(report.result.otherFunctions,afterMetadata.other_functions),'Snapshot transaction and independent after differ')
 assert.equal(canonicalJson(report.schemaAttestation),canonicalJson(manifest.schemaAttestation),'Snapshot reported schema differs')
 assert.equal(canonicalJson(report.privateHistory),canonicalJson(manifest.privateHistory),'Snapshot reported history differs')
 assert.equal(canonicalJson(afterMetadata.schema_attestation),canonicalJson(manifest.schemaAttestation),'Snapshot after schema differs')
 assert.equal(canonicalJson(afterMetadata.private_history),canonicalJson(manifest.privateHistory),'Snapshot after history differs')
 assert(afterMetadata.target.bodySha256===target.bodySha256&&afterMetadata.target.contract?.provolatile==='v','Installed snapshot body/volatility differs')
 const stableContract=contract=>Object.fromEntries(Object.entries(contract).filter(([key])=>key!=='provolatile'))
 assert.equal(canonicalJson(stableContract(afterMetadata.target.contract)),canonicalJson(stableContract(plan.metadata.target.contract)),'Snapshot contract changed beyond volatility')
 assert.equal(canonicalJson(afterMetadata.other_functions),canonicalJson(plan.metadata.other_functions),'Snapshot installation changed other functions')
 const expectedHistory=[...parent.privateHistory,{version:'0030',sha256:migration.sha256}];assert.equal(canonicalJson(manifest.privateHistory),canonicalJson(expectedHistory),'Snapshot history changed parent prefix')
 assert.equal(canonicalJson(plan.privateHistory),canonicalJson(expectedHistory),'Snapshot execution plan history differs')
 const withoutFunctions=schema=>Object.fromEntries(Object.entries(schema).filter(([key])=>key!=='functions')),effective=manifest.schemaAttestation
 assert.equal(canonicalJson(withoutFunctions(effective)),canonicalJson(withoutFunctions(parent.schemaAttestation)),'Snapshot schema changed outside function metadata')
 assert(effective.functions?.rows===parent.schemaAttestation.functions.rows&&effective.functions.capped===false&&/^[a-f0-9]{64}$/.test(effective.functions.sha256)&&effective.functions.sha256!==parent.schemaAttestation.functions.sha256,'Snapshot function attestation missing')
 inputs.push(await descriptor(section.plan.path),await descriptor(section.report.path),await descriptor(plan.metadataReference.path),await descriptor(report.after.path))
 return{reference,inputs,migrationSource,manifest}
}
const retrievalEdgeSources=['supabase/functions/retained-retrieval/handler.ts','scripts/billing/d2-retrieval-http-acceptance.mjs','supabase/functions/retained-retrieval/README.md','scripts/billing/README.md']
export async function reviewFixtureRetrievalEdgeEvidence(path,{snapshotPatchEvidence:parent}){
 assert(path&&parent?.reference,'Accepted retained-retrieval Edge installation evidence required')
 const reference=await descriptor(path)
 assert.equal(reference.sha256,'dfe93947b94462944acacb027b23b848daf84f3fb30d81b4ee2606c7e6157daa','Exact accepted retained-retrieval manifest required')
 const manifest=await readBound(reference),same=(a,b)=>canonicalJson(a)===canonicalJson(b),sameReference=(a,b)=>a?.path&&b?.path&&resolve(a.path)===resolve(b.path)&&a.sha256===b.sha256
 assert(manifest.project==='asqyvcnxdltzzfutbbqy'&&manifest.kind==='d2-retained-retrieval-routing'&&sameReference(manifest.base.snapshotPatchEvidence,parent.reference),'Edge proof replaced accepted0030 parent')
 const {before,after}=manifest.target
 assert(before.slug==='retained-retrieval'&&before.version===2&&before.verifyJwt===true&&before.sha256==='61e4ad21ca54166d173176b24b683f73d1616d6216c94286876682151ee7841a'&&after.slug===before.slug&&after.version===3&&after.status==='ACTIVE'&&after.verifyJwt===true&&after.sha256==='5fc04d56f7e29f0636249aef08580953c0d49c62225d7cc511044221f5f326a9','Exact accepted retained-retrieval target required')
 const plan=await readBound(manifest.installation.plan),red=await readBound(manifest.localAcceptance.red),green=await readBound(manifest.localAcceptance.green),sources=plan.sources
 assert(sources.length===4&&same(sources.map(s=>resolve(s.path)).sort(),retrievalEdgeSources.map(p=>resolve(p)).sort()),'Only the four reviewed routing source paths are allowed')
 const inputs=[reference],references=[manifest.base.snapshotPatchEvidence,...Object.values(manifest.installation),...Object.values(manifest.localAcceptance),plan.accepted0030Baseline,plan.closedFixtureAudit,plan.candidateBundle,plan.failureContract,green.candidatePatch,...Object.values(red.references),...Object.values(green.references)]
 // Historical README bytes belong to the accepted proof; current diagnostic copy freezes separately.
 for(const source of sources){const relative=retrievalEdgeSources.find(p=>resolve(p)===resolve(source.path));references.push({path:`output/reviews/desktop-subscription-d1-d3-2026-10-23/retained-retrieval-routing/${relative.replaceAll('/','__')}.candidate`,sha256:source.sha256,bytes:source.bytes})}
 for(const ref of references){const actual=await descriptor(ref.path);assert.equal(actual.sha256,ref.sha256,'Accepted Edge evidence changed');if(ref.bytes!==undefined)assert.equal((await readFile(ref.path)).length,ref.bytes,'Accepted Edge evidence length changed');inputs.push(actual)}
 assert.equal(sha(await bundle('supabase/functions/retained-retrieval/index.ts')),after.sha256,'Current retained-retrieval bundle differs from accepted deployment')
 return{reference,manifest,edges:manifest.afterEdges,sources,inputs:[...new Map(inputs.map(ref=>[ref.path,ref])).values()].sort((a,b)=>a.path.localeCompare(b.path))}
}
export async function createFreshRemainingPlan({directory,lease}){
 requireLease(lease)
 const output=resolve(directory??`output/tests/billing/desktop/d2-lifecycle/fresh-remaining-${randomUUID()}`);await mkdir(output,{recursive:true,mode:0o700})
 const snapshot=await captureCurrentFixtureState(await client(),{closed:true}),snapshotPath=resolve(output,'current-installed.json');await immutable(snapshotPath,JSON.stringify(snapshot,null,2)+'\n')
 const options={stdin:{contents:helperEntries.map(file=>`export * from ${JSON.stringify(resolve(file))}`).join('\n'),resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,metafile:true,format:'esm',platform:'node',target:'es2022',external:['node:*'],logLevel:'silent',alias:{stripe:resolve(dirname(stripePath),'../esm/stripe.esm.worker.js'),'@goalloom/contracts':resolve('packages/contracts/src/index.ts'),'@goalloom/crypto':resolve('packages/crypto/src/index.ts'),'@goalloom/store-core':resolve('packages/store-core/src/index.ts'),'@goalloom/schema':resolve('packages/schema/src/index.ts')}}
 const built=await build(options),graph=await build({...options,stdin:undefined,outdir:resolve(output,'analysis-only'),entryPoints:[resolve('scripts/lifecycle/development-fixtures.mjs'),resolve('scripts/billing/d2-owned-retrieval.mjs')]})
 const runtimeText=built.outputFiles[0].text,runtimePath=resolve(output,'runtime.mjs');await immutable(runtimePath,runtimeText)
 const runtime=await import(pathToFileURL(runtimePath).href),{journal,privatePath}=await createFreshJournal(output,runtime)
 const paths=[...new Set([...ownSources,...coreSeamSources,...Object.keys(built.metafile.inputs),...Object.keys(graph.metafile.inputs),'package.json','pnpm-lock.yaml',snapshotPath].filter(p=>p!=='<stdin>'))].sort()
 const plan={version:1,sourceOnly:true,remoteExecuted:false,project:journal.project,directory:output,privatePath,identityDigest:journalDigest(journal),createdAt:journal.createdAt,sources:await Promise.all(paths.map(descriptor)),runtime:await descriptor(runtimePath),currentDevelopmentSnapshot:await descriptor(snapshotPath),integration:null,deployment:null,sqlEvidence:null,installed:await descriptor(snapshotPath),finalState:null,installationReceipts:[],blockers:[],integrationAdapter:await descriptor('scripts/billing/d2-owned-retrieval.mjs'),effectivePrivateHistory:snapshot.history,effectiveSchemaAttestation:snapshot.schema,plannedCaseIds:[...remainingCaseIds],stages:[...remainingStages],remainingRace:{version:1,kind:'fresh-remaining-races',lease},identityBounds:{baseAuthOwners:5,plannedRaceOwners:8,maxConcurrentAuthOwners:6,concurrentRaceFixtures:1,baseWorkspaces:4,fixedRaceCases:8,scopeHours:1},executionCaps:{http:{timeoutMs:20000,maxResponseBytes:4194304},worker:{maxStepsPerInvocation:40,defaultSteps:1},cleanup:{maxWorkerSteps:40,maxInventoryPagesPerTarget:64}}}
 plan.reviewedSetSha256=sha(canonicalJson(material(plan)));const path=resolve(output,'plan.json');await immutable(path,JSON.stringify(plan,null,2)+'\n');return{plan,path}
}
export async function runFreshRemainingSuite({directory,lease}){
 const {plan,path}=await createFreshRemainingPlan({directory,lease}),reports=[],suite={version:1,project:plan.project,plannedCaseIds:plan.plannedCaseIds,plan:path,ok:false,runtime:{node:process.version,platform:process.platform,arch:process.arch,electron:'not used',physicalOrVm:'not established'}}
 try{
  for(const mode of ['readiness','prepare','integration-remaining']){const r=await runFixtureStage({mode,planPath:path,reviewedSet:plan.reviewedSetSha256,lease});reports.push({mode,ok:r.ok,evidence:r.evidence});if(!r.ok)break}
 }finally{
  for(const mode of ['cleanup-races','cleanup'])try{const r=await runFixtureStage({mode,planPath:path,reviewedSet:plan.reviewedSetSha256,lease});reports.push({mode,ok:r.ok,evidence:r.evidence})}catch(e){reports.push({mode,ok:false,error:e.name})}
  const journal=await loadPrivate(plan.privatePath)
  try{suite.window=await closeFreshReadiness(await client(),journal,plan.privatePath)}catch(e){suite.window={closed:false,error:e.name}}
  const integration=journal.remainingRaceIntegrationComplete===true
  suite.ok=integration&&journal.cleaned===true&&suite.window.closed===true&&reports.every(r=>r.ok);suite.integrationComplete=integration;suite.cleaned=journal.cleaned===true;suite.reports=reports;suite.runtime.postgresql=suite.window.postgresql
  await immutable(resolve(plan.directory,'remaining8-result.json'),JSON.stringify(suite,null,2)+'\n')
 }
 if(!suite.ok)process.exitCode=1
 return suite
}

export async function createFixturePlan({directory,integrationPath=integrationDefault,deploymentPlanPath,sqlEvidencePath,adapterPath,installedPath,finalStatePath,patchEvidencePath,snapshotPatchEvidencePath,retrievalEdgeEvidencePath,cleanupFrom,resumeFrom,closedStop,finalClosureContract,cleanupFailures=[],integrationFailurePath,remainingEvidencePath,freshLease}={}){
 assert(!remainingEvidencePath||!cleanupFrom&&!resumeFrom&&!integrationFailurePath,'Fresh selected plans cannot mix original continuation authority')
 assert(!freshLease||remainingEvidencePath,'Fresh lease requires explicit selected evidence')
 const remaining=remainingEvidencePath?await reviewRemainingEvidence(remainingEvidencePath):null
 if(remaining)assert(freshLease&&freshLease!=='a0d1167d-94f2-40a5-93d1-76447f2b072e'&&/^[a-f0-9-]{36}$/.test(freshLease),'Explicit distinct fresh lease required before identity creation')
 const integration=JSON.parse(await readFile(integrationPath,'utf8'));assert(integration.sourceOnly&&integration.project==='asqyvcnxdltzzfutbbqy')
 if(!cleanupFrom&&!resumeFrom)assert(patchEvidencePath,'Accepted0029 forward installation evidence required before fresh fixture planning')
 const patch=patchEvidencePath?await reviewFixturePatchEvidence(patchEvidencePath,{base:{deploymentPlan:deploymentPlanPath,sqlEvidence:sqlEvidencePath,installedCheck:installedPath,finalState:finalStatePath}}):null
 if(!cleanupFrom&&!resumeFrom)assert(snapshotPatchEvidencePath,'Accepted0030 snapshot installation evidence required before fresh fixture planning')
 const snapshotPatch=snapshotPatchEvidencePath?await reviewFixtureSnapshotPatchEvidence(snapshotPatchEvidencePath,{patchEvidence:patch}):null
 if(!cleanupFrom&&!resumeFrom)assert(retrievalEdgeEvidencePath,'Accepted retained-retrieval Edge installation evidence required before fresh fixture planning')
 const retrievalEdge=retrievalEdgeEvidencePath?await reviewFixtureRetrievalEdgeEvidence(retrievalEdgeEvidencePath,{snapshotPatchEvidence:snapshotPatch}):null
 // Tooling evolves separately; only exact reviewed Edge source overrides cross the original runtime freeze.
 const frozenRuntime=integration.sources.filter(entry=>!entry.source.startsWith('scripts/lifecycle/')),runtimeOverrides=[]
 for(const entry of frozenRuntime){const actual=sha(await readFile(entry.source));if(actual!==entry.sha256){const allowed=retrievalEdge?.sources.find(s=>resolve(s.path)===resolve(entry.source))??remaining?.toolingOverrides.find(s=>resolve(s.path)===resolve(entry.source)&&s.beforeSha256===entry.sha256);assert(allowed&&actual===allowed.sha256,'Frozen integration runtime source changed');runtimeOverrides.push({path:resolve(entry.source),beforeSha256:entry.sha256,sha256:actual})}}
 const output=resolve(directory??`output/tests/billing/desktop/d2-lifecycle/development/${randomUUID()}`);await mkdir(output,{recursive:true,mode:0o700})
 const options={stdin:{contents:helperEntries.map(file=>`export * from ${JSON.stringify(resolve(file))}`).join('\n'),resolveDir:process.cwd(),loader:'ts'},
  bundle:true,write:false,metafile:true,format:'esm',platform:'node',target:'es2022',external:['node:*'],logLevel:'silent',
  alias:{stripe:resolve(dirname(stripePath),'../esm/stripe.esm.worker.js'),'@goalloom/contracts':resolve('packages/contracts/src/index.ts'),
   '@goalloom/crypto':resolve('packages/crypto/src/index.ts'),'@goalloom/store-core':resolve('packages/store-core/src/index.ts'),'@goalloom/schema':resolve('packages/schema/src/index.ts')}}
 if(adapterPath)assert(resolve(adapterPath).startsWith(resolve('scripts/billing')+'/'),'Backend-owned local integration adapter required')
 const discovered=await build(options),driverGraph=await build({...options,stdin:undefined,outdir:`${output}/analysis-only`,entryPoints:[resolve('scripts/lifecycle/development-fixtures.mjs'),...(adapterPath?[resolve(adapterPath)]:[])]}),require=createRequire(import.meta.url),esbuildEntry=require.resolve('esbuild'),esbuildRequire=createRequire(esbuildEntry)
 const paths=[...new Set([...ownSources,...coreSeamSources,...(patch?[patch.migrationSource.path]:[]),...(snapshotPatch?[snapshotPatch.migrationSource.path]:[]),...(retrievalEdge?[...retrievalEdge.inputs.map(ref=>ref.path),...retrievalEdge.sources.map(ref=>ref.path)]:[]),...Object.keys(discovered.metafile.inputs),...Object.keys(driverGraph.metafile.inputs),integrationPath,'package.json','pnpm-lock.yaml',process.execPath,esbuildEntry,
  esbuildRequire.resolve(`@esbuild/${process.platform}-${process.arch}/bin/esbuild`)].filter(path=>path!=='<stdin>'))].sort()
 const sources=await Promise.all(paths.map(descriptor)),built=await build(options)
 assert.equal(canonicalJson(Object.keys(built.metafile.inputs).sort()),canonicalJson(Object.keys(discovered.metafile.inputs).sort()),'Fixture dependency graph changed during build')
 const runtimeText=built.outputFiles[0].text,runtimePath=`${output}/runtime-${sha(runtimeText)}.mjs`;await immutable(runtimePath,runtimeText)
 const runtime=await import(pathToFileURL(runtimePath).href),privatePath=`${output}/.fixtures-private.json`
 let journal
 try{journal=await loadPrivate(privatePath);assert(!remaining,'A selected fresh plan needs a new journal directory')}catch(error){if(error.code!=='ENOENT')throw error
  journal={version:1,project:'asqyvcnxdltzzfutbbqy',runId:randomUUID(),createdAt:new Date().toISOString(),fixtures:[],scopes:{},workerRuns:[],quarantine:{held:false}}
  for(const label of ['owner','foreign','account','fair-one','fair-two']){
   const ownerId=randomUUID(),count=label==='owner'?2:['foreign','account'].includes(label)?1:0
   journal.fixtures.push({label,ownerId,email:`billing-${ownerId}@goalloom.test`,password:randomBytes(32).toString('base64url')+'aA!',sessionCount:label==='owner'?2:1,sessions:[],
    devices:Array.from({length:label==='owner'?2:count?1:0},()=>({id:null,secrets:runtime.fixtureSecrets()})),
    targets:Array.from({length:count},(_,index)=>{const workspaceId=randomUUID(),generation=randomUUID();return{workspaceId,generation,path:`workspaces/${workspaceId}/${generation}/1.bin`,bodyHex:Buffer.from('D2 synthetic ciphertext transport').toString('hex'),transportCase:label==='account'?'known-storage-ack-loss':label==='owner'&&index===1?'known-begin-ack-loss':'deployed-confirmed'}})})
  }
  for(const name of ['work','cleanup'])journal.scopes[name]={id:randomUUID(),secret:randomBytes(32).toString('hex'),registered:false}
  journal.races=planRaceCases(output)
  if(remaining){journal.plannedCaseIds=[...remainingCaseIds];assertFreshRemainingIdentity(journal,remaining)}
  await savePrivate(privatePath,journal)
 }
 assert(!journal.cleaned,'Cleaned fixture identities cannot be reused for a new plan')
 const deployment=deploymentPlanPath?JSON.parse(await readFile(deploymentPlanPath,'utf8')):null,sql=sqlEvidencePath?JSON.parse(await readFile(sqlEvidencePath,'utf8')):null,installed=installedPath?JSON.parse(await readFile(installedPath,'utf8')):null,finalState=finalStatePath?JSON.parse(await readFile(finalStatePath,'utf8')):null
 const blockers=[]
 if(!deployment)blockers.push('Root-reviewed persistent installation plan required')
 if(!sql)blockers.push('Successful exact final four-migration PostgreSQL rollback evidence required')
 if(!adapterPath)blockers.push('Backend-owned retrieval SDK and fixed twelve-case race adapter required')
 if(!installed)blockers.push('Successful exact final installer --check receipt required')
 if(!finalState)blockers.push('Successful exact final installation state required')
 if(deployment){assert.equal(deployment.project,journal.project);assert(deployment.bundles?.length===6,'Six exact deployment bundles required');for(const m of integration.migrations)assert(deployment.inputs.migrations.some(x=>x.file===m.source.split('/').at(-1)&&x.sha256===m.sha256),'Deployment migration set differs')}
 if(sql){assert(sql.ok&&sql.rollbackVerified&&sql.installedSchemaAttestation,'Final rollback not accepted');for(const m of integration.migrations)assert(sql.migrations.some(x=>x.file===m.source.split('/').at(-1)&&x.sha256===m.sha256),'SQL rollback migration set differs')}
 if(installed){
  assert(deployment&&installed.ok&&installed.stage==='check'&&installed.planSha256===deployment.planSha256&&installed.readback?.schemaMatched&&installed.readback?.historyMatched&&installed.readback?.originalFieldsMatched&&installed.readback?.originalHistoryMatched,'Exact final installer receipt is not accepted')
  assert(installed.edges?.length===6&&deployment.bundles.every(bundle=>installed.edges.some(edge=>edge.slug===bundle.slug&&edge.present&&edge.status==='ACTIVE'&&edge.verifyJwt===bundle.verifyJwt&&edge.sha256===bundle.sha256)),'Installed Edge set differs from reviewed source')
 }
 const installationReceipts=[]
 if(finalState){
  assert(deployment&&installed&&finalState.ok&&finalState.project===journal.project&&finalState.planSha256===deployment.planSha256,'Final installation state differs from the reviewed plan')
  for(const key of ['sourceFreezeVerified','originalFieldsMatched','normalizedSchemaMatched','exactCronMatched','allEdgesMatched','allAcceptedWritersDrained','originalEvidencePreserved'])assert.equal(finalState[key],true,'Final installation proof is incomplete')
  for(const receipt of finalState.receipts){const entry=await descriptor(receipt.path);assert.equal(entry.sha256,receipt.sha256,'Original installation receipt changed');installationReceipts.push(entry)}
  const installedHash=sha(await readFile(installedPath))
  assert(installationReceipts.some(entry=>entry.path===resolve(installedPath)&&entry.sha256===installedHash),'Final check is not part of the original installation receipt chain')
 }
 const plan={version:1,sourceOnly:true,remoteExecuted:false,project:journal.project,directory:output,privatePath,identityDigest:journalDigest(journal),createdAt:journal.createdAt,
  sources,coreSeamInputs:sources.filter(entry=>coreSeamSources.some(file=>entry.path===resolve(file))),runtime:{path:runtimePath,sha256:sha(runtimeText)},inputFreeze:{capturedBeforeFinalBundle:true,fixtureToolingSeparate:true,frozenRuntimeSourceCount:frozenRuntime.length,reviewedRuntimeOverrides:runtimeOverrides},integration:await descriptor(integrationPath),migrations:integration.migrations.map(m=>({file:m.source.split('/').at(-1),sha256:m.sha256})),
  deployment:deploymentPlanPath?await descriptor(deploymentPlanPath):null,sqlEvidence:sqlEvidencePath?await descriptor(sqlEvidencePath):null,blockers,
  integrationAdapter:adapterPath?await descriptor(adapterPath):null,installed:installedPath?await descriptor(installedPath):null,finalState:finalStatePath?await descriptor(finalStatePath):null,installationReceipts,
  identityBounds:{baseAuthOwners:5,plannedRaceOwners:12,maxConcurrentAuthOwners:6,concurrentRaceFixtures:1,baseWorkspaces:4,fixedRaceCases:12,scopeHours:1},
  stages:['readiness','prepare','integration','cleanup-races','exercise','worker-unavailable','worker-terminal','verify','restore-fixture','cleanup','recover'],
  executionCaps:{http:{timeoutMs:20000,maxResponseBytes:4194304},worker:{maxStepsPerInvocation:40,defaultSteps:1},restore:{maxReplaySteps:25,maxWorkerSteps:25},cleanup:{maxWorkerSteps:40,maxInventoryPagesPerTarget:64},sql:{statementMs:15000,lockMs:3000},raceSql:{heldRequests:2,releaseSignalRequests:1,statementMs:25000,lockMs:20000,holderDeadlineMs:18000,barrierMs:12000,pollMs:100}},
  rules:['Exact Root lease and reviewed set before any credential load','Protected original IDs, secrets and complete initial envelopes persisted before first dispatch','Immutable operator-registered scope; foreign sentinel excluded from work scope','No global worker/retention, public tunnel, scheduler, paid provider or model call','Known terminal upload deletion and absence only; unproved producer/Storage bounds remain pending','Fixture-only business restore and independent ledger; no Auth recreation, no automatic service reopening','Exact manifest cleanup and independent absence; unresolved state remains a finite failed/pending report']}
 if(remaining)Object.assign(plan,{plannedCaseIds:[...remainingCaseIds],stages:[...remainingStages],remainingRace:{version:1,kind:'fresh-remaining-races',lease:freshLease,evidence:remaining.reference,evidenceInputs:remaining.inputs,toolingOverrides:remaining.toolingOverrides}})
 if(patch)Object.assign(plan,{patchEvidence:patch.reference,patchEvidenceInputs:patch.inputs,patchMigration:patch.manifest.migration,patchTarget:patch.manifest.target,effectivePrivateHistory:patch.manifest.privateHistory,effectiveSchemaAttestation:patch.manifest.schemaAttestation})
 if(snapshotPatch)Object.assign(plan,{snapshotPatchEvidence:snapshotPatch.reference,snapshotPatchEvidenceInputs:snapshotPatch.inputs,snapshotPatchMigration:snapshotPatch.manifest.migration,snapshotPatchTarget:snapshotPatch.manifest.target,effectivePrivateHistory:snapshotPatch.manifest.privateHistory,effectiveSchemaAttestation:snapshotPatch.manifest.schemaAttestation})
 if(retrievalEdge)Object.assign(plan,{retrievalEdgeEvidence:retrievalEdge.reference,retrievalEdgeEvidenceInputs:retrievalEdge.inputs,retrievalEdgeSources:retrievalEdge.sources,effectiveEdges:retrievalEdge.edges})
 assert(!(cleanupFrom&&resumeFrom),'Select one original continuation')
 const continuationFrom=resumeFrom??cleanupFrom
 if(continuationFrom){
  const parent=JSON.parse(await readFile(continuationFrom,'utf8'))
  assert.equal(sha(canonicalJson(material(parent))),parent.reviewedSetSha256,'Original plan digest changed')
  assert(!parent.cleanupContinuation&&!parent.resumeContinuation&&parent.directory===output&&parent.privatePath===privatePath&&parent.identityDigest===plan.identityDigest,'Continuation must preserve the original plan and identities')
  for(const key of ['runtime','integration','deployment','sqlEvidence','installed','finalState','installationReceipts','identityBounds','executionCaps'])assert.equal(canonicalJson(plan[key]),canonicalJson(parent[key]),'Cleanup continuation changed accepted evidence or bounds')
  const raceRecovery=cleanupFrom&&integrationFailurePath
  assert(!integrationFailurePath||raceRecovery&&!cleanupFailures.length,'Select only original integration cleanup recovery')
  const allowed=(raceRecovery?['scripts/lifecycle/development-fixtures.mjs','scripts/lifecycle/fixture-integration.mjs','scripts/lifecycle/fixture-journeys.mjs','scripts/lifecycle/fixture-maintenance.mjs']:['scripts/lifecycle/development-fixtures.mjs','scripts/lifecycle/fixture-support.mjs','scripts/lifecycle/fixture-maintenance.mjs']).map(file=>resolve(file))
  const added=sources.filter(s=>!parent.sources.some(p=>p.path===s.path)).map(s=>s.path),removed=parent.sources.filter(p=>!sources.some(s=>s.path===p.path)).map(p=>p.path)
  assert(!added.length&&!removed.length,`Cleanup dependency closure changed: ${JSON.stringify({added,removed})}`)
  const changed=sources.filter(s=>parent.sources.find(p=>p.path===s.path).sha256!==s.sha256)
  assert(changed.length>0&&changed.every(s=>allowed.includes(s.path)),'Cleanup changes exceed the reviewed tooling boundary')
  assert.equal(cleanupFailures.length,raceRecovery?0:2,'Original failure evidence required')
  const failurePaths=raceRecovery?[integrationFailurePath]:cleanupFailures,modes=raceRecovery?['integration']:['prepare','cleanup'],failures=[]
  for(const [index,mode] of modes.entries()){
   const entry=await descriptor(failurePaths[index]),report=JSON.parse(await readFile(entry.path,'utf8'))
   assert(entry.path.startsWith(`${output}/`),'Original fixture directory required')
   assert(report.ok===false&&report.mode===mode&&report.reviewedSet===parent.reviewedSetSha256,'Original failure must remain unchanged')
   failures.push(entry)
  }
  const continuation={parentPlan:{...await descriptor(continuationFrom),reviewedSetSha256:parent.reviewedSetSha256},identityDigest:plan.identityDigest,allowedStages:resumeFrom?plan.stages:raceRecovery?['cleanup-races','cleanup','recover']:['cleanup','recover'],failures,
   changedInputs:changed.map(s=>({path:s.path,beforeSha256:parent.sources.find(p=>p.path===s.path).sha256,sha256:s.sha256})),noNewIdentities:true}
  if(raceRecovery){
   assert.equal(parent.reviewedSetSha256,'4e142c7c9bd02afed9a2bc433b25a722e59d45e0de998bb24ab103c81b6f4404','Only original4e142 recovery is accepted')
   const report=await readBound(failures[0]),entry=journal.races.find(r=>r.id==='prepare-cutoff')
   assert(report.attempt==='1799ab30-23a6-4750-8943-f797ce43e860'&&report.finalStopHandoff?.verified&&report.finalStopHandoff.originalTransactionsAbsent,'Original joined integration failure required')
   assert(journal.integration?.sdk?.state==='complete'&&journal.integration['race:prepare-cutoff']?.result?.exactBlockObserved&&entry?.fixture.sqlRace&&entry.progress.setupComplete&&entry.progress.cleanup?.sqlAttempted&&entry.progress.cleanup.externalAbsenceVerified&&!entry.fixture.deletions?.account,'Exact failed SQL race checkpoint required')
   assert.equal(entry.progress.cleanup.sqlApplicationName,`d2-install:${report.attempt}`)
   continuation.raceRecovery={raceId:entry.id,originalIntegrationAttempt:report.attempt,originalMetadataApplicationName:entry.progress.cleanup.sqlApplicationName,originalOwnerId:entry.fixture.ownerId,originalSubjectId:entry.fixture.subjectId}
  }
  if(resumeFrom){
   assert(closedStop&&finalClosureContract,'Successful independent closed-stop receipt and new final-window closure contract required')
   const entry=await descriptor(closedStop),stop=JSON.parse(await readFile(entry.path,'utf8')),stopPlan=await descriptor(resolve(dirname(entry.path),'plan.json')),stopMaterial=JSON.parse(await readFile(stopPlan.path,'utf8'))
   assert(stop.ok&&stop.closed&&stop.executionVerified&&stop.originalTransactionsAbsent&&stop.originalEvidencePreserved&&stop.protectedConfigurationMatched&&stop.unrelatedBusinessMatched&&stop.catalogMatched&&stop.project===plan.project,'Independent closure is not accepted')
   const {reviewedSetSha256,...stopBody}=stopMaterial
   assert.equal(sha(canonicalJson(stopBody)),reviewedSetSha256);assert.equal(stop.reviewedSetSha256,reviewedSetSha256);assert.equal(stopMaterial.privateJournalIdentityDigest,plan.identityDigest)
   const originalReadiness=await descriptor(`${output}/readiness-bd97fc19-64c6-4a89-8273-f5ddf4496b74.json`),activation=JSON.parse(await readFile(originalReadiness.path,'utf8'))
   assert(activation.ok&&activation.reviewedSet===parent.reviewedSetSha256&&journal.readinessAttempted&&journal.readinessBefore,'Original successful activation required')
   const before=journal.readinessBefore,expectedClosed={service:{...stopMaterial.expectedPolicies.service,enabled:false},billing:{...stopMaterial.expectedPolicies.billing,enabled:false},lifecycle:{...stopMaterial.expectedPolicies.lifecycle,enabled:false,independent_ledger_ready:false,restore_admission_ready:false,cleanup_wiring_ready:false}}
   assert.equal(canonicalJson(before),canonicalJson(expectedClosed),'Independent closure differs from original closed policies')
   assert(!journal.prepared&&!journal.exercised&&!journal.scopes.work.registered&&!journal.scopes.cleanup.registered&&!journal.readinessResumption,'Original partial fixture only')
   const privateJournalAtClosure=await descriptor(privatePath),originalJournal=stopMaterial.inputs.find(input=>resolve(input.path)===privatePath)
   assert(originalJournal&&originalJournal.sha256===privateJournalAtClosure.sha256,'Closed original private journal changed')
   plan.resumeContinuation={...continuation,closedStop:entry,stopPlan,originalReadiness,privateJournalAtClosure,finalClosureContract:await descriptor(finalClosureContract),originalReadinessBeforeSha256:sha(canonicalJson(before)),closedPolicies:expectedClosed,cron:stopMaterial.job,
    intentId:sha(canonicalJson({parent:continuation.parentPlan.sha256,closedStop:entry.sha256,failures}))}
  }else plan.cleanupContinuation=continuation
 }
 plan.reviewedSetSha256=sha(canonicalJson(material(plan)));if(remaining)await checkRemainingPlan(plan,{journal,lease:freshLease});const path=`${output}/plan-${plan.reviewedSetSha256}.json`;await immutable(path,JSON.stringify(plan,null,2)+'\n')
 for(const entry of sources)assert.equal(sha(await readFile(entry.path)),entry.sha256,'Fixture plan inputs changed during build')
 return{plan,path}
}

export async function createIntegrationContinuationPlan({parentPlanPath,acceptedBoundaryPath,failurePaths=[],cleanupPaths=[],lease,readOnlyNoProgressEvidencePath}={}){
 assert.equal(lease,integrationRoot.lease,'Original exclusive integration lease required')
 const parentPlan=await descriptor(parentPlanPath),parent=await readBound(parentPlan),journal=await loadPrivate(parent.privatePath)
 assert.equal(parent.reviewedSetSha256,integrationRoot.reviewedSet);assert.equal(journalDigest(journal),integrationRoot.identityDigest)
 const sources=[...await Promise.all(parent.sources.map(input=>descriptor(input.path))),await descriptor('scripts/lifecycle/fixture-continuation.mjs')].sort((a,b)=>a.path.localeCompare(b.path)),changedInputs=[...new Map(sources.filter(input=>input.sha256!==parent.sources.find(original=>original.path===input.path)?.sha256).map(input=>[input.path,{path:input.path,beforeSha256:parent.sources.find(original=>original.path===input.path)?.sha256??null,sha256:input.sha256}])).values()]
 assert(changedInputs.length===4&&changedInputs.every(input=>suffixSources.includes(input.path)),'Only reviewed original suffix tooling may change')
 const failures=await Promise.all(failurePaths.map(descriptor)),cleanups=await Promise.all(cleanupPaths.map(descriptor)),reports=await Promise.all([...failures,...cleanups].map(readBound))
 const acceptedCaseIds=journal.races.filter(entry=>entry.progress.cleaned).map(entry=>entry.id),work=journal.scopes.work
 const integrationContinuation={version:1,kind:'original19ff983-integration-suffix',...integrationRoot,parentPlan,identityDigest:parent.identityDigest,runId:journal.runId,workScope:{id:work.id,expiresAt:work.expiresAt,manifest:work.manifest},acceptedIntegration:journal.integration,acceptedCaseIds,acceptedContinuations:journal.integrationContinuations??[],acceptedBoundary:await descriptor(acceptedBoundaryPath),failures,cleanups,changedInputs,allowedStages:suffixStages,originalApplications:[...new Set(reports.flatMap(report=>[`d2-install:${report.attempt}`,...(report.finalStopHandoff?.originalApplications??[])]))],noNewIdentities:true}
 if(readOnlyNoProgressEvidencePath)Object.assign(integrationContinuation,{readOnlyNoProgressResume:true,readOnlyNoProgressEvidence:await descriptor(readOnlyNoProgressEvidencePath)})
 const plan={...parent,sources,integrationAdapter:await descriptor(parent.integrationAdapter.path),stages:suffixStages,integrationContinuation}
 delete plan.reviewedSetSha256;plan.reviewedSetSha256=sha(canonicalJson(material(plan)));await checkIntegrationChild(plan,{journal,lease,select:true})
 const path=`${parent.directory}/plan-${plan.reviewedSetSha256}.json`;await immutable(path,JSON.stringify(plan,null,2)+'\n')
 return{plan,path}
}

export async function createRemainingContinuationPlan({parentPlanPath,failurePaths=[],cleanupPaths=[],lease}={}){
 const parentPlan=await descriptor(parentPlanPath),parent=await readBound(parentPlan)
 await checkRemainingPlan(parent,{lease});const journal=await loadPrivate(parent.privatePath)
 await checkRemainingPlan(parent,{journal,lease})
 const failures=await Promise.all(failurePaths.map(descriptor)),cleanups=await Promise.all(cleanupPaths.map(descriptor)),reports=await Promise.all([...failures,...cleanups].map(readBound)),work=journal.scopes.work
 assert(work?.registered&&Date.parse(work.expiresAt)>Date.now(),'Original fresh work scope expired')
 const continuation={kind:'fresh-remaining-prefix',allowedStages:[...remainingPrefixStages],parentPlan,runId:journal.runId,lease,plannedCaseIds:[...parent.plannedCaseIds],workScope:{id:work.id,expiresAt:work.expiresAt,manifest:work.manifest},acceptedRuns:structuredClone(journal.remainingRaceRuns??[]),acceptedIntegration:structuredClone(journal.integration??{}),acceptedCaseIds:parent.plannedCaseIds.filter(id=>journal.integration?.[`race:${id}`]),failures,cleanups,originalApplications:[...new Set(reports.flatMap(r=>[`d2-install:${r.attempt}`,...(r.finalStopHandoff?.originalApplications??[])]))]}
 const plan={...parent,remainingRaceContinuation:continuation};delete plan.reviewedSetSha256
 plan.reviewedSetSha256=sha(canonicalJson(material(plan)));await checkRemainingPlan(plan,{journal,lease,select:true})
 const path=`${plan.directory}/plan-${plan.reviewedSetSha256}.json`;await immutable(path,JSON.stringify(plan,null,2)+'\n');return{plan,path}
}

async function installedCheck(ctx,plan,installedPath,{closed=false}={}){
 if(plan.currentDevelopmentSnapshot)return assertCurrentFixtureInstalled(ctx,plan,{closed})
 assert(installedPath,'Exact installer --check receipt required');const installed=JSON.parse(await readFile(installedPath,'utf8')),deployment=JSON.parse(await readFile(plan.deployment.path,'utf8')),sql=JSON.parse(await readFile(plan.sqlEvidence.path,'utf8'))
 assert(installed.ok&&installed.stage==='check'&&installed.planSha256===deployment.planSha256&&installed.readback?.schemaMatched&&installed.readback?.originalFieldsMatched,'Installer readback not accepted')
 const history=await ctx.db.query(`select version,sha256 from service_private.migrations ${plan.patchEvidence?'':"where version in('0025','0026','0027','0028')"} order by version`)
 const schema=(await ctx.db.query(normalizedSchemaSql))[0].schema_attestation,actualConfiguration=schema.configuration
 assertFixtureInstalledState(history,schema,{privateHistory:plan.effectivePrivateHistory??plan.migrations.map(m=>({version:m.file.slice(0,4),sha256:m.sha256})),schemaAttestation:plan.effectiveSchemaAttestation??sql.installedSchemaAttestation})
 if(plan.patchEvidence){const target=(await ctx.db.query("select encode(pg_catalog.sha256(convert_to(prosrc,'UTF8')),'hex') body_sha256 from pg_proc where oid='public.push_ops(uuid,uuid,uuid,jsonb)'::regprocedure"))[0];assert.equal(target?.body_sha256,plan.patchTarget.afterBodySha256,'Installed0029 target body differs')}
 if(plan.snapshotPatchEvidence){const target=(await ctx.db.query("select provolatile,encode(pg_catalog.sha256(convert_to(prosrc,'UTF8')),'hex') body_sha256 from pg_proc where oid='public.snapshot_transfer_access(uuid,uuid,uuid,bigint,text,text)'::regprocedure"))[0];assert(target?.provolatile==='v'&&target.body_sha256===plan.snapshotPatchTarget.bodySha256,'Installed0030 snapshot contract differs')}
 if(closed)assert(!actualConfiguration.service.enabled&&!actualConfiguration.readiness.enabled,'Readiness stage requires closed admission')
 for(const edge of plan.effectiveEdges??deployment.bundles){const meta=await ctx.db.request(`/functions/${edge.slug}`),bytes=await ctx.db.request(`/functions/${edge.slug}/body`,{binary:true});const source=bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8');assert(meta.status==='ACTIVE'&&meta.verify_jwt===edge.verifyJwt&&(edge.version===undefined||meta.version===edge.version)&&sha(source)===edge.sha256,'Exact deployed Edge changed')}
 const jobs=await ctx.db.query("select active from cron.job where jobname='goalloom-billing-worker-development'");assert.equal(jobs.length,1);assert.equal(jobs[0].active,false,'Unscoped billing cron must stay paused')
 return schema
}
async function activateFixtureReadiness(ctx,plan,ledger,runtime){
 const policySql="select jsonb_build_object('lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1),'service',(select to_jsonb(p) from service_private.policy p where id=1),'billing',(select to_jsonb(p) from public.billing_policy p where environment='development')) value"
 assert(!plan.resumeContinuation&&!plan.cleanupContinuation&&!ctx.journal.readinessResumption,'Initial activation cannot use a continuation')
 const intentId=sha(canonicalJson({kind:'initial',project:plan.project,identityDigest:plan.identityDigest,runId:ctx.journal.runId,reviewedSet:plan.reviewedSetSha256}))
 if(ctx.journal.readinessAttempted){
  const before=ctx.journal.readinessBefore,actual=(await ctx.db.query(policySql))[0].value
  const activation=ctx.journal.readinessActivation
  assert(before&&activation?.kind==='initial'&&activation.intentId===intentId&&activation.reviewedSet===plan.reviewedSetSha256&&activation.dispatchAttempted&&activation.beforeSha256===sha(canonicalJson(before))&&/^d2-install:[a-f0-9-]{36}$/.test(activation.applicationName),'Original initial activation record changed or missing')
  assert.equal(Number((await ctx.db.query(`select count(*) n from pg_stat_activity where application_name=${q(activation.applicationName)} and state<>'idle'`))[0].n),0,'Original activation transaction remains active')
  const expected={lifecycle:{...before.lifecycle,enabled:true,independent_ledger_ready:true,restore_admission_ready:true,cleanup_wiring_ready:true},service:{...before.service,enabled:true},billing:{...before.billing,enabled:true}}
  assert.equal(canonicalJson(actual),canonicalJson(expected),'Original readiness outcome changed or remains unresolved; inspect before continuation')
  activation.verified=true;ctx.journal.readinessActive=true;await ctx.save();return{developmentReadiness:true,originalActivationVerified:true,initialActivationVerified:true,activationIntentId:intentId,productionReadiness:false}
 }
 assert.equal((await ledger.head()).cursor,'0','Readiness setup must precede actual deletion exports')
 const health=new LocalSqliteLedger(resolve(plan.directory,'ledger-health.sqlite'))
 try{const f=ctx.journal.fixtures[0],record={version:1,eventId:randomUUID(),environment:'development',projectRef:ctx.journal.project,subjectId:randomUUID(),ownerTag:'0'.repeat(64),requestId:null,
  target:{workspaceId:f.targets[0].workspaceId,generation:f.targets[0].generation},lifecycleVersion:1,reason:'ordinary_expiry',kind:'intent',closedAt:null,retrieveUntil:null,onlineDeleteBy:null,onlineDeletedAt:null,deletionReceipt:null}
  const event={eventId:record.eventId,record,digest:await runtime.eventDigest(record)},receipt=await health.append(event);assert.equal((await health.get(event.eventId)).digest,event.digest)
  health.close();const reopened=new LocalSqliteLedger(resolve(plan.directory,'ledger-health.sqlite'))
  try{assert.equal((await reopened.head()).storeId,receipt.storeId);assert.equal((await reopened.get(event.eventId)).digest,event.digest);assert.equal((await reopened.read(String(BigInt(receipt.cursor)-1n),receipt.cursor,1)).entries.length,1)}finally{reopened.close()}
 }catch(error){try{health.close()}catch{/* The closed handle has no remaining work. */}throw error}
 const budget=(await ctx.db.query("select md5(to_jsonb(b)::text) hash from public.ai_budget b where id='integration-shared'"))[0].hash
 ctx.journal.budgetHash??=budget;assert.equal(ctx.journal.budgetHash,budget);await ctx.save()
 const before=(await ctx.db.query(policySql))[0].value
 assert(!before.service.enabled&&!before.billing.enabled&&['enabled','independent_ledger_ready','restore_admission_ready','cleanup_wiring_ready'].every(key=>before.lifecycle[key]===false)&&before.lifecycle.restore_blocked===false,'Initial activation requires exact closed admission')
 assert(!ctx.journal.readinessActivation,'Initial activation intent already exists')
 ctx.journal.readinessBefore??=before;assert.equal(canonicalJson(ctx.journal.readinessBefore),canonicalJson(before),'Original initial policy snapshot changed')
 ctx.journal.readinessActivation={kind:'initial',intentId,reviewedSet:plan.reviewedSetSha256,applicationName:ctx.applicationName,beforeSha256:sha(canonicalJson(before)),dispatchAttempted:true,verified:false}
 ctx.journal.readinessAttempted=true;await ctx.save()
 const policyExpression=policySql.replace(/^select /,'').replace(/ value$/,'')
 await ctx.db.query(`begin;set local lock_timeout='3s';set local statement_timeout='10s';select 1 from public.ai_budget where id='integration-shared' for update;
 select pg_advisory_xact_lock(hashtextextended('goalloom-development-d2-install',0));
 lock table service_private.policy,public.billing_policy,service_private.lifecycle_policy in share row exclusive mode;
 do $$begin if not exists(select 1 from service_private.worker_access where development_requires_scope) then raise exception 'scope_guard_required';end if;
 if exists(select 1 from service_private.transfer_drain_policy where verified) then raise exception 'producer_evidence_unexpected';end if;
 if ${policyExpression} is distinct from ${json(before)} then raise exception 'fixture_activation_policy_changed';end if;end$$;
 update public.billing_policy set enabled=true where environment='development';
 update service_private.policy set enabled=true where id=1 and environment='development';
 update service_private.lifecycle_policy set enabled=true,independent_ledger_ready=true,restore_admission_ready=true,cleanup_wiring_ready=true where id=1;commit;`,false)
 const current=(await ctx.db.query('select enabled,independent_ledger_ready,restore_admission_ready,cleanup_wiring_ready,restore_blocked from service_private.lifecycle_policy where id=1'))[0]
 assert(current.enabled&&current.independent_ledger_ready&&current.restore_admission_ready&&current.cleanup_wiring_ready&&!current.restore_blocked,'Readiness activation outcome remains unknown')
 const expected={lifecycle:{...before.lifecycle,enabled:true,independent_ledger_ready:true,restore_admission_ready:true,cleanup_wiring_ready:true},service:{...before.service,enabled:true},billing:{...before.billing,enabled:true}}
 assert.equal(canonicalJson((await ctx.db.query(policySql))[0].value),canonicalJson(expected),'Initial activation full policy outcome remains unknown')
 ctx.journal.readinessActivation.verified=true;ctx.journal.readinessActive=true;await ctx.save();return{developmentReadiness:true,initialActivationVerified:true,activationIntentId:intentId,independentStoreIdHash:sha((await ledger.head()).storeId),productionReadiness:false,drainEvidence:false,cronChanged:false}
}
function resumeInspectionSql(journal){
 const fixtures=[...journal.fixtures,...journal.races.map(r=>r.fixture)],owners=fixtures.map(f=>q(f.ownerId)).join(','),targets=fixtures.flatMap(f=>f.targets),workspaces=targets.map(t=>q(t.workspaceId)).join(',')
 const scopes=[...Object.values(journal.scopes),...journal.races.flatMap(r=>Object.values(r.scopes))].map(s=>q(s.id)).join(','),owner=journal.fixtures.find(f=>f.label==='owner')
 return `select jsonb_build_object('authOwners',(select jsonb_agg(jsonb_build_object('id',id,'email',email) order by id) from auth.users where id in(${owners})),
  'sessions',(select jsonb_agg(jsonb_build_object('id',id,'owner',user_id) order by id) from auth.sessions where user_id in(${owners})),
  'root',(select jsonb_build_object('subject',subject_id,'owner',user_id,'tag',encode(owner_tag,'hex'),'state',state) from service_private.account_lifecycle where environment='development' and subject_id=${q(owner.subjectId)}),
  'trial',(select jsonb_build_object('request',trial_request,'started',trial_started_at,'ends',trial_ends_at,'consumed',trial_consumed_at,'paidEver',paid_ever) from public.billing_accounts where environment='development' and subject_id=${q(owner.subjectId)}),
  'counts',jsonb_build_object('roots',(select count(*) from service_private.account_lifecycle where owner_tag in(${fixtures.map(f=>`service_private.owner_tag(${q(f.ownerId)})`).join(',')})),
   'devices',(select count(*) from public.devices where user_id in(${owners})),'workspaces',(select count(*) from public.workspaces where user_id in(${owners}) or id in(${workspaces})),
   'lifecycle',(select count(*) from service_private.workspace_lifecycle where workspace_id in(${workspaces})),
   'objects',(select count(*) from storage.objects where bucket_id='snapshots' and (${targets.map(t=>`name like ${q(`workspaces/${t.workspaceId}/%`)}`).join(' or ')})),
   'scopes',(select count(*) from service_private.worker_scopes where id in(${scopes})),
   'requests',(select count(*) from service_private.deletion_requests where subject_id=${q(owner.subjectId)}),
   'transfers',(select count(*) from service_private.cloud_transfers where workspace_id in(${workspaces})),
   'customers',(select count(*) from public.billing_customers where subject_id=${q(owner.subjectId)})),
  'active',(select count(*) from pg_stat_activity where pid<>pg_backend_pid() and state<>'idle' and (application_name like 'd2-install:%' or application_name like 'd2-race-%' or application_name like 'd2-fixture-stop:%'))) inspection`
}
async function inspectOriginalPartialFixture(ctx){
 const owner=ctx.journal.fixtures.find(f=>f.label==='owner')
 assert(owner?.authVerified&&owner.subjectId&&owner.sessions.length===2&&!ctx.journal.prepared&&!ctx.journal.exercised,'Original partial owner required')
 assert(ctx.journal.fixtures.every(f=>f.devices.every(d=>!d.id&&!d.registerAttempted)&&f.targets.every(t=>!t.created&&!t.uploadAttempted&&!t.localProducer)),'Preparation already dispatched beyond original failure')
 assert(Object.values(ctx.journal.scopes).every(s=>!s.registered)&&ctx.journal.races.every(r=>!r.progress.setupAttempted),'Original scopes/races must remain unstarted')
 assert(await ctx.authIdentity(owner),'Original Auth identity is missing; never recreate')
 await assertFixtureRows(ctx,owner)
 const inspection=(await ctx.db.query(resumeInspectionSql(ctx.journal)))[0].inspection
 assert.equal(canonicalJson(inspection.authOwners),canonicalJson([{id:owner.ownerId,email:owner.email}]),'Original Auth set changed')
 const sessions=owner.sessions.map(s=>({id:s.sessionId,owner:owner.ownerId})).sort((a,b)=>a.id.localeCompare(b.id))
 assert.equal(canonicalJson(inspection.sessions),canonicalJson(sessions),'Original sessions changed')
 assert.equal(canonicalJson(inspection.root),canonicalJson({subject:owner.subjectId,owner:owner.ownerId,tag:owner.ownerTag,state:'active'}),'Original subject changed')
 assert(inspection.trial?.request===owner.trialRequest&&inspection.trial.consumed===null&&inspection.trial.paidEver===false&&Date.parse(inspection.trial.ends)-Date.parse(inspection.trial.started)===192*3600000,'Original trial changed')
 assert(Number(inspection.active)===0&&Number(inspection.counts.roots)===1&&Object.entries(inspection.counts).filter(([key])=>key!=='roots').every(([,value])=>Number(value)===0),'Original partial fixture or transaction absence changed')
 return inspection
}
export function buildFixtureResumeSql({journal,continuation,inspection}){
 const before=continuation.closedPolicies,policySql="select jsonb_build_object('service',(select to_jsonb(p) from service_private.policy p where id=1),'billing',(select to_jsonb(p) from public.billing_policy p where environment='development'),'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1)) value"
  const job=continuation.cron,policyExpression=policySql.replace(/^select /,'').replace(/ value$/,''),inspectionExpression=resumeInspectionSql(journal).replace(/^select /,'').replace(/ inspection$/,'')
 return `begin;select 1 from public.ai_budget where id='integration-shared' for update;
   select pg_advisory_xact_lock(hashtextextended('goalloom-development-d2-install',0));
   lock table service_private.policy,public.billing_policy,service_private.lifecycle_policy in share row exclusive mode;
   select 1 from public.billing_accounts where environment='development' and subject_id=${q(journal.fixtures[0].subjectId)} for update;
   do $$begin if ${policyExpression} is distinct from ${json(before)} or ${inspectionExpression} is distinct from ${json(inspection)}
    or not exists(select 1 from service_private.worker_access where development_requires_scope) or exists(select 1 from service_private.transfer_drain_policy where verified)
    or not exists(select 1 from cron.job where jobid=${job.jobid} and jobname=${q(job.jobname)} and schedule=${q(job.schedule)} and active=false and encode(pg_catalog.sha256(convert_to(command,'UTF8')),'hex')=${q(job.command_sha256)})
    or (select md5(to_jsonb(b)::text) from public.ai_budget b where id='integration-shared')<>${q(journal.budgetHash)} then raise exception 'fixture_resumption_changed';end if;end$$;
   update public.billing_policy set enabled=true where environment='development';update service_private.policy set enabled=true where id=1 and environment='development';
   update service_private.lifecycle_policy set enabled=true,independent_ledger_ready=true,restore_admission_ready=true,cleanup_wiring_ready=true where id=1;commit;`
}
async function resumeFixtureReadiness(ctx,plan,ledger){
 const continuation=plan.resumeContinuation,policySql="select jsonb_build_object('service',(select to_jsonb(p) from service_private.policy p where id=1),'billing',(select to_jsonb(p) from public.billing_policy p where environment='development'),'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1)) value"
 assert.equal(sha(canonicalJson(ctx.journal.readinessBefore)),continuation.originalReadinessBeforeSha256)
 const before=continuation.closedPolicies,expected={service:{...before.service,enabled:true},billing:{...before.billing,enabled:true},lifecycle:{...before.lifecycle,enabled:true,independent_ledger_ready:true,restore_admission_ready:true,cleanup_wiring_ready:true}}
 let intent=ctx.journal.readinessResumption
 if(intent){
  assert(intent.intentId===continuation.intentId&&intent.reviewedSet===plan.reviewedSetSha256&&intent.dispatchAttempted,'Original resumption intent changed')
  assert.equal(Number((await ctx.db.query(`select count(*) n from pg_stat_activity where application_name=${q(intent.applicationName)} and state<>'idle'`))[0].n),0,'Original resumption transaction remains active')
  assert.equal(canonicalJson((await ctx.db.query(policySql))[0].value),canonicalJson(expected),'Original resumption outcome remains unresolved; no write replay')
 }else{
  assert.equal((await ledger.head()).cursor,'0','Original ledger must still be empty')
  const inspection=await inspectOriginalPartialFixture(ctx)
  assert.equal(canonicalJson((await ctx.db.query(policySql))[0].value),canonicalJson(before),'Closed policies changed before resumption')
  intent={intentId:continuation.intentId,reviewedSet:plan.reviewedSetSha256,applicationName:ctx.applicationName,closedStopSha256:continuation.closedStop.sha256,inspection,dispatchAttempted:true,at:new Date().toISOString(),previousFailure:ctx.journal.lastFailure}
  ctx.journal.readinessResumption=intent;await ctx.save()
  await ctx.db.query(buildFixtureResumeSql({journal:ctx.journal,continuation,inspection}),false)
  assert.equal(canonicalJson((await ctx.db.query(policySql))[0].value),canonicalJson(expected),'Resumption outcome remains unresolved')
 }
 intent.verified=true;await ctx.save()
 return{developmentReadiness:true,resumptionIntentVerified:true,closedStopSha256:continuation.closedStop.sha256,originalReadinessPreserved:true,productionReadiness:false,drainEvidence:false,cronChanged:false}
}
export async function runFixtureStage({mode,planPath,reviewedSet,lease,installedPath,steps=1,advance=false}){
 requireLease(lease);const plan=JSON.parse(await readFile(planPath,'utf8'));assert.equal(plan.reviewedSetSha256,reviewedSet);assert.equal(sha(canonicalJson(material(plan))),reviewedSet);assert.equal(plan.blockers.length,0,'Fixture plan evidence is incomplete');await verifySources(plan)
 if(mode==='integration-remaining')assert(plan.remainingRace,'Explicit selected plan required before credentials')
 if(plan.remainingRace){assert(plan.stages.includes(mode),'Stage outside selected fresh plan');if(plan.remainingRaceContinuation)assert(remainingPrefixStages.includes(mode),'Stage outside selected prefix child');await checkRemainingPlan(plan,{lease})}
 if(mode==='integration-continuation')assert(plan.integrationContinuation,'Explicit child plan required before credentials')
 if(plan.integrationContinuation){assert(plan.integrationContinuation.allowedStages.includes(mode),'Stage outside original integration child');await checkIntegrationChild(plan,{lease})}
 if(plan.cleanupContinuation||plan.resumeContinuation){
  const continuation=plan.resumeContinuation??plan.cleanupContinuation
  assert(continuation.allowedStages.includes(mode),'Stage outside original continuation')
  for(const input of [continuation.parentPlan,...continuation.failures,...(plan.resumeContinuation?[continuation.closedStop,continuation.stopPlan,continuation.originalReadiness,continuation.finalClosureContract]:[])])assert.equal(sha(await readFile(input.path)),input.sha256,'Original continuation provenance changed')
  assert.equal(continuation.identityDigest,plan.identityDigest)
 }
 for(const input of [plan.integration,plan.deployment,plan.sqlEvidence,plan.installed,plan.finalState,...plan.installationReceipts].filter(Boolean))assert.equal(sha(await readFile(input.path)),input.sha256,'Reviewed external evidence changed')
 if(plan.patchEvidence){
  const patch=await reviewFixturePatchEvidence(plan.patchEvidence.path,{base:{deploymentPlan:plan.deployment,sqlEvidence:plan.sqlEvidence,installedCheck:plan.installed,finalState:plan.finalState}})
  assert.equal(patch.reference.sha256,plan.patchEvidence.sha256,'Reviewed forward manifest changed')
  for(const [key,value] of [['patchEvidenceInputs',patch.inputs],['patchMigration',patch.manifest.migration],['patchTarget',patch.manifest.target],...(!plan.snapshotPatchEvidence?[['effectivePrivateHistory',patch.manifest.privateHistory],['effectiveSchemaAttestation',patch.manifest.schemaAttestation]]:[])])assert.equal(canonicalJson(plan[key]),canonicalJson(value),'Reviewed forward installation chain changed')
  if(plan.snapshotPatchEvidence){
   const snapshotPatch=await reviewFixtureSnapshotPatchEvidence(plan.snapshotPatchEvidence.path,{patchEvidence:patch});assert.equal(snapshotPatch.reference.sha256,plan.snapshotPatchEvidence.sha256,'Reviewed snapshot patch manifest changed')
   for(const [key,value] of [['snapshotPatchEvidenceInputs',snapshotPatch.inputs],['snapshotPatchMigration',snapshotPatch.manifest.migration],['snapshotPatchTarget',snapshotPatch.manifest.target],['effectivePrivateHistory',snapshotPatch.manifest.privateHistory],['effectiveSchemaAttestation',snapshotPatch.manifest.schemaAttestation]])assert.equal(canonicalJson(plan[key]),canonicalJson(value),'Reviewed snapshot patch chain changed')
   if(plan.retrievalEdgeEvidence){const edge=await reviewFixtureRetrievalEdgeEvidence(plan.retrievalEdgeEvidence.path,{snapshotPatchEvidence:snapshotPatch});assert.equal(edge.reference.sha256,plan.retrievalEdgeEvidence.sha256,'Reviewed Edge manifest changed');for(const [key,value] of [['retrievalEdgeEvidenceInputs',edge.inputs],['retrievalEdgeSources',edge.sources],['effectiveEdges',edge.edges]])assert.equal(canonicalJson(plan[key]),canonicalJson(value),'Reviewed Edge installation chain changed')}
  }
 }
 installedPath??=plan.installed.path;assert.equal(resolve(installedPath),plan.installed.path,'Use the original bound installer check receipt')
 const journal=await loadPrivate(plan.privatePath);assert.equal(journalDigest(journal),plan.identityDigest);assert(!journal.cleaned,'Fixture journal is already terminal')
 if(plan.resumeContinuation&&!journal.readinessResumption)assert.equal(sha(await readFile(plan.privatePath)),plan.resumeContinuation.privateJournalAtClosure.sha256,'Original closed journal changed before resumption')
 if(mode==='integration-continuation')await checkIntegrationChild(plan,{journal,lease,select:true})
 if(plan.remainingRace)await checkRemainingPlan(plan,{journal,lease,select:mode==='integration-remaining'})
 if(mode==='recover'){
  const result=await recoverDeploymentLock(`${plan.directory}/execution`,reviewedSet,{query:async sql=>{
   const db=await client(),names=(journal.races??[]).flatMap(c=>['setup','holder','waiter'].map(kind=>q(`d2-race-${kind}:${c.fixture.ownerId}`))).join(',')||'null'
   const active=(await db.query(`select count(*) n from pg_stat_activity where application_name in(${names}) and state<>'idle'`))[0].n
   assert.equal(Number(active),0,'An original race connection is still active; retain the lock');return db.query(sql)
  }})
  const report={version:1,ok:true,project:plan.project,mode,reviewedSet,readOnly:true,remoteWrites:0,recovered:result.recovered,originalProcessAbsent:result.originalProcessAbsent??false,originalTransactionAbsent:result.originalTransactionAbsent??false,originalJournalPreserved:true}
  await immutable(`${plan.directory}/recover-${randomUUID()}.json`,JSON.stringify(report,null,2)+'\n');return report
 }
 if(journal.quarantine.held)assert(['restore-fixture','cleanup','cleanup-races','verify'].includes(mode),'External fixture quarantine is held')
 const attempt=randomUUID(),lock=await acquireDeploymentLock(`${plan.directory}/execution`,reviewedSet,attempt),report={version:1,ok:false,project:plan.project,mode,attempt,reviewedSet,identityDigest:plan.identityDigest,fixturePlan:await descriptor(planPath),remoteExecuted:false,stage:'preflight',scope:'Real development fixture only; no paid providers/models, installer, scheduler or supplier-bound evidence'}
 let ctx,ledger
 try{
  ctx=await fixtureContext({lease,journal,privatePath:plan.privatePath,scope:mode==='cleanup'?'cleanup':'work',applicationName:lock.metadata.applicationName});report.remoteExecuted=true
  ctx.raceRecovery=plan.cleanupContinuation?.raceRecovery
  await installedCheck(ctx,plan,installedPath,{closed:mode==='readiness'&&!(plan.resumeContinuation?journal.readinessResumption?.dispatchAttempted:journal.readinessAttempted)});const runtime=await import(pathToFileURL(plan.runtime.path).href);ctx.runtimeDigest=plan.runtime.sha256
  ledger=new LocalSqliteLedger(resolve(plan.directory,'independent-deletion-ledger.sqlite'));report.runtime={node:process.version,sqlite:ledger.db.prepare('select sqlite_version() version').get().version,platform:process.platform,arch:process.arch,electron:'not used',physicalOrVm:'not established'};report.stage=mode
  const head=await ledger.head();journal.ledgerIdentity??={storeId:head.storeId,path:resolve(plan.directory,'independent-deletion-ledger.sqlite')};assert.equal(head.storeId,journal.ledgerIdentity.storeId,'Original independent ledger changed');await ctx.save()
  if(mode==='prepare')assert(journal.readinessActive&&!journal.exercised,'Prepare must precede deletion and follow original readiness activation')
  if(mode==='integration')assert(journal.prepared&&!journal.exercised,'SDK and race integration must use original prepared identities before privacy deletion')
  if(mode==='exercise')assert(journal.prepared,'Original fixture preparation is incomplete')
  if(['worker-unavailable','worker-terminal','verify','restore-fixture'].includes(mode))assert(journal.exercised,'Original privacy requests must be accepted before worker verification')
  if(mode==='readiness')report.result=plan.resumeContinuation?await resumeFixtureReadiness(ctx,plan,ledger):await activateFixtureReadiness(ctx,plan,ledger,runtime)
  else if(mode==='prepare'){
   if(plan.resumeContinuation){const intent=journal.readinessResumption;assert(intent?.verified&&intent.reviewedSet===reviewedSet&&!intent.prepareAttempted,'One verified original prepare resumption required');assert.equal(canonicalJson(await inspectOriginalPartialFixture(ctx)),canonicalJson(intent.inspection),'Original partial fixture changed since resumption');intent.prepareAttempted=true;await ctx.save()}
   report.result=await prepareFixtures(ctx,runtime)
  }
  else if(mode==='integration'){
   assert(plan.integrationAdapter,'Original reviewed backend adapter required')
   const adapter=await import(pathToFileURL(plan.integrationAdapter.path).href),callbacks=await ownedRaceCallbacks(ctx,runtime,ledger),sdk=await originalSdkMaterial(ctx)
   assert.equal(typeof adapter.runOwnedRetrievalAndRaces,'function','Stable backend adapter entry required')
   const material={sdk,acquireRaceCase:callbacks.acquireCase,releaseRaceCase:callbacks.releaseCase}
   report.result=await adapter.runOwnedRetrievalAndRaces({context:ctx,runtime,ledger,material,record:async(label,result)=>{assert(typeof label==='string'&&label.length<=100);journal.integration??={};journal.integration[label]=result;await ctx.save()}})
   assert(journal.races.every(c=>c.progress.cleaned),'Every original race case must finish exact cleanup');journal.integrationComplete=true;await ctx.save()
  }
  else if(mode==='integration-remaining'){
   assert(journal.prepared&&!journal.exercised&&!journal.scopes.cleanup.registered,'Fresh selected base must remain prepared and uncleaned')
   const c=plan.remainingRaceContinuation
   if(c){const active=(await ctx.db.query(`select count(*) n from pg_stat_activity where application_name in(${c.originalApplications.map(q).join(',')}) and state<>'idle' and pid<>pg_backend_pid()`))[0].n;assert.equal(Number(active),0,'Original selected executor remains active')}
   const adapter=await import(pathToFileURL(plan.integrationAdapter.path).href),callbacks=await ownedRaceCallbacks(ctx,runtime,ledger,{plannedCaseIds:plan.plannedCaseIds})
   report.result=await adapter.runFreshRemainingRaces({context:ctx,ledger,plannedCaseIds:plan.plannedCaseIds,continuation:c,material:{acquireRaceCase:callbacks.acquireCase,releaseRaceCase:callbacks.releaseCase,verifyCleanedCase:callbacks.verifyCleanedCase},record:async(label,result)=>{assert(typeof label==='string'&&plan.plannedCaseIds.some(id=>label===`race:${id}`),'Selected race record outside reviewed list');journal.integration??={};journal.integration[label]=result;await ctx.save()}})
   assert(journal.remainingRaceIntegrationComplete&&!journal.integrationComplete&&!journal.sdk,'Only selected integration completion is allowed');await ctx.save()
  }
  else if(mode==='integration-continuation'){
   const c=plan.integrationContinuation
   assert(journal.prepared&&!journal.exercised&&!journal.scopes.cleanup.registered,'Original base must remain prepared and uncleaned')
   const active=(await ctx.db.query(`select count(*) n from pg_stat_activity where application_name in(${c.originalApplications.map(q).join(',')}) and state<>'idle' and pid<>pg_backend_pid()`))[0].n
   assert.equal(Number(active),0,'An original integration/cleanup executor remains active')
   const adapter=await import(pathToFileURL(plan.integrationAdapter.path).href),callbacks=await ownedRaceCallbacks(ctx,runtime,ledger)
   const material={acquireRaceCase:callbacks.acquireCase,releaseRaceCase:callbacks.releaseCase,verifyCleanedCase:callbacks.verifyCleanedCase}
   report.result=await adapter.continueOwnedRetrievalAndRaces({context:ctx,ledger,material,continuation:c,record:async(label,result)=>{assert(typeof label==='string'&&label.length<=100);journal.integration??={};journal.integration[label]=result;await ctx.save()}})
   assert(journal.races.every(entry=>entry.progress.cleaned),'Every original case must finish exact cleanup');journal.integrationComplete=true;await ctx.save()
  }
  else if(mode==='cleanup-races')report.result=await cleanupOwnedRaceCases(ctx,runtime,ledger)
  else if(mode==='exercise')report.result=await exerciseDeletions(ctx)
  else if(['worker-unavailable','worker-terminal'].includes(mode))report.result=await driveFixtureWorker(ctx,runtime,ledger,{settleMode:mode==='worker-terminal'?'empty-controlled':'unavailable',steps,advance})
  else if(mode==='verify')report.result=await verifyFixtureDeletion(ctx)
  else if(mode==='restore-fixture'){const {restoreFixture}=await import('./fixture-maintenance.mjs');report.result=await restoreFixture(ctx,runtime,ledger)}
  else if(mode==='cleanup'){assert(journal.races.every(c=>!c.progress.setupAttempted||c.progress.cleaned),'Original sequential race cleanup remains unfinished');const {cleanupLifecycleFixtures}=await import('./fixture-maintenance.mjs');report.result=await cleanupLifecycleFixtures(ctx,runtime,ledger)}
  else throw Error('Unrecognized fixture stage')
  if(journal.budgetHash)assert.equal((await ctx.db.query("select md5(to_jsonb(b)::text) hash from public.ai_budget b where id='integration-shared'"))[0].hash,journal.budgetHash,'Original shared budget changed')
  await verifySources(plan);report.ok=true
 }catch(error){report.error={type:error?.name==='AssertionError'?'guard_failed':'fixture_stage_incomplete',reason:'retain_original_ids_and_inspect_before_retry',...(error?.requestDiagnostic?{requestDiagnostic:error.requestDiagnostic}:{})};if(ctx){journal.failures??=[];if(journal.lastFailure&&!journal.failures.some(f=>f.attempt===journal.lastFailure.attempt))journal.failures.push(journal.lastFailure);journal.lastFailure={attempt,mode,type:error?.name??'Error',detail:ctx.db.safe(error?.message??'unknown'),...(error?.requestDiagnostic?{requestDiagnostic:error.requestDiagnostic}:{})};journal.failures.push(journal.lastFailure);await ctx.save()}process.exitCode=1}
 finally{
  if(ctx)try{const {captureFixtureStopHandoff}=await import('./fixture-maintenance.mjs');report.finalStopHandoff=await captureFixtureStopHandoff(ctx,{plan,attempt})}catch{report.finalStopHandoff={verified:false,reason:'bounded_final_stop_capture_unverified'}}
  ledger?.close();const path=`${plan.directory}/${mode}-${attempt}.json`;report.evidence=path;await immutable(path,JSON.stringify(report,null,2)+'\n');await lock.release()
 }
 return report
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),mode=args[0]??'--plan',flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
 if(mode==='--fresh-remaining'){const result=await runFreshRemainingSuite({directory:flag('--directory'),lease:flag('--lease')});console.log(JSON.stringify(result,null,2))}
 else if(mode==='--plan-remaining-continuation'){const values=name=>args.flatMap((value,index)=>value===name?[args[index+1]]:[]);const {plan,path}=await createRemainingContinuationPlan({parentPlanPath:args[1],failurePaths:values('--failure'),cleanupPaths:values('--cleanup-evidence'),lease:flag('--lease')});console.log(JSON.stringify({sourceOnly:true,remoteExecuted:false,path,reviewedSetSha256:plan.reviewedSetSha256,plannedCaseIds:plan.plannedCaseIds},null,2))}
 else if(mode==='--plan-integration-continuation'){const values=name=>args.flatMap((value,index)=>value===name?[args[index+1]]:[]);const {plan,path}=await createIntegrationContinuationPlan({parentPlanPath:args[1],acceptedBoundaryPath:flag('--accepted-boundary'),failurePaths:values('--failure'),cleanupPaths:values('--cleanup-evidence'),lease:flag('--lease'),readOnlyNoProgressEvidencePath:flag('--read-only-no-progress-evidence')});console.log(JSON.stringify({sourceOnly:true,remoteExecuted:false,path,reviewedSetSha256:plan.reviewedSetSha256,identityDigest:plan.identityDigest,reusedCases:plan.integrationContinuation.acceptedCaseIds},null,2))}
 else if(mode==='--plan'){const {plan,path}=await createFixturePlan({directory:flag('--directory'),integrationPath:flag('--integration')??integrationDefault,deploymentPlanPath:flag('--deployment-plan'),sqlEvidencePath:flag('--sql-evidence'),adapterPath:flag('--adapter'),installedPath:flag('--installed'),finalStatePath:flag('--final-state'),patchEvidencePath:flag('--patch-evidence'),snapshotPatchEvidencePath:flag('--snapshot-patch-evidence'),retrievalEdgeEvidencePath:flag('--retrieval-edge-evidence'),cleanupFrom:flag('--cleanup-from'),resumeFrom:flag('--resume-from'),closedStop:flag('--closed-stop'),finalClosureContract:flag('--final-closure-contract'),cleanupFailures:[flag('--prepare-failure'),flag('--cleanup-failure')].filter(Boolean),integrationFailurePath:flag('--integration-failure'),remainingEvidencePath:flag('--remaining-evidence'),freshLease:flag('--fresh-lease')});console.log(JSON.stringify({sourceOnly:true,remoteExecuted:false,path,reviewedSetSha256:plan.reviewedSetSha256,blockers:plan.blockers,runtime:plan.runtime,identityBounds:plan.identityBounds},null,2))}
 else{assert(['--readiness','--prepare','--integration','--integration-remaining','--integration-continuation','--cleanup-races','--exercise','--worker-unavailable','--worker-terminal','--verify','--restore-fixture','--cleanup','--recover'].includes(mode),'Use --plan or one reviewed fixture stage');const report=await runFixtureStage({mode:mode.slice(2),planPath:args[1],reviewedSet:flag('--reviewed-set'),lease:flag('--lease'),installedPath:flag('--installed'),steps:Number(flag('--steps')??1),advance:args.includes('--advance-operational')});console.log(JSON.stringify(report,null,2))}
}
