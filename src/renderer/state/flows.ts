/**
 * [INPUT]: Stable snapshot topology, all flow roots and ordered board summaries.
 * [OUTPUT]: Nonempty membership/color caches and top-bar flows in column/row order.
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
