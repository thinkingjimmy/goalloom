/**
 * [INPUT]: Explicit endpoints, active topology, effective flow membership and planning horizons.
 * [OUTPUT]: DAG/horizon validation, flow-link eligibility and safe color promotion to an isolated parent.
 * [POS]: Shared transaction/renderer relationship rules; undo, restore and import retain existing edges.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { horizons } from '../shared/contracts/values'
import type { Item, ItemHorizon, Relation } from '../shared/contracts/entities'
import { serverText } from '../shared/i18n/server'

// Later is a parking lot, not a planning horizon: it never takes part in relations. A parent is a bigger goal, so it
// must sit in a strictly longer horizon. Only new links are held to this; moves, undo, restore and import keep edges.
export const mayParent = (parent: ItemHorizon, child: ItemHorizon): boolean =>
  parent !== 'later' && child !== 'later' && horizons.indexOf(parent) < horizons.indexOf(child)

export const mayLinkFlows = (parentHasFlow: boolean, childHasFlow: boolean): boolean => parentHasFlow || childHasFlow

export function promotedFlowColor(parent: Pick<Item, 'id' | 'flowColor'>, child: Pick<Item, 'flowColor'>, activeEdges: readonly Pick<Relation, 'parentId' | 'childId'>[]): number | null {
  return child.flowColor !== null && parent.flowColor === null && !activeEdges.some(edge => edge.parentId === parent.id || edge.childId === parent.id)
    ? child.flowColor : null
}

export function horizonProblem(parent: ItemHorizon, child: ItemHorizon): string | null {
  if (parent === 'later' || child === 'later') return serverText().relations.laterEndpoint
  return mayParent(parent, child) ? null : serverText().relations.horizonOrder
}

export function relationProblem(parentId: string, childId: string, edges: Relation[]): string | null {
  if (parentId === childId) return serverText().relations.self
  const active = edges.filter(edge => edge.invalidatedAt === null)
  if (active.some(edge => edge.parentId === parentId && edge.childId === childId)) return serverText().relations.duplicate
  const children = new Map<string, string[]>()
  for (const edge of active) {
    const group = children.get(edge.parentId) ?? []
    group.push(edge.childId); children.set(edge.parentId, group)
  }
  const pending = [childId]
  const seen = new Set<string>()
  while (pending.length) {
    const id = pending.pop()!
    if (id === parentId) return serverText().relations.cycle
    if (seen.has(id)) continue
    seen.add(id)
    pending.push(...(children.get(id) ?? []))
  }
  return null
}

export function validateDag(itemIds: Set<string>, edges: Relation[], deletedIds = new Set<string>()): void {
  const identities = new Set<string>()
  const pairs = new Set<string>(), children = new Map<string, string[]>(), degrees = new Map<string, number>()
  for (const edge of edges) {
    if (identities.has(edge.id) || !itemIds.has(edge.parentId) || !itemIds.has(edge.childId) || edge.parentId === edge.childId) throw new Error(serverText().relations.invalidEdge)
    identities.add(edge.id)
    if (edge.invalidatedAt !== null) continue
    if (deletedIds.has(edge.parentId) || deletedIds.has(edge.childId)) throw new Error(serverText().relations.deletedEndpoint)
    const pair = JSON.stringify([edge.parentId, edge.childId])
    if (pairs.has(pair)) throw new Error(serverText().relations.duplicate)
    pairs.add(pair)
    const group = children.get(edge.parentId) ?? []
    group.push(edge.childId); children.set(edge.parentId, group)
    degrees.set(edge.childId, (degrees.get(edge.childId) ?? 0) + 1)
  }
  // --- Kahn 拓扑遍历：整库校验 O(V+E)，不逐边重复扫描整张图。 ---
  const pending = [...itemIds].filter(id => !degrees.has(id))
  let visited = 0
  while (pending.length) {
    const id = pending.pop()!
    visited++
    for (const child of children.get(id) ?? []) {
      const degree = degrees.get(child)! - 1
      degrees.set(child, degree)
      if (!degree) pending.push(child)
    }
  }
  if (visited !== itemIds.size) throw new Error(serverText().relations.cycle)
}
