/**
 * [INPUT]: Production Repository, Electron SQLite, current schemaVersion, transfer/upgrade boundaries and an injected clock.
 * [OUTPUT]: Repeatable two-level topology, lifecycle, group rollover, undo and recovery evidence.
 * [POS]: Subtask E2E transaction fixture; failures are recorded in docs/features/subtasks.md.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { migrate, schemaVersion } from '../../src/main/storage/schema'
import { openDatabase, verifyDatabase } from '../../src/main/storage/database'
import { Repository } from '../../src/main/workspace/repository'
import { exportDataset, readSqliteDataset, replaceDataset } from '../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../src/domain/import-validation'
import { reconcile } from '../../src/main/workspace/reconcile'
import { flowIndex } from '../../src/domain/flows'
import { buildParentOrder } from '../../src/domain/parent-order'
import { combinedTopology } from '../../src/domain/nesting'
import { StartupUpgrade } from '../../src/main/storage/upgrade'
import { openWorkspace } from '../../src/main/storage/startup'
import { readAssistanceContext } from '../../src/main/workspace/assistance-context'
import { assistanceContextSchema } from '../../src/shared/contracts/assistance'

const checks: string[] = []
async function main() {
function world(path = ':memory:') {
  let now = '2026-10-11T12:00:00.000Z'
  const db = openDatabase(path); migrate(db)
  const repo = new Repository(db, { now: () => now })
  const run = (action: Record<string, unknown>) => repo.execute({ operationId: randomUUID(), generation: repo.store.workspace().generation, ...action })
  run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-07-01' }, confirmed: true })
  const item = (id: string) => repo.store.item(id)
  const create = (title: string, horizon: string, extra = {}) => run({ type: 'create', title, horizon, ...extra }).itemId!
  const goal = create('Quarter goal', 'cycle', { flowColor: 0 })
  const root = create('Parent task', 'week', { parentId: goal, expectedParentVersion: item(goal).version })
  const leaf = create('Independent source', 'month', { flowColor: 1, description: 'Saved notes', dueDate: '2026-10-31' })
  const nest = (child = leaf, parent = root) => run({ type: 'nest', itemId: child, parentId: parent, expectedVersion: item(child).version, expectedParentVersion: item(parent).version,
    expectedPlacementVersion: item(child).placement.version, expectedParentPlacementVersion: item(parent).placement.version })
  const unnest = (child = leaf) => run({ type: 'unnest', itemId: child, expectedVersion: item(child).version, expectedPlacementVersion: item(child).placement.version })
  const move = (id: string, horizon: string, extra = {}) => run({ type: 'move', itemId: id, horizon, expectedVersion: item(id).version, expectedPlacementVersion: item(id).placement.version, ...extra })
  const status = (id: string, value: string) => run({ type: 'status', itemId: id, expectedVersion: item(id).version, status: value })
  const undo = (id: string) => run({ type: 'undo', originalOperationId: id })
  const data = () => exportDataset(repo.store, now)
  const rejected = (action: () => unknown) => { const before = JSON.stringify(data()); assert.throws(action); assert.equal(JSON.stringify(data()), before) }
  const flows = (id: string) => { const s = repo.snapshot(); return flowIndex(combinedTopology(s.relations, s.nesting ?? []), s.flows.map(flow => flow.id))(id) }
  return { db, repo, run, item, create, goal, root, leaf, nest, unnest, move, status, undo, data, rejected, flows, now: () => now, time: (next: string) => { now = next } }
}
{
  const w = world(), original = structuredClone(w.item(w.leaf))
  const secondGoal = w.create('Month goal', 'month', { flowColor: 2 })
  const lower = w.create('Existing lower', 'week', { parentId: w.leaf, expectedParentVersion: w.item(w.leaf).version })
  const n = w.nest()
  assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
  assert.equal(w.item(w.leaf).placement.periodId, w.item(w.root).placement.periodId)
  for (const key of ['title', 'description', 'dueDate', 'status', 'completedAt'] as const) assert.equal(w.item(w.leaf)[key], original[key])
  assert.deepEqual(w.flows(w.leaf), [w.goal]); assert.deepEqual(w.flows(lower), [w.goal])
  assert(w.repo.snapshot().relations.some(edge => edge.parentId === w.goal && edge.childId === w.leaf && edge.inheritedFrom?.rootId === w.root))
  w.run({ type: 'link', parentId: secondGoal, childId: w.root, expectedParentVersion: w.item(secondGoal).version, expectedChildVersion: w.item(w.root).version })
  assert.deepEqual(new Set(w.flows(w.leaf)), new Set([w.goal, secondGoal]))
  w.run({ type: 'flowColor', itemId: w.goal, expectedVersion: w.item(w.goal).version, flowColor: 3 })
  assert(w.repo.snapshot().flows.some(flow => flow.id === w.goal && flow.flowColor === 3))
  w.rejected(() => w.nest(w.root, secondGoal)); w.rejected(() => w.nest(lower, w.leaf)); w.rejected(() => w.nest(w.leaf, w.leaf))
  w.rejected(() => w.run({ type: 'flowColor', itemId: w.leaf, expectedVersion: w.item(w.leaf).version, flowColor: 4 }))
  const directLower = w.create('Direct child', 'day', { parentId: w.leaf, expectedParentVersion: w.item(w.leaf).version })
  w.move(directLower, 'cycle')
  w.rejected(() => w.run({ type: 'link', parentId: directLower, childId: w.root, expectedParentVersion: w.item(directLower).version, expectedChildVersion: w.item(w.root).version }))
  validateImport(w.data(), w.now())
  const bad = structuredClone(w.data()); bad.placements.find(p => p.itemId === w.root)!.nestingParentId = w.leaf
  assert.throws(() => validateImport(bad, w.now()))
  const u = w.unnest()
  assert.equal(w.item(w.leaf).placement.nestingParentId, null)
  assert.deepEqual(new Set(w.flows(w.leaf)), new Set([w.goal, secondGoal]))
  assert.equal(w.undo(u.operationId).outcome, 'committed')
  assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
  assert.equal(w.undo(n.operationId).outcome, 'committed')
  assert.equal(w.item(w.leaf).flowColor, 1)
  assert.equal(w.item(w.leaf).placement.horizon, 'month')
  validateImport(w.data(), w.now()); verifyDatabase(w.db); w.db.close()
  checks.push('Cross-horizon nesting, complete details, existing/outgoing links, live multi-parent/color inheritance, third-level/self/mixed-cycle rejection, provenance and undo')
}
{
  const w = world(); const n = w.nest()
  w.run({ type: 'edit', itemId: w.leaf, expectedVersion: w.item(w.leaf).version, title: 'Edited later', description: 'Keep later notes', dueDate: '2026-11-01' })
  w.status(w.leaf, 'done')
  assert.equal(w.undo(n.operationId).outcome, 'committed')
  assert.equal(w.item(w.leaf).title, 'Edited later'); assert.equal(w.item(w.leaf).status, 'done')
  assert.equal(w.item(w.leaf).flowColor, 1); validateImport(w.data(), w.now()); w.db.close()
  checks.push('Undo preserves later content, deadline, status and increasing versions')
}
{
  const w = world(); const second = w.create('Second nested', 'day')
  w.nest(); w.nest(second); w.status(w.root, 'done')
  const completedAt = w.item(w.root).completedAt
  const moved = w.move(w.root, 'day')
  for (const id of [w.root, w.leaf, second]) assert.equal(w.item(id).placement.horizon, 'day')
  assert.equal(w.item(w.root).completedAt, completedAt)
  assert.equal(w.undo(moved.operationId).outcome, 'committed')
  assert.equal(w.item(w.leaf).placement.horizon, 'week')
  validateImport(w.data(), w.now())
  const deleted = w.run({ type: 'delete', itemId: w.root, expectedVersion: w.item(w.root).version })
  for (const id of [w.leaf, second]) { assert.equal(w.item(id).deletedAt, null); assert.equal(w.item(id).placement.nestingParentId, null); assert.deepEqual(w.flows(id), [w.goal]) }
  validateImport(w.data(), w.now())
  assert.equal(w.undo(deleted.operationId).outcome, 'committed')
  for (const id of [w.leaf, second]) assert.equal(w.item(id).placement.nestingParentId, w.root)
  const deletion = w.run({ type: 'delete', itemId: w.root, expectedVersion: w.item(w.root).version })
  assert(deletion.changed)
  w.move(w.leaf, 'day')
  w.run({ type: 'restoreItem', itemId: w.root, expectedVersion: w.item(w.root).version })
  assert.equal(w.item(w.leaf).placement.nestingParentId, null)
  validateImport(w.data(), w.now()); w.db.close()
  checks.push('Mixed statuses, atomic group move/undo, independent root deletion, inherited-parent materialization and non-stealing restore')
  const childWorld = world(); childWorld.nest()
  childWorld.run({ type: 'delete', itemId: childWorld.leaf, expectedVersion: childWorld.item(childWorld.leaf).version })
  const restoredChild = childWorld.run({ type: 'restoreItem', itemId: childWorld.leaf, expectedVersion: childWorld.item(childWorld.leaf).version })
  assert.equal(childWorld.item(childWorld.leaf).placement.nestingParentId, childWorld.root)
  validateImport(childWorld.data(), childWorld.now())
  assert.equal(childWorld.undo(restoredChild.operationId).outcome, 'committed')
  assert(childWorld.item(childWorld.leaf).deletedAt)
  validateImport(childWorld.data(), childWorld.now()); childWorld.db.close()
  checks.push('Leaf undelete safely restores its unchanged container, and its composite undo remains import-valid')
}
{
  const w = world(); w.nest(); w.status(w.root, 'done')
  const policy = w.repo.store.policies().find(p => p.horizon === 'week')!
  w.run({ type: 'policy', horizon: 'week', mode: 'auto', expectedVersion: policy.version })
  const prior = w.item(w.leaf).placement.periodId
  w.time('2026-10-12T12:00:00.000Z'); assert(reconcile(w.repo))
  assert.notEqual(w.item(w.root).placement.periodId, prior)
  assert.equal(w.item(w.leaf).placement.periodId, w.item(w.root).placement.periodId)
  validateImport(w.data(), w.now()); w.db.close()
  const hold = world(); hold.nest(); hold.status(hold.root, 'done')
  const holdPrior = hold.item(hold.root).placement.periodId
  const moved = hold.move(hold.root, 'week', { period: { kind: 'next' } })
  hold.time('2026-10-12T12:00:00.000Z')
  assert.equal(hold.undo(moved.operationId).outcome, 'committed')
  assert(hold.item(hold.leaf).placement.holdPeriodId)
  hold.run({ type: 'policy', horizon: 'week', mode: 'auto', expectedVersion: 1 })
  assert.equal(reconcile(hold.repo), null)
  assert.equal(hold.item(hold.root).placement.periodId, holdPrior)
  validateImport(hold.data(), hold.now()); hold.db.close()
  checks.push('Completed parent follows open child through automatic rollover; one expired-member undo hold blocks the complete group')
}
{
  const directory = mkdtempSync(join(tmpdir(), 'goalloom-subtasks-data-'))
  try {
    const path = join(directory, 'source.sqlite'), w = world(path); w.nest()
    const n = w.data(), restored = world(); replaceDataset(restored.repo.store, validateImport(n, w.now()), 'restore', w.now())
    assert.equal(restored.item(w.leaf).placement.nestingParentId, w.root); restored.db.close()
    w.db.close()
    const sqlite = await readSqliteDataset(path, w.now())
    assert.equal(sqlite.schemaVersion, schemaVersion)
    assert.equal(sqlite.placements.find(p => p.itemId === w.leaf)!.nestingParentId, w.root)
    const reopened = openDatabase(path), repo = new Repository(reopened, { now: w.now })
    assert.equal(repo.store.item(w.leaf).placement.nestingParentId, w.root); reopened.close()
    const legacyPath = join(directory, 'legacy.sqlite'), legacy = world(legacyPath)
    const triggers = legacy.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all()
    for (const trigger of triggers) legacy.db.exec(`DROP TRIGGER ${trigger.name}`)
    legacy.db.exec('DROP INDEX IF EXISTS placements_nesting; ALTER TABLE item_placements DROP COLUMN nestingParentId')
    for (const trigger of triggers) {
      const name = String(trigger.name), sql = String(trigger.sql)
      if (name.startsWith('base_') || name.includes('nesting_guard') || sql.includes('nestingParentId')) continue
      legacy.db.exec(sql)
    }
    // v8 and Phase 0 v9 now upgrade in place. v7 still stays read-only until the explicit protective-copy commit.
    legacy.db.exec('PRAGMA user_version=7')
    legacy.db.close()
    await assert.rejects(() => openWorkspace(legacyPath, join(directory, 'backups'), w.now), /./)
    const original = readFileSync(legacyPath)
    const upgrade = new StartupUpgrade(legacyPath, join(directory, 'backups'), w.now)
    const prepared = await upgrade.prepare()
    assert.equal(prepared.version, 7); assert(prepared.backupPath)
    assert.deepEqual(readFileSync(legacyPath), original)
    await upgrade.commit(prepared.token)
    const upgraded = await readSqliteDataset(legacyPath, w.now())
    assert.equal(upgraded.schemaVersion, schemaVersion)
    assert(upgraded.placements.every(p => !p.nestingParentId))
    checks.push('Validated JSON/SQLite round trips, restart, pre-v8 read-only startup, verified protective backup and explicit upgrade commit')
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
{
  const w = world(), other = w.create('Other parent', 'week', { parentId: w.goal, expectedParentVersion: w.item(w.goal).version })
  const otherChild = w.create('Other child', 'month')
  w.nest(); w.nest(otherChild, other)
  const first = w.create('First daily child', 'day', { parentId: w.leaf, expectedParentVersion: w.item(w.leaf).version })
  const second = w.create('Second daily child', 'day', { parentId: otherChild, expectedParentVersion: w.item(otherChild).version })
  const order = () => { const s = w.repo.snapshot(); return buildParentOrder(s.orderNodes, s.relations, s.observedAt).sort(s.items.filter(item => item.placement.horizon === 'day')).map(item => item.id) }
  assert.deepEqual(order(), [first, second])
  w.move(other, 'week', { beforeId: w.root })
  assert.deepEqual(order(), [second, first])
  const grouped = w.move(otherChild, 'day', { group: true })
  assert.equal(w.item(other).placement.horizon, 'day'); assert.equal(w.item(otherChild).placement.horizon, 'day')
  assert.equal(w.undo(grouped.operationId).outcome, 'committed')
  const bad = structuredClone(w.data()), operation = bad.operations.find(operation => operation.id === grouped.operationId)!
  const childEffect = operation.effects.find(effect => effect.kind === 'groupPlacement')!
  if (childEffect.kind === 'groupPlacement') childEffect.after.nestingParentId = w.root
  assert.throws(() => validateImport(bad, w.now()))
  validateImport(w.data(), w.now()); w.db.close()
  checks.push('Outline-aware downstream parent ordering, review-style group moves, one-step undo and forged group-ownership rejection')
}
{
  const w = world(), container = w.create('Colored container', 'week', { flowColor: 2 })
  w.nest(w.leaf, container); assert.deepEqual(w.flows(w.leaf), [container])
  const detached = w.unnest(); assert.deepEqual(w.flows(w.leaf), []); assert.equal(w.item(w.leaf).flowColor, null)
  assert.equal(w.undo(detached.operationId).outcome, 'committed')
  const moved = w.move(container, 'later'); assert.equal(w.item(w.leaf).placement.horizon, 'later')
  assert.equal(w.undo(moved.operationId).outcome, 'committed')
  validateImport(w.data(), w.now()); w.db.close()
  checks.push('Colored containers without upper goals, colorless detach, complete Later group movement and restoration')
}
{
  const w = world(), source = w.item(w.leaf), parent = w.item(w.root)
  const command = { type: 'nest', operationId: randomUUID(), itemId: source.id, parentId: parent.id, expectedVersion: source.version,
    expectedParentVersion: parent.version, expectedPlacementVersion: source.placement.version, expectedParentPlacementVersion: parent.placement.version }
  const saved = w.run(command); assert.deepEqual(w.run(command), saved)
  w.rejected(() => w.run({ ...command, operationId: randomUUID() }))
  w.create('Occupied original color', 'cycle', { flowColor: 1 })
  const before = w.data(), skipped = w.undo(saved.operationId), after = w.data()
  assert.equal(skipped.outcome, 'conflict_skipped')
  for (const key of ['items', 'placements', 'relations', 'events', 'undoEffects'] as const) assert.deepEqual(after[key], before[key])
  validateImport(after, w.now()); w.db.close()
  checks.push('Idempotent nest receipts, stale-frame rejection and definitive color-conflict undo without partial changes')
}
{
  const w = world(); w.nest()
  for (let index = 0; index < 10; index++) {
    const id = w.create(`Completed outgoing ${index}`, 'day', { parentId: w.leaf, expectedParentVersion: w.item(w.leaf).version })
    w.status(id, 'done')
  }
  const query = { type: 'assistanceContext' as const, generation: w.repo.store.workspace().generation, itemId: w.leaf }
  const context = readAssistanceContext(w.repo.store, w.repo.execution, query, w.now())
  assert.deepEqual(context.parents.map(parent => parent.id), [w.goal]); assert.deepEqual(context.children, [])
  assert(!context.truncatedSections.includes('children')); assert(context.guard.dependencies.some(dependency => dependency.itemId === w.root))
  validateImport(w.data(), w.now()); w.db.close()
  checks.push('AI context uses inherited goals and container guards while completed outgoing tasks do not inflate visible omissions')
}
{
  const w = world()
  for (const horizon of ['month', 'half']) {
    const goal = w.create(`Additional ${horizon} goal`, horizon, { flowColor: horizon === 'month' ? 2 : 3 })
    w.run({ type: 'link', parentId: goal, childId: w.root, expectedParentVersion: w.item(goal).version, expectedChildVersion: w.item(w.root).version })
  }
  w.nest(); w.status(w.root, 'done')
  for (let index = 0; index < 8; index++) {
    w.create(`AI visible outgoing ${index}`, 'day', { parentId: w.leaf, expectedParentVersion: w.item(w.leaf).version })
    w.create(`AI visible sibling ${index}`, 'week', { parentId: w.goal, expectedParentVersion: w.item(w.goal).version })
  }
  const context = readAssistanceContext(w.repo.store, w.repo.execution, { type: 'assistanceContext', generation: w.repo.store.workspace().generation, itemId: w.leaf }, w.now())
  assistanceContextSchema.parse(context)
  assert(context.guard.dependencies.some(dependency => dependency.itemId === w.root))
  assert.equal(new Set(context.guard.dependencies.map(dependency => dependency.itemId)).size, context.guard.dependencies.length)
  assert.equal(context.omitted.siblings, 1)
  validateImport(w.data(), w.now()); w.db.close()
  checks.push('A full AI context reserves the hidden container dependency, deduplicates guards and reports bounded sibling omissions')
}
{
  const w = world(), parent = w.create('Title-only container', 'later'), child = w.create('Title-only child', 'later')
  w.nest(child, parent)
  for (const id of [parent, child]) w.rejected(() => w.run({ type: 'discardEmpty', itemId: id, expectedVersion: w.item(id).version }))
  validateImport(w.data(), w.now()); w.db.close()
  checks.push('Clearing a title cannot silently discard an outline dependency')
}
{
  const w = world(), future = w.create('Future container', 'week', { period: { kind: 'date', startDate: '2026-10-12' } }), sibling = w.create('Future sibling', 'day')
  w.nest(); w.nest(w.leaf, future); w.nest(sibling, future)
  assert.equal(w.item(w.leaf).placement.periodId, w.item(future).placement.periodId)
  const reordered = w.move(sibling, 'week', { period: { kind: 'date', startDate: w.repo.store.period(w.item(future).placement.periodId!).startDate }, beforeId: w.leaf, keepNesting: true })
  assert.deepEqual(w.repo.store.nestedItems(future).sort((a, b) => a.placement.sortKey - b.placement.sortKey).map(item => item.id), [sibling, w.leaf])
  assert.equal(w.undo(reordered.operationId).outcome, 'committed')
  assert.equal(w.item(sibling).placement.nestingParentId, future)
  w.move(w.leaf, 'day'); assert.equal(w.item(w.leaf).placement.nestingParentId, null)
  const source = w.item(w.leaf), target = w.item(future)
  w.move(future, 'month')
  w.rejected(() => w.run({ type: 'nest', itemId: source.id, parentId: target.id, expectedVersion: source.version, expectedParentVersion: target.version,
    expectedPlacementVersion: source.placement.version, expectedParentPlacementVersion: target.placement.version }))
  w.time('2027-01-01T12:00:00.000Z'); w.rejected(() => w.nest(w.leaf, future))
  validateImport(w.data(), w.now()); w.db.close()
  checks.push('Cross-period reparenting, stable within-group ordering/undo, independent departure and stale/expired target rejection')
}
{
  for (const mutation of ['color', 'parent']) {
    const w = world(), container = mutation === 'color' ? w.create('Independent colored container', 'week', { flowColor: 2 }) : w.root
    w.nest(w.leaf, container)
    const detached = w.unnest()
    if (mutation === 'color') w.run({ type: 'flowColor', itemId: w.leaf, expectedVersion: w.item(w.leaf).version, flowColor: 4 })
    else {
      const goal = w.create('New upper goal', 'month', { flowColor: 3 })
      w.run({ type: 'link', parentId: goal, childId: w.leaf, expectedParentVersion: w.item(goal).version, expectedChildVersion: w.item(w.leaf).version })
    }
    const before = w.data(), result = w.undo(detached.operationId), after = w.data()
    assert.equal(result.outcome, 'conflict_skipped')
    for (const key of ['items', 'placements', 'relations', 'events', 'undoEffects'] as const) assert.deepEqual(after[key], before[key])
    validateImport(after, w.now()); w.db.close()
  }
  checks.push('Undoing departure after new standalone colors/goal parents is a definitive conflict without modifying business data')
}
{
  const w = world(); w.nest(); w.unnest()
  const source = w.repo.store.relations().find(edge => edge.childId === w.root)!
  const unlink = w.run({ type: 'unlink', relationId: source.id, expectedParentVersion: w.item(source.parentId).version, expectedChildVersion: w.item(w.root).version })
  const bad = structuredClone(w.data()), index = bad.operations.findIndex(operation => operation.kind === 'unnest')
  const operation = bad.operations.splice(bad.operations.findIndex(operation => operation.id === unlink.operationId), 1)[0]!
  bad.operations.splice(index, 0, operation)
  assert.throws(() => validateImport(bad, w.now()))
  validateImport(w.data(), w.now()); w.db.close()
  checks.push('Inherited-source state is verified in commit order; a forged active source is rejected')
}
writeFileSync(process.argv[2]!, JSON.stringify({ passed: true, checks, runtime: process.versions }, null, 2))

}
void main().catch(error => { console.error(error); process.exitCode = 1 })
