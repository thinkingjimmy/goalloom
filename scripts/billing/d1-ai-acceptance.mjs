/**
 * [INPUT]: Exact existing synthetic transport identity and authorized development policy change.
 * [OUTPUT]: Real hosted status GET evidence and rollback-only admission denial; preserved fees and budgets.
 * [POS]: D1 paid AI gate acceptance. No inference POST, model metadata call or production access.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,writeFile,stat} from 'node:fs/promises'
import {client,developmentRef,developmentUrl} from '../hosted-ai/client.mjs'
import {actionId} from '../hosted-ai/content-minimization/identity.mjs'
const directory='output/tests/billing/desktop/d1-backend',privateFile=`${directory}/.transport-private.json`,reportFile=`${directory}/ai-acceptance.json`
const q=value=>`'${String(value).replaceAll("'","''")}'`
assert.equal((await stat(privateFile)).mode&0o077,0)
const fixture=JSON.parse(await readFile(privateFile,'utf8'));assert.equal(fixture.project,developmentRef);assert.equal(fixture.email,`billing-${fixture.user}@goalloom.test`);assert(!fixture.cleaned)
const db=await client(),keys=await db.request('/api-keys?reveal=true'),anon=keys.find(x=>x.name==='anon')?.api_key,service=keys.find(x=>x.name==='service_role')?.api_key
assert(anon&&service);db.hide(anon);db.hide(service)
const token=fixture.sessions[0].access_token;db.hide(token)
const report={ok:false,project:developmentRef,fixture:fixture.user,checks:[],modelCalls:0,inferencePosts:0,persistentReservations:0,scope:'Real development hosted-AI status GET and rollback-only SQL admission. Only authorized policy disabled -> trial_or_paid persists; fixture clock only, no production access.',platform:{node:process.version,os:process.platform,arch:process.arch}}
const save=()=>writeFile(reportFile,JSON.stringify(report,null,2)+'\n')
async function get(path,version){const response=await fetch(`${developmentUrl}${path}`,{headers:{apikey:anon,authorization:`Bearer ${token}`,...(version===undefined?{}:{'x-goalloom-service-version':version})},signal:AbortSignal.timeout(20000),redirect:'error'});const body=await response.json();return {status:response.status,body}}
const state=async()=>(await db.query(`select jsonb_build_object(
 'budget',(select to_jsonb(b) from public.ai_budget b where id='integration-shared'),
 'fees',(select md5(coalesce(string_agg(user_id::text||':'||action_id::text||':'||charged_micro::text||':'||confirmed::text||':'||status,',' order by user_id,action_id),'')) from public.ai_actions),
 'actions',(select count(*) from public.ai_actions),
 'protections',(select md5(coalesce(string_agg(to_jsonb(p)::text,',' order by user_id),'')) from public.ai_protection p),
 'counters',(select md5(coalesce(string_agg(to_jsonb(e)::text,',' order by user_id,action_id),'')) from public.ai_limit_events e)) as state;`))[0].state
const clock=async time=>db.query(`update public.billing_accounts set test_now=${q(time)} where environment='development' and user_id=${q(fixture.user)};`,false)
try{
 const identity=await fetch(`${developmentUrl}/auth/v1/admin/users/${fixture.user}`,{headers:{apikey:service,authorization:`Bearer ${service}`},signal:AbortSignal.timeout(15000),redirect:'error'});assert.equal(identity.status,200);assert.equal((await identity.json()).email,fixture.email)
 const before=await state();report.before=before;assert.equal(before.budget.environment,'development');assert(['disabled','trial_or_paid'].includes(before.budget.policy));assert.equal(before.budget.limit_micro,before.budget.spent_micro,'Keep the real shared hard stop in place');await save()
 await db.query("update public.ai_budget set policy='trial_or_paid' where id='integration-shared' and environment='development' and policy='disabled';",false)
 report.policyActivated=true;await save()
 await clock(new Date(Date.parse(fixture.trial.trialStartedAt)+3600000).toISOString())
 for(const version of [undefined,'0']){const result=await get('/functions/v1/hosted-ai?status=1',version);assert.equal(result.status,409);assert.equal(result.body.error,'upgrade_required')}
 const active=await get('/functions/v1/hosted-ai?status=1','1');assert.equal(active.status,200);assert.equal(active.body.eligible,true);report.active=active
 report.checks.push('actual status GET requires version1 and admits original active trial')
 const action=actionId()
 const probe=(await db.query(`begin;set local statement_timeout='30s';set local request.headers='{"x-goalloom-service-version":"1"}';
 select jsonb_build_object('admission',public.ai_admit(${q(fixture.user)},${q(action)},'evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000),
  'actionAbsent',not exists(select 1 from public.ai_actions where user_id=${q(fixture.user)} and action_id=${q(action)})) as probe;rollback;`,false))[0].probe
 assert.equal(probe.admission.error,'platform_budget');assert(probe.actionAbsent);report.atomicProbe=probe
 report.checks.push('real atomic admission retains shared hard stop; complete probe transaction rolled back')
 await clock(fixture.trial.trialEndsAt)
 const expired=await get('/functions/v1/hosted-ai?status=1','1');assert.equal(expired.status,403);assert.equal(expired.body.error,'service_expired');report.expired=expired
 const receipt=await get(`/functions/v1/hosted-ai?actionId=${action}`,'1');assert.equal(receipt.status,404);assert.equal(receipt.body.error,'not_found');report.receipt=receipt
 report.checks.push('expiry is service403 rather than authentication401; receipt-only GET remains independent of admission')
 const after=await state();report.after=after
 assert.equal(after.budget.policy,'trial_or_paid');const expected={...before,budget:{...before.budget,policy:'trial_or_paid'}};assert.deepEqual(after,expected,'Policy change or GETs altered budget, fees, counters or protection')
 report.accountingPreserved=true;report.fixtureClock='exact original trial end';report.ok=true
}catch(error){report.error={type:error.name,code:error.name==='AssertionError'?'assertion_failed':'ai_acceptance_incomplete'};process.exitCode=1}
await save();console.log(JSON.stringify({ok:report.ok,checks:report.checks,accountingPreserved:report.accountingPreserved??false,evidence:reportFile,error:report.error??null},null,2))
