/**
 * [INPUT]: Existing synthetic actions/session and source-verified independent server-side provider receipt evidence.
 * [OUTPUT]: Original-result acceptance facts, receipt-only deduplication/isolation/protection and explicit fee/unknown-hold coverage.
 * [POS]: Live receipt acceptance; no new inference, budget edits or deletion of real attempts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { client, readFetch } from './client.mjs'
import { actionId } from './content-minimization/identity.mjs'
import { acceptanceTarget } from './acceptance-target.mjs'
const { args, environment, projectRef, projectUrl, config, sessionFile, prefix } = acceptanceTarget()
const availableOnly = args.includes('--available-only')
if (availableOnly) args.splice(args.indexOf('--available-only'), 1)
assert(args.length <= 3, 'Unexpected receipt acceptance arguments')

const db = await client(config, environment), created = [], checks = []
const primaryRun = args[0] ?? 'initial', rewriteRun = args[1] ?? 'assistance-fix'
assert([primaryRun, rewriteRun,...args.slice(2)].every(run => /^[a-z0-9-]{1,48}$/.test(run)), 'Invalid saved run name')
const report = { ok: false, availableOnly, checks, scope: `Real ${environment} Auth/Edge/ledger; independent OpenRouter generation receipts checked through a temporary server-only metadata worker; synthetic contexts only. Available-only mode verifies successful results and security while explicitly retaining missing capability acceptance.`, realNewProviderCalls: 0 }
let service, anon, fixture, protectedFixture = false
const call = async (path, { method = 'GET', json, token = service } = {}) => {
  const response = await (method === 'GET' ? readFetch : fetch)(`${projectUrl}${path}`, { method, headers: { authorization: `Bearer ${token}`, apikey: anon, 'content-type': 'application/json' },
    ...(json ? { body: JSON.stringify(json) } : {}), signal: AbortSignal.timeout(15000), redirect: 'error' })
  return { status: response.status, body: await response.json().catch(() => null) }
}
try {
  const env = parseEnv(await readFile(sessionFile, 'utf8'))
  assert(env.SUPABASE_PROJECT_REF === projectRef, 'Selected project session required')
  fixture = env.HOSTED_AI_SYNTHETIC_USER_ID
  assert(/^[0-9a-f-]{36}$/i.test(fixture), 'Synthetic fixture identity required')
  const keys = await db.request('/api-keys?reveal=true')
  service = keys.find(row => row.name === 'service_role')?.api_key; anon = keys.find(row => row.name === 'anon')?.api_key
  assert(service && anon, 'Auth keys unavailable'); db.hide(service); db.hide(anon); db.hide(env.HOSTED_AI_SESSION_TOKEN)
  const fixtureUser = await call(`/auth/v1/admin/users/${fixture}`)
  assert(fixtureUser.status === 200 && fixtureUser.body.app_metadata?.hosted_acceptance_fixture === 'v1', 'Fixture ownership marker missing')
  const initial = JSON.parse(await readFile(`output/tests/hosted-ai/${prefix}live-${primaryRun}.json`, 'utf8'))
  const recovery = JSON.parse(await readFile(`output/tests/hosted-ai/${prefix}live-${rewriteRun}.json`, 'utf8'))
  let candidates = [...initial.actions.filter(action => action.capability !== 'assistance'), ...recovery.actions.filter(action => action.capability === 'assistance')]
  if(args[2]) {
    const correction=JSON.parse(await readFile(`output/tests/hosted-ai/${prefix}live-${args[2]}.json`,'utf8'))
    const overrides=new Map(correction.actions.filter(action=>action.capability!=='assistance' && action.stage==='validated').map(action=>[action.capability,action]))
    candidates=candidates.map(action=>overrides.get(action.capability)??action)
  }
  const selected = availableOnly ? candidates.filter(action => action.stage === 'validated') : candidates
  assert(selected.length > 0 && selected.every(action => action.stage === 'validated') && (availableOnly || selected.length === 4), 'Validated capability results required')
  report.missingCapabilities = ['evaluate', 'draft', 'review', 'assistance'].filter(capability => !selected.some(action => action.capability === capability))
  report.allCapabilitiesPassed = report.missingCapabilities.length === 0
  const ledger = () => db.query(`select action_id,capability,status,confirmed,charged_micro,provider_request_id,input_tokens,output_tokens from public.ai_actions where user_id='${fixture}' order by created_at;`)
  const attemptFacts = rows => JSON.stringify(rows.map(({ status, ...identityAndUsage }) => identityAndUsage))
  const before = await ledger(), endpoint = '/functions/v1/hosted-ai'
  for (const action of selected) {
    const response = await call(`${endpoint}?actionId=${action.actionId}`, { token: env.HOSTED_AI_SESSION_TOKEN })
    assert(response.status === 409 && response.body.error === 'result_not_delivered' && !Object.hasOwn(response.body, 'result'), 'Receipt must not restore content')
  }
  report.qualityVerifiedByThisRun = false
  checks.push('GET returns receipt-only completion; semantic quality belongs to the original POST acceptance')
  const evaluate = selected.find(action => action.capability === 'evaluate')
  const duplicate = await call(endpoint, { method: 'POST', token: env.HOSTED_AI_SESSION_TOKEN, json: { version: 2, consentScopeVersion: 3, actionId: evaluate.actionId, request: { capability: 'evaluate', input: { state: { text: 'Synthetic duplicate action' }, questions: { task: { type: 'boolean', instructions: 'Task?', criteria: { true: 'yes', false: 'no' } } } } } } })
  assert(duplicate.status === (evaluate.actionId[14] === '7' ? 409 : 400) && !Object.hasOwn(duplicate.body, 'result'), 'Duplicate must not recover content or rerun inference')
  assert(attemptFacts(await ledger()) === attemptFacts(before), 'Duplicate changed the original cost facts')
  checks.push('Duplicate POST returns no content and preserves attempts, identities and fees')
  const password = randomBytes(24).toString('base64url'), email = `hosted-reader-${randomUUID()}@goalloom.test`
  const made = await call('/auth/v1/admin/users', { method: 'POST', json: { email, password, email_confirm: true } })
  assert.equal(made.status, 200); created.push(made.body.id)
  const login = await call('/auth/v1/token?grant_type=password', { method: 'POST', token: anon, json: { email, password } })
  assert.equal(login.status, 200); db.hide(login.body.access_token)
  const other = await call(`${endpoint}?actionId=${evaluate.actionId}`, { token: login.body.access_token })
  assert.equal(other.status, 404)
  const direct = await call('/rest/v1/ai_actions?select=action_id', { token: login.body.access_token })
  assert([401, 403].includes(direct.status))
  checks.push('A second real Auth account cannot recover another account’s action or read its private ledger')
  const existingProtection = await db.query(`select 1 from public.ai_protection where user_id='${fixture}';`)
  assert.equal(existingProtection.length, 0, 'Fixture already protected; do not replace another setting')
  await db.query(`insert into public.ai_protection(user_id,blocked,reason) values('${fixture}',true,'manual_review');`, false); protectedFixture = true
  const blocked = await call(endpoint, { method: 'POST', token: env.HOSTED_AI_SESSION_TOKEN, json: { version: 2, consentScopeVersion: 3, actionId: actionId(), request: { capability: 'evaluate', input: { state: { text: 'Synthetic protected task' }, questions: { task: { type: 'boolean', instructions: 'Task?', criteria: { true: 'yes', false: 'no' } } } } } } })
  assert(blocked.status === 403 && blocked.body.error === 'account_protection', 'Account protection failed')
  assert(attemptFacts(await ledger()) === attemptFacts(before), 'Protected request admitted an attempt')
  checks.push('Real account protection rejects before inference and preserves existing result receipts')
  const provider=JSON.parse(await readFile(`output/tests/hosted-ai/content-minimization/${prefix}provider-receipts.json`,'utf8'))
  assert(provider.ok && provider.environment===environment && provider.project===projectRef && provider.temporaryWorkerRemoved,'Independent provider receipt evidence required')
  const matched=new Map(provider.receipts.filter(row=>row.verified).map(row=>[row.actionId,row]))
  for(const action of selected)assert(matched.has(action.actionId),'Selected capability lacks independent provider verification')
  for(const row of before.filter(row=>row.confirmed && row.provider_request_id)) {
    const proof=matched.get(row.action_id)
    assert(proof && proof.providerRequestId===row.provider_request_id && proof.ledgerMicro===row.charged_micro && proof.ledgerInputTokens===row.input_tokens && proof.ledgerOutputTokens===row.output_tokens && ['native','normalized'].includes(proof.tokenBasis),'Original fee/token metadata differs')
  }
  report.providerReceipts=provider.receipts
  report.independentProviderFeesVerified=true
  report.independentFeeScope='Selected successful capabilities and confirmed attempts with provider identities; unconfirmed reservations remain unverified.'
  report.unconfirmedProviderIdentities=before.filter(row=>!row.confirmed && row.provider_request_id).map(row=>({actionId:row.action_id,providerRequestId:row.provider_request_id,preservedMicro:row.charged_micro}))
  report.historicalActionsWithoutProviderIdentity=before.filter(row=>!row.provider_request_id).length
  report.allPhysicalAttemptsIndependentlyMatched=before.every(row=>matched.has(row.action_id))
  report.actualMatchedProviderUsd=provider.receipts.filter(row=>row.verified).reduce((sum,row)=>sum+row.totalCostUsd,0)
  report.ledgerMicro=before.reduce((sum,row)=>sum+row.charged_micro,0)
  report.unconfirmedReservedMicro=before.filter(row=>!row.confirmed).reduce((sum,row)=>sum+row.charged_micro,0)
  report.retainedFailedAttempts=before.filter(row=>row.status==='failed').length
  checks.push('Selected capability attempts and confirmed provider identities match independent operator, declared token basis and exact rounded costs; missing identities and unconfirmed reservations stay explicit')
  report.ok = true
} catch (error) { report.error = 'receipt_acceptance_incomplete'; process.exitCode = 1 }
finally {
  const cleanup = []
  if (protectedFixture) {
    try { await db.query(`delete from public.ai_protection where user_id='${fixture}' and reason='manual_review';`, false); cleanup.push(true) } catch { cleanup.push(false) }
  }
  for (const id of created) { try { cleanup.push((await call(`/auth/v1/admin/users/${id}`, { method: 'DELETE' })).status === 200) } catch { cleanup.push(false) } }
  report.temporaryFixturesRemoved = cleanup.every(Boolean)
  if (!report.temporaryFixturesRemoved) { report.ok = false; process.exitCode = 1 }
  await writeFile(`output/tests/hosted-ai/${prefix}receipt-acceptance.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(`Evidence: output/tests/hosted-ai/${prefix}receipt-acceptance.json; ok=${report.ok}; no new inference requested.`)
}
