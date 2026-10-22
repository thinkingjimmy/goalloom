/**
 * [INPUT]: Production repository, startup/backup/transfer modules and isolated Electron SQLite.
 * [OUTPUT]: Verified v11 upgrade preservation, style writes, projection replay and backup/JSON validation evidence.
 * [POS]: Appearance storage E2E, using real transactions and files with a fixed clock.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseSetting } from '@goalloom/contracts'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { projectWorkspaceSettings, writeSetting } from '@goalloom/store-core'
import { installSchema } from '../../../../packages/local-store/src/schema'
import { migrate, schemaVersion } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { openWorkspace } from '../../src/main/storage/startup'
import { exportDataset, readSqliteDataset } from '../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../src/domain/import-validation'
import { BackupManager } from '../../src/main/storage/backup/manager'

// Failures: rejected style/sync, live/base constraint mismatch, destructive upgrade,
// invalid exports/backups and preference-only commands resetting the chosen style.
const at = '2026-10-21T02:00:00.000Z'
const root = mkdtempSync(join(tmpdir(), 'goalloom-appearance-storage-'))
const path = join(root, 'workspace.sqlite'), backupPath = join(root, 'backups')
const checks: string[] = []
let db = new DatabaseSync(path)
try {
  db.exec('PRAGMA foreign_keys=ON')
  migrate(db)
  let repo = new Repository(db, { now: () => at })
  const generation = repo.store.workspace().generation
  const run = (command: Record<string, unknown>) => repo.execute({ operationId: randomUUID(), generation, ...command })
  run({ type: 'confirmSetup', mode: 'rolling', timezone: 'UTC', weekStart: 1, anchor: { kind: 'today', expected: '2026-10-21' }, confirmed: true })
  run({ type: 'create', title: 'Preserve this task and history', horizon: 'day' })
  run({ type: 'preferences', style: 'minimal', theme: 'dark', checkStyle: 'tint' })
  // Construct the exact old constraint on synthetic data, keeping historical v8 DDL immutable.
  db.exec('BEGIN IMMEDIATE')
  for (const table of ['workspace', 'base_workspace']) {
    const sql = String(db.prepare(`SELECT sql FROM sqlite_master WHERE name='${table}'`).get()!.sql)
    db.exec(`${sql.replace(/^CREATE TABLE\s+(?:"[^"]+"|\w+)/i, `CREATE TABLE ${table}_v11`).replace("'paper','minimal','macos'", "'paper','minimal'")};
      INSERT INTO ${table}_v11 SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_v11 RENAME TO ${table};`)
  }
  db.exec('DELETE FROM schema_migrations WHERE version=12; PRAGMA user_version=11; COMMIT')
  const tables = ['workspace', 'base_workspace', 'items', 'item_placements', 'item_relations', 'operations', 'item_events', 'undo_effects', 'sync_state']
  const rows = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table}`).all()]))
  const before = rows()
  db.close()
  const opened = await openWorkspace(path, backupPath, () => at)
  db = opened.db
  assert(opened.protective)
  const backups = new BackupManager(db, backupPath)
  await backups.verify(opened.protective)
  const protectedDb = new DatabaseSync(backups.path(opened.protective.id), { readOnly: true })
  try { assert.equal(protectedDb.prepare('PRAGMA user_version').get()!.user_version, 11) } finally { protectedDb.close() }
  assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, schemaVersion)
  assert.deepEqual(rows(), before)
  checks.push('Verified protective v11 backup before atomic v12 migration; live/base rows, tasks, receipts and generation unchanged')
  repo = new Repository(db, { now: () => at })
  const tasks = repo.snapshot().items
  run({ type: 'preferences', style: 'macos' })
  run({ type: 'preferences', theme: 'light' })
  run({ type: 'preferences', checkStyle: 'outline' })
  assert.equal(repo.store.workspace().style, 'macos')
  assert.deepEqual(repo.snapshot().items, tasks)
  const data = exportDataset(repo.store, at)
  validateImport(data, at)
  assert.equal(data.schemaVersion, 12)
  assert.equal(data.workspace.style, 'macos')
  checks.push('macos survives independent theme/checkbox writes; v12 JSON exports pass production import validation')
  const setting = parseSetting('style', 'macos'), driver = nodeSqlDriver(db)
  db.prepare("UPDATE workspace SET style='paper'").run()
  assert(writeSetting(driver, setting.key, setting.value, '2026-10-22T02:00:00.000Z', randomUUID()))
  projectWorkspaceSettings(driver)
  assert.equal(repo.store.workspace().style, 'macos')
  db.prepare("UPDATE base_workspace SET style='macos'").run()
  checks.push('Sync allowlist and actual visible/base SQL projections accept macos')
  const backup = await backups.create('manual', repo.store.workspace(), at)
  await backups.verify(backup)
  assert.equal((await readSqliteDataset(backups.path(backup.id), at)).workspace.style, 'macos')
  checks.push('Current SQLite backup verifies and reimports with macos')
  const mobile = new DatabaseSync(':memory:')
  try {
    installSchema(nodeSqlDriver(mobile) as unknown as Parameters<typeof installSchema>[0], randomUUID(), at)
    mobile.exec("UPDATE workspace SET style='macos'; UPDATE base_workspace SET style='macos'")
    installSchema(nodeSqlDriver(mobile) as unknown as Parameters<typeof installSchema>[0], randomUUID(), at)
    assert.equal(mobile.prepare('SELECT style FROM workspace').get()!.style, 'macos')
  } finally { mobile.close() }
  checks.push('Shared offline install and repeated opening accept the synced style')
  writeFileSync(process.argv[2]!, JSON.stringify({ ok: true, checks, runtime: { electron: process.versions.electron, node: process.versions.node, sqlite: db.prepare('SELECT sqlite_version() AS version').get()!.version } }, null, 2))
} finally {
  db.close()
  rmSync(root, { recursive: true, force: true })
}
