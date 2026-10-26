/**
 * [INPUT]: The existing configured RC provider and an owned Stripe subscription, invoice and service line.
 * [OUTPUT]: Bounded read-only current/pending/v1 metadata; no raw payload, identity, credentials or access grant.
 * [POS]: D3 recognition diagnostics only. BillingProviders retains all authoritative payment decisions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'

const id=value=>typeof value==='string'?value:value?.id
const states=['trialing','active','expired','in_grace_period','in_billing_retry','paused','unknown','incomplete']
const renewals=['will_renew','will_not_renew','will_change_product','will_pause','requires_price_increase_consent','has_already_renewed']
const reasons=['assert_recognized','reconcile_202']
const oneOf=(value,values)=>values.includes(value)?value:null
const boolean=value=>typeof value==='boolean'?value:null
const millis=value=>Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000?value:null
const date=value=>{
 const valueMs=typeof value==='number'?millis(value):typeof value==='string'&&value.length<=40&&/^\d{4}-\d\d-\d\dT/.test(value)?millis(Date.parse(value)):null
 return{ms:valueMs,iso:valueMs===null?null:new Date(valueMs).toISOString()}
}
const period=(start,end,expected)=>({startsAt:date(start),endsAt:date(end),matchesInvoice:date(start).ms===expected.start&&date(end).ms===expected.end})
export function recognitionDiagnosticFailure(reason,error){
 const status=error?.statusCode??error?.status
 return{ok:false,errorType:oneOf(error?.name,['Error','TypeError','AssertionError','AbortError','TimeoutError'])??'Error',
  httpStatus:Number.isInteger(status)&&status>=100&&status<=599?status:null,reason:oneOf(reason,reasons)}
}
export async function readRecognitionDiagnostic({providers,config,ownerId,subscription,invoice,line,cycle,reason}){
 assert(config.environment==='development'&&config.rcProject==='projd720c733')
 assert(subscription.metadata?.app_user_id===ownerId&&subscription.metadata?.environment==='development'&&subscription.livemode===false)
 assert(subscription.items?.data?.length===1&&!subscription.items.has_more)
 assert(invoice.livemode===false&&id(invoice.customer)===id(subscription.customer)&&id(invoice.parent?.subscription_details?.subscription)===subscription.id)
 assert(config.prices[cycle]===line.price&&Number.isSafeInteger(line.start)&&Number.isSafeInteger(line.end)&&line.end>line.start)
 const item=subscription.items.data[0],expected={start:line.start*1000,end:line.end*1000},plans=[...new Set([...Object.values(config.prices),id(item.price?.product)].filter(Boolean))]
 assert(millis(expected.start)!==null&&millis(expected.end)!==null,'Valid invoice period required')
 const result={version:1,diagnosticOnly:true,readOnly:true,remoteWrites:0,observedAt:new Date().toISOString(),reason:oneOf(reason,reasons),
  expected:{invoiceId:/^in_[A-Za-z0-9]+$/.test(invoice.id)?invoice.id:null,cycle:oneOf(cycle,['monthly','annual']),price:line.price,
   period:period(expected.start,expected.end,expected),paid:invoice.status==='paid',amountPaid:Number.isSafeInteger(invoice.amount_paid)?invoice.amount_paid:null,
   billingReason:oneOf(invoice.billing_reason,['subscription_create','subscription_cycle','subscription_update','manual'])},v1:null,v2:null}
 const products=new Map()
 const product=async value=>{
  const key=id(value)
  if(typeof key!=='string'||!/^prod[A-Za-z0-9_]{1,250}$/.test(key))return{product:false,app:false,readOk:false}
  if(!products.has(key))products.set(key,(async()=>{
   try{const row=await providers.rc(`/v2/projects/${config.rcProject}/products/${encodeURIComponent(key)}`)
    return{product:row.id===key&&[line.price,id(item.price?.product)].includes(row.store_identifier),app:row.app_id===config.rcApp,readOk:true}
   }catch(error){return{product:false,app:false,readOk:false,failure:recognitionDiagnosticFailure(reason,error)}}
  })())
  return products.get(key)
 }
 try{
  const raw=await providers.rc(`/v1/subscribers/${encodeURIComponent(ownerId)}`,'GET',undefined,true),subscriber=raw?.subscriber
  const ownerMatches=subscriber?.original_app_user_id===ownerId
  const projectPlan=(key,row)=>({plan:key,productMatches:plans.includes(key),storeMatches:row?.store==='stripe',sandbox:boolean(row?.is_sandbox),
   periodType:oneOf(row?.period_type,['normal','trial','intro','prepaid']),period:period(row?.purchase_date,row?.expires_date,expected),
   originalPurchaseAt:date(row?.original_purchase_date),billingIssueAt:date(row?.billing_issues_detected_at),
   unsubscribeAt:date(row?.unsubscribe_detected_at),refundedAt:date(row?.refunded_at),graceEndsAt:date(row?.grace_period_expires_date)})
  result.v1={ok:true,originalOwnerMatches:ownerMatches,plans:ownerMatches?plans.filter(key=>Object.hasOwn(subscriber.subscriptions??{},key)).slice(0,3).map(key=>projectPlan(key,subscriber.subscriptions[key])):[]}
  if(ownerMatches&&subscriber.entitlements?.plus){const row=subscriber.entitlements.plus
   result.v1.plus={productMatches:plans.includes(row.product_identifier),period:period(row.purchase_date,row.expires_date,expected)}
  }
 }catch(error){result.v1=recognitionDiagnosticFailure(reason,error)}
 try{
  const raw=await providers.rc(`/v2/projects/${config.rcProject}/subscriptions?store_subscription_identifier=${encodeURIComponent(item.id)}&include_scheduled=true`)
  assert(Array.isArray(raw.items),'Invalid RC subscription list')
  result.v2={ok:true,itemCount:Math.min(raw.items.length,9),hasNextPage:typeof raw.next_page==='string'&&raw.next_page.length>0,truncated:raw.items.length>8,items:[]}
  for(const row of raw.items.slice(0,8)){
   const matches={owner:row?.customer_id===ownerId,originalOwner:row?.original_customer_id===ownerId,environment:row?.environment==='sandbox',store:row?.store==='stripe',subscriptionItem:row?.store_subscription_identifier===item.id}
   if(!Object.values(matches).every(Boolean)){result.v2.items.push({matches:{...matches,product:null,app:null,all:false},detailsOmitted:true});continue}
   const currentProduct=await product(row.product_id)
   const current={period:period(row.current_period_starts_at,row.current_period_ends_at,expected),status:oneOf(row.status,states),pendingPayment:boolean(row.pending_payment),givesAccess:boolean(row.gives_access)}
   const entry={matches:{...matches,product:currentProduct.product,app:currentProduct.app,all:currentProduct.product&&currentProduct.app},current,
    latestEnd:date(row.ends_at),autoRenewalStatus:oneOf(row.auto_renewal_status,renewals),productReadOk:currentProduct.readOk,pending:null}
   if(currentProduct.failure)entry.productReadFailure=currentProduct.failure
   const change=row.pending_changes
   if(change&&typeof change==='object'&&!Array.isArray(change)){
    const nextProduct=Object.hasOwn(change,'product')?await product(change.product):currentProduct
    const fields=['current_period_starts_at','current_period_ends_at','store_subscription_identifier','status','pending_payment','gives_access','auto_renewal_status']
    const inheritedFields=fields.filter(key=>!Object.hasOwn(change,key))
    const next=Object.fromEntries(fields.map(key=>[key,Object.hasOwn(change,key)?change[key]:row[key]]))
    entry.pending={period:period(next.current_period_starts_at,next.current_period_ends_at,expected),status:oneOf(next.status,states),pendingPayment:boolean(next.pending_payment),givesAccess:boolean(next.gives_access),
     autoRenewalStatus:oneOf(next.auto_renewal_status,renewals),inheritedFields,productInherited:!Object.hasOwn(change,'product'),
     matches:{owner:true,originalOwner:true,environment:true,store:true,subscriptionItem:next.store_subscription_identifier===item.id,product:nextProduct.product,app:nextProduct.app},productReadOk:nextProduct.readOk}
    if(nextProduct.failure)entry.pending.productReadFailure=nextProduct.failure
   }
   result.v2.items.push(entry)
  }
 }catch(error){result.v2=recognitionDiagnosticFailure(reason,error)}
 return result
}
