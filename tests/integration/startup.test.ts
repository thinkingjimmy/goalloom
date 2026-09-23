import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { openWorkspace, StartupError } from '../../src/main/storage/startup'
import { BackupManager } from '../../src/main/storage/backup/manager'
import { Repository } from '../../src/main/workspace/repository'
import { WorkspaceService } from '../../src/main/workspace/transfer/service'

let directory: string, path: string, backups: string
const now = () => '2026-09-23T02:00:00.000Z'
const version = (file: string) => { const db = new DatabaseSync(file, { readOnly: true }); try { return Number(db.prepare('PRAGMA user_version').get()!.user_version) } finally { db.close() } }
// Builds a real older-version file: v3 DDL rewound to the v1/v2 shape, with tasks and history.
function legacy(target: 1 | 2, tasks = 1): DatabaseSync {
  const db = openDatabase(path); migrate(db)
  const repo = new Repository(db, { now })
  const run = (command: Record<string, unknown>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation })
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-09-01', confirmed: true })
  for (let index = 0; index < tasks; index++) run({ type: 'create', title: `旧任务 ${index}`, horizon: 'later' })
  db.exec('DELETE FROM schema_migrations WHERE version=3')
  if (target === 1) db.exec(`DROP INDEX unique_flow_color; DROP TRIGGER flow_root_color; DROP TRIGGER flow_root_edge_insert; DROP TRIGGER flow_root_edge_update; ALTER TABLE items DROP COLUMN flowColor; DELETE FROM schema_migrations WHERE version=2;`)
  db.exec(`PRAGMA user_version = ${target}`)
  return db
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'Goalloom 启动测试 '))
  path = join(directory, 'workspace.sqlite'); backups = join(directory, 'backups')
})
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { force: true, recursive: true }) })

it('新库直接初始化 v3，不创建保护副本', async () => {
  const opened = await openWorkspace(path, backups, now)
  expect(opened.protective).toBeNull()
  expect(Number(opened.db.prepare('PRAGMA user_version').get()!.user_version)).toBe(3)
  opened.db.close()
  expect(existsSync(backups)).toBe(false)
})

it('v2 未 checkpoint 的 WAL：只读源经现有 BackupManager 保护并校验后才原子升级；副本可枚举并恢复', async () => {
  const writer = legacy(2, 3)
  writer.exec('PRAGMA wal_autocheckpoint=0')
  writer.prepare("UPDATE items SET title='WAL 中的修改' WHERE title='旧任务 0'").run()
  // The writer stays open, so the committed change still lives only in the WAL while protection runs.
  expect(existsSync(`${path}-wal`)).toBe(true)
  const opened = await openWorkspace(path, backups, now)
  writer.close()
  expect(opened.protective).toMatchObject({ kind: 'protective' })
  const copy = new DatabaseSync(join(backups, `${opened.protective!.id}.sqlite`), { readOnly: true })
  expect(Number(copy.prepare('PRAGMA user_version').get()!.user_version)).toBe(2)
  expect(copy.prepare("SELECT count(*) AS n FROM items WHERE title='WAL 中的修改'").get()!.n).toBe(1)
  copy.close()
  expect(Number(opened.db.prepare('PRAGMA user_version').get()!.user_version)).toBe(3)
  const repo = new Repository(opened.db, { now }), service = new WorkspaceService(repo, backups)
  expect(repo.store.items('1')).toHaveLength(3)
  const generation = repo.store.workspace().generation
  // 迁移不是整库恢复：工作区代次保持不变。
  expect(generation).toBe(opened.protective!.generation)
  await service.backups.daily({ ...repo.store.workspace(), backupRetention: 1 }, now())
  const records = await service.backups.records()
  expect(records.some(record => record.id === opened.protective!.id)).toBe(true)
  const reply = await service.action({ type: 'previewBackup', generation, backupId: opened.protective!.id })
  expect(reply.type === 'preview' && reply.preview.items).toBe(3)
  opened.db.close()
})

it('v1 无活跃任务的旧库同样先保护，再一次提交到 v3', async () => {
  legacy(1, 0).close()
  const opened = await openWorkspace(path, backups, now)
  expect(opened.protective).not.toBeNull()
  expect(version(join(backups, `${opened.protective!.id}.sqlite`))).toBe(1)
  expect(Number(opened.db.prepare('PRAGMA user_version').get()!.user_version)).toBe(3)
  expect(opened.db.prepare('SELECT count(*) AS n FROM pragma_table_info(\'items\') WHERE name=\'flowColor\'').get()!.n).toBe(1)
  opened.db.close()
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

it('保护副本创建失败、校验失败或迁移失败：不开放业务、不升版本，保留原数据与有效副本', async () => {
  legacy(2).close()
  const create = vi.spyOn(BackupManager.prototype, 'create').mockRejectedValueOnce(new Error('disk full'))
  await expect(openWorkspace(path, backups, now)).rejects.toThrow('保护备份失败')
  expect(version(path)).toBe(2)
  create.mockRestore()
  const verify = vi.spyOn(BackupManager.prototype, 'verify').mockRejectedValueOnce(new Error('bad copy'))
  const failure = await openWorkspace(path, backups, now).catch(error => error)
  expect(failure).toBeInstanceOf(StartupError)
  expect(failure.message).toContain('升级保护校验失败')
  expect(existsSync(failure.backupPath)).toBe(true)
  expect(version(path)).toBe(2)
  verify.mockRestore()
  // 预置冲突的迁移记录使 v3 DDL 事务失败：原子回滚到 v2。
  const db = new DatabaseSync(path); db.exec(`INSERT INTO schema_migrations VALUES (3, '${now()}')`); db.close()
  const migration = await openWorkspace(path, backups, now).catch(error => error)
  expect(migration.message).toContain('升级失败')
  expect(version(path)).toBe(2)
  expect(existsSync(migration.backupPath)).toBe(true)
})
