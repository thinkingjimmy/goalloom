/**
 * [INPUT]: Real complete synthetic source schema, isolated Docker VM and the separate hosted acceptance ledger.
 * [OUTPUT]: Actual pg_dump/CLI restore/replay, original receipt/fingerprint and live isolation refusal evidence.
 * [POS]: Focused recovery E2E. No production ledger append, hosted restore or exposure-ready export.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { canonicalJson } from '../../../packages/contracts/src/canonical.ts'
import { assertIsolated } from './isolation.mjs'
const sourcePath = process.argv[2]
assert(sourcePath && process.argv.length === 3, 'recovery_acceptance_source_required')
const source = JSON.parse(await readFile(sourcePath, 'utf8'))
const directory = resolve('output/tests/billing/desktop/bill29-execution/recovery', `roundtrip-${randomUUID()}`)
await mkdir(directory, { recursive: true, mode: 0o700 })
const environment = { ...process.env, DOCKER_CONFIG: '/private/tmp/goalloom-bill29-docker' }
delete environment.DOCKER_HOST; delete environment.DOCKER_CONTEXT
const digest = value => createHash('sha256').update(value).digest('hex')
const sources = ['scripts/lifecycle/recovery/acceptance.mjs', 'scripts/lifecycle/recovery/driver.mjs', 'scripts/lifecycle/recovery/isolation.mjs',
  'scripts/lifecycle/recovery/Dockerfile', 'scripts/lifecycle/recovery/postgres.sh', 'supabase/functions/lifecycle/restore.ts', 'supabase/functions/lifecycle/ledger.ts']
const hashes = async () => Object.fromEntries(await Promise.all(sources.map(async path => [path, digest(await readFile(path))])))
const before = await hashes()
await writeFile(`${directory}/inputs-before.json`, JSON.stringify(before, null, 2))
const docker = (args, input) => {
  const result = spawnSync('docker', ['--host', source.dockerHost, ...args], { input, env: environment, encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024 })
  assert.equal(result.status, 0, 'recovery_acceptance_docker_failed'); return result.stdout
}
const inspect = identity => assertIsolated(JSON.parse(docker(['inspect', identity.containerId]))[0], identity)
const sql = (identity, text) => {
  inspect(identity)
  const output = docker(['exec', '-i', identity.containerId, 'psql', '-X', '-qAt', '--set', 'ON_ERROR_STOP=1', '-h', '/var/run/postgresql', '-U', 'postgres', '-d', 'postgres'], text).trim()
  inspect(identity); return output
}
const cli = args => {
  const result = spawnSync(process.execPath, ['scripts/lifecycle/recovery/driver.mjs', ...args], { env: environment, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 })
  const lines = `${result.stdout}\n${result.stderr}`.split('\n').filter(line => line.startsWith('{'))
  return { status: result.status, result: lines.length ? JSON.parse(lines.at(-1)) : null }
}
const cases = []
const check = async (name, run) => { await run(); cases.push({ name, ok: true }) }
let target, report
const fixture = { owner: randomUUID(), subject: randomUUID(), workspace: randomUUID(), generation: randomUUID(), session: randomUUID(), request: randomUUID() }
try {
  inspect(source)
  const catalog = JSON.parse(sql(source, `SELECT json_build_object('auth',(SELECT count(*) FROM pg_tables WHERE schemaname='auth'),
    'storage',(SELECT count(*) FROM pg_tables WHERE schemaname='storage'),'app',(SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','service_private')),
    'preloads',current_setting('shared_preload_libraries'));`))
  assert(catalog.auth >= 27 && catalog.storage >= 10 && catalog.app >= 55 && catalog.preloads === '', 'real_vendor_application_schema_required')
  const q = value => `'${String(value).replaceAll("'", "''")}'`
  sql(source, `BEGIN;
    INSERT INTO auth.users(id,email) VALUES(${q(fixture.owner)},${q(`recovery-${fixture.owner}@goalloom.test`)});
    INSERT INTO auth.sessions(id,user_id) VALUES(${q(fixture.session)},${q(fixture.owner)});
    INSERT INTO service_private.account_lifecycle(environment,subject_id,user_id,owner_tag,provider_user_id)
      VALUES('production',${q(fixture.subject)},${q(fixture.owner)},service_private.owner_tag(${q(fixture.owner)}),${q(fixture.owner)});
    INSERT INTO public.billing_policy(environment) VALUES('production') ON CONFLICT DO NOTHING;
    INSERT INTO public.billing_accounts(environment,subject_id,trial_request,trial_started_at,trial_ends_at)
      VALUES('production',${q(fixture.subject)},${q(randomUUID())},'2026-10-10T00:00:00Z','2026-10-18T00:00:00Z');
    INSERT INTO public.workspaces(id,user_id,generation) VALUES(${q(fixture.workspace)},${q(fixture.owner)},${q(fixture.generation)});
    INSERT INTO service_private.workspace_lifecycle(environment,subject_id,workspace_id,generation)
      VALUES('production',${q(fixture.subject)},${q(fixture.workspace)},${q(fixture.generation)});
    COMMIT;`)
  const identity = JSON.parse(sql(source, `SELECT json_build_object('keyDigest',(SELECT encode(public._sha256(key),'hex') FROM service_private.lifecycle_keys WHERE id=1),
    'ownerTag',encode(service_private.owner_tag(${q(fixture.owner)}),'hex'));`))
  const roles = docker(['exec', source.containerId, 'pg_dumpall', '-h', '/var/run/postgresql', '-U', 'postgres', '--roles-only', '--no-role-passwords'])
    .replace(/^CREATE ROLE postgres;\s*$/m, '')
  const dump = docker(['exec', source.containerId, 'pg_dump', '-h', '/var/run/postgresql', '-U', 'postgres', '-d', 'postgres', '--no-owner', '--no-acl',
    '--exclude-schema=cron', '--exclude-schema=net', '--exclude-table-data=vault.secrets'])
  const dumpPath = `${directory}/offline-application.sql`
  await writeFile(dumpPath, `${roles}\n${dump}`, { mode: 0o600 })
  const targetDirectory = `${directory}/target`
  await check('actual complete vendor/application dump loads through the isolated CLI', async () => {
    const initialized = cli(['init', '--directory', targetDirectory, '--image', source.image]); assert.equal(initialized.status, 0)
    target = JSON.parse(await readFile(`${targetDirectory}/journal.json`, 'utf8'))
    const loaded = cli(['load', '--directory', targetDirectory, '--dump', dumpPath])
    await writeFile(`${directory}/load-observation.json`, JSON.stringify(loaded, null, 2))
    assert.equal(loaded.status, 0, 'real_dump_load_failed')
    assert.equal(sql(target, `SELECT count(*) FROM auth.sessions WHERE id=${q(fixture.session)};`), '1')
    assert.equal(sql(target, 'SHOW shared_preload_libraries;'), '')
  })
  const state = JSON.parse(await readFile('/private/tmp/goalloom-ledger-production-runtime/deployment.json', 'utf8'))
  const ledger = state.workers['goalloom-deletion-ledger-acceptance']
  assert(ledger.url === 'https://goalloom-deletion-ledger-acceptance.thinkingjimmy.workers.dev' && ledger.storeId !== state.workers['goalloom-deletion-ledger-production'].storeId, 'acceptance_ledger_only')
  const ledgerCall = async (action, request) => {
    const response = await fetch(`${ledger.url}/${action}`, { method: 'POST', headers: { authorization: `Bearer ${ledger.runtimeToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ version: 1, ...request }), redirect: 'error', signal: AbortSignal.timeout(15000) })
    assert.equal(response.status, 200, 'acceptance_ledger_refused'); return response.json()
  }
  const prepared = '2026-10-24T00:00:00.000000Z', confirmed = '2026-10-24T01:00:00.000000Z'
  const metadata = { scope: 'account', receiptDigest: randomBytes(32).toString('hex'), expectedRevision: 0, preparedAt: prepared, confirmedAt: confirmed }
  const record = { version: 1, eventId: randomUUID(), environment: 'production', projectRef: 'keqprrgvcefqdwnxaafv', subjectId: fixture.subject, ownerTag: identity.ownerTag,
    requestId: fixture.request, target: null, lifecycleVersion: 3, reason: 'account_delete', kind: 'account_deleted', closedAt: confirmed,
    retrieveUntil: null, onlineDeleteBy: '2026-10-31T01:00:00.000000Z', onlineDeletedAt: '2026-10-24T02:00:00.000000Z',
    scheduledAccessEnd: null, accessEndedAt: null, deletionReceipt: metadata }
  const workspaceRecord = { ...record, eventId: randomUUID(), target: { workspaceId: fixture.workspace, generation: fixture.generation }, lifecycleVersion: 5, kind: 'online_deleted' }
  const events = [record, workspaceRecord].map(record => ({ eventId: record.eventId, digest: digest(canonicalJson(record)), record }))
  await writeFile(`${directory}/acceptance-events.json`, JSON.stringify(events, null, 2), { mode: 0o600 })
  for (const event of events) await ledgerCall('append', { event })
  const head = await ledgerCall('head', {})
  const credentialsPath = `${directory}/acceptance-ledger.env`
  await writeFile(credentialsPath, `DELETION_LEDGER_URL=${ledger.url}\nDELETION_LEDGER_TOKEN=${ledger.runtimeToken}\nDELETION_LEDGER_STORE_ID=${ledger.storeId}\n`, { mode: 0o600 })
  const replayArgs = ['replay', '--directory', targetDirectory, '--credentials', credentialsPath, '--key-digest', identity.keyDigest]
  await check('original key fingerprint mismatch refuses replay before a run is created', async () => {
    const wrong = cli([...replayArgs.slice(0, -1), '0'.repeat(64)])
    assert.equal(wrong.status, 1); assert.equal(wrong.result.error, 'recovery_original_key_mismatch')
    assert.equal(sql(target, 'SELECT count(*) FROM service_private.restore_runs;'), '0')
  })
  let replay, original
  await check('actual hosted-ledger replay reconstructs original receipts and closes restored sessions', async () => {
    replay = cli(replayArgs); assert.equal(replay.status, 0)
    assert.equal(replay.result.replay.phase, 'replayed'); assert.equal(replay.result.replay.through, head.cursor)
    assert.equal(replay.result.replay.ledgerAdvanced, false); assert.equal(replay.result.exposureAllowed, false)
    original = JSON.parse(sql(target, `SELECT json_build_object('preparedAt',service_private.format_utc(prepared_at),'confirmedAt',service_private.format_utc(confirmed_at),
      'onlineDeleteBy',service_private.format_utc(online_delete_by),'statusExpiresAt',service_private.format_utc(status_expires_at),'receiptDigest',encode(receipt_digest,'hex'))
      FROM service_private.deletion_requests WHERE request_id=${q(fixture.request)};`))
    assert.equal(original.preparedAt, prepared); assert.equal(original.confirmedAt, confirmed)
    assert.equal(original.onlineDeleteBy, '2026-10-31T01:00:00.000000Z'); assert.equal(original.statusExpiresAt, '2026-11-23T01:00:00.000000Z')
    assert.equal(original.receiptDigest, metadata.receiptDigest)
    assert.equal(sql(target, `SELECT count(*) FROM auth.sessions WHERE id=${q(fixture.session)};`), '0')
    assert.equal(sql(target, `SELECT state FROM service_private.account_lifecycle WHERE subject_id=${q(fixture.subject)};`), 'deleting')
    assert.equal(sql(target, `SELECT state FROM service_private.workspace_lifecycle WHERE workspace_id=${q(fixture.workspace)};`), 'queued')
    assert.equal(sql(target, "SELECT count(*) FROM service_private.lifecycle_policy WHERE restore_blocked AND NOT enabled AND NOT restore_admission_ready AND NOT independent_ledger_ready AND NOT cleanup_wiring_ready;"), '1')
  })
  await check('repeated CLI replay retains the same run and original receipt deadlines', async () => {
    const repeated = cli(replayArgs); assert.equal(repeated.status, 0)
    assert.equal(repeated.result.replay.runId, replay.result.replay.runId)
    const deadline = sql(target, `SELECT service_private.format_utc(status_expires_at) FROM service_private.deletion_requests WHERE request_id=${q(fixture.request)};`)
    assert.equal(deadline, original.statusExpiresAt)
  })
  await check('Docker refuses network attachment; CLI rejects an actual incorrectly networked empty target', async () => {
    const attachment = spawnSync('docker', ['--host', source.dockerHost, 'network', 'connect', 'bridge', target.containerId], { env: environment, encoding: 'utf8' })
    assert.notEqual(attachment.status, 0, 'Docker must retain private network-none mode')
    inspect(target)
    const badId = randomUUID(), badDirectory = `${directory}/bad-network-target`
    await mkdir(badDirectory, { mode: 0o700 })
    const badContainer = docker(['create', '--network', 'bridge', '--read-only', '--user', 'postgres', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
      '--pids-limit', '128', '--memory', '1g', '--label', `com.goalloom.recovery=${badId}`,
      '--tmpfs', '/recovery:rw,nosuid,nodev,noexec,size=805306368,mode=1777', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=67108864,mode=1777',
      '--tmpfs', '/var/run/postgresql:rw,nosuid,nodev,noexec,size=67108864,mode=1777', source.image]).trim()
    try {
      docker(['start', badContainer])
      const actual = JSON.parse(docker(['inspect', badContainer]))[0]
      await writeFile(`${badDirectory}/journal.json`, JSON.stringify({ ...target, id: badId, containerId: badContainer, startedAt: actual.State.StartedAt, loaded: false, replay: undefined }), { mode: 0o600 })
      const rejected = cli(['status', '--directory', badDirectory]); assert.equal(rejected.status, 1)
      assert.equal(rejected.result.error, 'recovery_isolation_missing')
    } finally {
      const actual = JSON.parse(docker(['inspect', badContainer]))[0]
      assert.equal(actual.Config.Labels['com.goalloom.recovery'], badId)
      docker(['rm', '-f', badContainer])
    }
  })
  await check('unsupported hosted restore/export/cutover commands have no dispatch path', async () => {
    for (const command of ['export', 'reopen', 'cutover', 'restore-production']) {
      const value = cli([command, '--directory', targetDirectory]); assert.equal(value.status, 1)
      assert.equal(value.result.error, 'unsupported_recovery_operation')
    }
    const output = docker(['exec', target.containerId, 'sh', '-c', 'cat /proc/net/route; cat /proc/net/if_inet6'])
    assert(!output.includes('eth0'))
    assert.equal(sql(target, 'SHOW listen_addresses;'), '')
  })
  assert.deepEqual(await hashes(), before, 'Recovery source changed during E2E')
  report = { ok: true, cases, sourceHashes: before, sourceContainer: source.containerId, targetContainer: target.containerId, image: source.image,
    catalog, dump: { sha256: digest(await readFile(dumpPath)), bytes: (await readFile(dumpPath)).length }, head, replay: replay.result.replay,
    originalReceiptDeadlines: { preparedAt: original.preparedAt, confirmedAt: original.confirmedAt, onlineDeleteBy: original.onlineDeleteBy, statusExpiresAt: original.statusExpiresAt },
    exposureAllowed: false, productionLedgerAppends: 0, scope: 'Actual isolated Docker/PostgreSQL dump load and hosted acceptance-ledger replay; no physical purge, Auth-user deletion, provider settlement or hosted cutover claim',
    platform: { node: process.version, os: process.platform, cpu: process.arch, databaseScope: 'Linux aarch64 VZ VM on macOS; PostgreSQL17.6; Electron not used; physical host type not independently established' } }
} catch (error) {
  report = { ok: false, cases, error: /^[a-z_]+$/.test(error.message) ? error.message : 'recovery_acceptance_failed',
    exposureAllowed: false, sourceContainer: source.containerId, targetContainer: target?.containerId ?? null }; process.exitCode = 1
} finally {
  await writeFile(`${directory}/result.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ ok: report.ok, passed: cases.length, report: `${directory}/result.json` }))
}
