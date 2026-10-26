/**
 * [INPUT]: Explicit synthetic Auth UUIDs from a billing acceptance report.
 * [OUTPUT]: Exact fixture cleanup; the historical entry also retires its controlled fixture source.
 * [POS]: Manual recovery for interrupted D0 acceptance; never resets a workspace or touches another identity.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { client,developmentUrl } from '../hosted-ai/client.mjs'
async function cleanup(db,ids,retireFixtureSource){
  assert(ids.every(id=>/^[0-9a-f-]{36}$/.test(id)),'Expected explicit fixture UUIDs')
  const keys=await db.request('/api-keys?reveal=true'),key=keys.find(value=>value.name==='service_role')?.api_key
  assert(key,'Development cleanup key unavailable');db.hide(key)
  const auth=async(id,method='GET')=>fetch(`${developmentUrl}/auth/v1/admin/users/${id}`,{method,headers:{apikey:key,authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000),redirect:'error'})
  const errors=[],verified=[];let billingClean=false
  for(const id of ids)try{const response=await auth(id);if(response.status===404){verified.push(id);continue}assert.equal(response.status,200);const user=await response.json();assert.equal(user.email,`billing-${id}@goalloom.test`,'Refuse to clean an identity not created by billing acceptance');verified.push(id)}catch{errors.push('fixture_identity_check')}
  if(verified.length)try{
    const list=verified.map(id=>`'${id}'`).join(',')
    const scope=retireFixtureSource?'':"environment='development' and "
    if(!retireFixtureSource){const foreign=await db.query(`select exists(select 1 from billing_accounts where user_id in (${list}) and environment<>'development') as present`);assert(!foreign[0].present,'Refuse a fixture with another environment')}
    await db.query(`begin;delete from billing_compensations where ${scope}user_id in (${list});delete from billing_grace where ${scope}user_id in (${list});delete from billing_transactions where ${scope}user_id in (${list});delete from billing_subscriptions where ${scope}user_id in (${list});delete from billing_operations where ${scope}user_id in (${list});delete from billing_customers where ${scope}user_id in (${list});delete from billing_accounts where ${scope}user_id in (${list});delete from billing_inbox where ${scope}user_id in (${list});commit;`,false)
    billingClean=true
  }catch{errors.push('fixture_billing_cleanup')}
  if(retireFixtureSource)try{await db.query("begin;update billing_policy set enabled=false where environment='development' and exists(select 1 from billing_sources where environment='development' and rc_app='appfixture');delete from billing_sources where environment='development' and rc_app='appfixture';commit;",false)}catch{errors.push('fixture_source_cleanup')}
  for(const id of (retireFixtureSource||billingClean?verified:[]))try{const response=await auth(id,'DELETE');assert([200,404].includes(response.status))}catch{errors.push('fixture_auth_cleanup')}
  return {ok:errors.length===0,errors,accounts:verified}
}
export async function cleanupFixtures(db,ids){return cleanup(db,ids,true)}
export async function cleanupExactFixtures(db,ids){return cleanup(db,ids,false)}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await cleanupFixtures(await client(),process.argv.slice(2));console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1}
