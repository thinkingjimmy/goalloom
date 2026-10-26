/**
 * [INPUT]: Leased actual development context, original protected IDs/payloads and a real independent SQLite ledger.
 * [OUTPUT]: Resumable real Auth/Storage/privacy/worker observations with scoped no-provider settlement.
 * [POS]: Fixture journeys only. Installation/readiness and supplier runtime bounds remain coordinator-owned.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { q, json, sha, assertFixtureRows, registerFixtureScope, advanceFixtureWork, objectAbsent } from './fixture-support.mjs'
export async function prepareFixtures(ctx,runtime){
 for(const f of ctx.journal.fixtures){
  if(!await ctx.authIdentity(f)){
   assert(!f.authAttempted&&!f.authVerified,'Original Auth identity is missing or its creation outcome is unresolved; do not recreate it')
   f.authAttempted=true;await ctx.save()
   const created=ctx.good(await ctx.http('/auth/v1/admin/users',{method:'POST',body:{id:f.ownerId,email:f.email,password:f.password,email_confirm:true}}));assert.equal(created.id,f.ownerId)
  }
  f.authVerified=true;await ctx.save()
  while(f.sessions.length<f.sessionCount){
   const token=ctx.good(await ctx.http('/auth/v1/token?grant_type=password',{method:'POST',token:ctx.anon,body:{email:f.email,password:f.password}}));assert.equal(token.user.id,f.ownerId)
   ctx.db.hide(token.access_token);ctx.db.hide(token.refresh_token);const claims=JSON.parse(Buffer.from(token.access_token.split('.')[1],'base64url'))
   f.sessions.push({access_token:token.access_token,refresh_token:token.refresh_token,sessionId:claims.session_id});await ctx.save()
  }
  if(!f.subjectId){
   f.trialRequest??=randomUUID();await ctx.save()
   const trial=ctx.good(await ctx.http('/functions/v1/billing',{method:'POST',token:f.sessions[0].access_token,body:{action:'claim_trial',requestId:f.trialRequest}}));assert.equal(trial.status,'trialing')
   const root=(await ctx.db.query(`select subject_id,encode(owner_tag,'hex') owner_tag from service_private.account_lifecycle where environment='development' and user_id=${q(f.ownerId)}`))[0]
   assert(root);f.subjectId=root.subject_id;f.ownerTag=root.owner_tag;await ctx.save()
  }
  if(!f.trialTags){f.trialTags=(await ctx.db.query(`select distinct encode(tag,'hex') tag from(
   select service_private.owner_tag(${q(f.ownerId)},'trial-owner') tag union all select service_private.tag_value(provider||'|'||(identity_data->>'sub'),'trial-provider')
   from auth.identities where user_id=${q(f.ownerId)} and identity_data->>'sub' is not null) t`)).map(row=>row.tag);await ctx.save()}
  for(let i=0;i<f.devices.length;i++){
   const d=f.devices[i]
   if(!d.id){
    const existing=await ctx.db.query(`select id,auth_session_id from public.devices where user_id=${q(f.ownerId)} and sign_pub=decode(${q(d.secrets.signPub)},'hex')`);assert(existing.length<=1,'Ambiguous original device registration')
    if(existing.length){d.id=existing[0].id;d.sessionId=existing[0].auth_session_id}
    else{assert(!d.registerAttempted,'Original device registration remains unresolved');d.registerAttempted=true;await ctx.save();d.id=await ctx.userRpc(f,'register_device',{p_name:'D2 isolated lifecycle fixture',p_platform:'macos',p_sign_pub:`\\x${d.secrets.signPub}`,p_box_pub:`\\x${d.secrets.boxPub}`,p_protocol:1},i);d.sessionId=f.sessions[i].sessionId}
    await ctx.save()
   }
  }
  for(const t of f.targets){
   if(!t.payloads){t.payloads=await runtime.fixtureCreation({deviceId:f.devices[0].id,workspaceId:t.workspaceId,generation:t.generation,secrets:f.devices[0].secrets});t.originalPayloadHash=sha(JSON.stringify(t.payloads));await ctx.save()}
   assert.equal(sha(JSON.stringify(t.payloads)),t.originalPayloadHash,'Original seed payload changed')
   if(!t.created){await ctx.userRpc(f,'create_new_workspace',t.payloads.creation);t.created=true;await ctx.save()}
   if(!t.accepted){const accepted=await ctx.userRpc(f,'push_ops',{p_workspace:t.workspaceId,p_device:f.devices[0].id,p_generation:t.generation,p_ops:t.payloads.operations});assert.equal(accepted.length,t.payloads.operations.length);for(let i=0;i<accepted.length;i++){assert.equal(accepted[i].op_id,t.payloads.operations[i].op_id);assert.equal(Number(accepted[i].seq),i+1)}t.accepted=true;await ctx.save()}
   if(!t.completed){const finished=ctx.good(await ctx.lifecycle(f,'finish-initialization',t.payloads.finish));assert(finished.completed===true||finished.initialization?.state==='complete'||finished.initialization==='complete','Initialization finish not confirmed');t.completed=true;await ctx.save()}
  }
  await assertFixtureRows(ctx,f)
 }
 const owners=ctx.journal.fixtures.filter(f=>f.label!=='foreign').map(f=>f.ownerId)
 if(!ctx.journal.scopes.work.registered)await registerFixtureScope(ctx,'work',owners)
 for(const f of ctx.journal.fixtures){for(const t of f.targets){
  if(t.fixtureReady)continue
  const body=Buffer.from(t.bodyHex,'hex'),hash=sha(body)
  await assertFixtureRows(ctx,f)
  await ctx.db.query(`begin;set local statement_timeout='10s';set local lock_timeout='3s';do $$begin
   if not exists(select 1 from public.workspaces where id=${q(t.workspaceId)} and generation=${q(t.generation)} and user_id=${q(f.ownerId)}) then raise exception 'fixture_target_mismatch';end if;end$$;
   insert into public.snapshots(workspace_id,upto_seq,format_version,key_epoch,object_path,sha256,size,state,created_by)
   values(${q(t.workspaceId)},1,1,1,${q(t.path)},${q(hash)},${body.length},'uploading',${q(f.devices[0].id)}) on conflict(workspace_id,upto_seq) do nothing;
   do $$begin if not exists(select 1 from public.snapshots where workspace_id=${q(t.workspaceId)} and upto_seq=1 and object_path=${q(t.path)} and sha256=${q(hash)} and size=${body.length}) then raise exception 'fixture_snapshot_conflict';end if;end$$;commit;`,false)
  await ctx.refresh(f)
  const query=new URLSearchParams({v:'1',deviceId:f.devices[0].id,workspaceId:t.workspaceId,generation:t.generation,seq:'1',path:t.path})
  if(t.transportCase==='deployed-confirmed'){
   if(!t.uploaded){assert(!t.uploadAttempted,'Original deployed producer outcome remains unresolved; do not redispatch');t.uploadAttempted=true;await ctx.save()
    const uploaded=ctx.good(await ctx.http(`/functions/v1/snapshot-url?${query}`,{method:'PUT',token:f.sessions[0].access_token,raw:true,body,headers:{'content-type':'application/octet-stream','x-goalloom-service-version':'2'}}))
    assert.equal(uploaded.sha256,hash);assert.equal(uploaded.size,body.length)}
  }else{
   const observed=await knownTransferAckLoss(ctx,runtime,f,t,query,body)
   if(observed.preparedOnly){t.fixtureReady=true;await ctx.save();continue}
  }
  t.uploaded=true;await ctx.save()
  await ctx.db.query(`update public.snapshots set state='published' where workspace_id=${q(t.workspaceId)} and upto_seq=1 and object_path=${q(t.path)} and sha256=${q(hash)};`,false)
  t.fixtureReady=true;await ctx.save()
 }}
 const foreign=ctx.journal.fixtures.find(f=>f.label==='foreign');if(foreign)ctx.journal.foreignBefore??=await fixtureFingerprint(ctx,foreign)
 ctx.journal.prepared=true;await ctx.save();return{preparedOwners:ctx.journal.fixtures.length,targets:ctx.journal.fixtures.reduce((n,f)=>n+f.targets.length,0),scopeHours:1,providerCalls:0}
}
async function knownTransferAckLoss(ctx,runtime,f,t,query,body){
 await ctx.guard({subjectId:f.subjectId,workspaceId:t.workspaceId,generation:t.generation,paths:[t.path]})
 t.localProducer??={id:randomUUID(),pid:process.pid,sourceDigest:ctx.runtimeDigest,completed:false};assert.equal(t.localProducer.sourceDigest,ctx.runtimeDigest);await ctx.save()
 if(!t.localProducer.completed&&t.localProducer.attempted)throw Error('Original fixture producer outcome needs inspection; no automatic second dispatch')
 if(!t.localProducer.completed){
  const http=async(url,init)=>{
   const parsed=new URL(url);assert.equal(parsed.origin,'https://asqyvcnxdltzzfutbbqy.supabase.co')
   assert(parsed.pathname==='/auth/v1/user'||parsed.pathname.startsWith('/rest/v1/rpc/snapshot_transfer_access')||parsed.pathname.startsWith('/rest/v1/rpc/lifecycle_transfer_')||parsed.pathname.startsWith(`/storage/v1/object/snapshots/${t.path}`),'Local producer route outside fixture')
   await ctx.guard({subjectId:f.subjectId,workspaceId:t.workspaceId,generation:t.generation,paths:[t.path]})
   const headers=new Headers(init?.headers);if(parsed.pathname.startsWith('/rest/v1/rpc/lifecycle_transfer_'))headers.set('x-goalloom-lifecycle-scope',ctx.scopeHeader())
   const response=await fetch(url,{...init,headers})
   if(parsed.pathname.endsWith('/lifecycle_transfer_begin')&&response.ok){const value=await response.clone().json();assert(value.ticketId);t.localProducer.ticketId=value.ticketId;await ctx.save()
    if(t.transportCase==='known-begin-ack-loss'){t.localProducer.beginUpstreamConfirmed=true;await ctx.save();throw Error('Known local begin acknowledgment loss')}}
   if(parsed.pathname===`/storage/v1/object/snapshots/${t.path}`&&init.method==='POST'&&response.ok){t.localProducer.storageUpstreamStatus=response.status;t.localProducer.bodySha256=sha(body);await ctx.save();throw Error('Known local Storage acknowledgment loss')}
   return response
  }
  t.localProducer.attempted=true;await ctx.save()
  const handler=runtime.createSnapshotHandler({url:'https://asqyvcnxdltzzfutbbqy.supabase.co',serviceKey:ctx.serviceKey,producerSha256:ctx.runtimeDigest,fetch:http})
  const result=await handler(new Request(`https://asqyvcnxdltzzfutbbqy.supabase.co/functions/v1/snapshot-url?${query}`,{method:'PUT',headers:{authorization:`Bearer ${f.sessions[0].access_token}`,'x-goalloom-service-version':'2','content-type':'application/octet-stream'},body}))
  assert.equal(result.status,503,'Injected acknowledgment loss did not remain unknown to caller');t.localProducer.completed=true;await ctx.save()
 }
 assert(t.localProducer.ticketId,'Original transfer identity missing')
 const ticket=(await ctx.db.query(`select state,method,object_path,workspace_id,generation,producer_sha256,device_id,session_id from service_private.cloud_transfers where ticket_id=${q(t.localProducer.ticketId)}`))[0]
 assert(ticket&&ticket.method==='upload'&&ticket.workspace_id===t.workspaceId&&ticket.generation===t.generation&&ticket.object_path===t.path&&ticket.device_id===f.devices[0].id&&ticket.session_id===f.sessions[0].sessionId&&ticket.producer_sha256===ctx.runtimeDigest,'Original transfer correlation changed')
 if(t.transportCase==='known-begin-ack-loss'){assert.equal(ticket.state,'prepared');assert(!t.localProducer.storageUpstreamStatus);t.localProducer.preparedOnly=true;await ctx.save();return{preparedOnly:true}}
 assert(ticket.state==='unknown'||ticket.state==='complete');assert(t.localProducer.storageUpstreamStatus>=200&&t.localProducer.storageUpstreamStatus<300)
 const object=await ctx.http(`/storage/v1/object/snapshots/${t.path.split('/').map(encodeURIComponent).join('/')}`);assert.equal(object.status,200);assert.equal(sha(object.bytes),t.localProducer.bodySha256)
 const finished=await ctx.rpc('lifecycle_transfer_finish',{p_ticket:t.localProducer.ticketId,p_state:'complete'});assert.equal(finished.ok,true)
 t.localProducer.knownTerminalReconciled=true;await ctx.save();return{upstreamConfirmed:true,producerCompleted:true,opaqueSupplierTimeoutProved:false}
}
export async function prepareDeletion(ctx,f,scope,target=null){
 const key=scope==='account'?'account':target.workspaceId
 f.deletions??={}
 let receipt=f.deletions[key]
 if(!receipt){
  const discovery=ctx.good(await ctx.lifecycle(f,'status',{version:1,query:scope==='account'?{kind:'discover',after:null}:{kind:'generation',target:{workspaceId:target.workspaceId,generation:target.generation}}}))
  const expected=scope==='account'?discovery.accountRevision:discovery.entries[0].lifecycleVersion
  assert(Number.isSafeInteger(expected),'Authoritative deletion revision missing')
  const secret=randomBytes(32).toString('hex');ctx.db.hide(secret)
  receipt={requestId:randomUUID(),secret,digest:sha(Buffer.from(secret,'hex')),scope,expectedRevision:expected,target:scope==='account'?null:{workspaceId:target.workspaceId,generation:target.generation}}
  f.deletions[key]=receipt;await ctx.save()
 }
 if(receipt.confirmAttempted&&!receipt.confirmed){const current=await pollReceipt(ctx,receipt);if(current.accepted){receipt.confirmed=current;await ctx.save()}}
 if(!receipt.prepared){receipt.prepared=ctx.good(await ctx.lifecycle(f,'prepare',{version:1,requestId:receipt.requestId,scope:receipt.scope,target:receipt.target,expectedRevision:receipt.expectedRevision,receiptDigest:receipt.digest}));assert.equal(receipt.prepared.requestId,receipt.requestId);await ctx.save()}
 if(!receipt.confirmed){
  receipt.confirmAttempted=true;await ctx.save()
  let confirmation
  try{confirmation=await ctx.lifecycle(f,'confirm',{version:1,requestId:receipt.requestId,expectedRevision:receipt.expectedRevision,acknowledge:true})}
  catch{const current=await pollReceipt(ctx,receipt);if(current.accepted){receipt.confirmed=current;await ctx.save();return receipt}throw Error('Original confirmation outcome remains pending')}
  if(confirmation.status>=200&&confirmation.status<300)receipt.confirmed=confirmation.body
  else receipt.confirmed=await pollReceipt(ctx,receipt)
  assert.equal(receipt.confirmed.accepted,true);await ctx.save()
 }
 return receipt
}
export async function pollReceipt(ctx,receipt){
 const result=await ctx.http('/functions/v1/deletion-receipt',{method:'POST',token:ctx.anon,body:{version:1,environment:'development',requestId:receipt.requestId,secret:receipt.secret}})
 const progress=ctx.good(result);assert.equal(progress.requestId,receipt.requestId);assert(!Object.hasOwn(progress,'secret'))
 if(receipt.confirmed)for(const key of ['confirmedAt','onlineDeleteBy','statusExpiresAt'])assert.equal(progress[key],receipt.confirmed[key],'Deletion deadline changed')
 return progress
}
export async function fixtureFingerprint(ctx,f){
 await assertFixtureRows(ctx,f)
 return(await ctx.db.query(`select md5(jsonb_build_object(
  'workspace',(select coalesce(jsonb_agg(to_jsonb(w) order by id),'[]') from public.workspaces w where user_id=${q(f.ownerId)}),
  'ops',(select coalesce(jsonb_agg(to_jsonb(o) order by workspace_id,seq),'[]') from public.ops o where workspace_id in(${f.targets.map(t=>q(t.workspaceId)).join(',')||'null'})),
  'snapshots',(select coalesce(jsonb_agg(to_jsonb(s) order by workspace_id,upto_seq),'[]') from public.snapshots s where workspace_id in(${f.targets.map(t=>q(t.workspaceId)).join(',')||'null'})))::text) fingerprint`))[0].fingerprint
}
export async function exerciseDeletions(ctx){
 assert(ctx.journal.prepared);const foreign=ctx.journal.fixtures.find(f=>f.label==='foreign')
 ctx.journal.foreignBefore??=await fixtureFingerprint(ctx,foreign);await ctx.save()
 const owner=ctx.journal.fixtures.find(f=>f.label==='owner'),target=owner.targets[0]
 if(!target.businessSnapshot){target.businessSnapshot=await captureTarget(ctx,owner,target);await ctx.save()}
 await prepareDeletion(ctx,owner,'cloud',target)
 for(const f of ctx.journal.fixtures.filter(f=>['account','fair-one','fair-two'].includes(f.label)))await prepareDeletion(ctx,f,'account')
 ctx.journal.exercised=true;await ctx.save();return{cloudRequests:1,accountRequests:3,protectedBeforeDispatch:true}
}
export async function makeFixtureWorker(ctx,runtime,ledger,{settleMode='unavailable'}={}){
 const ports={url:'https://asqyvcnxdltzzfutbbqy.supabase.co',serviceKey:ctx.serviceKey,environment:'development'}
 const guard=runtime.workerScopeGuard(ctx.rpc,'development'),storage=runtime.projectStorage(ports)
 assert(!ctx.sqlRaceAuth||ctx.journal.fixtures.length===1&&ctx.journal.fixtures[0].sqlRace,'SQL Auth port is race-only')
 const auth=ctx.sqlRaceAuth??runtime.projectAuth({...ports,fetch:async(url,init)=>{
  const parsed=new URL(url),owner=parsed.pathname.split('/').at(-1),f=ctx.fixture(owner)
  assert.equal(parsed.origin,ports.url);assert.equal(parsed.pathname,`/auth/v1/admin/users/${f.ownerId}`)
  await ctx.guard({subjectId:f.subjectId,ownerId:f.ownerId})
  const response=await fetch(url,init)
  if(f.label==='account'&&init?.method==='DELETE'&&response.ok&&!f.authDeleteAckLost){f.authDeleteAckLost={upstreamStatus:response.status,at:new Date().toISOString()};await ctx.save();throw Error('Known local Auth deletion acknowledgment loss')}
  return response
 }})
 const settle=async subject=>{
  await ctx.guard({subjectId:subject});const f=ctx.journal.fixtures.find(f=>f.subjectId===subject);assert(f);await assertFixtureRows(ctx,f)
  if(settleMode==='unavailable')throw Error('controlled_provider_unavailable')
  assert.equal(settleMode,'empty-controlled')
  const source=await ctx.rpc('billing_source',{p_environment:'development'});assert(source)
  const provider={verifyConfiguration:async()=>{},findOriginalCustomer:async()=>{throw Error('unexpected_provider_lookup')},listSubscriptions:async()=>{throw Error('unexpected_provider_customer')}}
  const service=new runtime.BillingService({environment:'development',account:source.account_id,rcProject:source.rc_project,rcApp:source.rc_app,prices:{monthly:source.monthly_price,annual:source.annual_price}},ctx.rpc,provider)
  return service.reconcile(subject)
 }
 return runtime.createLifecycleWorker({environment:'development',rpc:ctx.rpc,ledger,guard,
  storage:{inventory:async(workspace,cursor)=>{const {fixture:f,target:t}=ctx.target(workspace);await ctx.guard({subjectId:f.subjectId,workspaceId:workspace,generation:t.generation});return storage.inventory(workspace,cursor)},
   remove:async(workspace,path)=>{const {fixture:f,target:t}=ctx.target(workspace);await ctx.guard({subjectId:f.subjectId,workspaceId:workspace,generation:t.generation,paths:[path]});return storage.remove(workspace,path)}},
  auth:{remove:async owner=>{const f=ctx.fixture(owner);await ctx.guard({subjectId:f.subjectId,ownerId:owner});await ctx.authIdentity(f);return auth.remove(owner)}},settle})
}
export async function driveFixtureWorker(ctx,runtime,ledger,{settleMode='unavailable',steps=1,advance=false}={}){
 assert(Number.isInteger(steps)&&steps>=1&&steps<=40);const worker=await makeFixtureWorker(ctx,runtime,ledger,{settleMode}),results=[]
 for(let i=0;i<steps;i++){if(advance)await advanceFixtureWork(ctx);const result=await worker();results.push(result);ctx.journal.workerRuns??=[];ctx.journal.workerRuns.push({at:new Date().toISOString(),settleMode,result});
  const ids=ctx.journal.scopes[ctx.scope].manifest.subjects.map(s=>q(s.subjectId)).join(',');ctx.journal.transferObservations??=[]
  const observed=(await ctx.db.query(`select jsonb_build_object('transfers',(select coalesce(jsonb_agg(jsonb_build_object('ticket_id',ticket_id,'state',state,'method',method,'producer_sha256',producer_sha256)),'[]') from service_private.cloud_transfers where environment='development' and subject_id in(${ids})),
   'complete',exists(select 1 from service_private.deletion_requests where environment='development' and subject_id in(${ids}) and confirmed_at is not null)
    and not exists(select 1 from service_private.deletion_requests where environment='development' and subject_id in(${ids}) and confirmed_at is not null
     and (content<>'deleted' or auth_state not in('deleted','not_applicable')${settleMode==='empty-controlled'?" or renewal not in('stopped','not_applicable')":''}))
    and not exists(select 1 from service_private.deletion_outbox where environment='development' and subject_id in(${ids}) and acknowledged_at is null)) observation`))[0].observation
  ctx.journal.transferObservations.push(...observed.transfers);await ctx.save();if(observed.complete)break}
 if(settleMode==='unavailable'){
  const accounts=ctx.journal.fixtures.filter(f=>f.deletions?.account)
  const progress=await Promise.all(accounts.map(f=>pollReceipt(ctx,f.deletions.account)))
  if(progress.length===3&&progress.every(p=>p.content==='deleted'&&p.auth==='deleted'&&p.renewal==='pending')){ctx.journal.unavailableProof={authIndependentOfRenewal:true,allThreeProgressed:true,at:new Date().toISOString()};await ctx.save()}
 }
 return{steps:results.length,exported:results.reduce((n,r)=>n+r.exported,0),progressed:results.reduce((n,r)=>n+r.progressed,0),authDeleted:results.reduce((n,r)=>n+r.authDeleted,0),renewalPending:results.reduce((n,r)=>n+r.renewalPending,0),providerNetworkCalls:0,authIndependentOfRenewal:ctx.journal.unavailableProof?.authIndependentOfRenewal??false}
}
export async function verifyFixtureDeletion(ctx){
 const foreign=ctx.journal.fixtures.find(f=>f.label==='foreign');assert.equal(await fixtureFingerprint(ctx,foreign),ctx.journal.foreignBefore,'Foreign fixture changed')
 const progress=[]
 for(const f of ctx.journal.fixtures)for(const receipt of Object.values(f.deletions??{})){
  const current=await pollReceipt(ctx,receipt);progress.push({requestHash:sha(receipt.requestId),scope:receipt.scope,content:current.content,auth:current.auth,renewal:current.renewal})
  if(current.auth==='deleted'){assert.equal(await ctx.authIdentity(f),false);assert((await ctx.db.query(`select not exists(select 1 from auth.users where id=${q(f.ownerId)}) absent`))[0].absent)}
  if(current.content==='deleted'){
   const targets=receipt.scope==='account'?f.targets:f.targets.filter(t=>t.workspaceId===receipt.target.workspaceId)
   for(const t of targets){await ctx.guard({subjectId:f.subjectId,workspaceId:t.workspaceId,generation:t.generation});const object=await ctx.http(`/storage/v1/object/info/snapshots/${t.path.split('/').map(encodeURIComponent).join('/')}`);assert(objectAbsent(object),'Deleted object absence is unverified');assert((await ctx.db.query(`select not exists(select 1 from public.workspaces where id=${q(t.workspaceId)}) absent`))[0].absent)}
  }
 }
 assert(progress.length===4,'Expected original cloud request and three account requests')
 assert(progress.every(p=>p.content==='deleted'),'Fixture content remains pending')
 assert(progress.filter(p=>p.scope==='account').every(p=>p.auth==='deleted'),'Fixture Auth remains pending')
 const account=ctx.journal.fixtures.find(f=>f.label==='account');assert(account.authDeleteAckLost,'Actual upstream Auth ACK loss was not observed')
 assert(ctx.journal.unavailableProof?.authIndependentOfRenewal,'Unavailable-provider independence branch was not established')
 return{foreignUnchanged:true,requests:progress,allContentDeleted:true,allAccountAuthDeleted:true,allAccountRenewalStopped:progress.filter(p=>p.scope==='account').every(p=>p.renewal==='stopped'),actualAuthAckLoss:true,authIndependentOfRenewal:true}
}
export async function captureTarget(ctx,f,t){
 await assertFixtureRows(ctx,f);const tables=['workspaces','device_roster','key_envelopes','recovery_checkpoints','ops','op_receipts','snapshots']
 const parts=tables.map(name=>`${q(name)},(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.${name} x where ${name==='workspaces'?'id':'workspace_id'}=${q(t.workspaceId)})`)
 return(await ctx.db.query(`select jsonb_build_object(${parts.join(',')},'lifecycle',(select to_jsonb(l) from service_private.workspace_lifecycle l where environment='development' and workspace_id=${q(t.workspaceId)})) snapshot`))[0].snapshot
}
