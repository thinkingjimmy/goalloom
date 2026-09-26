/**
 * [INPUT]: Stable snapshot topology and all flow roots.
 * [OUTPUT]: Nonempty membership/color caches and visible top-bar flow ordering.
 * [POS]: Renderer projection bounded by current topology; unrelated items share empty results without per-item retention.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useMemo } from 'react'
import { flowIndex } from '../../domain/flows'
import type { Flow, Snapshot } from '../../shared/contracts/queries'

/** Unarchived flows in top-bar order; chip position also drives the ⌘1…⌘9 filter shortcuts. */
export const visibleFlows = (all: Flow[]): Flow[] => all.filter(flow => !flow.archived)

export interface Flows {
  all: Flow[]
  visible: Flow[]
  of: (itemId: string) => Flow[]
  colorsOf: (itemId: string) => number[]
  owner: (color: number) => Flow | undefined
  isRoot: (itemId: string) => boolean
}
export function useFlows(snapshot: Snapshot | null): Flows {
  return useMemo(() => {
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
      all, of, visible: visibleFlows(all),
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
}
