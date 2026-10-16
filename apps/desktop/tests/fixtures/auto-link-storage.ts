/**
 * [INPUT]: Production Repository/transfer modules and isolated Electron SQLite with an injected clock.
 * [OUTPUT]: Persistent grouped-completion, cancellation and export/restore evidence.
 * [POS]: Storage E2E probe; exercises actual transactions rather than a mocked repository.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { exportDataset, readSqliteDataset, replaceDataset } from '../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../src/domain/import-validation'
import { BackupManager } from '../../src/main/storage/backup/manager'
import { openWorkspace } from '../../src/main/storage/startup'
const now = '2026-10-16T02:00:00Z', db = new DatabaseSync(':memory:')
db.exec('PRAGMA foreign_keys=ON')
migrate(db)
const repository = new Repository(db, { now: () => now })
const generation = repository.store.workspace().generation
const write = (command: Record<string, unknown>) => repository.execute({ operationId: randomUUID(), generation, ...command })
write({ type: 'confirmSetup', mode: 'rolling', timezone: 'UTC', weekStart: 1, anchor: { kind: 'today', expected: '2026-10-16' }, confirmed: true })
const root = write({ type: 'create', title: 'Root delivery', horizon: 'year', flowColor: 0 }).itemId!
const parent = write({ type: 'create', title: 'Delivery', horizon: 'week', parentId: root, expectedParentVersion: repository.store.item(root).version }).itemId!
const checks: string[] = []
const capture = (title: string) => {
  const request = { requestId: randomUUID(), draftSessionId: randomUUID(), inputRevision: 0, manualRevision: 0, generation, providerRevision: 1, contextRevision: repository.store.workspace().revision, referenceTime: now, text: title, parentHints: [] }
  const created = write({ type: 'create', title, horizon: 'later', smartCapture: { request, allowPlacement: true, allowParents: true } })
  return { created, request }
}
const complete = (created: ReturnType<typeof write>, request: { requestId: string }) => write({ type: 'completeCreation', creationOperationId: created.operationId, requestId: request.requestId,
  itemId: created.itemId, expectedVersion: created.capture!.itemVersion, expectedPlacementVersion: created.capture!.placementVersion,
  selection: { horizon: 'day', previewPeriodId: repository.snapshot().periods.find(p => p.horizon === 'day')!.id,
    parents: [{ itemId: parent, title: 'Delivery', horizon: 'week', parentIds: [root] }] } })
const assertValid = () => validateImport(exportDataset(repository.store, now), now)

const first = capture('Original text'), firstReceipt = JSON.stringify(repository.store.operation(first.created.operationId))
const completion = complete(first.created, first.request)
assert(completion.changed && !completion.undoable)
assert.equal(completion.creationOperationId, first.created.operationId)
assert.equal(JSON.stringify(repository.store.operation(first.created.operationId)), firstReceipt, 'Completion never rewrites creation')
assertValid()
const second = write({ type: 'create', title: 'Next capture', horizon: 'day' })
const undo = write({ type: 'undo', originalOperationId: first.created.operationId })
assert.equal(undo.outcome, 'committed')
assert(repository.store.item(first.created.itemId!).deletedAt)
assert.equal(repository.store.item(second.itemId!).deletedAt, null)
assertValid()
write({ type: 'restoreItem', itemId: first.created.itemId, expectedVersion: repository.store.item(first.created.itemId!).version, deletionSource: undo.operationId })
assert.equal(repository.store.item(first.created.itemId!).placement.horizon, 'day')
assert(repository.store.relations().some(edge => edge.childId === first.created.itemId && edge.parentId === parent))
assertValid()
checks.push('Immutable completion, non-top creation undo, atomic group markers and scoped restore keep final placement/parents')

for (const change of ['edit', 'move', 'status', 'archive', 'delete', 'flowColor'] as const) {
  const { created, request } = capture(`Manual ${change}`), item = repository.store.item(created.itemId!)
  if (change === 'edit') write({ type: change, itemId: item.id, expectedVersion: item.version, title: 'Manual', description: '', dueDate: null })
  if (change === 'move') write({ type: change, itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: 'day' })
  if (change === 'status') write({ type: change, itemId: item.id, expectedVersion: item.version, status: 'done' })
  if (change === 'archive') write({ type: change, itemId: item.id, expectedVersion: item.version, archived: true })
  if (change === 'delete') write({ type: change, itemId: item.id, expectedVersion: item.version })
  if (change === 'flowColor') {
    const moved = write({ type: 'move', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: 'day' })
    write({ type: 'flowColor', itemId: item.id, expectedVersion: repository.store.item(item.id).version, flowColor: 1 })
    assert(moved.changed)
  }
  assert.equal(complete(created, request).changed, false, `${change} cancels late completion`)
  assertValid()
}
const reverted = capture('Edited then restored')
for (const title of ['Temporary edit', 'Edited then restored']) {
  const item = repository.store.item(reverted.created.itemId!)
  write({ type: 'edit', itemId: item.id, expectedVersion: item.version, title, description: '', dueDate: null })
}
assert.equal(complete(reverted.created, reverted.request).changed, false)
checks.push('Manual edits, placement, state, archive, deletion, colour and edit-back all cancel late results')

const pending = capture('Undo pending')
write({ type: 'undo', originalOperationId: pending.created.operationId })
assert.equal(complete(pending.created, pending.request).changed, false)
const repeated = complete(first.created, first.request)
assert.equal(repeated.changed, false, 'A duplicate result does not attach after scoped restore')
assertValid()
checks.push('Undo-before-result and duplicate completion cannot revive automatic work')

const originalParent = repository.store.item(parent)
write({ type: 'edit', itemId: parent, expectedVersion: originalParent.version, title: 'Renamed delivery', description: '', dueDate: null })
const optional = write({ type: 'createPlan', items: [{ draftId: 'optional', title: 'Optional stale automatic parent', horizon: 'day',
  previewPeriodId: repository.snapshot().periods.find(p => p.horizon === 'day')!.id,
  parentRefs: [{ kind: 'existing', itemId: parent, expectedVersion: originalParent.version, automatic: true }] }] })
assert(optional.changed)
assert(!repository.store.relations().some(edge => edge.childId === optional.itemId))
assert.throws(() => write({ type: 'createPlan', items: [{ draftId: 'manual', title: 'Stale manual parent', horizon: 'day',
  previewPeriodId: repository.snapshot().periods.find(p => p.horizon === 'day')!.id,
  parentRefs: [{ kind: 'existing', itemId: parent, expectedVersion: originalParent.version }] }] }))
write({ type: 'edit', itemId: parent, expectedVersion: repository.store.item(parent).version, title: 'Delivery', description: '', dueDate: null })
checks.push('A stale optional parent cannot block creation; a stale manual choice is never silently discarded')

const futureRequest = { requestId: randomUUID(), draftSessionId: randomUUID(), inputRevision: 0, manualRevision: 0, generation, providerRevision: 1,
  contextRevision: repository.store.workspace().revision, referenceTime: now, text: 'Future inline capture', parentHints: [], target: { horizon: 'day', startDate: '2026-10-17' } }
const future = write({ type: 'create', title: futureRequest.text, horizon: 'day', period: { kind: 'date', startDate: '2026-10-17' },
  smartCapture: { request: futureRequest, allowPlacement: false, allowParents: true } })
const futurePeriod = repository.store.item(future.itemId!).placement.periodId
assert(complete(future, futureRequest).changed)
assert.equal(repository.store.item(future.itemId!).placement.periodId, futurePeriod)
const before = write({ type: 'create', title: 'Insertion neighbor', horizon: 'day' }).itemId!
const insertedRequest = { ...futureRequest, requestId: randomUUID(), text: 'Explicit insertion', target: { horizon: 'day', startDate: '2026-10-16' } }
const inserted = write({ type: 'create', title: insertedRequest.text, horizon: 'day', beforeId: before, autoPlace: true,
  smartCapture: { request: insertedRequest, allowPlacement: false, allowParents: true } })
assert(complete(inserted, insertedRequest).changed)
assert.equal(repository.store.position(repository.store.item(inserted.itemId!)).nextId, before)
assertValid()
checks.push('Late inline links preserve the explicit future period and insertion even when automatic placement is enabled')

for (const change of ['reorder-undo', 'link-undo', 'link-unlink', 'status-undo'] as const) {
  const request = { ...insertedRequest, requestId: randomUUID(), draftSessionId: randomUUID(), text: `Manual ${change} wins` }
  const created = write({ type: 'create', title: request.text, horizon: 'day', smartCapture: { request, allowPlacement: false, allowParents: true } })
  const item = repository.store.item(created.itemId!)
  if (change === 'reorder-undo') {
    const moved = write({ type: 'move', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: 'day', beforeId: before })
    write({ type: 'undo', originalOperationId: moved.operationId })
  } else if (change === 'status-undo') {
    const done = write({ type: 'status', itemId: item.id, expectedVersion: item.version, status: 'done' })
    write({ type: 'undo', originalOperationId: done.operationId })
  } else {
    const linked = write({ type: 'link', parentId: parent, childId: item.id, expectedParentVersion: repository.store.item(parent).version, expectedChildVersion: item.version })
    if (change === 'link-undo') write({ type: 'undo', originalOperationId: linked.operationId })
    else write({ type: 'unlink', relationId: repository.store.relations().find(edge => edge.childId === item.id)!.id,
      expectedParentVersion: repository.store.item(parent).version, expectedChildVersion: repository.store.item(item.id).version })
  }
  assert.equal(complete(created, request).changed, false, `${change} must not revive the old request`)
  assertValid()
}
checks.push('Reorder/status undo and link/unlink/undo keep the old completion cancelled after the visible state is restored')

const shiftedParent = write({ type: 'create', title: 'Goal before period change', horizon: 'week', period: { kind: 'date', startDate: '2026-10-19' } }).itemId!
const priorGoal = repository.store.item(shiftedParent), staleGoalCapture = capture('Goal period identity is guarded')
write({ type: 'move', itemId: shiftedParent, expectedVersion: priorGoal.version, expectedPlacementVersion: priorGoal.placement.version, horizon: 'week', period: { kind: 'date', startDate: '2026-10-26' } })
const guarded = write({ type: 'completeCreation', creationOperationId: staleGoalCapture.created.operationId, requestId: staleGoalCapture.request.requestId,
  itemId: staleGoalCapture.created.itemId, expectedVersion: staleGoalCapture.created.capture!.itemVersion, expectedPlacementVersion: staleGoalCapture.created.capture!.placementVersion,
  selection: { horizon: 'day', previewPeriodId: repository.snapshot().periods.find(period => period.horizon === 'day')!.id,
    parents: [{ itemId: shiftedParent, title: priorGoal.title, horizon: 'week', periodId: priorGoal.placement.periodId, parentIds: [] }] } })
assert(guarded.changed)
assert(!repository.store.relations().some(edge => edge.childId === staleGoalCapture.created.itemId))
assertValid()
checks.push('A goal moved into another period loses its stale suggestion without blocking the safe column completion')

const annual = write({ type: 'create', title: 'Independent annual goal', horizon: 'year', flowColor: 2 }).itemId!
const branch = write({ type: 'create', title: 'Independent monthly branch', horizon: 'month' }).itemId!
const weekly = write({ type: 'create', title: 'Independent weekly result', horizon: 'week', parentId: branch, expectedParentVersion: repository.store.item(branch).version }).itemId!
const topologyCapture = capture('Recheck transitive ancestry in the completion transaction')
write({ type: 'link', parentId: annual, childId: branch, expectedParentVersion: repository.store.item(annual).version, expectedChildVersion: repository.store.item(branch).version })
write({ type: 'completeCreation', creationOperationId: topologyCapture.created.operationId, requestId: topologyCapture.request.requestId,
  itemId: topologyCapture.created.itemId, expectedVersion: topologyCapture.created.capture!.itemVersion, expectedPlacementVersion: topologyCapture.created.capture!.placementVersion,
  selection: { horizon: 'day', previewPeriodId: repository.snapshot().periods.find(period => period.horizon === 'day')!.id, parents: [
    { itemId: annual, title: 'Independent annual goal', horizon: 'year', parentIds: [] },
    { itemId: weekly, title: 'Independent weekly result', horizon: 'week', parentIds: [branch] },
  ] } })
assert.deepEqual(repository.store.relations().filter(edge => edge.childId === topologyCapture.created.itemId).map(edge => edge.parentId), [weekly])
assertValid()
checks.push('An intervening graph change prunes the newly redundant ancestor inside the authoritative completion transaction')

const data = assertValid(), other = new DatabaseSync(':memory:')
other.exec('PRAGMA foreign_keys=ON'); migrate(other)
const restored = new Repository(other, { now: () => now })
replaceDataset(restored.store, data, 'restore', now)
validateImport(exportDataset(restored.store, now), now)
assert.notEqual(restored.store.workspace().generation, generation)
assert.throws(() => restored.execute({ type: 'completeCreation', operationId: randomUUID(), generation, creationOperationId: inserted.operationId,
  requestId: insertedRequest.requestId, itemId: inserted.itemId, expectedVersion: 1, expectedPlacementVersion: 1,
  selection: { horizon: 'day', previewPeriodId: futurePeriod, parents: [] } }), /工作区/)
checks.push('Completed, undone and restored receipts round-trip with a new workspace generation')
const temporary = mkdtempSync(join(tmpdir(), 'goalloom-capture-storage-'))
try {
  const manager = new BackupManager(db, join(temporary, 'snapshots'))
  const backup = await manager.create('manual', repository.store.workspace(), now)
  await manager.verify(backup)
  const sqlite = await readSqliteDataset(manager.path(backup.id), now, 'backup')
  assert.equal(sqlite.operations.length, data.operations.length)
  assert.equal(sqlite.undoEffects.length, data.undoEffects.length)
  checks.push('A verified SQLite snapshot retains grouped completions and undo markers')

  const path = join(temporary, 'v10.sqlite'), legacy = new DatabaseSync(path)
  legacy.exec('PRAGMA foreign_keys=ON'); migrate(legacy)
  const old = new Repository(legacy, { now: () => now })
  old.execute({ type: 'confirmSetup', operationId: randomUUID(), generation: old.store.workspace().generation, mode: 'rolling', timezone: 'UTC', weekStart: 1,
    anchor: { kind: 'today', expected: '2026-10-16' }, confirmed: true })
  const oldReceipt = old.execute({ type: 'create', operationId: randomUUID(), generation: old.store.workspace().generation, title: 'Preserved v10 task', horizon: 'day' })
  const beforeUpgrade = JSON.stringify(old.store.operation(oldReceipt.operationId))
  legacy.exec('DROP INDEX operations_creation_completion; DELETE FROM schema_migrations WHERE version=11; PRAGMA user_version=10')
  legacy.close()
  const opened = await openWorkspace(path, join(temporary, 'protective'), () => now)
  assert(opened.protective)
  assert.equal(opened.db.prepare('PRAGMA user_version').get()!.user_version, 11)
  const upgraded = new Repository(opened.db, { now: () => now })
  assert.equal(JSON.stringify(upgraded.store.operation(oldReceipt.operationId)), beforeUpgrade)
  const guardRequest = { ...futureRequest, requestId: randomUUID(), generation: upgraded.store.workspace().generation, text: 'Cross-midnight pending capture', target: { horizon: 'day', startDate: '2026-10-16' } }
  const pendingDay = upgraded.execute({ type: 'create', operationId: randomUUID(), generation: guardRequest.generation, title: guardRequest.text, horizon: 'day',
    smartCapture: { request: guardRequest, allowPlacement: false, allowParents: true } })
  const nextDay = new Repository(opened.db, { now: () => '2026-10-17T02:00:00Z' })
  assert.equal(nextDay.execute({ type: 'completeCreation', operationId: randomUUID(), generation: guardRequest.generation, creationOperationId: pendingDay.operationId,
    requestId: guardRequest.requestId, itemId: pendingDay.itemId, expectedVersion: pendingDay.capture!.itemVersion, expectedPlacementVersion: pendingDay.capture!.placementVersion,
    selection: { horizon: 'day', previewPeriodId: nextDay.store.item(pendingDay.itemId!).placement.periodId, parents: [] } }).changed, false)
  opened.db.close()
  checks.push('Protected v10 upgrade keeps immutable receipts, and an expired inline period refuses late completion')
} finally { rmSync(temporary, { recursive: true, force: true }) }
writeFileSync(process.argv[2]!, JSON.stringify({ passed: true, checks, runtime: { electron: process.versions.electron, node: process.versions.node, sqlite: db.prepare('SELECT sqlite_version() AS v').get()!.v } }, null, 2))
other.close(); db.close()
