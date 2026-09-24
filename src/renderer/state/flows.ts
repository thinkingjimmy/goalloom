/**
 * [INPUT]: Stable snapshot topology and all flow roots.
 * [OUTPUT]: Memoized memberships, colors and visible top-bar flow ordering.
 * [POS]: Renderer projection using shared domain ancestor memoization.
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
    const of = (itemId: string) => {
      if (!resolved.has(itemId)) resolved.set(itemId, resolve(itemId).map(id => byId.get(id)!))
      return resolved.get(itemId)!
    }
    return {
      all, of, visible: visibleFlows(all),
      colorsOf: itemId => { if (!colors.has(itemId)) colors.set(itemId, of(itemId).slice(0, 2).map(flow => flow.flowColor)); return colors.get(itemId)! },
      owner: color => all.find(flow => flow.flowColor === color),
      isRoot: itemId => !children.has(itemId),
    }
  }, [snapshot?.flows, snapshot?.relations])
}
