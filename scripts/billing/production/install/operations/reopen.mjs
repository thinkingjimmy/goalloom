/**
 * [INPUT]: Existing read-only production client, accepted recovery evidence and original-key private custody.
 * [OUTPUT]: Immutable continuous-recovery SQL package with exact source/evidence hashes; no apply mode.
 * [POS]: BILL-29 local preparation. Authorization, client compatibility and actual steady-state acceptance stay with the parent.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {readFile,mkdir,realpath,writeFile,lstat} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {ROOT,REF,hash,json,inputs} from '../source.mjs'
import {client} from '../client.mjs'
import {save,readJson,privateEnv} from '../io.mjs'
import {inspect,assess} from './recovery.mjs'
import {reopenSql} from './reopen-sql.mjs'

export const OUTPUT=resolve(ROOT,'output/tests/billing/desktop/bill29-reopen/backend')
const paths=['reopen.mjs','reopen-sql.mjs','reopen-failure-cases.md','README.md'].map(x=>'scripts/billing/production/install/operations/'+x)
const accepted={
 ledger:'output/tests/billing/desktop/bill29-execution/cloudflare-deployment/deployment-result.json',
 restore:'output/tests/billing/desktop/bill29-execution/recovery/roundtrip-5d9faac6-bf07-4e1a-b52b-18c73ad6b501/result.json',
 custody:'output/tests/billing/desktop/bill29-execution/lifecycle-key-custody-result-ace26406-2954-4cca-8fcc-c188cf7147cc.json',
 installation:'output/tests/billing/desktop/bill29-execution/maintenance-v1/closed-installation-result.json',
 workers:'output/tests/billing/desktop/bill29-continuation/backend/window-live-v3/root-closeout-summary.json',
 provider:'output/tests/billing/desktop/bill29-continuation/backend/window-rc-test-v1/closeout-summary.json',
 scope:'output/tests/billing/desktop/bill29-execution/lifecycle-handoff.md',
}
async function sources(){return Promise.all(paths.map(async path=>({path,sha256:hash(await readFile(resolve(ROOT,path)))})))}
async function evidence(){
 const result={}
 for(const [name,path] of Object.entries(accepted)){
  const bytes=await readFile(resolve(ROOT,path));result[name]={path,sha256:hash(bytes)}
  if(name==='scope')continue
  const data=JSON.parse(bytes)
  if(['ledger','restore','custody','workers','provider'].includes(name)&&data.ok!==true)throw Error('accepted_evidence_changed')
  if(name==='restore'&&(data.cases.length!==6||data.cases.some(c=>!c.ok)||data.exposureAllowed!==false))throw Error('accepted_evidence_changed')
  if(name==='installation'&&(!data.finalClosed||!data.finalProtectedStateMatched||!data.productRetentionSkipped))throw Error('accepted_evidence_changed')
  if(name==='workers'&&(data.workerResponses?.length!==8||data.workerResponses.some(r=>r.httpStatus!==200||r.outcome!=='complete')||Object.values(data.checks).some(v=>v!==true)))throw Error('accepted_evidence_changed')
  if(name==='provider'&&(data.providerHttpStatus!==200||!data.providerResponse?.received||!data.checks?.oneMatchedIgnoredTest||!data.checks?.stripeStillDisabled))throw Error('accepted_evidence_changed')
  for(const [source,expected] of Object.entries(data.sourceHashes??{}))if(hash(await readFile(resolve(ROOT,source)))!==expected)throw Error('accepted_source_changed')
 }
 return result
}
export const detailSql=`begin read only;select jsonb_build_object('ai',(select to_jsonb(b) from public.ai_budget b where id='integration-shared'),
 'workspaces',(select coalesce(jsonb_agg(jsonb_build_object('workspaceHash',encode(sha256(convert_to(w.workspace_id::text,'UTF8')),'hex'),
 'state',w.state,'reason',w.reason,'boundaryVerified',w.boundary_verified,'profileVerified',w.profile_verified,'retrieveUntil',w.retrieve_until,
 'accessEndedAt',w.access_ended_at,'nextDueAt',w.next_due_at,'seedRequired',w.seed_required,'originalPresent',p.id is not null)),'[]'::jsonb)
 from service_private.workspace_lifecycle w left join public.workspaces p on p.id=w.workspace_id and p.generation=w.generation where w.environment='production'),
 'lifecycleRowsHash',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(w) order by workspace_id),'[]'::jsonb)::text,'UTF8')),'hex') from service_private.workspace_lifecycle w),
 'initializations',jsonb_build_object('total',(select count(*) from service_private.initializations),'incomplete',(select count(*) from service_private.initializations where completed_at is null)),
 'policySourceBefore',public.billing_source('production')) as details;commit;`
export async function inspectReopening(db){
 const recovery=await inspect(db),details=(await db.query(detailSql,false))[0]?.details
 if(!details?.ai||details.policySourceBefore!==null)throw Error('closed_details_changed')
 // Compare the original key privately. Never copy key bytes or config into the inspection.
 const key=await privateEnv(resolve(ROOT,'.env.lifecycle-recovery.production.local'))
 if(key.SUPABASE_PROJECT_REF!==REF||key.SUPABASE_ENVIRONMENT!=='production'||!/^[a-f0-9]{64}$/.test(key.LIFECYCLE_IDENTITY_KEY_HEX??'')
  ||hash(Buffer.from(key.LIFECYCLE_IDENTITY_KEY_HEX,'hex'))!==recovery.state.lifecycleKeyDigest
  ||key.LIFECYCLE_IDENTITY_KEY_SHA256!==recovery.state.lifecycleKeyDigest)throw Error('original_key_custody_mismatch')
 const report={version:1,kind:'goalloom-continuous-recovery-inspection',at:new Date().toISOString(),recovery,details,
  source:await sources(),evidence:await evidence(),keyCustodyMatched:true,readOnly:true,productionWrites:0}
 if(key.DELETION_LEDGER_STORE_ID!==(await readJson(resolve(ROOT,accepted.ledger))).production.storeId)throw Error('original_key_custody_mismatch')
 report.sha256=hash(json(report));return report
}
export async function prepareReopening(path,output){
 const inspection=await readJson(resolve(path)),{sha256,...body}=inspection
 if(inspection.kind!=='goalloom-continuous-recovery-inspection'||hash(json(body))!==sha256)throw Error('inspection_changed')
 if(json(inspection.source)!==json(await sources())||json(inspection.evidence)!==json(await evidence()))throw Error('source_or_evidence_changed')
 const {sha256:recoveryHash,...recoveryBody}=inspection.recovery
 if(hash(json(recoveryBody))!==recoveryHash)throw Error('inspection_changed')
 const current=await inputs(),manifest=inspection.recovery.manifest
 if(json(manifest.fingerprints)!==json(current.fingerprints)
  ||json(manifest.migrations)!==json(current.migrations.map(({version,name,sha256})=>({version,name,sha256})))
  ||json(manifest.edges)!==json(current.edges.map(({slug,sha256,verifyJwt})=>({slug,sha256,verifyJwt}))))throw Error('source_or_evidence_changed')
 for(const {path,sha256} of manifest.continuation)if(hash(await readFile(resolve(ROOT,path)))!==sha256)throw Error('source_or_evidence_changed')
 const blockers=assess(inspection.recovery)
 if(blockers.length)throw Object.assign(Error('reopening_blocked'),{blockers})
 if(!inspection.keyCustodyMatched||inspection.details.ai.policy!=='authenticated'||inspection.details.ai.environment!=='production')throw Error('baseline_policy_changed')
 output=resolve(output)
 if(dirname(output)!==OUTPUT||!/^[-a-zA-Z0-9_.]+$/.test(output.slice(OUTPUT.length+1)))throw Error('invalid_evidence_directory')
 await mkdir(OUTPUT,{recursive:true,mode:0o700})
 if(await realpath(OUTPUT)!==OUTPUT||(await lstat(OUTPUT)).isSymbolicLink())throw Error('invalid_evidence_directory')
 await mkdir(output,{mode:0o700})
 const id=randomUUID(),sql=reopenSql(inspection.recovery,id)
 const matrix={
  enabled:{evidence:['installation','workers'],scope:'Installed exact lifecycle admission/worker wiring; actual empty worker HTTP200. This does not prove deletion of original content.'},
  independent_ledger_ready:{evidence:['ledger','custody'],scope:'Independent production store identity, separate acceptance namespace protocol and privately matched original key.'},
  restore_admission_ready:{evidence:['restore','scope','custody'],scope:'Only permanently network-isolated local PostgreSQL logical dump/load and deletion replay. No hosted restore, export or cutover is supported.'},
  cleanup_wiring_ready:{evidence:['installation','workers'],scope:'Exact0025–0033 code, bounded lifecycle worker/observer and accepted D2 behavior. Worker200 had zero business work; no production physical deletion is asserted.'},
 }
 const plan={version:1,kind:'goalloom-continuous-recovery-plan',id,at:new Date().toISOString(),project:REF,inspectionSha256:sha256,
  source:inspection.source,evidence:inspection.evidence,readiness:matrix,
  stages:['billing.sql','service.sql'],sql:Object.fromEntries(Object.entries(sql).map(([name,text])=>[name,{file:name+'.sql',sha256:hash(text)}])),
  exposure:{billing:'Persistent authenticated Billing status/trial/Checkout/Portal/subscription APIs and exact three minute jobs; public website purchase gates are separate.',
   service:'Version2 ordinary cloud eligibility plus all four lifecycle flags. Existing workers may perform actual lifecycle cleanup/ledger export/Auth deletion on eligible future work; the observer can run retention cleanup.',
   ai:'The service transaction changes only production integration-shared policy from authenticated to trial_or_paid. Version1 and bound service/trial/paid eligibility become required; identity, platform/account protections, all amounts/blocked state, fee/budget/rate/concurrency checks remain. Closure retains trial_or_paid and closed service then refuses new AI admission.'},
  aiBudget:{before:inspection.details.ai,after:{...inspection.details.ai,policy:'trial_or_paid'},closeRetains:'trial_or_paid'},
  originalWorkspace:{rows:inspection.details.workspaces,changed:false,handoffPathBase:'plan-directory',compatibleClientHandoff:'../../macos/client-handoff.md',
   limitation:'The preserved retained row has no ordinary_expiry reason, retrieval dates or verified boundary. Global reopening/trial cannot activate or retrieve it; automatic bootstrap refuses it. The distinct explicit create_new_workspace transaction can create a supported new cloud copy from current local data while retaining the old generation when no incomplete initialization exists. The signed candidate UI entry is limited for this legacy case; creating a new copy is not restoring its old boundary.',
   initializations:inspection.details.initializations,clientSource:'../../macos/early-findings.md'},
  execution:{authorized:false,freshInspectionRequired:true,expiresAt:new Date(Date.parse(inspection.recovery.state.serverNow)+5*60_000).toISOString(),
   soleCronWriter:true,noAutomaticReplay:true,intent:'Parent records one immutable SQL-hash intent for each stage before POST. Resolve uncertain outcomes using operationActive, exact policies/jobs and dispatch IDs; never replay a successful or uncertain stage.',
   close:'close.sql is available after either stage. It closes owned gates/pauses jobs without erasing business outcomes; active accepted requests can still finish. Resolve actual responses with read.sql. Preserve foreign drift and restore barriers.'},
  steadyState:'Use the existing --health and read.sql. Confirm recurring actual200/finite counters, no growing queue/leases/deadline risk and fresh observer; accepted historical short-window200 is not continuous acceptance. On failure/outage use exact close.sql, inspect all original request IDs, retain unknown outcomes.',
  decisions:['Parent scopes and authorizes persistent Billing/service/cleanup exposure with the already directed trial_or_paid rule, and accepts the owner-scoped original-account limitation or its concrete compatible-client resolution.',
   'Provider owner activates the two already authorized exact Stripe endpoints only after continuous receiver readiness; public sale/regions/release remain separate.'],
  legacy:'No historical JWT/URL specimen gate. No physical upload completion inferred from elapsed time. Existing dispatched/unknown transfer failure-closed rules remain.',
  productionWrites:0,activationExecuted:false,launchReady:false}
 plan.sha256=hash(json(plan));await save(resolve(output,'plan.json'),plan);await save(resolve(output,'inspection.json'),inspection)
 for(const [name,text] of Object.entries(sql))await writeFile(resolve(output,name+'.sql'),text,{mode:0o600,flag:'wx'})
 return {ok:true,directory:output,planSha256:plan.sha256,productionWrites:0,activationExecuted:false}
}
async function main(){
 try{
  const args=process.argv.slice(2)
  if(args.length===0||args.length===1&&args[0]==='--help'){console.log('Continuous recovery preparation: --inspect | --plan <inspection.json> --output <new-directory>. No apply mode.');return}
  if(args.length===1&&args[0]==='--inspect'){
   const report=await inspectReopening(await client());await mkdir(OUTPUT,{recursive:true,mode:0o700});if(await realpath(OUTPUT)!==OUTPUT)throw Error('invalid_evidence_directory')
   const path=resolve(OUTPUT,`inspection-${randomUUID()}.json`);await save(path,report)
   console.log(JSON.stringify({ok:true,path,sha256:report.sha256,blockers:assess(report.recovery),readOnly:true,productionWrites:0}));return
  }
  if(args.length!==4||args[0]!=='--plan'||args[2]!=='--output')throw Error('invalid_arguments')
  console.log(JSON.stringify(await prepareReopening(args[1],args[3])))
 }catch(error){const codes=['invalid_arguments','invalid_evidence_directory','production_identity','management_transport','management_http','migration_history_changed','accepted_evidence_changed','accepted_source_changed','closed_details_changed','original_key_custody_mismatch','inspection_changed','source_or_evidence_changed','reopening_blocked','baseline_policy_changed'];console.log(JSON.stringify({ok:false,code:codes.includes(error.message)?error.message:error.code==='EEXIST'?'evidence_exists':'reopening_preparation_failed',...(error.blockers?{blockers:error.blockers}:{}),productionWrites:0}));process.exitCode=1}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main()
