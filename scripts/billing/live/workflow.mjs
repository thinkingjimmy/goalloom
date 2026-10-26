/**
 * [INPUT]: Fixed CLI arguments, complete snapshots, reviewed source-bound plan and explicit phase window.
 * [OUTPUT]: Immutable private evidence, one-shot durable dispatch journal and independent catalog readback.
 * [POS]: Live configuration execution boundary; does not activate billing or configure notifications/tax.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { open, mkdir, readFile, realpath, lstat } from 'node:fs/promises'
import { resolve, dirname, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { connect, requireThat } from './adapters.mjs'
import { inspect } from './snapshot.mjs'
import { plan, resolveReferences } from './planner.mjs'
import { TARGET, NOTIFICATIONS, API_VERSION } from './policy.mjs'
export const ROOT = resolve('output/tests/billing/desktop/bill29-execution')
const files = ['policy.mjs','adapters.mjs','snapshot.mjs','planner.mjs','workflow.mjs','cli.mjs']
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const sources = async () => Object.fromEntries(await Promise.all(files.map(async name => [name, digest(await readFile(new URL(name, import.meta.url), 'utf8'))])))
async function boundary(path, existing = false) {
  const absolute = resolve(path)
  requireThat(absolute.startsWith(`${ROOT}/`) && absolute !== ROOT, 'evidence_path')
  await mkdir(ROOT, { recursive: true })
  const parent = existing ? absolute : dirname(absolute)
  requireThat((await realpath(parent)) === parent && (await realpath(ROOT)) === ROOT, 'evidence_symlink')
  if (existing) requireThat(!(await lstat(absolute)).isSymbolicLink(), 'evidence_symlink')
  return absolute
}
async function save(path, value) {
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync() } finally { await file.close() }
}
async function newDirectory(path) { const dir = await boundary(path); requireThat(dirname(dir) === ROOT && /^[a-z0-9][a-z0-9-]{0,100}$/.test(basename(dir)), 'evidence_directory'); await mkdir(dir, { mode: 0o700 }); return dir }
async function load(path) { const p = await boundary(path, true); requireThat((await lstat(p)).size <= 2 * 1024 * 1024, 'artifact_too_large'); return JSON.parse(await readFile(p, 'utf8')) }
function options(argv) {
  const [mode, ...flags] = argv
  requireThat(['inspect','inspect-rc','plan','apply','notifications'].includes(mode) && flags.length % 2 === 0, 'usage')
  const args = {}
  for (let i = 0; i < flags.length; i += 2) { const key = flags[i]; requireThat(['--out','--snapshot','--phase','--plan','--reviewed-set'].includes(key) && !Object.hasOwn(args,key), 'usage'); args[key] = flags[i+1] }
  const expected = { inspect: ['--out'], 'inspect-rc': ['--out'], plan: ['--out','--snapshot','--phase'], apply: ['--plan','--reviewed-set'], notifications: ['--out'] }[mode]
  requireThat(Object.keys(args).length === expected.length && expected.every(k => args[k] && !args[k].startsWith('--')), 'usage')
  return { mode, args }
}
export async function run(argv, ports = { connect }) {
  const { mode, args } = options(argv)
  if (mode === 'notifications') {
    const dir = await newDirectory(args['--out'])
    await save(`${dir}/notifications.json`, { target: TARGET, apiVersion: API_VERSION, definitions: NOTIFICATIONS,
      status: 'prepared_only', canDispatch: false, blockers: ['production receiver installation/readiness', 'private signing-secret capture and installation', 'actual signed delivery and inbox readback'],
      commands: NOTIFICATIONS.map(v => v.provider === 'stripe' ? { method: 'POST', path: '/v1/webhook_endpoints', body: { url: v.url, enabled_events: v.events, api_version: API_VERSION, description: v.name } }
        : { method: 'POST', path: `/v2/projects/${TARGET.project}/integrations/webhooks`, body: { name: v.name, url: v.url, environment: v.environment, app_id: v.app_id }, followUp: 'Enable HMAC signing; securely capture the one-time secret; verify signed production-filtered delivery.' }) })
    return { ok: true, preparedOnly: true, path: `${dir}/notifications.json` }
  }
  if (mode === 'inspect' || mode === 'inspect-rc') {
    const dir = await newDirectory(args['--out']), clients = await ports.connect()
    const snapshot = await inspect(clients, mode === 'inspect-rc')
    await save(`${dir}/snapshot.json`, { version: 1, observedAt: new Date().toISOString(), snapshot })
    return { ok: true, readOnly: true, path: `${dir}/snapshot.json` }
  }
  if (mode === 'plan') {
    const observed = await load(args['--snapshot'])
    requireThat(observed.version === 1 && typeof observed.observedAt === 'string', 'snapshot_version')
    const desired = plan(observed.snapshot, args['--phase'])
    const value = { version: 1, target: TARGET, phase: args['--phase'], sources: await sources(), baseline: observed.snapshot, desired }
    const envelope = { ...value, reviewedSet: digest(value) }, dir = await newDirectory(args['--out'])
    await save(`${dir}/plan.json`, envelope)
    return { ok: true, offline: true, mutations: desired.operations.length, reviewedSet: envelope.reviewedSet, path: `${dir}/plan.json` }
  }
  const reviewed = await load(args['--plan']), { reviewedSet, ...value } = reviewed
  requireThat(reviewedSet === digest(value) && reviewedSet === args['--reviewed-set'], 'review_hash')
  requireThat(value.version === 1 && isDeepStrictEqual(value.target, TARGET), 'plan_target')
  requireThat(isDeepStrictEqual(value.sources, await sources()), 'source_drift')
  requireThat(isDeepStrictEqual(value.desired, plan(value.baseline, value.phase)), 'plan_drift')
  requireThat(process.env.BILL29_LIVE_WRITE_WINDOW === value.phase, 'write_window')
  const clients = await ports.connect(), before = await inspect(clients, !!value.baseline.rc)
  requireThat(isDeepStrictEqual(before, value.baseline), 'baseline_drift')
  const journalPath = `${dirname(resolve(args['--plan']))}/dispatch.jsonl`, journal = await open(journalPath, 'wx', 0o600)
  const append = async v => { await journal.writeFile(JSON.stringify(v) + '\n'); await journal.sync() }
  const results = {}
  try {
    await append({ state: 'started', reviewedSet, phase: value.phase, at: new Date().toISOString() })
    for (const operation of value.desired.operations) {
      const body = resolveReferences(operation.body, results)
      const resource = typeof operation.resource === 'string' ? operation.resource
        : operation.resource.path + resolveReferences(operation.resource.ref, results) + operation.resource.suffix
      await append({ state: 'dispatched', step: operation.name, requestHash: digest({ resource, body }) })
      let result
      if (operation.provider === 'stripe') {
        const api = { products: clients.stripe.products, prices: clients.stripe.prices, portal: clients.stripe.billingPortal.configurations }[resource]
        requireThat(api, 'stripe_resource')
        result = await api.create(body, { idempotencyKey: `goalloom-live-${reviewedSet}-${operation.name}` })
        requireThat(result?.livemode === true && typeof result.id === 'string', 'stripe_write_readback')
      } else result = await clients.rc('POST', resource, body)
      if (result?.id) { requireThat(/^[A-Za-z0-9_]+$/.test(result.id), 'provider_result_id'); results[operation.name] = result.id }
      await append({ state: 'acknowledged', step: operation.name, id: results[operation.name] ?? null })
    }
    const after = await inspect(clients, !!value.baseline.rc), convergence = plan(after, value.phase)
    requireThat(convergence.operations.length === 0, 'readback_incomplete')
    // Every pre-existing RC mapping remains present with its original fields.
    for (const key of ['apps','products','entitlements','offerings','webhooks']) for (const prior of before.rc?.[key] ?? [])
      requireThat(after.rc[key].some(v => isDeepStrictEqual(v, prior)), 'existing_rc_record_changed')
    for (const key of ['entitlementProducts','packages','packageProducts']) for (const [id, records] of Object.entries(before.rc?.[key] ?? {}))
      for (const prior of records) requireThat(after.rc[key][id]?.some(v => isDeepStrictEqual(v, prior)), 'existing_rc_mapping_changed')
    await save(`${dirname(journalPath)}/readback.json`, { version: 1, observedAt: new Date().toISOString(), snapshot: after, bindings: convergence.bindings,
      providerDeliveryVerified: false, runtimeCredentialVerified: false, bill29Complete: false, launchReady: false })
    await append({ state: 'readback_verified', bindings: convergence.bindings })
    return { ok: true, catalogVerified: true, writes: value.desired.operations.length, path: `${dirname(journalPath)}/readback.json`, launchReady: false }
  } catch {
    await append({ state: 'unresolved', automaticReplay: false })
    throw new Error('apply_unresolved_readback_required')
  } finally { await journal.close() }
}
export async function main(argv = process.argv.slice(2), ports) {
  try { console.log(JSON.stringify(await run(argv, ports))) }
  catch (error) { console.log(JSON.stringify({ ok: false, code: error.code && /^[a-z_]+$/.test(error.code) ? error.code : 'live_tool_failed' })); process.exitCode = 1 }
}
