/**
 * [INPUT]: Original lifecycle-owned fixture material, scoped database port and bundled production retrieval client.
 * [OUTPUT]: Live SDK/races, one owned race entry point, finite diagnostics and explicitly selected fresh remaining cases.
 * [POS]: Thin D2 fixture adapter. It never provisions identities, changes readiness or repeats unresolved requests.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {developmentRef,developmentUrl} from '../hosted-ai/client.mjs'
import {literal as q} from './d1-sync-fixtures.mjs'
import {RACE_CASES,buildRetrievalRace,observeRaceLock} from './d2-retrieval-concurrency.mjs'
const same=(a,b)=>canonicalJson(a)===canonicalJson(b)
const namesFor=f=>['setup','holder','waiter'].map(kind=>`d2-race-${kind}:${f.user}`)
async function inactive(db,names){
 const rows=await db.query(`select count(*) as n from pg_stat_activity where application_name in(${names.map(q).join(',')}) and state<>'idle'`)
 assert(Number(rows[0]?.n)===0,'Original race transaction remains active; retain its fixture')
 return true
}
async function snapshot(db,builder){const rows=await db.query(builder.snapshotSql);assert(rows[0]?.state,'Race snapshot missing');return rows[0].state}
function verifyRace(scenario,f,before,after,result){
 assert(result?.error===scenario.error,'Concurrent retrieval did not return its exact expected denial')
 assert(result.ok!==true&&!Object.hasOwn(result,'operations')&&!Object.hasOwn(result,'capability'),'Denied retrieval returned data or authority')
 assert(same(before.ops,after.ops)&&same(before.receipts,after.receipts),'Race changed original operations or receipts')
 assert(before.workspace&&after.workspace&&before.lifecycle&&after.lifecycle,'Original race target disappeared')
 for(const field of ['headSeq','rosterVersion','keyEpoch'])assert(before.workspace[field]===after.workspace[field],'Race changed unrelated workspace metadata')
 for(const field of ['builds','challenges'])assert(Number(after[field])===Number(before[field]),'Denied retrieval created authority')
 const grant=scenario.transition==='authorize-once'?1:0
 for(const field of ['consumed','capabilities'])assert(Number(after[field])===Number(before[field])+grant,'Race authority count differs from its exact transition')
 const a=after.lifecycle,b=before.lifecycle
 assert(a.generation===(scenario.transition==='generation'?f.finalOp:b.generation),'Unexpected lifecycle generation')
 assert(after.workspace.generation===(scenario.transition==='generation'?f.finalOp:before.workspace.generation),'Unexpected workspace generation')
 switch(scenario.transition){
  case 'cutoff':assert(a.state==='queued'&&a.closedAt===b.retrieveUntil&&a.retrieveUntil===b.retrieveUntil,'Cutoff boundary did not close');break
  case 'restoration':assert(a.state==='active'&&Number(after.ordinaryCancelled)===Number(before.ordinaryCancelled)+1,'Restoration did not cancel ordinary deletion');break
  case 'explicit-delete':assert(a.state==='queued'&&a.reason==='explicit_cloud','Explicit deletion boundary did not close');break
  case 'generation':case 'revision':assert(Number(a.revision)===Number(b.revision)+1,'Lifecycle revision did not advance once');break
  default:assert(same(a,b),'Identity/authorization race changed lifecycle metadata')
 }
 if(scenario.transition!=='restoration')assert(Number(after.ordinaryCancelled)===Number(before.ordinaryCancelled),'Unrelated ordinary deletion cancellation')
 return{ok:true,error:scenario.error,operationsUnchanged:true,receiptsUnchanged:true,authorityDelta:grant,boundaryVerified:true}
}
export function raceRequestFailure(error){
 const diagnostic=error?.requestDiagnostic
 const declaredState=error?.sqlState??error?.sqlstate??(typeof error?.severity==='string'&&['ERROR','FATAL','PANIC'].includes(error.severity)?error.code:null)
 const sqlState=typeof declaredState==='string'&&/^[A-Z0-9]{5}$/.test(declaredState)?declaredState:null
 const wrappedStatus=typeof error?.message==='string'?/^Management POST \/database\/query: HTTP ([1-5][0-9]{2})$/.exec(error.message):null
 const actualStatus=diagnostic?.status??error?.status??(wrappedStatus?Number(wrappedStatus[1]):null)
 const httpStatus=Number.isInteger(actualStatus)&&actualStatus>=100&&actualStatus<=599?actualStatus:null
 const errorClass=['Error','TypeError','AssertionError','AbortError','TimeoutError'].includes(error?.name)?error.name:'unknown'
 const kind=sqlState?'sql_error':httpStatus?'http_error':errorClass==='TimeoutError'?'timeout':errorClass==='AbortError'?'aborted':diagnostic?.kind==='transport_failure'?'transport_error':'unknown'
 return{kind,errorClass,httpStatus,sqlState}
}
export {race as runOwnedRaceCase}
async function race({context,material,record,scenario}){
 const key=`race:${scenario.id}`,prior=context.journal.integration?.[key]
 assert(!prior,'Original race dispatch exists; inspect its outcome before another integration attempt')
 const planned=context.journal.races.find(entry=>entry.id===scenario.id)
 assert(planned?.fixture?.ownerId,'Original preplanned race identity required')
 const names=namesFor({user:planned.fixture.ownerId})
 let db=context.db
 const holderName=names[1],waiterName=names[2]
 const intent={state:'dispatch_intent',holderName,waiterName,settled:false}
 const observed={},requests={holder:{state:'not_dispatched'},waiter:{state:'not_dispatched'}}
 const observation=()=>({...observed,requests:structuredClone(requests)})
 let holder,waiter,settled=false,absent=false,failure,result
 try{
  await record(key,intent)
  const owned=await material.acquireRaceCase(scenario)
  assert(owned.setupOwnedByLifecycle===true&&owned.context&&owned.privateRequest,'Lifecycle-owned race setup required')
  const f=owned.fixture,builder=buildRetrievalRace(f,scenario),ctx=owned.context
  assert(f.user===planned.fixture.ownerId&&same(namesFor(f),names),'Race setup changed its original identity')
  db=ctx.db
  assert(ctx.journal.project===developmentRef,'Race project differs from reviewed development project')
  await ctx.guard({ownerId:f.user,workspaceId:f.workspace,generation:f.generation})
  await inactive(db,names)
  const before=await snapshot(db,builder)
  // Capture rejection immediately while the other connection and PID observations run.
  const launch=async(side,sql)=>{
   requests[side]={state:'pending'}
   try{const value=await ctx.db.query(sql,false);requests[side]={state:'succeeded'};return{ok:true,value}}
   catch(error){requests[side]={state:'failed',failure:raceRequestFailure(error)};return{ok:false}}
  }
  holder=launch('holder',builder.holderSql(owned.privateRequest))
  const holderObserved=await observeRaceLock(ctx.db,builder.holderName)
  observed.holderPid=holderObserved.pid
  await record(key,{...intent,...observation(),state:'holder_observed'})
  waiter=launch('waiter',builder.waiterSql(owned.privateRequest))
  const waiterObserved=await observeRaceLock(ctx.db,builder.waiterName,holderObserved.pid)
  Object.assign(observed,{waiterPid:waiterObserved.pid,exactBlockObserved:true})
  await record(key,{...intent,...observation(),state:'exact_block_observed'})
  const signal=await ctx.db.query(builder.signalSql,false)
  assert(signal.length===1&&signal[0].id===f.otherSession,'Exact release signal was not acknowledged')
  const outcomes=await Promise.all([holder,waiter]);settled=true
  await record(key,{...intent,...observation(),state:'requests_settled',settled:true})
  assert(outcomes.every(outcome=>outcome.ok),'Original race request failed or its response is unresolved')
  assert(outcomes[0].value.some(row=>row.transition_committed_after_observed_block===true),'Holder transition commit was not observed')
  const denied=outcomes[1].value.find(row=>row.private_result)?.private_result
  const after=await snapshot(ctx.db,builder)
  result={...verifyRace(scenario,f,before,after,denied),exactBlockObserved:true,holderPid:holderObserved.pid,waiterPid:waiterObserved.pid}
  await record(key,{...intent,...observation(),state:'verified',settled:true,result})
 }catch(error){failure=error}
 finally{
  await Promise.all([holder,waiter].filter(Boolean));settled=true
  try{absent=await inactive(db,names)}catch(error){failure??=error}
  try{await record(key,{...intent,...observation(),state:failure?'failed':'verified',settled,connectionsAbsent:absent,...(result?{result}:{})})}catch(error){failure??=error}
  if(settled&&absent){
   try{
    await material.releaseRaceCase({scenario,settled:true})
    await record(key,{...intent,...observation(),state:failure?'failed_cleaned':'complete',settled:true,connectionsAbsent:true,cleaned:true,...(result?{result}:{})})
   }catch(error){failure??=error}
  }
 }
 if(failure)throw failure
 return{id:scenario.id,...result,connectionsAbsent:true,cleaned:true}
}
export async function runOwnedRetrievalAndRaces({context,runtime,ledger,material,record}){
 assert(context.journal.project===developmentRef&&context.anon&&ledger,'Original development fixture context required')
 assert(typeof record==='function'&&typeof material.acquireRaceCase==='function'&&typeof material.releaseRaceCase==='function','Original lifecycle callbacks required')
 assert(typeof runtime.runRetrievalClientJourney==='function','Production client journey missing from reviewed runtime')
 const sdk=material.sdk
 assert(sdk.identity?.environment==='development'&&sdk.identity.projectRef===developmentRef&&sdk.identity.accountId===sdk.ownerId&&sdk.identity.authSessionId===sdk.authSessionId,'Original SDK account/session identity required')
 assert(Array.isArray(sdk.expected)&&typeof sdk.accessToken==='function','Original expected plaintext and real session supplier required')
 await context.guard({ownerId:sdk.ownerId,subjectId:sdk.subjectId,...sdk.target})
 assert(!context.journal.integration?.sdk,'Original SDK dispatch exists; inspect its outcome before another integration attempt')
 await record('sdk',{state:'dispatch_intent',ownerId:sdk.ownerId,target:sdk.target,authSessionId:sdk.authSessionId})
 const result=await runtime.runRetrievalClientJourney({url:developmentUrl,anonKey:context.anon,accessToken:sdk.accessToken,
  target:sdk.target,identity:sdk.identity,credentials:sdk.credentials,expected:sdk.expected})
 const sdkResult={ok:true,operationCount:result.operationCount,pageSizes:result.pageSizes,headSeq:result.headSeq,headHash:result.headHash,manifestHash:result.manifestHash,verifiedAt:result.verifiedAt}
 await record('sdk',{state:'complete',result:sdkResult})
 const races=[]
 for(const scenario of RACE_CASES)races.push(await race({context,material,record,scenario}))
 return{ok:true,sdk:sdkResult,races,scope:'Actual deployed development retrieval through production client/real Auth and crypto; twelve exact blocked-PID PostgreSQL races with lifecycle-owned sequential cleanup. No native installation, paid provider/model, production or old-transport hard-lifetime acceptance.'}
}

const originalContinuation={reviewedSet:'19ff98327f3e3168f76009f724d9eef2e0db016c1a6019eaef8df430e16d09e7',attempt:'8e1a87bd-de76-474b-a289-01512ac233f4',identityDigest:'54cc8605addb8b61a46336680a6f14345e69701a91bfbe317e94ace4060b350e',lease:'a0d1167d-94f2-40a5-93d1-76447f2b072e'}
const originalCaseIds=RACE_CASES.map(s=>s.id)
const exactPrefix=ids=>Array.isArray(ids)&&ids.length>=2&&ids.length<=originalCaseIds.length&&same(ids,originalCaseIds.slice(0,ids.length))
export function assertOriginalIntegrationSuffix({context,continuation,now=Date.now()}){
 const j=context.journal,c=continuation
 assert(c?.kind==='original19ff983-integration-suffix'&&c.version===1,'Explicit original continuation required')
 for(const key of Object.keys(originalContinuation))assert.equal(c[key],originalContinuation[key],'Original integration provenance changed')
 assert.equal(context.lease,c.lease);assert.equal(j.runId,c.runId)
 assert(j.project===developmentRef&&j.prepared&&j.readinessActive&&!j.exercised&&!j.cleaned&&!j.cleanup&&!j.restore&&!j.quarantine?.held&&!j.integrationComplete&&!j.integrationContinuation,'Original prepared base is unavailable or continuation already dispatched')
 const acceptedCaseIds=c.acceptedCaseIds,previous=j.integrationContinuations??[]
 assert(exactPrefix(acceptedCaseIds)&&same(previous,c.acceptedContinuations),'Original prefix or continuation history changed')
 assert(previous.length<=12,'Original continuation count exceeded')
 const applications=new Set()
 let prefixLength=2,readOnlyResumptions=0,progressing=0
 for(const [index,entry] of previous.entries()){
  const intent=entry.intent
  assert(intent?.originalAttempt===c.attempt&&exactPrefix(intent.acceptedCaseIds)&&same(intent.remaining,originalCaseIds.slice(intent.acceptedCaseIds.length)),'Prior original continuation intent changed')
  assert(/^d2-install:[a-f0-9-]{36}$/.test(intent.applicationName)&&!applications.has(intent.applicationName),'Prior continuation attempt is missing or duplicated')
  applications.add(intent.applicationName)
  assert(entry.outcome?.state==='interrupted','A missing, completed or invalid continuation outcome cannot dispatch again')
  if(index===0)assert.equal(intent.acceptedCaseIds.length,2,'First original continuation must bind exactly two accepted cases')
  if(index>0&&intent.acceptedCaseIds.length===prefixLength){assert(intent.readOnlyNoProgressResume===true,'Prior continuation made no progress');readOnlyResumptions++}
  else{assert(intent.acceptedCaseIds.length>=prefixLength&&!intent.readOnlyNoProgressResume,'Prior accepted prefix or exception changed');progressing++}
  prefixLength=intent.acceptedCaseIds.length
 }
 assert(readOnlyResumptions<=1&&progressing<=12,'Original continuation allowance exceeded')
 if(previous.length){
  assert(acceptedCaseIds.length>=prefixLength,'Accepted original prefix shrank')
  if(acceptedCaseIds.length===prefixLength){
   assert(c.readOnlyNoProgressResume===true&&readOnlyResumptions===0&&typeof c.readOnlyNoProgressEvidence?.path==='string'&&/^[a-f0-9]{64}$/.test(c.readOnlyNoProgressEvidence?.sha256),'No-progress continuation needs its one reviewed read-only exception')
  }else assert(!c.readOnlyNoProgressResume,'Progressing continuation cannot consume a read-only exception')
 }else assert(acceptedCaseIds.length===2&&!c.readOnlyNoProgressResume,'Initial continuation must bind the reviewed two-case prefix')
 assert(progressing+(c.readOnlyNoProgressResume?0:1)<=12,'Original progressing continuation count exceeded')
 const work=j.scopes?.work
 assert(context.scope==='work'&&work?.registered&&same({id:work.id,expiresAt:work.expiresAt,manifest:work.manifest},c.workScope)&&Date.parse(work.expiresAt)>now,'Original work scope changed or expired')
 assert(same(j.races?.map(entry=>entry.scenario),RACE_CASES),'Original ordered race descriptors changed')
 assert(same(Object.keys(j.integration??{}).sort(),['sdk',...acceptedCaseIds.map(id=>`race:${id}`)].sort()),'Unexpected or partial integration dispatch exists')
 assert(same(j.integration,c.acceptedIntegration),'Original SDK or prefix records changed')
 const sdk=j.integration.sdk
 assert(sdk.state==='complete'&&sdk.result?.ok===true&&Number.isInteger(sdk.result.operationCount)&&sdk.result.operationCount>0&&Array.isArray(sdk.result.pageSizes)&&sdk.result.pageSizes.reduce((sum,n)=>sum+n,0)===sdk.result.operationCount,'Original SDK is not complete')
 assert(j.sdk?.retained===true,'Original retention outcome is incomplete')
 const accepted=[]
 for(const [index,scenario] of RACE_CASES.entries()){
  const entry=j.races[index],prior=j.integration[`race:${scenario.id}`]
  if(index>=acceptedCaseIds.length){
   assert(!prior&&Object.keys(entry.progress??{}).length===0,'Original suffix setup or request may already have dispatched')
   continue
  }
  assert.equal(scenario.id,acceptedCaseIds[index])
  const r=prior?.result,p=entry.progress
  assert(['verified','complete'].includes(prior?.state)&&prior.settled===true&&prior.connectionsAbsent===true,'Original case has an unknown assertion outcome')
  assert(prior.holderName===namesFor({user:entry.fixture.ownerId})[1]&&prior.waiterName===namesFor({user:entry.fixture.ownerId})[2],'Original observed connection identity changed')
  assert(r?.ok===true&&r.error===scenario.error&&r.operationsUnchanged===true&&r.receiptsUnchanged===true&&r.authorityDelta===(scenario.transition==='authorize-once'?1:0)&&r.boundaryVerified===true&&r.exactBlockObserved===true&&Number.isInteger(r.holderPid)&&r.holderPid>0&&Number.isInteger(r.waiterPid)&&r.waiterPid>0&&r.holderPid!==r.waiterPid,'Original case assertions are incomplete')
  const cleanup=p.cleanup,absence=p.cleanupResult
  const cleanupProven=cleanup?.verified===true&&cleanup.externalAbsenceVerified===true&&cleanup.sqlAttempted===true&&Object.values(cleanup.counts??{}).length>0&&Object.values(cleanup.counts).every(n=>Number(n)===0)
  const absenceProven=absence?.allScopedRowsAbsent===true&&absence.allScopedStorageAbsent===true&&absence.allAuthIndependentlyAbsent===true
  assert(p.setupAttempted===true&&p.setupComplete===true&&p.cleaned===true&&(cleanupProven||absenceProven),'Original case cleanup is not independently complete')
  accepted.push({id:scenario.id,...r,connectionsAbsent:true,cleaned:true,reusedOriginalAssertion:true})
 }
 return{sdk:sdk.result,accepted,acceptedCaseIds,remaining:RACE_CASES.slice(acceptedCaseIds.length)}
}
export async function continueOwnedRetrievalAndRaces({context,ledger,material,record,continuation}){
 assert(ledger&&typeof record==='function'&&typeof material.verifyCleanedCase==='function'&&typeof material.acquireRaceCase==='function'&&typeof material.releaseRaceCase==='function','Original lifecycle continuation callbacks required')
 assert(!Object.hasOwn(material,'sdk'),'Continuation must not prepare or replay SDK material')
 let selection=assertOriginalIntegrationSuffix({context,continuation})
 for(const scenario of RACE_CASES.slice(0,selection.acceptedCaseIds.length)){
  const absent=await material.verifyCleanedCase(scenario)
  assert(absent?.allScopedRowsAbsent===true&&absent.allScopedStorageAbsent===true&&absent.allAuthIndependentlyAbsent===true,'Accepted case absence is unverified')
 }
 const applications=[...new Set([`d2-install:${continuation.attempt}`,...(context.journal.integrationContinuations??[]).map(e=>e.intent.applicationName),...RACE_CASES.slice(0,selection.acceptedCaseIds.length).flatMap(s=>{
  const e=context.journal.races.find(e=>e.id===s.id)
  return[...namesFor({user:e.fixture.ownerId}),e.progress.cleanup?.sqlApplicationName,...(e.progress.cleanup?.sqlAttempts??[]).map(a=>a.applicationName),e.progress.accountRecovery?.applicationName].filter(Boolean)
 })])]
 await inactive(context.db,applications)
 await context.guard()
 selection=assertOriginalIntegrationSuffix({context,continuation})
 assert(/^d2-install:[a-f0-9-]{36}$/.test(context.applicationName)&&context.applicationName!==`d2-install:${continuation.attempt}`&&!(context.journal.integrationContinuations??[]).some(e=>e.intent.applicationName===context.applicationName),'Fresh original continuation execution identity required')
 const entry={intent:{kind:continuation.kind,originalAttempt:continuation.attempt,applicationName:context.applicationName,acceptedCaseIds:[...selection.acceptedCaseIds],remaining:selection.remaining.map(s=>s.id),readOnlyNoProgressResume:continuation.readOnlyNoProgressResume===true}}
 context.journal.integrationContinuations??=[];context.journal.integrationContinuations.push(entry)
 await context.save()
 const races=[...selection.accepted]
 try{
  for(const scenario of selection.remaining){
   assert(Date.parse(context.journal.scopes.work.expiresAt)>Date.now(),'Original continuation deadline expired')
   await context.guard()
   races.push(await race({context,material,record,scenario}))
  }
 }catch(error){entry.outcome={state:'interrupted'};await context.save();throw error}
 entry.outcome={state:'complete'};await context.save()
 return{ok:true,sdk:selection.sdk,races,reusedSdk:true,reusedCases:selection.acceptedCaseIds,originalAttempt:continuation.attempt,scope:'Original19ff983 only; reused completed SDK and exact independently cleaned contiguous prefix; original undispatched suffix only. No accepted request replay, new identity, scope extension or live acceptance from local proof.'}
}

const remainingCaseIds=RACE_CASES.slice(4).map(s=>s.id)
export function assertFreshRemainingRaces({context,plannedCaseIds,continuation,now=Date.now()}){
 const j=context.journal,selected=RACE_CASES.slice(4),history=j.remainingRaceRuns??[]
 assert(same(plannedCaseIds,remainingCaseIds)&&same(j.plannedCaseIds,plannedCaseIds),'Only the reviewed original case5–12 selection is allowed')
 assert(j.project===developmentRef&&j.prepared&&j.readinessActive&&!j.exercised&&!j.cleaned&&!j.cleanup&&!j.restore&&!j.quarantine?.held&&!j.integrationComplete&&!j.remainingRaceIntegrationComplete&&!j.sdk&&!j.integrationContinuation&&!j.integrationContinuations,'Fresh selected fixture is unavailable or has SDK/other integration state')
 assert(context.scope==='work'&&j.scopes?.work?.registered&&Date.parse(j.scopes.work.expiresAt)>now,'Fresh original work scope is unavailable or expired')
 assert(same(j.races?.map(e=>e.scenario),RACE_CASES),'Fresh original race descriptors changed')
 const workScope={id:j.scopes.work.id,expiresAt:j.scopes.work.expiresAt,manifest:j.scopes.work.manifest}
 const keys=Object.keys(j.integration??{}),accepted=[]
 assert(keys.every(k=>selected.some(s=>k===`race:${s.id}`)),'SDK or unselected dispatch cannot enter fresh results')
 for(const entry of j.races.slice(0,4))assert(Object.keys(entry.progress??{}).length===0&&!entry.fixture.authAttempted&&!entry.fixture.authVerified,'Excluded fresh cases must remain untouched')
 let undispatched=false
 for(const scenario of selected){
  const entry=j.races.find(e=>e.id===scenario.id),prior=j.integration?.[`race:${scenario.id}`],p=entry.progress
  if(!prior){undispatched=true;assert(Object.keys(p??{}).length===0&&!entry.fixture.authAttempted&&!entry.fixture.authVerified,'Unresolved fresh suffix setup exists');continue}
  assert(!undispatched,'Fresh accepted cases must form one contiguous selected prefix')
  const r=prior.result,names=namesFor({user:entry.fixture.ownerId}),cleanup=p.cleanup,absence=p.cleanupResult
  assert(['verified','complete'].includes(prior.state)&&prior.settled===true&&prior.connectionsAbsent===true&&prior.holderName===names[1]&&prior.waiterName===names[2],'Fresh prefix request outcome or connection identity is unresolved')
  assert(r?.ok===true&&r.error===scenario.error&&r.operationsUnchanged===true&&r.receiptsUnchanged===true&&r.authorityDelta===(scenario.transition==='authorize-once'?1:0)&&r.boundaryVerified===true&&r.exactBlockObserved===true&&Number.isInteger(r.holderPid)&&r.holderPid>0&&Number.isInteger(r.waiterPid)&&r.waiterPid>0&&r.holderPid!==r.waiterPid,'Fresh prefix assertions are incomplete')
  const cleanupProven=cleanup?.verified===true&&cleanup.externalAbsenceVerified===true&&cleanup.sqlAttempted===true&&Object.values(cleanup.counts??{}).length>0&&Object.values(cleanup.counts).every(n=>Number(n)===0)
  const absenceProven=absence?.allScopedRowsAbsent===true&&absence.allScopedStorageAbsent===true&&absence.allAuthIndependentlyAbsent===true
  assert(p.setupAttempted===true&&p.setupComplete===true&&p.cleaned===true&&(cleanupProven||absenceProven),'Fresh prefix cleanup is incomplete')
  accepted.push({id:scenario.id,...r,connectionsAbsent:true,cleaned:true,reusedOriginalAssertion:true})
 }
 assert(history.length<=selected.length,'Fresh selected continuation bound exceeded')
 if(!history.length){assert(!continuation&&accepted.length===0&&keys.length===0,'Initial fresh selected dispatch must have no prior request')}
 else{
  assert(continuation?.kind==='fresh-remaining-prefix'&&continuation.runId===j.runId&&continuation.lease===context.lease&&same(continuation.plannedCaseIds,plannedCaseIds)&&same(continuation.workScope,workScope)&&same(continuation.acceptedRuns,history)&&same(continuation.acceptedIntegration,j.integration)&&same(continuation.acceptedCaseIds,accepted.map(e=>e.id)),'Fresh continuation snapshot or original authority changed')
  const applications=new Set();let prefix=-1
  for(const entry of history){
   const intent=entry.intent,ids=intent?.acceptedCaseIds
   assert(entry.outcome?.state==='interrupted'&&intent.runId===j.runId&&intent.lease===context.lease&&same(intent.plannedCaseIds,plannedCaseIds)&&same(intent.workScope,workScope)&&Array.isArray(ids)&&same(ids,plannedCaseIds.slice(0,ids.length))&&ids.length>prefix,'Fresh prior outcome or growing prefix is unresolved')
   assert(/^d2-install:[a-f0-9-]{36}$/.test(intent.applicationName)&&!applications.has(intent.applicationName),'Fresh prior execution identity repeated')
   applications.add(intent.applicationName);prefix=ids.length
  }
  assert(history[0].intent.acceptedCaseIds.length===0&&accepted.length>prefix,'Fresh continuation needs newly asserted and cleaned progress')
 }
 return{accepted,remaining:selected.slice(accepted.length),workScope}
}
export async function runFreshRemainingRaces({context,ledger,material,record,plannedCaseIds,continuation}){
 assert(ledger&&typeof record==='function'&&typeof material.acquireRaceCase==='function'&&typeof material.releaseRaceCase==='function'&&typeof material.verifyCleanedCase==='function'&&!Object.hasOwn(material,'sdk'),'Fresh lifecycle callbacks without SDK material required')
 let selection=assertFreshRemainingRaces({context,plannedCaseIds,continuation})
 for(const accepted of selection.accepted){
  const scenario=RACE_CASES.find(s=>s.id===accepted.id),absence=await material.verifyCleanedCase(scenario)
  assert(absence?.allScopedRowsAbsent===true&&absence.allScopedStorageAbsent===true&&absence.allAuthIndependentlyAbsent===true,'Fresh accepted prefix absence is unverified')
 }
 const applications=[...(context.journal.remainingRaceRuns??[]).map(e=>e.intent.applicationName),...selection.accepted.flatMap(r=>{
  const entry=context.journal.races.find(e=>e.id===r.id)
  return[...namesFor({user:entry.fixture.ownerId}),entry.progress.cleanup?.sqlApplicationName,...(entry.progress.cleanup?.sqlAttempts??[]).map(a=>a.applicationName),entry.progress.accountRecovery?.applicationName].filter(Boolean)
 })]
 if(applications.length)await inactive(context.db,[...new Set(applications)])
 await context.guard();selection=assertFreshRemainingRaces({context,plannedCaseIds,continuation})
 assert(/^d2-install:[a-f0-9-]{36}$/.test(context.applicationName)&&!(context.journal.remainingRaceRuns??[]).some(e=>e.intent.applicationName===context.applicationName),'Fresh selected execution identity required')
 const entry={intent:{runId:context.journal.runId,lease:context.lease,applicationName:context.applicationName,plannedCaseIds:[...plannedCaseIds],acceptedCaseIds:selection.accepted.map(e=>e.id),workScope:structuredClone(selection.workScope)}}
 context.journal.remainingRaceRuns??=[];context.journal.remainingRaceRuns.push(entry);await context.save()
 const races=[...selection.accepted]
 try{
  for(const scenario of selection.remaining){
   assert(Date.parse(context.journal.scopes.work.expiresAt)>Date.now(),'Fresh original work deadline expired')
   await context.guard();races.push(await race({context,material,record,scenario}))
  }
 }catch(error){entry.outcome={state:'interrupted'};await context.save();throw error}
 for(const excluded of context.journal.races.slice(0,4))assert(Object.keys(excluded.progress??{}).length===0&&!excluded.fixture.authAttempted&&!excluded.fixture.authVerified,'Excluded fresh cases changed during selected integration')
 assert(plannedCaseIds.every(id=>context.journal.races.find(e=>e.id===id).progress.cleaned===true),'Every fresh selected case needs exact cleanup')
 entry.outcome={state:'complete'};context.journal.remainingRaceIntegrationComplete=true;await context.save()
 return{ok:true,races,plannedCaseIds:[...plannedCaseIds],reusedCases:selection.accepted.map(r=>r.id),sdkDispatched:false,scope:'Fresh fixture original case5–12 only. Earlier SDK/four cases are external evidence; no full twelve-case or uninterrupted original-run claim.'}
}
