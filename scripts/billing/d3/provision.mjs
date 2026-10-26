/**
 * [INPUT]: Validated immutable D3 branch, exact window and protected suite with any prelisted A target/device keys and accepted pilot.
 * [OUTPUT]: One planned Auth/subject, optional normally qualified/initialized A target, then immutable capabilities.
 * [POS]: Minimal D3 acquisition using existing lifecycle helpers; no readiness, provider or production activation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {resolve,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {writeFile} from 'node:fs/promises'
import {fixtureContext,loadPrivate,savePrivate,registerFixtureScope,q,uuid,requireLease} from '../../lifecycle/fixture-support.mjs'
import {d3ProviderSource} from '../provider-fixtures.mjs'
import {requireWindow,stageSequence} from './cli.mjs'
import {prepareFixtures} from '../../lifecycle/fixture-journeys.mjs'
import {bundle} from '../build.mjs'

const capabilities=()=>Object.fromEntries(['work','cleanup'].map(name=>[name,{id:randomUUID(),secret:randomBytes(32).toString('hex'),registered:false}]))
export async function prepareFixture(profile){
 requireWindow(profile.lease);requireLease(profile.lease)
 assert(stageSequence(profile).includes(profile.stage),'Invalid current-D2 journey or stage')
 const suitePath=resolve(profile.journal)
 let suite
 try{suite=await loadPrivate(suitePath)}catch(error){
  if(error.code!=='ENOENT'||profile.stage!=='setup'||profile.journey!=='A')throw error
  suite={version:1,profile:'d3-suite',project:'asqyvcnxdltzzfutbbqy',runId:randomUUID(),active:null,completed:{},planned:[]}
  for(const journey of ['A','B','C','D','E','F'])suite.planned.push({journey,ownerId:randomUUID(),password:`${randomUUID()}aA!`,privatePath:resolve(dirname(suitePath),`.d3-${suite.runId}-${journey}.json`)})
  await savePrivate(suitePath,suite)
 }
 assert(suite.version===1&&suite.profile==='d3-suite'&&suite.project==='asqyvcnxdltzzfutbbqy'&&uuid.test(suite.runId))
 assert(suite.planned.length===6&&new Set(suite.planned.map(row=>row.ownerId)).size===6)
 assert(suite.planned.map(row=>row.journey).join('')==='ABCDEF')
 const planned=suite.planned.find(row=>row.journey===profile.journey);assert(planned&&uuid.test(planned.ownerId))
 if(profile.initialSwitch)assert(suite.pilot?.recognized===true,'Existing accepted renewal pilot required for replacement A')
 const retained=planned.retainedTarget
 if(retained){
  assert(profile.journey==='A'&&uuid.test(retained.target?.workspaceId)&&uuid.test(retained.target?.generation),'Only the prelisted A target is allowed')
  assert(retained.device?.secrets&&/^[a-f0-9]{64}$/.test(retained.device.secrets.signPub)&&/^[a-f0-9]{64}$/.test(retained.device.secrets.boxPub),'Prelisted device keys required')
  assert(retained.target.path===`workspaces/${retained.target.workspaceId}/${retained.target.generation}/1.bin`&&retained.target.transportCase==='deployed-confirmed','Exact planned Storage target required')
 }
 assert(suite.active===null||suite.active===profile.journey,'Another planned fixture still requires cleanup')
 if(suite.active===null){
  assert.equal(profile.stage,'setup','Only setup can acquire a planned fixture');assert(!suite.completed[profile.journey],'Do not recreate a completed fixture')
  const prior=['E','F'].includes(profile.journey)
   ?suite.planned.filter(row=>row.journey==='A'||profile.journey==='F'&&row.journey==='E')
   :suite.planned.slice(0,suite.planned.indexOf(planned))
  assert(prior.every(row=>suite.completed[row.journey]?.verified===true||suite.completed[row.journey]?.skipped===true),'Earlier fixture is not terminal')
  if(!['A','E','F'].includes(profile.journey)&&!profile.initialPeriod)assert(suite.pilot?.recognized===true,'Actual A clock pilot is required')
  suite.active=profile.journey;await savePrivate(suitePath,suite)
 }
 let journal
 try{journal=await loadPrivate(planned.privatePath)}catch(error){
  if(error.code!=='ENOENT'||profile.stage!=='setup')throw error
  journal={version:1,profile:'d3-current-d2',project:suite.project,runId:randomUUID(),suitePath,pilot:suite.pilot??null,initialPeriod:profile.initialPeriod===true,initialSwitch:profile.initialSwitch===true,
   previousFixtureCleanup:{verified:Object.values(suite.completed).every(row=>row.verified||row.skipped)},scopes:capabilities(),cleanup:{},
   ledgerPath:resolve(dirname(suitePath),`.d3-${suite.runId}-${profile.journey}-ledger.sqlite`),fixtures:[{
    ownerId:planned.ownerId,email:`billing-${planned.ownerId}@goalloom.test`,password:planned.password,journey:profile.journey,label:`d3-${profile.journey.toLowerCase()}`,
    sessionCount:1,sessions:[],devices:retained?[structuredClone(retained.device)]:[],targets:retained?[structuredClone(retained.target)]:[],deletions:{},trialTags:[],subjectId:null,ownerTag:null,d3:{state:{},requests:{},completed:{}},
   }]}
  await savePrivate(planned.privatePath,journal)
 }
 assert(journal.suitePath===suitePath&&journal.fixtures.length===1&&journal.fixtures[0].ownerId===planned.ownerId)
 assert.equal(journal.initialPeriod===true,profile.initialPeriod===true,'Original fixture branch cannot change')
 assert.equal(journal.initialSwitch===true,profile.initialSwitch===true,'Original replacement branch cannot change')
 assert(!journal.nativePending,'Adopt the latest original native session locally before further requests')
 const fixture=journal.fixtures[0]
 if(retained){
  assert(fixture.targets.length===1&&fixture.devices.length===1&&fixture.targets[0].workspaceId===retained.target.workspaceId&&fixture.targets[0].generation===retained.target.generation,'Original A target changed')
  assert(fixture.devices[0].secrets.signPub===retained.device.secrets.signPub&&fixture.devices[0].secrets.boxPub===retained.device.secrets.boxPub,'Original A device changed')
 }
 if(profile.stage==='setup'&&!journal.prepared){
  const ctx=await fixtureContext({lease:profile.lease,journal,privatePath:planned.privatePath,applicationName:`d2-install:${randomUUID()}`})
  let existing=await ctx.http(`/auth/v1/admin/users/${fixture.ownerId}`)
  if(existing.status===404){
   assert(!fixture.authAttempted,'Original Auth creation outcome remains unknown')
   fixture.authAttempted=true;await ctx.save()
   existing=await ctx.http('/auth/v1/admin/users',{method:'POST',body:{id:fixture.ownerId,email:fixture.email,password:fixture.password,email_confirm:true}})
  }
  const user=ctx.good(existing);assert.equal(user.id,fixture.ownerId);assert.equal(user.email,fixture.email)
  fixture.authVerified=true;await ctx.save()
  if(!fixture.sessions.length){
   assert(!fixture.loginAttempted,'Original session acquisition outcome remains unknown')
   fixture.loginAttempted=true;await ctx.save()
   const session=ctx.good(await ctx.http('/auth/v1/token?grant_type=password',{method:'POST',token:ctx.anon,body:{email:fixture.email,password:fixture.password}}))
   const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url'))
   assert.equal(claims.sub,fixture.ownerId);assert(uuid.test(claims.session_id))
   fixture.sessions.push({access_token:session.access_token,refresh_token:session.refresh_token,sessionId:claims.session_id});await ctx.save()
  }
  const identityBody={p_environment:'development',p_owner:fixture.ownerId,p_create:false}
  let identity=ctx.good(await ctx.http('/rest/v1/rpc/lifecycle_identity',{method:'POST',body:identityBody}))
  if(!identity)identity=ctx.good(await ctx.http('/rest/v1/rpc/lifecycle_identity',{method:'POST',body:{...identityBody,p_create:true}}))
  assert(identity?.mode==='active'&&uuid.test(identity.subjectId))
  fixture.subjectId=identity.subjectId
  const row=(await ctx.db.query(`select encode(owner_tag,'hex') tag from service_private.account_lifecycle where environment='development' and subject_id=${q(fixture.subjectId)} and user_id=${q(fixture.ownerId)}`))[0]
  assert(/^[a-f0-9]{64}$/.test(row?.tag));fixture.ownerTag=row.tag
  fixture.provider??={version:1,profile:'d3-disposable-test',environment:'development',...d3ProviderSource,ownerId:fixture.ownerId,subjectId:fixture.subjectId,createdAt:new Date().toISOString(),customer:null,clock:null,
   subscriptions:[],invoices:[],invoicePayments:[],paymentIntents:[],charges:[],refunds:[],disputes:[],schedules:[],checkouts:[],events:[],rcEvents:[],effects:[]}
  await ctx.save()
  if(retained){
   if(journal.scopes.work.registered){
    const target=fixture.targets[0],device=fixture.devices[0],manifest=journal.scopes.work.manifest
    assert(target.completed&&device.id&&manifest.targets.some(t=>t.workspaceId===target.workspaceId&&t.generation===target.generation)&&manifest.devices.some(d=>d.deviceId===device.id),'Registered scope must contain the already initialized original target')
   }
   const save=ctx.save
   ctx.save=async()=>{
    const device=fixture.devices[0]
    if(device.id){assert(uuid.test(device.id)&&(!retained.device.id||retained.device.id===device.id),'Original registered device changed');retained.device.id=device.id;retained.device.sessionId=device.sessionId}
    await save();await savePrivate(suitePath,suite)
   }
   let claim=fixture.d3.requests.trial
   if(!claim){claim={action:'claim_trial',requestId:randomUUID()};fixture.d3.requests.trial=claim;await ctx.save()}
   if(!fixture.d3.state.trialEndsAt){
    const granted=ctx.good(await ctx.http('/functions/v1/billing',{method:'POST',token:fixture.sessions[0].access_token,body:claim}))
    assert(granted.status==='trialing'&&granted.eligible===true&&typeof granted.trialEndsAt==='string','Normal trusted trial required before target creation')
    fixture.d3.state.trialEndsAt=granted.trialEndsAt;await ctx.save()
   }
   const runtimePath=resolve(dirname(suitePath),'fixture-preparation-runtime.mjs');await writeFile(runtimePath,await bundle('scripts/billing/d3/runtime.ts'),{mode:0o600})
   const runtime=await import(pathToFileURL(runtimePath).href+`?prepare=${randomUUID()}`)
   await prepareFixtures(ctx,runtime)
   assert(fixture.targets[0].completed&&fixture.targets[0].fixtureReady&&journal.scopes.work.registered,'Original target preparation incomplete')
  }
  if(!journal.scopes.work.registered)await registerFixtureScope(ctx,'work',[fixture.ownerId])
  journal.prepared=true;await ctx.save()
 }
 assert(journal.prepared,'Original fixture preparation is incomplete')
 const saveSuite=async()=>{
  if(journal.pilot)suite.pilot=journal.pilot
  if(journal.cleaned&&journal.cleanup?.verified){suite.completed[profile.journey]={verified:true,initialPeriod:journal.initialPeriod===true,initialSwitch:journal.initialSwitch===true,journal:planned.privatePath};suite.active=null}
  await savePrivate(suitePath,suite)
 }
 return{privatePath:planned.privatePath,journal,suite,saveSuite}
}
