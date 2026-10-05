/**
 * [INPUT]: Production Repository/SQLite, injected clock, isolated file and evidence paths.
 * [OUTPUT]: Atomic discard guards, past-period removal, undo holds and JSON/SQLite recovery evidence.
 * [POS]: Autosave desktop fixture; no test clock or control enters production.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase, verifyDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'
import { readPastPeriod } from '../../../src/main/workspace/history'
import { itemCounts } from '../../../src/main/workspace/queries'
import { consistentBackup } from '../../../src/main/storage/backup/snapshot'
import { exportDataset, readSqliteDataset, replaceDataset } from '../../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../../src/domain/import-validation'
import { loadServerLocale } from '../../../src/shared/i18n/server'

async function verify(): Promise<void> {
  const db = openDatabase(join(process.argv[2]!, 'discard-boundaries.sqlite'))
  migrate(db)
  const time = { now: '2026-10-04T12:00:00Z' }, repo = new Repository(db, { now: () => time.now })
  const generation = repo.store.workspace().generation
  const run = (action: Record<string, unknown>) => repo.execute({ operationId: randomUUID(), generation, ...action })
  const create = (title: string, extra = {}) => run({ type: 'create', title, horizon: 'day', ...extra }).itemId!
  const discard = (id: string, extra = {}) => run({ type: 'discardEmpty', itemId: id, expectedVersion: repo.store.item(id).version, ...extra })
  const checks: string[] = []
  run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-01' }, confirmed: true })
  const id = create('Restore the exact past placement'), original = structuredClone(repo.store.item(id))
  const removed = discard(id)
  assert.deepEqual(discard(id, { operationId: removed.operationId, expectedVersion: original.version }), removed)
  assert.equal(itemCounts(repo.store).trash, 0)
  assert.equal(repo.list({ type: 'list', view: 'trash', query: '', limit: 50, offset: 0 }).total, 0)
  assert.equal(repo.snapshot().items.some(item => item.id === id), false)
  checks.push('Discard is idempotent, retains the recovery title/placement and stays outside board/trash/counts')
  time.now = '2026-10-05T12:00:00Z'
  const past = () => readPastPeriod(repo.store, { type: 'pastPeriod', horizon: 'day', startDate: '2026-10-04', generation, limit: 50, offset: 0 }, time.now)
  assert.equal(past().items.some(item => item.id === id), false)
  const undone = run({ type: 'undo', originalOperationId: removed.operationId })
  assert.equal(undone.changed, true)
  const restored = repo.store.item(id)
  assert.equal(restored.title, original.title); assert.equal(restored.deletedAt, null)
  assert.equal(restored.placement.periodId, original.placement.periodId)
  assert.equal(restored.placement.sortKey, original.placement.sortKey)
  assert.equal(restored.placement.holdPeriodId, repo.snapshot().periods.find(period => period.horizon === 'day')!.id)
  assert.equal(past().items.some(item => item.id === id), true)
  checks.push('Discard disappears from live past periods; undo restores the original period/order with a current-period hold')
  const atomic = (action: () => unknown) => {
    const before = exportDataset(repo.store, time.now)
    assert.throws(action)
    assert.deepEqual(exportDataset(repo.store, time.now), before)
  }
  const guarded = create('Protected content', { description: 'Meaningful note' })
  atomic(() => discard(guarded))
  atomic(() => discard(id, { expectedVersion: 1 }))
  atomic(() => discard(id, { generation: 'old-generation' }))
  checks.push('Content/version/generation rejection leaves all items, events, receipts and workspace state unchanged')
  const empty = create('Recoverable outside trash', { horizon: 'later' })
  const savedDiscard = discard(empty)
  const dataset = validateImport(JSON.parse(JSON.stringify(exportDataset(repo.store, time.now))), time.now)
  assert.equal(dataset.operations.find(operation => operation.id === savedDiscard.operationId)!.kind, 'discardEmpty')
  const forged = structuredClone(dataset)
  forged.items.find(item => item.id === empty)!.description = 'Do not hide meaningful imported content'
  assert.throws(() => validateImport(forged, time.now))
  const backup = await consistentBackup(db, join(process.argv[2]!, 'discard-backups'))
  const sqlite = await readSqliteDataset(backup, time.now, 'backup')
  for (const source of [dataset, sqlite]) {
    const target = openDatabase(':memory:'); migrate(target)
    const replacement = new Repository(target, { now: () => time.now })
    replaceDataset(replacement.store, source, 'restore', time.now)
    assert.equal(replacement.store.item(empty).title, 'Recoverable outside trash')
    assert(replacement.store.item(empty).deletedAt)
    assert.equal(itemCounts(replacement.store).trash, 0)
    assert.equal(replacement.list({ type: 'list', view: 'trash', query: '', limit: 50, offset: 0 }).total, 0)
    const newGeneration = replacement.store.workspace().generation
    const stale = replacement.execute({ type: 'undo', originalOperationId: savedDiscard.operationId, operationId: randomUUID(), generation: newGeneration })
    assert.equal(stale.outcome, 'conflict_skipped')
    assert(replacement.store.item(empty).deletedAt)
    verifyDatabase(target); target.close()
  }
  checks.push('Complete JSON and consistent SQLite backup validate/restore discard records without trash entries; old-generation undo stays invalid')
  const labels: Record<string, string> = {}
  for (const locale of ['zh', 'en', 'ja', 'es', 'fr'] as const) {
    await loadServerLocale(locale)
    const target = create(`Locale ${locale}`, { horizon: 'later' })
    labels[locale] = discard(target).label
    assert(labels[locale]); assert.equal(itemCounts(repo.store).trash, 0)
  }
  assert.equal(new Set(Object.values(labels)).size, 5)
  checks.push('All five server locales produce explicit empty-item removal feedback')
  verifyDatabase(db)
  const report = { result: 'passed', checks, labels, runtime: { electron: process.versions.electron, node: process.versions.node, sqlite: db.prepare('SELECT sqlite_version() AS version').get()!.version }, scope: 'Production Repository/SQLite in Electron Node with injected time; native UI is covered by the companion discard fixture' }
  writeFileSync(process.argv[3]!, JSON.stringify(report, null, 2)); db.close()
}
verify().catch(error => { console.error(error); process.exitCode = 1 })
