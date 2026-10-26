/**
 * [INPUT]: One prepared 0600 D3 fixture journal, exact development window and the shared provider policy.
 * [OUTPUT]: Original intents, independent current/paid-next acceptance, authoritative A retained checkpoints and safe RC diagnostics.
 * [POS]: D3 attach-only execution context. Auth acquisition, readiness and lifecycle cleanup remain coordinated externally.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve,isAbsolute} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import {requireWindow} from './cli.mjs'
import {bundle} from '../build.mjs'
import {privateConfig} from '../private-config.mjs'
import {testStripe} from '../stripe-client.mjs'
import {recordD3ProviderGraph} from '../provider-fixtures.mjs'
import {fixtureContext,q,uuid} from '../../lifecycle/fixture-support.mjs'
import {LocalSqliteLedger} from '../../lifecycle/ledger.mjs'
import {createD3ProviderPolicy,attachD3ProviderPolicy} from '../../lifecycle/provider-fixture.mjs'
import {prepareFixture} from './provision.mjs'
import {readRecognitionDiagnostic,recognitionDiagnosticFailure} from './rc-diagnostics.mjs'

const id=value=>typeof value==='string'?value:value?.id
const pending=code=>{throw Error(`d3_pending:${code}`)}
export async function openPilotContext(profile){
 requireWindow(profile.lease)
 const {privatePath,journal,saveSuite}=await prepareFixture(profile)
 assert.equal(journal.profile,'d3-current-d2');assert.equal(journal.project,'asqyvcnxdltzzfutbbqy')
 assert(uuid.test(journal.runId)&&journal.fixtures?.length===1,'One original fixture per journal required')
 const fixture=journal.fixtures[0]
 assert.equal(fixture.journey,profile.journey);assert(uuid.test(fixture.ownerId)&&uuid.test(fixture.subjectId))
 assert(fixture.provider&&fixture.provider.subjectId===fixture.subjectId&&fixture.provider.ownerId===fixture.ownerId)
 assert(isAbsolute(journal.ledgerPath),'Original independent development ledger path required')
 assert(journal.scopes?.work?.registered&&journal.scopes.cleanup,'Original work and cleanup capabilities required')
 if(profile.journey!=='A')assert(journal.previousFixtureCleanup?.verified===true,'Previous fixture cleanup must be verified first')
 const directory=resolve(profile.output);await mkdir(directory,{recursive:true})
 const runtimePath=resolve(directory,'current-runtime.mjs');await writeFile(runtimePath,await bundle('scripts/billing/d3/runtime.ts'))
 const runtime=await import(pathToFileURL(runtimePath).href+`?attempt=${randomUUID()}`)
 const lifecycle=await fixtureContext({lease:profile.lease,journal,privatePath,applicationName:`d2-install:${randomUUID()}`})
 const env=await privateConfig(),{stripe,key}=await testStripe()
 const config={...JSON.parse(env.BILLING_CONFIG??'{}'),url:'https://asqyvcnxdltzzfutbbqy.supabase.co',serviceKey:lifecycle.serviceKey,stripeKey:key,
  stripeWebhookSecret:env.BILLING_STRIPE_WEBHOOK_SECRET,rcPublicKey:env.BILLING_RC_PUBLIC_KEY,rcSecretKey:env.BILLING_RC_SECRET_KEY,
  rcWebhookSecret:env.BILLING_RC_WEBHOOK_SECRET,workerSecret:env.BILLING_WORKER_SECRET}
 runtime.validateConfig(config)
 const ledger=new LocalSqliteLedger(journal.ledgerPath)
 const policy=createD3ProviderPolicy({manifest:fixture.provider,runtime,billingConfig:config,stripe,ledger})
 attachD3ProviderPolicy(lifecycle,policy)
 await lifecycle.guard({subjectId:fixture.subjectId,ownerId:fixture.ownerId})
 if(profile.stage!=='cleanup')assert(await lifecycle.authIdentity(fixture),'Original fixture Auth identity is missing; never recreate it')
 fixture.d3??={requests:{},intents:{},completed:{},state:{}}
 const state=fixture.d3.state,save=async()=>{await lifecycle.save();await saveSuite()}
 const recordEffect=label=>{
  fixture.provider.effects??=[]
  let effect=fixture.provider.effects.find(row=>row.id===label)
  if(!effect){effect={id:label,key:`goalloom-d3-${journal.runId}-${profile.journey}-${label}`,state:'prepared'};fixture.provider.effects.push(effect)}
  return effect
 }
 const mutate=async(label,run,read)=>{
  const effect=recordEffect(label)
  if(effect.state!=='prepared'){
   const result=await read(effect.result)
   if(!result)pending('original_mutation_readback_required')
   if(effect.state!=='confirmed')pending('original_mutation_outcome_unknown')
   return result
  }
  await lifecycle.guard({subjectId:fixture.subjectId,ownerId:fixture.ownerId})
  effect.state='dispatched';effect.startedAt=new Date().toISOString();await save()
  try{
   const result=await run(effect.key)
   effect.result={id:result.id}
   if(label==='clock-create')fixture.provider.clock=result.id
   if(label==='customer-create'){
    assert.equal(result.livemode,false);assert.equal(result.metadata.app_user_id,fixture.ownerId);assert.equal(result.metadata.environment,'development')
    assert.equal(id(result.test_clock)??null,fixture.provider.clock)
    fixture.provider.customer=result.id
   }
   if(label==='subscription-create'){
    assert.equal(result.livemode,false);assert.equal(id(result.customer),fixture.provider.customer)
    assert.equal(result.metadata.app_user_id,fixture.ownerId);assert.equal(result.metadata.environment,'development')
    if(!fixture.provider.subscriptions.includes(result.id))fixture.provider.subscriptions.push(result.id)
   }
   effect.state='confirmed';effect.finishedAt=new Date().toISOString();await save()
   return result
  }catch(error){if(effect.state!=='confirmed')effect.state=[400,401,402,403,404].includes(error.statusCode)?'not_applied':'unknown';await save();throw error}
 }
 const call=async body=>{
  await lifecycle.refresh(fixture)
  const response=await lifecycle.http('/functions/v1/billing',{method:body?'POST':'GET',token:fixture.sessions[0].access_token,body})
  if(response.status===202){await collectRecognitionDiagnostic({reason:'reconcile_202'});pending('revenuecat_recognition')}
  if(response.status!==200){const error=Error('Authoritative billing request did not complete');error.definitive=[400,401,403,404,409].includes(response.status);throw error}
  return response.body
 }
 const action=async(action,cycle,label)=>{
  let intent=fixture.d3.requests[label]
  if(!intent){intent={action,requestId:randomUUID(),...(cycle?{cycle}:{})}
   if(action==='checkout')intent.continuation={version:1,id:randomUUID(),locale:'en',transport:'loopback',port:43111}
   fixture.d3.requests[label]=intent;await save()
  }
  assert.equal(intent.action,action);assert.equal(intent.cycle,cycle)
  const effect=recordEffect(`backend-${label}`)
  if(effect.state==='confirmed'){
   if(action==='switch')await recordSchedule()
   return effect.result
  }
  if(effect.state!=='prepared'){
   if(action==='checkout')await call({action:'reconcile',operation:{requestId:intent.requestId,action,cycle,continuation:intent.continuation}})
   pending('original_backend_outcome_unknown')
  }
  effect.state='dispatched';await save()
  try{
   const result=await call(intent);effect.state='confirmed';effect.result=result;await save()
   if(action==='switch')await recordSchedule()
   return result
  }
  catch(error){effect.state=error.definitive?'not_applied':'unknown';await save();throw error}
 }
 const recordSchedule=async()=>{
  const sub=await stripe.subscriptions.retrieve(state.subscription)
  assert.equal(id(sub.customer),fixture.provider.customer);assert(fixture.provider.subscriptions.includes(sub.id)&&sub.schedule)
  const schedule=await stripe.subscriptionSchedules.retrieve(id(sub.schedule))
  assert.equal(id(schedule.customer),fixture.provider.customer);assert.equal(id(schedule.subscription),sub.id)
  if(!fixture.provider.schedules.includes(schedule.id))fixture.provider.schedules.push(schedule.id)
  await save()
 }
 const subjectRpc=async(name,args)=>{
  await lifecycle.guard({subjectId:fixture.subjectId,ownerId:fixture.ownerId})
  return lifecycle.good(await lifecycle.http(`/rest/v1/rpc/${name}`,{method:'POST',scopeHeader:true,body:{p_environment:'development',p_user:fixture.subjectId,...args}}))
 }
 const captureGraph=async()=>{
  const graph=await recordD3ProviderGraph({stripe,manifest:fixture.provider,persist:()=>save()})
  const deliveries=await lifecycle.db.query(`select event_id id,event_type type,object_id object,extract(epoch from occurred_at)::double precision created from public.billing_inbox where environment='development' and provider='revenuecat' and subject_id=${q(fixture.subjectId)} order by received_at,event_id limit 1001`)
  assert(deliveries.length<=1000&&deliveries.every(row=>row.object===null&&typeof row.id==='string'&&row.id.length<=200&&/^[A-Za-z0-9._]+$/.test(row.type)&&Number.isFinite(row.created)))
  for(const known of fixture.provider.rcEvents)assert(deliveries.some(row=>row.id===known.id&&row.type===known.type&&row.created===known.created),'Original RC delivery changed or disappeared')
  fixture.provider.rcEvents=deliveries
  await save();return graph
 }
 const charge=async invoice=>{
  const list=await stripe.invoicePayments.list({invoice,limit:100});assert(!list.has_more&&list.data.length===1)
  const payment=list.data[0].payment
  const chargeId=payment.charge?id(payment.charge):id((await stripe.paymentIntents.retrieve(id(payment.payment_intent))).latest_charge)
  const result=await stripe.charges.retrieve(chargeId);assert.equal(id(result.customer),state.customer);assert.equal(result.livemode,false)
  return result
 }
 let recognized,lastRecognitionDiagnostic=null
 const collectRecognitionDiagnostic=async({invoiceId,cycle,reason})=>{
  try{
   assert(state.subscription&&fixture.provider.subscriptions.includes(state.subscription),'Original provider subscription required')
   await lifecycle.guard({subjectId:fixture.subjectId,ownerId:fixture.ownerId})
   const sub=await stripe.subscriptions.retrieve(state.subscription)
   assert.equal(sub.id,state.subscription);assert.equal(id(sub.customer),fixture.provider.customer)
   assert.equal(sub.metadata?.app_user_id,fixture.ownerId);assert.equal(sub.metadata?.environment,'development');assert.equal(sub.livemode,false)
   const actual=await stripe.invoices.retrieve(invoiceId??id(sub.latest_invoice))
   assert.equal(id(actual.customer),fixture.provider.customer);assert.equal(id(actual.parent?.subscription_details?.subscription),sub.id)
   const line=await policy.providers.invoiceLine(actual)
   const actualCycle=cycle??Object.keys(config.prices).find(key=>config.prices[key]===line.price)
   lastRecognitionDiagnostic=await readRecognitionDiagnostic({providers:policy.providers,config,ownerId:fixture.ownerId,subscription:sub,invoice:actual,line,cycle:actualCycle,reason})
  }catch(error){lastRecognitionDiagnostic={version:1,readOnly:true,remoteWrites:0,observedAt:new Date().toISOString(),...recognitionDiagnosticFailure(reason,error)}}
 }
 const assertRecognized=async(invoice,cycle)=>{
  await captureGraph()
  await collectRecognitionDiagnostic({invoiceId:invoice,cycle,reason:'assert_recognized'})
  const row=(await lifecycle.db.query(`select invoice_id,subscription_id,price_id,starts_at,ends_at,rc_verified,disposition,amount_cents from public.billing_transactions where environment='development' and subject_id=${q(fixture.subjectId)} and invoice_id=${q(invoice)}`))[0]
  if(!row?.rc_verified)pending('revenuecat_recognition')
  const actual=await stripe.invoices.retrieve(invoice)
  assert.equal(row.price_id,config.prices[cycle])
  const line=actual.lines.data.find(line=>id(line.pricing?.price_details?.price)===row.price_id)
  assert(line&&!actual.lines.has_more,'Exact invoice service line required')
  assert.equal(row.subscription_id,state.subscription);assert.equal(row.disposition,'paid')
  assert.equal(Date.parse(row.starts_at),line.period.start*1000);assert.equal(Date.parse(row.ends_at),line.period.end*1000)
  const sub=await stripe.subscriptions.retrieve(state.subscription),item=sub.items.data[0]
  const providers=policy.providers,rc=await providers.rc(`/v2/projects/${config.rcProject}/subscriptions?store_subscription_identifier=${encodeURIComponent(item.id)}&include_scheduled=true`)
  // The v2 period is independently observed; a verified invoice flag alone cannot pass the clock pilot.
  if(!Array.isArray(rc.items)||rc.next_page)pending('revenuecat_period_mismatch')
  let exact,rcPeriodSource
  for(const candidate of rc.items){
   if(candidate.store_subscription_identifier!==item.id||candidate.customer_id!==fixture.ownerId||candidate.original_customer_id!==fixture.ownerId
    ||candidate.store!=='stripe'||candidate.environment!=='sandbox'||!candidate.entitlements?.items?.some(entry=>entry.lookup_key==='plus'))continue
   const periods=[{source:'current',value:candidate,product:candidate.product_id}],change=candidate.pending_changes
   if(candidate.auto_renewal_status==='has_already_renewed'&&change&&typeof change==='object'&&!Array.isArray(change)){
    const value=Object.fromEntries(['store_subscription_identifier','current_period_starts_at','current_period_ends_at','status','pending_payment','gives_access'].map(key=>[key,Object.hasOwn(change,key)?change[key]:candidate[key]]))
    if(value.status==='active'&&Number.isSafeInteger(value.current_period_starts_at)&&Number.isSafeInteger(candidate.current_period_ends_at)
     &&value.current_period_starts_at>=candidate.current_period_ends_at&&value.current_period_ends_at===candidate.ends_at){
     periods.push({source:'paid_next',value,product:Object.hasOwn(change,'product')?change.product?.id??null:candidate.product_id})
    }
   }
   for(const period of periods){
    const value=period.value
    if(value.store_subscription_identifier!==item.id||value.gives_access!==true||value.pending_payment!==false||!['active','in_grace_period'].includes(value.status)
     ||value.current_period_starts_at!==line.period.start*1000||value.current_period_ends_at!==line.period.end*1000
     ||typeof period.product!=='string'||!/^prod[A-Za-z0-9_]{1,250}$/.test(period.product))continue
    const product=await providers.rc(`/v2/projects/${config.rcProject}/products/${encodeURIComponent(period.product)}`)
    if(product.app_id===config.rcApp&&[row.price_id,id(item.price.product)].includes(product.store_identifier)){exact=candidate;rcPeriodSource=period.source;break}
   }
   if(exact)break
  }
  if(!exact)pending('revenuecat_period_mismatch')
  recognized={invoice,startsAt:row.starts_at,endsAt:row.ends_at,rcPeriodMatches:true,rcPeriodSource,rcSubscription:exact.id}
 }
 return{fixture,journal,state,config,stripe,runId:journal.runId,lifecycle,privatePath,apiOrigin:config.url,save,mutate,action,call,captureGraph,charge,assertRecognized,
  recognitionDiagnostic:()=>lastRecognitionDiagnostic===null?null:structuredClone(lastRecognitionDiagnostic),
  recordCheckout:async session=>{
   assert.equal(session.livemode,false);assert.equal(id(session.customer),fixture.provider.customer)
   assert.equal(session.metadata.app_user_id,fixture.ownerId);assert.equal(session.metadata.environment,'development')
   assert.equal(session.metadata.request_id,fixture.d3.requests.checkout.requestId)
   if(!fixture.provider.checkouts.includes(session.id))fixture.provider.checkouts.push(session.id)
   await save()
  },
  databaseNow:async()=>Math.floor(Date.parse((await lifecycle.db.query('select clock_timestamp() now'))[0].now)/1000),
  setTime:async value=>{
   assert(Number.isSafeInteger(value)&&value>=state.clockStart&&value<=state.clockStart+3*366*86400)
   await lifecycle.guard({subjectId:fixture.subjectId,ownerId:fixture.ownerId})
   const headers=JSON.stringify({'x-goalloom-lifecycle-scope':lifecycle.scopeHeader()})
   await lifecycle.db.query(`do $$begin perform set_config('request.headers',${q(headers)},true);perform service_private.assert_worker_target('development',${q(fixture.subjectId)});update public.billing_accounts set test_now=to_timestamp(${value}) where environment='development' and subject_id=${q(fixture.subjectId)};if not found then raise exception 'fixture_account_missing';end if;end $$;`,false)
   state.testNow=value;await save()
  },
  bindCustomer:async customer=>{
   assert.equal(customer,fixture.provider.customer)
   const lock=await subjectRpc('billing_lock',{});assert(uuid.test(lock.lease))
   try{await subjectRpc('billing_bind_customer',{p_lease:lock.lease,p_customer:customer})}
   finally{await subjectRpc('billing_unlock',{p_lease:lock.lease})}
  },
  reconcile:async()=>{await captureGraph();return call({action:'reconcile'})},
  checkpoint:async()=>{
   const graph=await captureGraph()
   const inbox=()=>lifecycle.db.query(`select provider,event_id,status,lease,attempts from public.billing_inbox where environment='development' and subject_id=${q(fixture.subjectId)} order by received_at,event_id limit 1001`)
   const before=await inbox();assert(before.length<=1000)
   const worker=lifecycle.good(await lifecycle.http('/functions/v1/billing/worker',{method:'POST',token:config.workerSecret,scopeHeader:true,body:{}}))
   const after=await inbox();assert(after.length<=1000)
   const completed=before.filter(row=>row.status==='pending'||row.status==='processing').filter(row=>after.some(next=>next.provider===row.provider&&next.event_id===row.event_id&&next.status==='complete'))
   const publicState=await call()
   let retainedTarget
   if(profile.journey==='A'&&profile.stage==='expire'){
    assert(fixture.targets.length===1&&fixture.targets[0].completed,'Original initialized A target required')
    const {workspaceId,generation}=fixture.targets[0]
    await lifecycle.guard({subjectId:fixture.subjectId,workspaceId,generation})
    const status=lifecycle.good(await lifecycle.lifecycle(fixture,'status',{version:1,query:{kind:'generation',target:{workspaceId,generation}}}))
    assert(status.ok===true&&status.environment==='development'&&status.projectRef==='asqyvcnxdltzzfutbbqy'&&status.entries?.length===1,'Authoritative original generation status required')
    const entry=status.entries[0]
    assert(entry.target?.workspaceId===workspaceId&&entry.target?.generation===generation&&entry.state==='retained'&&entry.reason==='ordinary_expiry','Original A generation is not retained')
    assert(typeof entry.retrieveUntil==='string'&&Number.isFinite(Date.parse(entry.retrieveUntil))&&entry.retrievalWindowOpen===true,'Authoritative retained window must be open')
    retainedTarget={workspaceId,generation,retrieveUntil:entry.retrieveUntil,retrievalWindowOpen:entry.retrievalWindowOpen}
   }
   const now=(await lifecycle.db.query(`select clock_timestamp() wall_now,test_now from public.billing_accounts where environment='development' and subject_id=${q(fixture.subjectId)}`))[0]
   const frozen=state.clock?await stripe.testHelpers.testClocks.retrieve(state.clock):null
   return{...recognized,publicState,...(retainedTarget?{retainedTarget}:{}),worker:{response:worker,completedOwnedEvents:completed.map(row=>({provider:row.provider,eventId:row.event_id}))},clocks:{databaseWallTime:now.wall_now,billingTestNow:now.test_now,stripeFrozenTime:frozen?.frozen_time??null,providerEvents:graph.events.map(row=>({id:row.id,created:row.created}))},counts:Object.fromEntries(Object.entries(graph.records).map(([key,rows])=>[key,rows.length]))}
  },
  close:async()=>{ledger.close();await saveSuite()},
 }
}
