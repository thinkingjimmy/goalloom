/**
 * [INPUT]: 当前条目/关系/语义位置，以及不可变操作效果。
 * [OUTPUT]: Owned-field conflicts, inverse edge deltas and root-first effect ordering for group restoration.
 * [POS]: 纯撤销规则库；事务层负责生命周期、DAG 和原子提交。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Effect, EdgeDelta, PositionEffect } from '../shared/contracts/effects'
import type { Item, Relation } from '../shared/contracts/entities'
import { matchesStatus } from './status'
import { serverText } from '../shared/i18n/server'
import { assistanceServerText } from '../shared/i18n/assistance'

export function undoEffectOrder(effects: Effect[]): number[] {
  const reversed = effects.map((_, index) => index).reverse()
  const groups = reversed.filter(index => effects[index]!.kind === 'groupPlacement')
  const restored = new Set<number>()
  const order: number[] = []
  for (const index of reversed) {
    const effect = effects[index]!
    if (effect.kind === 'groupPlacement') continue
    order.push(index)
    if (effect.kind === 'position') for (const childIndex of groups) {
      const child = effects[childIndex]!
      if (child.kind === 'groupPlacement' && child.before.nestingParentId === effect.itemId && !restored.has(childIndex)) {
        order.push(childIndex)
        restored.add(childIndex)
      }
    }
  }
  return [...order, ...groups.filter(index => !restored.has(index))]
}

export function samePosition(a: PositionEffect, b: PositionEffect): boolean {
  return a.horizon === b.horizon && a.periodId === b.periodId && a.previousId === b.previousId && a.nextId === b.nextId && (a.nestingParentId ?? null) === (b.nestingParentId ?? null)
}
export function sameEdge(a: Relation | undefined, b: Relation): boolean {
  return !!a && a.id === b.id && a.parentId === b.parentId && a.childId === b.childId && a.createdAt === b.createdAt
    && a.invalidatedAt === b.invalidatedAt && a.invalidatedBy === b.invalidatedBy && a.reason === b.reason
}
export function effectProblem(effect: Effect, item: Item, edges: Relation[], position: PositionEffect): string | null {
  if (effect.kind !== 'visibility' && item.deletedAt !== null) return serverText().undo.itemDeleted
  if (effect.kind === 'description' && item.description !== effect.after) return assistanceServerText().notesChanged
  if (effect.kind === 'status' && !matchesStatus(item, effect.after)) return serverText().undo.statusChanged
  if (effect.kind === 'archive' && item.archivedAt !== effect.after) return serverText().undo.archiveChanged
  if (effect.kind === 'position' && !samePosition(position, effect.after)) return serverText().undo.positionChanged
  if (effect.kind === 'nesting' && (!samePosition(position, effect.after) || (item.placement.nestingParentId ?? null) !== effect.after.nestingParentId)) return serverText().undo.positionChanged
  if (effect.kind === 'groupPlacement' && (item.placement.horizon !== effect.after.horizon || item.placement.periodId !== effect.after.periodId || item.placement.nestingParentId !== effect.after.nestingParentId)) return serverText().undo.positionChanged
  if (effect.kind === 'visibility' && (item.deletedAt !== effect.after.deletedAt || item.deletedBy !== effect.after.deletedBy)) return serverText().undo.visibilityChanged
  if (effect.kind === 'relations' || effect.kind === 'visibility' || effect.kind === 'nesting') {
    if (effect.edges.some(delta => !sameEdge(edges.find(edge => edge.id === delta.after.id), delta.after))) return serverText().undo.relationsChanged
  }
  if ((effect.kind === 'relations' || effect.kind === 'nesting') && effect.flowColor && item.flowColor !== effect.flowColor.after) return serverText().undo.flowColorChanged
  if (effect.kind === 'create') {
    if (item.archivedAt || !matchesStatus(item, effect.status) || item.placement.horizon !== effect.horizon || item.placement.periodId !== effect.periodId) return serverText().undo.createdChanged
    const incident = edges.filter(edge => !edge.invalidatedAt && (edge.parentId === item.id || edge.childId === item.id))
    if (incident.length !== effect.initialRelations.length || incident.some(edge => !effect.initialRelations.includes(edge.id))) return serverText().undo.createdRelationsChanged
  }
  return null
}
export function inverseEdges(deltas: EdgeDelta[], operationId: string, now: string): Relation[] {
  return deltas.map(delta => delta.before ?? { ...delta.after, invalidatedAt: now, invalidatedBy: operationId, reason: 'unlink' })
}

export function insertionProblem(position: PositionEffect, orderedIds: string[]): string | null {
  const index = position.nextId === null ? orderedIds.length : orderedIds.indexOf(position.nextId)
  return index < 0 || (orderedIds[index - 1] ?? null) !== position.previousId ? serverText().undo.orderUnsafe : null
}
