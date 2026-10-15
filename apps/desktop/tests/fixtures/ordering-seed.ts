/**
 * [INPUT]: Isolated profile/evidence paths, production Repository/SQLite and an injected clock.
 * [OUTPUT]: Automatic-placement, scoped-sort, atomic undo/rollback/replay and sync evidence plus a native board fixture.
 * [POS]: Ordering transaction acceptance; recorded failure cases precede implementation in board-ordering.md.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Temporal } from '../../src/domain/temporal'
import { currentPeriod } from '../../src/domain/calendar'
import { buildParentOrder } from '../../src/domain/parent-order'
import { validateImport } from '../../src/domain/import-validation'
import { openDatabase, verifyDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { exportDataset, replaceDataset } from '../../src/main/workspace/transfer/dataset'

const checks: string[] = []
function workspace(now: string, path = ':memory:') {
  const db = openDatabase(path); migrate(db)
  const clock = { now }, repo = new Repository(db, { now: () => clock.now })
  const generation = repo.store.workspace().generation
  const run = (action: Record<string, unknown>) => repo.execute({ generation, operationId: randomUUID(), ...action })
  run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: `${now.slice(0, 4)}-01-01` }, confirmed: true })
  const create = (title: string, horizon = 'month', parentId?: string, extra = {}) => run({ type: 'create', title, horizon, ...(parentId ? { parentId, expectedParentVersion: repo.store.item(parentId).version } : {}), ...extra }).itemId!
  const move = (id: string, beforeId: string | null, extra = {}) => {
    const item = repo.store.item(id)
    return run({ type: 'move', itemId: id, horizon: item.placement.horizon, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, beforeId, ...extra })
  }
  const link = (parentId: string, childId: string, extra = {}) => run({ type: 'link', parentId, childId, expectedParentVersion: repo.store.item(parentId).version, expectedChildVersion: repo.store.item(childId).version, ...extra })
  const unlink = (parentId: string, childId: string) => run({ type: 'unlink', relationId: repo.store.relations().find(edge => edge.parentId === parentId && edge.childId === childId)!.id, expectedParentVersion: repo.store.item(parentId).version, expectedChildVersion: repo.store.item(childId).version, autoPlace: true })
  const raw = (horizon = 'month', periodId?: string) => repo.store.items(`i.deletedAt IS NULL AND p.horizon=?${periodId ? ' AND p.periodId=?' : ''}`, periodId ? [horizon, periodId] : [horizon]).map(item => item.title)
  const sort = (horizon = 'month', startDate = repo.snapshot().periods.find(period => period.horizon === horizon)!.startDate, extra = {}) => run({ type: 'materializeParentOrder', horizon, period: { kind: 'date', startDate }, ...extra })
  const rejected = (action: () => unknown) => { const before = exportDataset(repo.store, clock.now); assert.throws(action); assert.deepEqual(exportDataset(repo.store, clock.now), before) }
  return { db, repo, clock, generation, run, create, move, link, unlink, raw, sort, rejected }
}
{
  const w = workspace('2026-10-15T12:00:00Z')
  const a = w.create('Flow A', 'cycle', undefined, { flowColor: 0 }), b = w.create('Flow B', 'cycle', undefined, { flowColor: 1 })
  const a1 = w.create('A1', 'month', a), b1 = w.create('B1', 'month', b), a2 = w.create('A2', 'month', a)
  w.move(a1, null)
  const before = w.raw(), placements = [a1, b1, a2].map(id => w.repo.store.item(id).placement)
  const a3 = w.create('A3', 'month', a, { autoPlace: true })
  assert.deepEqual(w.raw(), [...before, 'A3'])
  assert.deepEqual([a1, b1, a2].map(id => w.repo.store.item(id).placement), placements)
  w.move(a1, b1)
  const b2 = w.create('B2', 'month', b, { autoPlace: true })
  assert.deepEqual(w.raw(), ['A1', 'B1', 'B2', 'A2', 'A3'])
  w.create('Explicit first', 'month', a, { autoPlace: true, beforeId: a1 })
  w.create('Explicit tail', 'month', b, { autoPlace: true, beforeId: null })
  assert.equal(w.raw()[0], 'Explicit first'); assert.equal(w.raw().at(-1), 'Explicit tail')
  w.create('No parent', 'month', undefined, { autoPlace: true }); assert.equal(w.raw().at(-1), 'No parent')
  const oldOrder = w.raw(), snapshot = w.repo.snapshot()
  const operationId = randomUUID(), result = w.sort('month', undefined, { operationId })
  assert.deepEqual(w.raw(), ['Explicit first', 'A1', 'A2', 'A3', 'B1', 'B2', 'Explicit tail', 'No parent'])
  assert.deepEqual(w.repo.snapshot().relations, snapshot.relations)
  assert.deepEqual(w.sort('month', undefined, { operationId }), result)
  const edited = w.repo.store.item(b2)
  w.run({ type: 'edit', itemId: b2, expectedVersion: edited.version, title: edited.title, description: 'Keep later text', dueDate: null })
  assert.equal(w.run({ type: 'undo', originalOperationId: result.operationId }).outcome, 'committed')
  assert.deepEqual(w.raw(), oldOrder); assert.equal(w.repo.store.item(b2).description, 'Keep later text')
  w.rejected(() => w.move(a3, b1, { expectedPlacementVersion: 999 }))
  verifyDatabase(w.db); w.db.close()
  checks.push('Local creation preserves other placements, dispersed peers and explicit before/tail positions; scoped sort replays and undo preserves later text')
}
{
  const w = workspace('2026-10-15T12:00:00Z')
  const a = w.create('A', 'cycle', undefined, { flowColor: 0 }), b = w.create('B', 'cycle', undefined, { flowColor: 1 })
  const a1 = w.create('A1', 'month', a), b1 = w.create('B1', 'month', b), loose = w.create('Loose')
  const original = w.raw(), other = [a1, b1].map(id => w.repo.store.item(id).placement)
  const linked = w.link(a, loose, { autoPlace: true })
  assert.deepEqual(w.raw(), ['A1', 'Loose', 'B1'])
  assert.deepEqual([a1, b1].map(id => w.repo.store.item(id).placement), other)
  assert.deepEqual(w.repo.store.operation(linked.operationId)!.effects.map(effect => effect.kind), ['relations', 'position'])
  const payload = JSON.parse(String(w.db.prepare('SELECT payload FROM sync_ops WHERE opId=?').get(linked.operationId)!.payload))
  assert(payload.actions.some((action: { t: string }) => action.t === 'rel.link') && payload.actions.some((action: { t: string }) => action.t === 'item.place'))
  const valid = validateImport(exportDataset(w.repo.store, w.clock.now), w.clock.now)
  const restored = workspace(w.clock.now)
  replaceDataset(restored.repo.store, valid, 'restore', w.clock.now)
  assert.deepEqual(restored.raw(), w.raw()); restored.db.close()
  for (const mutate of [
    (data: typeof valid) => { const op = data.operations.find(op => op.id === linked.operationId)!; op.effects[1]!.itemId = b1 },
    (data: typeof valid) => { const effect = data.operations.find(op => op.id === linked.operationId)!.effects[1]!; if (effect.kind === 'position') effect.after.horizon = 'week' },
  ]) { const forged = structuredClone(valid); mutate(forged); assert.throws(() => validateImport(forged, w.clock.now)) }
  assert.equal(w.run({ type: 'undo', originalOperationId: linked.operationId }).outcome, 'committed')
  assert.deepEqual(w.raw(), original); assert(!w.repo.store.relations().some(edge => edge.childId === loose))
  const undone = validateImport(exportDataset(w.repo.store, w.clock.now), w.clock.now)
  const partial = structuredClone(undone); partial.undoEffects = partial.undoEffects.filter(marker => marker.originalId !== linked.operationId || marker.effectIndex === 0)
  assert.throws(() => validateImport(partial, w.clock.now))
  w.link(a, loose, { autoPlace: true }); w.move(loose, null)
  const position = w.repo.store.item(loose).placement
  const secondary = w.link(b, loose, { autoPlace: true })
  assert.deepEqual(w.repo.store.item(loose).placement, position, 'A secondary parent must not reset the manually chosen slot')
  const changed = w.unlink(a, loose)
  assert.deepEqual(w.raw(), ['A1', 'B1', 'Loose'])
  assert.equal(w.run({ type: 'undo', originalOperationId: changed.operationId }).outcome, 'committed')
  assert.equal(w.run({ type: 'undo', originalOperationId: secondary.operationId }).outcome, 'committed')
  w.move(loose, b1)
  const unlink = w.unlink(a, loose)
  assert.equal(w.raw().at(-1), 'Loose')
  assert.equal(w.run({ type: 'undo', originalOperationId: unlink.operationId }).outcome, 'committed')
  assert.deepEqual(w.raw(), ['A1', 'Loose', 'B1'])
  w.unlink(a, loose)
  const before = exportDataset(w.repo.store, w.clock.now)
  w.db.exec(`CREATE TEMP TRIGGER reject_place BEFORE UPDATE OF sortKey ON item_placements WHEN NEW.itemId='${loose}' BEGIN SELECT RAISE(ABORT, 'Injected placement failure'); END`)
  w.rejected(() => w.link(a, loose, { autoPlace: true }))
  assert.deepEqual(exportDataset(w.repo.store, w.clock.now), before)
  w.db.exec('DROP TRIGGER reject_place')
  validateImport(exportDataset(w.repo.store, w.clock.now), w.clock.now)
  verifyDatabase(w.db); w.db.close()
  checks.push('Effective-parent changes move only the affected root; secondary links preserve manual order; link/unlink position effects, sync, rollback and undo remain atomic')
}
{
  const w = workspace('2026-10-15T12:00:00Z')
  const root = w.create('Root', 'cycle', undefined, { flowColor: 0 })
  const late = w.create('Late parent', 'month', root), early = w.create('Early parent', 'month', root)
  w.move(early, late)
  const d1 = w.create('Late child', 'week', late), d2 = w.create('Early child', 'week', early)
  w.sort('week'); assert.deepEqual(w.raw('week'), ['Early child', 'Late child'])
  const childOrder = w.raw('week'); w.move(early, null)
  assert.deepEqual(w.raw('week'), childOrder, 'Parent moves must not cascade into manually ordered child columns')
  w.sort('week'); assert.deepEqual(w.raw('week'), ['Late child', 'Early child'])
  const future = currentPeriod(w.repo.snapshot().workspace.calendar!, 'month', w.repo.snapshot().periods.find(period => period.horizon === 'month')!.endAt)
  w.create('Future loose', 'month', undefined, { period: { kind: 'date', startDate: future.startDate } })
  w.create('Future linked', 'month', root, { period: { kind: 'date', startDate: future.startDate }, autoPlace: true })
  assert.deepEqual(w.raw('month', future.id), ['Future linked', 'Future loose'])
  const futureBefore = w.repo.store.items('p.periodId=?', [future.id]).map(item => item.placement)
  w.sort('month')
  assert.deepEqual(w.repo.store.items('p.periodId=?', [future.id]).map(item => item.placement), futureBefore)
  w.sort('month', future.startDate)
  w.rejected(() => w.sort('month', '2026-09-01'))
  w.repo.maintenance = true; w.rejected(() => w.sort()); w.repo.maintenance = false
  w.rejected(() => w.sort('month', undefined, { generation: 'replaced-generation' }))
  assert.equal(buildParentOrder(w.repo.snapshot().orderNodes, w.repo.snapshot().relations, w.clock.now).group(d1), late)
  assert.equal(buildParentOrder(w.repo.snapshot().orderNodes, w.repo.snapshot().relations, w.clock.now).group(d2), early)
  verifyDatabase(w.db); w.db.close()
  checks.push('Stored parent order controls placement without cascading; one-shot sorting is limited to one current/future period and rejects history/maintenance/generation changes')
}
{
  const w = workspace('2026-10-15T12:00:00Z')
  const a = w.create('A', 'cycle', undefined, { flowColor: 0 }), b = w.create('B', 'cycle', undefined, { flowColor: 1 })
  const a1 = w.create('A1', 'month', a), b1 = w.create('B1', 'month', b), child = w.create('Nested child')
  const source = w.repo.store.item(child), parent = w.repo.store.item(a1)
  w.run({ type: 'nest', itemId: child, parentId: a1, expectedVersion: source.version, expectedParentVersion: parent.version, expectedPlacementVersion: source.placement.version, expectedParentPlacementVersion: parent.placement.version })
  const order = w.raw(), period = w.repo.snapshot().periods.find(period => period.horizon === 'month')!
  const batch = w.run({ type: 'createPlan', autoPlace: true, items: [a, b].map((id, index) => ({ draftId: `draft-${index}`, title: `Plan ${index}`, horizon: 'month', previewPeriodId: period.id, parentRefs: [{ kind: 'existing', itemId: id, expectedVersion: w.repo.store.item(id).version }] })) })
  assert.deepEqual(w.raw().filter(title => !title.startsWith('Plan ')), order)
  assert(w.raw().indexOf('Plan 0') < w.raw().indexOf('B1'))
  assert.equal(w.run({ type: 'undo', originalOperationId: batch.operationId }).outcome, 'committed'); assert.deepEqual(w.raw(), order)
  w.move(a1, null)
  assert.equal(w.repo.store.item(child).placement.nestingParentId, a1)
  const sorted = w.sort(); assert(w.raw().indexOf('A1') < w.raw().indexOf('B1'))
  assert.equal(w.repo.store.item(child).placement.nestingParentId, a1)
  assert.equal(w.run({ type: 'undo', originalOperationId: sorted.operationId }).outcome, 'committed')
  assert.equal(w.repo.store.item(child).placement.nestingParentId, a1)
  assert.equal(w.repo.store.item(b1).status, 'todo')
  verifyDatabase(w.db); w.db.close()
  checks.push('Atomic plan placement changes new rows only and undo removes the complete batch; manual/scoped sorting preserves nested membership and independent lifecycle')
}
const now = Temporal.Now.instant().toString(), w = workspace(now, join(process.argv[2]!, 'workspace.sqlite'))
const ids: Record<string, string> = {}
for (const [index, name] of ['A', 'B'].entries()) ids[name] = w.create(`Flow ${name}`, 'cycle', undefined, { flowColor: index })
for (const [title, parent] of [['A1', 'A'], ['B1', 'B'], ['A2', 'A']] as const) ids[title] = w.create(title, 'month', ids[parent])
ids.loose = w.create('Unlinked')
const report = { checks, runtime: { electron: process.versions.electron, node: process.versions.node, sqlite: w.db.prepare('SELECT sqlite_version() AS version').get()!.version } }
writeFileSync(process.argv[3]!, JSON.stringify(report, null, 2))
writeFileSync(join(process.argv[2]!, 'ordering-fixture.json'), JSON.stringify({ ids, report }))
verifyDatabase(w.db); w.db.close()
