/**
 * [INPUT]: Two encrypted-replay repositories, exchange/rebuild callbacks and shared evidence checks.
 * [OUTPUT]: Converged cross-period ownership, local-only group moves, Later detach, peer-edit-safe undo and restore.
 * [POS]: Product-level extension of the existing two-peer sync E2E.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { Action, SyncOp } from '@goalloom/contracts'
import type { Repository } from '../../src/main/workspace/repository'
import type { CommandInput } from '../../src/shared/contracts/commands'

export async function syncSubtaskOwnership({ first, second, sync, rebuild, inject, checks }: {
  first: Repository; second: Repository; sync: () => Promise<void>; rebuild: () => void; inject: (actions: Action[]) => Promise<SyncOp>; checks: string[]
}): Promise<void> {
  const run = (repo: Repository, input: Record<string, unknown>) => repo.execute({ ...input, operationId: randomUUID(), generation: repo.store.workspace().generation } as CommandInput)
  const create = (title: string, horizon: string, extra = {}) => run(first, { type: 'create', title, horizon, ...extra }).itemId!
  const item = (id: string) => first.store.item(id)
  const move = (id: string, horizon: string) => run(first, { type: 'move', itemId: id, horizon, expectedVersion: item(id).version, expectedPlacementVersion: item(id).placement.version })
  const goal = create('Ownership sync goal', 'cycle')
  const root = create('Ownership sync parent', 'week', { parentId: goal, expectedParentVersion: item(goal).version })
  const child = create('Ownership independently scheduled child', 'week', { nesting: { parentId: root, expectedParentVersion: item(root).version, expectedParentPlacementVersion: item(root).placement.version } })
  const local = create('Ownership locally grouped child', 'week', { nesting: { parentId: root, expectedParentVersion: item(root).version, expectedParentPlacementVersion: item(root).placement.version } })
  move(child, 'day')
  await sync(); rebuild()
  const state = (repo: Repository) => [root, child, local].map(id => {
    const value = repo.store.item(id)
    return { id, title: value.title, status: value.status, deletedAt: value.deletedAt, horizon: value.placement.horizon, periodId: value.placement.periodId, parentId: value.placement.nestingParentId }
  })
  assert.deepEqual(state(first), state(second))
  assert.equal(item(child).placement.nestingParentId, root)
  const scheduledPeriod = item(child).placement.periodId
  const movedRoot = move(root, 'month')
  await sync(); rebuild()
  for (const repo of [first, second]) {
    assert.equal(repo.store.item(local).placement.horizon, 'month')
    assert.equal(repo.store.item(child).placement.horizon, 'day')
    assert.equal(repo.store.item(child).placement.nestingParentId, root)
  }
  run(second, { type: 'edit', itemId: child, expectedVersion: second.store.item(child).version, title: 'Peer edit after cross-period movement', description: '', dueDate: null })
  await sync(); await sync()
  assert.equal(run(first, { type: 'undo', originalOperationId: movedRoot.operationId }).outcome, 'committed')
  await sync(); rebuild()
  assert.deepEqual(state(first), state(second))
  assert.equal(item(child).title, 'Peer edit after cross-period movement')
  const parked = move(root, 'later')
  await sync(); rebuild()
  for (const repo of [first, second]) {
    assert.equal(repo.store.item(local).placement.horizon, 'later')
    assert.equal(repo.store.item(local).placement.nestingParentId, root)
    assert.equal(repo.store.item(child).placement.periodId, scheduledPeriod)
    assert.equal(repo.store.item(child).placement.nestingParentId, null)
    assert(repo.store.relations().some(edge => edge.parentId === goal && edge.childId === child))
  }
  assert.equal(run(first, { type: 'undo', originalOperationId: parked.operationId }).outcome, 'committed')
  await sync(); rebuild()
  assert.deepEqual(state(first), state(second))
  assert.equal(item(child).placement.nestingParentId, root)
  const parkedChild = move(child, 'later')
  await sync(); rebuild()
  assert.equal(second.store.item(child).placement.nestingParentId, null)
  assert.equal(run(first, { type: 'undo', originalOperationId: parkedChild.operationId }).outcome, 'committed')
  await sync(); rebuild()
  run(first, { type: 'delete', itemId: child, expectedVersion: item(child).version })
  await sync(); rebuild()
  run(first, { type: 'restoreItem', itemId: child, expectedVersion: item(child).version })
  await sync(); rebuild()
  assert.deepEqual(state(first), state(second))
  assert.equal(item(child).placement.nestingParentId, root)
  assert.equal(item(child).placement.periodId, scheduledPeriod)
  checks.push('Encrypted cross-period ownership survives canonical rebuild, local-only parent moves, both Later paths, peer text edits, atomic undo and child delete/restore')
  const rejected = await inject([{ t: 'item.delete', id: root }])
  await sync(); rebuild()
  for (const repo of [first, second]) {
    assert.equal(repo.store.item(root).deletedAt, null)
    assert.equal(repo.store.item(child).placement.nestingParentId, root)
    assert.equal(repo.db.prepare('SELECT errorCode FROM canon_ops WHERE opId=?').get(rejected.opId)?.errorCode, 'outline_conflict')
    assert.equal(repo.db.prepare('SELECT count(*) AS n FROM canon_changes WHERE seq=(SELECT seq FROM canon_ops WHERE opId=?)').get(rejected.opId)?.n, 0)
  }
  const deleted = await inject([{ t: 'item.delete', id: child }])
  await sync(); rebuild()
  for (const repo of [first, second]) assert.equal(repo.store.item(child).placement.nestingParentId, null)
  const target = create('New owner after peer deletion', 'month'), parentItem = item(root), targetItem = item(target)
  run(first, { type: 'nest', itemId: root, parentId: target, expectedVersion: parentItem.version, expectedPlacementVersion: parentItem.placement.version,
    expectedParentVersion: targetItem.version, expectedParentPlacementVersion: targetItem.placement.version })
  await sync(); rebuild()
  await inject([{ t: 'item.restore', id: child, expectedDeleteOpId: deleted.opId }])
  await sync(); rebuild()
  for (const repo of [first, second]) {
    assert.equal(repo.store.item(child).deletedAt, null)
    assert.equal(repo.store.item(child).placement.nestingParentId, null)
  }
  checks.push('Canonical replay rejects deletion of an owner with unseen live children, clears tombstone ownership and restores independently after the old parent becomes nested')
}
