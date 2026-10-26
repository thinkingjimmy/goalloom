/**
 * [INPUT]: Local D2 candidates, optional exact final freezes and existing credential-free bundle/fingerprint tools.
 * [OUTPUT]: Immutable six-Edge plans, read-only inventory and explicitly leased forward installation/stop receipts.
 * [POS]: D2 development installer. Runtime/fixture acceptance and Root execution leases remain separate.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {bundle,stripePath} from './build.mjs'
import {migrationManifest,sha256} from '../deploy/schema.mjs'
import {developmentRef} from '../hosted-ai/client.mjs'
import {LIMITS,RUNTIME_TABLES,catalogScope} from './d2-populated-gate.mjs'
import {EDGE_MODES,BILLING_JOB,CLOSED_DEFAULTS,schemaAttestationScope} from './d2-deploy-state.mjs'
import {reviewPausedContinuation} from './d2-deploy-continuation.mjs'

export const DEPLOY_DIRECTORY='output/tests/billing/desktop/d2-deployment'
const d1EvidencePath='output/tests/billing/desktop/d1-backend/deployment.json'
const d1SqlPath='output/tests/billing/desktop/d1-backend/sql-acceptance.json'
const failurePath=`${DEPLOY_DIRECTORY}/failure-cases.md`
const migrationsWanted=['0025_service_lifecycle.sql','0026_account_deletion.sql','0027_retained_retrieval.sql','0028_lifecycle_cleanup.sql']
const toolFiles=['scripts/billing/d2-deploy-development.mjs','scripts/billing/d2-deploy-state.mjs','scripts/billing/d2-deploy-readback.mjs','scripts/billing/d2-deploy-execute.mjs','scripts/billing/d2-deploy-lock.mjs','scripts/billing/d2-deploy-parser.mjs','scripts/billing/d2-deploy-continuation.mjs','scripts/billing/d2-schema-attestation.mjs','scripts/billing/d2-cron-runtime.mjs','scripts/billing/build.mjs',
 'scripts/billing/d2-final-sql-acceptance.mjs','scripts/billing/d2-final-sql-parser.mjs','scripts/billing/d2-final-sql-probes.mjs',
 'scripts/billing/d2-populated-gate.mjs','scripts/billing/d1-schema.mjs','scripts/billing/d1-sync-fixtures.mjs',
 'scripts/deploy/schema.mjs','scripts/deploy/transport.mjs','scripts/deploy/edge-source.mjs','scripts/hosted-ai/client.mjs',
 'package.json','pnpm-lock.yaml','supabase/config.toml',failurePath,'output/tests/billing/desktop/d2-deployment/continuation-failure-cases.md',d1EvidencePath,d1SqlPath]
const record=async path=>{const bytes=await readFile(path);return {path,sha256:sha256(bytes),bytes:bytes.length}}
async function immutable(path,bytes){
 try{await writeFile(path,bytes,{flag:'wx',mode:0o600})}
 catch(error){if(error.code!=='EEXIST')throw error;assert((await readFile(path)).equals(Buffer.from(bytes)),'Immutable deployment artifact changed')}
}
const same=(a,b)=>canonicalJson(a)===canonicalJson(b)
async function tree(folder,pattern){return (await readdir(folder,{recursive:true})).filter(path=>pattern.test(path)).map(path=>`${folder}/${path}`)}
async function packageRoot(entry,expectedName){
 let path=dirname(entry)
 while(path!==dirname(path)){
  try{const metadata=JSON.parse(await readFile(`${path}/package.json`,'utf8'));if(metadata.name===expectedName)return path}
  catch(error){if(error.code!=='ENOENT')throw error}
  path=dirname(path)
 }
 throw Error('Dependency package root missing')
}
async function inputFiles(manifest){
 const roots=[...EDGE_MODES.map(edge=>`supabase/functions/${edge.slug}`),'packages/contracts/src','packages/crypto/src']
 const sources=[...toolFiles,...manifest.filter(m=>m.version<='0028').map(m=>`supabase/migrations/${m.file}`),...(await Promise.all(roots.map(root=>tree(root,/\.(?:ts|mjs|md)$/)))).flat()]
 const require=createRequire(import.meta.url),esbuildEntry=require.resolve('esbuild'),esbuildRequire=createRequire(esbuildEntry)
 const packageEntries=[[stripePath,'stripe'],[require.resolve('zod'),'zod'],[require.resolve('@noble/curves/ed25519.js'),'@noble/curves'],[require.resolve('@noble/hashes/sha2.js'),'@noble/hashes']]
 const dependencyRoots=[...new Set(await Promise.all(packageEntries.map(([entry,name])=>packageRoot(entry,name))))]
 const dependencies=[process.execPath,esbuildEntry,esbuildRequire.resolve(`@esbuild/${process.platform}-${process.arch}/bin/esbuild`),
  ...(await Promise.all(dependencyRoots.map(root=>tree(root,/\.(?:js|mjs|cjs|json)$/)))).flat()]
 assert(sources.length<2048&&dependencies.length<10000,'Deployment input inventory exceeds bound')
 assert(dependencies.includes(resolve(dirname(stripePath),'../esm/stripe.esm.worker.js')),'Actual aliased Stripe worker input must be captured')
 return {sources:[...new Set(sources)].sort(),dependencies:[...new Set(dependencies)].sort()}
}
async function optionalJson(path,pattern){
 if(!path)return null
 assert(pattern.test(path)&&!path.includes('..'),'Expected the exact public evidence path, never private configuration')
 return {reference:await record(path),value:JSON.parse(await readFile(path,'utf8'))}
}
async function finalEvidence({integrationManifestPath,sqlPlanPath,sqlEvidencePath,preflightPath},migrations){
 const integration=await optionalJson(integrationManifestPath,/^output\/tests\/billing\/desktop\/d2-lifecycle\/integration-staging\/[a-f0-9]+\/manifest\.json$/)
 const sqlPlan=await optionalJson(sqlPlanPath,/^output\/tests\/billing\/desktop\/d2-final-sql\/staging\/[a-f0-9]+\/plan\.json$/)
 const sqlEvidence=await optionalJson(sqlEvidencePath,/^output\/tests\/billing\/desktop\/d2-final-sql\/attempts\/[a-f0-9-]+\.json$/)
 const preflight=await optionalJson(preflightPath,/^output\/tests\/billing\/desktop\/d2-deployment\/preflights\/[a-f0-9]{64}\.json$/)
 if(integration){
  const value=integration.value
  assert(value.version===1&&value.sourceOnly===true&&value.remoteExecuted===false&&value.project===developmentRef&&Array.isArray(value.sources),'Final integration manifest required')
  const material=value.sources.map(({source,sha256,bytes})=>({source,sha256,bytes}))
  assert(sha256(canonicalJson(material))===value.integrationSetSha256,'Integration set checksum mismatch')
  for(const source of value.sources){
   assert(/^(?:supabase|scripts|packages)\//.test(source.source)&&!source.source.includes('..'),'Unexpected integration source')
   const current=await record(source.source),frozen=await record(source.path)
   assert(current.sha256===source.sha256&&current.bytes===source.bytes&&frozen.sha256===source.sha256&&frozen.bytes===source.bytes,'Final integration source changed')
  }
  assert(same(value.migrations.map(({source,sha256,bytes})=>({file:source.split('/').at(-1),sha256,bytes})),migrations.map(({file,sha256,bytes})=>({file,sha256,bytes}))),'Integration migrations differ')
  assert((await record(value.localAcceptance.path)).sha256===value.localAcceptance.sha256,'Local integration evidence changed')
  const accepted=JSON.parse(await readFile(value.localAcceptance.path,'utf8'));assert(accepted.ok&&accepted.inputFreeze?.unchanged,'Passing frozen lifecycle acceptance required')
 }
 if(sqlPlan){
  const {reviewFinalPlan}=await import('./d2-final-sql-acceptance.mjs')
  await reviewFinalPlan(sqlPlanPath,sqlPlan.value.reviewedSetSha256)
  assert(same(sqlPlan.value.migrations.map(({file,sha256,bytes})=>({file,sha256,bytes})),migrations.map(({file,sha256,bytes})=>({file,sha256,bytes}))),'Rollback plan migrations differ')
 }
 if(sqlEvidence){
  assert(sqlPlan,'Final SQL plan is required with rollback evidence')
  const accepted=sqlEvidence.value
  assert(accepted.ok&&accepted.rollbackVerified&&accepted.writeRequests===1&&accepted.reviewedSetSha256===sqlPlan.value.reviewedSetSha256,'Matching successful final rollback required')
  assert(accepted.checks?.length===sqlPlan.value.checks.length&&accepted.checks.every((check,i)=>check.ok&&check.name===sqlPlan.value.checks[i]),'Final rollback scenario evidence differs')
  assert(same(accepted.migrations.map(({file,sha256})=>({file,sha256})),migrations.map(({file,sha256})=>({file,sha256}))),'Rollback evidence migrations differ')
  assert(accepted.installedSchemaAttestation?.version===1&&accepted.installedSchemaAttestation.scope===schemaAttestationScope,'Final normalized schema attestation missing')
 }
 if(preflight)assert(preflight.value.ok&&preflight.value.readOnly===true&&preflight.value.remoteWrites===0&&preflight.value.project===developmentRef&&preflight.value.d1SchemaMatched,'Successful actual D1 preflight required')
 return {integration:integration?.reference??null,integrationSetSha256:integration?.value.integrationSetSha256??null,
  sqlPlan:sqlPlan?.reference??null,sqlSetSha256:sqlPlan?.value.reviewedSetSha256??null,sqlEvidence:sqlEvidence?.reference??null,preflight:preflight?.reference??null}
}
export async function createDeploymentPlan(options={}){
 const continuation=options.continuationPath?await reviewPausedContinuation(options.continuationPath):null
 const manifest=await migrationManifest(),legacy=manifest.filter(m=>m.version<'0025'),candidate=manifest.filter(m=>m.version>='0025'&&m.version<='0028')
 assert(legacy.length===24&&legacy.every((m,i)=>m.version===String(i+1).padStart(4,'0')),'Exact immutable 0001–0024 inventory required')
 assert.deepEqual(candidate.map(m=>m.file),migrationsWanted,'Exact four D2 candidate files required')
 const migrations=await Promise.all(candidate.map(async m=>({file:m.file,...await record(`supabase/migrations/${m.file}`)})))
 const evidence=await finalEvidence(options,migrations),files=await inputFiles(manifest)
 const before={sources:await Promise.all(files.sources.map(record)),dependencies:await Promise.all(files.dependencies.map(record))}
 const edges=await Promise.all(EDGE_MODES.map(async edge=>{const source=await bundle(`supabase/functions/${edge.slug}/index.ts`);return {...edge,source,sha256:sha256(source),bytes:Buffer.byteLength(source)}}))
 const after={sources:await Promise.all(files.sources.map(record)),dependencies:await Promise.all(files.dependencies.map(record))}
 assert(same(before,after),'Deployment inputs changed during bundle construction')
 const previous=JSON.parse(await readFile(d1EvidencePath,'utf8'))
 assert(previous.ok&&previous.project===developmentRef&&previous.edges?.length===3&&previous.edges.every(e=>e.verified),'Accepted D1 Edge source evidence required')
 const blockers=[]
 if(!evidence.integration)blockers.push('Final lifecycle SQL/runtime integration freeze missing')
 if(!evidence.sqlPlan)blockers.push('Final four-migration rollback plan missing')
 if(!evidence.sqlEvidence)blockers.push('Matching successful final four-migration PostgreSQL rollback evidence missing')
 if(!evidence.preflight)blockers.push('Actual fixed-project D1/history/cron/old-source/fingerprint preflight missing')
 const original=evidence.preflight?JSON.parse(await readFile(evidence.preflight.path,'utf8')).observed:null
 const exactJob=original?.cron.find(job=>job.jobname===BILLING_JOB)
 const plan={version:1,project:developmentRef,environment:'development',status:blockers.length?'CANDIDATE_REQUIRES_FINAL_EVIDENCE':'READY_FOR_ROOT_REVIEW',
  sourceOnly:true,remoteExecuted:false,networkRequests:0,executionReady:false,rootLease:false,blockers,
  inputs:{...before,evidence,immutableD1:legacy.map(({version,file,sha256})=>({version,file,sha256})),migrations:migrations.map(({path,...m})=>m)},
  continuation:continuation?{reference:continuation.reference,originalSet:continuation.manifest.originalSet,sources:continuation.manifest.sources}:null,
  integrationBinding:'Every source in the dedicated deployment integration freeze must match its current and immutable bytes. Runtime/SQL and accepted local dependencies stay bound; independent fixture drivers use their separate source plan and lease.',
  bundles:edges.map(({source,...edge})=>({...edge,path:`bundles/${edge.slug}/index.ts`})),
  previousEdges:{scope:'Historical accepted D1 evidence only. Fresh metadata and downloaded source are mandatory before any pause or replacement.',
   evidence:await record(d1EvidencePath),observedAt:previous.edgesVerifiedAt,edges:previous.edges.map(({slug,sha256,version})=>({slug,sha256,version,currentVerified:false}))},
  observedEdges:original?{evidence:evidence.preflight,observedAt:original.observedAt,edges:original.edges}:null,
  history:{sourceInventory:'All 0001–0024 byte hashes are bound; none is replayed or re-baselined.',
   namespaces:['supabase_migrations.schema_migrations','service_private.migrations'],
   privatePrefix:legacy.filter(m=>m.version>='0018').map(({version,sha256})=>({version,sha256})),
   earlyHistory:'Read actual core history if present and compare exact recorded prefix SQL/name/version. The existing standalone development mode must retain its explicit reviewed source/schema attestation for unrecorded early versions. Missing history is never fabricated or described as full-history proof.',
   d2:'Insert 0025–0028 exact SHA rows into existing private history inside the same four-migration transaction.'},
  scheduler:{name:BILLING_JOB,expectedCount:1,jobId:exactJob?.jobid??null,commandSha256:exactJob?.command_sha256??null,schedule:exactJob?.schedule??null,currentActive:exactJob?.active??null,
   requiredFreshFields:['jobid','jobname','schedule','active','command_sha256'],vaultReference:'goalloom-billing-worker-auth-development',
   pause:'Match the exact observed ID/name/command hash/schedule/active bit, then cron.alter_job(id,active:=false). No schedule, command, credential or unrelated job changes.',
   newJobs:[],finalState:'inactive',restoreOriginalActive:false,
   reason:'D2 development requires immutable worker scope. The old unscoped billing cron is not safe to restart automatically.'},
  admission:{pause:['service_private.policy.enabled=false','public.billing_policy.enabled=false (development only)','Exact billing cron active=false'],
   protected:['AI policy/environment/limit/spent/blocked','All AI costs, unknown reserves and protection facts','billing_sources and source fingerprint','Encrypted Vault base and all unrelated cron configuration'],
   defaults:CLOSED_DEFAULTS,activationIncluded:false,workerScopeRequired:true,lifecycleWorkerMode:'local-only; lifecycle Edge verify_jwt=true'},
  preservation:{engine:'Existing d2-populated-gate inventorySql/catalogSql/businessSql/inboxRoutesSql/verifyInboxRoutesSql',limits:LIMITS,catalogScope,
   atomicProof:'Take budget lock first without mutation, strongly lock only existing public/service_private application tables, capture ALL original relation-column hashes and actual inbox ownership routes; after re-key compare the full original projection plus zero routing violations before commit. Auth/Storage/cron/extension fingerprints remain strict without extra strong table locks.',
   allowedDifferences:['Exact pause flags and billing cron active bit','Reviewed D2 catalog/new private history and min_service_version=2'],
   backgroundRuntimeExceptions:{tables:RUNTIME_TABLES,sequences:'Catalog-proven sequences owned by those exact tables, plus only cron.runid_seq after fresh exact pg_cron1.6.4/default/dependency/no-OWNEDBY proof. Counter values observed separately; all catalog definitions remain strict. Every other original persistent relation/configuration must match.'},
   schemaAttestation:{implementation:'normalizedSchemaSql',scope:schemaAttestationScope},
   finalReadback:'After fixture owner removes its exact fixtures: original business/financial/AI/source/protection/owned-sequence hashes, unchanged early/private old history and unrelated cron/Vault state; new D2 source/ACL/RLS definitions use an OID-independent reviewed attestation.'},
  stages:[
   {name:'read-only-preflight',implementation:'collectDeploymentState(db)',requires:'Fresh Root-approved read window; fixed existing Management client; no credentials or raw user/source rows in evidence.',checks:['Exact D1 schema/source and 0001–0024 attestation','No partial D2 or active earlier installer/gate','Exact scheduler inventory and six old Edge metadata/source states','Hash-only original columns, catalog, history, AI/protection/source and Vault base']},
   {name:'pause',implementation:'buildPauseSql',requires:'Persist immutable original state and unknown operation journal before one non-retried write.',checks:['Exact project/environment, admission hash and cron identity','AI budget-first lock; no AI/source/credential changes','Read back both flags and exact cron inactive']},
   {name:'drain',implementation:'drainStateSql plus independent dispatch attestation',requires:'No accepted writer/provider/AI/queued cron request remains active; unresolved outcomes remain recorded.',checks:['Actual old-version last dispatch and original operations/leases','No inference from expired lease, redeploy, Abort or timeout','Opaque producer/Storage lifetime remains unverified; do not enable transfer drain policy']},
   {name:'one-forward-schema-transaction',implementation:'buildInstallSql',requires:'Exact reviewed final gate/evidence, fresh paused history fingerprint and actual no-active-writer/lease/queued-request observations. These observations do not establish old transport hard-lifetime bounds.',checks:['0001–0024 unchanged; 25→26→27→28 and private hashes commit together','Original-field/re-key/inbox proof, immediate FK checks','All readiness false, drain proof false, development scope required']},
   {name:'six-edge-deployments',implementation:'Existing client.request + bundle + eszipOriginalSource',requires:'Keep admission/readiness closed; journal each slug/old version/new source hash/JWT before dispatch.',checks:['Sequential one-shot deploy per exact slug, no automatic write retry','Read ACTIVE metadata, expected verify_jwt and downloaded original-source SHA','Snapshot digest configuration equals downloaded snapshot-url source SHA']},
   {name:'readback-handoff',implementation:'Read-only metadata/source/fingerprint checks',requires:'Independent installed schema/ACL/RLS readback and exact deployment hashes before lifecycle fixture work.',checks:['Unauthorized/origin/version/body/scope denials belong to later HTTP acceptance','No lifecycle scheduler, production ledger, model/provider call, fixture or readiness activation in installer']},
   {name:'final-stop',implementation:'buildStopSql plus lifecycle-owned exact fixture cleanup',requires:'Stop local fixture producers/workers; retain unresolved tickets honestly; complete only exact-manifest cleanup.',checks:['Service/billing admission and four readiness flags closed; exact old billing cron inactive','Never clear restore_blocked, disable scope guard, reset budget or install old D1','Preserve unrelated data/history/source/cron/Vault; record original settings that are no longer safe to restore']},
  ],
  snapshotProducer:{secretName:'SNAPSHOT_PRODUCER_SHA256',value:edges.find(e=>e.slug==='snapshot-url').sha256,
   scope:'Noncredential digest only; an explicit leased development Secret update after exact source readback. Do not fetch/export all Secret values.',operationalDrainEvidence:false},
  unknownOutcomes:{writesRetried:false,recordBeforeDispatch:true,
   schema:['Read pg_stat_activity for the original d2-install UUID before another write','Read every private migration hash/default and exact normalized installed source/ACL/RLS','All absent plus unchanged D1 fingerprints means not installed; all four exact means committed; partial/drift/active/unknown means stop'],
   edge:['Read the original slug metadata/version/JWT and downloaded source once transport recovers','Matching exact desired source proves that replacement only; mismatch/unknown stops before the next slug','Never automatically re-post deploy, rotate secrets, enable admission or restore permissive D1'],
   pauseOrStop:['Read exact admission/default flags and captured job ID/hash/active state','Keep ambiguous work journal entries and admission closed; do not infer outcome from HTTP status']},
  execution:'Default --plan is local-only; --inspect is read-only. --pause/--schema/--edges/--stop require all exact final evidence, --run-plan plus --reviewed-set, D2_INSTALL_WINDOW=development and the actual Root window. --check reads that installed set. --recover only removes the exact unchanged local lock after original PID absence and exact original PostgreSQL transaction absence; no age-based deletion or write replay. Writes never retry. Schema is forward-only.',
  scope:'Local plan construction only; referenced actual preflight and rollback retain their separate evidence scopes. No persistent install/deploy, real fixture/worker/Auth/Storage, production, provider/model, transport retirement or supplier-backup acceptance from this plan.',
  runtime:{node:process.version,os:process.platform,cpu:process.arch,electron:null,sqlite:null,postgresql:null}}
 plan.planSha256=sha256(canonicalJson(plan))
 const directory=`${DEPLOY_DIRECTORY}/plans/${plan.planSha256.slice(0,20)}`;await mkdir(directory,{recursive:true})
 for(const edge of edges){const folder=`${directory}/bundles/${edge.slug}`;await mkdir(folder,{recursive:true});await immutable(`${folder}/index.ts`,edge.source)}
 const path=`${directory}/plan.json`;await immutable(path,JSON.stringify(plan,null,2)+'\n')
 return {plan,path}
}
export async function reviewDeploymentPlan(path,reviewedSet){
 assert(/^output\/tests\/billing\/desktop\/d2-deployment\/plans\/[a-f0-9]+\/plan\.json$/.test(path),'Exact immutable deployment plan required')
 const plan=JSON.parse(await readFile(path,'utf8')),{planSha256,...material}=plan
 assert(plan.version===1&&plan.project===developmentRef&&plan.environment==='development'&&reviewedSet===planSha256&&sha256(canonicalJson(material))===planSha256,'Exact reviewed deployment set required')
 assert(plan.blockers.length===0,'Complete final source/rollback/preflight evidence is required')
 for(const expected of [...plan.inputs.sources,...plan.inputs.dependencies,...Object.values(plan.inputs.evidence).filter(v=>v&&typeof v==='object'&&v.path)]){
  const actual=await record(expected.path);assert(actual.sha256===expected.sha256&&actual.bytes===expected.bytes,'Reviewed deployment source/dependency/evidence drift')
 }
 const evidence=plan.inputs.evidence
 const continuation=plan.continuation?await reviewPausedContinuation(plan.continuation.reference.path):null
 if(continuation)assert(same(continuation.reference,plan.continuation.reference)&&same(continuation.manifest.sources,plan.continuation.sources),'Reviewed paused continuation drift')
 await finalEvidence({integrationManifestPath:evidence.integration.path,sqlPlanPath:evidence.sqlPlan.path,sqlEvidencePath:evidence.sqlEvidence.path,preflightPath:evidence.preflight.path},plan.inputs.migrations)
 const {reviewFinalPlan}=await import('./d2-final-sql-acceptance.mjs'),sql=await reviewFinalPlan(evidence.sqlPlan.path,evidence.sqlSetSha256)
 for(const edge of plan.bundles){const actual=await record(`${dirname(path)}/${edge.path}`);assert(actual.sha256===edge.sha256&&actual.bytes===edge.bytes,'Frozen deployment bundle changed')}
 return {plan,path,continuation,migrations:sql.migrations,sqlEvidence:JSON.parse(await readFile(evidence.sqlEvidence.path,'utf8')),preflight:JSON.parse(await readFile(evidence.preflight.path,'utf8'))}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),mode=args[0]??'--plan',flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
 assert(['--plan','--inspect','--pause','--schema','--edges','--stop','--check','--recover'].includes(mode),'Use --plan, --inspect or an exactly reviewed installation stage')
 if(mode==='--inspect'){
  const {inspectDevelopment}=await import('./d2-deploy-readback.mjs'),result=await inspectDevelopment()
  console.log(JSON.stringify({ok:result.report.ok,readOnly:true,remoteWrites:0,path:result.path,sha256:result.sha256,readRequests:result.report.readRequests,
   historyMode:result.report.historyMode,edges:result.report.observed?.edges,cron:result.report.observed?.cron,error:result.report.error??null}))
  if(!result.report.ok)process.exitCode=1
 }else if(mode==='--plan'){
 const {plan,path}=await createDeploymentPlan({integrationManifestPath:flag('--integration-manifest'),sqlPlanPath:flag('--sql-plan'),sqlEvidencePath:flag('--sql-evidence'),preflightPath:flag('--preflight'),continuationPath:flag('--continuation')})
 console.log(JSON.stringify({ok:true,sourceOnly:true,remoteExecuted:false,networkRequests:0,executionReady:false,status:plan.status,path,planSha256:plan.planSha256,
  sources:plan.inputs.sources.length,dependencies:plan.inputs.dependencies.length,bundles:plan.bundles.map(({slug,sha256,bytes,verifyJwt})=>({slug,sha256,bytes,verifyJwt})),blockers:plan.blockers}))
 }else{
  if(!['--check','--recover'].includes(mode))assert(process.env.D2_INSTALL_WINDOW==='development','Exact Root development mutation window required before credentials')
  const reviewed=await reviewDeploymentPlan(flag('--run-plan'),flag('--reviewed-set'))
  const {executeDeploymentStage}=await import('./d2-deploy-execute.mjs')
  const report=await executeDeploymentStage(mode,reviewed)
  console.log(JSON.stringify({ok:report.ok,stage:report.stage,outcome:report.outcome,readback:report.readback??null,path:report.evidence,error:report.error??null}))
  if(!report.ok)process.exitCode=1
 }
}
