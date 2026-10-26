/**
 * [INPUT]: Explicit local image/dump, original lifecycle-key fingerprint and independent live ledger.
 * [OUTPUT]: Isolated, resumable local replay evidence; admission stays closed permanently.
 * [POS]: The only supported recovery operation. No hosted target, export, reopen or cutover command.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { chmod, lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { randomUUID, createHash } from 'node:crypto'
import { build } from 'esbuild'
import { assertIsolated, assertRecoveryCommand, recoveryLabel, temporaryPaths } from './isolation.mjs'

const [command, ...args] = process.argv.slice(2)
let directory, journal, host
const parsed = {}
const allowed = { init: ['directory', 'image'], load: ['directory', 'dump'], replay: ['directory', 'credentials', 'key-digest'], status: ['directory'] }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function privateFile(path) {
  const info = await lstat(path)
  assert(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, 'recovery_private_file_required')
  return readFile(path)
}
async function save() {
  const path = `${directory}/journal.json`, temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  await rename(temporary, path)
}
const environment = { ...process.env }
delete environment.DOCKER_HOST; delete environment.DOCKER_CONTEXT
function execute(args, { input, file, maximum = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn('docker', args, { env: environment, stdio: ['pipe', 'pipe', 'pipe'] })
    const deadline = setTimeout(() => process.kill(), 60000)
    const output = []; let length = 0
    // Docker/psql errors may contain backup values. Never retain raw stderr or echo it to chat.
    process.stderr.resume()
    process.stdout.on('data', bytes => { length += bytes.length; if (length > maximum) process.kill(); else output.push(bytes) })
    process.on('error', () => reject(Error('recovery_docker_unavailable')))
    process.on('close', code => { clearTimeout(deadline); code === 0 && length <= maximum ? resolve(Buffer.concat(output).toString('utf8')) : reject(Error('recovery_command_failed')) })
    process.stdin.on('error', () => undefined)
    if (file) { const stream = createReadStream(file); stream.on('error', () => { process.kill(); reject(Error('recovery_dump_read_failed')) }); stream.pipe(process.stdin) }
    else process.stdin.end(input ?? '')
  })
}
const docker = (args, options) => execute(['--host', host, ...args], options)
async function inspect() {
  const rows = JSON.parse(await docker(['inspect', journal.containerId]))
  assert(rows.length === 1, 'recovery_container_missing')
  return rows[0]
}
const quarantine = { assertClosed: async () => assertIsolated(await inspect(), journal) }
async function sql(statement) {
  await quarantine.assertClosed()
  const output = await docker(['exec', '-i', journal.containerId, 'psql', '-X', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '-qAt', '--host', '/var/run/postgresql', '--username', 'postgres', '--dbname', 'postgres'], { input: statement })
  await quarantine.assertClosed()
  return output.trim()
}
const quote = value => `'${String(value).replaceAll("'", "''")}'`
const rpcArguments = {
  lifecycle_restore_begin: ['p_environment', 'p_store', 'p_through', 'p_key_digest'], lifecycle_restore_status: ['p_run'],
  lifecycle_restore_capture: ['p_run', 'p_store', 'p_after', 'p_entries'], lifecycle_restore_project: ['p_run'],
}
async function rpc(name, values) {
  const keys = rpcArguments[name]
  assert(keys && Object.keys(values).sort().join('|') === [...keys].sort().join('|'), 'recovery_rpc_refused')
  const argumentsSql = keys.map(key => key === 'p_entries' ? `${quote(JSON.stringify(values[key]))}::jsonb` : quote(values[key]))
  const output = await sql(`SELECT public.${name}(${argumentsSql.join(',')});`)
  return JSON.parse(output)
}
try {
  assertRecoveryCommand(command)
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '')
    assert(args[i]?.startsWith('--') && allowed[command].includes(key) && args[i + 1] && !Object.hasOwn(parsed, key), 'recovery_arguments_invalid')
    parsed[key] = args[i + 1]
  }
  assert(allowed[command].every(key => parsed[key]), 'recovery_arguments_missing')
  directory = resolve(parsed.directory)
  await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700)
  const contexts = JSON.parse(await execute(['context', 'inspect']))
  assert(contexts.length === 1, 'recovery_docker_context_invalid')
  host = contexts[0]?.Endpoints?.docker?.Host
  assert(typeof host === 'string' && /^unix:\/\/\/[\w/._-]+$/.test(host), 'recovery_local_docker_required')
  if (command === 'init') {
    await docker(['info', '--format', '{{.ServerVersion}}'])
    assert(/^sha256:[a-f0-9]{64}$/.test(parsed.image), 'recovery_pinned_image_required')
    const [image] = JSON.parse(await docker(['image', 'inspect', parsed.image]))
    assert(image.Id === parsed.image && image.Config?.Labels?.['com.goalloom.recovery-image'] === '1'
      && image.Config.User === 'postgres' && !Object.keys(image.Config.Volumes ?? {}).length
      && !Object.keys(image.Config.ExposedPorts ?? {}).length, 'recovery_image_contract_invalid')
    journal = { version: 1, id: randomUUID(), projectRef: 'keqprrgvcefqdwnxaafv', image: image.Id, dockerHost: host, exposureAllowed: false, createdAt: new Date().toISOString() }
    await writeFile(`${directory}/journal.json`, JSON.stringify(journal, null, 2), { mode: 0o600, flag: 'wx' })
    journal.createAttempted = true; await save()
    const tmpfs = temporaryPaths.flatMap(path => ['--tmpfs', `${path}:rw,nosuid,nodev,noexec,size=${path === '/recovery' ? 805306368 : 67108864},mode=1777`])
    journal.containerId = (await docker(['create', '--network', 'none', '--read-only', '--user', 'postgres', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
      '--pids-limit', '128', '--memory', '1g', '--cpus', '2', '--label', `${recoveryLabel}=${journal.id}`, ...tmpfs, image.Id])).trim()
    assert(/^[a-f0-9]{64}$/.test(journal.containerId), 'recovery_create_outcome_unknown'); await save()
    journal.startAttempted = true; await save()
    await docker(['start', journal.containerId])
    journal.startedAt = (await inspect()).State.StartedAt; await quarantine.assertClosed(); await save()
    const readyBy = Date.now() + 15000
    for (;;) {
      await quarantine.assertClosed()
      try { await docker(['exec', journal.containerId, 'pg_isready', '-q', '-h', '/var/run/postgresql', '-U', 'postgres']); break }
      catch { assert(Date.now() < readyBy, 'recovery_postgres_not_ready'); await new Promise(resolve => setTimeout(resolve, 100)) }
    }
  } else {
    journal = JSON.parse(await privateFile(`${directory}/journal.json`))
    assert(journal.version === 1 && journal.projectRef === 'keqprrgvcefqdwnxaafv' && journal.dockerHost === host && journal.exposureAllowed === false, 'recovery_journal_invalid')
    await quarantine.assertClosed()
    if (command === 'load') {
      assert(!journal.loadAttempted, 'recovery_load_already_dispatched')
      const dump = resolve(parsed.dump), bytes = await privateFile(dump)
      assert(bytes.length > 0 && !bytes.subarray(0, 5).equals(Buffer.from('PGDMP')), 'recovery_plain_sql_dump_required')
      journal.dumpSha256 = hash(bytes); journal.loadAttempted = true; await save()
      await quarantine.assertClosed()
      await docker(['exec', '-i', journal.containerId, 'psql', '-X', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '-q', '--host', '/var/run/postgresql', '--username', 'postgres', '--dbname', 'postgres'], { input: bytes })
      await quarantine.assertClosed()
      // These changes apply only inside the network-none container. Never restore into the hosted project.
      await sql(`BEGIN;
        DO $$BEGIN IF (SELECT project_ref FROM service_private.policy WHERE id=1) IS DISTINCT FROM 'keqprrgvcefqdwnxaafv'
          OR (SELECT environment FROM service_private.policy WHERE id=1) IS DISTINCT FROM 'production' THEN RAISE EXCEPTION 'recovery_project_mismatch'; END IF; END$$;
        UPDATE service_private.policy SET enabled=false WHERE id=1;
        UPDATE public.billing_policy SET enabled=false;
        UPDATE service_private.lifecycle_policy SET enabled=false,independent_ledger_ready=false,restore_admission_ready=false,cleanup_wiring_ready=false,restore_blocked=true WHERE id=1;
        DO $$BEGIN IF to_regclass('cron.job') IS NOT NULL THEN EXECUTE 'UPDATE cron.job SET active=false'; END IF; END$$;
        COMMIT;`)
      journal.loaded = true; await save()
    } else if (command === 'replay') {
      assert(journal.loaded, 'recovery_loaded_dump_required')
      assert(/^[a-f0-9]{64}$/.test(parsed['key-digest']), 'recovery_original_key_fingerprint_required')
      const env = parseEnv((await privateFile(resolve(parsed.credentials))).toString('utf8'))
      assert(Object.keys(env).every(key => ['DELETION_LEDGER_URL', 'DELETION_LEDGER_TOKEN', 'DELETION_LEDGER_STORE_ID'].includes(key)), 'recovery_ledger_credentials_only')
      const runtime = `${directory}/runtime.mjs`
      const result = await build({ stdin: { contents: "export * from './supabase/functions/lifecycle/ledger.ts'; export * from './supabase/functions/lifecycle/restore.ts'", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node', external: ['node:*'], metafile: true, logLevel: 'silent' })
      await writeFile(runtime, result.outputFiles[0].text, { mode: 0o600 })
      const { httpLedger, replayDeletionLedger } = await import(pathToFileURL(runtime))
      const ledger = httpLedger({ url: env.DELETION_LEDGER_URL, token: env.DELETION_LEDGER_TOKEN, storeId: env.DELETION_LEDGER_STORE_ID, environment: 'production' })
      const keyDigest = parsed['key-digest']
      const actual = await sql("SELECT encode(public._sha256(key),'hex') FROM service_private.lifecycle_keys WHERE id=1;")
      assert(actual === keyDigest, 'recovery_original_key_mismatch')
      const head = await ledger.head()
      if (!journal.replay || journal.replay.result?.phase === 'replayed' && journal.replay.result?.ledgerAdvanced) {
        journal.replay = { storeId: head.storeId, through: head.cursor, keyDigest, beginAttempted: false }; await save()
      }
      const intent = journal.replay
      assert(intent.storeId === head.storeId && intent.keyDigest === keyDigest, 'recovery_original_replay_changed')
      if (!intent.runId) {
        if (intent.beginAttempted) {
          const found = JSON.parse(await sql(`SELECT COALESCE(json_agg(id),'[]'::json) FROM service_private.restore_runs WHERE environment='production' AND store_id=${quote(intent.storeId)} AND through_cursor=${quote(intent.through)}::bigint AND key_digest=${quote(keyDigest)};`))
          assert(found.length === 1, 'recovery_begin_outcome_unresolved'); intent.runId = found[0]
        } else {
          intent.beginAttempted = true; await save()
          intent.runId = (await rpc('lifecycle_restore_begin', { p_environment: 'production', p_store: intent.storeId, p_through: intent.through, p_key_digest: keyDigest })).runId
        }
        await save()
      }
      intent.result = await replayDeletionLedger({ environment: 'production', rpc, ledger, quarantine, keyDigest, runId: intent.runId, maxSteps: 25 })
      intent.sourceHashes = Object.fromEntries(await Promise.all(Object.keys(result.metafile.inputs).filter(path => path !== '<stdin>').map(async path => [path, hash(await readFile(path))])))
      await save()
    }
  }
  await quarantine.assertClosed()
  const report = { ok: true, command, projectRef: journal.projectRef, containerId: journal.containerId, image: journal.image,
    isolated: true, exposureAllowed: false, loaded: journal.loaded ?? false, replay: journal.replay?.result ?? null,
    scope: 'Isolated local preparation only; no content-purge, hosted recovery or cutover acceptance' }
  await writeFile(`${directory}/${command}-result-${randomUUID()}.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify(report))
} catch (error) {
  const report = { ok: false, command: allowed[command] ? command : 'unsupported', error: /^[a-z_]+$/.test(error.message) ? error.message : 'recovery_failed',
    exposureAllowed: false, scope: 'No hosted restore or cutover is supported' }
  if (directory) await writeFile(`${directory}/failed-${randomUUID()}.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }).catch(() => undefined)
  console.error(JSON.stringify(report)); process.exitCode = 1
}
