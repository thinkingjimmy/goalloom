/**
 * [INPUT]: Stable snapshot topology, flow roots, ordered board summaries, completed-task layout, active flow ids and the focused task.
 * [OUTPUT]: Nonempty membership/color caches, top-bar flow order and a direct goal/ownership graph and chain without duplicate inherited incoming lines.
 * [POS]: Renderer projection bounded by current topology; unrelated items share empty results without per-item retention.
 */
import { useMemo } from 'react'
import { useCollapseCompleted } from './completed-layout'
import { combinedTopology, localNestingParentId } from '../../domain/nesting'
import { flowIndex } from '../../domain/flows'
import { horizons } from '../../shared/contracts/values'
import type { ItemSummary } from '../../shared/contracts/entities'
import type { Flow, Snapshot } from '../../shared/contracts/queries'

/** Unarchived flows in top-bar order; chip position also drives the ⌘1…⌘9 filter shortcuts. */
export function visibleFlows(all: Flow[], items: ItemSummary[], collapseCompleted = false): Flow[] {
  const byId = new Map(items.map(item => [item.id, item]))
  const group = (item: ItemSummary) => localNestingParentId(item, byId) ?? item.id
  const todo = new Set(items.filter(item => item.status === 'todo').map(group))
  const positions = new Map(items.map((item, index) => [item.id, {
    column: horizons.indexOf(item.placement.horizon), done: Number(collapseCompleted && !todo.has(group(item))), index,
  }]))
  for (const item of items) if (item.placement.nestingParentId && !positions.has(item.placement.nestingParentId)) positions.set(item.placement.nestingParentId, positions.get(item.id)!)
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
  descendantsOf?: ((itemId: string) => string[]) | undefined
  isRoot: (itemId: string) => boolean
}

export interface FlowGraph {
  traversal?: readonly { parentId: string; childId: string }[]
  members: ReadonlySet<string>
  edges: (Snapshot['relations'][number] & { flowId: string; kind?: 'nesting' })[]
}

export function activeFlowGraph(items: ItemSummary[], relations: Snapshot['relations'], flows: Flows, flowIds: string[], nesting: NonNullable<Snapshot['nesting']> = []): FlowGraph {
  if (!flowIds.length) return { members: new Set(), edges: [] }
  const active = new Map<string, string[]>()
  for (const item of items) {
    const shared = flows.of(item.id).filter(flow => flowIds.includes(flow.id)).map(flow => flow.id)
    if (shared.length) active.set(item.id, shared)
  }
  // An edge belongs to the first active flow shared by both endpoints.
  const byId = new Map(items.map(item => [item.id, item]))
  const planningNesting = nesting.filter(link => byId.get(link.parentId)?.placement.horizon !== 'later' && byId.get(link.childId)?.placement.horizon !== 'later')
  // Persisted relation ids cannot contain '/', so ownership paths have a separate key space.
  const direct = [...relations.filter(edge => !edge.inheritedFrom), ...planningNesting.map(link => ({ ...link, id: `nest/${link.childId}`, kind: 'nesting' as const }))]
  const edges = direct.flatMap(edge => {
    const flowId = active.get(edge.childId)?.find(id => active.get(edge.parentId)?.includes(id))
    return flowId ? [{ ...edge, flowId }] : []
  })
  return { members: new Set(active.keys()), edges, traversal: edges }
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
      for (const edge of graph.traversal ?? graph.edges) {
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
    const topology = combinedTopology(snapshot?.relations ?? [], snapshot?.nesting ?? [])
    const resolve = flowIndex(topology, byId.keys())
    let descendants: Map<string, string[]> | null = null
    const children = new Set([...snapshot?.relations ?? [], ...snapshot?.nesting ?? []].map(edge => edge.childId))
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
      descendantsOf: itemId => {
        if (!descendants) {
          descendants = new Map()
          for (const edge of topology) { const rows = descendants.get(edge.parentId) ?? []; rows.push(edge.childId); descendants.set(edge.parentId, rows) }
        }
        const seen = new Set<string>(), pending = [itemId]
        while (pending.length) { const id = pending.pop()!; for (const child of descendants.get(id) ?? []) if (!seen.has(child)) { seen.add(child); pending.push(child) } }
        return [...seen]
      },
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
  }, [snapshot?.flows, snapshot?.relations, snapshot?.nesting])
  const collapseCompleted = useCollapseCompleted()
  const visible = useMemo(() => visibleFlows(memberships.all, items, collapseCompleted), [memberships.all, items, collapseCompleted])
  return useMemo(() => ({ ...memberships, visible }), [memberships, visible])
}
