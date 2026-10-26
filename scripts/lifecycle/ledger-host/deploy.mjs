/**
 * [INPUT]: Explicitly authorized short-lived account token, reviewed Worker bytes and private runtime state.
 * [OUTPUT]: Exactly two named independent ledger hosts plus secret-free deployed-source/protocol readback.
 * [POS]: Bounded BILL-29 installer. No DNS, purchases, production probe events or Supabase mutations.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { lstat, mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { canonicalJson } from '../../../packages/contracts/src/canonical.ts'
const account = 'bee5b363260a697e73678009c814b438'
const names = ['goalloom-deletion-ledger-acceptance', 'goalloom-deletion-ledger-production']
const args = process.argv.slice(2), options = {}
for (let i = 0; i < args.length; i += 2) {
  assert(['--credentials', '--directory', '--private-directory'].includes(args[i]) && args[i + 1] && !options[args[i]], 'deployment_arguments_invalid')
  options[args[i]] = resolve(args[i + 1])
}
assert(Object.keys(options).length === 3, 'deployment_arguments_missing')
const directory = options['--directory'], privateDirectory = options['--private-directory']
await mkdir(directory, { recursive: true, mode: 0o700 }); await mkdir(privateDirectory, { recursive: true, mode: 0o700 })
const secretInfo = await lstat(options['--credentials'])
assert(secretInfo.isFile() && !secretInfo.isSymbolicLink() && (secretInfo.mode & 0o077) === 0, 'deployment_private_credential_required')
const credentials = parseEnv(await readFile(options['--credentials'], 'utf8'))
assert(credentials.CLOUDFLARE_ACCOUNT_ID === account && credentials.CLOUDFLARE_API_TOKEN, 'deployment_account_mismatch')
const token = credentials.CLOUDFLARE_API_TOKEN
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const workerPath = resolve('output/tests/billing/desktop/bill29-execution/ledger-build/worker.js')
const bytes = await readFile(workerPath), sourceHash = hash(bytes)
const sourceFiles = ['scripts/lifecycle/ledger-host/worker.ts', 'scripts/lifecycle/ledger-host/wrangler.jsonc', 'scripts/lifecycle/ledger-host/deploy.mjs']
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, hash(await readFile(path))])))
const statePath = `${privateDirectory}/deployment.json`
let state
try {
  const info = await lstat(statePath)
  assert(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, 'deployment_private_state_required')
  state = JSON.parse(await readFile(statePath, 'utf8'))
  assert(state.account === account && state.sourceHash === sourceHash, 'deployment_original_source_changed')
  state.continuations ??= []; state.continuations.push({ at: new Date().toISOString(), sourceHashes })
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  state = { version: 1, account, sourceHash, sourceHashes, workers: Object.fromEntries(names.map(name => [name, { storeId: randomUUID(), runtimeToken: randomBytes(32).toString('hex'), attempted: false }])), startedAt: new Date().toISOString() }
  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
}
const save = async () => { const path = `${statePath}.tmp`; await writeFile(path, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); await rename(path, statePath) }
const calls = []
async function api(path, raw = false) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
    headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000),
  })
  calls.push({ method: 'GET', path, status: response.status })
  assert(response.ok, `cloudflare_read_status_${response.status}`)
  if (raw) return response
  const value = await response.json(); assert(value.success === true, 'cloudflare_read_refused'); return value.result
}
async function deploy(name, step) {
  assert(names.includes(name) && !state.workers[name][step], 'deployment_already_dispatched')
  const worker = state.workers[name], secretsPath = `${privateDirectory}/${name}.secrets.json`
  await writeFile(secretsPath, JSON.stringify({ LEDGER_TOKEN: worker.runtimeToken }), { mode: 0o600 })
  worker[step] = true; await save()
  const result = await new Promise((resolve, reject) => {
    const child = spawn('/private/tmp/goalloom-ledger-runtime/node_modules/.bin/wrangler', ['deploy', workerPath, '--no-bundle', '--config', 'scripts/lifecycle/ledger-host/wrangler.jsonc',
      '--name', name, '--var', `STORE_ID:${worker.storeId}`, '--secrets-file', secretsPath, '--upload-source-maps=false', '--strict', '--autoconfig=false'], {
      env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, WRANGLER_SEND_METRICS: 'false',
        XDG_CONFIG_HOME: '/private/tmp/goalloom-ledger-runtime/config', WRANGLER_LOG_PATH: `${privateDirectory}/wrangler.log` },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = '', length = 0
    const capture = chunk => { length += chunk.length; if (length > 1024 * 1024) child.kill(); else output += chunk.toString() }
    child.stdout.on('data', capture); child.stderr.on('data', capture)
    const timeout = setTimeout(() => child.kill(), 120000)
    child.on('error', () => reject(Error('wrangler_start_failed')))
    child.on('close', code => { clearTimeout(timeout); resolve({ code, output }) })
  })
  worker[`${step}Exit`] = result.code; await save()
  if (result.code !== 0) {
    const codes = [...new Set([...result.output.matchAll(/\[code:\s*(\d+)\]/g)].map(match => Number(match[1])))]
    worker.providerErrorCodes = codes; await save(); throw Error(`wrangler_failed_${result.code ?? 'unknown'}`)
  }
}
async function readback(name) {
  const worker = state.workers[name], settings = await api(`/workers/scripts/${name}/settings`)
  const bindings = settings.bindings ?? []
  assert(bindings.find(row => row.name === 'ENVIRONMENT')?.text === 'production', 'deployed_environment_mismatch')
  assert(bindings.find(row => row.name === 'STORE_ID')?.text === worker.storeId, 'deployed_store_mismatch')
  assert(bindings.find(row => row.name === 'LEDGER_TOKEN')?.type === 'secret_text', 'deployed_secret_missing')
  const binding = bindings.find(row => row.name === 'LEDGER')
  assert(binding?.type === 'durable_object_namespace' && binding.class_name === 'DeletionLedgerObject', 'deployed_namespace_missing')
  const response = await api(`/workers/scripts/${name}`, true)
  let deployed
  if (response.headers.get('content-type')?.includes('multipart/form-data')) {
    const form = await response.formData(), candidates = [...form.entries()]
    assert(candidates.length === 1 && candidates[0][0] === 'worker.js', 'deployed_module_set_changed')
    const module = candidates[0][1]
    deployed = typeof module === 'string' ? Buffer.from(module) : Buffer.from(await module.arrayBuffer())
  } else deployed = Buffer.from(await response.arrayBuffer())
  assert(hash(deployed) === sourceHash, 'deployed_source_mismatch')
  const subdomain = await api('/workers/subdomain')
  assert(typeof subdomain.subdomain === 'string' && /^[a-z0-9-]+$/.test(subdomain.subdomain), 'deployed_subdomain_invalid')
  worker.url = `https://${name}.${subdomain.subdomain}.workers.dev`; await save()
  return { name, storeId: worker.storeId, namespaceId: binding.namespace_id, sourceHash, bindings: bindings.map(({ name, type }) => ({ name, type })), url: worker.url }
}
async function ledgerCall(name, action, value, authorized = true) {
  const worker = state.workers[name]
  const response = await fetch(`${worker.url}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json',
    ...(authorized ? { authorization: `Bearer ${worker.runtimeToken}` } : {}) }, body: JSON.stringify({ version: 1, ...value }),
    redirect: 'error', signal: AbortSignal.timeout(15000) })
  calls.push({ method: 'POST', worker: name, action, status: response.status })
  const data = await response.json()
  return { status: response.status, data }
}
let report
try {
  // Refuse to replace any pre-existing service. Unknown outcomes require independent readback, never rerunning this installer.
  const existing = await api('/workers/scripts')
  assert(Array.isArray(existing) && names.every(name => state.workers[name].attempted || !existing.some(row => row.id === name)), 'ledger_service_already_exists')
  for (const name of names) {
    if (!state.workers[name].attempted) await deploy(name, 'attempted')
    state.workers[name].readback = await readback(name); await save()
  }
  const acceptance = names[0], production = names[1]
  const head = await ledgerCall(production, 'head', {})
  assert(head.status === 200 && head.data.storeId === state.workers[production].storeId && head.data.cursor === '0', 'production_head_mismatch')
  assert.equal((await ledgerCall(production, 'head', {}, false)).status, 401)
  const record = { version: 1, eventId: randomUUID(), environment: 'production', projectRef: 'keqprrgvcefqdwnxaafv', subjectId: randomUUID(), ownerTag: randomBytes(32).toString('hex'), requestId: null,
    target: { workspaceId: randomUUID(), generation: randomUUID() }, lifecycleVersion: 1, reason: 'ordinary_expiry', kind: 'intent',
    closedAt: '2026-10-25T00:00:00.000000Z', retrieveUntil: '2026-11-24T00:00:00.000000Z', onlineDeleteBy: '2026-12-01T00:00:00.000000Z', onlineDeletedAt: null,
    scheduledAccessEnd: '2026-10-25T00:00:00.000000Z', accessEndedAt: '2026-10-25T00:00:00.000000Z', deletionReceipt: null }
  state.acceptanceEvent ??= { eventId: record.eventId, digest: hash(canonicalJson(record)), record }; await save()
  const event = state.acceptanceEvent
  const replies = await Promise.all(Array.from({ length: 6 }, () => ledgerCall(acceptance, 'append', { event })))
  assert(replies.every(reply => reply.status === 200 && reply.data.cursor === '1' && reply.data.digest === event.digest), 'acceptance_idempotency_failed')
  const conflict = structuredClone(event); conflict.record.lifecycleVersion = 2; conflict.digest = hash(canonicalJson(conflict.record))
  assert.equal((await ledgerCall(acceptance, 'append', { event: conflict })).status, 409)
  const page = await ledgerCall(acceptance, 'read', { after: null, through: '1', limit: 100 })
  assert(page.status === 200 && page.data.done === true && page.data.entries.length === 1 && page.data.entries[0].digest === event.digest, 'acceptance_prefix_failed')
  if (!state.workers[acceptance].restartDeployAttempted) await deploy(acceptance, 'restartDeployAttempted')
  state.workers[acceptance].readback = await readback(acceptance); await save()
  const original = await ledgerCall(acceptance, 'get', { eventId: event.eventId })
  assert(original.status === 200 && original.data.entry.cursor === '1' && original.data.entry.digest === event.digest, 'acceptance_redeploy_persistence_failed')
  const finalProduction = await ledgerCall(production, 'head', {})
  assert.deepEqual(finalProduction, head, 'production_ledger_changed_during_acceptance')
  const runtimePath = `${privateDirectory}/supabase-ledger.env`
  await writeFile(runtimePath, `DELETION_LEDGER_URL=${state.workers[production].url}\nDELETION_LEDGER_TOKEN=${state.workers[production].runtimeToken}\nDELETION_LEDGER_STORE_ID=${state.workers[production].storeId}\n`, { mode: 0o600 })
  report = { ok: true, account, sourceHash, sourceHashes, workers: names.map(name => state.workers[name].readback),
    acceptance: { concurrentDuplicateAppends: 6, cursor: '1', conflictingIdentityRefused: true, prefixVerified: true, redeployPersistenceVerified: true },
    production: { ...head.data, syntheticAppends: 0, unauthorizedRefused: true }, runtimeCredentialPath: runtimePath, calls,
    supabaseMutations: 0, purchases: 0, dnsMutations: 0, flagsOpened: 0 }
} catch (error) {
  report = { ok: false, error: /^[a-z0-9_]+$/.test(error.message) ? error.message : 'deployment_failed',
    diagnostic: { name: ['Error', 'AssertionError', 'TimeoutError', 'TypeError', 'AbortError', 'SyntaxError'].includes(error.name) ? error.name : 'unknown',
      causeCode: /^[A-Z_0-9]+$/.test(error.cause?.code ?? '') ? error.cause.code : null }, calls,
    attemptedWorkers: names.filter(name => state.workers[name].attempted), sourceHash, privateStatePath: statePath,
    note: 'Do not redispatch. Resolve original deployment outcomes by readback before a new reviewed action.' }
  process.exitCode = 1
} finally {
  await save()
  await writeFile(`${directory}/deployment-${randomUUID()}.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  await writeFile(`${directory}/deployment-result.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ ok: report.ok, error: report.error, report: `${directory}/deployment-result.json` }))
}
