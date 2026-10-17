/**
 * [INPUT]: Scoped development deployment token/project ref from .env.deploy.local.
 * [OUTPUT]: Rolled-back real PostgreSQL/pgTAP acceptance; --apply installs only the tested additive migration.
 * [POS]: Explicit hosted development verification. Secrets and task data never enter the report.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { loadEnvFile } from 'node:process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
loadEnvFile('.env.deploy.local')
const ref = process.env.SUPABASE_PROJECT_REF, token = process.env.SUPABASE_ACCESS_TOKEN
assert(ref && token, 'Scoped deployment credentials are required')
async function expand(path) {
  const source = await readFile(path, 'utf8')
  const parts = []
  for (const line of source.split('\n')) {
    const match = line.match(/^\\ir (.+)$/)
    parts.push(match ? await expand(resolve(dirname(path), match[1])) : line)
  }
  return parts.join('\n')
}
async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60_000) })
  const text = await response.text()
  if (!response.ok) {
    // PostgreSQL errors in this script refer only to committed SQL and synthetic test fixtures.
    let message = `Hosted SQL failed (${response.status})`
    try { message += `: ${JSON.parse(text).message ?? 'Unknown SQL error'}` } catch {}
    throw Error(message)
  }
  return JSON.parse(text)
}
const out = resolve('apps/desktop/output/tests/sync-security')
await mkdir(out, { recursive: true })
const migration = await readFile('supabase/migrations/0009_sync_security.sql', 'utf8')
const schema = await query("select version(), to_regprocedure('public.create_new_workspace(uuid,uuid,uuid,jsonb,text,bytea,jsonb,bytea,bytea)') is not null as installed")
const installed = schema[0]?.installed === true
let tests = await expand(resolve('supabase/tests/0002_sync_security.test.sql'))
tests = tests.replace(/^begin;$/m, '').replace(/^rollback;$/m, '')
let checks = 0
tests = tests.replace(/^select (lives_ok|throws_ok|is|ok)\(/gm, (_match, name) => { checks++; return `insert into tap_results select ${name}(` })
tests = tests.replace('select * from finish();', () => `do $$begin
  if exists(select 1 from tap_results where result like 'not ok%') then
    raise exception 'Security pgTAP failure: %', (select string_agg(result, E'\\n') from tap_results where result like 'not ok%');
  end if;
end $$;`)
const report = { ok: false, project: ref, database: schema[0]?.version, checks, migration: '0009_sync_security.sql',
  migrationWasInstalled: installed, migrationApplied: false, scope: 'Real hosted PostgreSQL, pgsodium and pgTAP. Synthetic auth/device rows; all test data and temporary function changes roll back.' }
try {
  await query(`begin; set local statement_timeout='15s'; ${installed ? '' : migration}\ncreate temporary table tap_results(result text);\n${tests}\nrollback;`)
  report.ok = true
  if (process.argv.includes('--apply') && !installed) { await query(`begin; set local statement_timeout='15s'; ${migration}\ncommit;`); report.migrationApplied = true }
  console.log(JSON.stringify(report, null, 2))
} catch (error) { report.error = error.message; throw error }
finally { await writeFile(resolve(out, 'hosted.json'), JSON.stringify(report, null, 2)) }
