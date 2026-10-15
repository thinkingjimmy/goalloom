/**
 * [INPUT]: Current/planning views, authoritative submissions, completed-task layout and device ordering mode.
 * [OUTPUT]: Viewport-clipped edge sorting, middle-row nesting, grouped pointer/keyboard moves and pending placement projections.
 * [POS]: Board drag coordinator; transactions remain authoritative and failed drops animate back.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { closestCenter, KeyboardSensor, pointerWithin, PointerSensor, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { buildParentOrder, parentOrderedHorizon } from '../../../domain/parent-order'
import { nestingTargets, outlineRows } from '../../../domain/nesting'
import type { ItemHorizon, ItemSummary } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import type { BoardView } from '../../state/board-periods'
import type { Action } from '../../state/use-workspace'
import { revealRow } from './VirtualRows'
import { beginBoardMotion, captureDropPosition } from './RowMotion'
import { dropViewport, intersectRect } from './geometry'
import { useCollapseCompleted } from '../../state/completed-layout'

interface Input { snapshot: Snapshot; view: BoardView; columns: ItemHorizon[]; busy: boolean; submit: (action: Action) => Promise<unknown> }
interface Preview { generation: string; selection: string; items: ItemSummary[]; settled: boolean; success: boolean; focus: string | null }
interface NestFocus { generation: string; selection: string; id: string; parentId: string; selector: string }

export function useBoardDrag({ snapshot, view, columns, busy, submit }: Input) {
  const collapseCompleted = useCollapseCompleted()
  const [dragging, setDragging] = useState<string | null>(null), [preview, setPreview] = useState<Preview | null>(null)
  const [nestFocus, setNestFocus] = useState<NestFocus | null>(null)
  const generation = snapshot.workspace.generation, selection = Object.values(view.periods).map(period => period?.id).join('|')
  const validPreview = preview?.generation === generation && preview.selection === selection ? preview : null
  const items = validPreview?.items ?? view.items
  const latest = useRef({ generation, selection }); latest.current = { generation, selection }
  const editable = columns.filter(horizon => view.mode(horizon) !== 'history' && !view.loading(horizon) && !(view.mode(horizon) === 'future' && view.failed))
  const cursor = useRef<{ id: string | null; horizon: ItemHorizon } | null>(null)
  const activeGesture = useRef(false)
  const sourceFocus = useRef<string | null>(null)
  const nestTarget = useRef<string | null>(null)
  const sortTarget = useRef<{ id: string; position: 'before' | 'after' | 'blocked' } | null>(null)
  const clearNest = () => {
    if (nestTarget.current) {
      document.getElementById(`item-${nestTarget.current}`)?.removeAttribute('data-nesting-target')
    }
    nestTarget.current = null
    delete document.documentElement.dataset.nestingDrag
  }
  const clearSort = () => {
    if (sortTarget.current) {
      document.getElementById(`item-${sortTarget.current.id}`)?.removeAttribute('data-sort-position')
    }
    sortTarget.current = null
  }
  const canNest = useMemo(() => dragging ? nestingTargets(dragging, snapshot.relations.filter(edge => !edge.inheritedFrom), snapshot.nesting ?? []) : () => false, [dragging, snapshot.relations, snapshot.nesting])
  useEffect(() => {
    if (!dragging) return
    const cancel = () => { activeGesture.current = false; clearNest(); clearSort(); cursor.current = null; setDragging(null) }
    const hidden = () => { if (document.hidden) cancel() }
    window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hidden)
    return () => { activeGesture.current = false; clearNest(); clearSort(); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden) }
  }, [dragging, generation, selection])
  useEffect(() => {
    if (preview && !validPreview) setPreview(null)
    if (!validPreview?.settled || busy || columns.some(view.loading)) return
    if (validPreview.success && validPreview.focus) requestAnimationFrame(() => revealRow(validPreview.focus!, '.drag-handle'))
    setPreview(null)
  }, [preview, validPreview, busy, view.items, generation, selection])
  useEffect(() => {
    if (!nestFocus) return
    if (nestFocus.generation !== generation || nestFocus.selection !== selection) { setNestFocus(null); return }
    if (busy || columns.some(view.loading)) return
    const item = view.items.find(item => item.id === nestFocus.id)
    if (!item || item.placement.nestingParentId !== nestFocus.parentId) { setNestFocus(null); return }
    const frame = requestAnimationFrame(() => { revealRow(nestFocus.id, nestFocus.selector, 'pointer'); setNestFocus(null) })
    return () => cancelAnimationFrame(frame)
  }, [nestFocus, busy, view.items, generation, selection])
  const orders = useMemo(() => {
    const active = view.items.find(item => item.id === dragging)
    return new Map(columns.map(horizon => {
      if (!active || !view.parentOrder || !parentOrderedHorizon(horizon)) return [horizon, undefined]
      const period = view.periods[horizon]
      const nodes = view.orderNodes.map(node => node.id === active.id ? { ...node, horizon, periodId: period?.id ?? null, periodStart: period?.startDate ?? null, periodEnd: period?.endAt ?? null } : node)
      return [horizon, buildParentOrder(nodes, snapshot.relations, snapshot.observedAt)]
    }))
  }, [dragging, view.items, view.parentOrder, view.orderNodes, selection, snapshot.relations, snapshot.observedAt, columns])
  useEffect(() => {
    if (!dragging) return
    document.documentElement.dataset.dragging = 'true'
    const board = document.querySelector('.board'), release = board ? beginBoardMotion(board) : null

    // Mark rows in different groups when parent order is enabled
    const active = view.items.find(item => item.id === dragging)
    if (active && view.parentOrder && !active.placement.nestingParentId) {
      view.items.forEach(row => {
        const node = document.getElementById(`item-${row.id}`)
        if (!node) return
        const order = orders.get(row.placement.horizon)
        if (order && row.placement.horizon === active.placement.horizon && !row.placement.nestingParentId) {
          const sameGroup = order.group(row.id) === order.group(active.id)
          if (!sameGroup) {
            node.setAttribute('data-different-group', 'true')
          }
        }
      })
    }

    return () => {
      delete document.documentElement.dataset.dragging
      release?.()
      // Clean up group markers
      document.querySelectorAll('[data-different-group]').forEach(node => {
        node.removeAttribute('data-different-group')
      })
    }
  }, [dragging, view.items, view.parentOrder, orders])
  const todoGroups = new Set(view.items.filter(row => row.status === 'todo').map(row => row.placement.nestingParentId ?? row.id))
  const rowsIn = (horizon: ItemHorizon, active: ItemSummary) => view.items.filter(row => row.placement.horizon === horizon
    && (!row.placement.nestingParentId || row.placement.nestingParentId === active.placement.nestingParentId)
    && (!collapseCompleted || todoGroups.has(row.placement.nestingParentId ?? row.id) === todoGroups.has(active.placement.nestingParentId ?? active.id))
    && (!orders.get(horizon) || orders.get(horizon)!.group(row.id) === orders.get(horizon)!.group(active.id)))
  const collision: CollisionDetection = args => {
    const active = view.items.find(row => row.id === args.active.id), point = args.pointerCoordinates
    // Nest the row under the pointer. Sortable rectangles can precede a panel scroll or guide layout change.
    const node = point ? document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('.task-row') : null
    const targetAtPointer = node ? view.items.find(row => row.id === node.dataset.itemId) : undefined
    const viewport = node && dropViewport(node), bounds = node && viewport && intersectRect(node.getBoundingClientRect(), viewport)
    // Left-biased horizontal zone for intuitive nesting vs. sorting.
    // The left 60% of the row or at least 200px triggers nesting (entire row height);
    // the right side triggers sorting. This focuses nesting on the indent/title area
    // while keeping edge reordering clear.
    const nestZoneWidth = bounds ? Math.max(200, (bounds.right - bounds.left) * 0.6) : 200
    const inNestZone = point && bounds && point.x >= bounds.left && point.x <= bounds.left + nestZoneWidth
    clearNest()
    clearSort()
    if (active && targetAtPointer && targetAtPointer.id !== active.id && inNestZone) {
      if (editable.includes(targetAtPointer.placement.horizon) && !targetAtPointer.archivedAt && targetAtPointer.status !== 'cancelled' && canNest(targetAtPointer.id)) {
        document.documentElement.dataset.nestingDrag = 'true'
        nestTarget.current = targetAtPointer.id
        node?.setAttribute('data-nesting-target', 'true')
        return [{ id: targetAtPointer.id }]
      }
      return []
    }
    // For sorting: show insertion line only when NOT in nest zone
    // Use only 'before' position to avoid duplicate lines between rows
    if (active && targetAtPointer && targetAtPointer.id !== active.id && point && bounds && !inNestZone) {
      // Check if target is in a different group (when parent order is enabled)
      const order = orders.get(targetAtPointer.placement.horizon)
      const isDifferentGroup = order && !active.placement.nestingParentId && !targetAtPointer.placement.nestingParentId
        && order.group(active.id) !== order.group(targetAtPointer.id)

      if (isDifferentGroup) {
        // Show blocked indicator instead of insertion line
        sortTarget.current = { id: targetAtPointer.id, position: 'blocked' }
        node?.setAttribute('data-sort-position', 'blocked')
      } else {
        const midY = bounds.top + bounds.height / 2
        const insertBefore = point.y < midY

        if (insertBefore) {
          // Insert before this row
          sortTarget.current = { id: targetAtPointer.id, position: 'before' }
          node?.setAttribute('data-sort-position', 'before')
        } else {
          // Insert after this row = before the next row
          // Find the next row in the same column
          const currentIndex = view.items.findIndex(item => item.id === targetAtPointer.id)
          const nextRow = view.items.slice(currentIndex + 1).find(item =>
            item.placement.horizon === targetAtPointer.placement.horizon &&
            item.placement.periodId === targetAtPointer.placement.periodId &&
            item.placement.nestingParentId === targetAtPointer.placement.nestingParentId
          )

          if (nextRow) {
            const nextNode = document.getElementById(`item-${nextRow.id}`)
            sortTarget.current = { id: nextRow.id, position: 'before' }
            nextNode?.setAttribute('data-sort-position', 'before')
          } else {
            // Last row in column, show 'after' on current row
            sortTarget.current = { id: targetAtPointer.id, position: 'after' }
            node?.setAttribute('data-sort-position', 'after')
          }
        }
      }
    }
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
    if (!activeGesture.current) { clearNest(); setDragging(null); return }
    activeGesture.current = false
    const nestingId = nestTarget.current; clearNest()
    const keyTarget = cursor.current; cursor.current = null; setDragging(null)
    if (nestingId) {
      const item = view.items.find(row => row.id === event.active.id), parent = view.items.find(row => row.id === nestingId)
      const selector = sourceFocus.current
      if (!busy && item && parent && latest.current.generation === generation && latest.current.selection === selection) void submit({ type: 'nest', itemId: item.id, parentId: parent.id,
        expectedVersion: item.version, expectedParentVersion: parent.version, expectedPlacementVersion: item.placement.version, expectedParentPlacementVersion: parent.placement.version })
        .then(result => { if (result && selector && latest.current.generation === generation && latest.current.selection === selection) setNestFocus({ generation, selection, id: item.id, parentId: parent.id, selector }) })
      return
    }
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
    const children = new Set((snapshot.nesting ?? []).filter(link => link.parentId === item.id).map(link => link.childId))
    const projected = view.rawItems.map(row => {
      const node = replacements.get(row.id)
      if (children.has(row.id)) return { ...row, placement: { ...row.placement, horizon, periodId: moved.periodId } }
      return node ? { ...row, placement: { ...row.placement, horizon: node.horizon, periodId: node.periodId, sortKey: node.sortKey,
        nestingParentId: row.id === item.id && (horizon !== item.placement.horizon || target?.placement.nestingParentId !== item.placement.nestingParentId) ? null : row.placement.nestingParentId } } : row
    })
    const nodes = view.orderNodes.map(node => replacements.get(node.id) ?? node)
    const ordered = outlineRows(projected, view.parentOrder ? buildParentOrder(nodes, snapshot.relations, snapshot.observedAt).compare : undefined, view.nestingParents)
    const rect = document.querySelector('.drag-overlay')?.getBoundingClientRect()
    if (rect) captureDropPosition(item.id, rect)
    const pending: Preview = { generation, selection, items: ordered, settled: false, success: false, focus: keyTarget ? item.id : null }
    setPreview(pending)
    void submit({ type: 'move', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon, beforeId,
      ...(view.parentOrder ? { parentOrder: true } : {}), ...(item.placement.nestingParentId && target?.placement.nestingParentId === item.placement.nestingParentId && horizon === item.placement.horizon ? { keepNesting: true as const } : {}), ...(period ? { period: { kind: 'date' as const, startDate: period.startDate } } : {}) })
      .then(result => { if (latest.current.generation === generation && latest.current.selection === selection) setPreview(value => value === pending ? { ...pending, settled: true, success: !!result } : value) })
  }
  return { items, dragging, sensors, collision, end,
    start: (event: DragStartEvent) => {
      const focused = document.activeElement
      sourceFocus.current = focused instanceof HTMLElement && focused.closest<HTMLElement>('[data-item-id]')?.dataset.itemId === event.active.id
        ? focused.matches('.drag-handle') ? '.drag-handle' : '.task-title' : null
      activeGesture.current = true; cursor.current = null; setDragging(String(event.active.id))
    },
    cancel: () => { activeGesture.current = false; clearNest(); cursor.current = null; setDragging(null) } }
}
