/**
 * [INPUT]: Isolated profile path, the current date and production Repository commands.
 * [OUTPUT]: Repeatable storage/restore timings for 500 historical and 200 active tasks with a valid flow DAG.
 * [POS]: Release benchmark seed. Never reads a user workspace or enters the production package.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { cpus, release } from 'node:os'
import { join } from 'node:path'
import { Temporal } from '../../src/domain/temporal'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { WorkspaceService } from '../../src/main/workspace/transfer/service'
import { exportDataset, readSqliteDataset, replaceDataset } from '../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../src/domain/import-validation'
import { readHistory } from '../../src/main/workspace/history'
import { reconcile } from '../../src/main/workspace/reconcile'
import type { CommandInput } from '../../src/shared/contracts/commands'
import type { ItemHorizon } from '../../src/shared/contracts/entities'

type Action<T = CommandInput> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never
async function main() {
  const profile = process.argv[2]!, today = Temporal.Now.zonedDateTimeISO('Asia/Shanghai'), start = today.subtract({ months: 2 }).with({ day: 1 })
  let now = start.toInstant().toString()
  const db = openDatabase(join(profile, 'workspace.sqlite')); migrate(db)
  const repo = new Repository(db, { now: () => now }), service = new WorkspaceService(repo, join(profile, 'backups'))
  if (process.argv[3] === 'prepare') {
    const workspace = repo.store.workspace(); workspace.pausedAfterRestore = process.argv[4] === 'true'; repo.store.saveWorkspace(workspace)
    if (process.argv[5] === 'true') await service.backups.daily(workspace, new Date().toISOString())
    db.close(); return
  }
  const run = (action: Action) => repo.execute({ ...action, generation: repo.store.workspace().generation, operationId: randomUUID() })
  const measured: Record<string, number | number[]> = {}
  const measure = <T>(label: string, work: () => T): T => { const t = performance.now(); const result = work(); measured[label] = Math.round((performance.now() - t) * 10) / 10; return result }
  const measureAsync = async <T>(label: string, work: () => Promise<T>): Promise<T> => { const t = performance.now(); const result = await work(); measured[label] = Math.round((performance.now() - t) * 10) / 10; return result }
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: start.toPlainDate().toString() }, confirmed: true })
  const description = '中文长说明，用于搜索与恢复验收。Alpha beta mixed %_正文。'.repeat(12)
  const seedAt = performance.now()
  for (let day = 0; day < 10; day++) {
    now = start.add({ days: day }).toInstant().toString()
    for (let i = 0; i < 50; i++) {
      const id = run({ type: 'create', title: `历史任务 ${day * 50 + i} Alpha %_`, description, horizon: 'day' }).itemId!
      run({ type: 'status', itemId: id, expectedVersion: 1, status: i % 3 === 0 ? 'cancelled' : 'done' })
    }
  }
  now = today.subtract({ days: 1 }).toInstant().toString()
  const oldDay = Temporal.Instant.from(now).toZonedDateTimeISO('Asia/Shanghai').toPlainDate().toString()
  // Keep the flow root inside the 200 active items; its cycle children supply the two-parent DAG.
  const active: string[] = [], horizons: ItemHorizon[] = ['later', 'cycle', 'month', 'week', 'day'], childHorizons: ItemHorizon[] = ['month', 'week', 'day']
  const horizonOf = (i: number): ItemHorizon => i === 199 ? 'year' : i < 50 ? 'day' : i < 150 ? childHorizons[i % 3]! : i < 170 ? 'cycle' : horizons[i % 5]!
  for (let i = 0; i < 200; i++) active.push(run({ type: 'create', title: `活跃计划 ${i} Alpha %_`, description, horizon: horizonOf(i), ...(i === 199 ? { flowColor: 0 } : {}) }).itemId!)
  now = today.toInstant().toString()
  // A sample can cross a week/month boundary; explicitly keep the other active plans current.
  for (let i = 50; i < active.length; i++) {
    const item = repo.store.item(active[i]!)
    run({ type: 'move', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: horizonOf(i) })
  }
  const rootId = active[199]!
  for (const childId of active.slice(150, 170)) {
    run({ type: 'link', parentId: rootId, childId, expectedParentVersion: repo.store.item(rootId).version, expectedChildVersion: repo.store.item(childId).version })
  }
  for (let i = 50; i < 150; i++) for (const parentId of [active[150 + (i - 50) % 20]!, active[150 + (i - 40) % 20]!]) {
    const childId = active[i]!
    run({ type: 'link', parentId, childId, expectedParentVersion: repo.store.item(parentId).version, expectedChildVersion: repo.store.item(childId).version })
  }
  measured.seedMs = Math.round(performance.now() - seedAt)
  const batch = measure('rolloverMs', () => reconcile(repo))!
  assert(batch.changed)
  const snapshot = measure('snapshotMs', () => repo.snapshot())
  assert.equal(snapshot.items.length, 200)
  for (const query of ['中', '中文', 'Alpha', '%', '_', '不存在']) {
    measured[`search:${query}:ms`] = Array.from({ length: 5 }, () => {
      const time = performance.now()
      const result = repo.list({ type: 'list', view: 'search', query, offset: 0, limit: 50 })
      assert.equal(result.total, query === '不存在' ? 0 : 700)
      return Math.round((performance.now() - time) * 10) / 10
    })
  }
  measure('relationsDetailMs', () => { assert.equal(repo.detail(active[50]!).relations.length, 2) })
  measure('history50Ms', () => { assert.equal(readHistory(repo.store, { type: 'history', horizon: 'day', startDate: oldDay, offset: 0, limit: 50 }, now).rows.length, 50) })
  const data = measure('exportMs', () => exportDataset(repo.store, now))
  measure('validateImportMs', () => validateImport(data, now))
  const backup = await measureAsync('backupMs', () => service.backups.create('manual', repo.store.workspace(), now))
  const restored = await measureAsync('readValidateSqliteMs', () => readSqliteDataset(service.backups.path(backup.id), now))
  measure('atomicRestoreMs', () => replaceDataset(repo.store, restored, 'restore', now))
  assert.equal(repo.snapshot().items.length, active.length)
  assert.equal(exportDataset(repo.store, now).events.length, data.events.length)
  const queryPlans = [
    ["SELECT p.* FROM item_placements p JOIN items i ON i.id=p.itemId WHERE i.deletedAt IS NULL AND p.horizon=? AND p.periodId IS ? ORDER BY p.sortKey DESC,p.itemId DESC LIMIT 1", ['day', snapshot.periods.find(period => period.horizon === 'day')!.id]],
    ["SELECT seq FROM item_events WHERE itemId=? AND fromPeriodId IS NOT toPeriodId ORDER BY seq DESC LIMIT 1", [active[0]!]],
    ["SELECT count(*) FROM item_events WHERE operationId=?", [batch.operationId]],
  ].map(([sql, parameters]) => ({ sql, plan: db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters as string[]) }))
  const report = { queryPlans, environment: { electron: process.versions.electron, node: process.versions.node, sqlite: db.prepare('SELECT sqlite_version() AS v').get()!.v, os: release(), arch: process.arch, cpu: cpus()[0]!.model }, counts: { total: data.items.length, active: 200, relations: data.relations.length, events: data.events.length, operations: data.operations.length, rollover: repo.store.operation(batch.operationId)!.effects.length }, measured, sqliteBytes: (await stat(service.backups.path(backup.id))).size, processRssBytes: process.memoryUsage().rss, historyStart: oldDay, firstId: active[50] }
  writeFileSync(join(profile, 'performance.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
  db.close()
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
