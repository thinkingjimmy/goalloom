/**
 * [INPUT]: A validated insertBetween command (milestone title/horizon/period, versioned parent and children) and the transaction context.
 * [OUTPUT]: One operation: the milestone created under the parent, each child re-linked to it and its direct parent edge invalidated; create + relations effects for a single undo.
 * [POS]: Workspace command for the flow-insight skip repair; reuses createItem, writeEdges and the new-link horizon/DAG rules instead of a second write path.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { horizonProblem, relationProblem } from '../../../domain/relations'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import type { Relation } from '../../../shared/contracts/entities'
import { assertAvailable, type Context } from '../context'
import { createItem, newRelation } from './items'
import { writeEdges } from './lifecycle'
import { serverText } from '../../../shared/i18n/server'

export function insertBetween(context: Context, command: CommandOf<'insertBetween'>): boolean {
  if (new Set(command.children.map(child => child.itemId)).size !== command.children.length) throw new DomainError('invalid', serverText().errors.relationGone)
  // --- Every child guard runs before the first write; the milestone's horizon must sit strictly between parent and child. ---
  const children = command.children.map(ref => {
    const child = context.store.item(ref.itemId, ref.expectedVersion)
    assertAvailable(child)
    const issue = horizonProblem(command.horizon, child.placement.horizon)
    if (issue) throw new DomainError('conflict', issue)
    const edge = context.store.relations().find(row => row.parentId === command.parentId && row.childId === child.id)
    if (!edge) throw new DomainError('conflict', serverText().errors.relationGone)
    return { child, edge }
  })
  createItem(context, { operationId: command.operationId, generation: command.generation, type: 'create', title: command.title, description: '', dueDate: null,
    horizon: command.horizon, period: command.period, parentId: command.parentId, expectedParentVersion: command.expectedParentVersion, flowColor: null })
  const milestone = context.itemId!
  for (const { child, edge } of children) {
    const dropped: Relation = { ...edge, invalidatedAt: context.now, invalidatedBy: command.operationId, reason: 'unlink' }
    writeEdges(context, [dropped], milestone)
    const problem = relationProblem(milestone, child.id, context.store.relations())
    if (problem) throw new DomainError('conflict', problem)
    const added = newRelation(milestone, child.id, context.now)
    context.store.saveRelation(added)
    context.effects.push({ kind: 'relations', itemId: child.id, edges: [{ before: edge, after: dropped }, { before: null, after: added }] })
  }
  context.itemId = milestone
  context.label = serverText().labels.decompose
  return true
}
