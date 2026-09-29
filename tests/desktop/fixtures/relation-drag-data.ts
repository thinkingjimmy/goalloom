/**
 * [INPUT]: Production Repository, SQLite and transfer boundaries under Electron's Node runtime.
 * [OUTPUT]: Repeatable atomic adoption, conflict, undo and export/restore evidence for drag acceptance.
 * [POS]: Isolated desktop data fixture; failure cases are recorded in the relation-lines spec before implementation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { openDatabase, verifyDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'
import { exportDataset, replaceDataset } from '../../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../../src/domain/import-validation'

const now = '2026-09-29T12:00:00Z', checks: string[] = []
function fixture() {
  const db = openDatabase(':memory:'); migrate(db)
  const repo = new Repository(db, { now: () => now }), generation = repo.store.workspace().generation
  const run = (action: Record<string, unknown>) => repo.execute({ generation, operationId: randomUUID(), ...action })
  run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, cycleAnchor: '2026-07-01', confirmed: true })
  const create = (title: string, horizon: string, extra = {}) => run({ type: 'create', title, horizon, ...extra }).itemId!
  const parent = create('Parent', 'cycle', { flowColor: 0 }), child = create('Source root', 'month', { flowColor: 1 })
  const leaf = create('Existing child', 'week', { parentId: child, expectedParentVersion: repo.store.item(child).version })
  const link = (p = parent, c = child, extra: Record<string, unknown> = { adoptParentFlow: true }) => run({ type: 'link', parentId: p, childId: c,
    expectedParentVersion: repo.store.item(p).version, expectedChildVersion: repo.store.item(c).version, ...extra })
  const data = () => exportDataset(repo.store, now)
  const rejected = (action: () => unknown) => { const before = JSON.stringify(data()); assert.throws(action); assert.equal(JSON.stringify(data()), before) }
  return { db, repo, generation, run, create, parent, child, leaf, link, data, rejected }
}
{
  const w = fixture(), before = w.repo.store.item(w.child)
  w.rejected(() => w.link(w.parent, w.child, {}))
  w.rejected(() => w.link(w.parent, w.child, { adoptParentFlow: false }))
  for (const horizon of ['month', 'week', 'day', 'later']) {
    const target = w.create(`Invalid ${horizon}`, horizon)
    w.rejected(() => w.link(target))
  }
  w.rejected(() => w.link(w.child)); w.rejected(() => w.link(w.parent, w.child, { adoptParentFlow: true, expectedChildVersion: 1 }))
  w.rejected(() => w.link(w.parent, w.child, { adoptParentFlow: true, generation: 'old-generation' }))
  w.repo.maintenance = true; w.rejected(() => w.link()); w.repo.maintenance = false
  // Force a failure after the color UPDATE to prove the surrounding transaction rolls it back.
  w.db.exec("CREATE TRIGGER reject_test_link BEFORE INSERT ON item_relations BEGIN SELECT RAISE(ABORT,'injected link failure'); END")
  w.rejected(() => w.link()); w.db.exec('DROP TRIGGER reject_test_link')
  const operationId = randomUUID(), command = { type: 'link', parentId: w.parent, childId: w.child, expectedParentVersion: w.repo.store.item(w.parent).version,
    expectedChildVersion: w.repo.store.item(w.child).version, adoptParentFlow: true, operationId }
  const merged = w.run(command)
  assert.deepEqual(w.run(command), merged)
  assert.equal(w.repo.store.item(w.child).flowColor, null)
  assert.equal(w.repo.snapshot().relations.length, 2)
  assert.equal(merged.undoable, true)
  w.rejected(() => w.link())
  const exported = validateImport(w.data(), now)
  const bad = structuredClone(exported), effect = bad.operations.find(op => op.id === operationId)!.effects[0]!
  assert.equal(effect.kind, 'relations')
  if (effect.kind === 'relations') assert.deepEqual(effect.flowColor, { before: 1, after: null })
  bad.operations.find(op => op.id === operationId)!.kind = 'unlink'
  assert.throws(() => validateImport(bad, now))
  const wrong = structuredClone(exported), wrongEffect = wrong.operations.find(op => op.id === operationId)!.effects[0]!
  wrongEffect.itemId = w.parent; assert.throws(() => validateImport(wrong, now))
  const restored = fixture(); replaceDataset(restored.repo.store, exported, 'restore', now)
  assert.equal(restored.repo.store.item(w.child).flowColor, null); assert.equal(restored.repo.snapshot().relations.length, 2)
  verifyDatabase(restored.db); restored.db.close()
  w.run({ type: 'edit', itemId: w.child, expectedVersion: w.repo.store.item(w.child).version, title: 'Later text', description: 'Preserve me', dueDate: '2026-10-01' })
  const undone = w.run({ type: 'undo', originalOperationId: operationId })
  assert.equal(undone.outcome, 'committed')
  const after = w.repo.store.item(w.child)
  assert.equal(after.flowColor, before.flowColor); assert.equal(after.title, 'Later text'); assert.equal(after.description, 'Preserve me')
  assert.equal(after.dueDate, '2026-10-01'); assert.deepEqual(after.placement, before.placement)
  assert.equal(w.repo.snapshot().relations.length, 1); validateImport(w.data(), now); verifyDatabase(w.db); w.db.close()
  checks.push('Strict opt-in, horizons, self, stale versions/generation, maintenance, rollback after color update, idempotent receipt, owned-field undo and validated JSON/SQLite restore')
}
for (const conflict of ['color-taken', 'new-parent', 'changed-color', 'deleted']) {
  const w = fixture(), merged = w.link()
  if (conflict === 'color-taken') w.create('Color reused', 'cycle', { flowColor: 1 })
  if (conflict === 'new-parent') w.link(w.create('Another parent', 'cycle'), w.child, {})
  if (conflict === 'changed-color') {
    const edge = w.repo.snapshot().relations.find(edge => edge.childId === w.child)!
    w.run({ type: 'unlink', relationId: edge.id, expectedParentVersion: w.repo.store.item(w.parent).version, expectedChildVersion: w.repo.store.item(w.child).version })
    w.run({ type: 'flowColor', itemId: w.child, expectedVersion: w.repo.store.item(w.child).version, flowColor: 2 })
  }
  if (conflict === 'deleted') w.run({ type: 'delete', itemId: w.child, expectedVersion: w.repo.store.item(w.child).version })
  const before = w.data(), result = w.run({ type: 'undo', originalOperationId: merged.operationId }), after = w.data()
  assert.equal(result.outcome, 'conflict_skipped')
  for (const key of ['items', 'placements', 'relations', 'events', 'undoEffects'] as const) assert.deepEqual(after[key], before[key])
  validateImport(after, now); verifyDatabase(w.db); w.db.close()
  checks.push(`Atomic undo conflict: ${conflict}`)
}
{
  const w = fixture(), p = w.repo.store.item(w.parent)
  // Existing edges survive moves; a horizon-valid proposal can therefore still close a cycle.
  w.run({ type: 'move', itemId: w.leaf, expectedVersion: w.repo.store.item(w.leaf).version, expectedPlacementVersion: 1, horizon: 'cycle' })
  w.rejected(() => w.link(w.leaf))
  w.run({ type: 'flowColor', itemId: p.id, expectedVersion: p.version, flowColor: null })
  assert.equal(w.link().undoable, true); assert.equal(w.repo.snapshot().flows.length, 0)
  validateImport(w.data(), now); w.db.close()
  checks.push('Cycle after moved descendants and merging into an uncolored parent')
}
writeFileSync(process.argv[2]!, JSON.stringify({ ok: true, checks, versions: process.versions }, null, 2))
