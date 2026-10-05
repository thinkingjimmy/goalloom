/**
 * [INPUT]: A synthetic Repository and injected observation time.
 * [OUTPUT]: Frozen historical insertBetween receipt with one create and two child reparenting effects.
 * [POS]: Import fixture only; it never restores the retired live command or UI.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHash, randomUUID } from 'node:crypto'
import type { Repository } from '../../../src/main/workspace/repository'
import type { Context } from '../../../src/main/workspace/context'
import type { CommandResult } from '../../../src/shared/contracts/commands'
import { transaction } from '../../../src/main/storage/database'
import { createItem, newRelation } from '../../../src/main/workspace/commands/items'
import { writeEdges } from '../../../src/main/workspace/commands/lifecycle'

export function seedLegacyMilestone(repo: Repository, now: string): string {
  const generation = repo.store.workspace().generation
  const run = (command: Record<string, unknown>) => repo.execute({ ...command, operationId: randomUUID(), generation })
  const parentId = run({ type: 'create', title: 'Legacy parent', horizon: 'month' }).itemId!
  const children = ['Legacy first child', 'Legacy second child'].map(title => run({ type: 'create', title, horizon: 'day', parentId, expectedParentVersion: repo.store.item(parentId).version }).itemId!)
  return transaction(repo.db, () => {
    const id = randomUUID(), workspace = repo.store.workspace()
    const context: Context = { store: repo.store, workspace, command: { operationId: id, generation }, now, effects: [], warnings: [], itemId: null, label: 'Legacy milestone' }
    createItem(context, { type: 'create', operationId: id, generation, title: 'Legacy middle step', description: '', dueDate: null, horizon: 'week', parentId, expectedParentVersion: repo.store.item(parentId).version, flowColor: null })
    const milestone = context.itemId!
    for (const childId of children) {
      const edge = repo.store.relations().find(row => row.parentId === parentId && row.childId === childId)!
      const dropped = { ...edge, invalidatedAt: now, invalidatedBy: id, reason: 'unlink' as const }
      writeEdges(context, [dropped], milestone)
      const added = newRelation(milestone, childId, now)
      repo.store.saveRelation(added)
      context.effects.push({ kind: 'relations', itemId: childId, edges: [{ before: edge, after: dropped }, { before: null, after: added }] })
    }
    workspace.revision++; workspace.lastObservedAt = now
    repo.store.saveWorkspace(workspace)
    const result: CommandResult = { operationId: id, generation, changed: true, undoable: true, outcome: 'committed', itemId: milestone, label: 'Legacy milestone', warnings: [], restoreSource: null, originalOperationId: null }
    repo.store.saveOperation({ id, generation, requestHash: createHash('sha256').update(id).digest('hex'), kind: 'insertBetween', source: 'user', at: now, effectsVersion: 1, effects: context.effects, result })
    return id
  })
}
