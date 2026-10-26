/**
 * [INPUT]: Original protected base journal and twelve fixed backend race descriptors.
 * [OUTPUT]: Sequential fixture acquisition/cleanup with explicit planned-case selection, read-only absence and original SDK material.
 * [POS]: Owner seam for the backend adapter. SQL races reuse its original setup and assertions; no eager network.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID,randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { canonicalJson } from '../../packages/contracts/src/canonical.ts'
import { retrievalFixture } from '../billing/d2-retrieval-fixtures.mjs'
import { RACE_CASES,buildRetrievalRace } from '../billing/d2-retrieval-concurrency.mjs'
import { authSql } from '../billing/d1-sync-fixtures.mjs'
import { fixtureContext,assertFixtureRows,registerFixtureScope,q,json,sha } from './fixture-support.mjs'
import { cleanupLifecycleFixtures,verifyFixtureAbsence } from './fixture-maintenance.mjs'
import { LocalSqliteLedger } from './ledger.mjs'
import { prepareDeletion,driveFixtureWorker,pollReceipt } from './fixture-journeys.mjs'
const capability=()=>({id:randomUUID(),secret:randomBytes(32).toString('hex'),registered:false})
export function planRaceCases(directory){return RACE_CASES.map(scenario=>{
 const f=retrievalFixture(),material=Object.fromEntries(Object.entries(f).filter(([,value])=>typeof value!=='function'))
 material.sqlSecrets={device:f.sqlSecret('device'),recovery:f.sqlSecret('recovery')}
 const cleanupSessionId=randomUUID(),generations=[f.generation,...(scenario.transition==='generation'?[f.finalOp]:[])]
 return{id:scenario.id,scenario,material,cleanupSessionId,ledgerPath:resolve(directory,'race-ledgers',`${scenario.id}.sqlite`),scopes:{work:capability(),cleanup:capability()},progress:{},
  fixture:{label:`race:${scenario.id}`,ownerId:f.user,email:`billing-${f.user}@goalloom.test`,password:randomBytes(32).toString('base64url')+'aA!',sqlRace:true,
   sessionCount:3,sessions:[],devices:[{id:f.device,sessionId:f.session,secrets:{signPub:f.signPub,boxPub:f.boxPub}}],
   targets:generations.map(generation=>({workspaceId:f.workspace,generation,path:`workspaces/${f.workspace}/${generation}/fixture.bin`,bodyHex:'',transportCase:'sql-race-no-storage'}))}}
})}
function originalFixture(entry){return{...entry.material,sqlSecret:kind=>{assert(['device','recovery'].includes(kind));return entry.material.sqlSecrets[kind]}}}
async function observeOriginalRace(ctx,entry){
 const f=entry.fixture,m=entry.material,sessionIds=[m.session,m.otherSession,entry.cleanupSessionId],scopeIds=Object.values(entry.scopes).map(c=>q(c.id)).join(',')
 const names=[...['setup','holder','waiter'].map(kind=>`d2-race-${kind}:${f.ownerId}`),...(ctx.raceRecovery?.raceId===entry.id?[ctx.raceRecovery.originalMetadataApplicationName,entry.progress.accountRecovery?.applicationName].filter(Boolean):[])].map(q).join(',')
 assert.equal(Number((await ctx.db.query(`select count(*) n from pg_stat_activity where application_name in(${names}) and state<>'idle'`))[0].n),0,'An original race connection remains active; retain its fixture')
 const value=(await ctx.db.query(`select jsonb_build_object(
  'auth',(select jsonb_build_object('id',id,'email',email,'bannedUntil',banned_until) from auth.users where id=${q(f.ownerId)}),
  'root',(select jsonb_build_object('subjectId',subject_id,'ownerTag',encode(owner_tag,'hex'),'owner',user_id,'providerOwner',provider_user_id,'state',state,'deleteRequestId',delete_request_id,'confirmedAt',service_private.format_utc(confirmed_at),
   'ownerTagMatches',owner_tag=service_private.owner_tag(${q(f.ownerId)})) from service_private.account_lifecycle where environment='development' and owner_tag=service_private.owner_tag(${q(f.ownerId)})),
  'workspaces',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'owner',user_id,'generation',generation,'headSeq',head_seq,'keyEpoch',key_epoch,'rosterVersion',roster_version)),'[]') from public.workspaces where id=${q(m.workspace)} or user_id=${q(f.ownerId)}),
  'devices',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'owner',user_id,'session',auth_session_id,'signPub',encode(sign_pub,'hex'),'boxPub',encode(box_pub,'hex'))),'[]') from public.devices where id=${q(m.device)} or user_id=${q(f.ownerId)}),
  'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'owner',user_id)),'[]') from auth.sessions where user_id=${q(f.ownerId)} or id in(${sessionIds.map(q).join(',')})),
  'lifecycle',(select coalesce(jsonb_agg(jsonb_build_object('subjectId',subject_id,'workspaceId',workspace_id,'generation',generation,'state',state)),'[]') from service_private.workspace_lifecycle where environment='development' and workspace_id=${q(m.workspace)}),
  'accountRequests',(select coalesce(jsonb_agg(jsonb_build_object('id',request_id,'sessionId',session_id,'digest',encode(receipt_digest,'hex'),'expectedRevision',expected_revision,'confirmed',confirmed_at is not null)),'[]') from service_private.deletion_requests where environment='development' and subject_id=(select subject_id from service_private.account_lifecycle where environment='development' and owner_tag=service_private.owner_tag(${q(f.ownerId)})) and scope='account'),
  'outbox',(select count(*) from service_private.deletion_outbox where environment='development' and (workspace_id=${q(m.workspace)} or record->>'ownerTag'=encode(service_private.owner_tag(${q(f.ownerId)}),'hex'))),
  'scopes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'digest',encode(secret_digest,'hex'),'manifest',manifest)),'[]') from service_private.worker_scopes where id in(${scopeIds}))) observation`))[0].observation
 if(value.auth)assert(value.auth.id===f.ownerId&&value.auth.email===f.email,'Original race Auth ownership changed')
 for(const row of value.sessions)assert(row.owner===f.ownerId&&sessionIds.includes(row.id),'Unplanned race Auth session')
 for(const row of value.devices)assert(row.id===m.device&&row.owner===f.ownerId&&row.session===m.session&&row.signPub===m.signPub&&row.boxPub===m.boxPub,'Original race device identity changed')
 for(const row of value.workspaces)assert(row.owner===f.ownerId&&f.targets.some(t=>t.workspaceId===row.id&&t.generation===row.generation),'Original race workspace ownership or planned generation changed')
 for(const row of value.scopes){const cap=Object.values(entry.scopes).find(c=>c.id===row.id);assert(cap&&row.digest===sha(Buffer.from(cap.secret,'hex'))&&cap.manifest&&canonicalJson(cap.manifest)===canonicalJson(row.manifest),'Original immutable race scope changed')}
 if(!value.root){
  assert(!value.auth&&!value.workspaces.length&&!value.devices.length&&!value.sessions.length&&!value.lifecycle.length&&!value.scopes.length&&Number(value.outbox)===0,'Original setup state is partial or conflicting; preserve it for inspection')
  return{state:'absent',proof:value}
 }
 const root=value.root
 assert(root.ownerTagMatches&&(!root.owner||root.owner===f.ownerId)&&(!f.subjectId||f.subjectId===root.subjectId)&&(!f.ownerTag||f.ownerTag===root.ownerTag),'Original race subject ownership changed')
 for(const row of value.lifecycle)assert(row.subjectId===root.subjectId&&f.targets.some(t=>t.workspaceId===row.workspaceId&&t.generation===row.generation),'Unplanned original race lifecycle target')
 const account=f.deletions?.account,accountRecovery=entry.progress.accountRecovery,requests=value.accountRequests
 const samePendingAccount=accountRecovery?.originalIntegrationAttempt===ctx.raceRecovery?.originalIntegrationAttempt&&account?.scope==='account'
  &&(requests.length===0||requests.length===1&&requests[0].id===account.requestId&&requests[0].sessionId===entry.cleanupSessionId&&requests[0].digest===account.digest&&Number(requests[0].expectedRevision)===account.expectedRevision&&!requests[0].confirmed)
 const originalRecovery=ctx.raceRecovery?.raceId===entry.id&&ctx.raceRecovery.originalMetadataApplicationName===entry.progress.cleanup?.sqlApplicationName
  &&entry.progress.cleanup.externalAbsenceVerified&&entry.progress.cleanup.sqlAttempted&&(!account&&requests.length===0||samePendingAccount)
  &&value.workspaces.length===0&&value.lifecycle.length>0&&value.lifecycle.every(row=>row.state==='deleted')
 if(root.state==='active')assert(root.providerOwner===f.ownerId&&value.auth&&(value.workspaces.length===1||originalRecovery)&&value.devices.length===1&&value.lifecycle.length>=1&&value.sessions.some(s=>s.id===entry.cleanupSessionId),'Original committed setup is incomplete; do not replace missing identities or sessions')
 else{
  const original=f.deletions?.account;assert(['deleting','deleted'].includes(root.state)&&original&&original.scope==='account'&&root.deleteRequestId===original.requestId,'Original closure is not bound to the protected cleanup request')
  const receipt=(await ctx.db.query(`select subject_id,session_id,scope,expected_revision,encode(receipt_digest,'hex') digest,auth_target,auth_state,
   service_private.format_utc(prepared_at) as "preparedAt",service_private.format_utc(confirmed_at) as "confirmedAt",
   service_private.format_utc(online_delete_by) as "onlineDeleteBy",service_private.format_utc(status_expires_at) as "statusExpiresAt",renewal,
   not exists(select 1 from public.billing_operations where environment='development' and subject_id=${q(root.subjectId)} and status='pending') no_pending
   from service_private.deletion_requests where environment='development' and request_id=${q(original.requestId)}`))[0]
  const authTargetMatches=receipt&&(receipt.auth_target===f.ownerId||receipt.auth_target===null&&receipt.auth_state==='deleted'&&root.state==='deleted'&&root.owner===null&&!value.auth)
  assert(receipt&&receipt.subject_id===root.subjectId&&receipt.session_id===entry.cleanupSessionId&&receipt.scope==='account'&&Number(receipt.expected_revision)===original.expectedRevision&&receipt.digest===original.digest&&authTargetMatches&&receipt.confirmedAt&&receipt.confirmedAt===root.confirmedAt,'Original account cleanup receipt changed')
  if(original.prepared)assert.equal(receipt.preparedAt,original.prepared.preparedAt,'Original preparation time changed')
  if(original.confirmed)for(const key of ['confirmedAt','onlineDeleteBy','statusExpiresAt'])assert.equal(receipt[key],original.confirmed[key],'Original cleanup deadline changed')
  assert(root.providerOwner===f.ownerId||root.providerOwner===null&&receipt.renewal==='stopped'&&receipt.no_pending,'Original provider identity is not safely terminal')
  value.cleanupReceipt={requestId:original.requestId,subjectId:root.subjectId,renewal:receipt.renewal,providerIdentityCleared:root.providerOwner===null}
 }
 return{state:'committed_owned',proof:value}
}
async function raceContext(parent,entry){
 const view={version:1,project:parent.journal.project,runId:parent.journal.runId,fixtures:[entry.fixture],scopes:entry.scopes,quarantine:parent.journal.quarantine,...entry.progress}
 const ctx=await fixtureContext({lease:parent.lease,journal:view,privatePath:parent.privatePath,scope:'work',applicationName:parent.applicationName})
 ctx.save=async()=>{const {version,project,runId,fixtures,scopes,quarantine,...progress}=view;entry.progress={...entry.progress,...progress};await parent.save()}
 ctx.raceRecovery=parent.raceRecovery
 const adminAuthIdentity=ctx.authIdentity
 ctx.authIdentity=async f=>{
  assert(f===entry.fixture&&f.sqlRace&&f.ownerId===entry.material.user,'Exact SQL race owner required')
  const rows=await ctx.db.query(`select id,email,instance_id is null and aud is null and role is null sql_fixture from auth.users where id=${q(f.ownerId)}`)
  assert(rows.length<=1);if(!rows.length){assert.equal(await adminAuthIdentity(f),false,'Admin Auth absence remains unverified');return false}
  assert(rows[0].id===f.ownerId&&rows[0].email===f.email&&rows[0].sql_fixture,'Original SQL Auth identity changed');return true
 }
 ctx.sqlRaceAuth={remove:async owner=>{
  const f=entry.fixture,receipt=f.deletions?.account,m=entry.material
  assert(owner===f.ownerId&&owner===m.user&&f.sqlRace&&ctx.scope==='cleanup'&&receipt?.confirmed?.accepted===true,'Confirmed original SQL account cleanup required')
  await ctx.guard({subjectId:f.subjectId,ownerId:owner})
  const identity={ownerId:owner,subjectId:f.subjectId,ownerTag:f.ownerTag,requestId:receipt.requestId,receiptDigest:receipt.digest}
  const intentId=sha(canonicalJson(identity)),pending=f.sqlAuthRemoval
  if(pending){
   assert(pending.intentId===intentId&&canonicalJson(pending.identity)===canonicalJson(identity),'Original SQL Auth intent identity changed')
   const row=(await ctx.db.query(`select not exists(select 1 from auth.users where id=${q(owner)}) absent,
    exists(select 1 from service_private.account_lifecycle where environment='development' and subject_id=${q(f.subjectId)} and owner_tag=decode(${q(f.ownerTag)},'hex') and state in('deleting','deleted') and delete_request_id=${q(receipt.requestId)}) owned,
    exists(select 1 from service_private.deletion_requests where environment='development' and subject_id=${q(f.subjectId)} and request_id=${q(receipt.requestId)} and scope='account' and encode(receipt_digest,'hex')=${q(receipt.digest)} and confirmed_at=${q(receipt.confirmed.confirmedAt)}::timestamptz and online_delete_by=${q(receipt.confirmed.onlineDeleteBy)}::timestamptz and status_expires_at=${q(receipt.confirmed.statusExpiresAt)}::timestamptz) receipt,
    (select count(*) from pg_stat_activity where pid<>pg_backend_pid() and application_name=${q(pending.applicationName)} and state<>'idle') active`))[0]
   assert(row.owned&&row.receipt&&Number(row.active)===0,'Original SQL Auth transaction or identity remains unresolved')
   assert(row.absent===true,'Original SQL Auth outcome remains unknown; explicit recovery required')
   assert.equal(await adminAuthIdentity(f),false,'Admin Auth absence remains unverified');pending.verified=true;await ctx.save();return true
  }
  f.sqlAuthRemoval={intentId,identity,applicationName:ctx.applicationName,dispatchAttempted:true,responseReceived:false,verified:false};await ctx.save()
  const sessions=[m.session,m.otherSession,entry.cleanupSessionId].map(q).join(','),workspaces=f.targets.map(t=>q(t.workspaceId)).join(',')
  const rows=await ctx.db.query(`begin;select set_config('request.headers',${json({'x-goalloom-lifecycle-scope':ctx.scopeHeader()})}::text,true);
   select service_private.assert_worker_target('development',${q(f.subjectId)},null,null,${q(owner)});select service_private.lock_account(${q(f.subjectId)},'development');
   select service_private.assert_worker_target('development',${q(f.subjectId)},null,null,${q(owner)});
   do $$declare ready jsonb;begin
   if not exists(select 1 from service_private.account_lifecycle where environment='development' and subject_id=${q(f.subjectId)} and owner_tag=decode(${q(f.ownerTag)},'hex') and state='deleting' and delete_request_id=${q(receipt.requestId)})
    or not exists(select 1 from service_private.deletion_requests where environment='development' and subject_id=${q(f.subjectId)} and request_id=${q(receipt.requestId)} and scope='account' and auth_target=${q(owner)} and confirmed_at=${q(receipt.confirmed.confirmedAt)}::timestamptz and online_delete_by=${q(receipt.confirmed.onlineDeleteBy)}::timestamptz and status_expires_at=${q(receipt.confirmed.statusExpiresAt)}::timestamptz)
    then raise exception 'sql_race_account_identity_conflict';end if;
   if exists(select 1 from public.workspaces where user_id=${q(owner)} or id in(${workspaces})) or exists(select 1 from public.ops where workspace_id in(${workspaces})) or exists(select 1 from public.snapshots where workspace_id in(${workspaces}))
    or exists(select 1 from auth.users where id=${q(owner)} and (email is distinct from ${q(f.email)} or instance_id is not null or aud is not null or role is not null))
    or exists(select 1 from auth.identities where user_id=${q(owner)}) or exists(select 1 from auth.refresh_tokens where user_id=${q(owner)})
    or exists(select 1 from auth.sessions where user_id=${q(owner)} and id not in(${sessions}))
    or exists(select 1 from public.devices where user_id=${q(owner)} and (id<>${q(m.device)} or auth_session_id is distinct from ${q(m.session)}::uuid or sign_pub<>decode(${q(m.signPub)},'hex') or box_pub<>decode(${q(m.boxPub)},'hex')))
    then raise exception 'sql_race_auth_dependency_conflict';end if;
   ready:=public.lifecycle_account_ready('development',${q(f.subjectId)});
   if ready->'ready' is distinct from 'true'::jsonb or ready->>'ownerId' is distinct from ${q(owner)} or ready->>'requestId' is distinct from ${q(receipt.requestId)} then raise exception 'sql_race_account_not_ready';end if;
   delete from auth.users where id=${q(owner)} and email=${q(f.email)} and instance_id is null and aud is null and role is null;
   end$$;select not exists(select 1 from auth.users where id=${q(owner)}) absent;commit;`,false)
  assert(rows.length===1&&rows[0].absent===true,'Original SQL Auth removal remains unresolved');f.sqlAuthRemoval.responseReceived=true;await ctx.save();assert.equal(await adminAuthIdentity(f),false,'Admin Auth absence remains unverified');f.sqlAuthRemoval.verified=true;await ctx.save();return true
 }}
 ctx.lifecycle=async(f,action,body)=>{
  assert.equal(f.ownerId,entry.material.user);assert(['status','prepare','confirm'].includes(action),'SQL race cleanup route is finite')
  const names={status:'lifecycle_status',prepare:'lifecycle_prepare_delete',confirm:'lifecycle_confirm_delete'}
  const identity={...entry.material,session:entry.cleanupSessionId}
  const rows=await ctx.db.query(`begin;${authSql(identity,{version:'2'})}select public.${names[action]}(${json(body)}) as value;commit;`,false)
  assert(rows.length===1,'Original SQL race cleanup response is unresolved');return{status:200,body:rows[0].value}
 }
 return ctx
}
export async function ownedRaceCallbacks(parent,runtime,ledger,{plannedCaseIds}={}){
 const cases=parent.journal.races;assert.equal(canonicalJson(cases.map(c=>c.id)),canonicalJson(RACE_CASES.map(c=>c.id)),'Exactly the original twelve race cases required')
 const selected=plannedCaseIds??RACE_CASES.map(s=>s.id)
 if(plannedCaseIds){
  assert.equal(canonicalJson(plannedCaseIds),canonicalJson(RACE_CASES.slice(4).map(s=>s.id)),'Only the explicit original case5–12 selection is allowed')
  assert.equal(canonicalJson(parent.journal.plannedCaseIds),canonicalJson(plannedCaseIds),'Selected callback list differs from protected plan')
 }
 const assertExcluded=()=>{if(plannedCaseIds)for(const entry of cases.filter(c=>!selected.includes(c.id)))assert(Object.keys(entry.progress??{}).length===0&&!entry.fixture.authAttempted&&!entry.fixture.authVerified,'Excluded selected-run case was touched')}
 assertExcluded()
 const acquireCase=async scenario=>{
  assert(selected.includes(scenario.id),'Case outside explicit reviewed selection');assertExcluded()
  const index=cases.findIndex(c=>c.id===scenario.id),entry=cases[index];assert(entry&&canonicalJson(entry.scenario)===canonicalJson(scenario),'Race outside reviewed case list')
  assert(cases.slice(0,index).filter(c=>selected.includes(c.id)).every(c=>c.progress.cleaned),'Previous race fixture cleanup must complete before the next identity')
  assert(cases.every(c=>c===entry||!c.progress.setupAttempted||c.progress.cleaned),'Another sequential race fixture is still active')
  assert(!entry.progress.cleaned,'A deleted race identity cannot be recreated')
  const ctx=await raceContext(parent,entry),f=originalFixture(entry),built=buildRetrievalRace(f,scenario)
  if(!entry.progress.setupComplete){
   assert(!entry.progress.setupAttempted,'Original setup outcome is unresolved; inspect or clean its exact fixture before proceeding')
   entry.progress.setupAttempted=true;entry.fixture.authAttempted=true;await parent.save()
   const addition=`insert into auth.sessions(id,user_id) values(${q(entry.cleanupSessionId)},${q(f.user)});`
   const selection='select request as private_request from pg_temp.d2_race_private;'
   const setup=built.setupSql.replace(selection,`${addition}${selection}`);assert.notEqual(setup,built.setupSql,'Original setup response boundary missing')
   const rows=await ctx.db.query(setup,false),request=rows.find(row=>row.private_request)?.private_request
   assert(request,'Original race request was not observed; do not repeat setup')
   entry.progress.privateRequest=request;entry.progress.setupComplete=true;entry.fixture.authVerified=true;await parent.save()
  }
  const root=(await ctx.db.query(`select subject_id,encode(owner_tag,'hex') owner_tag from service_private.account_lifecycle where environment='development' and owner_tag=service_private.owner_tag(${q(f.user)})`))[0]
  assert(root,'Original race subject missing');Object.assign(entry.fixture,{subjectId:root.subject_id,ownerTag:root.owner_tag})
  await ctx.save();await assertFixtureRows(ctx,entry.fixture)
  if(!entry.scopes.work.registered)await registerFixtureScope(ctx,'work',[f.user])
  return{fixture:f,privateRequest:entry.progress.privateRequest,scopeHeader:ctx.scopeHeader(),context:ctx,setupOwnedByLifecycle:true}
 }
 const releaseCase=async({scenario,settled})=>{
  assert(settled===true,'Both original database connections must be settled before fixture cleanup')
  const entry=cases.find(c=>c.id===scenario.id);assert(selected.includes(scenario.id)&&entry&&canonicalJson(entry.scenario)===canonicalJson(scenario),'Unknown original race fixture');assertExcluded()
  const ctx=await raceContext(parent,entry),f=entry.fixture
  const observation=await observeOriginalRace(ctx,entry)
  entry.progress.cleanupObservation=observation;await parent.save()
  if(observation.state==='absent'){
   const result=await verifyFixtureAbsence(ctx,runtime)
   entry.progress.cleaned=true;entry.progress.absenceObserved=true;entry.progress.cleanupResult=result;await parent.save()
   return{...result,setupDispatched:entry.progress.setupAttempted===true,originalSetupAbsent:true,remoteWrites:0,raceAssertionAccepted:false}
  }
  assert(entry.progress.setupAttempted,'An undispatched planned race identity unexpectedly exists; retain it')
  Object.assign(f,{subjectId:observation.proof.root.subjectId,ownerTag:observation.proof.root.ownerTag,authVerified:true});await parent.save()
  const row=(await ctx.db.query(`select generation from public.workspaces where id=${q(entry.material.workspace)} and user_id=${q(f.ownerId)}`))[0]
  if(row){assert(f.targets.some(t=>t.generation===row.generation),'Unplanned race generation');f.activeGeneration=row.generation;await ctx.save()}
  if(scenario.transition==='owner-ban')await ctx.db.query(`update auth.users set banned_until=null where id=${q(f.ownerId)} and email=${q(f.email)} and banned_until is not null;`,false)
  const caseLedger=new LocalSqliteLedger(entry.ledgerPath)
  try{
   const head=await caseLedger.head();entry.progress.ledgerStoreId??=head.storeId;assert.equal(head.storeId,entry.progress.ledgerStoreId,'Original race ledger changed');await parent.save()
   if(ctx.raceRecovery?.raceId===entry.id&&entry.progress.cleanup?.sqlAttempted){
    ctx.scope='cleanup';await ctx.guard({subjectId:f.subjectId,ownerId:f.ownerId})
    entry.progress.accountRecovery??={originalIntegrationAttempt:ctx.raceRecovery.originalIntegrationAttempt,originalMetadataApplicationName:entry.progress.cleanup.sqlApplicationName,applicationName:ctx.applicationName,started:true};await parent.save()
    await prepareDeletion(ctx,f,'account')
    const terminal=async()=>{
     const receipt=await pollReceipt(ctx,f.deletions.account)
     const pending=(await ctx.db.query(`select count(*) n from service_private.deletion_outbox where environment='development' and subject_id=${q(f.subjectId)} and acknowledged_at is null`))[0].n
     return receipt.content==='deleted'&&receipt.auth==='deleted'&&receipt.renewal==='stopped'&&Number(pending)===0
    }
    if(!await terminal())await driveFixtureWorker(ctx,runtime,caseLedger,{settleMode:'empty-controlled',steps:40,advance:true})
    assert(await terminal(),'Original SQL race account or independent export remains unfinished')
   }
   const result=await cleanupLifecycleFixtures(ctx,runtime,caseLedger);entry.progress.cleaned=true;await parent.save();return result
  }finally{caseLedger.close()}
 }
 const verifyCleanedCase=async scenario=>{
  const entry=cases.find(c=>c.id===scenario.id)
  assert(entry&&canonicalJson(entry.scenario)===canonicalJson(scenario)&&entry.progress.cleaned===true,'Only an original cleaned case may be inspected')
  const ctx=await raceContext(parent,entry),observation=await observeOriginalRace(ctx,entry)
  assert.equal(observation.state,'absent','Original cleaned fixture remains present')
  return verifyFixtureAbsence(ctx,runtime)
 }
 return{acquireCase,releaseCase,verifyCleanedCase,progress:async(id,result)=>{const entry=cases.find(c=>c.id===id);assert(entry);entry.progress.adapter=result;await parent.save()}}
}
export async function cleanupOwnedRaceCases(context,runtime,ledger){
 const callbacks=await ownedRaceCallbacks(context,runtime,ledger),pending=context.journal.races.filter(entry=>entry.progress.setupAttempted&&!entry.progress.cleaned)
 assert(pending.length<=1,'More than one original sequential case remains; inspect before cleanup')
 const results=[]
 for(const entry of pending)results.push({id:entry.id,result:await callbacks.releaseCase({scenario:entry.scenario,settled:true})})
 return{checkedCases:pending.length,allAttemptedCasesCleaned:context.journal.races.every(entry=>!entry.progress.setupAttempted||entry.progress.cleaned),results,raceAssertionsAccepted:false,setupReplayed:false,replacementIdentitiesCreated:false}
}
export async function originalSdkMaterial(ctx){
 const f=ctx.journal.fixtures.find(f=>f.label==='owner'),t=f.targets[1]
 assert(f.subjectId&&t.completed&&t.payloads.expected,'Original real Auth and complete seed required')
 await ctx.guard({subjectId:f.subjectId,workspaceId:t.workspaceId,generation:t.generation});await ctx.refresh(f)
 ctx.journal.sdk??={}
 if(!ctx.journal.sdk.retained){
  const observed=(await ctx.db.query(`select state,reason,head_seq from service_private.workspace_lifecycle where environment='development' and subject_id=${q(f.subjectId)} and workspace_id=${q(t.workspaceId)} and generation=${q(t.generation)}`))[0]
  if(observed?.state!=='retained'){
   assert.equal(observed?.state,'active','Original SDK generation is already privacy closed or unavailable')
   assert(!ctx.journal.sdk.retentionAttempted,'Original fixture clock transition is unresolved; inspect before retry')
   ctx.journal.sdk.retentionAttempted=true;await ctx.save()
   await ctx.db.query(`begin;select 1 from public.ai_budget where id='integration-shared' for update;
    select service_private.lock_account(${q(f.subjectId)},'development');
    do $$begin if not exists(select 1 from service_private.account_lifecycle where environment='development' and subject_id=${q(f.subjectId)} and user_id=${q(f.ownerId)} and state='active')
     or exists(select 1 from service_private.workspace_lifecycle where environment='development' and subject_id=${q(f.subjectId)} and reason in('explicit_cloud','account_delete','reset_sync')) then raise exception 'sdk_fixture_scope_conflict';end if;end$$;
    update public.billing_accounts set test_now=trial_ends_at+interval '1 hour' where environment='development' and subject_id=${q(f.subjectId)} and trial_ends_at is not null;
    select service_private.reconcile_lifecycle_locked(${q(f.subjectId)},'development',service_private.lifecycle_now('development',${q(f.subjectId)}));commit;`,false)
  }
  const frozen=(await ctx.db.query(`select state,reason,head_seq from service_private.workspace_lifecycle where environment='development' and subject_id=${q(f.subjectId)} and workspace_id=${q(t.workspaceId)} and generation=${q(t.generation)}`))[0]
  assert(frozen?.state==='retained'&&frozen.reason==='ordinary_expiry'&&Number(frozen.head_seq)===t.payloads.expected.length,'Original SDK retention boundary is not exact')
  ctx.journal.sdk.retained=true;await ctx.save()
 }
 return{ownerId:f.ownerId,subjectId:f.subjectId,ownerTag:f.ownerTag,authSessionId:f.sessions[0].sessionId,signalSessionId:f.sessions[1].sessionId,deviceId:f.devices[0].id,
  target:{workspaceId:t.workspaceId,generation:t.generation},accessToken:async()=>{await ctx.refresh(f);return f.sessions[0].access_token},credentials:{kind:'recovery',password:f.devices[0].secrets.syncPassword},
  identity:{environment:'development',projectRef:ctx.journal.project,accountId:f.ownerId,authSessionId:f.sessions[0].sessionId},expected:t.payloads.expected,creation:t.payloads,profile:'shared-empty-exact-seed',materialDigest:sha(canonicalJson(t.payloads.expected))}
}
