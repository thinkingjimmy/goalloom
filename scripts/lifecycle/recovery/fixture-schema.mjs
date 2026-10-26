/**
 * [INPUT]: A tool-owned isolated container, pinned official Auth/Storage migration archives and current project SQL.
 * [OUTPUT]: Real vendor/application schema with the explicit offline pg_net installation exclusion recorded.
 * [POS]: Local recovery acceptance preparation. No hosted source data, API services or schema stubs.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { assertIsolated } from './isolation.mjs'
const [journalPath, outputPath] = process.argv.slice(2)
assert(journalPath && outputPath && process.argv.length === 4, 'fixture_arguments_required')
const journal = JSON.parse(await readFile(journalPath, 'utf8')), directory = resolve(outputPath)
await mkdir(directory, { recursive: true, mode: 0o700 })
const hash = value => createHash('sha256').update(value).digest('hex')
const environment = { ...process.env }; delete environment.DOCKER_CONTEXT; delete environment.DOCKER_HOST
const docker = (args, input) => {
  const run = spawnSync('docker', ['--host', journal.dockerHost, ...args], { env: environment, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000 })
  if (run.status !== 0) throw Object.assign(Error('fixture_docker_failed'), { diagnostic: run.stderr?.match(/(?:ERROR|FATAL):\s+([A-Z0-9]{5})/)?.[1] ?? null })
  return run.stdout
}
const inspect = () => assertIsolated(JSON.parse(docker(['inspect', journal.containerId]))[0], journal)
const stages = [], inputs = {}
let current = 'bootstrap'
const apply = (name, text, transactional = true) => {
  current = name; inspect(); inputs[name] = hash(text)
  const configured = name.startsWith('storage') ? `SET search_path TO storage,public,extensions;\n${text}` : text
  const output = docker(['exec', '-i', journal.containerId, 'psql', '-X', '-qAt', '--set', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=sqlstate', '-h', '/var/run/postgresql', '-U', 'postgres', '-d', 'postgres'], transactional ? `BEGIN;\n${configured}\n;\nCOMMIT;\n` : configured)
  inspect(); stages.push({ name, ok: true }); return output
}
let result
try {
  inspect()
  apply('bootstrap-roles', 'CREATE ROLE supabase_admin SUPERUSER; CREATE ROLE supabase_auth_admin; CREATE SCHEMA auth AUTHORIZATION supabase_admin;')
  const imageDdl = docker(['exec', journal.containerId, 'cat', '/docker-entrypoint-initdb.d/init-scripts/00000000000000-initial-schema.sql'])
  apply('official-supabase-initial', imageDdl)
  const authDirectory = '/private/tmp/goalloom-auth-source/migrations'
  const authFiles = (await readdir(authDirectory)).filter(file => file.endsWith('.up.sql')).sort()
  for (const file of authFiles) {
    const original = await readFile(`${authDirectory}/${file}`, 'utf8')
    inputs[`auth-source/${file}`] = hash(original)
    const sql = original.replace(/\{\{\s*index \.Options "Namespace"\s*\}\}/g, 'auth')
    assert(!sql.includes('{{'), 'fixture_unknown_auth_template')
    apply(`auth/${file}`, sql)
  }
  const storageBase = docker(['exec', journal.containerId, 'cat', '/docker-entrypoint-initdb.d/init-scripts/00000000000002-storage-schema.sql'])
  apply('official-supabase-storage-base', storageBase)
  // The official Storage migration runner owns this bookkeeping table before applying its SQL files.
  apply('storage-migration-journal', 'CREATE TABLE storage.migrations(id integer PRIMARY KEY,name varchar(100) NOT NULL UNIQUE,hash varchar(40) NOT NULL,executed_at timestamp DEFAULT CURRENT_TIMESTAMP);')
  const storageDirectory = '/private/tmp/goalloom-storage-source/migrations/tenant'
  const storageFiles = (await readdir(storageDirectory)).filter(file => file.endsWith('.sql')).sort((a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0]))
  for (const file of storageFiles) {
    const text = await readFile(`${storageDirectory}/${file}`, 'utf8'), id = Number(file.split('-')[0])
    const skipTransaction = text.includes('-- postgres-migrations disable-transaction') || /CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(text)
    const generated = apply(`storage/${file}`, text, !skipTransaction)
    if (text.includes('-- storage-migrations generate-sql')) apply(`storage-generated/${file}`, generated, !generated.includes('-- postgres-migrations disable-transaction'))
    apply(`storage-journal/${file}`, `INSERT INTO storage.migrations(id,name,hash) VALUES(${id},'${file.slice(0, -4)}','${createHash('sha1').update(text).digest('hex')}');`)
  }
  apply('recovery-extensions', 'CREATE EXTENSION IF NOT EXISTS pgsodium; CREATE EXTENSION IF NOT EXISTS supabase_vault;')
  const projectFiles = (await readdir('supabase/migrations')).filter(file => /^00(?:[0-2][0-9]|3[0-3])_.*\.sql$/.test(file)).sort()
  assert(projectFiles.length === 33, 'fixture_project_migration_set_changed')
  const transforms = []
  for (const file of projectFiles) {
    const text = await readFile(`supabase/migrations/${file}`, 'utf8')
    inputs[`project-source/${file}`] = hash(text)
    if (file === '0033_billing_worker_observation.sql') {
      const declaration = 'create extension if not exists pg_net with schema extensions;'
      assert(text.split(declaration).length === 2, 'fixture_pg_net_transform_changed')
      const offline = text.replace(declaration, '')
      transforms.push({ file, removed: declaration, reason: 'Operational HTTP dispatch is not part of an offline replay. Preserve every table/function byte; standard logical restore defers body dependency checks.' })
      apply(`project/${file}`, `SET check_function_bodies=false;\n${offline}`)
    } else apply(`project/${file}`, text)
  }
  apply('production-binding', "UPDATE service_private.policy SET environment='production',project_ref='keqprrgvcefqdwnxaafv',enabled=false WHERE id=1; UPDATE public.billing_policy SET enabled=false;")
  const metadata = JSON.parse(apply('actual-catalog', `SELECT json_build_object('postgres',version(),'extensions',(SELECT json_agg(extname ORDER BY extname) FROM pg_extension),
    'authTables',(SELECT count(*) FROM pg_tables WHERE schemaname='auth'),'storageTables',(SELECT count(*) FROM pg_tables WHERE schemaname='storage'),
    'projectTables',(SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','service_private')),'preloads',current_setting('shared_preload_libraries'));`))
  result = { ok: true, stages, inputs, metadata, image: journal.image, containerId: journal.containerId, transforms,
    vendorSources: { auth: 'supabase/auth v2.197.0', storage: 'supabase/storage v1.81.0' }, scope: 'Actual PostgreSQL/vendor schemas and32 unchanged application migrations plus0033 definitions with explicit pg_net installation exclusion; no worker-dispatch/hosted/API acceptance' }
} catch (error) {
  result = { ok: false, stage: current, diagnostic: error.diagnostic ?? null, error: error.message, stages, inputs }; process.exitCode = 1
} finally {
  await writeFile(`${directory}/schema-fixture-result.json`, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ ok: result.ok, stage: result.stage, diagnostic: result.diagnostic, report: `${directory}/schema-fixture-result.json` }))
}
