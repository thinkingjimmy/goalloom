/**
 * [INPUT]: Reviewed migrations, existing SQL acceptance, Edge source and production-only credentials.
 * [OUTPUT]: Checked/applied backend deployment and a redacted per-run report.
 * [POS]: Manual production entry; no account resets, API-key retrieval, billing or installer publication.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { productionClient, productionRef, productionUrl } from './client.mjs'
import { eszipOriginalSource } from './edge-source.mjs'
import { acceptanceSql, migrationManifest, pendingMigrations, schemaSql, sha256, transactionStart } from './schema.mjs'

const args = process.argv.slice(2)
assert(args.length <= 1 && args.every(arg => ['--plan', '--check', '--apply'].includes(arg)), 'Use --plan, --check or --apply')
const mode = args[0] ?? '--plan'
const manifest = await migrationManifest()
const source = await readFile('supabase/functions/snapshot-url/index.ts', 'utf8')
const tableNames = [...manifest.flatMap(entry => [...entry.sql.matchAll(/create table public\.(\w+)/gu)].map(match => match[1]))]
const quotedTables = tableNames.map(name => `'${name}'`).join(',')
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const out = resolve('apps/desktop/output/tests/production-environment', runId)
await mkdir(out, { recursive: true })
const report = {
  ok: false, mode, project: productionRef, startedAt: new Date().toISOString(), stages: [],
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  migrations: manifest.map(({ sql, ...entry }) => entry), edgeSha256: sha256(source),
  scope: 'Production backend SQL, configuration and unauthorized Edge smoke. No real Google session, two-device or packaged-client acceptance.',
}
const record = async (name, details = {}) => {
  report.stages.push({ name, ...details })
  await writeFile(resolve(out, 'deployment.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(name)
}

const databaseStateSql = `select version() as version,
  to_regclass('supabase_migrations.schema_migrations') is not null as has_history,
  (select coalesce(json_agg(tablename order by tablename),'[]') from pg_tables where schemaname='public' and tablename in (${quotedTables})) as tables,
  (select count(*)::int from auth.users) as auth_users,
  (select count(*)::int from storage.objects) as storage_objects,
  (select coalesce(json_agg(json_build_object('name',name,'installed',installed_version,'available',default_version)),'[]') from pg_available_extensions where name in ('pgcrypto','pgsodium','pgtap','pg_cron')) as extensions;`

const integritySql = `do $integrity$ begin
if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in (${quotedTables})
  and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))) then
raise exception 'Sync table RLS or direct access invariant failed'; end if;
if not exists(select 1 from storage.buckets where id='snapshots' and public=false) then
raise exception 'Snapshots bucket must exist and be private'; end if;
if to_regprocedure('public.reset_sync(uuid)') is not null then raise exception 'Legacy account-wide reset remains'; end if;
end $integrity$;`

async function remoteSource(client) {
  const bytes = await client.request('/functions/snapshot-url/body', { binary: true })
  if (bytes.subarray(0, 8).toString() === 'ESZIP2.3') {
    await writeFile(resolve(out, 'edge-source.eszip'), bytes)
    report.edgeSourceProof = 'ESZIP 2.3 inline original TypeScript source; exactly one executable source/index.ts module'
    return eszipOriginalSource(bytes)
  }
  if (bytes.subarray(0, 2).toString() === 'PK') {
    const path = resolve(out, 'edge-source.zip')
    await writeFile(path, bytes)
    const names = execFileSync('unzip', ['-Z', '-1', path], { encoding: 'utf8' }).trim().split('\n')
    const entries = names.filter(name => /(^|\/)index\.ts$/u.test(name))
    assert(entries.length === 1, 'Downloaded Edge source has no unique index.ts')
    return execFileSync('unzip', ['-p', path, entries[0]], { encoding: 'utf8' })
  }
  const text = bytes.toString('utf8')
  if (text === source) return text
  const body = JSON.parse(text)
  const files = Array.isArray(body) ? body : body.files
  assert(Array.isArray(files), 'Unrecognized downloaded Edge source format')
  const entries = files.filter(file => /(^|\/)index\.ts$/u.test(file.name ?? file.path ?? ''))
  assert(entries.length === 1, 'Downloaded Edge source has no unique index.ts')
  return entries[0].content
}

let client
try {
  const previewTests = await Promise.all(['supabase/tests/0001_core.test.sql', 'supabase/tests/0002_sync_security.test.sql'].map(file => acceptanceSql(file)))
  await record('Local deployment plan', { tests: previewTests.map(({ sql, ...test }) => test), tables: tableNames })
  if (mode !== '--plan') {
    client = await productionClient()
    const state = (await client.query(databaseStateSql, true))[0]
    const history = state.has_history ? await client.query('select version,name,statements from supabase_migrations.schema_migrations order by version;', true) : []
    const pending = pendingMigrations(manifest, history, state.tables)
    for (const name of ['pgcrypto', 'pgsodium', 'pgtap', 'pg_cron']) {
      assert(state.extensions.some(extension => extension.name === name && extension.available), `Required extension unavailable: ${name}`)
    }
    const [project, auth, realtime, functions] = await Promise.all([
      client.request(''), client.request('/config/auth'), client.request('/config/realtime'), client.request('/functions'),
    ])
    assert(project.id === productionRef, 'Production metadata identity mismatch')
    assert(auth.external_google_enabled, 'Production Google provider is not enabled')
    assert(auth.external_google_client_id, 'Production Google client ID is missing')
    const redirects = String(auth.uri_allow_list ?? '').split(',').map(value => value.trim())
    report.oauth = { googleEnabled: true, siteUrl: auth.site_url, desktopRedirectAllowed: redirects.includes('http://127.0.0.1:53682/callback') }
    await record('Production preflight', {
      database: state.version, region: project.region, authUsers: state.auth_users, storageObjects: state.storage_objects,
      installedTables: state.tables, pending: pending.map(entry => entry.file), extensions: state.extensions,
      realtimePrivateOnly: realtime.private_only === true, oauth: report.oauth,
    })

    const schema = schemaSql(manifest, history)
    for (const test of previewTests) {
      const acceptance = await acceptanceSql(test.file, `${schema}\n${integritySql}`)
      await client.query(acceptance.sql)
      await record('Rollback-only SQL acceptance passed', { file: test.file, checks: test.checks })
    }
    const afterCheck = (await client.query(databaseStateSql, true))[0]
    assert(afterCheck.auth_users === state.auth_users && afterCheck.storage_objects === state.storage_objects, 'Acceptance changed persistent Auth or Storage counts')
    assert(JSON.stringify(afterCheck.tables) === JSON.stringify(state.tables), 'Acceptance left schema changes behind')

    if (mode === '--apply') {
      await client.query(`${transactionStart}\n${schema}\n${integritySql}\ncommit;`)
      await record('Schema and migration history committed', { applied: pending.map(entry => entry.file) })
      const installedHistory = await client.query('select version,name,statements from supabase_migrations.schema_migrations order by version;', true)
      assert(pendingMigrations(manifest, installedHistory, tableNames).length === 0, 'Committed migration history is incomplete')

      if (!realtime.private_only) await client.request('/config/realtime', { method: 'PATCH', json: { private_only: true } })
      assert((await client.request('/config/realtime')).private_only === true, 'Public Realtime channels remain enabled')
      await record('Realtime private-only verified')

      const currentFunction = functions.find(fn => fn.slug === 'snapshot-url')
      const sameSource = currentFunction && currentFunction.verify_jwt === true && sha256(await remoteSource(client)) === sha256(source)
      if (!sameSource) {
        const form = new FormData()
        form.set('metadata', JSON.stringify({ name: 'snapshot-url', entrypoint_path: 'index.ts', verify_jwt: true }))
        form.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts')
        await client.request('/functions/deploy?slug=snapshot-url', { method: 'POST', form })
      }
      const metadata = await client.request('/functions/snapshot-url')
      assert(metadata.verify_jwt === true && metadata.status === 'ACTIVE', 'Edge Function is not active with JWT verification')
      assert(sha256(await remoteSource(client)) === sha256(source), 'Deployed Edge source does not match the repository')
      await record('Edge source and JWT verification matched', { deployed: !sameSource, version: metadata.version, sha256: sha256(source), proof: report.edgeSourceProof ?? 'Downloaded original source' })

      await client.query(`${transactionStart}\ncreate extension if not exists pg_cron;\n${await readFile('supabase/sync-cost-cron.sql', 'utf8')}\ncommit;`)
      const jobs = await client.query("select jobname,schedule,active,command from cron.job where jobname='goalloom-sync-runtime-cleanup';", true)
      assert(jobs.length === 1 && jobs[0].active && jobs[0].schedule === '*/5 * * * *' && jobs[0].command.includes("statement_timeout = '5s'"), 'Cleanup schedule invariant failed')
      await client.query("begin; set local statement_timeout='5s'; select public.cleanup_sync_runtime(5000); commit;")
      await record('Single bounded cleanup job verified', { job: jobs[0], manualInvocationPassed: true, scheduledRunNotYetObserved: true })

      for (const test of previewTests) {
        await client.query((await acceptanceSql(test.file, integritySql)).sql)
        await record('Installed SQL acceptance passed', { file: test.file, checks: test.checks })
      }
      const smokeStatus = Number(execFileSync('curl', [
        '--silent', '--show-error', '--http1.1', '--max-time', '20', '--request', 'POST',
        '--header', 'content-type: application/json', '--data', '{}', '--write-out', '%{http_code}',
        '--output', resolve(out, 'edge-smoke.json'), `${productionUrl}/functions/v1/snapshot-url`,
      ], { encoding: 'utf8' }))
      assert(smokeStatus === 401, `Unauthenticated Edge request returned ${smokeStatus}`)
      await record('Unauthenticated Edge smoke rejected', { status: smokeStatus })
      const final = (await client.query(databaseStateSql, true))[0]
      assert(final.auth_users === state.auth_users && final.storage_objects === state.storage_objects, 'Deployment changed existing Auth or Storage object counts')
      const costs = await client.query('select version,enforce from public.sync_cost_limits;', true)
      await record('Final backend inventory', { database: final.version, tables: final.tables, authUsers: final.auth_users, storageObjects: final.storage_objects, costEnforcement: costs })
    }
  }
  report.ok = true
} catch (error) {
  report.error = client ? client.safe(error.message) : error.message
  console.error(report.error)
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  await writeFile(resolve(out, 'deployment.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`Evidence: ${resolve(out, 'deployment.json')}`)
}
