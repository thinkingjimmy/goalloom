/**
 * [INPUT]: 权威快照中的有效关系与全部流程根。
 * [OUTPUT]: visibleFlows（顶栏筛选顺序的未归档流程）；useFlows：全部/可筛选流程、条目所属流程/颜色与颜色占用查询。
 * [POS]: renderer/state 的派生视图；归属规则来自 domain/flows，唯一性由事务强制。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
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
    const of = (itemId: string) => resolve(itemId).map(id => byId.get(id)!)
    return {
      all, of, visible: visibleFlows(all),
      colorsOf: itemId => of(itemId).slice(0, 2).map(flow => flow.flowColor),
      owner: color => all.find(flow => flow.flowColor === color),
      isRoot: itemId => !children.has(itemId),
    }
  }, [snapshot?.flows, snapshot?.relations])
}
