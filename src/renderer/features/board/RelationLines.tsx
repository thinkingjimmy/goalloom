/**
 * [INPUT]: Board summaries, the shared active flow graph and flow colours, an optional externally focused item (flow-dot
 *          preview), whether to draw in, and visible columns; reads mounted row geometry from the enclosing `.board`.
 * [OUTPUT]: Read-only overlay: parent→child curves between rendered rows sharing an active flow, each in that flow's colour (dashed across
 *           skipped horizons), joining matching 6px row dots at the first title line; hover/focus chain highlighting (other rows faded via `data-chain-out`) and
 *           edge markers that reveal an off-screen related row; shared panel clipping and a finite motion pulse anchor paths throughout row/sidebar translations.
 * [POS]: Board decoration mounted while one flow is filtered or a flow dot is previewed, with the device preference on; never writes
 *        workspace data or undo state.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { horizons } from '../../../shared/contracts/values'
import type { ItemHorizon, ItemSummary } from '../../../shared/contracts/entities'
import { messages } from '../../i18n'
import { flowStroke } from '../../lib/colors'
import { flowChain, type FlowGraph, type Flows } from '../../state/flows'
import { Icon } from '../../components/icons'
import { revealRow } from './VirtualRows'
import { boardIsMoving, boardMotionEvent } from './RowMotion'
import { panelViewport } from './geometry'

type Panel = 'later' | 'timeline'
interface Clip { x: number; y: number; width: number; height: number }
interface Anchor { left: number; right: number; y: number; mid: number; off: 'up' | 'down' | null; done: boolean; content: Element; panel: Panel; clip: Clip }
interface Path { id: string; d: string; skip: boolean; done: boolean; delay: number; parentId: string; childId: string; color: string; panel: Panel | null }
interface Port { key: string; x: number; y: number; itemId: string; color: string; panel: Panel }
interface Marker { key: string; x: number; y: number; dir: 'up' | 'down'; align: 'start' | 'end'; ids: string[]; color: string }
interface Geometry { width: number; height: number; paths: Path[]; ports: Port[]; markers: Marker[]; clips: Record<Panel, Clip> }
const noClip: Clip = { x: 0, y: 0, width: 0, height: 0 }
const empty: Geometry = { width: 0, height: 0, paths: [], ports: [], markers: [], clips: { later: noClip, timeline: noClip } }
// Off-screen endpoints park this far inside the column edge, where their marker sits.
const inset = 14
// Titles grow freely; anchors stay level with the first line, where the dot and checkbox sit.
const firstLine = 32
// A connector's vertical bus runs this far outside the row edge; a forward line stops at the flow dot's left edge.
const busGap = 6, dotEdge = 8

/** Horizontal–vertical path from (x, y) through a vertical bus at each turn's x (reaching that turn's y), ending
 *  horizontally at x2. Corners are rounded to fit the shortest adjoining segment. */
function orthogonal(x: number, y: number, turns: [number, number][], x2: number): string {
  let d = `M${x} ${y}`
  turns.forEach(([bus, to], index) => {
    const next = turns[index + 1]?.[0] ?? x2
    const r = Math.min(5, Math.abs(to - y) / 2, Math.abs(bus - x), Math.abs(next - bus))
    if (r < .5) d += `H${bus}V${to}`
    else {
      const dy = Math.sign(to - y), dx = Math.sign(next - bus)
      d += `H${bus - Math.sign(bus - x) * r}Q${bus} ${y} ${bus} ${y + dy * r}V${to - dy * r}Q${bus} ${to} ${bus + dx * r} ${to}`
    }
    x = r < .5 ? bus : bus + Math.sign(next - bus) * r; y = to
  })
  return `${d}H${x2}`
}

