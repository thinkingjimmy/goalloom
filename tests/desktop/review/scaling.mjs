import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { openDatabase } from '../../../src/main/storage/database.ts'
import { migrate } from '../../../src/main/storage/schema.ts'
import { Repository } from '../../../src/main/workspace/repository.ts'
import { reconcile } from '../../../src/main/workspace/reconcile.ts'
import { exportDataset } from '../../../src/main/workspace/transfer/dataset.ts'
import { validateImport } from '../../../src/domain/import-validation.ts'
const label = process.env.GOALLOOM_BENCH_LABEL ?? 'latest', rows = []
assert(/^[a-z0-9-]+$/.test(label))
for (const count of [200, 400, 800]) for (let sample = 0; sample < 3; sample++) {
  const db = openDatabase(':memory:'); migrate(db)
  let now = '2026-09-23T12:00:00Z'
  const repo = new Repository(db, { now: () => now })
  const execute = action => repo.execute({ ...action, operationId: randomUUID(), generation: repo.store.workspace().generation })
  execute({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-07-01', confirmed: true })
  for (let i = 0; i < count; i++) execute({ type: 'create', title: `Synthetic ${i}`, description: '长说明'.repeat(1000), horizon: 'day' })
  now = '2026-09-24T12:00:00Z'
  const start = performance.now(), batch = reconcile(repo), rolloverMs = performance.now() - start
  assert.equal(repo.store.operation(batch.operationId).effects.length, count)
  const detail = repo.store.items('1')[0]
  execute({ type: 'edit', itemId: detail.id, expectedVersion: detail.version, title: 'Unrelated edit kept', description: detail.description, dueDate: null })
  const undoStart = performance.now(); execute({ type: 'undoBatch', originalOperationId: batch.operationId })
  const undoMs = performance.now() - undoStart
  const restored = repo.store.items('1')
  assert(restored.every(item => item.placement.periodId.endsWith('2026-09-23') && item.placement.holdPeriodId.endsWith('2026-09-24')))
  assert.equal(repo.store.item(detail.id).title, 'Unrelated edit kept')
  validateImport(exportDataset(repo.store, now), now)
  const plan = db.prepare('EXPLAIN QUERY PLAN SELECT p.* FROM item_placements p JOIN items i ON i.id=p.itemId WHERE i.deletedAt IS NULL AND p.horizon=? AND p.periodId IS ? ORDER BY p.sortKey DESC,p.itemId DESC LIMIT 1').all('day', detail.placement.periodId)
  rows.push({ count, sample, rolloverMs, undoMs, queryPlan: plan, sqlite: db.prepare('SELECT sqlite_version() AS version').get().version })
  db.close()
}
writeFileSync(`output/tests/performance/scaling-${label}.json`, JSON.stringify({ environment: { electron: process.versions.electron, node: process.versions.node, arch: process.arch }, rows }, null, 2))
console.log(JSON.stringify(rows.map(({ count, sample, rolloverMs, undoMs }) => ({ count, sample, rolloverMs, undoMs }))))
