/**
 * [INPUT]: 当前条目/关系/语义位置，以及不可变操作效果。
 * [OUTPUT]: 只检查本次效果字段和依赖的冲突原因、关系逆向差量。
 * [POS]: 纯撤销规则库；事务层负责生命周期、DAG 和原子提交。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { Effect, EdgeDelta, PositionEffect } from '../shared/contracts/effects'
import type { Item, Relation } from '../shared/contracts/entities'
import { matchesStatus } from './status'
import { serverText } from '../shared/i18n/server'

export function samePosition(a: PositionEffect, b: PositionEffect): boolean {
  return a.horizon === b.horizon && a.periodId === b.periodId && a.previousId === b.previousId && a.nextId === b.nextId
}
export function sameEdge(a: Relation | undefined, b: Relation): boolean {
  return !!a && a.id === b.id && a.parentId === b.parentId && a.childId === b.childId && a.createdAt === b.createdAt
    && a.invalidatedAt === b.invalidatedAt && a.invalidatedBy === b.invalidatedBy && a.reason === b.reason
}
export function effectProblem(effect: Effect, item: Item, edges: Relation[], position: PositionEffect): string | null {
  if (effect.kind !== 'visibility' && item.deletedAt !== null) return serverText().undo.itemDeleted
  if (effect.kind === 'status' && !matchesStatus(item, effect.after)) return serverText().undo.statusChanged
  if (effect.kind === 'archive' && item.archivedAt !== effect.after) return serverText().undo.archiveChanged
  if (effect.kind === 'position' && !samePosition(position, effect.after)) return serverText().undo.positionChanged
  if (effect.kind === 'visibility' && (item.deletedAt !== effect.after.deletedAt || item.deletedBy !== effect.after.deletedBy)) return serverText().undo.visibilityChanged
  if (effect.kind === 'relations' || effect.kind === 'visibility') {
    if (effect.edges.some(delta => !sameEdge(edges.find(edge => edge.id === delta.after.id), delta.after))) return serverText().undo.relationsChanged
  }
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
