/**
 * [INPUT]: Exact synthetic manifest, quarantine, worker/ledger and optional real D3 provider policy.
 * [OUTPUT]: Fixture replay, provider-aware cleanup and final absence; unresolved work remains unfinished.
 * [POS]: Shared lifecycle cleanup; D3 retires only its disposable Test financial rows before existing FK cleanup.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { loadPrivate,q,json,sha,assertFixtureRows,registerFixtureScope,objectAbsent } from './fixture-support.mjs'
import { canonicalJson } from '../../packages/contracts/src/canonical.ts'
import { prepareDeletion,pollReceipt,driveFixtureWorker,captureTarget } from './fixture-journeys.mjs'
import {driveD3FixtureWorker,retireD3ProviderFinancials,assertD3ProviderPolicy} from './provider-fixture.mjs'
const snapshotTables=['workspaces','device_roster','key_envelopes','recovery_checkpoints','ops','op_receipts','snapshots']
const snapshotIdentity=value=>canonicalJson(Object.fromEntries(Object.entries(value).map(([name,rows])=>[name,Array.isArray(rows)?rows.map(canonicalJson).sort():rows])))
export async function captureFixtureStopHandoff(ctx,{plan,attempt}){
 const originalReports=plan.resumeContinuation?await Promise.all([plan.resumeContinuation.originalReadiness,...plan.resumeContinuation.failures].map(async input=>JSON.parse(await readFile(input.path,'utf8')))):[]
 const originalApplications=[...new Set([ctx.applicationName,ctx.journal.readinessActivation?.applicationName,ctx.journal.readinessResumption?.applicationName,...originalReports.map(r=>`d2-install:${r.attempt}`),...(ctx.journal.failures??[]).map(f=>`d2-install:${f.attempt}`),...ctx.journal.races.flatMap(r=>['setup','holder','waiter'].map(kind=>`d2-race-${kind}:${r.fixture.ownerId}`))].filter(Boolean))]
 const row=(await ctx.db.query(`select jsonb_build_object('service',(select to_jsonb(p) from service_private.policy p where id=1),
  'billing',(select to_jsonb(p) from public.billing_policy p where environment='development'),'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1)) policies,
  (select jsonb_agg(jsonb_build_object('jobid',jobid,'jobname',jobname,'schedule',schedule,'active',active,'command_sha256',encode(pg_catalog.sha256(convert_to(command,'UTF8')),'hex'))) from cron.job where jobname='goalloom-billing-worker-development') cron,
  (select count(*) from pg_stat_activity where pid<>pg_backend_pid() and application_name in(${originalApplications.map(q).join(',')}) and state<>'idle') active,
  ${ctx.journal.restore?.runId?`(select jsonb_build_object('id',id,'environment',environment,'storeId',store_id,'throughCursor',through_cursor::text,'keyDigest',key_digest,'phase',phase) from service_private.restore_runs where id=${q(ctx.journal.restore.runId)})`:'null::jsonb'} restore_run`))[0]
 assert(Number(row.active)===0&&row.cron?.length===1&&row.cron[0].active===false,'Final stop handoff transaction/cron proof failed')
 return{verified:true,at:new Date().toISOString(),project:plan.project,attempt,reviewedSet:plan.reviewedSetSha256,identityDigest:plan.identityDigest,
  privateJournal:{path:ctx.privatePath,sha256:sha(await readFile(ctx.privatePath))},policies:row.policies,cron:row.cron[0],originalApplications,originalTransactionsAbsent:true,
  restore:{originalRunId:ctx.journal.restore?.runId??null,run:row.restore_run,verified:ctx.journal.restore?.verified??false,quarantineHeld:ctx.journal.quarantine.held,quarantineGateId:ctx.journal.quarantine.gateId??null},
  fixtureCleaned:ctx.journal.cleaned??false,producerScope:'Awaited original local fixture stages only; no supplier lifetime claim',journalHoldRequired:true}
}
async function assertRestoreRun(ctx,run){
 const state=(await ctx.db.query(`select r.environment,r.store_id,r.through_cursor::text,r.key_digest,r.phase,
  (select encode(public._sha256(key),'hex') from service_private.lifecycle_keys where id=1) actual_key,
  (select restore_blocked from service_private.lifecycle_policy where id=1) blocked from service_private.restore_runs r where id=${q(run.runId)}`))[0]
 assert(state&&state.environment==='development'&&state.store_id===run.head.storeId&&state.through_cursor===run.head.cursor&&state.key_digest===run.keyDigest&&state.actual_key===run.keyDigest&&state.blocked,'Original restore identity or held barrier changed')
 if(run.replayVerified)assert.equal(state.phase,'replayed')
}
export async function restoreFixture(ctx,runtime,ledger){
 const f=ctx.journal.fixtures.find(f=>f.label==='owner'),t=f.targets[0],receipt=f.deletions?.[t.workspaceId]
 assert(t.businessSnapshot&&receipt?.confirmed,'Original protected fixture snapshot and accepted receipt required')
 await ctx.guard({subjectId:f.subjectId,workspaceId:t.workspaceId,generation:t.generation});await assertFixtureRows(ctx,f)
 ctx.journal.restore??={};const run=ctx.journal.restore
 if(!run.originalProgress){const original=await pollReceipt(ctx,receipt);assert.equal(original.content,'deleted','Finish original deletion before fixture restore');run.originalProgress=original;await ctx.save()}
 if(!t.originalDeletedBoundary){t.originalDeletedBoundary=(await ctx.db.query(`select online_deleted_at,backup_purge_by from service_private.workspace_lifecycle where workspace_id=${q(t.workspaceId)} and generation=${q(t.generation)}`))[0];assert(t.originalDeletedBoundary?.online_deleted_at&&t.originalDeletedBoundary?.backup_purge_by);await ctx.save()}
 if(!ctx.journal.quarantine.held){ctx.journal.quarantine={held:true,gateId:randomUUID(),projectRef:ctx.journal.project,fixtureOnly:true};await ctx.save()}
 const quarantine={assertClosed:async()=>{const j=await loadPrivate(ctx.privatePath);assert(j.quarantine.held&&j.quarantine.gateId===ctx.journal.quarantine.gateId);return{closed:true,gateId:j.quarantine.gateId,projectRef:j.project}}}
 if(!run.keyDigest){run.keyDigest=(await ctx.db.query("select encode(public._sha256(key),'hex') digest from service_private.lifecycle_keys where id=1"))[0].digest;run.head=await ledger.head();await ctx.save()}
 if(!run.runId){
  if(run.beginAttempted){const found=await ctx.db.query(`select id from service_private.restore_runs where environment='development' and store_id=${q(run.head.storeId)} and through_cursor=${q(run.head.cursor)}::bigint and key_digest=${q(run.keyDigest)}`);assert.equal(found.length,1,'Original restore begin remains unresolved');run.runId=found[0].id}
  else{run.beginAttempted=true;await ctx.save();const begun=await ctx.rpc('lifecycle_restore_begin',{p_environment:'development',p_store:run.head.storeId,p_through:run.head.cursor,p_key_digest:run.keyDigest});assert(begun?.ok);run.runId=begun.runId}
  await ctx.save()
 }
 await assertRestoreRun(ctx,run)
 if(!run.sqlRestored){
  const barrier=(await ctx.db.query('select restore_blocked,restore_admission_ready from service_private.lifecycle_policy where id=1'))[0];assert(barrier.restore_blocked&&!barrier.restore_admission_ready,'Actual restore barrier missing')
  const snapshot=t.businessSnapshot
  for(const name of snapshotTables)for(const row of snapshot[name])assert((name==='workspaces'?row.id:row.workspace_id)===t.workspaceId,'Fixture snapshot namespace mismatch')
  assert(snapshot.workspaces.length===1&&snapshot.workspaces[0].user_id===f.ownerId&&snapshot.workspaces[0].generation===t.generation)
  if(run.sqlRestoreAttempted){assert.equal(snapshotIdentity(await captureTarget(ctx,f,t)),snapshotIdentity(snapshot),'Original fixture restore SQL outcome remains unresolved; do not reinsert')}
  else{
   const insert=snapshotTables.map(name=>`insert into public.${name} select * from jsonb_populate_recordset(null::public.${name},${json(snapshot[name])});`).join('\n')
   const columns=Object.keys(snapshot.lifecycle).filter(key=>!['environment','workspace_id','generation','subject_id'].includes(key))
   assert(columns.every(key=>/^[a-z_]+$/.test(key)),'Unexpected fixture lifecycle column')
   const assignments=columns.map(key=>`${key}=restored.${key}`).join(',')
   run.sqlRestoreAttempted=true;await ctx.save()
   await ctx.db.query(`begin;set local lock_timeout='3s';set local statement_timeout='15s';
    do $$begin if exists(select 1 from public.workspaces where id=${q(t.workspaceId)}) or not exists(select 1 from service_private.account_lifecycle where environment='development' and subject_id=${q(f.subjectId)} and owner_tag=service_private.owner_tag(${q(f.ownerId)})) then raise exception 'fixture_restore_scope_conflict';end if;end$$;
    ${insert}
    update service_private.workspace_lifecycle l set ${assignments} from jsonb_populate_record(null::service_private.workspace_lifecycle,${json(snapshot.lifecycle)}) restored
     where l.environment='development' and l.workspace_id=${q(t.workspaceId)} and l.generation=${q(t.generation)} and l.subject_id=${q(f.subjectId)};
    delete from service_private.deletion_requests where environment='development' and subject_id=${q(f.subjectId)} and request_id=${q(receipt.requestId)};commit;`,false)
   assert.equal(snapshotIdentity(await captureTarget(ctx,f,t)),snapshotIdentity(snapshot),'Fixture SQL readback mismatch')
  }
  assert((await ctx.db.query(`select not exists(select 1 from service_private.deletion_requests where environment='development' and request_id=${q(receipt.requestId)}) absent`))[0].absent,'Pre-prepare backup receipt still exists')
  run.sqlRestored=true;await ctx.save()
 }
 if(!run.storageRestored){
  await ctx.guard({subjectId:f.subjectId,workspaceId:t.workspaceId,generation:t.generation,paths:[t.path]})
  const path=`/storage/v1/object/snapshots/${t.path.split('/').map(encodeURIComponent).join('/')}`
  let object=await ctx.http(path)
  if(object.status!==200){
   assert(objectAbsent(object),'Fixture Storage restore outcome is unknown')
   assert(!run.storageRestoreAttempted,'Original fixture Storage restore remains unresolved; do not redispatch')
   run.storageRestoreAttempted=true;await ctx.save()
   const uploaded=await ctx.http(path,{method:'POST',raw:true,body:Buffer.from(t.bodyHex,'hex'),headers:{'content-type':'application/octet-stream','x-upsert':'false'}})
   assert(uploaded.status>=200&&uploaded.status<300,'Fixture Storage export restore not confirmed');object=await ctx.http(path)
  }
  assert.equal(object.status,200);assert.equal(sha(object.bytes),sha(Buffer.from(t.bodyHex,'hex')),'Restored fixture bytes differ')
  run.storageRestored=true;await ctx.save()
 }
 if(!run.replayVerified){
  const projected=await runtime.replayDeletionLedger({environment:'development',rpc:ctx.rpc,ledger,quarantine,keyDigest:run.keyDigest,runId:run.runId,maxSteps:25});run.lastReplay=projected;await ctx.save()
  if(projected.phase!=='replayed')return{phase:projected.phase,admissionBlocked:true,complete:false}
  const recovered=await pollReceipt(ctx,receipt);assert.equal(recovered.accepted,true)
  for(const key of ['confirmedAt','onlineDeleteBy','statusExpiresAt'])assert.equal(recovered[key],run.originalProgress[key],'Original receipt deadline was not restored')
  run.replayVerified=true;run.recoveredReceipt=true;await ctx.save()
 }
 await assertRestoreRun(ctx,run)
 // Ordinary service remains blocked; only the manifest worker can re-purge the copied fixture.
 await ctx.db.query(`begin;set local lock_timeout='3s';set local statement_timeout='10s';do $$begin if not exists(select 1 from service_private.lifecycle_policy where restore_blocked) then raise exception 'restore_barrier_missing';end if;end$$;
 update service_private.lifecycle_policy set restore_admission_ready=true where id=1;commit;`,false)
 const result=await driveFixtureWorker(ctx,runtime,ledger,{settleMode:'empty-controlled',steps:25,advance:true})
 const final=await pollReceipt(ctx,receipt)
 if(final.content!=='deleted')return{replayed:true,complete:false,admissionBlocked:true,worker:result}
 const now=(await ctx.db.query(`select online_deleted_at,backup_purge_by from service_private.workspace_lifecycle where workspace_id=${q(t.workspaceId)} and generation=${q(t.generation)}`))[0]
 assert.equal(canonicalJson(now),canonicalJson(t.originalDeletedBoundary),'Restore extended original online/backup deletion boundary')
 run.verified=true;run.admissionRemainsBlocked=true;await ctx.save()
 return{replayed:true,complete:true,originalReceiptRecovered:true,originalDeadlinesPreserved:true,actualFixtureBusinessAndStoragePurged:true,externalFixtureQuarantineHeld:true,productionQuarantineProved:false,worker:result}
}
async function adoptPartial(ctx,f){
 const live=await ctx.authIdentity(f)
 if(!live&&!f.authVerified&&f.authAttempted)throw Error('Original Auth creation outcome remains unknown')
 if(!f.subjectId){
  let found=(await ctx.db.query(`select subject_id,encode(owner_tag,'hex') owner_tag from service_private.account_lifecycle where environment='development' and owner_tag=service_private.owner_tag(${q(f.ownerId)})`))[0]
  if(!found&&live){
   await ctx.db.query(`begin;set local lock_timeout='3s';set local statement_timeout='10s';do $$begin if not exists(select 1 from auth.users where id=${q(f.ownerId)} and email=${q(f.email)}) then raise exception 'fixture_identity_mismatch';end if;end$$;
    select service_private.ensure_live_subject('development',${q(f.ownerId)});commit;`,false)
   found=(await ctx.db.query(`select subject_id,encode(owner_tag,'hex') owner_tag from service_private.account_lifecycle where environment='development' and user_id=${q(f.ownerId)}`))[0]
  }
  if(found){f.subjectId=found.subject_id;f.ownerTag=found.owner_tag;await ctx.save()}
 }
 if(live&&!f.sessions.length&&!f.sqlRace){const token=ctx.good(await ctx.http('/auth/v1/token?grant_type=password',{method:'POST',token:ctx.anon,body:{email:f.email,password:f.password}}));assert.equal(token.user.id,f.ownerId);ctx.db.hide(token.access_token);ctx.db.hide(token.refresh_token);f.sessions.push({access_token:token.access_token,refresh_token:token.refresh_token,sessionId:JSON.parse(Buffer.from(token.access_token.split('.')[1],'base64url')).session_id});await ctx.save()}
 for(const d of f.devices.filter(d=>!d.id&&d.registerAttempted)){const found=await ctx.db.query(`select id,auth_session_id from public.devices where user_id=${q(f.ownerId)} and sign_pub=decode(${q(d.secrets.signPub)},'hex')`);assert(found.length<=1,'Ambiguous unknown fixture device');if(found.length){d.id=found[0].id;d.sessionId=found[0].auth_session_id;await ctx.save()}}
 if(f.subjectId)await assertFixtureRows(ctx,f)
 return live
}
async function cleanupCounts(ctx){
 const fixtures=ctx.journal.fixtures,ids=fixtures.filter(f=>f.subjectId).map(f=>q(f.subjectId)).join(',')||'null',owners=fixtures.map(f=>q(f.ownerId)).join(',')||'null'
 const workspaces=fixtures.flatMap(f=>f.targets).map(t=>q(t.workspaceId)).join(',')||'null',devices=fixtures.flatMap(f=>f.devices.filter(d=>d.id).map(d=>q(d.id))).join(',')||'null'
 const tags=[...(ctx.journal.scopes.cleanup.manifest?.trialTags??[]).map(tag=>`decode(${q(tag)},'hex')`),...fixtures.map(f=>`service_private.owner_tag(${q(f.ownerId)},'trial-owner')`)].join(',')||'null'
 const parts=[['auth',`auth.users where id in(${owners})`],['identities',`auth.identities where user_id in(${owners})`],['sessions',`auth.sessions where user_id in(${owners})`],['devices',`public.devices where user_id in(${owners})`],
  ['subjects',`service_private.account_lifecycle where subject_id in(${ids})`],['lifecycle',`service_private.workspace_lifecycle where subject_id in(${ids})`],['requests',`service_private.deletion_requests where subject_id in(${ids})`],
  ['outbox',`service_private.deletion_outbox where subject_id in(${ids}) or workspace_id in(${workspaces})`],['transfers',`service_private.cloud_transfers where subject_id in(${ids}) or workspace_id in(${workspaces})`],['objects',`service_private.cloud_objects where workspace_id in(${workspaces})`],
  ['initializations',`service_private.initializations where workspace_id in(${workspaces})`],['continuations',`service_private.continuations where subject_id in(${ids})`],['aliases',`service_private.operation_aliases where subject_id in(${ids})`],
  ['trialProtection',`service_private.trial_protection where tag in(${tags})`],['aiProtection',`public.ai_protection where subject_id in(${ids})`],['aiActions',`public.ai_actions where subject_id in(${ids})`],['aiLimits',`public.ai_limit_events where subject_id in(${ids})`],
  ['workspaces',`public.workspaces where id in(${workspaces})`],['retrieval',`service_private.retrieval_builds where workspace_id in(${workspaces})`],
  ['controlEvents',`public.control_events where device_id in(${devices})`],['rpcBuckets',`public.rpc_buckets where device_id in(${devices})`],
  ['scopes',`service_private.worker_scopes where id in(${q(ctx.journal.scopes.work.id)},${q(ctx.journal.scopes.cleanup.id)})`]]
 for(const table of ['device_roster','key_envelopes','pairing_requests','ops','op_receipts','recovery_challenges','recovery_checkpoints','snapshots','op_blobs'])parts.push([table,`public.${table} where workspace_id in(${workspaces})`])
 for(const table of ['accounts','customers','subscriptions','transactions','grace','operations','inbox','compensations'])parts.push([`billing_${table}`,`public.billing_${table} where subject_id in(${ids})`])
 if(ctx.journal.restore?.runId)for(const [name,column] of [['restore_runs','id'],['restore_events','run_id']])parts.push([name,`service_private.${name} where ${column}=${q(ctx.journal.restore.runId)}`])
 return(await ctx.db.query(`select jsonb_build_object(${parts.map(([name,from])=>`${q(name)},(select count(*) from ${from})`).join(',')}) counts`))[0].counts
}
async function verifyExternalAbsence(ctx,runtime,{guard=true}={}){
 const storage=runtime.projectStorage({url:'https://asqyvcnxdltzzfutbbqy.supabase.co',serviceKey:ctx.serviceKey,environment:'development'})
 for(const f of ctx.journal.fixtures){
  assert.equal(await ctx.authIdentity(f),false,'Fixture Auth remains; preserve pending work')
  const scoped=ctx.journal.scopes[ctx.scope]?.manifest?.subjects.some(s=>s.subjectId===f.subjectId)
  if(guard&&!scoped)assert(!f.subjectId&&!f.authAttempted&&!f.authVerified&&!f.sessions.length&&f.devices.every(d=>!d.id&&!d.registerAttempted)&&f.targets.every(t=>!t.created&&!t.uploadAttempted&&!t.localProducer),'Unscoped attempted fixture remains unresolved')
  for(const t of f.targets){
   if(guard&&scoped)await ctx.guard({subjectId:f.subjectId,workspaceId:t.workspaceId,generation:t.generation,paths:[t.path]})
   assert(objectAbsent(await ctx.http(`/storage/v1/object/info/snapshots/${t.path.split('/').map(encodeURIComponent).join('/')}`)),'Fixture object absence is unverified')
   let cursor=null,pages=0
   do{assert(++pages<=64,'Fixture namespace scan exceeded its bound');if(guard&&scoped)await ctx.guard({subjectId:f.subjectId,workspaceId:t.workspaceId,generation:t.generation});const page=await storage.inventory(t.workspaceId,cursor);assert.equal(page.paths.length,0,'Fixture namespace not empty');cursor=page.cursor}while(cursor)
  }
 }
}
async function finishCleanup(ctx,runtime,{guard=true}={}){
 const counts=await cleanupCounts(ctx);assert(Object.values(counts).every(value=>Number(value)===0),'Exact fixture rows remain; inspect original SQL outcome')
 await verifyExternalAbsence(ctx,runtime,{guard})
 ctx.journal.cleaned=true;ctx.journal.cleanup.verified=true;ctx.journal.cleanup.counts=counts;await ctx.save()
 return{fixtureOwners:ctx.journal.fixtures.length,allScopedRowsAbsent:true,allScopedStorageAbsent:true,allAuthIndependentlyAbsent:true,capabilitiesRemoved:true,independentLedgerPreserved:true,unprovedUploadsForced:false,admissionReopened:false,counts}
}
export async function verifyFixtureAbsence(ctx,runtime){
 const counts=await cleanupCounts(ctx);assert(Object.values(counts).every(value=>Number(value)===0),'Planned fixture metadata is not absent')
 await verifyExternalAbsence(ctx,runtime,{guard:false})
 return{allScopedRowsAbsent:true,allScopedStorageAbsent:true,allAuthIndependentlyAbsent:true,counts}
}
export async function cleanupLifecycleFixtures(ctx,runtime,ledger){
 // This function is intentionally reusable by sequential interop/race fixtures with the same protected manifest shape.
 let metadataOnly=false
 if(ctx.journal.cleanup?.sqlAttempted){
  const cleanup=ctx.journal.cleanup;assert(cleanup.externalAbsenceVerified&&/^d2-install:[a-f0-9-]{36}$/.test(cleanup.sqlApplicationName),'Original cleanup transaction identity missing')
  assert.equal(Number((await ctx.db.query(`select count(*) n from pg_stat_activity where application_name=${q(cleanup.sqlApplicationName)} and state<>'idle'`))[0].n),0,'Original cleanup transaction remains active; retain its state')
  const counts=await cleanupCounts(ctx)
  if(Object.values(counts).every(value=>Number(value)===0))return finishCleanup(ctx,runtime,{guard:false})
  const members=ctx.journal.fixtures.filter(f=>f.subjectId)
  assert.equal(members.length,ctx.journal.fixtures.length,'Original cleanup member set is incomplete')
  for(const f of members){
   await assertFixtureRows(ctx,f)
   const root=(await ctx.db.query(`select state,owner_tag=service_private.owner_tag(${q(f.ownerId)}) owned from service_private.account_lifecycle where environment='development' and subject_id=${q(f.subjectId)}`))[0]
   assert(root?.owned&&root.state==='deleted','Original metadata cleanup outcome is mixed or not terminal')
  }
  await verifyExternalAbsence(ctx,runtime,{guard:false})
  ctx.scope='cleanup';await ctx.guard()
  cleanup.recoveries??=[];cleanup.recoveries.push({at:new Date().toISOString(),originalApplicationName:cleanup.sqlApplicationName,originalTransactionAbsent:true,allOriginalTerminalRootsPresent:true,externalAbsenceReverified:true,outcome:'not_committed'})
  await ctx.save();metadataOnly=true
 }
 if(!metadataOnly)for(const f of ctx.journal.fixtures)await adoptPartial(ctx,f)
 const subjects=ctx.journal.fixtures.filter(f=>f.subjectId)
 assert(subjects.length,'No established fixture subjects; resolve any attempted Auth creation before declaring absence')
 if(!ctx.journal.scopes.cleanup.registered)await registerFixtureScope(ctx,'cleanup',subjects.map(f=>f.ownerId))
 ctx.scope='cleanup';await ctx.guard()
 if(!metadataOnly){
  for(const f of subjects)if(await ctx.authIdentity(f))await prepareDeletion(ctx,f,'account')
  if(ctx.providerPolicy){assertD3ProviderPolicy(ctx.providerPolicy,ctx.journal);ctx.journal.d3Settlement=await driveD3FixtureWorker(ctx,runtime,ledger,{steps:40,advance:true});await ctx.save()}
  else await driveFixtureWorker(ctx,runtime,ledger,{settleMode:'empty-controlled',steps:40,advance:true})
 }
 for(const f of subjects){
  await assertFixtureRows(ctx,f);assert.equal(await ctx.authIdentity(f),false,'Fixture Auth remains; preserve pending work')
  for(const receipt of Object.values(f.deletions??{})){const progress=await pollReceipt(ctx,receipt);assert.equal(progress.content,'deleted');if(receipt.scope==='account'){assert.equal(progress.auth,'deleted');assert.equal(progress.renewal,'stopped')}}
 }
 await verifyExternalAbsence(ctx,runtime)
 if(ctx.providerPolicy){ctx.journal.d3ProviderRetirement=await retireD3ProviderFinancials(ctx);await ctx.save()}
 const ids=subjects.map(f=>q(f.subjectId)).join(','),owners=subjects.map(f=>q(f.ownerId)).join(','),workspaces=subjects.flatMap(f=>f.targets).map(t=>q(t.workspaceId)).join(',')||'null'
 const tags=ctx.journal.scopes.cleanup.manifest.trialTags.map(tag=>`decode(${q(tag)},'hex')`).join(',')||'null'
 const rootProofs=subjects.map(f=>`if not exists(select 1 from service_private.account_lifecycle where environment='development' and subject_id=${q(f.subjectId)} and owner_tag=service_private.owner_tag(${q(f.ownerId)}) and state='deleted') then raise exception 'fixture_root_not_deleted';end if;`).join('\n')
 ctx.journal.cleanup??={};ctx.journal.cleanup.externalAbsenceVerified=true;ctx.journal.cleanup.sqlAttempted=true
 ctx.journal.cleanup.sqlAttempts??=[];ctx.journal.cleanup.sqlAttempts.push({applicationName:ctx.applicationName,at:new Date().toISOString(),metadataOnlyResume:metadataOnly});ctx.journal.cleanup.sqlApplicationName=ctx.applicationName;await ctx.save()
 const runId=ctx.journal.restore?.runId??null
 await ctx.db.query(`begin;set local lock_timeout='3s';set local statement_timeout='15s';
 do $$begin ${rootProofs}
 if exists(select 1 from auth.users where id in(${owners})) or exists(select 1 from public.workspaces where id in(${workspaces}))
  or exists(select 1 from service_private.cloud_transfers where subject_id in(${ids}) and method='upload' and state in('prepared','dispatched','unknown'))
  or exists(select 1 from public.billing_customers where subject_id in(${ids})) or exists(select 1 from public.billing_transactions where subject_id in(${ids}))
  or exists(select 1 from public.ai_actions where subject_id in(${ids}))
  or exists(select 1 from service_private.deletion_outbox where environment='development' and subject_id in(${ids}) and acknowledged_at is null) then raise exception 'fixture_cleanup_dependency_unresolved';end if;end$$;
 ${runId?`delete from service_private.restore_events where run_id=${q(runId)};delete from service_private.restore_runs where id=${q(runId)};`:''}
 delete from service_private.deletion_outbox where environment='development' and subject_id in(${ids});
 delete from service_private.cloud_transfers where environment='development' and subject_id in(${ids});
 delete from service_private.cloud_objects where environment='development' and workspace_id in(${workspaces});
 delete from service_private.initializations where workspace_id in(${workspaces});
 delete from service_private.workspace_lifecycle where environment='development' and subject_id in(${ids});
 delete from service_private.deletion_requests where environment='development' and subject_id in(${ids});
 delete from service_private.continuations where environment='development' and subject_id in(${ids});
 delete from service_private.operation_aliases where environment='development' and subject_id in(${ids});
 delete from public.billing_grace where environment='development' and subject_id in(${ids});
 delete from public.billing_operations where environment='development' and subject_id in(${ids});
 delete from public.billing_inbox where environment='development' and subject_id in(${ids});
 delete from public.billing_compensations where environment='development' and subject_id in(${ids});
 delete from public.billing_subscriptions where environment='development' and subject_id in(${ids});
 delete from public.billing_accounts where environment='development' and subject_id in(${ids});
 delete from public.ai_limit_events where environment='development' and subject_id in(${ids});
 delete from public.ai_protection where subject_id in(${ids});
 delete from service_private.trial_protection where tag in(${tags});
 delete from service_private.account_lifecycle where environment='development' and subject_id in(${ids});
 delete from service_private.worker_scopes where id in(${q(ctx.journal.scopes.work.id)},${q(ctx.journal.scopes.cleanup.id)});
 commit;`,false)
 const result=await finishCleanup(ctx,runtime,{guard:false})
 return ctx.providerPolicy?{...result,settlement:ctx.journal.d3Settlement,providerRetirement:ctx.journal.d3ProviderRetirement}:result
}
