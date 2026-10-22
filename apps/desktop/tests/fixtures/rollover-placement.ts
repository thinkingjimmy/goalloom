/**
 * [INPUT]: Isolated production repositories, native SQLite and an injected clock.
 * [OUTPUT]: Automatic/manual/backlog rollover placement, group integrity and undo evidence.
 * [POS]: Ordering E2E transaction acceptance for the device placement preference.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 *
 * Failure cases recorded before implementation:
 * - Automatic/manual/backlog rollover appends despite enabled placement, or reorders existing tasks.
 * - Disabled placement or explicit head/tail drops are overridden; backward/cross-horizon moves auto-place.
 * - Batch arrivals reverse source order, split local groups or skip hidden roots with visible children.
 * - One-step undo loses expired-period holds; retries duplicate arrivals or receipts lose final anchors.
 * - Current/future placement changes unrelated periods or moves separately scheduled children.
 * - A stale selected placement is accepted or causes a partially committed backlog batch.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { localParentSql } from '@goalloom/store-core'
import { validateImport } from '../../src/domain/import-validation'
import { openDatabase, verifyDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { reconcile } from '../../src/main/workspace/reconcile'
import { exportDataset } from '../../src/main/workspace/transfer/dataset'

function workspace() {
  const db = openDatabase(':memory:'); migrate(db)
  const clock = { now: '2026-10-15T12:00:00Z' }, repo = new Repository(db, { now: () => clock.now })
  const run = (action: Record<string, unknown>) => repo.execute({ generation: repo.store.workspace().generation, operationId: randomUUID(), ...action })
  run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-01-01' }, confirmed: true })
  const item = (id: string) => repo.store.item(id)
  const a = run({ type: 'create', title: 'Goal A', horizon: 'cycle', flowColor: 0 }).itemId!
  const b = run({ type: 'create', title: 'Goal B', horizon: 'cycle', flowColor: 1 }).itemId!
  const create = (title: string, parentId?: string, startDate = '2026-10-01', extra = {}) => run({ type: 'create', title, horizon: 'month', period: { kind: 'date', startDate },
    ...(parentId ? { parentId, expectedParentVersion: item(parentId).version } : {}), ...extra }).itemId!
  const a1 = create('A1', a, '2026-11-01'), b1 = create('B1', b, '2026-11-01')
  const roots = (startDate = '2026-11-01') => repo.store.summaries(`i.deletedAt IS NULL AND p.periodId IN (SELECT id FROM planning_periods WHERE horizon='month' AND startDate=?) AND ${localParentSql()} IS NULL`, [startDate]).map(row => row.title)
  const placements = (ids = [a1, b1]) => ids.map(id => item(id).placement)
  const moveCommand = (id: string, extra = {}) => ({ type: 'move', operationId: randomUUID(), itemId: id, horizon: 'month',
    expectedVersion: item(id).version, expectedPlacementVersion: item(id).placement.version, ...extra })
  const backlogCommand = (ids: string[], autoPlace: boolean) => ({ type: 'arrangeBacklog', operationId: randomUUID(), horizon: 'month', autoPlace,
    items: ids.map(itemId => ({ itemId, expectedVersion: item(itemId).version, expectedPlacementVersion: item(itemId).placement.version })) })
  const nest = (childId: string, parentId: string) => run({ type: 'nest', itemId: childId, parentId, expectedVersion: item(childId).version,
    expectedPlacementVersion: item(childId).placement.version, expectedParentVersion: item(parentId).version, expectedParentPlacementVersion: item(parentId).placement.version })
  const data = () => exportDataset(repo.store, clock.now)
  const close = () => { validateImport(data(), clock.now); verifyDatabase(db); db.close() }
  return { db, repo, clock, run, item, create, roots, placements, moveCommand, backlogCommand, nest, data, close, a, b, a1, b1 }
}

export function rolloverPlacement(): string[] {
  const checks: string[] = []
  for (const autoPlace of [true, false]) {
    const w = workspace(), incoming = w.create('A2', w.a), stable = w.placements()
    w.run({ type: 'policy', horizon: 'month', mode: 'auto', expectedVersion: 1 })
    w.clock.now = '2026-11-15T12:00:00Z'
    assert(reconcile(w.repo, w.clock.now, autoPlace))
    assert.deepEqual(w.roots(), autoPlace ? ['A1', 'A2', 'B1'] : ['A1', 'B1', 'A2'])
    assert.deepEqual(w.placements(), stable)
    assert.equal(w.item(incoming).placement.periodId, w.item(w.a1).placement.periodId)
    assert.equal(reconcile(w.repo, w.clock.now, autoPlace), null)
    w.close()
    checks.push(`Automatic rollover with placement ${autoPlace ? 'enabled' : 'disabled'} preserves existing destination placements and is idempotent`)
  }
  for (const autoPlace of [true, false]) for (const timing of ['next-future', 'date-future', 'date-current'] as const) {
    const w = workspace(), incoming = w.create('A2', w.a), stable = w.placements(), before = w.item(incoming).placement
    if (timing === 'date-current') w.clock.now = '2026-11-15T12:00:00Z'
    const request = w.moveCommand(incoming, { autoPlace, period: timing === 'next-future' ? { kind: 'next' } : { kind: 'date', startDate: '2026-11-01' } })
    const moved = w.run(request), after = w.data()
    assert.deepEqual(w.roots(), autoPlace ? ['A1', 'A2', 'B1'] : ['A1', 'B1', 'A2'])
    assert.deepEqual(w.placements(), stable)
    assert.deepEqual(w.run(request), moved); assert.deepEqual(w.data(), after)
    const effect = w.repo.store.operation(moved.operationId)!.effects.filter(effect => effect.kind === 'position' && effect.itemId === incoming)
    assert.equal(effect.length, 1, 'Rollover and automatic placement use one position effect')
    const payload = JSON.parse(String(w.db.prepare('SELECT payload FROM sync_ops WHERE opId=?').get(moved.operationId)!.payload))
    const placements = payload.actions.filter((action: { t: string; id: string }) => action.t === 'item.place' && action.id === incoming)
    assert.equal(placements.length, 1)
    assert.deepEqual(placements[0].sortHint, autoPlace ? { afterId: w.a1, beforeId: w.b1 } : { afterId: w.b1, beforeId: null })
    w.run({ type: 'edit', itemId: incoming, expectedVersion: w.item(incoming).version, title: 'A2', description: 'Keep later text', dueDate: null })
    assert.equal(w.run({ type: 'undo', originalOperationId: moved.operationId }).outcome, 'committed')
    assert.deepEqual(w.roots(), ['A1', 'B1'])
    assert.equal(w.item(incoming).placement.periodId, before.periodId)
    assert.equal(w.item(incoming).placement.holdPeriodId, timing === 'date-current' ? w.item(w.a1).placement.periodId : null)
    assert.equal(w.item(incoming).description, 'Keep later text')
    w.close()
    checks.push(`Manual ${timing} rollover with placement ${autoPlace ? 'enabled' : 'disabled'} retains destination order, final sync anchors, replayed receipt and one-step undo`)
  }
  for (const position of ['head', 'tail'] as const) {
    const w = workspace(), incoming = w.create('A2', w.a), stable = w.placements()
    w.run(w.moveCommand(incoming, { autoPlace: true, period: { kind: 'date', startDate: '2026-11-01' }, beforeId: position === 'head' ? w.a1 : null }))
    assert.deepEqual(w.roots(), position === 'head' ? ['A2', 'A1', 'B1'] : ['A1', 'B1', 'A2'])
    assert.deepEqual(w.placements(), stable)
    w.close(); checks.push(`Explicit ${position} insertion wins over rollover auto-placement`)
  }
  for (const autoPlace of [true, false]) for (const route of ['automatic', 'backlog'] as const) {
    const w = workspace(), a2 = w.create('A2', w.a), b2 = w.create('B2', w.b), a3 = w.create('A3', w.a), stable = w.placements()
    if (route === 'automatic') w.run({ type: 'policy', horizon: 'month', mode: 'auto', expectedVersion: 1 })
    w.clock.now = '2026-11-15T12:00:00Z'
    const request = w.backlogCommand([a3, b2, a2], autoPlace)
    const result = route === 'automatic' ? reconcile(w.repo, w.clock.now, autoPlace)! : w.run(request)
    assert(result)
    assert.deepEqual(w.roots(), autoPlace ? ['A1', 'A2', 'A3', 'B1', 'B2'] : ['A1', 'B1', 'A2', 'B2', 'A3'])
    assert.deepEqual(w.placements(), stable)
    if (route === 'backlog') {
      const after = w.data(); assert.deepEqual(w.run(request), result); assert.deepEqual(w.data(), after)
      assert.equal(w.run({ type: 'undo', originalOperationId: result.operationId }).outcome, 'committed')
      assert.deepEqual(w.roots(), ['A1', 'B1'])
      for (const id of [a2, b2, a3]) assert.equal(w.item(id).placement.holdPeriodId, w.item(w.a1).placement.periodId)
    }
    w.close(); checks.push(`${route} batch with placement ${autoPlace ? 'enabled' : 'disabled'} preserves source order within each parent and existing destination placements`)
  }
  for (const lifecycle of ['archived', 'cancelled'] as const) for (const route of ['automatic', 'manual', 'backlog'] as const) {
    const w = workspace(), root = w.create('Group A', w.a), child = w.create('Visible child'), remote = w.create('Remote child')
    w.nest(child, root); w.nest(remote, root)
    w.run(w.moveCommand(remote, { period: { kind: 'date', startDate: '2026-12-01' } }))
    w.run({ itemId: root, expectedVersion: w.item(root).version, ...(lifecycle === 'archived' ? { type: 'archive', archived: true } : { type: 'status', status: 'cancelled' }) })
    const stable = w.placements(), remoteBefore = w.item(remote).placement, source = w.item(root).placement.periodId
    if (route === 'automatic') w.run({ type: 'policy', horizon: 'month', mode: 'auto', expectedVersion: 1 })
    w.clock.now = '2026-11-15T12:00:00Z'
    const result = route === 'automatic' ? reconcile(w.repo, w.clock.now, true)!
      : w.run(route === 'manual' ? w.moveCommand(root, { autoPlace: true, period: { kind: 'next' } }) : w.backlogCommand([child], true))
    assert(result)
    assert.deepEqual(w.roots(), ['A1', 'Group A', 'B1'])
    assert.deepEqual(w.placements(), stable); assert.deepEqual(w.item(remote).placement, remoteBefore)
    assert.equal(w.item(child).placement.periodId, w.item(w.a1).placement.periodId)
    assert.equal(w.item(child).placement.nestingParentId, root)
    if (route !== 'automatic') {
      assert.equal(w.run({ type: 'undo', originalOperationId: result.operationId }).outcome, 'committed')
      assert.equal(w.item(root).placement.periodId, source); assert.equal(w.item(child).placement.periodId, source)
      assert.equal(w.item(child).placement.holdPeriodId, w.item(w.a1).placement.periodId)
      assert.deepEqual(w.item(remote).placement, remoteBefore)
    }
    w.close(); checks.push(`${route} rollover places a ${lifecycle} root with its visible local child, retains remote ownership and preserves group undo`)
  }
  {
    const w = workspace(), a2 = w.create('A2', w.a), b2 = w.create('B2', w.b)
    w.clock.now = '2026-11-15T12:00:00Z'
    const request = w.backlogCommand([a2, b2], true), before = w.data()
    request.items[1]!.expectedPlacementVersion++
    assert.throws(() => w.run(request), error => error instanceof Error && 'code' in error && error.code === 'stale')
    assert.deepEqual(w.data(), before)
    w.close(); checks.push('A stale selected backlog placement rejects the complete batch without changing business data')
  }
  {
    const w = workspace(), incoming = w.create('A2', w.a, '2026-11-01')
    const samePeriod = w.placements([w.a1, w.b1, incoming])
    w.run(w.moveCommand(incoming, { autoPlace: true, period: { kind: 'date', startDate: '2026-11-01' } }))
    assert.deepEqual(w.placements([w.a1, w.b1, incoming]), samePeriod)
    w.create('Current A', w.a); w.create('Current B', w.b)
    w.run(w.moveCommand(incoming, { autoPlace: true, period: { kind: 'date', startDate: '2026-10-01' } }))
    assert.deepEqual(w.roots('2026-10-01'), ['Current A', 'Current B', 'A2'])
    const weekA = w.create('Week A', w.a, '2026-10-12', { horizon: 'week' })
    const weekB = w.create('Week B', w.b, '2026-10-12', { horizon: 'week' })
    const weekly = w.placements([weekA, weekB])
    w.run(w.moveCommand(incoming, { autoPlace: true, horizon: 'week' }))
    assert.deepEqual(w.repo.store.summaries('i.deletedAt IS NULL AND p.horizon=?', ['week']).map(row => row.title), ['Week A', 'Week B', 'A2'])
    assert.deepEqual(w.placements([weekA, weekB]), weekly)
    w.close(); checks.push('Automatic placement does not change same-period sorting, backward moves or cross-horizon moves')
  }
  return checks
}
