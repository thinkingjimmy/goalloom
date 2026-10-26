/**
 * [INPUT]: Existing owner-only fixed-development Management credential and frozen local D1 source evidence.
 * [OUTPUT]: Immutable hash/metadata-only preflight with exact history, old Edge and scheduler observations.
 * [POS]: D2 installation readback seam. No SQL write, Secret read, fixture or provider action.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {client,developmentRef} from '../hosted-ai/client.mjs'
import {migrationManifest,sha256} from '../deploy/schema.mjs'
import {d1Migrations,d1Snapshot} from './d1-schema.mjs'
import {collectDeploymentState,EDGE_MODES,BILLING_JOB} from './d2-deploy-state.mjs'
const same=(a,b)=>canonicalJson(a)===canonicalJson(b)
const bytesRecord=async path=>{const bytes=await readFile(path);return {path,sha256:sha256(bytes),bytes:bytes.length}}
export async function inspectDevelopment(){
 const directory='output/tests/billing/desktop/d2-deployment/preflights',attempt=randomUUID()
 await mkdir(directory,{recursive:true})
 const report={version:1,ok:false,project:developmentRef,readOnly:true,remoteObserved:true,remoteWrites:0,attempt,readRequests:0,
  scope:'Actual fixed-development metadata and aggregate/hash fingerprints only; no user bodies, decrypted Vault, Secret values, provider/Auth/Storage mutations or deployment.',startedAt:new Date().toISOString()}
 const attemptPath=`${directory}/attempt-${attempt}.json`
 await writeFile(attemptPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
 try{
  const legacy=(await migrationManifest()).filter(m=>m.version<'0025'),baselinePath='output/tests/billing/desktop/d1-backend/sql-acceptance.json'
  const baseline=JSON.parse(await readFile(baselinePath,'utf8'));assert(baseline.ok&&baseline.reviewedSchema,'Accepted D1 baseline required')
  report.inputs={baseline:await bytesRecord(baselinePath),immutableD1:legacy.map(({file,version,sha256})=>({file,version,sha256})),
   harness:await Promise.all(['scripts/billing/d2-deploy-readback.mjs','scripts/billing/d2-deploy-state.mjs','scripts/billing/d2-populated-gate.mjs','scripts/billing/d1-schema.mjs','scripts/hosted-ai/client.mjs','scripts/deploy/transport.mjs'].map(bytesRecord))}
  const connected=await client(),db={query:(sql,readOnly=true)=>{assert(readOnly===true,'Read-only preflight cannot execute SQL writes');report.readRequests++;return connected.query(sql,true)},
   request:(path,options={})=>{assert((options.method??'GET')==='GET'&&(/^\/functions$/.test(path)||EDGE_MODES.some(e=>path===`/functions/${e.slug}/body`)),'Read-only preflight permits Edge metadata/source only');report.readRequests++;return connected.request(path,options)}}
  const state=await collectDeploymentState(db);report.observed=state
  assert(Object.values(state.markers).every(v=>v===false),'D2 or partial D2 already exists')
  const history=await d1Migrations(db);assert(history.every(m=>m.installed),'Complete installed D1 private prefix required')
  assert(same(history.map(({file,sha256})=>({file,sha256})),baseline.migrations.map(({file,sha256})=>({file,sha256}))),'D1 private history differs from accepted source')
  assert(same(await d1Snapshot(db),baseline.reviewedSchema),'D1 source/config/ACL/RLS schema drift')
  for(let i=0;i<state.coreHistory.length;i++){
   const row=state.coreHistory[i],expected=legacy[i]
   assert(expected&&row.version===expected.version&&row.name===expected.name&&row.sha256===expected.sha256,'Recorded early migration prefix/source drift')
  }
  assert(state.coreHistory.length<=17,'Unexpected core history overlaps private D1 history')
  const job=state.cron.filter(job=>job.jobname===BILLING_JOB);assert(job.length===1,'Exact one development billing job required')
  for(const edge of EDGE_MODES.slice(0,3)){
   const observed=state.edges.find(e=>e.slug===edge.slug);assert(observed?.present&&observed.status==='ACTIVE'&&observed.verifyJwt===edge.verifyJwt,'Existing Edge metadata/JWT mismatch')
  }
  assert(state.edges.filter(e=>e.present).length===3,'Unexpected preinstalled D2 Edge requires separate review')
  assert(Object.values(state.business).every(v=>v.capped===false)&&Object.values(state.catalog).every(v=>v.capped===false),'Fingerprint row cap exceeded')
  const after=(await migrationManifest()).filter(m=>m.version<'0025')
  assert(same(after.map(({version,file,sha256})=>({version,file,sha256})),report.inputs.immutableD1),'D1 source changed during inspection')
  for(const entry of report.inputs.harness)assert((await bytesRecord(entry.path)).sha256===entry.sha256,'Preflight harness changed during inspection')
  report.d1SchemaMatched=true;report.d1PrivateHistoryMatched=true
  report.historyMode=state.coreHistoryPresent?'Recorded core prefix plus accepted standalone source/schema attestation for its unrecorded suffix':'Existing development standalone source/schema attestation; no fabricated early history'
  report.unrecordedEarlyVersions=legacy.filter(m=>m.version<'0018'&&!state.coreHistory.some(h=>h.version===m.version)).map(m=>m.version)
  report.readyToPause=false;report.remainingGates=['Final successful exact four-migration rollback','Independent old-dispatch drain proof','Root-reviewed exact mutation window']
  report.ok=true
 }catch(error){report.error={type:error?.name==='AssertionError'?'guard_failed':'preflight_incomplete',
  reason:error?.name==='AssertionError'?error.message:/^Management (?:GET|POST) \/[\w/?=-]+: HTTP \d+$/.test(error?.message??'')?error.message:'read_only_observation_failed',
  location:error?.stack?.match(/d2-deploy-(?:readback|state)\.mjs:\d+:\d+/)?.[0]??null}}
 report.finishedAt=new Date().toISOString()
 const bytes=JSON.stringify(report,null,2)+'\n',path=`${directory}/${sha256(bytes)}.json`
 await writeFile(path,bytes,{flag:'wx',mode:0o600});await writeFile(attemptPath,bytes,{mode:0o600})
 return {report,path,sha256:sha256(bytes)}
}
