/**
 * [INPUT]: Current/planning views, authoritative submissions and device ordering mode.
 * [OUTPUT]: Viewport-clipped, group-bounded pointer/keyboard drops and an optimistic placement projection until reads settle.
 * [POS]: Board drag coordinator; transactions remain authoritative and failed drops animate back.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { closestCenter, KeyboardSensor, pointerWithin, PointerSensor, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { buildParentOrder, parentOrderedHorizon } from '../../../domain/parent-order'
import type { ItemHorizon, ItemSummary } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import type { BoardView } from '../../state/board-periods'
import type { Action } from '../../state/use-workspace'
import { revealRow } from './VirtualRows'
import { beginBoardMotion, captureDropPosition } from './RowMotion'
import { dropViewport, intersectRect } from './geometry'

interface Input { snapshot: Snapshot; view: BoardView; columns: ItemHorizon[]; busy: boolean; submit: (action: Action) => Promise<unknown> }
interface Preview { generation: string; selection: string; items: ItemSummary[]; settled: boolean; success: boolean; focus: string | null }

export function useBoardDrag({ snapshot, view, columns, busy, submit }: Input) {
  const [dragging, setDragging] = useState<string | null>(null), [preview, setPreview] = useState<Preview | null>(null)
  const generation = snapshot.workspace.generation, selection = Object.values(view.periods).map(period => period?.id).join('|')
  const validPreview = preview?.generation === generation && preview.selection === selection ? preview : null
  const items = validPreview?.items ?? view.items
  const latest = useRef({ generation, selection }); latest.current = { generation, selection }
  const editable = columns.filter(horizon => view.mode(horizon) !== 'history' && !view.loading(horizon) && !(view.mode(horizon) === 'future' && view.failed))
  const cursor = useRef<{ id: string | null; horizon: ItemHorizon } | null>(null)
  useEffect(() => {
    if (preview && !validPreview) setPreview(null)
    if (!validPreview?.settled || busy || columns.some(view.loading)) return
    if (validPreview.success && validPreview.focus) requestAnimationFrame(() => revealRow(validPreview.focus!, '.drag-handle'))
    setPreview(null)
  }, [preview, validPreview, busy, view.items, generation, selection])
  useEffect(() => {
    if (!dragging) return
    document.documentElement.dataset.dragging = 'true'
    const board = document.querySelector('.board'), release = board ? beginBoardMotion(board) : null
    return () => { delete document.documentElement.dataset.dragging; release?.() }
  }, [dragging])
  const orders = useMemo(() => {
    const active = view.items.find(item => item.id === dragging)
    return new Map(columns.map(horizon => {
      if (!active || !view.parentOrder || !parentOrderedHorizon(horizon)) return [horizon, undefined]
      const period = view.periods[horizon]
      const nodes = view.orderNodes.map(node => node.id === active.id ? { ...node, horizon, periodId: period?.id ?? null, periodStart: period?.startDate ?? null, periodEnd: period?.endAt ?? null } : node)
      return [horizon, buildParentOrder(nodes, snapshot.relations, snapshot.observedAt)]
    }))
  }, [dragging, view.items, view.parentOrder, view.orderNodes, selection, snapshot.relations, snapshot.observedAt, columns])
  const rowsIn = (horizon: ItemHorizon, active: ItemSummary) => view.items.filter(row => row.placement.horizon === horizon && row.status === active.status
    && (!orders.get(horizon) || orders.get(horizon)!.group(row.id) === orders.get(horizon)!.group(active.id)))
  const collision: CollisionDetection = args => {
    // Scrolled timeline rows can overlap Later geometrically while their pixels are clipped.
    const rects = new Map(args.droppableRects)
    const containers = args.droppableContainers.filter(container => {
      const node = container.node.current, rect = rects.get(container.id), viewport = node && dropViewport(node)
      const clipped = rect && viewport && intersectRect(rect as DOMRectReadOnly, viewport)
      if (!clipped) return false
      rects.set(container.id, clipped)
      return true
    })
    args = { ...args, droppableContainers: containers, droppableRects: rects }
    const hits = args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)
    const rows = hits.filter(hit => !String(hit.id).startsWith('column:'))
    const raw = rows.length ? closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(container => rows.some(hit => hit.id === container.id)) }) : hits
    const target = view.items.find(row => row.id === raw[0]?.id)
    const horizon = target?.placement.horizon ?? String(raw[0]?.id).replace('column:', '') as ItemHorizon
    const active = view.items.find(row => row.id === args.active.id)
    if (!active || !editable.includes(horizon)) return raw
    const allowed = new Set(rowsIn(horizon, active).map(row => row.id))
    if (target && !allowed.has(target.id)) {
      const containers = args.droppableContainers.filter(container => allowed.has(String(container.id)))
      if (containers.length) return closestCenter({ ...args, droppableContainers: containers })
      return [{ id: `column:${horizon}` }]
    }
    return raw
  }
  const coordinates: KeyboardCoordinateGetter = (event, args) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return sortableKeyboardCoordinates(event, args)
    const active = view.items.find(item => item.id === args.active)
    if (!active || !editable.includes(active.placement.horizon)) return
    const current = cursor.current && editable.includes(cursor.current.horizon) ? cursor.current : { id: active.id, horizon: active.placement.horizon }
    let horizon = current.horizon, index = rowsIn(horizon, active).findIndex(row => row.id === current.id)
    if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') horizon = editable[editable.indexOf(horizon) + (event.code === 'ArrowRight' ? 1 : -1)] ?? horizon
    else index += event.code === 'ArrowDown' ? 1 : -1
    const rows = rowsIn(horizon, active), target = rows[Math.max(0, Math.min(index, rows.length - 1))]
    cursor.current = { id: target?.id ?? null, horizon }; event.preventDefault()
    if (target) revealRow(target.id)
    const node = target ? document.getElementById(`item-${target.id}`) : document.querySelector(`[data-horizon="${horizon}"] .column-content`)
    const rect = node?.getBoundingClientRect()
    return rect ? { x: rect.left, y: rect.top } : args.currentCoordinates
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: coordinates }))
  const end = (event: DragEndEvent) => {
    const keyTarget = cursor.current; cursor.current = null; setDragging(null)
    if (!event.over && !keyTarget) return
    const item = view.items.find(row => row.id === event.active.id)
    const target = view.items.find(row => row.id === (keyTarget ? keyTarget.id : event.over?.id))
    const horizon = keyTarget?.horizon ?? target?.placement.horizon ?? String(event.over?.id).replace('column:', '') as ItemHorizon
    if (busy || !item || !editable.includes(item.placement.horizon) || !editable.includes(horizon)) return
    const siblings = rowsIn(horizon, item), same = item.placement.horizon === horizon
    let beforeId = target && siblings.some(row => row.id === target.id) ? target.id : null
    if (same && target && siblings.indexOf(target) > siblings.indexOf(item)) beforeId = siblings[siblings.indexOf(target) + 1]?.id ?? null
    if (beforeId === item.id) return
    const period = view.periods[horizon]
    const moved = { ...view.orderNodes.find(node => node.id === item.id)!, horizon, periodId: period?.id ?? null, periodStart: period?.startDate ?? null, periodEnd: period?.endAt ?? null }
    // Hidden ancestors must keep their relative slots while visible rows preview a drop.
    const targetNodes = view.orderNodes.filter(node => node.id !== item.id && node.horizon === horizon && node.periodId === moved.periodId)
      .sort((a, b) => a.sortKey - b.sortKey || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const insertion = beforeId ? targetNodes.findIndex(node => node.id === beforeId) : targetNodes.length
    targetNodes.splice(insertion < 0 ? targetNodes.length : insertion, 0, moved)
    const replacements = new Map(targetNodes.map((node, index) => [node.id, { ...node, sortKey: (index + 1) * 1024 }]))
    const projected = view.rawItems.map(row => {
      const node = replacements.get(row.id)
      return node ? { ...row, placement: { ...row.placement, horizon: node.horizon, periodId: node.periodId, sortKey: node.sortKey } } : row
    })
    const nodes = view.orderNodes.map(node => replacements.get(node.id) ?? node)
    const ordered = view.parentOrder ? buildParentOrder(nodes, snapshot.relations, snapshot.observedAt).sort(projected)
      : projected.sort((a, b) => a.placement.sortKey - b.placement.sortKey || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const rect = document.querySelector('.drag-overlay')?.getBoundingClientRect()
    if (rect) captureDropPosition(item.id, rect)
    const pending: Preview = { generation, selection, items: ordered, settled: false, success: false, focus: keyTarget ? item.id : null }
    setPreview(pending)
    void submit({ type: 'move', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon, beforeId,
      ...(view.parentOrder ? { parentOrder: true } : {}), ...(period ? { period: { kind: 'date' as const, startDate: period.startDate } } : {}) })
      .then(result => { if (latest.current.generation === generation && latest.current.selection === selection) setPreview(value => value === pending ? { ...pending, settled: true, success: !!result } : value) })
  }
  return { items, dragging, sensors, collision, end,
    start: (event: DragStartEvent) => { cursor.current = null; setDragging(String(event.active.id)) },
    cancel: () => { cursor.current = null; setDragging(null) } }
}
