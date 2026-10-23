/**
 * [INPUT]: The original unsuccessful synthetic live action and development service-role access.
 * [OUTPUT]: Bounded receipt closure with unchanged confirmed provider fee and cumulative budget.
 * [POS]: Manual real-ledger recovery acceptance; no provider call or receipt replacement.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { client, developmentUrl } from './client.mjs'

const db = await client()
const name = process.argv[2] ?? 'initial'
assert(/^[a-z0-9-]{1,48}$/.test(name), 'Invalid saved run name')
const report = { ok: false, scope: 'Real development receipt RPC for the original unsuccessful synthetic action after its ten-minute window; no inference or fee edits.', realNewProviderCalls: 0 }
try {
  const run = JSON.parse(await readFile(`output/tests/hosted-ai/live-${name}.json`, 'utf8'))
  const action = run.actions.find(action => action.capability === 'assistance' && action.stage !== 'validated')
  assert(action && /^[0-9a-f-]{36}$/i.test(action.actionId), 'Original unsuccessful action required')
  const before = (await db.query(`select user_id,action_id,status,confirmed,charged_micro,provider_request_id,clock_timestamp()>=created_at+interval '10 minutes' as cutoff_passed from public.ai_actions where action_id='${action.actionId}';`))[0]
  assert(before && createHash('sha256').update(before.user_id).digest('hex') === run.owner, 'Saved synthetic owner does not match')
  assert(before.cutoff_passed, 'The reconciliation cutoff has not passed')
  assert(before.confirmed, 'This acceptance requires the already confirmed original fee')
  const budget = () => db.query("select limit_micro,spent_micro,blocked,environment from public.ai_budget where id='integration-shared';")
  const budgetBefore = await budget()
  const keys = await db.request('/api-keys?reveal=true'), service = keys.find(key => key.name === 'service_role')?.api_key
  assert(service, 'Development RPC key unavailable'); db.hide(service)
  const response = await fetch(`${developmentUrl}/rest/v1/rpc/ai_receipt`, { method: 'POST',
    headers: { authorization: `Bearer ${service}`, apikey: service, 'content-type': 'application/json' },
    body: JSON.stringify({ p_user: before.user_id, p_action: action.actionId }), signal: AbortSignal.timeout(15000), redirect: 'error' })
  assert.equal(response.status, 200, 'Receipt recovery unavailable')
  const after = await response.json()
  assert(after.status === 'failed' && after.confirmed && after.charged_micro === before.charged_micro && after.provider_request_id === before.provider_request_id, 'Closure changed a confirmed cost or request identity')
  assert(JSON.stringify(await budget()) === JSON.stringify(budgetBefore), 'Receipt closure changed the shared budget')
  report.actionId = action.actionId; report.status = after.status; report.confirmedMicro = after.charged_micro
  report.providerRequestId = after.provider_request_id; report.budgetUnchanged = true; report.ok = true
} catch (error) { report.error = db.safe(error.message); process.exitCode = 1 }
await writeFile('output/tests/hosted-ai/reconciliation-acceptance.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
