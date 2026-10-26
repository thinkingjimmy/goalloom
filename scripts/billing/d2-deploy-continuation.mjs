/**
 * [INPUT]: Immutable original failed plan, paused journal and independent not-installed/42501 rollback evidence.
 * [OUTPUT]: Hash-bound continuation provenance and original baselines; no credentials, network or old-journal rewrite.
 * [POS]: Explicit bridge to a newly reviewed installer window after a proven not-installed outcome.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {sha256} from '../deploy/schema.mjs'
import {developmentRef} from '../hosted-ai/client.mjs'
const directory='output/tests/billing/desktop/d2-deployment/continuations'
const originalSet='02cedab2dc9026418b2a0600e4deef5950e9dc4629804dfe408efc50bb1f8965'
const window='output/tests/billing/desktop/d2-deployment/windows/02cedab2dc9026418b2a'
const paths={plan:'output/tests/billing/desktop/d2-deployment/plans/02cedab2dc9026418b2a/plan.json',journal:`${window}/journal.json`,
 notInstalled:`${window}/schema-independent-readback-d582159d7cebaeb2a69c3762bdc57fbbcf47b23e70e4d0429c4672af0a41a883.json`,
 lockDiagnostic:`${window}/lock-only-diagnostic-262bc47cc85eb3e4537169e28526aedfb95d9389f3a1105480d36c4b69113867.json`}
const record=async path=>{const bytes=await readFile(path);return{path,sha256:sha256(bytes),bytes:bytes.length}}
async function original(){
 const sources=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,path])=>[key,await record(path)])))
 const values=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,path])=>[key,JSON.parse(await readFile(path,'utf8'))])))
 const {plan,journal,notInstalled:proof,lockDiagnostic:diagnostic}=values,{planSha256,...material}=plan
 assert(sources.notInstalled.sha256==='d582159d7cebaeb2a69c3762bdc57fbbcf47b23e70e4d0429c4672af0a41a883'&&sources.lockDiagnostic.sha256==='262bc47cc85eb3e4537169e28526aedfb95d9389f3a1105480d36c4b69113867','Original reviewed diagnostic bytes changed')
 assert(planSha256===originalSet&&sha256(canonicalJson(material))===originalSet,'Original immutable plan checksum changed')
 assert(journal.project===developmentRef&&journal.planSha256===originalSet&&journal.pausedState&&journal.originalState&&journal.originalFields,'Original paused baseline required')
 assert(journal.operations.length===2&&journal.operations[0].kind==='pause'&&['verified','confirmed_by_readback'].includes(journal.operations[0].outcome)&&journal.operations[1].kind==='schema'&&journal.operations[1].outcome==='unknown','Exact original failed operation journal required')
 assert(journal.pausedState.admission.service_enabled===false&&journal.pausedState.admission.billing_enabled===false&&journal.pausedState.cron.find(j=>j.jobname==='goalloom-billing-worker-development')?.active===false,'Original pause is not closed')
 assert(proof.project===developmentRef&&proof.readOnly&&proof.remoteWrites===0&&proof.originalApplicationName===journal.installApplicationName&&proof.activeOriginalTransactions===0&&Object.values(proof.d2Markers).every(v=>v===false)&&proof.originalHistoryMatched&&proof.originalFieldsMatched&&proof.logicalCatalogMatched&&proof.d1SchemaMatched,'Independent not-installed proof missing')
 assert(diagnostic.rollbackVerified&&diagnostic.originalApplicationName===journal.installApplicationName&&diagnostic.active.original_active===0&&diagnostic.logicalCatalogMatched&&diagnostic.stableBusinessMatched&&diagnostic.d2Absent&&diagnostic.originalHistoryMatched&&diagnostic.paused&&diagnostic.result.state==='42501'&&diagnostic.result.target==='auth.schema_migrations','Exact permission failure rollback proof missing')
 return{sources,...values}
}
export async function createPausedContinuation(){
 const value=await original(),manifest={version:1,project:developmentRef,sourceOnly:true,remoteExecuted:false,originalSet,sources:value.sources,
  originalApplicationName:value.journal.installApplicationName,scope:'One new reviewed candidate from the original unchanged paused D1 baseline. Old unknown schema operation and all original evidence remain immutable; no pause replay or activation.'}
 manifest.sha256=sha256(canonicalJson(manifest));await mkdir(directory,{recursive:true,mode:0o700})
 const path=`${directory}/${manifest.sha256}.json`,bytes=JSON.stringify(manifest,null,2)+'\n'
 try{await writeFile(path,bytes,{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST')throw error;assert((await readFile(path,'utf8'))===bytes,'Immutable continuation changed')}
 return{manifest,path,reference:await record(path)}
}
export async function reviewPausedContinuation(path){
 assert(new RegExp(`^${directory}/[a-f0-9]{64}\\.json$`).test(path),'Exact immutable paused continuation required')
 const manifest=JSON.parse(await readFile(path,'utf8')),{sha256:expected,...material}=manifest
 assert(manifest.version===1&&manifest.project===developmentRef&&expected===sha256(canonicalJson(material))&&manifest.originalSet===originalSet,'Continuation checksum mismatch')
 const value=await original();assert(canonicalJson(value.sources)===canonicalJson(manifest.sources),'Original continuation evidence changed')
 return{manifest,reference:await record(path),journal:value.journal}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 assert(process.argv.length===2||process.argv[2]==='--plan','Only local --plan is available')
 const result=await createPausedContinuation();console.log(JSON.stringify({sourceOnly:true,remoteExecuted:false,path:result.path,sha256:result.reference.sha256,originalSet}))
}
