/**
 * [INPUT]: Explicit runtime env values and the reviewed snapshot bundle identity.
 * [OUTPUT]: Validated production-only values and config, or a finite refusal without secret output.
 * [POS]: Pure configuration contract shared by installation and durable local custody.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {REF,URL,NAMES} from './source.mjs'
export async function runtimeValues(env,source){
 try{
  if(env.SUPABASE_PROJECT_REF!==REF||Object.keys(env).some(k=>!['SUPABASE_PROJECT_REF',...NAMES].includes(k)))throw Error()
  const config=JSON.parse(env.BILLING_CONFIG),{validateConfig}=await import('../../../../supabase/functions/billing/config.ts')
  if(config.environment!=='production'||config.account!=='acct_1QvwdlITpGuR8ZMB'||config.rcProject!=='projd720c733'
   ||Object.keys(config).some(k=>!['environment','account','rcProject','rcApp','prices','portalConfiguration','returnUrl','cancelUrl','webOrigin','automaticTax','taxRegistrationVerified'].includes(k))
   ||typeof config.automaticTax!=='boolean'||typeof config.taxRegistrationVerified!=='boolean'||config.automaticTax||!/^(rk_live_)[A-Za-z0-9]+$/.test(env.BILLING_STRIPE_KEY??''))throw Error()
  const c={...config,url:URL,serviceKey:'injected-on-edge',stripeKey:env.BILLING_STRIPE_KEY,stripeWebhookSecret:env.BILLING_STRIPE_WEBHOOK_SECRET,rcPublicKey:env.BILLING_RC_PUBLIC_KEY,
   rcSecretKey:env.BILLING_RC_SECRET_KEY,rcWebhookSecret:env.BILLING_RC_WEBHOOK_SECRET,workerSecret:env.BILLING_WORKER_SECRET}
  validateConfig(c)
  for(const name of NAMES.filter(x=>x!=='SNAPSHOT_PRODUCER_SHA256'))if(typeof env[name]!=='string'||!env[name]||env[name].length>16384||/[\r\n]/.test(env[name]))throw Error()
  if(!/^whsec_[A-Za-z0-9]+$/.test(env.BILLING_STRIPE_WEBHOOK_SECRET)||env.LIFECYCLE_WORKER_SECRET.length<32||env.DELETION_LEDGER_TOKEN.length<32)throw Error()
  if(new Set([env.BILLING_WORKER_SECRET,env.LIFECYCLE_WORKER_SECRET,env.DELETION_LEDGER_TOKEN,env.BILLING_RC_WEBHOOK_SECRET,env.BILLING_STRIPE_WEBHOOK_SECRET]).size!==5)throw Error()
  const ledger=new globalThis.URL(env.DELETION_LEDGER_URL)
  if(ledger.protocol!=='https:'||ledger.username||ledger.password||ledger.search||ledger.hash||ledger.hostname.endsWith('.supabase.co')||ledger.hostname==='localhost'||!env.DELETION_LEDGER_STORE_ID)throw Error()
  const producer=source.edges.find(e=>e.slug==='snapshot-url').sha256
  if(env.SNAPSHOT_PRODUCER_SHA256&&env.SNAPSHOT_PRODUCER_SHA256!==producer)throw Error()
  return{env:{...env,SNAPSHOT_PRODUCER_SHA256:producer},config}
 }catch{throw Error('invalid_runtime_config')}
}
