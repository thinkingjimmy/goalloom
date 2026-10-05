import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openDatabase } from '../../src/main/storage/database'
import { migrate, schemaVersion } from '../../src/main/storage/schema'
import { openWorkspace } from '../../src/main/storage/startup'
import { Repository } from '../../src/main/workspace/repository'

let directory: string, path: string, backups: string
const now = () => '2026-09-23T02:00:00.000Z'
const version = (file: string) => { const db = new DatabaseSync(file, { readOnly: true }); try { return Number(db.prepare('PRAGMA user_version').get()!.user_version) } finally { db.close() } }
// Builds a real older-version file: v3 DDL rewound to the v1/v2 shape, with tasks and history.
function legacy(target: 1 | 2 | 3 | 4 | 5 | 6, tasks = 1): DatabaseSync {
  const db = openDatabase(path); migrate(db)
  const repo = new Repository(db, { now })
  const run = (command: Record<string, unknown>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation })
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-01' }, confirmed: true })
  for (let index = 0; index < tasks; index++) run({ type: 'create', title: `旧任务 ${index}`, horizon: 'later' })
  if (target < 5) db.exec('ALTER TABLE workspace DROP COLUMN checkStyle; DELETE FROM schema_migrations WHERE version>=5')
  if (target < 4) db.exec('ALTER TABLE workspace DROP COLUMN style; DELETE FROM schema_migrations WHERE version>=4')
  if (target <= 2) db.exec('DELETE FROM schema_migrations WHERE version=3')
  if (target === 1) db.exec(`DROP INDEX unique_flow_color; DROP TRIGGER flow_root_color; DROP TRIGGER flow_root_edge_insert; DROP TRIGGER flow_root_edge_update; ALTER TABLE items DROP COLUMN flowColor; DELETE FROM schema_migrations WHERE version=2;`)
  db.exec(`PRAGMA user_version = ${target}`)
  return db
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'Goalloom 启动测试 '))
  path = join(directory, 'workspace.sqlite'); backups = join(directory, 'backups')
})
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { force: true, recursive: true }) })

it('新库直接初始化当前版本，不创建保护副本', async () => {
  const opened = await openWorkspace(path, backups, now)
  expect(opened.protective).toBeNull()
  expect(Number(opened.db.prepare('PRAGMA user_version').get()!.user_version)).toBe(schemaVersion)
  opened.db.close()
  expect(existsSync(backups)).toBe(false)
})

it.each([1, 2, 3, 4, 5, 6] as const)('v%i is rejected read-only without modifying the file or creating a backup', async target => {
  legacy(target).close()
  const bytes = await readFile(path)
  await expect(openWorkspace(path, backups, now)).rejects.toThrow('不支持')
  expect(version(path)).toBe(target)
  expect(await readFile(path)).toEqual(bytes)
  expect(existsSync(backups)).toBe(false)
})

it('rejects a v5 writer with committed WAL without losing its pending data', async () => {
  const writer = legacy(5)
  try {
    writer.exec('PRAGMA wal_autocheckpoint=0')
    writer.prepare("UPDATE items SET title='Committed WAL'").run()
    const bytes = await readFile(path), wal = await readFile(`${path}-wal`)
    await expect(openWorkspace(path, backups, now)).rejects.toThrow('不支持')
    expect(await readFile(path)).toEqual(bytes)
    expect(await readFile(`${path}-wal`)).toEqual(wal)
    expect(writer.prepare('SELECT title FROM items').get()!.title).toBe('Committed WAL')
    expect(existsSync(backups)).toBe(false)
  } finally { writer.close() }
})

it('更高/未知版本：只读探测拒绝，不改日记模式也不创建副本', async () => {
  const db = new DatabaseSync(path)
  db.exec('CREATE TABLE future (id INTEGER); PRAGMA user_version = 9')
  db.close()
  await expect(openWorkspace(path, backups, now)).rejects.toThrow('更新版本')
  const check = new DatabaseSync(path, { readOnly: true })
  expect(check.prepare('PRAGMA journal_mode').get()!.journal_mode).toBe('delete')
  check.close()
  expect(version(path)).toBe(9)
  expect(existsSync(`${path}-wal`)).toBe(false)
  expect(existsSync(backups)).toBe(false)
})
