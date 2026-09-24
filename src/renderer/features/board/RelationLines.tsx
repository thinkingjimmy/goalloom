/**
 * [INPUT]: Board summaries and active topology, stable flow membership, the active flow ids, an optional externally focused item (flow-dot
 *          preview), whether to draw in, and visible columns; reads mounted row geometry from the enclosing `.board`.
 * [OUTPUT]: Read-only overlay: parent→child curves between rendered rows sharing an active flow, each in that flow's colour (dashed across
 *           skipped horizons), ending at the child's flow dot; hover/focus chain highlighting (other rows faded via `data-chain-out`) and
 *           edge markers that reveal an off-screen related row.
 * [POS]: Board decoration mounted while one flow is filtered or a flow dot is previewed, with the device preference on; never writes
 *        workspace data or undo state.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { horizons, type ItemHorizon, type ItemSummary } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import { messages } from '../../i18n'
import { flowStroke } from '../../lib/colors'
import type { Flows } from '../../state/flows'
import { Icon } from '../../components/icons'
import { revealRow } from './VirtualRows'

interface Anchor { left: number; right: number; y: number; mid: number; off: 'up' | 'down' | null; done: boolean; content: Element }
interface Path { id: string; d: string; skip: boolean; done: boolean; delay: number; parentId: string; childId: string; color: string }
interface Port { key: string; x: number; y: number; itemId: string; color: string }
interface Marker { key: string; x: number; y: number; dir: 'up' | 'down'; align: 'start' | 'end'; ids: string[]; color: string }
interface Geometry { width: number; height: number; paths: Path[]; ports: Port[]; markers: Marker[] }
const empty: Geometry = { width: 0, height: 0, paths: [], ports: [], markers: [] }
// Off-screen endpoints park this far inside the column edge, where their marker sits.
const inset = 14
// A forward curve ends on the child's flow dot, which sits this far left of the row.
const dotOffset = 8

export function RelationLines({ items, relations, flows, flowIds, focus, animate, columns }: {
  items: ItemSummary[]; relations: Snapshot['relations']; flows: Flows; flowIds: string[]; focus: string | null; animate: boolean; columns: ItemHorizon[]
}) {
  const { edges, members, horizonOf } = useMemo(() => {
    // Each row keeps the active flows it belongs to; an edge draws in the first flow both ends share.
    const active = new Map<string, string[]>()
    for (const item of items) {
      const shared = flows.of(item.id).filter(flow => flowIds.includes(flow.id)).map(flow => flow.id)
      if (shared.length) active.set(item.id, shared)
    }
    const colorOf = new Map(flows.all.map(flow => [flow.id, flowStroke(flow.flowColor)]))
    const horizonOf = new Map(items.map(item => [item.id, item.placement.horizon]))
    const edges = relations.flatMap(edge => {
      const flow = active.get(edge.childId)?.find(id => active.get(edge.parentId)?.includes(id))
      return flow ? [{ ...edge, color: colorOf.get(flow)! }] : []
    })
    return { members: new Set(active.keys()), horizonOf, edges }
  }, [items, relations, flows, flowIds])
  const [geometry, setGeometry] = useState(empty)
  const [pointer, setHover] = useState<string | null>(null)
  // A previewed flow dot owns the chain; otherwise the hovered or focused row does.
  const hover = focus ?? pointer
  const [entering, setEntering] = useState(animate)
  useEffect(() => { if (!animate) return; const timer = setTimeout(() => setEntering(false), 900); return () => clearTimeout(timer) }, [])

  // Hover or focus lights a row's whole ancestor and descendant chain inside this flow.
  const chain = useMemo(() => {
    if (!hover || !members.has(hover)) return null
    const found = new Set([hover])
    const walk = (id: string, up: boolean) => {
      for (const edge of edges) {
        const [from, to] = up ? [edge.childId, edge.parentId] : [edge.parentId, edge.childId]
        if (from === id && !found.has(to)) { found.add(to); walk(to, up) }
      }
    }
    walk(hover, true); walk(hover, false)
    return found
  }, [hover, edges, members])

  const root = useRef<HTMLDivElement>(null)
  const latest = useRef({ edges, members, horizonOf, chain, columns })
  latest.current = { edges, members, horizonOf, chain, columns }
  const measure = () => {
    const board = root.current?.parentElement
    if (!board) return
    const { edges, members, horizonOf, chain, columns } = latest.current
    const origin = board.getBoundingClientRect(), dx = board.scrollLeft - origin.left, dy = -origin.top
    const anchors = new Map<string, Anchor>()
    // Rows that left the active flows (a preview moved on) drop their stale chain fade.
    for (const row of board.querySelectorAll<HTMLElement>('[data-chain-out]')) if (!members.has(row.dataset.itemId ?? '')) delete row.dataset.chainOut
    for (const id of members) {
      const row = document.getElementById(`item-${id}`), content = row?.closest('.column-content')
      if (!row || !content || !board.contains(row)) continue
      // Rows outside the flow keep their own dimming; only this flow's rows join or leave the hovered chain.
      if (chain && !chain.has(id)) row.dataset.chainOut = 'true'; else delete row.dataset.chainOut
      const r = row.getBoundingClientRect(), c = content.getBoundingClientRect(), mid = r.top + r.height / 2
      const off = mid < c.top ? 'up' : mid > c.bottom ? 'down' : null
      const y = off === 'up' ? c.top + inset : off === 'down' ? c.bottom - inset : mid
      anchors.set(id, { left: r.left + dx, right: r.right + dx, y: y + dy, mid, off, done: row.dataset.done === 'true', content })
    }
    const paths: Path[] = [], ports = new Map<string, Port>(), markers = new Map<string, Marker>()
    // A skip-level curve crosses the columns in between along a row boundary, so it never seems to leave a row it merely passes.
    let rows: { left: number; right: number; top: number; bottom: number }[] | null = null
    const lane = (from: number, to: number, target: number) => {
      rows ??= [...board.querySelectorAll('.board-column .task-row')].map(row => { const r = row.getBoundingClientRect(); return { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy } })
      const ys = rows.filter(row => row.left > from && row.right < to).flatMap(row => [row.top, row.bottom])
      return ys.length ? ys.reduce((best, y) => Math.abs(y - target) < Math.abs(best - target) ? y : best) : target
    }
    const port = (key: string, x: number, y: number, itemId: string, color: string) => ports.set(key, { key, x, y, itemId, color })
    const mark = (anchor: Anchor, id: string, align: 'start' | 'end', color: string) => {
      const key = `${anchor.content.parentElement?.getAttribute('data-horizon')}:${anchor.off}:${align}`
      const marker = markers.get(key) ?? { key, x: align === 'start' ? anchor.left : anchor.right, y: anchor.y, dir: anchor.off!, align, ids: [], color }
      if (!marker.ids.includes(id)) marker.ids.push(id)
      markers.set(key, marker)
    }
    for (const edge of edges) {
      const parent = anchors.get(edge.parentId), child = anchors.get(edge.childId)
      if (!parent || !child || (parent.off && child.off)) continue
      const skip = Math.abs(horizons.indexOf(horizonOf.get(edge.parentId)!) - horizons.indexOf(horizonOf.get(edge.childId)!)) > 1
      // Leave from the side facing the other row; rows in one column loop out through the right-hand corridor.
      const forward = parent.right <= child.left, backward = child.right <= parent.left
      const x1 = forward ? parent.right + 3 : backward ? parent.left - 3 : parent.right + 3
      const x2 = forward ? child.left - dotOffset : backward ? child.right + 3 : child.right + 3
      const bend = forward || backward ? Math.max(20, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1) : 0
      let d = bend ? `M${x1} ${parent.y}C${x1 + bend} ${parent.y} ${x2 - bend} ${child.y} ${x2} ${child.y}` : `M${x1} ${parent.y}C${x1 + 36} ${parent.y} ${x2 + 36} ${child.y} ${x2} ${child.y}`
      if (skip && bend && Math.abs(x2 - x1) > 160) {
        const s = Math.sign(bend), xa = x1 + 50 * s, xb = x2 - 50 * s, y = lane(Math.min(x1, x2), Math.max(x1, x2), (parent.y + child.y) / 2)
        d = `M${x1} ${parent.y}C${x1 + 25 * s} ${parent.y} ${xa - 25 * s} ${y} ${xa} ${y}H${xb}C${xb + 25 * s} ${y} ${x2 - 25 * s} ${child.y} ${x2} ${child.y}`
      }
      const delay = Math.min(columns.indexOf(horizonOf.get(edge.parentId)!), columns.indexOf(horizonOf.get(edge.childId)!)) * 70
      paths.push({ id: edge.id, d, skip, done: parent.done || child.done, delay: Math.max(0, delay), parentId: edge.parentId, childId: edge.childId, color: edge.color })
      if (parent.off) mark(parent, edge.parentId, x1 < parent.left ? 'start' : 'end', edge.color); else port(`${edge.parentId}:${x1}`, x1, parent.y, edge.parentId, edge.color)
      // The child's flow dot is the forward endpoint; only loops and backward curves need a drawn port.
      if (child.off) mark(child, edge.childId, x2 < child.left ? 'start' : 'end', edge.color); else if (!forward) port(`${edge.childId}:${x2}`, x2, child.y, edge.childId, edge.color)
    }
    for (const marker of markers.values()) marker.ids.sort((a, b) => anchors.get(a)!.mid - anchors.get(b)!.mid)
    const next: Geometry = { width: board.scrollWidth, height: board.clientHeight, paths, ports: [...ports.values()], markers: [...markers.values()] }
    setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
  }
  const measureRef = useRef(measure); measureRef.current = measure

  useLayoutEffect(() => {
    const overlay = root.current, board = overlay?.parentElement
    if (!overlay || !board) return
    let frame = 0
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; measureRef.current() }) }
    // Rows mount and unmount with virtual windowing, folds and refreshes; the overlay's own renders are ignored.
    const mutations = new MutationObserver(records => { if (records.some(record => !overlay.contains(record.target))) schedule() })
    mutations.observe(board, { childList: true, subtree: true })
    const resize = new ResizeObserver(schedule)
    resize.observe(board)
    board.addEventListener('scroll', schedule, { capture: true, passive: true })
    board.addEventListener('transitionend', schedule)
    let timer = 0
    const enter = (target: EventTarget | null) => {
      const id = (target as HTMLElement | null)?.closest<HTMLElement>('.task-row')?.dataset.itemId
      clearTimeout(timer)
      if (id && latest.current.members.has(id)) setHover(id)
      else leave()
    }
    // A short grace period keeps the chain steady while the pointer crosses gaps between rows.
    const leave = () => { clearTimeout(timer); timer = window.setTimeout(() => setHover(null), 120) }
    const over = (event: Event) => enter(event.target), focus = (event: Event) => enter(event.target)
    board.addEventListener('pointerover', over); board.addEventListener('focusin', focus)
    board.addEventListener('pointerleave', leave); board.addEventListener('focusout', leave)
    measureRef.current()
    return () => {
      cancelAnimationFrame(frame); clearTimeout(timer); mutations.disconnect(); resize.disconnect()
      board.removeEventListener('scroll', schedule, { capture: true })
      board.removeEventListener('transitionend', schedule)
      board.removeEventListener('pointerover', over); board.removeEventListener('focusin', focus)
      board.removeEventListener('pointerleave', leave); board.removeEventListener('focusout', leave)
      for (const row of board.querySelectorAll<HTMLElement>('[data-chain-out]')) delete row.dataset.chainOut
    }
  }, [])
  useLayoutEffect(measure, [edges, chain, columns])

  const state = (path: Path) => !chain ? (path.done ? 'done' : undefined) : chain.has(path.parentId) && chain.has(path.childId) ? 'hot' : 'faded'
  return <div ref={root} className="relation-lines" data-entering={entering} aria-hidden={geometry.markers.length ? undefined : true} style={{ width: geometry.width, height: geometry.height }}>
    <svg width={geometry.width} height={geometry.height} aria-hidden="true">
      {geometry.paths.map(path => <path key={path.id} className="relation-edge" d={path.d} pathLength={path.skip ? undefined : 1} data-skip={path.skip || undefined} data-state={state(path)} style={{ color: path.color, animationDelay: `${path.delay}ms` }} />)}
      {geometry.ports.map(port => <circle key={port.key} className="relation-port" cx={port.x} cy={port.y} r={3} style={{ color: port.color }} data-state={chain ? (chain.has(port.itemId) ? 'hot' : 'faded') : undefined} />)}
    </svg>
    {geometry.markers.map(marker => {
      // Reveal the nearest hidden row in that direction; the rest follow on later clicks.
      const target = marker.ids.at(marker.dir === 'up' ? -1 : 0)!
      const label = marker.dir === 'up' ? messages.relationsAbove(marker.ids.length) : messages.relationsBelow(marker.ids.length)
      return <button key={marker.key} className="relation-marker" data-align={marker.align} style={{ left: marker.x, top: marker.y, color: marker.color }} aria-label={label} title={label} onClick={() => revealRow(target)}>
        <Icon name={marker.dir === 'up' ? 'up' : 'expand'} size={12} strokeWidth={2} />{marker.ids.length}
      </button>
    })}
  </div>
}
