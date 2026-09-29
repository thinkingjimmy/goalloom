/**
 * [INPUT]: Live board periods/topology, guarded prepared writes and mounted, viewport-clipped task rows.
 * [OUTPUT]: Independent pointer linking, edge scrolling, transient SVG preview and a shared keyboard-menu adoption action.
 * [POS]: Board gesture boundary; never moves items. Pointer frames update only the overlay; transactions own all writes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createContext, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import { mayParent } from '../../../domain/relations'
import type { ItemSummary } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import { messages } from '../../i18n'
import type { BoardView } from '../../state/board-periods'
import { desktopApi, type PreparedWrite } from '../../state/use-workspace'
import { dropViewport, intersectRect, panelViewport } from './geometry'
import { boardMotionEvent } from './RowMotion'
import './relation-drag.css'

interface Actions {
  begin: (event: ReactPointerEvent<HTMLButtonElement>, item: ItemSummary, close: () => void) => void
  connect: (parent: ItemSummary, child: ItemSummary) => Promise<boolean>
}
export const RelationDragContext = createContext<Actions | null>(null)
interface Point { x: number; y: number }
interface Preview { from: Point; to: Point; pointer: Point; clip: { x: number; y: number; width: number; height: number }; title: string | null; adoption: boolean }
function previewStore() {
  let value: Preview | null = null
  const listeners = new Set<() => void>()
  return { getSnapshot: () => value, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: (next: Preview | null) => { value = next; listeners.forEach(listener => listener()) } }
}
const samePlacement = (a: Pick<ItemSummary, 'placement'>, b: Pick<ItemSummary, 'placement'>) => a.placement.horizon === b.placement.horizon && a.placement.periodId === b.placement.periodId && a.placement.version === b.placement.version
const available = (item: Pick<ItemSummary, 'deletedAt' | 'archivedAt' | 'status'>) => !item.deletedAt && !item.archivedAt && item.status !== 'cancelled'
const within = (point: Point, rect: DOMRectReadOnly) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function useRelationDrag(input: { snapshot: Snapshot; view: BoardView; blocked: boolean; write: PreparedWrite; onError: (message: string) => void }) {
  const { snapshot, view, blocked } = input
  const generation = snapshot.workspace.generation, selection = Object.values(view.periods).map(period => period?.id).join('|')
  const latest = useRef({ ...input, generation, selection }); latest.current = { ...input, generation, selection }
  const [sourceId, setSourceId] = useState<string | null>(null), [announcement, setAnnouncement] = useState('')
  const store = useMemo(previewStore, []), cancel = useRef<(() => void) | null>(null), unsuppress = useRef<(() => void) | null>(null)
  const refreshGesture = useRef<(() => void) | null>(null)
  const connect = useCallback(async (parent: ItemSummary, child: ItemSummary, visibleOnly = false) => {
    const origin = latest.current
    if (origin.blocked) return false
    let changed = false
    const result = await origin.write(async () => {
      const [p, c] = await Promise.all([desktopApi().getItem(parent.id), desktopApi().getItem(child.id)])
      if (latest.current.generation !== origin.generation || latest.current.selection !== origin.selection || p.item.deletedAt || c.item.deletedAt
        || visibleOnly && (!available(p.item) || !available(c.item))
        || !samePlacement(p.item, parent) || !samePlacement(c.item, child) || c.item.flowColor !== child.flowColor
        || !mayParent(p.item.placement.horizon, c.item.placement.horizon)) { changed = true; return null }
      return { type: 'link', parentId: parent.id, childId: child.id, expectedParentVersion: p.item.version, expectedChildVersion: c.item.version,
        ...(child.flowColor !== null ? { adoptParentFlow: true as const } : {}) }
    }, origin.generation)
    if (latest.current.generation !== origin.generation) return false
    if (changed || !result.ok) {
      origin.onError(changed ? messages.relationTargetChanged : !result.ok && result.code !== 'read' ? result.message : messages.relationLinkFailed)
      return false
    }
    if (!result.result?.changed) return false
    setAnnouncement(messages.relationLinked(parent.title))
    return true
  }, [])
  const begin = useCallback((event: ReactPointerEvent<HTMLButtonElement>, source: ItemSummary, close: () => void) => {
    event.stopPropagation()
    if (!event.isPrimary || event.button !== 0 || event.ctrlKey || event.pointerType !== 'mouse' || latest.current.blocked || source.placement.horizon === 'cycle' || source.placement.horizon === 'later') return
    cancel.current?.(); unsuppress.current?.()
    const button = event.currentTarget, board = button.closest<HTMLElement>('.board'), sourceRow = button.closest<HTMLElement>('.task-row')
    if (!board || !sourceRow) return
    const origin = latest.current, pointerId = event.pointerId, start = { x: event.clientX, y: event.clientY }
    let point = start, active = false, frame = 0, previousTime = 0, target: ItemSummary | null = null, targetRow: HTMLElement | null = null
    let graph: Snapshot['relations'] | null = null, excluded = new Set<string>()
    const sourceValid = () => {
      const current = latest.current, item = current.view.items.find(item => item.id === source.id)
      return current.generation === origin.generation && current.selection === origin.selection && !current.blocked && item && available(item)
        && samePlacement(item, source) && item.flowColor === source.flowColor && !current.view.loading(item.placement.horizon)
    }
    const eligible = (item: ItemSummary) => {
      const current = latest.current
      if (graph !== current.snapshot.relations) {
        graph = current.snapshot.relations
        const children = new Map<string, string[]>()
        excluded = new Set([source.id])
        for (const edge of graph) {
          if (edge.childId === source.id) excluded.add(edge.parentId)
          const rows = children.get(edge.parentId) ?? []; rows.push(edge.childId); children.set(edge.parentId, rows)
        }
        const visited = new Set<string>(), pending = [source.id]
        while (pending.length) { const id = pending.pop()!; if (visited.has(id)) continue; visited.add(id); excluded.add(id); pending.push(...children.get(id) ?? []) }
      }
      const horizon = item.placement.horizon
      return !excluded.has(item.id) && available(item) && mayParent(horizon, source.placement.horizon) && current.view.mode(horizon) !== 'history'
        && !current.view.loading(horizon) && !(current.view.mode(horizon) === 'future' && current.view.failed)
    }
    const hit = () => {
      const node = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('.task-row') ?? null
      const viewport = node && board.contains(node) && dropViewport(node), clipped = viewport && intersectRect(node!.getBoundingClientRect(), viewport)
      const item = clipped && within(point, clipped) ? latest.current.view.items.find(item => item.id === node?.dataset.itemId) : null
      const next = item && eligible(item) ? node : null
      if (targetRow !== next) { targetRow?.removeAttribute('data-relation-target'); next?.setAttribute('data-relation-target', 'true'); targetRow = next }
      target = next ? item! : null
    }
    const paint = () => {
      if (!sourceValid()) { stop(); return }
      hit()
      const root = board.getBoundingClientRect(), viewport = panelViewport(button), sourceViewport = dropViewport(button)
      if (!viewport || !sourceViewport) { stop(); return }
      const rect = button.getBoundingClientRect(), to = targetRow?.getBoundingClientRect()
      store.set({ from: { x: clamp(rect.left + rect.width / 2, viewport.left, viewport.right) - root.left, y: clamp(rect.top + rect.height / 2, sourceViewport.top, sourceViewport.bottom) - root.top },
        to: { x: (to ? Math.min(to.right - 1, viewport.right) : point.x) - root.left, y: (to ? clamp(to.top + 16, dropViewport(targetRow!)!.top, dropViewport(targetRow!)!.bottom) : point.y) - root.top },
        pointer: { x: point.x - root.left, y: point.y - root.top }, title: target?.title ?? null, adoption: source.flowColor !== null,
        clip: { x: viewport.left - root.left, y: viewport.top - root.top, width: viewport.width, height: viewport.height } })
    }
    const velocity = (position: number, low: number, high: number) => position < low + 36 ? -clamp((low + 36 - position) / 36, 0, 1) : position > high - 36 ? clamp((position - high + 36) / 36, 0, 1) : 0
    const scroll = (time: number) => {
      const dt = previousTime ? Math.min(32, time - previousTime) : 16; previousTime = time
      const timeline = board.querySelector<HTMLElement>('.board-timeline'), viewport = timeline && panelViewport(timeline)
      if (!timeline || !viewport || !within(point, viewport)) return false
      const beforeX = timeline.scrollLeft
      timeline.scrollLeft += velocity(point.x, viewport.left, viewport.right) * dt * .7
      let moved = beforeX !== timeline.scrollLeft
      for (const column of board.querySelectorAll<HTMLElement>('.board-column')) {
        const horizon = column.dataset.horizon as ItemSummary['placement']['horizon']
        if (!mayParent(horizon, source.placement.horizon) || latest.current.view.mode(horizon) === 'history') continue
        const content = column.querySelector<HTMLElement>('.column-content'), bounds = content && dropViewport(content)
        if (!content || !bounds || !within(point, bounds)) continue
        const beforeY = content.scrollTop
        content.scrollTop += velocity(point.y, bounds.top, bounds.bottom) * dt * .7
        moved ||= beforeY !== content.scrollTop
      }
      return moved
    }
    const schedule = () => { if (active && !frame) frame = requestAnimationFrame(time => { frame = 0; const moving = scroll(time); paint(); if (active && moving) schedule(); else previousTime = 0 }) }
    const suppressClick = () => {
      const clear = () => { document.removeEventListener('click', swallow, true); document.removeEventListener('pointerdown', clear, true); unsuppress.current = null }
      const swallow = (event: MouseEvent) => { if (event.detail > 0) { event.preventDefault(); event.stopImmediatePropagation(); clear() } }
      document.addEventListener('click', swallow, true); document.addEventListener('pointerdown', clear, true); unsuppress.current = clear
    }
    const stop = () => {
      active = false; cancel.current = null; refreshGesture.current = null; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect()
      document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', stop, true); document.removeEventListener('keydown', key, true)
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', stop)
      button.removeEventListener('lostpointercapture', stop); board.removeEventListener('scroll', schedule, true); board.removeEventListener(boardMotionEvent, schedule)
      window.removeEventListener('resize', schedule)
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId)
      board.removeAttribute('data-linking'); sourceRow.removeAttribute('data-relation-source'); targetRow?.removeAttribute('data-relation-target')
      store.set(null); setSourceId(null)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      if (!(event.buttons & 1)) { stop(); return }
      point = { x: event.clientX, y: event.clientY }
      if (!active && Math.hypot(point.x - start.x, point.y - start.y) > 6) {
        active = true; close(); setAnnouncement(''); setSourceId(source.id); suppressClick()
        board.setAttribute('data-linking', 'true'); sourceRow.setAttribute('data-relation-source', 'true')
      }
      if (active) { event.preventDefault(); schedule() }
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId || event.button !== 0) return
      const wasActive = active
      point = { x: event.clientX, y: event.clientY }
      if (wasActive) { event.preventDefault(); event.stopPropagation(); paint() }
      const parent = wasActive && active ? target : null
      stop()
      if (parent) void connect(parent, source, true)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); stop() }
      else if (active && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); event.stopPropagation() }
    }
    const visibility = () => { if (document.hidden) stop() }
    const observer = new MutationObserver(schedule), resize = new ResizeObserver(schedule)
    observer.observe(board, { childList: true, subtree: true }); resize.observe(board); resize.observe(sourceRow)
    cancel.current = stop; refreshGesture.current = schedule; button.setPointerCapture(pointerId)
    document.addEventListener('pointermove', move, { capture: true, passive: false }); document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', stop, true); document.addEventListener('keydown', key, true)
    document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', stop)
    button.addEventListener('lostpointercapture', stop); board.addEventListener('scroll', schedule, { capture: true, passive: true })
    board.addEventListener(boardMotionEvent, schedule); window.addEventListener('resize', schedule)
  }, [connect, store])
  useEffect(() => { cancel.current?.() }, [generation, selection, blocked])
  useEffect(() => { refreshGesture.current?.() }, [view.items, snapshot.relations])
  useEffect(() => () => { cancel.current?.(); unsuppress.current?.() }, [])
  return { actions: useMemo(() => ({ begin, connect }), [begin, connect]), store, sourceId, announcement }
}

export function RelationDragOverlay({ drag }: { drag: ReturnType<typeof useRelationDrag> }) {
  const value = useSyncExternalStore(drag.store.subscribe, drag.store.getSnapshot), id = useId()
  if (!value) return <span className="sr-only" role="status">{drag.announcement}</span>
  const { from, to, clip, pointer, title, adoption } = value, curve = (to.x - from.x) * .4
  const path = `M${from.x},${from.y} C${from.x + curve},${from.y} ${to.x - curve},${to.y} ${to.x},${to.y}`
  const hint = title ? messages.dragRelationDrop(title) : messages.dragRelationChoose
  return <div className="relation-drag" data-valid={!!title}>
    <svg aria-hidden="true"><defs>
      <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></marker>
      <clipPath id={`${id}-clip`}><rect {...clip} /></clipPath>
    </defs><path className="relation-drag-path" d={path} markerEnd={`url(#${id}-arrow)`} clipPath={`url(#${id}-clip)`} /></svg>
    <div className="relation-drag-hint" role="status" style={{ left: clamp(pointer.x + 16, clip.x + 8, clip.x + clip.width - 268), top: clamp(pointer.y + 22, clip.y + 8, clip.y + clip.height - (adoption ? 100 : 70)) }}>
      <span>{hint}</span>{adoption && <small>{messages.adoptParentFlowHint}</small>}
    </div>
  </div>
}
