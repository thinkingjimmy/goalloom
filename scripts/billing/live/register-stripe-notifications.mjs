/**
 * [INPUT]: Exact reviewed notification proposal, existing Stripe CLI operator profile and explicit registration window.
 * [OUTPUT]: Original one-shot CLI entry and shared atomic custody/readback helpers for the separately reviewed SDK attempt.
 * [POS]: Registration custody boundary. Original consumed CLI evidence remains historical; no receiver activation or RC writes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { execFile } from 'node:child_process'
import { promisify, parseEnv, isDeepStrictEqual } from 'node:util'
import { readFile, mkdir, lstat, realpath, open, rename, unlink } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { requireThat } from './adapters.mjs'
import { TARGET, OWNER, API_VERSION, NOTIFICATIONS } from './policy.mjs'

const exec = promisify(execFile)
const HASH = 'cf1e1aa7dd001be9fad4f80a8eeec8214798976177c4a063b4c7536a44316110'
const ROOT = resolve('output/tests/billing/desktop/bill29-execution')
const PLAN = `${ROOT}/notifications-v3-approval-only/plan.json`
const RUN = `${ROOT}/notifications-stripe-registration-v1`
const PRIVATE = resolve('scripts/billing/live/private')
const SECRETS = `${PRIVATE}/.env.notifications.local`
const NAMES = ['BILLING_RC_STRIPE_WEBHOOK_SECRET', 'BILLING_STRIPE_WEBHOOK_SECRET']
const digest = value => createHash('sha256').update(value).digest('hex')
const sameEvents = (a, b) => Array.isArray(a) && isDeepStrictEqual([...a].sort(), [...b].sort())

export async function canonical(path) { requireThat(await realpath(path) === path, 'path_symlink') }
export async function syncDirectory(path) {
  const handle = await open(path, 'r')
  try { await handle.sync() } finally { await handle.close() }
}
export async function exclusiveJson(path, value) {
  const handle = await open(path, 'wx', 0o600)
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync() } finally { await handle.close() }
  await syncDirectory(dirname(path))
}
export async function privateState() {
  await canonical(dirname(PRIVATE))
  await mkdir(PRIVATE, { mode: 0o700, recursive: true })
  await canonical(PRIVATE)
  const dir = await lstat(PRIVATE)
  requireThat(dir.isDirectory() && (dir.mode & 0o777) === 0o700 && dir.uid === process.getuid(), 'private_directory')
  let before, values = {}, text = ''
  try { before = await lstat(SECRETS) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (before) {
    requireThat(before.isFile() && !before.isSymbolicLink() && (before.mode & 0o777) === 0o600 && before.uid === process.getuid() && before.size < 16384, 'private_file')
    text = await readFile(SECRETS, 'utf8'); values = parseEnv(text)
    requireThat(Object.keys(values).every(k => [...NAMES, 'BILLING_RC_WEBHOOK_SECRET'].includes(k)), 'private_file_fields')
  }
  return { before, values, text }
}
export async function saveSecret(name, value) {
  requireThat(NAMES.includes(name) && /^whsec_[A-Za-z0-9_]+$/.test(value ?? ''), 'signing_secret_missing')
  const { before, values, text: prior } = await privateState()
  requireThat(!values[name] || values[name] === value, 'private_secret_conflict')
  if (values[name] === value) return { priorBytesPreserved: true, rcValuePreserved: true }
  // Existing RC custody can use any valid dotenv representation. Append without reserializing it.
  const text = `${prior}${prior && !prior.endsWith('\n') ? '\n' : ''}${name}=${value}\n`
  const temporary = `${PRIVATE}/.notifications-${randomUUID()}.tmp`
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(text); await handle.sync(); await handle.close()
    let now
    try { now = await lstat(SECRETS) } catch (error) { if (error.code !== 'ENOENT') throw error }
    requireThat(before ? now?.ino === before.ino && now?.mtimeMs === before.mtimeMs : !now, 'private_concurrent_change')
    if (before) requireThat(await readFile(SECRETS, 'utf8') === prior, 'private_concurrent_change')
    await rename(temporary, SECRETS); await syncDirectory(PRIVATE)
    const after = await readFile(SECRETS, 'utf8'), parsed = parseEnv(after)
    requireThat(after.startsWith(prior) && parsed[name] === value && parsed.BILLING_RC_WEBHOOK_SECRET === values.BILLING_RC_WEBHOOK_SECRET, 'private_readback')
    return { priorBytesPreserved: true, rcValuePreserved: true }
  } finally {
    await handle.close().catch(() => {})
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}
async function stripe(method, path, body, key) {
  const args = [method.toLowerCase(), path, '--live', '--project-name', 'default', '--color', 'off', '--log-level', 'error', '--stripe-version', API_VERSION]
  if (method === 'POST') args.push('--confirm', '--idempotency', key)
  for (const [name, value] of Object.entries(body ?? {})) {
    if (Array.isArray(value)) for (const item of value) args.push('-d', `${name}[]=${item}`)
    else if (value && typeof value === 'object') for (const [sub, item] of Object.entries(value)) args.push('-d', `${name}[${sub}]=${item}`)
    else args.push('-d', `${name}=${value}`)
  }
  // Child output can include a one-time secret or provider error. Never forward it.
  try {
    const { stdout } = await exec('stripe', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024, env: process.env })
    const value = JSON.parse(stdout)
    requireThat(value && !value.error, 'stripe_cli_response')
    return value
  } catch { throw new Error('stripe_cli_request_unresolved') }
}
export function exactEndpoint(value, body) {
  return value.livemode === true && value.url === body.url && value.api_version === body.api_version &&
    value.description === body.description && sameEvents(value.enabled_events, body.enabled_events) && isDeepStrictEqual(value.metadata, OWNER)
}
export function redactEndpoint(value) {
  return Object.fromEntries(['id', 'livemode', 'url', 'api_version', 'description', 'enabled_events', 'metadata', 'status'].map(k => [k, value[k]]))
}
async function main() {
  const args = process.argv.slice(2)
  const checking = args.length === 1 && args[0] === '--check'
  requireThat(checking || (args.length === 2 && args[0] === '--reviewed-set' && args[1] === HASH), 'review_hash')
  const raw = await readFile(PLAN, 'utf8')
  requireThat(digest(raw) === HASH, 'proposal_changed')
  const plan = JSON.parse(raw)
  requireThat(isDeepStrictEqual(plan.target, TARGET) && plan.apiVersion === API_VERSION, 'proposal_target')
  const actions = plan.proposedActions.slice(0, 2)
  for (let i = 0; i < 2; i++) {
    const expected = { url: NOTIFICATIONS[i].url, enabled_events: NOTIFICATIONS[i].events, api_version: API_VERSION, description: NOTIFICATIONS[i].name, metadata: OWNER }
    requireThat(actions[i].create.method === 'POST' && actions[i].create.path === '/v1/webhook_endpoints' && isDeepStrictEqual(actions[i].create.body, expected), 'proposal_request')
  }
  if (checking) return { ok: true, localOnly: true, reviewedSet: HASH, operations: 2, privatePath: SECRETS }
  requireThat(process.env.BILL29_NOTIFICATION_WINDOW === 'registration', 'registration_window')
  requireThat(!Object.keys(process.env).some(k => /^STRIPE/i.test(k)), 'stripe_environment_override')
  await canonical(ROOT); await canonical(dirname(PLAN)); await canonical(PLAN)
  const privateBefore = await privateState()
  requireThat(NAMES.every(name => !privateBefore.values[name]), 'private_secrets_already_present')
  await mkdir(RUN, { mode: 0o700 }); await syncDirectory(ROOT)
  const journal = await open(`${RUN}/dispatch.jsonl`, 'wx', 0o600)
  await syncDirectory(RUN)
  const append = async record => { await journal.writeFile(`${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`); await journal.sync() }
  const readback = []
  try {
    await append({ state: 'started', reviewedSet: HASH, automaticReplay: false })
    const account = await stripe('GET', '/v1/account')
    requireThat(account.id === TARGET.account, 'stripe_account')
    const preflight = { account: account.id, counts: {} }
    for (const path of ['/v1/webhook_endpoints?limit=100', '/v1/subscriptions?status=all&limit=100', '/v1/invoices?limit=100', '/v1/subscription_schedules?limit=100']) {
      const list = await stripe('GET', path)
      requireThat(list.object === 'list' && list.has_more === false && Array.isArray(list.data), 'preflight_incomplete')
      preflight.counts[path] = list.data.length
      requireThat(list.data.length === 0, 'preflight_nonempty')
    }
    await exclusiveJson(`${RUN}/preflight.json`, preflight)
    for (let i = 0; i < actions.length; i++) {
      const { body, path } = actions[i].create
      const idempotency = `goalloom-notifications-${HASH}-${i + 1}`
      await append({ state: 'create_dispatched', step: i + 1, requestHash: digest(JSON.stringify(body)), idempotency })
      const created = await stripe('POST', path, body, idempotency)
      requireThat(/^we_[A-Za-z0-9]+$/.test(created.id ?? ''), 'create_id_unknown')
      // Once the new ID is known, no persistence or journal error can skip disabling it.
      let saved = false, captureError = false, disableAcknowledged = false, disableAttempted = false, observed
      try {
        requireThat(exactEndpoint(created, body), 'create_fields')
        await saveSecret(NAMES[i], created.secret); saved = true
        await append({ state: 'secret_saved', step: i + 1, id: created.id, privateName: NAMES[i] })
      } catch { captureError = true }
      finally {
        // A failed journal sync is recorded as unresolved, but must not leave delivery enabled.
        try { await append({ state: 'disable_dispatched', step: i + 1, id: created.id }) } catch { captureError = true }
        try {
          disableAttempted = true
          await stripe('POST', `${path}/${created.id}`, { disabled: true }, `${idempotency}-disable`)
          disableAcknowledged = true
        } catch {}
        try { observed = await stripe('GET', `${path}/${created.id}`) } catch {}
      }
      const verified = !!observed && exactEndpoint(observed, body) && observed.id === created.id && observed.status === 'disabled'
      readback.push({ step: i + 1, id: created.id, secretSaved: saved, captureError, disableAttempted, disableAcknowledged, disabledVerified: verified,
        endpoint: observed ? redactEndpoint(observed) : null })
      await exclusiveJson(`${RUN}/step-${i + 1}.json`, readback.at(-1))
      await append({ state: verified && saved && !captureError ? 'disabled_verified' : 'unresolved', step: i + 1, id: created.id, secretSaved: saved, disabledVerified: verified })
      requireThat(verified && saved && !captureError, 'registration_unresolved')
    }
    await exclusiveJson(`${RUN}/readback.json`, { ok: true, reviewedSet: HASH, endpoints: readback, privatePath: SECRETS, receiverInstalled: false, providerDeliveryVerified: false, launchReady: false })
    return { ok: true, endpointsDisabled: 2, privatePath: SECRETS, evidencePath: `${RUN}/readback.json`, providerDeliveryVerified: false }
  } catch (error) {
    await append({ state: 'unresolved', code: error.code && /^[a-z_]+$/.test(error.code) ? error.code : 'registration_unresolved', automaticReplay: false }).catch(() => {})
    throw error
  } finally { await journal.close() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await main())) }
  catch (error) { console.log(JSON.stringify({ ok: false, code: error.code && /^[a-z_]+$/.test(error.code) ? error.code : 'registration_unresolved', automaticReplay: false })); process.exitCode = 1 }
}
