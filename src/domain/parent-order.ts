/**
 * [INPUT]: Lightweight placements, active topology and an injected observation time.
 * [OUTPUT]: Nearest-parent groups and transitive ordering without placement writes.
 * [POS]: Shared board/transaction rule; lifecycle state never determines parent priority.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ItemHorizon } from '../shared/contracts/entities'
import type { OrderNode } from '../shared/contracts/queries'
import { periodHorizons } from '../shared/contracts/values'

const rank = (horizon: ItemHorizon) => periodHorizons.findIndex(value => value === horizon)
const textOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
export const parentOrderedHorizon = (horizon: ItemHorizon) => rank(horizon) > 0

export function buildParentOrder(nodes: readonly OrderNode[], edges: readonly { parentId: string; childId: string }[], now: string) {
  const byId = new Map(nodes.map(node => [node.id, node])), time = Date.parse(now)
  const parents = new Map<string, OrderNode[]>(), groups = new Map<string, string | null>()
  const editable = (node: OrderNode) => parentOrderedHorizon(node.horizon) && !!node.periodEnd && Date.parse(node.periodEnd) > time
  for (const edge of edges) {
    const parent = byId.get(edge.parentId), child = byId.get(edge.childId)
    if (!parent || !child || rank(parent.horizon) < 0 || rank(parent.horizon) >= rank(child.horizon)) continue
    const list = parents.get(child.id) ?? []
    list.push(parent); parents.set(child.id, list)
  }
  const manual = (a: OrderNode, b: OrderNode) => a.sortKey - b.sortKey || textOrder(a.id, b.id)
  const compareParents = (a: OrderNode, b: OrderNode): number => rank(b.horizon) - rank(a.horizon)
    || textOrder(a.periodStart ?? '', b.periodStart ?? '') || compareNodes(a, b)
  function group(id: string): string | null {
    if (groups.has(id)) return groups.get(id)!
    let first: OrderNode | undefined
    for (const parent of parents.get(id) ?? []) if (!first || compareParents(parent, first) < 0) first = parent
    const result = first?.id ?? null
    groups.set(id, result)
    return result
  }
  function compareNodes(a: OrderNode, b: OrderNode): number {
    if (a.id === b.id) return 0
    if (a.horizon !== b.horizon) return rank(a.horizon) - rank(b.horizon)
    if (a.periodId !== b.periodId) return textOrder(a.periodStart ?? '', b.periodStart ?? '') || textOrder(a.periodId ?? '', b.periodId ?? '')
    if (editable(a) && editable(b)) {
      const pa = group(a.id), pb = group(b.id)
      if (pa !== pb) {
        if (!pa) return 1
        if (!pb) return -1
        const result = compareParents(byId.get(pa)!, byId.get(pb)!)
        if (result) return result
      }
    }
    return manual(a, b)
  }
  const compare = (a: string, b: string) => {
    const left = byId.get(a), right = byId.get(b)
    return left && right ? compareNodes(left, right) : textOrder(a, b)
  }
  return { group, compare, editable: (id: string) => { const node = byId.get(id); return !!node && editable(node) },
    sort: <T extends { id: string }>(items: readonly T[]): T[] => [...items].sort((a, b) => compare(a.id, b.id)) }
}
