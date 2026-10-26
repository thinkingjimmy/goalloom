/**
 * [INPUT]: Optional explicit metadata-only Live binding JSON; environment variables are not inputs.
 * [OUTPUT]: Validated declared bindings and missing-binding blockers; never deployment readiness.
 * [POS]: Production-package input boundary. Secrets and unknown fields fail without echoing their values.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {TARGET,COMMERCIAL,PORTAL_FEATURES} from './policy.mjs'
const fail=()=>{throw Error('invalid_declared_bindings')}
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
function keys(x,allowed){if(!plain(x)||Object.keys(x).some(k=>!allowed.includes(k)))fail()}
function text(x,pattern){if(typeof x!=='string'||!pattern.test(x)||/sk_(?:live|test)_|rk_(?:live|test)_|whsec_|Bearer\s|-----BEGIN|supabase_service_role|eyJ[A-Za-z0-9_-]+\./i.test(x))fail()}
const knownTest=new Set(['price_1UTixtITpGuR8ZMBad9rebNS','price_1UTixtITpGuR8ZMBXyJ3nNDl','price_1UTZ7CITpGuR8ZMBTeGKldUg','price_1UTZ7CITpGuR8ZMBgZmbY9fj'])
function identifier(x,prefix){text(x,new RegExp('^'+prefix+'_[A-Za-z0-9]{1,120}$'));if(knownTest.has(x))fail()}
export function validateBindings(input=null){
 if(input===null)return{declared:null,complete:false,missing:['monthly_price','annual_price','portal_configuration','revenuecat_stripe_app','independent_ledger','tax_review']}
 keys(input,['version','environment','projectRef','account','rcProject','monthly','annual','portal','revenueCat','ledger','tax'])
 if(input.version!==1||Object.entries(TARGET).filter(([k])=>['environment','projectRef','account','rcProject'].includes(k)).some(([k,v])=>input[k]!==v))fail()
 const missing=[]
 for(const cycle of ['monthly','annual']){
  const value=input[cycle];if(value===null||value===undefined){missing.push(cycle+'_price');continue}
  keys(value,['id','productId','livemode','active','currency','unitAmount','interval','intervalCount','taxBehavior','usageType','billingScheme'])
  identifier(value.id,'price');identifier(value.productId,'prod')
  if(value.livemode!==true||value.active!==true||value.currency!=='usd'||value.unitAmount!==COMMERCIAL.priceCatalog[cycle].amount||value.interval!==(cycle==='monthly'?'month':'year')||value.intervalCount!==1||value.taxBehavior!=='inclusive'||value.usageType!=='licensed'||value.billingScheme!=='per_unit')fail()
 }
 if(input.monthly&&input.annual&&(input.monthly.id===input.annual.id||input.monthly.productId!==input.annual.productId))fail()
 if(input.portal){keys(input.portal,['id','livemode','active','features']);identifier(input.portal.id,'bpc');keys(input.portal.features,Object.keys(PORTAL_FEATURES));if(input.portal.livemode!==true||input.portal.active!==true||Object.entries(PORTAL_FEATURES).some(([k,v])=>input.portal.features[k]!==v))fail()}else missing.push('portal_configuration')
 if(input.revenueCat){const rc=input.revenueCat;keys(rc,['appId','store','environment','entitlement','monthlyPriceId','annualPriceId']);text(rc.appId,/^app[a-z0-9]{1,80}$/);if(['app9e61967dec','app3b6d4a4bcf'].includes(rc.appId)||rc.store!=='stripe'||rc.environment!=='production'||rc.entitlement!=='plus'||!input.monthly||!input.annual||rc.monthlyPriceId!==input.monthly.id||rc.annualPriceId!==input.annual.id)fail()}else missing.push('revenuecat_stripe_app')
 if(input.ledger){const ledger=input.ledger;keys(ledger,['url','storeId','independent']);text(ledger.url,/^https:\/\/[^\s]{1,300}$/);text(ledger.storeId,/^[A-Za-z0-9_-]{1,120}$/);let url;try{url=new URL(ledger.url)}catch{fail()};if(ledger.independent!==true||url.username||url.password||url.search||url.hash||url.port||url.hostname.endsWith('.supabase.co')||['localhost','127.0.0.1','::1'].includes(url.hostname)||/\.test$|\.invalid$|\.example$|^example\./.test(url.hostname))fail()}else missing.push('independent_ledger')
 if(input.tax){keys(input.tax,['automaticTax','taxRegistrationVerified','reviewReference','permittedRegions','productTaxCode']);if(typeof input.tax.automaticTax!=='boolean'||typeof input.tax.taxRegistrationVerified!=='boolean'||input.tax.automaticTax&&!input.tax.taxRegistrationVerified)fail();text(input.tax.productTaxCode,/^txcd_[0-9]{8}$/);text(input.tax.reviewReference,/^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,160}$/);if(!Array.isArray(input.tax.permittedRegions)||!input.tax.permittedRegions.length||input.tax.permittedRegions.length>250||new Set(input.tax.permittedRegions).size!==input.tax.permittedRegions.length||input.tax.permittedRegions.some(x=>typeof x!=='string'||!/^[A-Z]{2}$/.test(x)))fail()}else missing.push('tax_review')
 return{declared:structuredClone(input),complete:missing.length===0,missing}
}
