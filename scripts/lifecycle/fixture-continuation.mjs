/**
 * [INPUT]: Original19ff983 plan, exact four-source child lineage, immutable attempt evidence and protected identity.
 * [OUTPUT]: Credential-free child-plan provenance validation shared by fixture execution and final closure.
 * [POS]: Development-only original integration lineage; no CLI, credential loading, network or mutation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalJson } from '../../packages/contracts/src/canonical.ts'
import { sha,journalDigest,verifySources } from './fixture-support.mjs'
const material=plan=>{const {reviewedSetSha256,...body}=plan;return body}
async function readBound(reference){
 assert(reference?.path&&/^[a-f0-9]{64}$/.test(reference.sha256),'Complete immutable integration evidence reference required')
 const bytes=await readFile(reference.path);assert.equal(sha(bytes),reference.sha256,'Original integration evidence changed')
 if(reference.bytes!==undefined)assert.equal(bytes.length,reference.bytes)
 return JSON.parse(bytes.toString('utf8'))
}
export const integrationRoot={reviewedSet:'19ff98327f3e3168f76009f724d9eef2e0db016c1a6019eaef8df430e16d09e7',attempt:'8e1a87bd-de76-474b-a289-01512ac233f4',identityDigest:'54cc8605addb8b61a46336680a6f14345e69701a91bfbe317e94ace4060b350e',lease:'a0d1167d-94f2-40a5-93d1-76447f2b072e'}
export const suffixStages=['integration-continuation','cleanup-races','exercise','worker-unavailable','worker-terminal','verify','restore-fixture','cleanup','recover']
export const suffixSources=['scripts/lifecycle/development-fixtures.mjs','scripts/lifecycle/fixture-integration.mjs','scripts/billing/d2-owned-retrieval.mjs','scripts/lifecycle/fixture-continuation.mjs'].map(file=>resolve(file))
export async function checkIntegrationChild(plan,{journal,lease,select=false}={}){
 assert.equal(sha(canonicalJson(material(plan))),plan.reviewedSetSha256,'Integration child digest changed');await verifySources(plan)
 const c=plan.integrationContinuation;assert(c?.kind==='original19ff983-integration-suffix'&&c.version===1,'Explicit original integration child plan required')
 for(const key of Object.keys(integrationRoot))assert.equal(c[key],integrationRoot[key],'Original suffix authority changed')
 assert.equal(lease,c.lease,'Original suffix lease required')
 const parent=await readBound(c.parentPlan);assert.equal(parent.reviewedSetSha256,integrationRoot.reviewedSet);assert.equal(sha(canonicalJson(material(parent))),parent.reviewedSetSha256)
 assert(!parent.integrationContinuation&&!parent.cleanupContinuation&&!parent.resumeContinuation,'Original fresh parent required')
 for(const key of Object.keys(parent).filter(key=>!['sources','integrationAdapter','stages','reviewedSetSha256'].includes(key)))assert.equal(canonicalJson(plan[key]),canonicalJson(parent[key]),'Suffix child changed original runtime, identity or installation contract')
 assert.equal(canonicalJson(plan.stages),canonicalJson(suffixStages));assert.equal(canonicalJson(c.allowedStages),canonicalJson(suffixStages))
 assert(plan.sources.length===parent.sources.length+1&&c.changedInputs.length===4,'Original closure plus one reviewed helper required')
 for(const input of parent.sources){
  const actual=plan.sources.find(value=>value.path===input.path);assert(actual,'Original dependency closure changed')
  const changed=c.changedInputs.find(change=>change.path===input.path)
  if(changed)assert(suffixSources.includes(input.path)&&changed.beforeSha256===input.sha256&&changed.sha256!==input.sha256&&changed.sha256===actual.sha256,'Unreviewed integration source delta')
  else assert.equal(actual.sha256,input.sha256,'Non-suffix source changed')
 }
 assert(new Set(c.changedInputs.map(change=>change.path)).size===4&&suffixSources.every(path=>c.changedInputs.some(change=>change.path===path)),'Exact suffix source set required')
 const added=plan.sources.filter(input=>!parent.sources.some(original=>original.path===input.path)),newHelper=resolve('scripts/lifecycle/fixture-continuation.mjs')
 assert(added.length===1&&added[0].path===newHelper&&c.changedInputs.some(input=>input.path===newHelper&&input.beforeSha256===null&&input.sha256===added[0].sha256),'Only the reviewed lineage helper may join the closure')
 assert(plan.integrationAdapter.path===parent.integrationAdapter.path&&plan.integrationAdapter.sha256===plan.sources.find(input=>input.path===plan.integrationAdapter.path)?.sha256,'Original adapter path and reviewed source required')
 const boundary=await readBound(c.acceptedBoundary)
 assert(boundary.project===plan.project&&boundary.reviewedSet===parent.reviewedSetSha256&&boundary.identityDigest===plan.identityDigest&&boundary.runId===c.runId,'Original accepted boundary changed')
 assert.equal(canonicalJson(c.acceptedCaseIds),canonicalJson(boundary.completedCases.map(entry=>entry.id)),'Accepted original prefix differs from saved boundary')
 assert.equal(canonicalJson(c.acceptedIntegration.sdk),canonicalJson(boundary.sdk),'Original SDK record differs from saved boundary')
 for(const entry of boundary.completedCases)assert.equal(canonicalJson(c.acceptedIntegration[`race:${entry.id}`]),canonicalJson(entry.originalRecord),'Original race record differs from saved boundary')
 assert.equal(canonicalJson(c.acceptedContinuations),canonicalJson(boundary.acceptedContinuations??[]),'Original continuation history differs from saved boundary')
 assert.equal(canonicalJson(c.workScope),canonicalJson(Object.fromEntries(['id','expiresAt','manifest'].map(key=>[key,boundary.scopes.work[key]]))),'Original work interval differs from saved boundary')
 const reports=[]
 for(const reference of [...c.failures,...c.cleanups]){
  const report=await readBound(reference);assert(resolve(reference.path).startsWith(parent.directory+'/'),'Original evidence directory required')
  assert(report.project===parent.project&&report.identityDigest===parent.identityDigest&&report.finalStopHandoff?.verified&&report.finalStopHandoff.originalTransactionsAbsent,'Joined original evidence required')
  const originalPlan=await readBound(report.fixturePlan);assert.equal(sha(canonicalJson(material(originalPlan))),report.reviewedSet)
  assert(originalPlan.identityDigest===parent.identityDigest&&originalPlan.privatePath===parent.privatePath&&originalPlan.runtime.sha256===parent.runtime.sha256,'Evidence belongs to another fixture')
  assert(originalPlan.reviewedSetSha256===parent.reviewedSetSha256||originalPlan.integrationContinuation?.parentPlan.sha256===c.parentPlan.sha256,'Evidence has another integration lineage')
  reports.push(report)
 }
 assert(c.failures.length&&c.cleanups.length,'Original failure and completed cleanup evidence required')
 assert(reports.slice(0,c.failures.length).every(report=>report.ok===false&&['integration','integration-continuation','cleanup-races'].includes(report.mode)),'Original failed attempts required')
 assert(reports.some(report=>report.attempt===c.attempt&&report.mode==='integration'&&report.reviewedSet===c.reviewedSet&&report.ok===false),'Original8e1a failed integration required')
 assert(reports.slice(c.failures.length).every(report=>report.ok===true&&report.mode==='cleanup-races'&&report.result?.allAttemptedCasesCleaned===true),'Actual completed original race cleanup required')
 for(const entry of c.acceptedContinuations)assert(reports.some(report=>report.mode==='integration-continuation'&&`d2-install:${report.attempt}`===entry.intent.applicationName&&report.ok===false),'Original continuation attempt report missing')
 const applications=[...new Set(reports.flatMap(report=>[`d2-install:${report.attempt}`,...report.finalStopHandoff.originalApplications]))]
 assert.equal(canonicalJson(c.originalApplications),canonicalJson(applications),'Original transaction proof set changed')
 if(c.readOnlyNoProgressResume){const proof=await readBound(c.readOnlyNoProgressEvidence);assert(proof.readOnly===true&&proof.remoteWrites===0&&proof.businessDispatchAbsent===true&&proof.originalAttempt===c.acceptedContinuations.at(-1)?.intent.applicationName&&canonicalJson(proof.acceptedCaseIds)===canonicalJson(c.acceptedCaseIds),'Explicit original no-progress read-only proof required')}
 if(journal){
  assert.equal(journalDigest(journal),parent.identityDigest);assert.equal(journal.runId,c.runId)
  if(select){const adapter=await import(pathToFileURL(plan.integrationAdapter.path).href);assert.equal(typeof adapter.assertOriginalIntegrationSuffix,'function');adapter.assertOriginalIntegrationSuffix({context:{journal,scope:'work',lease},continuation:c})}
 }
 return{parent,reports}
}
