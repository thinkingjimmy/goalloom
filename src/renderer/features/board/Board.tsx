/**
 * [INPUT]: Summary snapshot, stable flow views, visible columns and guarded actions.
 * [OUTPUT]: Memoized columns, virtual task rows, shared editable drop targets for keyboard/pointer sorting and the relation-line overlay:
 *           persistent under a single-flow filter, transient while a row's flow dot is hovered or focused (its flows, lit and tinted).
 * [POS]: Main board view; authoritative transactions revalidate all position and state changes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, pointerWithin, PointerSensor, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { currentPeriod, precedingPeriod, workspaceDate } from '../../../domain/calendar'
import { horizons, type ItemSummary, type ItemHorizon, type PlanningPeriod } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import { messages, horizonNames, useLocale } from '../../i18n'
import { longDate, monthDay, monthName, shortDate, yearMonth, yearOf } from '../../i18n/format'
import { addDays } from '../../lib/dates'
import type { Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { useRelationLines } from '../../state/relation-lines'
import { flowTint } from '../../lib/colors'
import { Icon } from '../../components/icons'
import { HistoryColumn } from './HistoryColumn'
import { Backlog } from './Backlog'
import { QuickAdd, type SplitParent } from './QuickAdd'
import { RelationLines } from './RelationLines'
import { TaskRow } from './TaskRow'
import { VirtualRows, revealRow } from './VirtualRows'

// Rows under the pointer win; empty column space appends to that column. Keyboard drags keep closest-center.
const collision: CollisionDetection = args => {
  const within = pointerWithin(args)
  if (!within.length) return closestCenter(args)
  const rows = within.filter(hit => !String(hit.id).startsWith('column:'))
  return rows.length ? closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(container => rows.some(hit => hit.id === container.id)) }) : within
}

export interface AddRequest { seq: number; horizon: ItemHorizon | null; split: SplitParent | null }
interface BoardProps { snapshot: Snapshot; flows: Flows; filter: string | null; columns: ItemHorizon[]; highlighted: string | null; addRequest: AddRequest | null; submit: (action: Action) => Promise<unknown>; busy: boolean; select: (id: string) => void }

export const Board = memo(function Board({ snapshot, flows, filter, columns, highlighted, addRequest, submit, busy, select }: BoardProps) {
  useLocale()
  useEffect(() => { if (highlighted) { const frame = requestAnimationFrame(() => revealRow(highlighted)); return () => cancelAnimationFrame(frame) } }, [highlighted])
  const byColumn = useMemo(() => new Map(horizons.map(horizon => [horizon, snapshot.items.filter(item => item.placement.horizon === horizon)])), [snapshot.items])
  const [focused, setFocused] = useState<ItemHorizon>('later')
  const [adding, setAdding] = useState<{ horizon: ItemHorizon; split: SplitParent | null; key: number } | null>(null)
  const handled = useRef(addRequest?.seq ?? 0)
  useEffect(() => {
    if (!addRequest || addRequest.seq === handled.current) return
    handled.current = addRequest.seq
    const wanted = addRequest.horizon ?? (document.activeElement?.closest('[data-horizon]') ? focused : 'later')
    // A request for a hidden column opens in the first visible one instead of off-screen.
    const horizon = columns.includes(wanted) ? wanted : columns[0]!
    setAdding({ horizon, split: addRequest.split, key: addRequest.seq })
    document.querySelector(`[data-horizon="${horizon}"]`)?.scrollIntoView({ inline: 'nearest' })
  }, [addRequest])
  const [dragging, setDragging] = useState<string | null>(null)
  const [history, setHistory] = useState<Partial<Record<ItemHorizon, PlanningPeriod | null>>>({})
  const editableColumns = columns.filter(horizon => !history[horizon])
  const onHistory = useCallback((horizon: ItemHorizon, period: PlanningPeriod | null) => setHistory(previous => ({ ...previous, [horizon]: period })), [])
  const keyboardTarget = useRef<{ id: string | null; horizon: ItemHorizon } | null>(null)
  const onAdding = useCallback((horizon: ItemHorizon, open: boolean) => setAdding(open ? { horizon, split: null, key: Date.now() } : null), [])
  const onFocus = useCallback((horizon: ItemHorizon, editable: boolean) => setFocused(editable ? horizon : 'later'), [])
  // A live drag owns the cursor app-wide so it stays a grabbing hand over any column or gap.
  useEffect(() => {
    if (!dragging) return
    document.documentElement.dataset.dragging = 'true'
    return () => { delete document.documentElement.dataset.dragging }
  }, [dragging])
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return sortableKeyboardCoordinates(event, args)
    const active = snapshot.items.find(item => item.id === args.active)
    if (!active || !editableColumns.includes(active.placement.horizon)) return
    const cursor = keyboardTarget.current && editableColumns.includes(keyboardTarget.current.horizon) ? keyboardTarget.current : { id: active.id, horizon: active.placement.horizon }
    let horizon = cursor.horizon
    const source = byColumn.get(horizon)!.filter(item => item.status === active.status)
    let index = source.findIndex(item => item.id === cursor.id)
    if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
      horizon = editableColumns[editableColumns.indexOf(horizon) + (event.code === 'ArrowRight' ? 1 : -1)] ?? horizon
    } else index += event.code === 'ArrowDown' ? 1 : -1
    const rows = byColumn.get(horizon)!.filter(item => item.status === active.status)
    const target = rows[Math.max(0, Math.min(index, rows.length - 1))]
    keyboardTarget.current = { id: target?.id ?? null, horizon }
    event.preventDefault()
    if (target) revealRow(target.id)
    const node = target ? document.getElementById(`item-${target.id}`) : document.querySelector(`[data-horizon="${horizon}"] .column-content`)
    const rect = node?.getBoundingClientRect()
    return rect ? { x: rect.left, y: rect.top } : args.currentCoordinates
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }))
  const end = (event: DragEndEvent) => {
    setDragging(null)
    const keyTarget = keyboardTarget.current
    keyboardTarget.current = null
    if (!event.over && !keyTarget) return
    const item = snapshot.items.find(item => item.id === event.active.id)
    // An empty keyboard destination deliberately has no row; collision geometry may still point at the source.
    const target = snapshot.items.find(item => item.id === (keyTarget ? keyTarget.id : event.over?.id))
    const horizon = keyTarget?.horizon ?? target?.placement.horizon ?? String(event.over?.id).replace('column:', '') as ItemHorizon
    if (!item || !editableColumns.includes(item.placement.horizon) || !editableColumns.includes(horizon)) return
    let beforeId = target?.id ?? null
    const columnItems = snapshot.items.filter(row => row.placement.horizon === horizon)
    if (item.placement.horizon === horizon && target && columnItems.indexOf(target) > columnItems.indexOf(item)) beforeId = columnItems[columnItems.indexOf(target) + 1]?.id ?? null
    void submit({ type: 'move', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon, beforeId }).then(() => { if (keyTarget) requestAnimationFrame(() => revealRow(item.id, '.drag-handle')) })
  }
  const today = workspaceDate(snapshot.workspace.calendar!.timezone, snapshot.observedAt)
  // Hovering or focusing a coloured flow dot previews that item's flows, even under 全部; leaving waits 120ms so crossing rows never flickers.
  const [preview, setPreview] = useState<string | null>(null)
  const previewTimer = useRef(0)
  const onPreview = useCallback((itemId: string | null) => {
    clearTimeout(previewTimer.current)
    if (itemId) setPreview(itemId); else previewTimer.current = window.setTimeout(() => setPreview(null), 120)
  }, [])
  useEffect(() => () => clearTimeout(previewTimer.current), [])
  const enabled = useRelationLines().enabled
  const previewKey = enabled && preview ? flows.of(preview).map(flow => flow.id).join(' ') : ''
  const active = useMemo(() => previewKey ? previewKey.split(' ') : filter ? [filter] : [], [previewKey, filter])
  const lines = enabled && active.length > 0
  return <DndContext sensors={sensors} collisionDetection={collision} onDragStart={event => { keyboardTarget.current = null; setDragging(String(event.active.id)) }} onDragCancel={() => { keyboardTarget.current = null; setDragging(null) }} onDragEnd={end} accessibility={{ announcements: { onDragStart: () => messages.dragStarted, onDragOver: () => messages.dragOver, onDragEnd: () => messages.dragEnded, onDragCancel: () => messages.dragCancelled }, screenReaderInstructions: { draggable: messages.dragInstructions } }}>
    <main className="board" aria-label={messages.board} data-lines={lines}>
      {/* Keyed by the filtered flow so switching flows replays the draw-in; a hover preview never animates in. */}
      {lines && <RelationLines key={filter ?? 'preview'} items={snapshot.items} relations={snapshot.relations} flows={flows} flowIds={active} focus={previewKey ? preview : null} animate={filter !== null} columns={columns} />}
      {columns.map(horizon => <Column key={horizon} horizon={horizon} items={byColumn.get(horizon)!}
        snapshot={snapshot} flows={flows} active={active} lines={lines} onPreview={onPreview} highlighted={highlighted} today={today} submit={submit} busy={busy} select={select}
        dragging={dragging} adding={adding?.horizon === horizon ? adding : null} onAdding={onAdding} onFocus={onFocus} history={history[horizon] ?? null} onHistory={onHistory} />)}
    </main>
    {/* No drop animation: the overlay would fly back to the old slot before the authoritative refresh lands. */}
    <DragOverlay dropAnimation={null}>{dragging ? <div className="drag-overlay">{snapshot.items.find(item => item.id === dragging)?.title}</div> : null}</DragOverlay>
  </DndContext>
})

