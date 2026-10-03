/**
 * [INPUT]: Isolated profile and evidence paths, production Repository/SQLite and an injected clock.
 * [OUTPUT]: Ordering transaction evidence and a real workspace for the Electron journey.
 * [POS]: Desktop fixture; failure cases were recorded in docs/features/board-ordering.md before implementation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Temporal } from '../../../src/domain/temporal'
import { currentPeriod } from '../../../src/domain/calendar'
import { buildParentOrder } from '../../../src/domain/parent-order'
import { validateImport } from '../../../src/domain/import-validation'
import { openDatabase, verifyDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'
import { readBoardPeriods } from '../../../src/main/workspace/periods'
import { exportDataset, replaceDataset } from '../../../src/main/workspace/transfer/dataset'

const checks: string[] = []
function workspace(now: string, path = ':memory:') {
  const db = openDatabase(path); migrate(db)
  const clock = { now }, repo = new Repository(db, { now: () => clock.now })
  const generation = repo.store.workspace().generation
  const run = (action: Record<string, unknown>) => repo.execute({ generation, operationId: randomUUID(), ...action })
  run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: `${now.slice(0, 4)}-01-01` }, confirmed: true })
  const create = (title: string, horizon: string, parentId?: string, extra = {}) => run({ type: 'create', title, horizon, ...(parentId ? { parentId, expectedParentVersion: repo.store.item(parentId).version } : {}), ...extra }).itemId!
  const move = (id: string, beforeId: string | null, extra = {}) => {
    const item = repo.store.item(id)
    return run({ type: 'move', itemId: id, horizon: item.placement.horizon, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, beforeId, ...extra })
  }
  const link = (parentId: string, childId: string) => run({ type: 'link', parentId, childId, expectedParentVersion: repo.store.item(parentId).version, expectedChildVersion: repo.store.item(childId).version })
  const raw = (horizon: string) => repo.snapshot().items.filter(item => item.placement.horizon === horizon).map(item => item.title)
  const sorted = (horizon: string) => { const s = repo.snapshot(); return buildParentOrder(s.orderNodes, s.relations, s.observedAt).sort(s.items.filter(item => item.placement.horizon === horizon)).map(item => item.title) }
  const rejected = (action: () => unknown) => { const before = exportDataset(repo.store, clock.now); assert.throws(action); assert.deepEqual(exportDataset(repo.store, clock.now), before) }
  return { db, repo, clock, generation, run, create, move, link, raw, sorted, rejected }
}
function seed(w: ReturnType<typeof workspace>) {
  const ids: Record<string, string> = {}
  for (const [index, name] of ['A', 'B', 'C'].entries()) ids[name] = w.create(name, 'cycle', undefined, { flowColor: index })
  for (const name of ['A', 'C', 'B']) ids[`${name}1`] = w.create(`${name}1`, 'month', ids[name])
  for (const name of ['C', 'B', 'A']) ids[`${name}w`] = w.create(`${name}w`, 'week', ids[`${name}1`])
  for (const name of ['B', 'C', 'A']) ids[`${name}d`] = w.create(`${name}d`, 'day', ids[`${name}w`])
  return ids
}

{
  const w = workspace('2026-09-15T12:00:00Z'), ids = seed(w)
  const before = exportDataset(w.repo.store, w.clock.now)
  assert.deepEqual(w.raw('month'), ['A1', 'C1', 'B1'])
  assert.deepEqual(w.sorted('month'), ['A1', 'B1', 'C1'])
  assert.deepEqual(w.sorted('week'), ['Aw', 'Bw', 'Cw'])
  assert.deepEqual(w.sorted('day'), ['Ad', 'Bd', 'Cd'])
  assert.deepEqual(exportDataset(w.repo.store, w.clock.now), before, 'Projection never writes')
  const multi = w.create('Multi', 'week', ids.B1); w.link(ids.A1!, multi)
  const near = w.create('Nearest', 'week', ids.A); w.link(ids.C1!, near)
  const skip = w.create('Skip', 'week', ids.A), loose = w.create('Loose', 'week')
  const s = w.repo.snapshot(), order = buildParentOrder(s.orderNodes, s.relations, s.observedAt)
  assert.equal(order.group(multi), ids.A1); assert.equal(order.group(near), ids.C1)
  assert(w.sorted('week').indexOf('Skip') > w.sorted('week').indexOf('Nearest'))
  assert.equal(w.sorted('week').at(-1), 'Loose'); assert.equal(order.group(loose), null); assert.equal(order.group(skip), ids.A)
  w.move(ids.C!, ids.A!)
  assert.deepEqual(w.sorted('month'), ['C1', 'A1', 'B1'])
  assert.deepEqual(w.sorted('day'), ['Cd', 'Ad', 'Bd'])
  w.run({ type: 'archive', itemId: ids.C, expectedVersion: w.repo.store.item(ids.C!).version, archived: true })
  assert(!w.repo.snapshot().items.some(item => item.id === ids.C))
  assert(w.repo.snapshot().orderNodes.some(node => node.id === ids.C))
  assert.deepEqual(w.sorted('month'), ['C1', 'A1', 'B1'])
  w.rejected(() => w.move(ids.A1!, ids.C1!, { parentOrder: true }))
  w.rejected(() => w.move(ids.A1!, null, { parentOrder: true, expectedPlacementVersion: 999 }))
  const edges = w.repo.store.relations().length
  w.move(ids.A!, null, { horizon: 'later' })
  assert.equal(w.repo.store.relations().length, edges)
  const next = w.repo.snapshot()
  assert.equal(buildParentOrder(next.orderNodes, next.relations, next.observedAt).group(ids.A1!), null)
  verifyDatabase(w.db); w.db.close()
  checks.push('Transitive ordering, no projection writes, nearest/multiple/skipped parents, unlinked tails, archived ancestry and invalid group/version rejection')
}
{
  const w = workspace('2026-09-15T12:00:00Z'), ids = seed(w)
  const future = { horizon: 'month' as const, startDate: '2026-10-01' }
  w.create('Future C', 'month', ids.C, { period: { kind: 'date', startDate: future.startDate } })
  w.create('Future A', 'month', ids.A, { period: { kind: 'date', startDate: future.startDate } })
  const old = exportDataset(w.repo.store, w.clock.now)
  w.clock.now = '2026-09-15T12:01:00Z'
  const operationId = randomUUID(), result = w.run({ type: 'materializeParentOrder', operationId })
  assert.deepEqual(w.raw('month'), ['A1', 'B1', 'C1']); assert.deepEqual(w.raw('week'), ['Aw', 'Bw', 'Cw']); assert.deepEqual(w.raw('day'), ['Ad', 'Bd', 'Cd'])
  const planned = readBoardPeriods(w.repo.store, { type: 'boardPeriods', generation: w.generation, periods: [future] }, w.clock.now)
  assert.deepEqual(planned.items.map(item => item.title), ['Future A', 'Future C'])
  assert(planned.orderNodes.some(node => node.id === ids.A))
  const committed = exportDataset(w.repo.store, w.clock.now)
  assert.deepEqual(committed.items.map(item => ({ ...item, version: 0 })), old.items.map(item => ({ ...item, version: 0 })), 'Materialization only touches order and necessary versions')
  assert.deepEqual(committed.relations, old.relations)
  assert.deepEqual(w.run({ type: 'materializeParentOrder', operationId }), result)
  assert.deepEqual(exportDataset(w.repo.store, w.clock.now), committed)
  const edited = w.repo.store.item(ids.B1!)
  w.run({ type: 'edit', itemId: edited.id, expectedVersion: edited.version, title: edited.title, description: 'Keep this later edit', dueDate: null })
  assert.equal(w.run({ type: 'undo', originalOperationId: operationId }).outcome, 'committed')
  for (const horizon of ['cycle', 'month', 'week', 'day']) {
    const previous = old.placements.filter(row => row.horizon === horizon).sort((a, b) => a.sortKey - b.sortKey).map(row => row.itemId)
    const actual = exportDataset(w.repo.store, w.clock.now).placements.filter(row => row.horizon === horizon).sort((a, b) => a.sortKey - b.sortKey).map(row => row.itemId)
    assert.deepEqual(actual, previous)
  }
  assert.equal(w.repo.store.item(ids.B1!).description, 'Keep this later edit')
  const effects = w.repo.store.operation(operationId)!.effects
  const failingId = effects[1]!.itemId
  w.db.exec(`CREATE TEMP TRIGGER reject_order BEFORE UPDATE OF sortKey ON item_placements WHEN NEW.itemId='${failingId}' BEGIN SELECT RAISE(ABORT, 'Injected storage failure'); END`)
  w.rejected(() => w.run({ type: 'materializeParentOrder' }))
  w.db.exec('DROP TRIGGER reject_order')
  w.repo.maintenance = true; w.rejected(() => w.run({ type: 'materializeParentOrder' })); w.repo.maintenance = false
  w.rejected(() => w.run({ type: 'materializeParentOrder', generation: 'old-generation' }))
  w.run({ type: 'materializeParentOrder' })
  const dataset = validateImport(exportDataset(w.repo.store, w.clock.now), w.clock.now)
  assert(!JSON.stringify(dataset.workspace).includes('parentOrder'))
  const restored = workspace(w.clock.now)
  replaceDataset(restored.repo.store, dataset, 'restore', w.clock.now)
  assert.deepEqual(restored.raw('month'), ['A1', 'B1', 'C1'])
  restored.rejected(() => restored.run({ type: 'materializeParentOrder' }))
  restored.db.close(); verifyDatabase(w.db); w.db.close()
  checks.push('Atomic current/future materialization, sequential whole-operation undo preserving text, idempotence, rollback after partial writes, maintenance/generation guards and validated restore')
}
{
  const w = workspace('2026-08-15T12:00:00Z'), ids = seed(w)
  w.clock.now = '2026-09-15T12:00:00Z'
  const child = w.create('Historical parent', 'day', ids.B1)
  const s = w.repo.snapshot(), order = buildParentOrder(s.orderNodes, s.relations, s.observedAt)
  assert.equal(order.group(child), ids.B1)
  const old = w.repo.store.item(ids.B1!).placement
  w.run({ type: 'materializeParentOrder' })
  assert.deepEqual(w.repo.store.item(ids.B1!).placement, old)
  w.db.close(); checks.push('Historical ancestors remain ordering inputs, while materialization leaves ended periods untouched')
}

{
  const w = workspace('2026-09-15T12:00:00Z')
  const a = w.create('A', 'cycle'), b = w.create('B', 'cycle')
  const z = w.create('Z', 'month', b), x = w.create('X', 'month', a), y = w.create('Y', 'month', a)
  w.run({ type: 'archive', itemId: x, expectedVersion: w.repo.store.item(x).version, archived: true })
  w.create('Z child', 'week', z); w.create('Y child', 'week', y); w.create('X child', 'week', x)
  const before = w.sorted('week'), archivedAt = w.repo.store.item(x).archivedAt
  assert.deepEqual(before, ['X child', 'Y child', 'Z child'])
  const saved = w.run({ type: 'materializeParentOrder' })
  assert.deepEqual(w.raw('week'), before); assert.deepEqual(w.sorted('week'), before)
  assert.equal(w.run({ type: 'materializeParentOrder' }).changed, false, 'Materialized ancestry remains a fixed point')
  assert.equal(w.repo.store.item(x).archivedAt, archivedAt)
  assert.equal(w.run({ type: 'undo', originalOperationId: saved.operationId }).outcome, 'committed')
  assert.deepEqual(w.raw('month'), ['Z', 'Y'])
  verifyDatabase(w.db); w.db.close()
  checks.push('Materialization preserves hidden intermediate ancestors and is a fixed point across consecutive projections; bulk undo preserves archived state')
}

const now = Temporal.Now.instant().toString(), w = workspace(now, join(process.argv[2]!, 'workspace.sqlite')), ids = seed(w)
ids.A2 = w.create('A2', 'month', ids.A)
ids.loose = w.create('Unlinked', 'month')
const s = w.repo.snapshot(), next = s.periods.map(period => currentPeriod(s.workspace.calendar!, period.horizon, period.endAt))
const future = next.find(period => period.horizon === 'month')!
ids.futureC = w.create('Future C', 'month', ids.C, { period: { kind: 'date', startDate: future.startDate } })
ids.futureA = w.create('Future A', 'month', ids.A, { period: { kind: 'date', startDate: future.startDate } })
const report = { checks, runtime: { electron: process.versions.electron, node: process.versions.node, sqlite: w.db.prepare('SELECT sqlite_version() AS version').get()!.version } }
writeFileSync(process.argv[3]!, JSON.stringify(report, null, 2))
writeFileSync(join(process.argv[2]!, 'ordering-fixture.json'), JSON.stringify({ ids, periods: s.periods, next, report }))
verifyDatabase(w.db); w.db.close()
