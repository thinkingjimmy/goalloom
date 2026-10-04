/**
 * [INPUT]: Production Repository, SQLite and transfer boundaries under Electron's Node runtime.
 * [OUTPUT]: Repeatable flow-link rejection, atomic root promotion/adoption, guarded undo and JSON/SQLite round-trip evidence.
 * [POS]: Isolated desktop data fixture; failure cases are recorded in the relation-lines spec before implementation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, verifyDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'
import { exportDataset, replaceDataset } from '../../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../../src/domain/import-validation'

const now = '2026-09-29T12:00:00Z', checks: string[] = []
function fixture(path = ':memory:') {
  const db = openDatabase(path); migrate(db)
  const repo = new Repository(db, { now: () => now }), generation = repo.store.workspace().generation
  const run = (action: Record<string, unknown>) => repo.execute({ generation, operationId: randomUUID(), ...action })
  run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-07-01' }, confirmed: true })
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
  const w = fixture(), upper = w.create('Uncolored parent', 'cycle'), lower = w.create('Uncolored child', 'day')
  w.rejected(() => w.link(upper, lower, {}))
  w.rejected(() => w.link(upper, lower))
  const inherited = w.create('Inherited parent', 'month', { parentId: w.parent, expectedParentVersion: w.repo.store.item(w.parent).version })
  assert.equal(w.repo.store.item(inherited).flowColor, null)
  assert.equal(w.link(inherited, lower, {}).changed, true)
  const other = w.create('Another child', 'day')
  w.run({ type: 'flowColor', itemId: w.parent, expectedVersion: w.repo.store.item(w.parent).version, flowColor: null })
  w.rejected(() => w.link(inherited, other, {}))
  validateImport(w.data(), now); verifyDatabase(w.db); w.db.close()
  checks.push('Colorless pairs are rejected atomically; inherited flow membership permits links and removed ancestor colors are revalidated')
}
{
  const w = fixture(), p = w.repo.store.item(w.parent)
  // Existing edges survive moves; a horizon-valid proposal can therefore still close a cycle.
  w.run({ type: 'move', itemId: w.leaf, expectedVersion: w.repo.store.item(w.leaf).version, expectedPlacementVersion: 1, horizon: 'cycle' })
  w.rejected(() => w.link(w.leaf))
  w.run({ type: 'flowColor', itemId: p.id, expectedVersion: p.version, flowColor: null })
  w.db.exec(`CREATE TRIGGER reject_parent_color BEFORE UPDATE ON items WHEN NEW.id='${w.parent}' AND NEW.flowColor=1 BEGIN SELECT RAISE(ABORT,'injected promotion failure'); END`)
  w.rejected(() => w.link()); w.db.exec('DROP TRIGGER reject_parent_color')
  const operationId = randomUUID(), command = { type: 'link', parentId: w.parent, childId: w.child, expectedParentVersion: w.repo.store.item(w.parent).version,
    expectedChildVersion: w.repo.store.item(w.child).version, adoptParentFlow: true, operationId }
  const promoted = w.run(command)
  assert.deepEqual(w.run(command), promoted)
  assert.equal(promoted.undoable, true)
  assert.equal(w.repo.store.item(w.parent).flowColor, 1); assert.equal(w.repo.store.item(w.child).flowColor, null)
  assert.deepEqual(w.repo.snapshot().flows.map(flow => flow.id), [w.parent])
  const data = validateImport(w.data(), now), effect = data.operations.find(operation => operation.id === operationId)!.effects[0]!
  assert.equal(effect.kind, 'relations')
  if (effect.kind === 'relations') assert.deepEqual(effect.flowColor, { before: 1, after: null, transferredTo: w.parent })
  const forged = structuredClone(data), forgedEffect = forged.operations.find(operation => operation.id === operationId)!.effects[0]!
  if (forgedEffect.kind === 'relations') forgedEffect.flowColor!.transferredTo = w.leaf
  assert.throws(() => validateImport(forged, now))
  const directory = mkdtempSync(join(tmpdir(), 'goalloom-promotion-')), path = join(directory, 'workspace.sqlite')
  try {
    const restored = fixture(path); replaceDataset(restored.repo.store, JSON.parse(JSON.stringify(data)), 'restore', now)
    verifyDatabase(restored.db); restored.db.close()
    const db = openDatabase(path), reopened = new Repository(db, { now: () => now })
    assert.equal(reopened.store.item(w.parent).flowColor, 1); assert.equal(reopened.store.item(w.child).flowColor, null)
    const restoredEffect = reopened.store.operation(operationId)!.effects[0]!
    if (restoredEffect.kind === 'relations') assert.equal(restoredEffect.flowColor?.transferredTo, w.parent)
    validateImport(exportDataset(reopened.store, now), now); db.close()
  } finally { rmSync(directory, { recursive: true, force: true }) }
  for (const id of [w.parent, w.child]) w.run({ type: 'edit', itemId: id, expectedVersion: w.repo.store.item(id).version, title: `Edited ${id}`, description: 'Keep this edit', dueDate: '2026-10-01' })
  assert.equal(w.run({ type: 'undo', originalOperationId: operationId }).outcome, 'committed')
  assert.equal(w.repo.store.item(w.parent).flowColor, null); assert.equal(w.repo.store.item(w.child).flowColor, 1)
  for (const id of [w.parent, w.child]) assert.equal(w.repo.store.item(id).description, 'Keep this edit')
  validateImport(w.data(), now); verifyDatabase(w.db); w.db.close()
  checks.push('Cycle guard, promotion rollback after edge insertion, idempotent root transfer, forged target rejection, durable JSON/SQLite reopen and one undo preserving both text edits')
}
for (const conflict of ['new-branch', 'parent-color', 'child-parent', 'deleted-target']) {
  const w = fixture(), upper = w.create('Independent upper', 'cycle'), promoted = w.link(upper)
  if (conflict === 'new-branch') w.create('New branch', 'day', { parentId: upper, expectedParentVersion: w.repo.store.item(upper).version })
  if (conflict === 'parent-color') w.run({ type: 'flowColor', itemId: upper, expectedVersion: w.repo.store.item(upper).version, flowColor: 2 })
  if (conflict === 'child-parent') w.link(w.parent, w.child, {})
  if (conflict === 'deleted-target') w.run({ type: 'delete', itemId: upper, expectedVersion: w.repo.store.item(upper).version })
  const before = w.data(), result = w.run({ type: 'undo', originalOperationId: promoted.operationId }), after = w.data()
  assert.equal(result.outcome, 'conflict_skipped')
  for (const key of ['items', 'placements', 'relations', 'events', 'undoEffects'] as const) assert.deepEqual(after[key], before[key])
  validateImport(after, now); verifyDatabase(w.db); w.db.close()
  checks.push(`Atomic promotion undo conflict: ${conflict}`)
}
writeFileSync(process.argv[2]!, JSON.stringify({ ok: true, checks, versions: process.versions }, null, 2))
