/**
 * [INPUT]: Verified disposable billing identity and explicit D3 Test ownership records.
 * [OUTPUT]: Bounded graphs with owned historical invoice items/prices, deleted-root readback and exact event tombstones.
 * [POS]: Acceptance cleanup only; D3 uses subjects while historical D1 callers retain their separate API.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
export const d3ProviderSource={project:'asqyvcnxdltzzfutbbqy',stripeAccount:'acct_1QvwdlITpGuR8ZMB',rcProject:'projd720c733',rcApp:'appc06dd78ed3'}
const id=value=>typeof value==='string'?value:value?.id??null
const same=(a,b)=>canonicalJson(a)===canonicalJson(b)
const q=value=>value===null?'null':`'${String(value).replaceAll("'","''")}'`
const fields={subscriptions:'sub_',invoices:'in_',invoicePayments:'inpay_',paymentIntents:'pi_',charges:'ch_',refunds:'re_',disputes:'du_',schedules:'sub_sched_',checkouts:'cs_test_'}
export function createD3ProviderManifest({ownerId,subjectId,createdAt=new Date().toISOString(),customer=null,clock=null}){
 return validateD3ProviderManifest({version:1,profile:'d3-disposable-test',environment:'development',...d3ProviderSource,ownerId,subjectId,createdAt,customer,clock,
  ...Object.fromEntries(Object.keys(fields).map(key=>[key,[]])),events:[],rcEvents:[],effects:[]})
}
export function validateD3ProviderManifest(m){
 assert(m?.version===1&&m.profile==='d3-disposable-test'&&m.environment==='development')
 for(const[key,value]of Object.entries(d3ProviderSource))assert.equal(m[key],value,'D3 provider source differs')
 for(const key of ['ownerId','subjectId'])assert(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(m[key]),'D3 owner/subject UUID required')
 assert(Number.isFinite(Date.parse(m.createdAt))&&Date.parse(m.createdAt)<=Date.now()+60000)
 assert(m.customer===null||/^cus_[A-Za-z0-9]+$/.test(m.customer))
 assert(m.clock===null||/^clock_[A-Za-z0-9]+$/.test(m.clock))
 for(const[key,prefix]of Object.entries(fields))assert(Array.isArray(m[key])&&m[key].length<=500&&new Set(m[key]).size===m[key].length&&m[key].every(x=>typeof x==='string'&&x.startsWith(prefix)&&/^[A-Za-z0-9_]+$/.test(x)),`Invalid finite D3 ${key}`)
 assert(m.customer||Object.keys(fields).every(key=>m[key].length===0),'Provider objects require their original customer')
 for(const key of ['events','rcEvents'])assert(Array.isArray(m[key])&&m[key].length<=1000&&new Set(m[key].map(e=>e.id)).size===m[key].length&&m[key].every(e=>
  typeof e.id==='string'&&e.id.length>0&&e.id.length<=200&&/^[A-Za-z0-9._]+$/.test(e.type)&&Number.isFinite(e.created)&&(key==='events'?/^evt_[A-Za-z0-9]+$/.test(e.id)&&(typeof e.object==='string'&&/^[A-Za-z0-9_]+$/.test(e.object)||e.type==='invoice.upcoming'&&e.object===null):e.object===null)),'Invalid exact provider events')
 assert(Array.isArray(m.effects)&&m.effects.length<=1000&&m.effects.every(e=>typeof e.id==='string'&&typeof e.key==='string'&&['prepared','dispatched','unknown','confirmed','not_applied'].includes(e.state)),'Original provider effects required')
 return m
}
export async function completeProviderList(list,params={},max=500){
 const values=[],seen=new Set();let cursor
 for(let page=0;page<20;page++){
  const result=await list({...params,limit:100,...(cursor?{starting_after:cursor}:{})})
  assert(Array.isArray(result.data)&&typeof result.has_more==='boolean','Incomplete provider list')
  for(const row of result.data){assert(typeof row.id==='string'&&!seen.has(row.id),'Repeated provider cursor/object');seen.add(row.id);values.push(row);assert(values.length<=max,'Provider graph bound exceeded')}
  if(!result.has_more)return values
  assert(result.data.length&&result.data.at(-1).id!==cursor,'Provider list made no progress');cursor=result.data.at(-1).id
 }
 throw Error('provider_graph_page_bound')
}
/** Read every customer-owned edge. Unexpected objects are retained, never silently adopted. */
export async function collectD3ProviderGraph(stripe,input,{record=false,persist}={}){
 validateD3ProviderManifest(input)
 const m=record?{...input,...Object.fromEntries(Object.keys(fields).map(key=>[key,[...input[key]]]))}:input
 if(record)assert.equal(typeof persist,'function','Protected graph persistence required')
 assert(m.customer,'Recorded customer required')
 assert.equal((await stripe.accounts.retrieve(m.stripeAccount)).id,m.stripeAccount)
 const customer=await stripe.customers.retrieve(m.customer)
 if(customer.deleted)assert(m.cleanup?.customerDeleteStarted&&m.cleanup.graph?.customer===m.customer,'Deleted customer needs the original cleanup graph')
 else assert(customer.livemode===false&&customer.metadata?.app_user_id===m.ownerId&&customer.metadata?.environment==='development'&&id(customer.test_clock)===m.clock,'Foreign/live customer')
 const records={},owned=new Set([m.customer,...(m.clock?[m.clock]:[])])
 const rootRows=async(key,list,retrieve)=>{
  if(!customer.deleted)return completeProviderList(list,{customer:m.customer})
  const prior=m.cleanup?.graph?.records?.[key]
  assert(Array.isArray(prior)&&same(prior.map(row=>row.id).sort(),[...m[key]].sort()),'Deleted customer requires its complete original root graph')
  const rows=[];for(const value of m[key])rows.push(await retrieve(value))
  return rows
 }
 const retain=(key,rows)=>{
  const testMode=row=>{
   if(row.livemode===false)return true
   if(key!=='refunds'||Object.hasOwn(row,'livemode'))return false
   const charge=records.charges?.find(value=>value.id===id(row.charge))
   const intent=records.paymentIntents?.find(value=>value.id===id(row.payment_intent))
   return charge?.livemode===false&&id(charge.customer)===m.customer&&(!row.payment_intent||intent?.livemode===false&&id(intent.customer)===m.customer&&id(charge.payment_intent)===intent.id)
  }
  assert(rows.length<=500&&rows.every(testMode),'Live, incomplete or oversized provider graph')
  if(record&&!['subscriptions','schedules','checkouts'].includes(key))m[key]=[...new Set([...m[key],...rows.map(x=>x.id)])]
  const removed=key==='invoices'?(m.cleanup?.deletedDraftInvoices??[]):[]
  assert(removed.every(value=>m.invoices.includes(value)&&m.cleanup?.actions?.[`invoices.del:${value}`]?.terminalReadback),'Missing draft needs its original deletion/readback')
  assert(same([...rows.map(x=>x.id),...removed].sort(),[...m[key]].sort()),`Unrecorded or missing ${key}`)
  records[key]=rows;for(const row of rows)owned.add(row.id)
 }
 const merge=rows=>[...new Map(rows.map(row=>[row.id,row])).values()]
 retain('subscriptions',await completeProviderList(p=>stripe.subscriptions.list(p),{customer:m.customer,status:'all'}))
 const invoices=await completeProviderList(p=>stripe.invoices.list(p),{customer:m.customer})
 // Explicit subscription/customer filters also cover Test Clock objects omitted by account lists.
 for(const sub of records.subscriptions)invoices.push(...await completeProviderList(p=>stripe.invoices.list(p),{subscription:sub.id}))
 retain('invoices',merge(invoices))
 retain('checkouts',await rootRows('checkouts',p=>stripe.checkout.sessions.list(p),value=>stripe.checkout.sessions.retrieve(value)))
 retain('schedules',await rootRows('schedules',p=>stripe.subscriptionSchedules.list(p),value=>stripe.subscriptionSchedules.retrieve(value)))
 const intents=await completeProviderList(p=>stripe.paymentIntents.list(p),{customer:m.customer})
 const charges=await completeProviderList(p=>stripe.charges.list(p),{customer:m.customer})
 const invoicePayments=[],refunds=[],disputes=[]
 for(const invoice of records.invoices){
  assert(id(invoice.customer)===m.customer&&m.subscriptions.includes(id(invoice.parent?.subscription_details?.subscription)),'Invoice outside subscription graph')
  invoicePayments.push(...await completeProviderList(p=>stripe.invoicePayments.list(p),{invoice:invoice.id}))
  assert(invoicePayments.length<=500,'Invoice payment graph exceeded bound')
 }
 for(const payment of invoicePayments){
  if(payment.payment?.payment_intent&&!intents.some(x=>x.id===id(payment.payment.payment_intent)))intents.push(await stripe.paymentIntents.retrieve(id(payment.payment.payment_intent)))
  if(payment.payment?.charge&&!charges.some(x=>x.id===id(payment.payment.charge)))charges.push(await stripe.charges.retrieve(id(payment.payment.charge)))
 }
 for(const value of m.paymentIntents)if(!intents.some(x=>x.id===value))intents.push(await stripe.paymentIntents.retrieve(value))
 for(const intent of intents)if(intent.latest_charge&&!charges.some(x=>x.id===id(intent.latest_charge)))charges.push(await stripe.charges.retrieve(id(intent.latest_charge)))
 for(const value of m.charges)if(!charges.some(x=>x.id===value))charges.push(await stripe.charges.retrieve(value))
 retain('paymentIntents',merge(intents));retain('charges',merge(charges))
 for(const charge of records.charges){
  refunds.push(...await completeProviderList(p=>stripe.refunds.list(p),{charge:charge.id}))
  disputes.push(...await completeProviderList(p=>stripe.disputes.list(p),{charge:charge.id}))
  assert(refunds.length<=500&&disputes.length<=500,'Refund/dispute graph exceeded bound')
 }
 retain('invoicePayments',invoicePayments);retain('refunds',refunds);retain('disputes',disputes)
 for(const sub of records.subscriptions){
  assert(id(sub.customer)===m.customer&&sub.metadata?.app_user_id===m.ownerId&&sub.metadata?.environment==='development')
  assert(Array.isArray(sub.items?.data)&&!sub.items.has_more&&sub.items.data.length<=100)
  if(sub.schedule)assert(m.schedules.includes(id(sub.schedule)))
 }
 for(const session of records.checkouts){assert(id(session.customer)===m.customer&&session.metadata?.app_user_id===m.ownerId&&session.metadata?.environment==='development');if(session.subscription)assert(m.subscriptions.includes(id(session.subscription)));if(session.invoice)assert(m.invoices.includes(id(session.invoice)))}
 for(const schedule of records.schedules){assert(id(schedule.customer)===m.customer);for(const value of [schedule.subscription,schedule.released_subscription].filter(Boolean))assert(m.subscriptions.includes(id(value)))}
 for(const payment of invoicePayments){assert(m.invoices.includes(id(payment.invoice)));if(payment.payment?.payment_intent)assert(m.paymentIntents.includes(id(payment.payment.payment_intent)));if(payment.payment?.charge)assert(m.charges.includes(id(payment.payment.charge)))}
 for(const intent of records.paymentIntents){assert(id(intent.customer)===m.customer);if(intent.latest_charge)assert(m.charges.includes(id(intent.latest_charge)))}
 for(const charge of records.charges){assert(id(charge.customer)===m.customer);if(charge.payment_intent)assert(m.paymentIntents.includes(id(charge.payment_intent)));if(charge.invoice)assert(m.invoices.includes(id(charge.invoice)))}
 for(const refund of refunds)assert(m.charges.includes(id(refund.charge))&&(!refund.payment_intent||m.paymentIntents.includes(id(refund.payment_intent))))
 for(const dispute of disputes)assert(m.charges.includes(id(dispute.charge))&&(!dispute.payment_intent||m.paymentIntents.includes(id(dispute.payment_intent))))
 // Renewal children may be discovered; new independent roots must be explicitly planned.
 const anchoredIntents=new Set([...invoicePayments.map(p=>id(p.payment?.payment_intent)),...records.checkouts.map(s=>id(s.payment_intent))].filter(Boolean))
 const anchoredCharges=new Set([...invoicePayments.map(p=>id(p.payment?.charge)),...records.paymentIntents.filter(p=>anchoredIntents.has(p.id)).map(p=>id(p.latest_charge))].filter(Boolean))
 for(const value of records.paymentIntents)if(!input.paymentIntents.includes(value.id))assert(anchoredIntents.has(value.id),'New intent has no recorded invoice/Checkout ancestry')
 for(const value of records.charges)if(!input.charges.includes(value.id))assert(anchoredCharges.has(value.id),'New charge has no recorded invoice/payment ancestry')
 if(m.clock&&!customer.deleted){const clock=await stripe.testHelpers.testClocks.retrieve(m.clock);assert(clock.id===m.clock);const customers=await completeProviderList(p=>stripe.customers.list(p),{test_clock:m.clock});assert(customers.length===1&&customers[0].id===m.customer,'Clock has another customer')}
 const all=await completeProviderList(p=>stripe.events.list(p),{created:{gte:Math.floor(Date.parse(m.createdAt)/1000)-300}},2000),events=[]
 for(const event of m.events)if(!all.some(x=>x.id===event.id))all.push(await stripe.events.retrieve(event.id))
 for(const event of all){
  assert(event.livemode===false);const object=event.data.object
  const subscription=id(object.subscription??object.parent?.subscription_details?.subscription)
  if(event.type==='invoice.upcoming'&&object.id==null&&(id(object.customer)===m.customer||m.subscriptions.includes(subscription))){
   assert(object.object==='invoice'&&object.livemode===false&&id(object.customer)===m.customer&&m.subscriptions.includes(subscription)&&Number.isFinite(event.created),'Invalid owned invoice advisory')
   events.push({id:event.id,type:event.type,object:null,created:event.created});continue
  }
  if(owned.has(object.id)||id(object.customer)===m.customer||owned.has(id(object.charge))||m.subscriptions.includes(id(object.subscription))){assert(typeof object.id==='string'&&Number.isFinite(event.created));events.push({id:event.id,type:event.type,object:object.id,created:event.created});owned.add(object.id)}
 }
 assert(events.length<=1000)
 for(const prior of m.events)assert(events.some(e=>same(e,prior)),'Recorded original event disappeared or changed')
 const historicalLines=records.invoices.flatMap(invoice=>{
  assert(Array.isArray(invoice.lines?.data)&&invoice.lines.has_more===false,'Owned historical invoice lines are incomplete')
  for(const line of invoice.lines.data){const subscription=id(line.parent?.subscription_item_details?.subscription);if(subscription)assert(m.subscriptions.includes(subscription),'Historical invoice item has foreign subscription ancestry')}
  return invoice.lines.data
 })
 const graph={version:1,customer:m.customer,ownerId:m.ownerId,subjectId:m.subjectId,customerDeleted:customer.deleted===true,objects:[...owned].sort(),events,
  items:[...new Set([...records.subscriptions.flatMap(s=>s.items.data.map(x=>x.id)),...historicalLines.map(line=>id(line.parent?.subscription_item_details?.subscription_item)).filter(Boolean)])],
  prices:[...new Set([...records.subscriptions.flatMap(s=>s.items.data.map(x=>id(x.price))),...historicalLines.map(line=>id(line.pricing?.price_details?.price)).filter(Boolean)])],records}
 if(record){
  validateD3ProviderManifest(m)
  for(const key of Object.keys(fields))input[key]=m[key]
  input.events=events
  await persist(input)
 }
 return graph
}
/** One shared read-only discovery scan; persist verified renewal children before any mutation. */
export async function recordD3ProviderGraph({stripe,manifest,persist}){return collectD3ProviderGraph(stripe,manifest,{record:true,persist})}
export async function retireD3FixtureEvents(db,input,graph,{scopeHeader}={}){
 const m=validateD3ProviderManifest(input);assert(graph.customer===m.customer&&graph.subjectId===m.subjectId&&graph.ownerId===m.ownerId)
 assert(typeof scopeHeader==='string'&&/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(scopeHeader),'Original finite cleanup scope required')
 const known=[...graph.events.map(e=>({...e,provider:'stripe'})),...m.rcEvents.map(e=>({...e,provider:'revenuecat'}))]
 assert(known.length<=2000)
 if(!known.length)return{events:0}
 const rows=known.map(e=>`(${q(e.provider)},${q(e.id)},${q(e.type)},${q(e.object)},to_timestamp(${e.created}))`).join(',')
 const result=await db.query(`begin;set local lock_timeout='3s';set local statement_timeout='15s';
 set local request.headers=${q(JSON.stringify({'x-goalloom-lifecycle-scope':scopeHeader}))};
 select service_private.assert_worker_target('development',${q(m.subjectId)});
 create temporary table d3_retired_events(provider text,event_id text,event_type text,object_id text,occurred_at timestamptz) on commit drop;
 insert into d3_retired_events values ${rows};
 do $$begin if not exists(select 1 from service_private.policy where id=1 and project_ref=${q(m.project)} and environment='development') or exists(select 1 from public.billing_inbox b join d3_retired_events e using(provider,event_id) where b.environment='development' and (b.event_type<>e.event_type or b.object_id is distinct from e.object_id or b.occurred_at<>e.occurred_at or b.subject_id is not null and b.subject_id<>${q(m.subjectId)} or b.status='processing' or b.lease is not null)) then raise exception 'fixture_event_identity_unresolved';end if;end$$;
 insert into public.billing_inbox(environment,provider,event_id,event_type,subject_id,object_id,occurred_at,status,reason)
 select 'development',provider,event_id,event_type,null,object_id,occurred_at,'ignored','fixture_retired' from d3_retired_events
 on conflict(environment,provider,event_id) do update set subject_id=null,status=case when billing_inbox.status='complete' then 'complete' else 'ignored' end,
 reason=case when billing_inbox.status='complete' then billing_inbox.reason else 'fixture_retired' end,lease=null,lease_until=null
 where billing_inbox.event_type=excluded.event_type and billing_inbox.object_id is not distinct from excluded.object_id and billing_inbox.occurred_at=excluded.occurred_at
 and (billing_inbox.subject_id is null or billing_inbox.subject_id=${q(m.subjectId)}) and billing_inbox.status<>'processing' and billing_inbox.lease is null;
 do $$begin if exists(select 1 from d3_retired_events e left join public.billing_inbox b on b.environment='development' and b.provider=e.provider and b.event_id=e.event_id
 where b.event_id is null or b.subject_id is not null or b.event_type<>e.event_type or b.object_id is distinct from e.object_id or b.occurred_at<>e.occurred_at or b.status not in('complete','ignored') or b.lease is not null) then raise exception 'fixture_event_retirement_changed';end if;end$$;
 select count(*) events from d3_retired_events;commit;`,false)
 return{events:Number(result.find(x=>x.events!==undefined)?.events)}
}
export async function fixtureManifest(stripe,report){
 const customer=await stripe.customers.retrieve(report.customer)
 assert(!customer.deleted&&!customer.livemode&&customer.metadata.app_user_id===report.account&&customer.metadata.environment==='development','Refuse to retire a customer outside the verified fixture')
 const objects=new Set([report.customer,report.subscription,report.invoice,report.failedInvoice,report.checkout,report.refund,report.clock].filter(Boolean))
 for(const invoice of [report.invoice,report.failedInvoice].filter(Boolean)){
  const payments=await stripe.invoicePayments.list({invoice,limit:100});assert(!payments.has_more)
  for(const value of payments.data){if(typeof value.id==='string')objects.add(value.id);if(value.payment.charge)objects.add(typeof value.payment.charge==='string'?value.payment.charge:value.payment.charge.id);if(value.payment.payment_intent){const intent=await stripe.paymentIntents.retrieve(typeof value.payment.payment_intent==='string'?value.payment.payment_intent:value.payment.payment_intent.id);if(intent.latest_charge)objects.add(typeof intent.latest_charge==='string'?intent.latest_charge:intent.latest_charge.id)}}
 }
 const start=Math.floor((Date.parse(report.trialEndsAt)-192*3600_000)/1000)-300,events=[]
 for await(const event of stripe.events.list({created:{gte:start},limit:100})){
  assert(!event.livemode,'Never inspect live fixture events')
  const object=event.data.object,id=value=>typeof value==='string'?value:value?.id
  if(typeof object.id!=='string'||!object.id||!Number.isFinite(event.created))continue
  if(objects.has(object.id)||id(object.customer)===report.customer||objects.has(id(object.charge))||id(object.subscription)===report.subscription){objects.add(object.id);events.push({id:event.id,type:event.type,object:object.id,created:event.created})}
 }
 return {customer:report.customer,objects:[...objects],events}
}
export async function retireFixtureEvents(db,user,manifest){
 assert(/^[0-9a-f-]{36}$/.test(user)&&manifest.events.length>0&&manifest.events.length<=500&&manifest.events.every(x=>typeof x.object==='string'&&Number.isFinite(x.created)&&/^evt_[A-Za-z0-9]+$/.test(x.id)&&/^[A-Za-z0-9._]+$/.test(x.type)&&/^[A-Za-z0-9_]+$/.test(x.object)))
 // The caller has just verified the synthetic Auth email and Stripe customer before this scoped mutation.
 const values=manifest.events.map(event=>`('development','stripe','${event.id}','${event.type}',null::uuid,'${event.object}',to_timestamp(${event.created}),'ignored','fixture_retired')`).join(',')
 return db.query(`with stripe_rows as(insert into billing_inbox(environment,provider,event_id,event_type,user_id,object_id,occurred_at,status,reason) values ${values} on conflict(environment,provider,event_id) do update set status=case when billing_inbox.status='complete' then 'complete' else 'ignored' end,reason=case when billing_inbox.status='complete' then null else 'fixture_retired' end,lease=null,lease_until=null returning provider,event_id,status,reason),rc_rows as(update billing_inbox set user_id=null,status=case when status='complete' then 'complete' else 'ignored' end,reason=case when status='complete' then null else 'fixture_retired' end,lease=null,lease_until=null where environment='development' and provider='revenuecat' and user_id='${user}' returning provider,event_id,status,reason) select * from stripe_rows union all select * from rc_rows`,false)
}
