/**
 * [INPUT]: Repository migrations, existing pgTAP files and recorded migration history.
 * [OUTPUT]: Deterministic manifest, transaction-guarded schema/history SQL and rollback-only acceptance SQL.
 * [POS]: Deployment schema planner; no network calls or business data cleanup.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export const sha256 = text => createHash('sha256').update(text).digest('hex')
const quote = value => `'${value.replaceAll("'", "''")}'`

export async function migrationManifest() {
  const names = (await readdir('supabase/migrations')).filter(name => /^\d+_.+\.sql$/u.test(name)).sort()
  return Promise.all(names.map(async name => {
    const [, version, label] = name.match(/^(\d+)_(.+)\.sql$/u)
    const sql = await readFile(`supabase/migrations/${name}`, 'utf8')
    return { version, name: label, file: name, sql, sha256: sha256(sql) }
  }))
}

export function pendingMigrations(manifest, history, installedTables) {
  assert(history.length <= manifest.length, 'Remote migration history is newer than this checkout')
  history.forEach((row, index) => {
    const expected = manifest[index]
    assert(row.version === expected.version && row.name === expected.name, 'Remote history is not the expected migration prefix')
    assert(Array.isArray(row.statements) && sha256(row.statements.join('')) === expected.sha256, `Applied SQL drift: ${expected.file}`)
  })
  assert(history.length > 0 || installedTables.length === 0, 'Existing sync tables lack migration history; refusing to rebuild or overwrite')
  return manifest.slice(history.length)
}

export function schemaSql(manifest, history) {
  const pending = manifest.slice(history.length)
  const ledger = `create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);
revoke all on schema supabase_migrations from public, anon, authenticated;
revoke all on supabase_migrations.schema_migrations from public, anon, authenticated;`
  const guards = history.map((row, index) => {
    const entry = manifest[index]
    return `if not exists(select 1 from supabase_migrations.schema_migrations where version=${quote(entry.version)} and name=${quote(entry.name)} and statements=array[${quote(entry.sql)}]::text[]) then raise exception 'Migration history changed during deployment'; end if;`
  }).join('\n')
  const emptyGuard = history.length === 0 ? `if to_regclass('public.workspaces') is not null or to_regclass('public.devices') is not null then raise exception 'Sync schema appeared during deployment'; end if;` : ''
  const checks = `do $guard$ begin
if (select count(*) from supabase_migrations.schema_migrations) <> ${history.length} then raise exception 'Concurrent migration history change'; end if;
${emptyGuard}\n${guards}\nend $guard$;`
  return `${ledger}\n${checks}\n${pending.map(entry => `${entry.sql}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values (${quote(entry.version)},${quote(entry.name)},array[${quote(entry.sql)}]::text[]);`).join('\n')}`
}

export const transactionStart = `begin; set local lock_timeout='5s'; set local statement_timeout='30s';
select pg_advisory_xact_lock(hashtextextended('goalloom-production-deploy', 0));`

async function expand(path) {
  const parts = []
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    const match = line.match(/^\\ir (.+)$/u)
    parts.push(match ? await expand(resolve(dirname(path), match[1])) : line)
  }
  return parts.join('\n')
}

export async function acceptanceSql(file, schema = '') {
  let source = await expand(resolve(file))
  source = source.replace(/^begin;\s*$/gmu, '').replace(/^rollback;\s*$/gmu, '')
  let checks = 0
  source = source.replace(/^select (lives_ok|throws_ok|is|ok|pass)\(/gmu, (_, name) => {
    checks++
    return `insert into tap_results select ${name}(`
  })
  assert(checks > 0, `No existing SQL assertions found in ${file}`)
  assert(source.includes('select * from finish();'), 'Missing pgTAP finish guard')
  source = source.replace('select * from finish();', `do $acceptance$ begin
if exists(select 1 from tap_results where result like 'not ok%') then
raise exception 'SQL acceptance failed: %', (select string_agg(result,E'\\n') from tap_results where result like 'not ok%');
end if;
if (select count(*) from tap_results) <> ${checks} then raise exception 'Incomplete SQL acceptance'; end if;
end $acceptance$;`)
  return { file, checks, sql: `${transactionStart}\n${schema}\ncreate extension if not exists pgtap with schema extensions;
set local search_path=extensions,public;
create temporary table tap_results(result text);\n${source}\nrollback;` }
}
