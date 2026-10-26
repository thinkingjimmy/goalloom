/**
 * [INPUT]: Explicit development test credential for the owner-approved Goalloom account.
 * [OUTPUT]: Idempotent inclusive Plus prices and restricted customer-portal configuration.
 * [POS]: Test-only provider setup. No subscription, payment, tax activation, live configuration or Apple change.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir,writeFile } from 'node:fs/promises'
import { testStripe } from './stripe-client.mjs'
const mode=process.argv[2]??'--plan';assert(['--plan','--apply'].includes(mode),'Use --plan or --apply')
const report={ok:false,mode,account:'acct_1QvwdlITpGuR8ZMB',livemode:false,scope:'Real Stripe test API; catalog/portal only, no payment or live mutation',prices:{}}
try{
  const {stripe,account}=await testStripe()
  report.accountSummary={country:account.country,currency:account.default_currency,businessType:account.business_type,chargesEnabled:account.charges_enabled,detailsSubmitted:account.details_submitted}
  let product
  try{product=await stripe.products.retrieve('goalloom_plus_d0')}catch(error){if(error.statusCode!==404)throw error}
  if(!product&&mode==='--apply')product=await stripe.products.create({id:'goalloom_plus_d0',name:'Goalloom Plus',metadata:{integration:'goalloom-billing-d0'}},{idempotencyKey:'goalloom-billing-d0-product-v1'})
  if(product)assert(!product.livemode&&product.name==='Goalloom Plus'&&product.metadata.integration==='goalloom-billing-d0','Existing test product has unexpected ownership')
  for(const [cycle,amount,interval]of [['monthly',899,'month'],['annual',7900,'year']]){
    const lookup=`goalloom_plus_${cycle}_inclusive_v1`
    const list=await stripe.prices.list({lookup_keys:[lookup],limit:10})
    assert(list.data.length<=1&&!list.has_more,'Ambiguous test prices')
    let price=list.data[0]
    if(!price&&mode==='--apply')price=await stripe.prices.create({product:product.id,currency:'usd',unit_amount:amount,recurring:{interval},tax_behavior:'inclusive',lookup_key:lookup,metadata:{integration:'goalloom-billing-d0'}},{idempotencyKey:`goalloom-billing-d0-${cycle}-v1`})
    if(price){assert(!price.livemode&&price.currency==='usd'&&price.unit_amount===amount&&price.tax_behavior==='inclusive'&&price.recurring.interval===interval&&price.recurring.interval_count===1&&price.product===product.id,'Price differs from fixed billing policy');report.prices[cycle]={id:price.id,product:price.product,amount:price.unit_amount,currency:price.currency,taxBehavior:price.tax_behavior,interval:price.recurring.interval}}
  }
  const configurations=await stripe.billingPortal.configurations.list({limit:100})
  assert(!configurations.has_more,'Review additional portal pages before creating a configuration')
  let portal=configurations.data.find(value=>value.metadata?.integration==='goalloom-billing-d0')
  if(!portal&&mode==='--apply')portal=await stripe.billingPortal.configurations.create({default_return_url:'https://www.goalloom.com/billing/return/',metadata:{integration:'goalloom-billing-d0'},
    features:{customer_update:{enabled:false},invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_update:{enabled:false},subscription_cancel:{enabled:true,mode:'at_period_end',proration_behavior:'none'}}},
    {idempotencyKey:'goalloom-billing-d0-portal-v1'})
  if(portal){assert(portal.active&&!portal.features.subscription_update.enabled&&portal.features.subscription_cancel.mode==='at_period_end','Portal violates scheduled-change contract');report.portal={id:portal.id,planSwitch:false,cancellationMode:portal.features.subscription_cancel.mode}}
  report.tax={automaticTaxEnabled:false,registrationsVerified:false,note:'Inclusive prices do not establish registration, collection, filing or production tax readiness'}
  report.product=product?.id??null;report.ok=true
}catch(error){report.error={type:error.type??error.name,code:error.code??null,status:error.statusCode??null};process.exitCode=1}
await mkdir('output/tests/billing/desktop',{recursive:true});await writeFile('output/tests/billing/desktop/stripe-preparation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
