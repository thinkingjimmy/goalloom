/**
 * [INPUT]: Real development Auth/PostgreSQL and controlled Stripe/RevenueCat transports.
 * [OUTPUT]: Repeatable HTTP journeys, concurrency/receipt evidence and scoped fixture cleanup.
 * [POS]: D0 integration acceptance; provider fixtures do not establish live sandbox connectivity.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { client, developmentUrl } from '../hosted-ai/client.mjs'
import { bundle } from './build.mjs'
import { providerFixture } from './fixtures.mjs'
import { cleanupFixtures } from './cleanup-fixtures.mjs'
const directory = 'output/tests/billing/desktop'
await mkdir(directory,{recursive:true})
await writeFile(`${directory}/http-runtime.mjs`,await bundle())
const { createBillingHandler } = await import(pathToFileURL(`${process.cwd()}/${directory}/http-runtime.mjs`))
const db=await client(), keys=await db.request('/api-keys?reveal=true')
const serviceKey=keys.find(value=>value.name==='service_role')?.api_key,anon=keys.find(value=>value.name==='anon')?.api_key
assert(serviceKey&&anon,'Development Auth keys unavailable')
db.hide(serviceKey);db.hide(anon)
const config={environment:'development',url:developmentUrl,serviceKey,account:'acct_1QvwdlITpGuR8ZMB',rcProject:'projd720c733',rcApp:'appfixture',
  prices:{monthly:'price_FixtureMonth',annual:'price_FixtureYear'},portalConfiguration:'bpc_Fixture',returnUrl:'https://www.goalloom.com/billing/return/',
  cancelUrl:'https://www.goalloom.com/billing/continue/',webOrigin:'https://www.goalloom.com',stripeKey:'rk_test_fixture',stripeWebhookSecret:randomUUID(),
  rcPublicKey:'stripe_fixture',rcSecretKey:'sk_fixture',rcWebhookSecret:randomUUID(),workerSecret:randomUUID(),automaticTax:false,taxRegistrationVerified:false}
const report={ok:false,scope:'Loopback HTTP with real development Auth/PostgreSQL and controlled Stripe/RevenueCat adapters. No real provider payment or packaged desktop acceptance.',checks:[],platform:{node:process.version,os:process.platform,arch:process.arch},realProviderCalls:0}
const created=[],events=[],fixture=providerFixture(config)
let server,sourceConfigured=false,authFailure=0
const auth=async(path,{method='GET',body,token=serviceKey}={})=>{
  const response=await fetch(`${developmentUrl}${path}`,{method,headers:{authorization:`Bearer ${token}`,apikey:token===serviceKey?serviceKey:anon,'content-type':'application/json'},
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20_000),redirect:'error'})
  const value=await response.text();return {status:response.status,body:value?JSON.parse(value):null}
}
const sql=async(query)=>db.query(query,false)
const mark=(name)=>report.checks.push(name)
try{
  const before=await db.query("select p.enabled,(select count(*) from billing_sources) as sources from billing_policy p where environment='development'")
  assert(!before[0].enabled&&Number(before[0].sources)===0,'Controlled source fixture requires disabled/unconfigured development billing')
  for(let i=0;i<2;i++){
    const password=`${randomUUID()}aA!`
    const plannedUser=randomUUID();created.push(plannedUser);report.fixtureAccounts=[...created]
    await writeFile(`${directory}/http-acceptance.json`,JSON.stringify(report,null,2)+'\n')
    const made=await auth('/auth/v1/admin/users',{method:'POST',body:{id:plannedUser,email:`billing-${plannedUser}@goalloom.test`,password,email_confirm:true}})
    assert.equal(made.status,200);assert.equal(made.body.id,plannedUser)
    const session=await auth('/auth/v1/token?grant_type=password',{method:'POST',token:anon,body:{email:made.body.email,password}})
    assert.equal(session.status,200);db.hide(session.body.access_token)
    if(i===0){fixture.state.owner=made.body.id;report.account=made.body.id;var token=session.body.access_token
      const second=await auth('/auth/v1/token?grant_type=password',{method:'POST',token:anon,body:{email:made.body.email,password}})
      assert.equal(second.status,200);var secondToken=second.body.access_token;db.hide(secondToken);assert.notEqual(token,secondToken)
    }
  }
  await sql("begin;update billing_policy set enabled=true where environment='development';insert into billing_sources(environment,source,account_id,rc_project,rc_app,monthly_price,annual_price,enabled) values('development','stripe','acct_1QvwdlITpGuR8ZMB','projd720c733','appfixture','price_FixtureMonth','price_FixtureYear',true);commit;")
  sourceConfigured=true
  const providersModule=await bundle('supabase/functions/billing/providers.ts')
  await writeFile(`${directory}/providers-runtime.mjs`,providersModule)
  const {BillingProviders}=await import(pathToFileURL(`${process.cwd()}/${directory}/providers-runtime.mjs`))
  const providers=new BillingProviders(config,fixture.rcFetch,fixture.stripe)
  const handler=createBillingHandler(config,{providers,fetch:async(url,init)=>{
    if(authFailure&&String(url).endsWith('/auth/v1/user'))return Response.json({}, {status:authFailure})
    return fetch(url,init)
  }})
  const closed=createBillingHandler({})
  assert.equal((await closed(new Request('http://127.0.0.1/billing'))).status,503);mark('Empty-secret composition root returns billing_configuration')
  server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks)
    const request=new Request(`http://127.0.0.1${req.url}`,{method:req.method,headers:req.headers,...(body.length?{body}: {})})
    const response=await handler(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
  }catch{res.writeHead(500);res.end('{}')}})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const base=`http://127.0.0.1:${server.address().port}`
  const call=async(body,{path='/billing',headers={},method=body?'POST':'GET'}={})=>{const response=await fetch(base+path,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()}}
  assert.equal((await call(null,{headers:{authorization:'Bearer invalid'}})).status,401)
  authFailure=503;assert.equal((await call()).status,503);authFailure=429;assert.equal((await call()).status,503);authFailure=0
  assert.equal((await call({action:'claim_trial',requestId:randomUUID(),userId:created[1]})).status,400)
  for(const body of ['{','null','[]',new Uint8Array([0xc3,0x28])]){
    const response=await fetch(base+'/billing',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body})
    assert.equal(response.status,400);assert.equal((await response.json()).error,'invalid_request')
  }
  const oversized=await fetch(base+'/billing',{method:'POST',headers:{authorization:`Bearer ${token}`},body:'x'.repeat(4097)})
  assert.equal(oversized.status,413)
  mark('Real Auth identity, Auth 401 versus transient 429/503, malformed JSON/UTF-8 400, oversized 413 and identity injection refusal')
  const trials=await Promise.all([call({action:'claim_trial',requestId:randomUUID()}),call({action:'claim_trial',requestId:randomUUID()},{headers:{authorization:`Bearer ${secondToken}`}})])
  assert(trials.every(value=>value.status===200&&value.body.status==='trialing'))
  assert.equal(trials[0].body.trialReceipt,trials[1].body.trialReceipt)
  const trialEnd=trials[0].body.trialEndsAt
  assert.equal(Date.parse(trialEnd)-Date.parse(trials[0].body.trialStartedAt),192*3600_000)
  assert.equal(fixture.state.providerCalls,0);assert.equal(fixture.state.customers.length,0)
  mark('Two concurrent authenticated sessions share one real database 192-hour trial and original receipt; no payment call')
  const rpc=async(name,args)=>auth(`/rest/v1/rpc/${name}`,{method:'POST',body:args})
  const locks=await Promise.all(created.map(id=>rpc('billing_lock',{p_environment:'development',p_user:id})))
  assert(locks.every(value=>value.status===200&&value.body.lease))
  for(let i=0;i<created.length;i++)assert([200,204].includes((await rpc('billing_bind_customer',{p_environment:'development',p_user:created[i],p_lease:locks[i].body.lease,p_customer:`cus_Conflict${i}`})).status))
  const date=new Date().toISOString(),end=new Date(Date.now()+86400000).toISOString()
  const conflicts=await Promise.all(created.map((id,i)=>rpc('billing_commit',{p_environment:'development',p_user:id,p_lease:locks[i].body.lease,
    p_subscriptions:[{subscription_id:'sub_Conflict',customer_id:`cus_Conflict${i}`,status:'active',price_id:config.prices.monthly,period_start:date,period_end:end,cancel_at_period_end:false}],p_transactions:[],p_grace:[]})))
  assert.equal(conflicts.filter(value=>value.status===200).length,1)
  const owned=await db.query("select user_id,customer_id from billing_subscriptions where subscription_id='sub_Conflict'")
  assert.equal(owned.length,1);assert.equal(owned[0].customer_id,`cus_Conflict${created.indexOf(owned[0].user_id)}`)
  await sql(`begin;delete from billing_subscriptions where user_id in ('${created.join("','")}');delete from billing_customers where user_id in ('${created.join("','")}');update billing_accounts set lease=null,lease_until=null where user_id in ('${created.join("','")}');commit;`)
  mark('Concurrent real PostgreSQL commits with one provider subscription ID preserve exactly one immutable owner/customer binding')
  const checkoutId=randomUUID();fixture.state.dropCheckout=true
  assert.equal((await call({action:'checkout',cycle:'monthly',requestId:checkoutId})).status,503)
  const checkout=await call({action:'checkout',cycle:'monthly',requestId:randomUUID()})
  assert.equal(checkout.status,200);assert.equal(fixture.state.sessions.length,1)
  assert.equal((await call()).body.trialEndsAt,trialEnd)
  const written=fixture.state.writes.find(value=>value.mode==='subscription')
  assert.equal(written.metadata.app_user_id,created[0]);assert.equal(written.subscription_data.metadata.app_user_id,created[0]);assert.equal(written.allow_promotion_codes,false)
  assert(!('trial_period_days' in written.subscription_data));assert(!('payment_method_types' in written))
  mark('Unknown checkout response resumes original session across request IDs; unpaid checkout preserves trial; identity and no-promotion metadata')
  const now=Date.now(),sub=fixture.state.purchase(now)
  await sql(`update billing_accounts set test_now='${new Date(now).toISOString()}' where user_id='${created[0]}'`)
  report.clock='Injected development account clock, independent of Stripe/provider clocks'
  fixture.state.rcAccess=false
  let result=await call({action:'reconcile'})
  assert.equal(result.status,200);assert.equal(result.body.status,'trialing');assert.equal(result.body.eligible,true);assert.equal(result.body.trialConsumed,false);assert.equal(result.body.trialEndsAt,trialEnd)
  fixture.state.rcAccess=true
  result=await call({action:'reconcile'});assert.equal(result.body.status,'active');assert.equal(result.body.trialConsumed,true)
  assert.equal((await db.query(`select status from billing_operations where user_id='${created[0]}' and action='checkout'`))[0].status,'complete')
  mark('RC pending preserves the existing trial and cannot authorize a new paid window; current RC window atomically confirms purchase, consumes trial and resolves checkout in background reconciliation')
  result=await call({action:'switch',cycle:'monthly',requestId:randomUUID()});assert.equal(result.body.error,'billing_invalid_cycle')
  result=await call({action:'switch',cycle:'annual',requestId:randomUUID()});assert.equal(result.status,200)
  const schedule=fixture.state.schedules[0];assert.equal(schedule.phases[0].end_date,sub.items.data[0].current_period_end);assert.equal(schedule.phases[1].items[0].price,config.prices.annual)
  result=await call({action:'cancel',requestId:randomUUID()});assert.equal(result.status,200);assert.equal(sub.schedule,null);assert.equal(sub.cancel_at_period_end,true)
  result=await call({action:'switch',cycle:'annual',requestId:randomUUID()});assert.equal(result.body.error,'renewal_confirmation_required')
  result=await call({action:'resume',requestId:randomUUID()});assert.equal(result.status,200);assert.equal(sub.cancel_at_period_end,false)
  mark('Deterministic switch refusal closes receipt; annual switch waits for period end; schedule release precedes cancellation; cancelled switch cannot silently resume renewal')
  const stamp=Math.floor(Date.now()/1000),eventId=`fixture-${randomUUID()}`;events.push(eventId)
  const payload={event:{id:eventId,type:'RENEWAL',app_id:config.rcApp,app_user_id:created[0],store:'STRIPE',environment:'SANDBOX',event_timestamp_ms:Date.now()}}
  const signature=`t=${stamp},v1=${createHmac('sha256',config.rcWebhookSecret).update(`${stamp}.${JSON.stringify(payload)}`).digest('hex')}`
  assert.equal((await call(payload,{path:'/billing/revenuecat',headers:{'x-revenuecat-webhook-signature':signature}})).status,200)
  assert.equal((await call(payload,{path:'/billing/revenuecat',headers:{'x-revenuecat-webhook-signature':signature}})).status,200)
  assert.equal((await db.query(`select count(*) as n from billing_inbox where event_id='${eventId}'`))[0].n,1)
  assert.equal((await call({...payload,event:{...payload.event,type:'CANCELLATION'}},{path:'/billing/revenuecat',headers:{'x-revenuecat-webhook-signature':signature}})).status,401)
  const secondEventId=`fixture-${randomUUID()}`;events.push(secondEventId)
  const secondPayload={event:{...payload.event,id:secondEventId}}
  const secondSignature=`t=${stamp},v1=${createHmac('sha256',config.rcWebhookSecret).update(`${stamp}.${JSON.stringify(secondPayload)}`).digest('hex')}`
  assert.equal((await call(secondPayload,{path:'/billing/revenuecat',headers:{'x-revenuecat-webhook-signature':secondSignature}})).status,200)
  await sql(`update billing_accounts set reconcile_at=clock_timestamp()-interval '1 second' where user_id='${created[0]}'`)
  const callsBeforeWorker=fixture.state.providerCalls
  const worker=await call({}, {path:'/billing/worker',headers:{authorization:`Bearer ${config.workerSecret}`}});assert.equal(worker.status,200)
  assert.equal(fixture.state.providerCalls-callsBeforeWorker,4,'Two events plus the same due account must use one provider snapshot')
  assert(Number.isFinite(worker.body.elapsedMs))
  assert.equal((await db.query(`select status from billing_inbox where event_id='${eventId}'`))[0].status,'complete')
  mark('Raw-body HMAC, durable event deduplication, tamper refusal and one shared provider snapshot for same-account events and scheduled work')
  const periodStart=sub.items.data[0].current_period_start,periodEnd=sub.items.data[0].current_period_end
  fixture.state.refunds.push({charge:'ch_in_Fixture',amount:899,status:'succeeded',created:periodStart+60})
  result=await call({action:'reconcile'});assert.equal(result.body.status,'revoked');assert.equal(result.body.trialConsumed,true);assert(sub.cancel_at_period_end)
  result=await call({action:'resume',requestId:randomUUID()});assert.equal(result.status,200);assert.equal(sub.cancel_at_period_end,false)
  await call({action:'reconcile'});assert.equal(sub.cancel_at_period_end,false)
  mark('Full current refund revokes only that invoice, never restores trial and stops renewal once; later explicit resume survives reconciliation')
  const next=fixture.state.invoice('in_Later',periodStart+120,periodEnd+120,'paid','subscription_cycle');sub.latest_invoice=next.id
  sub.items.data[0].current_period_start=periodStart+120;sub.items.data[0].current_period_end=periodEnd+120
  await sql(`update billing_accounts set test_now='${new Date((periodStart+180)*1000).toISOString()}' where user_id='${created[0]}'`)
  result=await call({action:'reconcile'});assert.equal(result.body.status,'active');assert.equal(sub.cancel_at_period_end,false)
  fixture.state.refunds.push({charge:'ch_in_Later',amount:1,status:'succeeded',created:periodStart+180})
  result=await call({action:'reconcile'});assert.equal(result.body.status,'active')
  fixture.state.disputes.push({charge:'ch_in_Later',status:'needs_response',created:periodStart+180})
  result=await call({action:'reconcile'});assert.equal(result.body.status,'revoked')
  fixture.state.disputes[0].status='won';result=await call({action:'reconcile'});assert.equal(result.body.status,'active')
  mark('Old refund and partial refund preserve later paid invoice; verified dispute pauses affected window and won dispute restores its remaining access')
  sub.cancel_at_period_end=false;sub.status='past_due'
  const boundary=periodEnd+120;sub.items.data[0].current_period_start=boundary;sub.items.data[0].current_period_end=boundary+30*86400
  const failed=fixture.state.invoice('in_Failed',boundary,boundary+30*86400,'open','subscription_cycle');sub.latest_invoice=failed.id;fixture.state.rcPending=true
  await sql(`update billing_accounts set test_now='${new Date((boundary+3600)*1000).toISOString()}' where user_id='${created[0]}'`)
  result=await call({action:'reconcile'});assert.equal(result.body.status,'active');assert.equal(result.body.grace,true)
  result=await call({action:'cancel',requestId:randomUUID()});assert.equal(result.body.grace,true)
  assert.equal(Date.parse(result.body.effectiveEnd),(boundary+72*3600)*1000)
  await sql(`update billing_accounts set test_now='${new Date((boundary+72*3600)*1000).toISOString()}' where user_id='${created[0]}'`)
  result=await call({action:'reconcile'});assert.equal(result.body.eligible,false);assert.equal(fixture.state.voided,1);assert.equal(fixture.state.stopped,1)
  mark('Failed renewal retains fixed 72-hour grace after user cancellation; exact deadline voids unpaid invoice and stops future billing')
  for(const stage of ['void','release','cancel']){
    const interrupted=fixture.state.invoice(`in_Interrupted${stage}`,boundary,boundary+30*86400,'open','subscription_cycle')
    sub.latest_invoice=interrupted.id;sub.status='past_due';sub.cancel_at_period_end=false
    if(stage==='release'){sub.schedule=`sub_sched_${stage}`;fixture.state.schedules.push({id:sub.schedule,status:'active',subscription:sub.id,customer:sub.customer,phases:[]})}
    fixture.state.dropAfter=stage
    result=await call({action:'reconcile'});assert.equal(result.status,503)
    result=await call({action:'reconcile'});assert.equal(result.status,200);assert.equal(interrupted.status,'void');assert.equal(sub.status,'canceled');assert.equal(sub.schedule,null)
    assert.equal((await db.query(`select status from billing_compensations where user_id='${created[0]}' and invoice_id='${interrupted.id}' and reason='grace'`))[0].status,'complete')
  }
  mark('Durable grace intent recovers after void, schedule release and subscription cancellation independently lose their responses')
  const afterIntent=fixture.state.invoice('in_PaidAfterIntent',boundary,boundary+30*86400,'open','subscription_cycle')
  sub.latest_invoice=afterIntent.id;sub.status='active';sub.cancel_at_period_end=false;fixture.state.rcPending=false
  const held=await rpc('billing_lock',{p_environment:'development',p_user:created[0]})
  assert.equal((await rpc('billing_compensation',{p_environment:'development',p_user:created[0],p_lease:held.body.lease,p_invoice:afterIntent.id,p_reason:'grace',p_complete:false})).status,200)
  await rpc('billing_unlock',{p_environment:'development',p_user:created[0],p_lease:held.body.lease})
  afterIntent.status='paid';afterIntent.amount_paid=899;afterIntent.amount_remaining=0;afterIntent.status_transitions.paid_at=boundary+1
  result=await call({action:'reconcile'});assert.equal(result.body.status,'active');assert.equal(sub.status,'active');assert.equal(sub.cancel_at_period_end,false)
  const beforeVoid=fixture.state.invoice('in_PaidBeforeVoid',boundary,boundary+30*86400,'open','subscription_cycle')
  sub.latest_invoice=beforeVoid.id;sub.status='past_due';fixture.state.rcPending=true;fixture.state.racePaidOnVoid=true
  result=await call({action:'reconcile'});assert.equal(result.status,200);assert.equal(result.body.status,'active');assert.equal(beforeVoid.status,'paid');assert.equal(sub.cancel_at_period_end,false)
  mark('Payment after closeout intent or racing invoice void completes the obsolete intent and projects paid service without cancellation')
  const leakage=JSON.stringify(report)
  for(const secret of [serviceKey,anon,token,config.rcWebhookSecret,config.workerSecret])assert(!leakage.includes(secret))
  report.ok=true
}catch(error){report.error=error.code==='ERR_ASSERTION'?{code:error.code,message:String(error.message).slice(0,300)}:{code:'acceptance_failed',message:db.safe(error.message).slice(0,300),networkCode:error.cause?.code??null};process.exitCode=1}
finally{
  if(server)await new Promise(resolve=>server.close(resolve))
  try{const cleanup=await cleanupFixtures(db,created);report.cleanup=cleanup.ok;report.cleanupErrors=cleanup.errors;if(!cleanup.ok){report.ok=false;process.exitCode=1}}
  catch{report.cleanup=false;report.ok=false;process.exitCode=1}
  await writeFile(`${directory}/http-acceptance.json`,JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
}
