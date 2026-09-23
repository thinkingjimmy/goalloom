/**
 * [INPUT]: 显式端点集合与有效/失效关系快照。
 * [OUTPUT]: 多父 DAG 的自关联/重复/环校验，不修改实体或状态。
 * [POS]: 可复用关系规则；事务、撤销、还原和导入共同使用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { Relation } from '../shared/contracts/entities'

export function relationProblem(parentId: string, childId: string, edges: Relation[]): string | null {
  if (parentId === childId) return '不能关联到自己'
  const active = edges.filter(edge => edge.invalidatedAt === null)
  if (active.some(edge => edge.parentId === parentId && edge.childId === childId)) return '这两个条目已经关联'
  const children = new Map<string, string[]>()
  for (const edge of active) children.set(edge.parentId, [...(children.get(edge.parentId) ?? []), edge.childId])
  const pending = [childId]
  const seen = new Set<string>()
  while (pending.length) {
    const id = pending.pop()!
    if (id === parentId) return '此关联会形成循环'
    if (seen.has(id)) continue
    seen.add(id)
    pending.push(...(children.get(id) ?? []))
  }
  return null
}

export function validateDag(itemIds: Set<string>, edges: Relation[], deletedIds = new Set<string>()): void {
  const identities = new Set<string>()
  const active: Relation[] = []
  for (const edge of edges) {
    if (identities.has(edge.id) || !itemIds.has(edge.parentId) || !itemIds.has(edge.childId) || edge.parentId === edge.childId) throw new Error('关系身份或端点无效')
    identities.add(edge.id)
    if (edge.invalidatedAt !== null) continue
    if (deletedIds.has(edge.parentId) || deletedIds.has(edge.childId)) throw new Error('有效关系包含已删除端点')
    const problem = relationProblem(edge.parentId, edge.childId, active)
    if (problem) throw new Error(problem)
    active.push(edge)
  }
}
