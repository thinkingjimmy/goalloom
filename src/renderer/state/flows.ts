/**
 * [INPUT]: Stable snapshot topology, flow roots, ordered board summaries, active flow ids and the focused task.
 * [OUTPUT]: Nonempty membership/color caches, top-bar flow order and a shared active graph/chain for relation lines and preview actions.
 * [POS]: Renderer projection bounded by current topology; unrelated items share empty results without per-item retention.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useMemo } from 'react'
import { flowIndex } from '../../domain/flows'
import { horizons } from '../../shared/contracts/values'
import type { ItemSummary } from '../../shared/contracts/entities'
import type { Flow, Snapshot } from '../../shared/contracts/queries'

/** Unarchived flows in top-bar order; chip position also drives the ⌘1…⌘9 filter shortcuts. */
export function visibleFlows(all: Flow[], items: ItemSummary[]): Flow[] {
  const positions = new Map(items.map((item, index) => [item.id, {
    column: horizons.indexOf(item.placement.horizon), done: Number(item.status === 'done'), index,
  }]))
  return all.filter(flow => !flow.archived).sort((a, b) => {
    const left = positions.get(a.id), right = positions.get(b.id)
    // Roots outside the displayed periods remain accessible after the board's roots.
    if (!left || !right) return left ? -1 : right ? 1 : 0
    return left.column - right.column || left.done - right.done || left.index - right.index
  })
}

export interface Flows {
  all: Flow[]
  visible: Flow[]
  of: (itemId: string) => Flow[]
  colorsOf: (itemId: string) => number[]
  owner: (color: number) => Flow | undefined
  isRoot: (itemId: string) => boolean
}

export interface FlowGraph {
  members: ReadonlySet<string>
  edges: (Snapshot['relations'][number] & { flowId: string })[]
}

export function activeFlowGraph(items: ItemSummary[], relations: Snapshot['relations'], flows: Flows, flowIds: string[]): FlowGraph {
  if (!flowIds.length) return { members: new Set(), edges: [] }
  const active = new Map<string, string[]>()
  for (const item of items) {
    const shared = flows.of(item.id).filter(flow => flowIds.includes(flow.id)).map(flow => flow.id)
    if (shared.length) active.set(item.id, shared)
  }
  // An edge belongs to the first active flow shared by both endpoints.
  const edges = relations.flatMap(edge => {
    const flowId = active.get(edge.childId)?.find(id => active.get(edge.parentId)?.includes(id))
    return flowId ? [{ ...edge, flowId }] : []
  })
  return { members: new Set(active.keys()), edges }
}

export function flowChain(graph: FlowGraph, focus: string | null): ReadonlySet<string> | null {
  if (!focus) return null
  const found = new Set<string>()
  if (!graph.members.has(focus)) return found
  found.add(focus)
  // Walk each direction from the focus, never down from its ancestors into sibling branches.
  for (const up of [true, false]) {
    const pending = [focus]
    while (pending.length) {
      const id = pending.pop()!
      for (const edge of graph.edges) {
        const [from, to] = up ? [edge.childId, edge.parentId] : [edge.parentId, edge.childId]
        if (from === id && !found.has(to)) { found.add(to); pending.push(to) }
      }
    }
  }
  return found
}

export function useFlows(snapshot: Snapshot | null, items: ItemSummary[]): Flows {
  const memberships = useMemo<Omit<Flows, 'visible'>>(() => {
    const all = snapshot?.flows ?? []
    const byId = new Map(all.map(flow => [flow.id, flow]))
    const resolve = flowIndex(snapshot?.relations ?? [], byId.keys())
    const children = new Set((snapshot?.relations ?? []).map(edge => edge.childId))
    const resolved = new Map<string, Flow[]>(), colors = new Map<string, number[]>()
    const emptyFlows: Flow[] = [], emptyColors: number[] = []
    const of = (itemId: string) => {
      const cached = resolved.get(itemId)
      if (cached) return cached
      const memberships = resolve(itemId)
      if (!memberships.length) return emptyFlows
      const flows = memberships.map(id => byId.get(id)!)
      resolved.set(itemId, flows)
      return flows
    }
    return {
      all, of,
      colorsOf: itemId => {
        const cached = colors.get(itemId)
        if (cached) return cached
        const memberships = of(itemId)
        if (!memberships.length) return emptyColors
        const values = memberships.slice(0, 2).map(flow => flow.flowColor)
        colors.set(itemId, values)
        return values
      },
      owner: color => all.find(flow => flow.flowColor === color),
      isRoot: itemId => !children.has(itemId),
    }
  }, [snapshot?.flows, snapshot?.relations])
  const visible = useMemo(() => visibleFlows(memberships.all, items), [memberships.all, items])
  return useMemo(() => ({ ...memberships, visible }), [memberships, visible])
}
