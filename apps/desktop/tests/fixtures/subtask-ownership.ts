/**
 * [INPUT]: Isolated production repositories with an injected clock and the existing subtask command helpers.
 * [OUTPUT]: Cross-period ownership, local group movement, Later, lifecycle, rollover and import evidence.
 * [POS]: Subtask E2E transaction scenarios; failure cases are recorded in the subtask feature spec.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Repository } from '../../src/main/workspace/repository'
import type { CommandResult } from '../../src/shared/contracts/commands'
import type { Dataset } from '../../src/shared/contracts/transfer'
import { validateImport } from '../../src/domain/import-validation'
import { outlineSections } from '../../src/domain/nesting'
import { buildParentOrder } from '../../src/domain/parent-order'
import { reconcile } from '../../src/main/workspace/reconcile'
import { readSqliteDataset, replaceDataset } from '../../src/main/workspace/transfer/dataset'

interface World {
  repo: Repository; db: Repository['db']; root: string; leaf: string; goal: string
  item: Repository['store']['item']; create: (title: string, horizon: string, extra?: Record<string, unknown>) => string
  nest: (child?: string, parent?: string, extra?: Record<string, unknown>) => CommandResult
  move: (id: string, horizon: string, extra?: Record<string, unknown>) => CommandResult
  run: (action: Record<string, unknown>) => CommandResult; undo: (id: string) => CommandResult
  data: () => Dataset; now: () => string; time: (next: string) => void; flows: (id: string) => string[]
}

export async function subtaskOwnership(world: (path?: string) => World, checks: string[]): Promise<void> {
  {
    const w = world(), sibling = w.create('Same-period child', 'day')
    w.nest(); w.nest(sibling)
    const departure = w.move(w.leaf, 'day')
    assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
    assert.deepEqual(w.flows(w.leaf), [w.goal])
    const snap = w.repo.snapshot(), child = snap.items.find(item => item.id === w.leaf)!
    assert.deepEqual(outlineSections([child], snap.nestingParents).rows.map(row => row.id), [w.leaf])
    assert.equal(buildParentOrder(snap.orderNodes, snap.relations, snap.observedAt).group(w.leaf), w.root)
    const independent = w.create('Day root neighbor', 'day')
    const sorted = w.move(w.leaf, 'day', { beforeId: null })
    assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
    assert.equal(w.repo.store.position(w.item(w.leaf)).previousId, independent)
    assert.equal(w.undo(sorted.operationId).outcome, 'committed')
    const rootMove = w.move(w.root, 'month')
    assert.equal(w.item(sibling).placement.horizon, 'month')
    assert.equal(w.item(w.leaf).placement.horizon, 'day')
    assert.equal(w.undo(rootMove.operationId).outcome, 'committed')
    const futureMove = w.move(w.leaf, 'day', { period: { kind: 'date', startDate: '2026-10-15' } })
    assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
    w.run({ type: 'edit', itemId: w.leaf, expectedVersion: w.item(w.leaf).version, title: 'Text after movement', description: w.item(w.leaf).description, dueDate: w.item(w.leaf).dueDate })
    assert.equal(w.undo(futureMove.operationId).outcome, 'committed')
    assert.equal(w.item(w.leaf).title, 'Text after movement')
    validateImport(w.data(), w.now())
    // The inserted root changes the original departure's destination neighbors, so test that inverse separately.
    assert(departure.changed)
    w.db.close()
    checks.push('Cross-column/future ownership, root-free destination rows, inherited flows, independent sorting and local-only group moves preserve later text')
  }
  {
    const w = world(); w.nest()
    const departure = w.move(w.leaf, 'day')
    assert.equal(w.undo(departure.operationId).outcome, 'committed')
    assert.equal(w.item(w.leaf).placement.horizon, 'week')
    assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
    w.move(w.leaf, 'day')
    const prior = structuredClone(w.item(w.leaf))
    const unchanged = w.move(w.leaf, 'later', { beforeId: w.leaf })
    assert.equal(unchanged.changed, false)
    assert.equal(JSON.stringify(w.item(w.leaf)), JSON.stringify(prior))
    assert.deepEqual(w.repo.store.operation(unchanged.operationId)!.effects, [])
    const parked = w.move(w.leaf, 'later')
    assert.equal(w.item(w.leaf).placement.nestingParentId, null)
    assert.equal(w.repo.store.relations().filter(edge => edge.childId === w.leaf).length, 0)
    assert.equal(w.undo(parked.operationId).outcome, 'committed')
    assert.equal(w.item(w.leaf).placement.horizon, 'day')
    assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
    validateImport(w.data(), w.now()); w.db.close()
    checks.push('One-step child departure and Later undo restore placement and ownership without retaining Later goal links')
  }
  {
    const w = world(), parent = w.create('Later outline parent', 'later'), first = w.create('Later first child', 'day'), second = w.create('Later second child', 'day')
    w.nest(first, parent); w.nest(second, parent)
    const sorted = w.move(second, 'later', { beforeId: first, keepNesting: true })
    assert.deepEqual(w.repo.store.nestedItems(parent).map(item => item.id), [second, first])
    assert.equal(w.undo(sorted.operationId).outcome, 'committed')
    assert.deepEqual(w.repo.store.nestedItems(parent).map(item => item.id), [first, second])
    validateImport(w.data(), w.now()); w.db.close()
    checks.push('Later local sibling sorting retains ownership and supports one-step undo; self-position moves write no business effects')
  }
  {
    const w = world(), sibling = w.create('Local child entering Later', 'day')
    w.nest(); w.nest(sibling); w.move(w.leaf, 'day')
    const prior = structuredClone(w.item(w.leaf).placement)
    const parked = w.move(w.root, 'later')
    assert.equal(w.item(sibling).placement.horizon, 'later')
    assert.equal(w.item(sibling).placement.nestingParentId, w.root)
    assert.equal(w.item(w.leaf).placement.horizon, prior.horizon)
    assert.equal(w.item(w.leaf).placement.periodId, prior.periodId)
    assert.equal(w.item(w.leaf).placement.sortKey, prior.sortKey)
    assert.equal(w.item(w.leaf).placement.nestingParentId, null)
    assert.deepEqual(w.flows(w.leaf), [w.goal])
    validateImport(w.data(), w.now())
    assert.equal(w.undo(parked.operationId).outcome, 'committed')
    assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
    assert.equal(w.item(w.leaf).placement.horizon, 'day')
    assert.equal(w.item(sibling).placement.horizon, 'week')
    const bad = structuredClone(w.data())
    bad.placements.find(p => p.itemId === w.root)!.horizon = 'later'
    bad.placements.find(p => p.itemId === w.root)!.periodId = null
    assert.throws(() => validateImport(bad, w.now()))
    validateImport(w.data(), w.now()); w.db.close()
    checks.push('Root Later movement keeps its local outline, detaches remote children in place with inherited goals and reverses atomically; cross-Later imports fail')
  }
  {
    const w = world(); w.nest(); w.move(w.leaf, 'day')
    const rootPeriod = w.item(w.root).placement.periodId, prior = w.item(w.leaf).placement.periodId
    w.time('2026-10-12T12:00:00.000Z')
    assert(reconcile(w.repo))
    assert.notEqual(w.item(w.leaf).placement.periodId, prior)
    assert.equal(w.item(w.root).placement.periodId, rootPeriod)
    assert.equal(w.item(w.root).placement.horizon, 'week')
    assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
    validateImport(w.data(), w.now()); w.db.close()
    checks.push('Automatic child rollover advances its own period without moving its remote parent')
  }
  {
    const w = world(); w.nest(); w.move(w.leaf, 'day')
    const prior = w.item(w.leaf).placement.periodId
    w.time('2026-10-12T12:00:00.000Z')
    const child = w.item(w.leaf)
    const arranged = w.run({ type: 'arrangeBacklog', horizon: 'day', items: [{ itemId: child.id, expectedVersion: child.version, expectedPlacementVersion: child.placement.version }] })
    assert.notEqual(w.item(w.leaf).placement.periodId, prior)
    assert.equal(w.item(w.root).placement.horizon, 'week')
    assert.equal(w.undo(arranged.operationId).outcome, 'committed')
    assert(w.item(w.leaf).placement.holdPeriodId)
    assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
    assert.equal(reconcile(w.repo), null)
    validateImport(w.data(), w.now()); w.db.close()
    checks.push('Backlog arrangement and expired-period undo hold affect the remote child only')
  }
  {
    const w = world(); w.nest(); w.move(w.leaf, 'day')
    const moved = w.run({ type: 'applyAssistance', itemId: w.root, expectedVersion: w.item(w.root).version, expectedGuidanceRevision: 0, guidance: { kind: 'keep' },
      move: { horizon: 'later', startDate: null, previewPeriodId: null, expectedPlacementVersion: w.item(w.root).placement.version, confirmedLater: true } })
    assert.equal(w.item(w.leaf).placement.nestingParentId, null)
    assert.equal(w.item(w.leaf).placement.horizon, 'day')
    validateImport(w.data(), w.now())
    assert.equal(w.undo(moved.operationId).outcome, 'committed')
    assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
    validateImport(w.data(), w.now()); w.db.close()
    checks.push('Existing assistance placement commands retain atomic cross-period Later detach/undo and valid exports')
  }
  {
    const w = world(); w.nest(); w.move(w.leaf, 'day'); w.time('2026-10-12T12:00:00.000Z')
    const arranged = w.run({ type: 'arrangeBacklog', horizon: 'later', items: [w.root, w.leaf].map(id => ({ itemId: id, expectedVersion: w.item(id).version, expectedPlacementVersion: w.item(id).placement.version })) })
    for (const id of [w.root, w.leaf]) assert.equal(w.item(id).placement.horizon, 'later')
    assert.equal(w.item(w.leaf).placement.nestingParentId, null)
    validateImport(w.data(), w.now())
    assert.equal(w.undo(arranged.operationId).outcome, 'committed')
    assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
    assert.equal(w.item(w.root).placement.horizon, 'week'); assert.equal(w.item(w.leaf).placement.horizon, 'day')
    validateImport(w.data(), w.now()); w.db.close()
    checks.push('Selecting both a root and its remote backlog child retains one atomic Later operation and one safe undo')
  }
  {
    const w = world(); w.nest(); w.move(w.leaf, 'day')
    const period = w.item(w.leaf).placement.periodId
    w.run({ type: 'delete', itemId: w.root, expectedVersion: w.item(w.root).version })
    assert.equal(w.item(w.leaf).placement.nestingParentId, null)
    w.run({ type: 'restoreItem', itemId: w.root, expectedVersion: w.item(w.root).version })
    assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
    assert.equal(w.item(w.leaf).placement.periodId, period)
    w.run({ type: 'delete', itemId: w.leaf, expectedVersion: w.item(w.leaf).version })
    w.run({ type: 'restoreItem', itemId: w.leaf, expectedVersion: w.item(w.leaf).version })
    assert.equal(w.item(w.leaf).placement.nestingParentId, w.root)
    assert.equal(w.item(w.leaf).placement.periodId, period)
    validateImport(w.data(), w.now()); w.db.close()
    checks.push('Root/child deletion and restore retain remote child placement and restore eligible ownership')
  }
  {
    const directory = mkdtempSync(join(tmpdir(), 'goalloom-ownership-transfer-'))
    const w = world(join(directory, 'workspace.sqlite')), restored = world()
    try {
      w.nest(); w.move(w.leaf, 'day')
      for (const input of [JSON.parse(JSON.stringify(w.data())), await readSqliteDataset(join(directory, 'workspace.sqlite'), w.now())]) {
        replaceDataset(restored.repo.store, validateImport(input, w.now()), 'restore', w.now())
        assert.equal(restored.item(w.leaf).placement.nestingParentId, w.root)
        assert.equal(restored.item(w.leaf).placement.horizon, 'day')
        assert.equal(restored.item(w.root).placement.horizon, 'week')
      }
      checks.push('JSON and consistent SQLite recovery round trips preserve cross-period ownership and independent placements')
    } finally { w.db.close(); restored.db.close(); rmSync(directory, { recursive: true, force: true }) }
  }
}
