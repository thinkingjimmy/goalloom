/**
 * [INPUT]: One owned fixture context, validated branch/stage, original mutation journal and Stripe Test/backend ports.
 * [OUTPUT]: A–F observations, replacement A initial-switch or planned B first-period refund/cancellation/expiry observations.
 * [POS]: D3 provider journey library. No fixture creation, cleanup policy or billing-engine replacement.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {stageSequence} from './cli.mjs'
const id=value=>typeof value==='string'?value:value?.id
const seconds=value=>Math.floor(Date.parse(value)/1000)
const period=sub=>sub.items.data[0]
const pending=message=>{throw Error(`d3_pending:${message}`)}
async function invoice(ctx,value){
 const result=await ctx.stripe.invoices.retrieve(id(value))
 assert.equal(id(result.customer),ctx.state.customer);assert.equal(result.livemode,false)
 return result
}
async function subscription(ctx){
 const result=await ctx.stripe.subscriptions.retrieve(ctx.state.subscription)
 assert.equal(id(result.customer),ctx.state.customer);assert.equal(result.livemode,false)
 assert.equal(result.metadata.app_user_id,ctx.fixture.ownerId)
 return result
}
async function clock(ctx,target,label){
 const current=await ctx.stripe.testHelpers.testClocks.retrieve(ctx.state.clock)
 if(current.status!=='ready')pending('clock_advancing')
 if(current.frozen_time<target){
  await ctx.mutate(label,key=>ctx.stripe.testHelpers.testClocks.advance(current.id,{frozen_time:target},{idempotencyKey:key}),
   ()=>ctx.stripe.testHelpers.testClocks.retrieve(current.id))
 }
 const actual=await ctx.stripe.testHelpers.testClocks.retrieve(current.id)
 if(actual.status!=='ready'||actual.frozen_time!==target)pending('clock_advancing')
 await ctx.setTime(target)
}
async function paid(ctx,bill,{cycle,automatic=false,previous,phaseChange=false}={}){
 if(automatic&&bill.status!=='paid')pending('automatic_invoice_payment')
 assert.equal(bill.status,'paid');assert(bill.amount_paid>0)
 assert.equal(bill.currency,'usd');assert.equal(bill.amount_paid,cycle==='annual'?7900:899)
 assert.equal(id(bill.parent?.subscription_details?.subscription),ctx.state.subscription)
 assert.equal(bill.total_discount_amounts?.reduce((sum,row)=>sum+row.amount,0)??0,0)
 if(automatic){assert.equal(bill.billing_reason,phaseChange?'subscription_update':'subscription_cycle');assert.notEqual(bill.id,previous)}
 const state=await ctx.reconcile()
 await ctx.assertRecognized(bill.id,cycle)
 assert.equal(state.status,'active');assert.equal(state.trialConsumed,true)
 return state
}
async function setup(ctx,journey){
 const cycle=journey==='B'?'annual':'monthly',s=ctx.state
 if(!s.trialEndsAt){
  const trial=await ctx.action('claim_trial',undefined,'trial')
  assert.equal(trial.status,'trialing');s.trialEndsAt=trial.trialEndsAt;await ctx.save()
 }
 if(!s.clockStart)s.clockStart=await ctx.databaseNow()
 if(!['E','F'].includes(journey)){
  const result=await ctx.mutate('clock-create',key=>ctx.stripe.testHelpers.testClocks.create({frozen_time:s.clockStart,name:`Goalloom D3 ${ctx.fixture.ownerId}`},{idempotencyKey:key}),
   saved=>(saved?.id??s.clock)?ctx.stripe.testHelpers.testClocks.retrieve(saved?.id??s.clock):null)
  s.clock=result.id;await ctx.save()
 }
 const customer=await ctx.mutate('customer-create',key=>ctx.stripe.customers.create({...(s.clock?{test_clock:s.clock}:{}),metadata:{app_user_id:ctx.fixture.ownerId,environment:'development',d3_run:ctx.runId}}, {idempotencyKey:key}),
  saved=>(saved?.id??s.customer)?ctx.stripe.customers.retrieve(saved?.id??s.customer):null)
 assert(!customer.livemode&&!customer.deleted);s.customer=customer.id;await ctx.save()
 await ctx.bindCustomer(s.customer)
 if(!s.checkout){
  const checkout=await ctx.action('checkout',cycle,'checkout')
  assert.equal(checkout.status,'checkout')
  const sessions=await ctx.stripe.checkout.sessions.list({customer:s.customer,limit:100});assert(!sessions.has_more)
  const original=sessions.data.find(row=>row.metadata?.request_id===ctx.fixture.d3.requests.checkout.requestId)
  assert(original);s.checkout=original.id;await ctx.save()
 }
 const session=await ctx.stripe.checkout.sessions.retrieve(s.checkout)
 assert(session&&!session.livemode);assert.equal(session.client_reference_id,ctx.fixture.ownerId)
 assert.notEqual(session.allow_promotion_codes,true);assert.equal(session.discounts?.length??0,0)
 await ctx.recordCheckout(session)
 assert.equal(session.total_details?.amount_discount??0,0);s.checkout=session.id;await ctx.save()
 if(session.status==='open')await ctx.mutate('checkout-expire',key=>ctx.stripe.checkout.sessions.expire(session.id,{}, {idempotencyKey:key}),()=>ctx.stripe.checkout.sessions.retrieve(session.id))
 const card=await ctx.mutate('card-attach',key=>ctx.stripe.paymentMethods.attach(['E','F'].includes(journey)?'pm_card_createDispute':'pm_card_visa',{customer:s.customer},{idempotencyKey:key}),
  saved=>saved?.id?ctx.stripe.paymentMethods.retrieve(saved.id):null)
 const sub=await ctx.mutate('subscription-create',key=>ctx.stripe.subscriptions.create({customer:s.customer,items:[{price:ctx.config.prices[cycle]}],default_payment_method:card.id,payment_behavior:'error_if_incomplete',metadata:{app_user_id:ctx.fixture.ownerId,environment:'development',d3_run:ctx.runId}},{idempotencyKey:key}),
  saved=>(saved?.id??s.subscription)?ctx.stripe.subscriptions.retrieve(saved?.id??s.subscription):null)
 assert(!sub.livemode);assert.equal(sub.trial_end,null);s.subscription=sub.id;s.invoice=id(sub.latest_invoice);s.boundary=period(sub).current_period_end;s.cycle=cycle;await ctx.save()
 if(s.clock)await ctx.setTime(s.clockStart)
 const initial=await invoice(ctx,s.invoice);assert.equal(initial.status,'paid')
 // A dispute may already exist when the first webhook is processed. Preserve that actual ordering.
 if(!['E','F'].includes(journey))await paid(ctx,initial,{cycle})
 return{initialInvoice:initial.id,initialPaid:true,noOffer:true}
}
async function renew(ctx){
 const old=ctx.state.invoice
 ctx.state.renewTarget??=ctx.state.boundary+3600;await ctx.save()
 const current=await ctx.stripe.testHelpers.testClocks.retrieve(ctx.state.clock)
 if(current.status!=='ready')pending('clock_advancing')
 const finalTarget=ctx.state.renewFinalizationTarget
 if(finalTarget&&current.frozen_time>=finalTarget)await clock(ctx,finalTarget,'renew-finalization-clock')
 else await clock(ctx,ctx.state.renewTarget,'renew-clock')
 let after=await subscription(ctx),bill=await invoice(ctx,after.latest_invoice)
 if(bill.id===old)pending('automatic_invoice_creation')
 ctx.state.renewalInvoiceCandidate??=bill.id;assert.equal(bill.id,ctx.state.renewalInvoiceCandidate);await ctx.save()
 if(bill.status==='draft'){
  ctx.state.renewFinalizationTarget??=ctx.state.renewTarget+3600;await ctx.save()
  await clock(ctx,ctx.state.renewFinalizationTarget,'renew-finalization-clock')
  after=await subscription(ctx);bill=await invoice(ctx,after.latest_invoice)
  assert.equal(bill.id,ctx.state.renewalInvoiceCandidate)
  if(bill.status==='draft')pending('automatic_invoice_finalization')
 }
 await paid(ctx,bill,{cycle:ctx.state.cycle,automatic:true,previous:old})
 ctx.state.renewalInvoice=bill.id;ctx.state.boundary=period(after).current_period_end;await ctx.save()
 return{automaticRenewal:true,invoice:bill.id,billingReason:bill.billing_reason}
}
async function switchCycle(ctx){
 const before=await subscription(ctx),invoices=await ctx.stripe.invoices.list({customer:ctx.state.customer,limit:100});assert(!invoices.has_more)
 const target=ctx.state.cycle==='monthly'?'annual':'monthly'
 await ctx.action('switch',target,'switch')
 const after=await subscription(ctx);assert.equal(after.id,before.id);assert(after.schedule)
 const schedule=await ctx.stripe.subscriptionSchedules.retrieve(id(after.schedule))
 assert.equal(schedule.phases[1].start_date,period(before).current_period_end)
 assert.equal(schedule.phases[1].billing_cycle_anchor,'phase_start')
 assert.equal(id(schedule.phases[1].items[0].price),ctx.config.prices[target]);assert.equal(schedule.phases[1].proration_behavior,'none')
 const current=await ctx.stripe.invoices.list({customer:ctx.state.customer,limit:100});assert(!current.has_more)
 assert.deepEqual(current.data.map(row=>row.id).sort(),invoices.data.map(row=>row.id).sort())
 ctx.state.schedule=schedule.id;ctx.state.switchBoundary=period(before).current_period_end;ctx.state.nextCycle=target;await ctx.save()
 return{schedule:schedule.id,target,noImmediateInvoice:true}
}
async function transition(ctx){
 const old=ctx.journal.initialSwitch?ctx.state.invoice:ctx.state.renewalInvoice
 await clock(ctx,ctx.state.switchBoundary+3600,'transition-clock')
 const after=await subscription(ctx);assert.equal(after.id,ctx.state.subscription)
 assert.equal(id(period(after).price),ctx.config.prices[ctx.state.nextCycle])
 assert.equal(after.billing_cycle_anchor,ctx.state.switchBoundary)
 assert.equal(period(after).current_period_start,ctx.state.switchBoundary)
 const bill=await invoice(ctx,after.latest_invoice);if(bill.status==='draft')pending('automatic_phase_invoice_finalization')
 await paid(ctx,bill,{cycle:ctx.state.nextCycle,automatic:true,previous:old,phaseChange:true})
 ctx.state.currentInvoice=bill.id;ctx.state.cycle=ctx.state.nextCycle;ctx.state.boundary=period(after).current_period_end;await ctx.save()
 return{sameSubscription:true,invoice:bill.id,cycle:ctx.state.cycle,billingReason:bill.billing_reason}
}
async function refund(ctx){
 const current=await invoice(ctx,ctx.state.currentInvoice),old=await invoice(ctx,ctx.state.invoice)
 const currentCharge=await ctx.charge(current.id),oldCharge=await ctx.charge(old.id)
 const partial=await ctx.mutate('partial-refund',key=>ctx.stripe.refunds.create({charge:currentCharge.id,amount:100},{idempotencyKey:key}),saved=>saved?.id?ctx.stripe.refunds.retrieve(saved.id):null)
 assert.equal(partial.amount,100);assert.equal(partial.status,'succeeded')
 let status=await ctx.reconcile();assert.equal(status.status,'active');const end=status.effectiveEnd
 const full=await ctx.mutate('old-refund',key=>ctx.stripe.refunds.create({charge:oldCharge.id},{idempotencyKey:key}),saved=>saved?.id?ctx.stripe.refunds.retrieve(saved.id):null)
 assert.equal(full.amount,old.amount_paid);assert.equal(full.status,'succeeded')
 status=await ctx.reconcile();assert.equal(status.status,'active');assert.equal(status.effectiveEnd,end)
 const sub=await subscription(ctx);assert(!sub.cancel_at_period_end&&sub.status==='active')
 return{partialRefund:partial.id,oldRefund:full.id,currentAccessPreserved:true}
}
async function fail(ctx){
 const sub=await subscription(ctx)
 const card=await ctx.mutate('failure-card',key=>ctx.stripe.paymentMethods.attach('pm_card_chargeCustomerFail',{customer:ctx.state.customer},{idempotencyKey:key}),saved=>saved?.id?ctx.stripe.paymentMethods.retrieve(saved.id):null)
 await ctx.mutate('failure-default',key=>ctx.stripe.subscriptions.update(sub.id,{default_payment_method:card.id},{idempotencyKey:key}),()=>subscription(ctx))
 await clock(ctx,ctx.state.boundary+3600,'failure-clock')
 const after=await subscription(ctx),bill=await invoice(ctx,after.latest_invoice)
 if(bill.status==='draft')pending('automatic_failure_invoice_finalization')
 assert.equal(bill.status,'open');assert.equal(bill.billing_reason,'subscription_cycle');assert(bill.attempted&&bill.amount_remaining===899)
 assert.notEqual(bill.id,ctx.state.invoice);ctx.state.failedInvoice=bill.id;ctx.state.graceEnd=ctx.state.boundary+72*3600;await ctx.save()
 return{failedInvoice:bill.id,originalGraceEnd:new Date(ctx.state.graceEnd*1000).toISOString()}
}
async function grace(ctx,journey){
 await ctx.setTime(ctx.state.graceEnd-1)
 let status=await ctx.reconcile();assert(status.grace&&status.eligible);assert.equal(seconds(status.effectiveEnd),ctx.state.graceEnd)
 if(journey==='C'){status=await ctx.action('cancel',undefined,'grace-cancel');assert(status.grace&&status.eligible)}
 assert.equal(seconds(status.effectiveEnd),ctx.state.graceEnd)
 return{originalDeadlinePreserved:true,cancelled:journey==='C'}
}
async function recover(ctx){
 const bill=await invoice(ctx,ctx.state.failedInvoice);assert(['open','paid'].includes(bill.status))
 const card=await ctx.mutate('recovery-card',key=>ctx.stripe.paymentMethods.attach('pm_card_visa',{customer:ctx.state.customer},{idempotencyKey:key}),saved=>saved?.id?ctx.stripe.paymentMethods.retrieve(saved.id):null)
 if(bill.status!=='paid')await ctx.mutate('recovery-pay',key=>ctx.stripe.invoices.pay(bill.id,{payment_method:card.id},{idempotencyKey:key}),()=>invoice(ctx,bill.id))
 const paidInvoice=await invoice(ctx,bill.id);assert.equal(paidInvoice.status,'paid')
 const status=await paid(ctx,paidInvoice,{cycle:'monthly'});assert.equal(status.grace,false)
 const sub=await subscription(ctx);assert(sub.cancel_at_period_end||sub.cancel_at!==null)
 return{sameInvoice:bill.id,graceCleared:true,cancellationPreserved:true}
}
async function cutoff(ctx){
 await ctx.setTime(ctx.state.graceEnd)
 const card=await ctx.mutate('cutoff-card',key=>ctx.stripe.paymentMethods.attach('pm_card_visa',{customer:ctx.state.customer},{idempotencyKey:key}),saved=>saved?.id?ctx.stripe.paymentMethods.retrieve(saved.id):null)
 const outcomes=await Promise.allSettled([
  ctx.mutate('cutoff-pay',key=>ctx.stripe.invoices.pay(ctx.state.failedInvoice,{payment_method:card.id},{idempotencyKey:key}),()=>invoice(ctx,ctx.state.failedInvoice)),
  ctx.reconcile(),
 ])
 const bill=await invoice(ctx,ctx.state.failedInvoice);assert(['paid','void'].includes(bill.status))
 const status=await ctx.reconcile()
 if(bill.status==='paid')await paid(ctx,bill,{cycle:'monthly'})
 else{assert.equal(status.eligible,false);assert.equal((await subscription(ctx)).status,'canceled')}
 return{invoice:bill.id,observedOutcome:bill.status,requests:outcomes.map(row=>row.status),singlePaymentAttempt:true}
}
async function dispute(ctx){
 const charge=await ctx.charge(ctx.state.invoice),list=await ctx.stripe.disputes.list({charge:charge.id,limit:100});assert(!list.has_more)
 if(!list.data.length)pending('actual_dispute_delivery')
 assert.equal(list.data.length,1);const actual=list.data[0];assert.equal(id(actual.charge),charge.id);assert.equal(actual.livemode,false)
 ctx.state.dispute=actual.id;await ctx.save()
 const status=await ctx.reconcile();assert.equal(status.eligible,false)
 const sub=await subscription(ctx);assert(sub.cancel_at_period_end||sub.cancel_at!==null||sub.status==='canceled')
 return{dispute:actual.id,revoked:true,renewalStopped:true}
}
async function resolve(ctx,journey){
 const result=journey==='E'?'won':'lost'
 await ctx.mutate('dispute-evidence',key=>ctx.stripe.disputes.update(ctx.state.dispute,{evidence:{uncategorized_text:result==='won'?'winning_evidence':'losing_evidence'},submit:true},{idempotencyKey:key}),()=>ctx.stripe.disputes.retrieve(ctx.state.dispute))
 const actual=await ctx.stripe.disputes.retrieve(ctx.state.dispute);if(actual.status!==result)pending('actual_dispute_resolution')
 const status=await ctx.reconcile()
 if(result==='won'){assert.equal(status.status,'active');assert.equal(status.trialConsumed,true)}else assert.equal(status.eligible,false)
 const sub=await subscription(ctx);assert(sub.cancel_at_period_end||sub.cancel_at!==null||sub.status==='canceled')
 return{dispute:actual.id,outcome:result,renewalRemainsStopped:true}
}
export async function runJourneyStage(ctx,journey,stage){
 assert(stageSequence({journey,initialPeriod:ctx.journal.initialPeriod===true,initialSwitch:ctx.journal.initialSwitch===true}).includes(stage),'Invalid current-D2 journey or stage')
 if(stage==='setup')return setup(ctx,journey)
 if(stage==='partial-refund'){
  assert(journey==='B'&&ctx.journal.initialPeriod===true)
  const bill=await invoice(ctx,ctx.state.invoice),charge=await ctx.charge(bill.id)
  assert.equal(ctx.state.cycle,'annual');assert.equal(bill.amount_paid,7900)
  const before=await paid(ctx,bill,{cycle:'annual'}),original=await subscription(ctx)
  assert.equal(id(original.latest_invoice),bill.id);assert.equal(period(original).current_period_end,ctx.state.boundary)
  const result=await ctx.mutate('initial-partial-refund',key=>ctx.stripe.refunds.create({charge:charge.id,amount:100},{idempotencyKey:key}),saved=>saved?.id?ctx.stripe.refunds.retrieve(saved.id):null)
  assert.equal(result.status,'succeeded');assert.equal(result.amount,100)
  const status=await ctx.reconcile();await ctx.assertRecognized(bill.id,'annual')
  assert.equal(status.status,'active');assert.equal(status.eligible,true);assert.equal(status.trialConsumed,true)
  assert.equal(status.effectiveEnd,before.effectiveEnd)
  assert.equal(seconds(status.effectiveEnd),ctx.state.boundary)
  const after=await subscription(ctx);assert.equal(id(after.latest_invoice),bill.id)
  assert.equal(after.cancel_at_period_end,original.cancel_at_period_end);assert.equal(after.cancel_at,original.cancel_at)
  return{initialAnnualInvoice:bill.id,partialRefund:result.id,refundedCents:100,originalPeriodPreserved:true,renewalTested:false}
 }
 if(stage==='renew')return renew(ctx)
 if(stage==='switch')return switchCycle(ctx)
 if(stage==='transition')return transition(ctx)
 if(stage==='refund')return refund(ctx)
 if(stage==='fail')return fail(ctx)
 if(stage==='grace')return grace(ctx,journey)
 if(stage==='recover')return recover(ctx)
 if(stage==='cutoff')return cutoff(ctx)
 if(stage==='dispute')return dispute(ctx)
 if(stage==='resolve')return resolve(ctx,journey)
 if(stage==='cancel'||stage==='resume'){
  const before=journey==='A'?await ctx.call():null
  await ctx.action(stage,undefined,stage)
  const sub=await subscription(ctx);assert.equal(sub.cancel_at_period_end,stage==='cancel')
  if(journey==='A'){
   const status=await ctx.reconcile()
   assert.equal(status.eligible,true);assert.equal(status.effectiveEnd,before.effectiveEnd)
   assert.equal(seconds(status.effectiveEnd),ctx.state.boundary)
  }
  return{cancelAtPeriodEnd:sub.cancel_at_period_end}
 }
 if(stage==='after-cutoff'){
  await ctx.setTime(ctx.state.graceEnd+1)
  const status=await ctx.reconcile();assert.equal(status.status,'active');assert.equal(status.grace,false)
  assert.equal((await invoice(ctx,ctx.state.failedInvoice)).status,'paid')
  return{recoveredInvoiceNotVoided:true,eligible:status.eligible}
 }
 if(stage==='expire'){
  const current=await subscription(ctx)
  if(ctx.journal.initialPeriod){
   assert.equal(ctx.state.cycle,'annual');assert.equal(id(current.latest_invoice),ctx.state.invoice)
   assert.equal(period(current).current_period_end,ctx.state.boundary)
  }
  if(!['canceled','incomplete_expired'].includes(current.status)&&!current.cancel_at_period_end&&current.cancel_at===null)await ctx.action('cancel',undefined,'ordinary-cancel')
  await clock(ctx,ctx.state.boundary+1,'expiry-clock')
  const status=await ctx.reconcile();assert.equal(status.eligible,false);assert.equal(status.grace,false)
  const expired=await subscription(ctx);assert.equal(expired.status,'canceled')
  if(ctx.journal.initialPeriod)assert.equal(id(expired.latest_invoice),ctx.state.invoice)
  return{ordinaryExpiry:true,grace:false,...(ctx.journal.initialPeriod?{initialAnnualInvoice:ctx.state.invoice,renewalTested:false}:{})}
 }
 throw Error('Invalid D3 journey stage')
}