export function RelationLines({ items, graph, flows, focus, animate, columns }: {
  items: ItemSummary[]; graph: FlowGraph; flows: Flows; focus: string | null; animate: boolean; columns: ItemHorizon[]
}) {
  const { members } = graph
  const horizonOf = useMemo(() => new Map(items.map(item => [item.id, item.placement.horizon])), [items])
  const edges = useMemo(() => {
    const colorOf = new Map(flows.all.map(flow => [flow.id, flowStroke(flow.flowColor)]))
    return graph.edges.map(edge => ({ ...edge, color: colorOf.get(edge.flowId)! }))
  }, [graph, flows.all])
  const [geometry, setGeometry] = useState(empty)
  const [pointer, setHover] = useState<string | null>(null)
  // A previewed flow dot owns the chain; otherwise the hovered or focused row does.
  const hover = focus ?? pointer
  const [entering, setEntering] = useState(animate)
  useEffect(() => { if (!animate) return; const timer = setTimeout(() => setEntering(false), 900); return () => clearTimeout(timer) }, [])

  // Hover or focus lights a row's whole ancestor and descendant chain inside this flow.
  const chain = useMemo(() => flowChain(graph, hover), [graph, hover])

  const root = useRef<HTMLDivElement>(null), clipId = useId()
  const latest = useRef({ edges, members, horizonOf, chain, columns })
  latest.current = { edges, members, horizonOf, chain, columns }
  const measure = (moving = false) => {
    const board = root.current?.parentElement
    if (!board) return
    const { edges, members, horizonOf, chain, columns } = latest.current
    const origin = board.getBoundingClientRect(), dx = -origin.left, dy = -origin.top
    const clips = Object.fromEntries((['later', 'timeline'] as const).map(panel => {
      const node = board.querySelector(`[data-board-panel="${panel}"]`), rect = node && panelViewport(node)
      return [panel, rect ? { x: rect.left + dx, y: rect.top + dy, width: rect.width, height: rect.height } : noClip]
    })) as Record<Panel, Clip>
    const anchors = new Map<string, Anchor>()
    // Rows that left the active flows (a preview moved on) drop their stale chain fade.
    for (const row of board.querySelectorAll<HTMLElement>('[data-chain-out]')) if (!members.has(row.dataset.itemId ?? '')) delete row.dataset.chainOut
    for (const id of members) {
      const row = document.getElementById(`item-${id}`), content = row?.closest('.column-content')
      if (!row || !content || !board.contains(row) || !panelViewport(row)) continue
      // Rows outside the flow keep their own dimming; only this flow's rows join or leave the hovered chain.
      if (chain && !chain.has(id)) row.dataset.chainOut = 'true'; else delete row.dataset.chainOut
      const r = row.getBoundingClientRect(), c = content.getBoundingClientRect(), mid = r.top + Math.min(r.height, firstLine) / 2
      const off = mid < c.top ? 'up' : mid > c.bottom ? 'down' : null
      const y = off === 'up' ? c.top + inset : off === 'down' ? c.bottom - inset : mid
      const panel = horizonOf.get(id) === 'later' ? 'later' : 'timeline'
      anchors.set(id, { left: r.left + dx, right: r.right + dx, y: y + dy, mid, off, done: row.dataset.done === 'true', content, panel, clip: clips[panel] })
    }
    const paths: Path[] = [], ports = new Map<string, Port>(), markers = new Map<string, Marker>()
    // A skip-level curve crosses the columns in between along a row boundary, so it never seems to leave a row it merely passes.
    let rows: { left: number; right: number; top: number; bottom: number }[] | null = null
    const lane = (from: number, to: number, target: number) => {
      rows ??= [...board.querySelectorAll('.board-column .task-row')].filter(row => panelViewport(row)).map(row => { const r = row.getBoundingClientRect(); return { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy } })
      const ys = rows.filter(row => row.left > from && row.right < to).flatMap(row => [row.top, row.bottom])
      return ys.length ? ys.reduce((best, y) => Math.abs(y - target) < Math.abs(best - target) ? y : best) : target
    }
    const port = (key: string, x: number, y: number, itemId: string, color: string, panel: Panel) => ports.set(key, { key, x, y, itemId, color, panel })
    const mark = (anchor: Anchor, id: string, align: 'start' | 'end', color: string) => {
      const x = align === 'start' ? anchor.left : anchor.right
      if (x < anchor.clip.x + 8 || x > anchor.clip.x + anchor.clip.width - 8) return
      const key = `${anchor.content.parentElement?.getAttribute('data-horizon')}:${anchor.off}:${align}`
      const marker = markers.get(key) ?? { key, x: align === 'start' ? anchor.left : anchor.right, y: anchor.y, dir: anchor.off!, align, ids: [], color }
      if (!marker.ids.includes(id)) marker.ids.push(id)
      markers.set(key, marker)
    }
    for (const edge of edges) {
      const parent = anchors.get(edge.parentId), child = anchors.get(edge.childId)
      if (!parent || !child || (parent.off && child.off)) continue
      const skip = Math.abs(horizons.indexOf(horizonOf.get(edge.parentId)!) - horizons.indexOf(horizonOf.get(edge.childId)!)) > 1
      // Right-angle connectors: leave the side facing the other row, run down a bus in the gap beside the column rule,
      // and turn into the child. A forward line stops at the child's flow dot; loops and backward lines end on a port.
      const forward = parent.right <= child.left, backward = child.right <= parent.left, side = backward ? -1 : 1
      const x1 = backward ? parent.left : parent.right
      const x2 = forward ? child.left + dotEdge : child.right
      // Existing cross-Later edges survive, but an obscured timeline endpoint must not land in Later.
      if (parent.panel !== child.panel && (x1 < parent.clip.x || x1 > parent.clip.x + parent.clip.width || x2 < child.clip.x || x2 > child.clip.x + child.clip.width)) continue
      const exitBus = x1 + side * busGap
      const entryBus = forward ? child.left - busGap - 5 : backward ? child.right + busGap + 5 : Math.max(parent.right, child.right) + busGap
      // A skip-level line crosses the columns in between along a row boundary, where the clear band between grounds shows it.
      const turns: [number, number][] = skip && (forward || backward)
        ? [[exitBus, lane(Math.min(x1, x2), Math.max(x1, x2), (parent.y + child.y) / 2)], [entryBus, child.y]]
        : [[forward || backward ? exitBus : entryBus, child.y]]
      const d = orthogonal(x1, parent.y, turns, x2)
      const delay = Math.min(columns.indexOf(horizonOf.get(edge.parentId)!), columns.indexOf(horizonOf.get(edge.childId)!)) * 70
      paths.push({ id: edge.id, d, skip, done: parent.done || child.done, delay: Math.max(0, delay), parentId: edge.parentId, childId: edge.childId, color: edge.color, panel: parent.panel === child.panel ? parent.panel : null })
      if (parent.off) mark(parent, edge.parentId, backward ? 'start' : 'end', edge.color); else port(`${edge.parentId}:${x1}`, x1, parent.y, edge.parentId, edge.color, parent.panel)
      if (child.off) mark(child, edge.childId, forward ? 'start' : 'end', edge.color); else if (!forward) port(`${edge.childId}:${x2}`, x2, child.y, edge.childId, edge.color, child.panel)
    }
    for (const marker of markers.values()) marker.ids.sort((a, b) => anchors.get(a)!.mid - anchors.get(b)!.mid)
    const next: Geometry = { width: board.clientWidth, height: board.clientHeight, paths, ports: [...ports.values()], markers: [...markers.values()], clips }
    for (const node of root.current?.querySelectorAll<SVGRectElement>('[data-panel-clip]') ?? []) {
      const clip = clips[node.dataset.panelClip as Panel]
      for (const [key, value] of Object.entries(clip)) node.setAttribute(key, String(value))
    }
    const pathMap = new Map(paths.map(path => [path.id, path]))
    for (const node of root.current?.querySelectorAll<SVGPathElement>('[data-edge-id]') ?? []) {
      const path = pathMap.get(node.dataset.edgeId!)
      node.style.visibility = path ? '' : 'hidden'
      if (path) node.setAttribute('d', path.d)
    }
    for (const node of root.current?.querySelectorAll<SVGCircleElement>('[data-port-key]') ?? []) {
      const point = ports.get(node.dataset.portKey!)
      node.style.visibility = point ? '' : 'hidden'
      if (point) { node.setAttribute('cx', String(point.x)); node.setAttribute('cy', String(point.y)) }
    }
    for (const node of root.current?.querySelectorAll<HTMLElement>('[data-marker-key]') ?? []) {
      const marker = markers.get(node.dataset.markerKey!)
      node.style.visibility = marker ? '' : 'hidden'
      if (marker) { node.style.left = `${marker.x}px`; node.style.top = `${marker.y}px` }
    }
    if (!moving) setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
  }
  const measureRef = useRef(measure); measureRef.current = measure

  useLayoutEffect(() => {
    const overlay = root.current, board = overlay?.parentElement
    if (!overlay || !board) return
    let frame = 0
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; measureRef.current(boardIsMoving(board)) }) }
    // Rows mount and unmount with virtual windowing, folds and refreshes; the overlay's own renders are ignored.
    const mutations = new MutationObserver(records => { if (records.some(record => !overlay.contains(record.target))) schedule() })
    mutations.observe(board, { childList: true, subtree: true })
    const resize = new ResizeObserver(schedule)
    resize.observe(board)
    board.addEventListener('scroll', schedule, { capture: true, passive: true })
    board.addEventListener('transitionend', schedule)
    const motion = () => measureRef.current(boardIsMoving(board))
    board.addEventListener(boardMotionEvent, motion)
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
      board.removeEventListener(boardMotionEvent, motion)
      board.removeEventListener('pointerover', over); board.removeEventListener('focusin', focus)
      board.removeEventListener('pointerleave', leave); board.removeEventListener('focusout', leave)
      for (const row of board.querySelectorAll<HTMLElement>('[data-chain-out]')) delete row.dataset.chainOut
    }
  }, [])
  // React may commit an earlier geometry read after FLIP has installed its inverse transform.
  useLayoutEffect(() => {
    const board = root.current?.parentElement
    measureRef.current(!!board && boardIsMoving(board))
  })

  const state = (path: Path) => !chain ? (path.done ? 'done' : undefined) : chain.has(path.parentId) && chain.has(path.childId) ? 'hot' : 'faded'
  return <div ref={root} className="relation-lines" data-entering={entering} aria-hidden={geometry.markers.length ? undefined : true} style={{ width: geometry.width, height: geometry.height }}>
    <svg width={geometry.width} height={geometry.height} aria-hidden="true">
      <defs>{(['later', 'timeline'] as const).map(panel => <clipPath key={panel} id={`${clipId}-${panel}`}><rect data-panel-clip={panel} {...geometry.clips[panel]} /></clipPath>)}</defs>
      {geometry.paths.map(path => <path key={path.id} data-edge-id={path.id} className="relation-edge" clipPath={path.panel ? `url(#${clipId}-${path.panel})` : undefined} d={path.d} pathLength={path.skip ? undefined : 1} data-skip={path.skip || undefined} data-state={state(path)} style={{ color: path.color, animationDelay: `${path.delay}ms` }} />)}
      {geometry.ports.map(port => <circle key={port.key} data-port-key={port.key} className="relation-port" clipPath={`url(#${clipId}-${port.panel})`} cx={port.x} cy={port.y} r={3} style={{ color: port.color }} data-state={chain ? (chain.has(port.itemId) ? 'hot' : 'faded') : undefined} />)}
    </svg>
    {geometry.markers.map(marker => {
      // Reveal the nearest hidden row in that direction; the rest follow on later clicks.
      const target = marker.ids.at(marker.dir === 'up' ? -1 : 0)!
      const label = marker.dir === 'up' ? messages.relationsAbove(marker.ids.length) : messages.relationsBelow(marker.ids.length)
      return <button key={marker.key} data-marker-key={marker.key} className="relation-marker" data-align={marker.align} style={{ left: marker.x, top: marker.y, color: marker.color }} aria-label={label} title={label} onClick={() => revealRow(target)}>
        <Icon name={marker.dir === 'up' ? 'up' : 'expand'} size={12} strokeWidth={2} />{marker.ids.length}
      </button>
    })}
  </div>
}
