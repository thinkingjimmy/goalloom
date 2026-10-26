/**
 * [INPUT]: Explicit Test-mode Stripe access and existing RevenueCat OAuth for the isolated Stripe app.
 * [OUTPUT]: Provider webhook configuration and owner-only secrets; evidence contains only whitelisted IDs/status.
 * [POS]: D0 test notification setup, without live/Apple subscription changes or provider payments.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {testStripe} from './stripe-client.mjs'
import {privateConfig,savePrivate} from './private-config.mjs'
const project='projd720c733',app='appc06dd78ed3',backend='https://asqyvcnxdltzzfutbbqy.supabase.co/functions/v1/billing'
const rc=(method,path,body)=>{const result=JSON.parse(execFileSync('rc',['api',method,path,...(body?['--body','@-']:[]),'--project-id',project,'--json','--no-input'],{encoding:'utf8',input:body?JSON.stringify(body):undefined,maxBuffer:1024*1024}));return result.data??result}
const report={ok:false,scope:'Real test notification setup; no payment, live or Apple change',rcApp:app}
try{
  const {stripe,key}=await testStripe(),env=await privateConfig()
  const publicKeys=JSON.parse(execFileSync('rc',['apps','keys',app,'--project-id',project,'--json'],{encoding:'utf8'})).data.items
  const sdk=publicKeys.find(value=>value.environment==='sandbox');assert(sdk?.key,'Missing isolated Stripe sandbox SDK key')
  await savePrivate({BILLING_STRIPE_KEY:key,BILLING_RC_PUBLIC_KEY:sdk.key,BILLING_WORKER_SECRET:env.BILLING_WORKER_SECRET??randomBytes(32).toString('hex')})
  const definitions=[{name:'stripeToRc',url:`https://api.revenuecat.com/v1/incoming-webhooks/stripe/${app}`,secret:'BILLING_RC_STRIPE_WEBHOOK_SECRET',events:['customer.subscription.updated','customer.subscription.deleted','charge.refunded','invoice.updated','customer.subscription.created','checkout.session.completed']},
    {name:'stripeCompensation',url:`${backend}/stripe`,secret:'BILLING_STRIPE_WEBHOOK_SECRET',events:['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','invoice.payment_action_required','charge.refunded','refund.created','refund.updated','charge.dispute.created','charge.dispute.updated','charge.dispute.closed','subscription_schedule.updated','subscription_schedule.released','subscription_schedule.canceled']}]
  const hooks=await stripe.webhookEndpoints.list({limit:100});assert(!hooks.has_more,'Review all test webhook pages first')
  for(const definition of definitions){
    let hook=hooks.data.find(value=>value.url===definition.url)
    if(!hook){hook=await stripe.webhookEndpoints.create({url:definition.url,enabled_events:definition.events,api_version:'2026-08-26.dahlia',description:`Goalloom D0 ${definition.name}`},{idempotencyKey:`goalloom-d0-${definition.name}-v1`});assert(hook.secret,'New signing secret missing');await savePrivate({[definition.secret]:hook.secret})}
    assert(!hook.livemode&&hook.status==='enabled','Expected enabled test webhook')
    assert(definition.events.every(value=>hook.enabled_events.includes(value)),'Webhook event set drift')
    report[definition.name]={id:hook.id,livemode:hook.livemode,events:hook.enabled_events,status:hook.status}
  }
  let integration=rc('GET',`/projects/${project}/integrations/webhooks`).items.find(value=>value.name==='Goalloom D0 Development')
  if(!integration)integration=rc('POST',`/projects/${project}/integrations/webhooks`,{name:'Goalloom D0 Development',url:`${backend}/revenuecat`,environment:'sandbox',app_id:app})
  assert(integration.environment==='sandbox'&&integration.app_id===app,'Webhook environment/app mismatch')
  if(integration.signing_secret)await savePrivate({BILLING_RC_WEBHOOK_SECRET:integration.signing_secret})
  const saved=await privateConfig()
  report.revenuecatToBackend={id:integration.id,environment:integration.environment,appId:integration.app_id,
    localSigningSecretAvailable:!!saved.BILLING_RC_WEBHOOK_SECRET,signedDeliveryVerified:false}
  const catalog=JSON.parse(await readFile('output/tests/billing/desktop/stripe-preparation.json','utf8'))
  assert(catalog.ok,'Missing confirmed test catalog')
  const config={environment:'development',account:'acct_1QvwdlITpGuR8ZMB',rcProject:project,rcApp:app,
    prices:{monthly:catalog.prices.monthly.id,annual:catalog.prices.annual.id},portalConfiguration:catalog.portal.id,
    returnUrl:'https://www.goalloom.com/billing/return/',cancelUrl:'https://www.goalloom.com/billing/continue/',webOrigin:'https://www.goalloom.com',automaticTax:false,taxRegistrationVerified:false}
  await savePrivate({BILLING_CONFIG:JSON.stringify(config)})
  report.endpointsReady=true
  report.ok=report.revenuecatToBackend.localSigningSecretAvailable
}catch(error){report.error={type:error.type??error.name,code:error.code??null,status:error.statusCode??null};process.exitCode=1}
await writeFile('output/tests/billing/desktop/notification-preparation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
