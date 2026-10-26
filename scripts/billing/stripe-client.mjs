/**
 * [INPUT]: Existing Stripe CLI test credential or explicit owner-only billing configuration.
 * [OUTPUT]: Target-account test-mode SDK with no credential output or live-key fallback.
 * [POS]: Manual D0 provider tooling; never reads the CLI live credential value.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { parseEnv } from 'node:util'
import { resolve } from 'node:path'
const require=createRequire(resolve(process.env.BILLING_RUNTIME??'/private/tmp/goalloom-billing-runtime','package.json'))
const Stripe=require('stripe')
export async function testStripe(){
  let key
  try{const file='.env.billing.local';assert(((await stat(file)).mode&0o077)===0,'Billing credential file must be owner-only');key=parseEnv(await readFile(file,'utf8')).BILLING_STRIPE_KEY}
  catch(error){if(error.code!=='ENOENT')throw error}
  if(!key){
    const content=await readFile(`${homedir()}/.config/stripe/config.toml`,'utf8')
    const section=content.match(/\[default\]\s*([\s\S]*?)(?=\n\[|$)/)?.[1]??''
    assert(section.match(/^account_id\s*=\s*['"]([^'"]+)['"]/m)?.[1]==='acct_1QvwdlITpGuR8ZMB','Stripe CLI targets another account')
    key=section.match(/^test_mode_api_key\s*=\s*['"]([^'"]+)['"]/m)?.[1]
  }
  assert(/^[rs]k_test_/.test(key??''),'A test-mode Stripe credential is required; live fallback is forbidden')
  const stripe=new Stripe(key,{apiVersion:'2026-08-26.dahlia',maxNetworkRetries:0,timeout:15000})
  const account=await stripe.accounts.retrieve('acct_1QvwdlITpGuR8ZMB')
  assert.equal(account.id,'acct_1QvwdlITpGuR8ZMB')
  return {stripe,account,key}
}
