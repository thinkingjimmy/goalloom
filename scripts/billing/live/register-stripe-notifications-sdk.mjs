/**
 * [INPUT]: Source-bound reviewed proposal, temporary setup-only Live key and existing CLI read profile.
 * [OUTPUT]: Two disabled endpoints, exact existing RC secret preservation and finite diagnostic/readback evidence.
 * [POS]: Registration recovery after definitive403 and a v2 connection failure before creation. Reuses the existing setup key.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readFile, lstat, mkdir, open } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify, parseEnv, isDeepStrictEqual } from 'node:util'
import { requireThat, oneShotHttpClient, transportErrorCodes } from './adapters.mjs'
import { TARGET, API_VERSION, OWNER, NOTIFICATIONS } from './policy.mjs'
import { canonical, syncDirectory, exclusiveJson, privateState, saveSecret, exactEndpoint, redactEndpoint } from './register-stripe-notifications.mjs'

const exec = promisify(execFile)
const ORIGINAL_HASH = 'cf1e1aa7dd001be9fad4f80a8eeec8214798976177c4a063b4c7536a44316110'
const ROOT = resolve('output/tests/billing/desktop/bill29-execution')
const RUN = `${ROOT}/notifications-stripe-sdk-registration-v3`
const SETUP = resolve('scripts/billing/live/private/.env.webhook-setup.local')
const FIELD = 'BILL29_STRIPE_WEBHOOK_SETUP_KEY'
const NAMES = ['BILLING_RC_STRIPE_WEBHOOK_SECRET', 'BILLING_STRIPE_WEBHOOK_SECRET']
const sources = ['register-stripe-notifications-sdk.mjs', 'register-stripe-notifications.mjs', 'adapters.mjs', 'policy.mjs']
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex')
const require = createRequire('/private/tmp/goalloom-billing-runtime/package.json')
const Stripe = require('stripe')
const SDK_PACKAGE = resolve(dirname(require.resolve('stripe')), '../package.json')

export function diagnostic(error) {
  const token = value => typeof value === 'string' && /^[A-Za-z0-9_:-]{1,120}$/.test(value) && !/^(?:rk|sk|whsec)_/.test(value) ? value : null
  const request = error.requestId ?? error.raw?.request_id
  return { httpStatus: Number.isInteger(error.statusCode) ? error.statusCode : null, code: token(error.code), type: token(error.type),
    requestId: typeof request === 'string' && /^req_[A-Za-z0-9]{1,100}$/.test(request) ? request : null, transportCodes: transportErrorCodes(error),
    missingPermissions: [...new Set((error.raw?.message ?? error.message ?? '').match(/\b[a-z][a-z0-9_]{2,80}_(?:read|write)\b/g) ?? [])]
      .filter(value => ['webhook_read', 'webhook_write', 'connected_account_read', 'subscription_read', 'invoice_read'].includes(value)) }
}
async function proposal() {
  const raw = await readFile(`${ROOT}/notifications-v3-approval-only/plan.json`, 'utf8')
  requireThat(hash(raw) === ORIGINAL_HASH, 'original_proposal_changed')
  const original = JSON.parse(raw)
  requireThat(isDeepStrictEqual(original.target, TARGET) && original.apiVersion === API_VERSION, 'proposal_target')
  const operations = original.proposedActions.slice(0, 2).map((action, i) => {
    const expected = { url: NOTIFICATIONS[i].url, enabled_events: NOTIFICATIONS[i].events, api_version: API_VERSION, description: NOTIFICATIONS[i].name, metadata: OWNER }
    requireThat(action.create.method === 'POST' && action.create.path === '/v1/webhook_endpoints' && isDeepStrictEqual(action.create.body, expected), 'proposal_request')
    return { ...action.create, privateName: NAMES[i] }
  })
  const priorNames = ['notifications-stripe-registration-v1/dispatch.jsonl', 'stripe-original-post-workbench-diagnosis-v1.json', 'notification-outcome-cli-readonly-v1.json',
    'notifications-stripe-sdk-registration-v2/plan.json', 'notifications-stripe-sdk-registration-v2/dispatch.jsonl', 'webhook-setup-sdk-connection-readonly-v1.json']
  const prior = await Promise.all(priorNames.map(name => readFile(`${ROOT}/${name}`, 'utf8')))
  const journal = prior[0].trim().split('\n').map(line => JSON.parse(line)), rejected = JSON.parse(prior[1]), list = JSON.parse(prior[2])
  const dispatched = journal.find(v => v.state === 'create_dispatched')
  requireThat(dispatched?.step === 1 && rejected.httpStatus === 403 && rejected.providerRejectedCreate === true &&
    rejected.idempotency === dispatched.idempotency && rejected.idempotencyMatchesOriginalDispatch === true &&
    rejected.account === TARGET.account && rejected.path === '/v1/webhook_endpoints' && list.complete === true && list.count === 0, 'original_outcome_unresolved')
  const { preparedAt, reviewedSet: previousHash, ...previousPlan } = JSON.parse(prior[3])
  const previousJournal = prior[4].trim().split('\n').map(line => JSON.parse(line)), recovered = JSON.parse(prior[5])
  requireThat(previousHash === hash(previousPlan) && previousJournal.length === 2 && previousJournal[0].state === 'started' &&
    previousJournal[0].reviewedSet === previousHash && previousJournal[1].state === 'unresolved' &&
    previousJournal[1].diagnostic?.type === 'StripeConnectionError' && previousJournal[1].diagnostic?.httpStatus === null &&
    recovered.account === TARGET.account && recovered.keyId === 'mk_1UUbkNITpGuR8ZMB1k2BnLl6' && recovered.readOnlyRecovered === true && recovered.emptyEndpointList === true &&
    recovered.results?.find(v => v.name === 'account')?.expectedAccount === true &&
    recovered.results?.find(v => v.name === 'webhook_list')?.complete === true && recovered.results.find(v => v.name === 'webhook_list').count === 0, 'previous_sdk_outcome_unresolved')
  const sdk = await readFile(SDK_PACKAGE, 'utf8')
  requireThat(JSON.parse(sdk).version === '22.6.0', 'stripe_runtime_version')
  return { version: 3, target: TARGET, apiVersion: API_VERSION, originalProposalHash: ORIGINAL_HASH,
    sources: Object.fromEntries(await Promise.all(sources.map(async name => [name, hash(await readFile(new URL(name, import.meta.url)))]))),
    sdk: { version: '22.6.0', packagePath: SDK_PACKAGE, packageSha256: hash(sdk) },
    originalEvidence: Object.fromEntries(priorNames.map((name, i) => [name, hash(prior[i])])), operations,
    setup: { path: SETUP, field: FIELD, keyId: 'mk_1UUbkNITpGuR8ZMB1k2BnLl6', name: 'Goalloom Webhook Setup', reuseExisting: true,
      permissions: ['webhook_write', 'connected_account_read'], temporary: true, revokeAfterRegistration: true, receiverDestination: false },
    activation: false, preserveExistingRcBytes: true }
}
async function setupKey() {
  await canonical(dirname(SETUP)); await canonical(SETUP)
  const state = await lstat(SETUP), dir = await lstat(dirname(SETUP))
  requireThat(state.isFile() && !state.isSymbolicLink() && state.uid === process.getuid() && (state.mode & 0o777) === 0o600 && state.size < 16384 &&
    dir.uid === process.getuid() && (dir.mode & 0o777) === 0o700, 'setup_custody')
  const values = parseEnv(await readFile(SETUP, 'utf8'))
  requireThat(Object.keys(values).length === 1 && /^rk_live_[A-Za-z0-9_]+$/.test(values[FIELD] ?? ''), 'setup_key_required')
  return values[FIELD]
}
async function cliGet(path) {
  const args = ['get', path, '--live', '--project-name', 'default', '--color', 'off', '--log-level', 'error', '--stripe-version', API_VERSION]
  try {
    const { stdout } = await exec('stripe', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 })
    const value = JSON.parse(stdout); requireThat(!value.error, 'cli_read_failed'); return value
  } catch (error) {
    let raw; try { raw = JSON.parse(error.stdout ?? '') } catch {}
    const safe = new Error('cli_read_unresolved')
    Object.assign(safe, { code: raw?.error?.code ?? 'cli_read_unresolved', statusCode: raw?.error?.status, requestId: raw?.error?.request_id, type: raw?.error?.type })
    throw safe
  }
}
function emptyList(value) { requireThat(value.object === 'list' && value.has_more === false && Array.isArray(value.data) && value.data.length === 0, 'preflight_nonempty_or_incomplete') }

export async function run(argv, ports = {}) {
  const prepare = argv.length === 1 && argv[0] === '--prepare'
  const check = argv.length === 3 && argv[0] === '--check' && argv[1] === '--reviewed-set'
  requireThat(prepare || check || argv.length === 2 && argv[0] === '--reviewed-set', 'usage')
  const current = await proposal()
  if (prepare) {
    await canonical(ROOT); await mkdir(RUN, { mode: 0o700 }); await syncDirectory(ROOT)
    const reviewedSet = hash(current)
    await exclusiveJson(`${RUN}/plan.json`, { preparedAt: new Date().toISOString(), ...current, reviewedSet })
    return { ok: true, localOnly: true, reviewedSet, path: `${RUN}/plan.json`, reuseExistingSetupKey: true, writesExecuted: 0 }
  }
  await canonical(RUN); await canonical(`${RUN}/plan.json`)
  const { preparedAt, reviewedSet, ...reviewed } = JSON.parse(await readFile(`${RUN}/plan.json`, 'utf8'))
  requireThat(reviewedSet === argv.at(-1) && reviewedSet === hash(reviewed) && isDeepStrictEqual(reviewed, current), 'review_or_source_drift')
  if (check) return { ok: true, localOnly: true, reviewedSet, setupKeyRead: false }
  requireThat(process.env.BILL29_NOTIFICATION_WINDOW === 'registration' && !Object.keys(process.env).some(k => /^STRIPE/i.test(k)), 'registration_window_or_override')
  const prior = await privateState()
  requireThat(NAMES.every(name => !prior.values[name]), 'stripe_secrets_already_present')
  const key = await setupKey()
  const client = ports.createClient ? ports.createClient(key) : new Stripe(key, { apiVersion: API_VERSION, maxNetworkRetries: 0, timeout: 15000, httpClient: oneShotHttpClient(Stripe), host: 'api.stripe.com', protocol: 'https' })
  const journal = await open(`${RUN}/dispatch.jsonl`, 'wx', 0o600); await syncDirectory(RUN)
  const append = async value => { await journal.writeFile(`${JSON.stringify({ at: new Date().toISOString(), ...value })}\n`); await journal.sync() }
  try {
    await append({ state: 'started', reviewedSet, automaticReplay: false })
    const account = await client.accounts.retrieve(TARGET.account)
    requireThat(account.id === TARGET.account, 'setup_account_mismatch')
    const cliAccount = await cliGet('/v1/account'); requireThat(cliAccount.id === TARGET.account, 'cli_account_mismatch')
    const endpointList = await client.webhookEndpoints.list({ limit: 100 }); emptyList(endpointList)
    const counts = { endpoints: 0 }
    for (const path of ['/v1/subscriptions?status=all&limit=100', '/v1/invoices?limit=100', '/v1/subscription_schedules?limit=100']) {
      const value = await cliGet(path); emptyList(value); counts[path] = 0
    }
    await exclusiveJson(`${RUN}/preflight.json`, { account: account.id, sameSetupKeyAccountVerified: true, cliAccount: cliAccount.id, counts })
    const results = []
    for (let i = 0; i < reviewed.operations.length; i++) {
      const operation = reviewed.operations[i], idempotency = `goalloom-webhooks-sdk-${reviewedSet}-${i + 1}`
      await append({ state: 'create_dispatched', step: i + 1, requestHash: hash(operation.body), idempotency })
      const created = await client.webhookEndpoints.create(operation.body, { idempotencyKey: idempotency })
      requireThat(/^we_[A-Za-z0-9]+$/.test(created.id ?? ''), 'create_id_unknown')
      let saved = false, custody = null, captureError = false, disabled, disableError = null, observed, readError = null
      try {
        requireThat(exactEndpoint(created, operation.body), 'create_fields')
        custody = await saveSecret(operation.privateName, created.secret); saved = true
        await append({ state: 'secret_saved', step: i + 1, id: created.id, privateName: operation.privateName })
      } catch (error) { captureError = diagnostic(error) }
      finally {
        try { await append({ state: 'disable_dispatched', step: i + 1, id: created.id }) } catch { captureError ||= { code: 'journal_sync_failed' } }
        try { await client.webhookEndpoints.update(created.id, { disabled: true }, { idempotencyKey: `${idempotency}-disable` }); disabled = true }
        catch (error) { disableError = diagnostic(error) }
        try { observed = await client.webhookEndpoints.retrieve(created.id) }
        catch (error) { readError = diagnostic(error) }
      }
      const verified = !!observed && observed.id === created.id && observed.status === 'disabled' && exactEndpoint(observed, operation.body)
      const result = { step: i + 1, id: created.id, secretSaved: saved, custody, captureError, disableAcknowledged: !!disabled, disableError, readError,
        disabledVerified: verified, endpoint: observed ? redactEndpoint(observed) : null }
      results.push(result); await exclusiveJson(`${RUN}/step-${i + 1}.json`, result)
      await append({ state: verified && saved && !captureError ? 'disabled_verified' : 'unresolved', step: i + 1, id: created.id, secretSaved: saved, disabledVerified: verified })
      requireThat(verified && saved && !captureError, 'registration_unresolved')
    }
    const after = await privateState()
    requireThat(after.text.startsWith(prior.text) && after.values.BILLING_RC_WEBHOOK_SECRET === prior.values.BILLING_RC_WEBHOOK_SECRET, 'rc_custody_changed')
    const value = { ok: true, reviewedSet, results, priorRcBytesAndValuePreserved: true, privatePath: resolve('scripts/billing/live/private/.env.notifications.local'),
      setupKeyRevocationPending: true, setupPrivateFile: SETUP, receiverInstalled: false, providerDeliveryVerified: false, launchReady: false }
    await exclusiveJson(`${RUN}/readback.json`, value)
    return { ok: true, endpointsDisabled: 2, evidencePath: `${RUN}/readback.json`, setupKeyRevocationPending: true, providerDeliveryVerified: false }
  } catch (error) {
    await append({ state: 'unresolved', diagnostic: diagnostic(error), automaticReplay: false }).catch(() => {})
    throw error
  } finally { await journal.close() }
}
export async function main(argv = process.argv.slice(2), ports) {
  try { console.log(JSON.stringify(await run(argv, ports))) }
  catch (error) { console.log(JSON.stringify({ ok: false, diagnostic: diagnostic(error), automaticReplay: false })); process.exitCode = 1 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
