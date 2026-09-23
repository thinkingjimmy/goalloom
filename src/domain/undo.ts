/**
 * [INPUT]: 当前条目/关系/语义位置，以及不可变操作效果。
 * [OUTPUT]: 只检查本次效果字段和依赖的冲突原因、关系逆向差量。
 * [POS]: 纯撤销规则库；事务层负责生命周期、DAG 和原子提交。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { Effect, EdgeDelta, PositionEffect } from '../shared/contracts/effects'
import type { Item, Relation } from '../shared/contracts/entities'
import { matchesStatus } from './status'

export function samePosition(a: PositionEffect, b: PositionEffect): boolean {
  return a.horizon === b.horizon && a.periodId === b.periodId && a.previousId === b.previousId && a.nextId === b.nextId
}
export function sameEdge(a: Relation | undefined, b: Relation): boolean {
  return !!a && a.id === b.id && a.parentId === b.parentId && a.childId === b.childId && a.createdAt === b.createdAt
    && a.invalidatedAt === b.invalidatedAt && a.invalidatedBy === b.invalidatedBy && a.reason === b.reason
}
export function effectProblem(effect: Effect, item: Item, edges: Relation[], position: PositionEffect): string | null {
  if (effect.kind !== 'visibility' && item.deletedAt !== null) return '条目已删除，不能撤销这一步'
  if (effect.kind === 'status' && !matchesStatus(item, effect.after)) return '完成状态已发生后续变化'
  if (effect.kind === 'archive' && item.archivedAt !== effect.after) return '归档状态已发生后续变化'
  if (effect.kind === 'position' && !samePosition(position, effect.after)) return '位置或依赖的相邻顺序已变化'
  if (effect.kind === 'visibility' && (item.deletedAt !== effect.after.deletedAt || item.deletedBy !== effect.after.deletedBy)) return '删除或还原已发生后续变化'
  if (effect.kind === 'relations' || effect.kind === 'visibility') {
    if (effect.edges.some(delta => !sameEdge(edges.find(edge => edge.id === delta.after.id), delta.after))) return '这次关系已经发生后续变化'
  }
  if (effect.kind === 'create') {
    if (item.archivedAt || !matchesStatus(item, effect.status) || item.placement.horizon !== effect.horizon || item.placement.periodId !== effect.periodId) return '新建条目已有状态或计划变化'
    const incident = edges.filter(edge => !edge.invalidatedAt && (edge.parentId === item.id || edge.childId === item.id))
    if (incident.length !== effect.initialRelations.length || incident.some(edge => !effect.initialRelations.includes(edge.id))) return '新建条目的关联依赖已变化'
  }
  return null
}
export function inverseEdges(deltas: EdgeDelta[], operationId: string, now: string): Relation[] {
  return deltas.map(delta => delta.before ?? { ...delta.after, invalidatedAt: now, invalidatedBy: operationId, reason: 'unlink' })
}

export function insertionProblem(position: PositionEffect, orderedIds: string[]): string | null {
  const index = position.nextId === null ? orderedIds.length : orderedIds.indexOf(position.nextId)
  return index < 0 || (orderedIds[index - 1] ?? null) !== position.previousId ? '原位置的依赖顺序无法安全还原' : null
}