const Column = memo(function Column({ horizon, items, snapshot, flows, active, lines, onPreview, highlighted, today, submit, busy, select, adding, onAdding, onFocus, dragging, history, onHistory }: Omit<BoardProps, 'addRequest' | 'columns' | 'filter'> & {
  active: string[]; lines: boolean; onPreview: (itemId: string | null) => void
  horizon: ItemHorizon; items: ItemSummary[]; today: string; adding: { split: SplitParent | null; key: number } | null; dragging: string | null; onAdding: (horizon: ItemHorizon, open: boolean) => void; onFocus: (horizon: ItemHorizon, editable: boolean) => void
  history: PlanningPeriod | null; onHistory: (horizon: ItemHorizon, period: PlanningPeriod | null) => void
}) {
  useLocale()
  const setAdding = (open: boolean) => onAdding(horizon, open), focus = (editable: boolean) => onFocus(horizon, editable)
  const [doneOpen, setDoneOpen] = useState(false)
  useEffect(() => { if (highlighted && items.some(item => item.id === highlighted && item.status === 'done')) setDoneOpen(true) }, [highlighted, items])
  const setHistory = (period: PlanningPeriod | null) => onHistory(horizon, period)
  const [backlog, setBacklog] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: `column:${horizon}`, disabled: history !== null })
  const current = snapshot.periods.find(period => period.horizon === horizon)
  const period = history ?? current
  const calendar = snapshot.workspace.calendar!
  const previous = period ? precedingPeriod(calendar, period) : null
  const todo = useMemo(() => items.filter(item => item.status === 'todo'), [items]), done = useMemo(() => items.filter(item => item.status === 'done'), [items])
  const row = (item: ItemSummary, index: number, total: number) => {
    // A row in an active flow takes that flow's tint while lines are drawn; the rest fade.
    const lit = active.length ? flows.of(item.id).find(flow => active.includes(flow.id)) : undefined
    return <TaskRow index={index} total={total} key={item.id} item={item} flows={flows} relations={snapshot.relations} candidates={snapshot.items} today={today} rolloverFrom={snapshot.rolloverSources[item.id]} selected={highlighted === item.id}
      dimmed={active.length > 0 && !lit} tint={lines && lit ? flowTint(lit.flowColor) : undefined} disabled={busy} select={select} submit={submit} onPreview={onPreview} />
  }
  return <section className={`board-column ${isOver ? 'drop-target' : ''}`} onFocusCapture={() => focus(!history)} onPointerDown={() => focus(!history)} data-horizon={horizon} aria-label={messages.columnLabel(horizonNames[horizon])} ref={setNodeRef}>
    <header className="column-header">
      <h2>{horizonNames[horizon]}</h2>
      {history ? <span className="history-badge"><Icon name="history" size={12} strokeWidth={1.8} />{messages.history}</span>
        : <span className="column-meta">{horizon === 'later' ? todo.length : periodLabel(horizon, period!)}</span>}
      <span className="column-spacer" />
      {history && <button className="history-return" onClick={() => setHistory(null)}>{messages.returnCurrent}<Icon name="next" size={12} strokeWidth={2} /></button>}
      {period && !history && <button className="icon-button small" aria-label={messages.previousPeriod(horizonNames[horizon])} title={messages.columnHistory(horizonNames[horizon])} disabled={!previous} onClick={() => { setHistory(previous); setAdding(false); focus(false) }}><Icon name="history" size={16} /></button>}
      {!history && <button className="icon-button small" aria-label={messages.newInColumn(horizonNames[horizon])} aria-pressed={!!adding} disabled={busy} onClick={() => setAdding(!adding)}><Icon name="add" size={16} /></button>}
    </header>
    {history && <div className="period-navigation">
      <button className="icon-button small" aria-label={messages.previousPeriod(horizonNames[horizon])} disabled={!previous} onClick={() => setHistory(previous)}><Icon name="previous" size={16} /></button>
      <span className="period-label tabular">{historyLabel(horizon, history)}</span>
      <button className="icon-button small" aria-label={messages.nextPeriod(horizonNames[horizon])} onClick={() => { const next = currentPeriod(calendar, history.horizon, history.endAt); setHistory(next.id === current?.id ? null : next) }}><Icon name="next" size={16} /></button>
    </div>}
    {!history && !!snapshot.backlog[horizon] && <button className="backlog-entry" onClick={() => setBacklog(true)}>{messages.backlogCount} {snapshot.backlog[horizon]}<Icon name="next" size={14} /></button>}
    {backlog && <Backlog horizon={horizon} revision={snapshot.workspace.revision} submit={submit} busy={busy} close={() => setBacklog(false)} select={select} />}
    <div className="column-content">
      {history ? <HistoryColumn key={history.id} period={history} revision={snapshot.workspace.revision} select={select} /> : <>
        <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
          <VirtualRows items={todo} dragging={dragging} highlighted={highlighted} render={row} />
          {adding && <QuickAdd key={adding.key} horizon={horizon} flows={flows} items={snapshot.items} split={adding.split} submit={submit} busy={busy} close={() => setAdding(false)} />}
          {done.length > 0 && <details className="completed-fold" open={doneOpen} onToggle={event => setDoneOpen(event.currentTarget.open)}><summary>{messages.done} {done.length}<Icon name="next" size={14} /></summary>{doneOpen && <VirtualRows items={done} dragging={dragging} highlighted={highlighted} render={row} />}</details>}
        </SortableContext>
        {items.length === 0 && !adding && <div className="empty-column"><Icon name="empty" size={44} strokeWidth={1.1} /><p>{horizon === 'later' ? messages.emptyLater : horizon === 'day' ? messages.emptyDay : messages.emptyDirection}</p></div>}
      </>}
    </div>
  </section>
})

/** Past periods read as a single day, a named month or a range, never as the raw half-open date pair. */
function historyLabel(horizon: ItemHorizon, period: PlanningPeriod): string {
  if (horizon === 'day') return longDate(period.startDate)
  if (horizon === 'month') return yearMonth(period.startDate)
  return `${yearOf(period.startDate)} ${periodLabel(horizon, period)}`
}

/** Column-header label for a current period; shared with the onboarding board preview. */
export function periodLabel(horizon: ItemHorizon, period: Pick<PlanningPeriod, 'startDate' | 'endDate'>): string {
  if (horizon === 'day') return monthDay(period.startDate)
  if (horizon === 'month') return monthName(period.startDate)
  return `${shortDate(period.startDate)} – ${shortDate(addDays(period.endDate, -1))}`
}
