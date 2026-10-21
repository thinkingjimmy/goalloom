/**
 * [INPUT]: Persisted current/planning views, authoritative submissions and completed-task layout.
 * [OUTPUT]: Shared pointer drop intents, whole-group previews, atomic child/root insertion and guarded pointer/keyboard placement projections.
 * [POS]: Board drag coordinator; transactions remain authoritative and failed drops animate back.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { closestCenter, KeyboardSensor, pointerWithin, PointerSensor, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { localNestingParentId, nestingTargets, outlineRows, sameOutlinePeriod } from '../../../domain/nesting'
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
interface SortMarker { id: string; position: 'before' | 'after'; nested: boolean }
type PointerDrop = { type: 'nest'; parentId: string; beforeId: string | null; marker: SortMarker | null }
  | { type: 'move'; targetId: string; beforeId: string | null; marker: SortMarker }

export function useBoardDrag({ snapshot, view, columns, busy, submit }: Input) {
  const collapseCompleted = useCollapseCompleted()
  const [dragging, setDragging] = useState<string | null>(null), [preview, setPreview] = useState<Preview | null>(null)
  const [nestFocus, setNestFocus] = useState<NestFocus | null>(null)
  const [nestingPreview, setNestingPreview] = useState<string | null>(null)
  const generation = snapshot.workspace.generation, selection = Object.values(view.periods).map(period => period?.id).join('|')
  const validPreview = preview?.generation === generation && preview.selection === selection ? preview : null
  const items = validPreview?.items ?? view.items
  const latest = useRef({ generation, selection }); latest.current = { generation, selection }
  const editable = columns.filter(horizon => view.mode(horizon) !== 'history' && !view.loading(horizon) && !(view.mode(horizon) === 'future' && view.failed))
  const cursor = useRef<{ id: string | null; horizon: ItemHorizon } | null>(null)
  const activeGesture = useRef(false)
  const sourceFocus = useRef<string | null>(null)
  const pointerDrop = useRef<PointerDrop | null>(null)
  const clearPointerDrop = () => {
    const drop = pointerDrop.current
    if (drop?.type === 'nest') document.getElementById(`item-${drop.parentId}`)?.removeAttribute('data-nesting-target')
    if (drop?.marker) {
      const node = document.getElementById(`item-${drop.marker.id}`)
      node?.removeAttribute('data-sort-position'); node?.removeAttribute('data-sort-nested')
    }
    pointerDrop.current = null
    delete document.documentElement.dataset.nestingDrag
  }
  const previewDrop = (drop: PointerDrop) => {
    pointerDrop.current = drop
    if (drop.marker) {
      const node = document.getElementById(`item-${drop.marker.id}`)
      node?.setAttribute('data-sort-position', drop.marker.position)
      node?.setAttribute('data-sort-nested', String(drop.marker.nested))
    } else if (drop.type === 'nest') {
      document.documentElement.dataset.nestingDrag = 'true'
      document.getElementById(`item-${drop.parentId}`)?.setAttribute('data-nesting-target', 'true')
    }
  }
  // Collision runs during DndContext render. Publish React preview state only from its drag events.
  const move = () => {
    const drop = pointerDrop.current
    setNestingPreview(drop?.type === 'nest' && !drop.marker ? drop.parentId : null)
  }
  const canNest = useMemo(() => dragging ? nestingTargets(dragging, snapshot.relations.filter(edge => !edge.inheritedFrom), snapshot.nesting ?? []) : () => false, [dragging, snapshot.relations, snapshot.nesting])
  useEffect(() => {
    if (!dragging) return
    const cancel = () => { activeGesture.current = false; clearPointerDrop(); setNestingPreview(null); cursor.current = null; setDragging(null) }
    const hidden = () => { if (document.hidden) cancel() }
    window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hidden)
    return () => { activeGesture.current = false; clearPointerDrop(); setNestingPreview(null); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden) }
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
  useEffect(() => {
    if (!dragging) return
    document.documentElement.dataset.dragging = 'true'
    const board = document.querySelector('.board'), release = board ? beginBoardMotion(board) : null

    return () => {
      delete document.documentElement.dataset.dragging
      release?.()
    }
  }, [dragging])
  const byId = new Map([...view.nestingParents, ...view.items].map(row => [row.id, row]))
  const localParent = (item: Parameters<typeof localNestingParentId>[0]) => localNestingParentId(item, byId)
  const todoGroups = new Set(view.items.filter(row => row.status === 'todo').map(row => localParent(row) ?? row.id))
  const rowsIn = (horizon: ItemHorizon, active: ItemSummary, independent = false) => {
    const parent = independent ? null : localParent({ ...active, placement: { ...active.placement, horizon, periodId: view.periods[horizon]?.id ?? null } })
    return view.items.filter(row => row.placement.horizon === horizon
      && localParent(row) === parent
      && (!collapseCompleted || todoGroups.has(localParent(row) ?? row.id) === todoGroups.has(localParent(active) ?? active.id)))
  }
  const sortPeers = (rows: ItemSummary[], active: ItemSummary) => rows.filter(row =>
    localParent(row) === localParent(active))
  const collision: CollisionDetection = args => {
    const active = view.items.find(row => row.id === args.active.id), point = args.pointerCoordinates
    // Nest the row under the pointer. Sortable rectangles can precede a panel scroll or guide layout change.
    const node = point ? document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('.task-row') : null
    const targetAtPointer = node ? view.items.find(row => row.id === node.dataset.itemId) : undefined
    const rect = node?.getBoundingClientRect(), viewport = node && dropViewport(node), bounds = rect && viewport && intersectRect(rect, viewport)
    // Fixed margins consume short rows. Reserve their middle half for nesting and keep both edges sortable.
    const nestInset = rect ? Math.min(16, rect.height / 4) : 0
    const nestZoneWidth = rect ? Math.max(200, rect.width * 0.6) : 200
    const inNestZone = point && rect && bounds && point.x >= bounds.left && point.x <= Math.min(bounds.right, rect.left + nestZoneWidth)
      && point.y >= Math.max(bounds.top, rect.top + nestInset) && point.y <= Math.min(bounds.bottom, rect.bottom - nestInset)
    clearPointerDrop()
    if (active && targetAtPointer && point && rect && bounds) {
      if (targetAtPointer.id === active.id || !editable.includes(active.placement.horizon) || !editable.includes(targetAtPointer.placement.horizon)) return []
      const parentId = localParent(targetAtPointer) ?? targetAtPointer.id
      const parent = view.items.find(row => row.id === parentId) ?? view.nestingParents.find(row => row.id === parentId)
      const sameParent = active.placement.nestingParentId === parentId
      const validParent = parent && !parent.archivedAt && parent.status !== 'cancelled' && canNest(parent.id)
      if (inNestZone) {
        if (sameParent && parent && !sameOutlinePeriod(active.placement, parent.placement)) {
          const last = view.items.filter(row => localParent(row) === parentId).at(-1) ?? parent
          previewDrop({ type: 'move', targetId: parent.id, beforeId: null, marker: { id: last.id, position: 'after', nested: true } })
          return [{ id: targetAtPointer.id }]
        }
        if (!sameParent && validParent) {
          previewDrop({ type: 'nest', parentId, beforeId: null, marker: null })
          return [{ id: targetAtPointer.id }]
        }
        return []
      }
      if (localParent(targetAtPointer)) {
        if (!sameParent && !validParent) return []
        const siblings = view.items.filter(row => row.id !== active.id && row.placement.nestingParentId === parentId
          && row.placement.horizon === targetAtPointer.placement.horizon && row.placement.periodId === targetAtPointer.placement.periodId)
        const insertBefore = point.y < rect.top + rect.height / 2
        const beforeId = insertBefore ? targetAtPointer.id : siblings[siblings.indexOf(targetAtPointer) + 1]?.id ?? null
        const marker: SortMarker = { id: beforeId ?? targetAtPointer.id, position: beforeId ? 'before' : 'after', nested: true }
        previewDrop(sameParent ? { type: 'move', targetId: targetAtPointer.id, beforeId, marker }
          : { type: 'nest', parentId, beforeId, marker })
        return [{ id: targetAtPointer.id }]
      }
      const detachAtRoot = !!localParent(active) && sameOutlinePeriod(active.placement, targetAtPointer.placement)
      const candidates = rowsIn(targetAtPointer.placement.horizon, active, detachAtRoot)
      if (candidates.includes(targetAtPointer)) {
        const insertBefore = point.y < rect.top + rect.height / 2
        const siblings = candidates.filter(row => row.id !== active.id && localParent(row) === localParent(targetAtPointer))
        const next = siblings[siblings.indexOf(targetAtPointer) + 1]
        const peers = sortPeers(siblings, active), positions = peers.includes(targetAtPointer) ? peers : siblings
        const beforeId = insertBefore ? targetAtPointer.id : positions[positions.indexOf(targetAtPointer) + 1]?.id ?? null
        const markerBeforeId = insertBefore ? targetAtPointer.id : next?.id ?? null
        const marker = markerBeforeId ? siblings.find(row => row.id === markerBeforeId)!
          : view.items.filter(row => localParent(row) === targetAtPointer.id).at(-1) ?? targetAtPointer
        const position = markerBeforeId ? 'before' : 'after'
        previewDrop({ type: 'move', targetId: targetAtPointer.id, beforeId, marker: { id: marker.id, position, nested: false } })
        return [{ id: targetAtPointer.id }]
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
    const keyboardRows = (horizon: ItemHorizon) => rowsIn(horizon, active)
    let horizon = current.horizon, index = keyboardRows(horizon).findIndex(row => row.id === current.id)
    if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
      horizon = editable[editable.indexOf(horizon) + (event.code === 'ArrowRight' ? 1 : -1)] ?? horizon
    } else {
      index += event.code === 'ArrowDown' ? 1 : -1
    }
    const rows = keyboardRows(horizon), target = rows[Math.max(0, Math.min(index, rows.length - 1))]
    cursor.current = { id: target?.id ?? null, horizon }; event.preventDefault()
    if (target) revealRow(target.id)
    const node = target ? document.getElementById(`item-${target.id}`) : document.querySelector(`[data-horizon="${horizon}"] .column-content`)
    const rect = node?.getBoundingClientRect()
    return rect ? { x: rect.left, y: rect.top } : args.currentCoordinates
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: coordinates }))
  const end = (event: DragEndEvent) => {
    if (!activeGesture.current) { clearPointerDrop(); setNestingPreview(null); setDragging(null); return }
    activeGesture.current = false
    const drop = pointerDrop.current; clearPointerDrop(); setNestingPreview(null)
    const pointerTarget = drop?.type === 'move' ? drop : null
    const keyTarget = cursor.current; cursor.current = null; setDragging(null)
    if (drop?.type === 'nest') {
      const item = view.items.find(row => row.id === event.active.id), parent = view.items.find(row => row.id === drop.parentId) ?? view.nestingParents.find(row => row.id === drop.parentId)
      const selector = sourceFocus.current
      if (!busy && item && parent && latest.current.generation === generation && latest.current.selection === selection) void submit({ type: 'nest', itemId: item.id, parentId: parent.id, beforeId: drop.beforeId,
        expectedVersion: item.version, expectedParentVersion: parent.version, expectedPlacementVersion: item.placement.version, expectedParentPlacementVersion: parent.placement.version })
        .then(result => { if (result && selector && latest.current.generation === generation && latest.current.selection === selection) setNestFocus({ generation, selection, id: item.id, parentId: parent.id, selector }) })
      return
    }
    if (!event.over && !keyTarget && !pointerTarget) return
    const item = view.items.find(row => row.id === event.active.id)
    const target = view.items.find(row => row.id === (keyTarget ? keyTarget.id : pointerTarget?.targetId ?? event.over?.id))
    const horizon = keyTarget?.horizon ?? target?.placement.horizon ?? String(event.over?.id).replace('column:', '') as ItemHorizon
    if (busy || !item || !editable.includes(item.placement.horizon) || !editable.includes(horizon)) return
    const siblings = rowsIn(horizon, item), same = item.placement.horizon === horizon
    const peers = sortPeers(siblings, item), positions = target && peers.includes(target) ? peers : siblings
    let beforeId = pointerTarget ? pointerTarget.beforeId : target && positions.includes(target) ? target.id : null
    if (!pointerTarget && same && target && positions.indexOf(target) > positions.indexOf(item)) beforeId = positions[positions.indexOf(target) + 1]?.id ?? null
    if (beforeId === item.id) return
    const detachAtRoot = !!localParent(item) && same && pointerTarget?.marker.nested === false
    const keepNesting = !detachAtRoot && !!localParent(item) && !!target && localParent(target) === localParent(item) && same
    if (same && (!item.placement.nestingParentId || keepNesting) && beforeId === (peers[peers.indexOf(item) + 1]?.id ?? null)) return
    const period = view.periods[horizon]
    const moved = { ...view.orderNodes.find(node => node.id === item.id)!, horizon, periodId: period?.id ?? null, periodStart: period?.startDate ?? null, periodEnd: period?.endAt ?? null,
      ...(detachAtRoot ? { nestingParentId: null } : {}) }
    // Hidden ancestors must keep their relative slots while visible rows preview a drop.
    const targetNodes = view.orderNodes.filter(node => node.id !== item.id && node.horizon === horizon && node.periodId === moved.periodId)
      .filter(node => localParent({ id: node.id, placement: node }) === localParent({ ...item, placement: { ...item.placement, horizon, periodId: moved.periodId,
        ...(detachAtRoot ? { nestingParentId: null } : {}) } }))
      .sort((a, b) => a.sortKey - b.sortKey || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const insertion = beforeId ? targetNodes.findIndex(node => node.id === beforeId) : targetNodes.length
    targetNodes.splice(insertion < 0 ? targetNodes.length : insertion, 0, moved)
    const replacements = new Map(targetNodes.map((node, index) => [node.id, { ...node, sortKey: (index + 1) * 1024 }]))
    const children = new Set(view.rawItems.filter(row => row.placement.nestingParentId === item.id && sameOutlinePeriod(row.placement, item.placement)).map(row => row.id))
    const owner = item.placement.nestingParentId ? byId.get(item.placement.nestingParentId) : undefined
    const detach = detachAtRoot || !!owner && (horizon === 'later') !== (owner.placement.horizon === 'later')
    const projected = view.rawItems.map(row => {
      const node = replacements.get(row.id)
      if (children.has(row.id)) return { ...row, placement: { ...row.placement, horizon, periodId: moved.periodId } }
      if (horizon === 'later' && row.placement.nestingParentId === item.id) return { ...row, placement: { ...row.placement, nestingParentId: null } }
      return node ? { ...row, placement: { ...row.placement, horizon: node.horizon, periodId: node.periodId, sortKey: node.sortKey,
        nestingParentId: row.id === item.id && detach ? null : row.placement.nestingParentId } } : row
    })
    const ordered = outlineRows(projected, undefined, view.nestingParents)
    const rect = document.querySelector('.drag-overlay')?.getBoundingClientRect()
    if (rect) captureDropPosition(item.id, rect)
    const pending: Preview = { generation, selection, items: ordered, settled: false, success: false, focus: keyTarget ? item.id : null }
    setPreview(pending)
    const action: Action = detachAtRoot
      ? { type: 'unnest', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, beforeId }
      : { type: 'move', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon, beforeId,
        ...(keepNesting ? { keepNesting: true as const } : {}), ...(period ? { period: { kind: 'date' as const, startDate: period.startDate } } : {}) }
    void submit(action)
      .then(result => { if (latest.current.generation === generation && latest.current.selection === selection) setPreview(value => value === pending ? { ...pending, settled: true, success: !!result } : value) })
  }
  return { items, dragging, nestingPreview: dragging ? nestingPreview : null, sensors, collision, end, move,
    start: (event: DragStartEvent) => {
      const focused = document.activeElement
      sourceFocus.current = focused instanceof HTMLElement && focused.closest<HTMLElement>('[data-item-id]')?.dataset.itemId === event.active.id
        ? focused.matches('.drag-handle') ? '.drag-handle' : '.task-title' : null
      activeGesture.current = true; clearPointerDrop(); setNestingPreview(null); cursor.current = null; setDragging(String(event.active.id))
    },
    cancel: () => { activeGesture.current = false; clearPointerDrop(); setNestingPreview(null); cursor.current = null; setDragging(null) } }
}
