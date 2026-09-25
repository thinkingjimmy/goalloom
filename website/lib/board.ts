/**
 * [INPUT]: Has no runtime dependencies
 * [OUTPUT]: Exports the demo workspace (SEED, HORIZONS, FLOWS), deriveView and the RowState/EdgeView contracts
 * [POS]: The site's one model of the Goalloom board; the hero demo, the relation-line figures and the Jev demo all
 *        render views of it, and it mirrors the app's rules: a filtered flow lights its rows and edges, hovering a
 *        lit row keeps only its ancestor/descendant chain, skipped horizons draw dashed, relations never roll up.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */

export const HORIZONS = ['cycle', 'month', 'week', 'day'] as const
export type Horizon = (typeof HORIZONS)[number]
export const FLOWS = ['a', 'b', 'c'] as const
export type FlowId = (typeof FLOWS)[number]
export type ItemId = 'q1' | 'q2' | 'q3' | 'm1' | 'm2' | 'm3' | 'm4' | 'w1' | 'w2' | 'w3' | 'w4' | 'w5' | 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'n1' | 'n2'

export type DemoItem = { id: ItemId; horizon: Horizon; flow?: FlowId; parents?: ItemId[]; done?: boolean }

export const SEED: readonly DemoItem[] = [
  { id: 'q1', horizon: 'cycle', flow: 'a' }, { id: 'q2', horizon: 'cycle', flow: 'b' }, { id: 'q3', horizon: 'cycle', flow: 'c' },
  { id: 'm1', horizon: 'month', flow: 'a', parents: ['q1'] }, { id: 'm2', horizon: 'month', flow: 'a', parents: ['q1'] },
  { id: 'm3', horizon: 'month', flow: 'b', parents: ['q2'] }, { id: 'm4', horizon: 'month', flow: 'c', parents: ['q3'] },
  { id: 'w1', horizon: 'week', flow: 'a', parents: ['m1'] }, { id: 'w2', horizon: 'week', flow: 'a', parents: ['m1'] },
  { id: 'w3', horizon: 'week', flow: 'a', parents: ['m2'] }, { id: 'w4', horizon: 'week', flow: 'b', parents: ['m3'] },
  { id: 'w5', horizon: 'week' },
  { id: 'd1', horizon: 'day', flow: 'a', parents: ['w1'] }, { id: 'd2', horizon: 'day', flow: 'a', parents: ['w2'] },
  // d3 skips the week on purpose: a relation may cross more than one horizon and then draws dashed.
  { id: 'd3', horizon: 'day', flow: 'b', parents: ['m3'] }, { id: 'd4', horizon: 'day' }, { id: 'd5', horizon: 'day', done: true },
]

export type RowState = 'plain' | 'lit' | 'hot' | 'out' | 'dim'
export type EdgeView = { from: ItemId; to: ItemId; state: 'normal' | 'hot' | 'faded'; skip: boolean }

function chainOf(items: readonly DemoItem[], id: ItemId): Set<ItemId> {
  const byId = new Map(items.map(item => [item.id, item]))
  const chain = new Set<ItemId>()
  const up = [id]
  while (up.length) {
    const next = up.pop()!
    if (chain.has(next)) continue
    chain.add(next)
    up.push(...(byId.get(next)?.parents ?? []))
  }
  const down = [id]
  while (down.length) {
    const next = down.pop()!
    for (const item of items) if (item.parents?.includes(next) && !chain.has(item.id)) { chain.add(item.id); down.push(item.id) }
  }
  return chain
}

/** One board view: which rows are lit/hot/out/dim and which relation lines show, for a filter and a hovered row. */
export function deriveView(items: readonly DemoItem[], filter: FlowId | null, hover: ItemId | null) {
  const lit = (item: DemoItem | undefined) => !!filter && item?.flow === filter
  const byId = new Map(items.map(item => [item.id, item]))
  const chain = filter && hover && lit(byId.get(hover)) ? chainOf(items, hover) : null
  const rows = new Map<ItemId, RowState>()
  for (const item of items) {
    if (!filter) rows.set(item.id, 'plain')
    else if (!lit(item)) rows.set(item.id, 'dim')
    else if (chain && !chain.has(item.id)) rows.set(item.id, 'out')
    else rows.set(item.id, item.id === hover ? 'hot' : 'lit')
  }
  const edges: EdgeView[] = []
  if (filter) {
    for (const child of items) {
      for (const parentId of child.parents ?? []) {
        const parent = byId.get(parentId)
        if (!parent || !lit(parent) || !lit(child)) continue
        const state = chain ? (chain.has(parentId) && chain.has(child.id) ? 'hot' : 'faded') : 'normal'
        edges.push({ from: parentId, to: child.id, state, skip: HORIZONS.indexOf(child.horizon) - HORIZONS.indexOf(parent.horizon) > 1 })
      }
    }
  }
  return { rows, edges }
}
