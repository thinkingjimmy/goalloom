/**
 * [INPUT]: Current snapshot, selected planning views, stable flows, visible columns, guarded actions and the flow-insight hooks (readiness, composer seeds, open review).
 * [OUTPUT]: Current/future editing, read-only history, period-bound drafts and drops, virtual task menus and relation lines:
 *           persistent under a single-flow filter, transient while a row's flow dot is hovered or focused (its flows, lit and tinted).
 *           Exposes `data-filtered` so cycle TODO dots remain hover/focus controls under a selected flow.
 *           Flow insight: an independently keyed breakpoint layer under a single-flow filter, empty-column cards, the review entry in week/month headers and per-row upcoming periods / next step for the context menu.
 * [POS]: Main board view; authoritative transactions revalidate all position and state changes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, pointerWithin, PointerSensor, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { compareInstants, currentPeriod, precedingPeriod, workspaceDate } from '../../../domain/calendar'
import { horizons } from '../../../shared/contracts/values'
import type { ItemSummary, ItemHorizon, PlanningPeriod } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import { messages, horizonNames, insightMessages, useLocale } from '../../i18n'
import type { Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import type { BoardView } from '../../state/board-periods'
import { useRelationLines } from '../../state/relation-lines'
import { flowTint } from '../../lib/colors'
import { Icon } from '../../components/icons'
import { HistoryColumn, PeriodPicker, useHistoryPage } from './HistoryColumn'
import { periodLabel } from './period-labels'
import { periodDates, planningLabel } from '../../lib/periods'
import { Backlog } from './Backlog'
import { QuickAdd, type QuickAddDraft, type SplitParent } from './QuickAdd'
import { RelationLines } from './RelationLines'
import { TaskRow } from './TaskRow'
import { VirtualRows, revealRow } from './VirtualRows'
import { Breakpoints } from '../insight/Breakpoints'
import { EmptyCard } from '../insight/EmptyCard'
import { emptyColumns, shorter } from '../insight/signals'
import { decompose } from '../insight/decompose'
import type { ReviewDue } from '../insight/review'
import { useInsightSettings } from '../../state/insight'
import type { ComposerSeed } from '../composer/Seeded'

// Rows under the pointer win; empty column space appends to that column. Keyboard drags keep closest-center.
const collision: CollisionDetection = args => {
  const within = pointerWithin(args)
  if (!within.length) return closestCenter(args)
  const rows = within.filter(hit => !String(hit.id).startsWith('column:'))
  return rows.length ? closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(container => rows.some(hit => hit.id === container.id)) }) : within
}

export interface AddRequest { seq: number; horizon: ItemHorizon | null; split: SplitParent | null }
export interface BoardInsight { ready: boolean; seed: (seed: Omit<ComposerSeed, 'key'>) => void; due: ReviewDue | null; review: (due: ReviewDue) => void }
interface BoardProps { snapshot: Snapshot; view: BoardView; flows: Flows; filter: string | null; columns: ItemHorizon[]; highlighted: string | null; addRequest: AddRequest | null; submit: (action: Action) => Promise<unknown>; busy: boolean; select: (id: string) => void; insight: BoardInsight }

export const Board = memo(function Board({ snapshot, view, flows, filter, columns, highlighted, addRequest, submit, busy, select, insight }: BoardProps) {
  useLocale()
  useEffect(() => { if (highlighted) { const frame = requestAnimationFrame(() => revealRow(highlighted)); return () => cancelAnimationFrame(frame) } }, [highlighted])
  const items = view.items
  const byColumn = useMemo(() => new Map(horizons.map(horizon => [horizon, items.filter(item => item.placement.horizon === horizon)])), [items])
  useEffect(() => {
    const request = view.locating, item = request && items.find(item => item.id === request.id)
    if (request && item && !view.loading(item.placement.horizon)) {
      const frame = requestAnimationFrame(() => { revealRow(request.id, '.task-title'); view.finishLocate(request.seq) })
      return () => cancelAnimationFrame(frame)
    }
  }, [view.locating, items])
  const [focused, setFocused] = useState<ItemHorizon>('later')
  const [adding, setAdding] = useState<{ horizon: ItemHorizon; period: PlanningPeriod | null; split: SplitParent | null; key: number } | null>(null)
  const handled = useRef(addRequest?.seq ?? 0)
  useEffect(() => {
    if (!addRequest || addRequest.seq === handled.current) return
    handled.current = addRequest.seq
    const wanted = addRequest.horizon ?? (document.activeElement?.closest('[data-horizon]') ? focused : 'later')
    // A request for a hidden column opens in the first visible one instead of off-screen.
    const horizon = columns.includes(wanted) ? wanted : columns[0]!
    const period = view.mode(horizon) === 'history' ? snapshot.periods.find(value => value.horizon === horizon) ?? null : view.periods[horizon] ?? null
    if (view.mode(horizon) === 'history') view.choose(horizon, null)
    setAdding({ horizon, period, split: addRequest.split, key: addRequest.seq })
    document.querySelector(`[data-horizon="${horizon}"]`)?.scrollIntoView({ inline: 'nearest' })
  }, [addRequest])
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragFocus, setDragFocus] = useState<{ id: string; horizon: ItemHorizon; periodId: string | null } | null>(null)
  const editableColumns = columns.filter(horizon => view.mode(horizon) !== 'history' && !view.loading(horizon) && !(view.mode(horizon) === 'future' && view.failed))
  useEffect(() => {
    if (!dragFocus) return
    if ((view.periods[dragFocus.horizon]?.id ?? null) !== dragFocus.periodId || view.mode(dragFocus.horizon) === 'history') { setDragFocus(null); return }
    if (view.loading(dragFocus.horizon)) return
    const frame = requestAnimationFrame(() => { revealRow(dragFocus.id, '.drag-handle'); setDragFocus(null) })
    return () => cancelAnimationFrame(frame)
  }, [dragFocus, items, view.loading(dragFocus?.horizon ?? 'later')])
  const keyboardTarget = useRef<{ id: string | null; horizon: ItemHorizon } | null>(null)
  const onAdding = useCallback((horizon: ItemHorizon, open: boolean) => setAdding(open ? { horizon, period: view.periods[horizon] ?? null, split: null, key: Date.now() } : null), [view.periods])
  const onFocus = useCallback((horizon: ItemHorizon, editable: boolean) => setFocused(editable ? horizon : 'later'), [])
  // A live drag owns the cursor app-wide so it stays a grabbing hand over any column or gap.
  useEffect(() => {
    if (!dragging) return
    document.documentElement.dataset.dragging = 'true'
    return () => { delete document.documentElement.dataset.dragging }
  }, [dragging])
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return sortableKeyboardCoordinates(event, args)
    const active = items.find(item => item.id === args.active)
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
    const item = items.find(item => item.id === event.active.id)
    // An empty keyboard destination deliberately has no row; collision geometry may still point at the source.
    const target = items.find(item => item.id === (keyTarget ? keyTarget.id : event.over?.id))
    const horizon = keyTarget?.horizon ?? target?.placement.horizon ?? String(event.over?.id).replace('column:', '') as ItemHorizon
    if (busy || !item || !editableColumns.includes(item.placement.horizon) || !editableColumns.includes(horizon)) return
    let beforeId = target?.id ?? null
    const columnItems = items.filter(row => row.placement.horizon === horizon)
    if (item.placement.horizon === horizon && target && columnItems.indexOf(target) > columnItems.indexOf(item)) beforeId = columnItems[columnItems.indexOf(target) + 1]?.id ?? null
    void submit({ type: 'move', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon, beforeId, ...(view.periods[horizon] ? { period: { kind: 'date' as const, startDate: view.periods[horizon]!.startDate } } : {}) })
      .then(result => { if (result && keyTarget) setDragFocus({ id: item.id, horizon, periodId: view.periods[horizon]?.id ?? null }) })
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
  const insightSettings = useInsightSettings()
  const empty = useMemo(() => emptyColumns(snapshot, columns, view.mode), [snapshot, columns, view.mode])
  return <DndContext sensors={sensors} collisionDetection={collision} onDragStart={event => { keyboardTarget.current = null; setDragging(String(event.active.id)) }} onDragCancel={() => { keyboardTarget.current = null; setDragging(null) }} onDragEnd={end} accessibility={{ announcements: { onDragStart: () => messages.dragStarted, onDragOver: () => messages.dragOver, onDragEnd: () => messages.dragEnded, onDragCancel: () => messages.dragCancelled }, screenReaderInstructions: { draggable: messages.dragInstructions } }}>
    <main className="board" aria-label={messages.board} data-lines={lines} data-filtered={filter !== null}>
      {/* Keyed by the filtered flow so switching flows replays the draw-in; a hover preview never animates in. */}
      {lines && <RelationLines key={`lines:${filter ?? 'preview'}`} items={items} relations={snapshot.relations} flows={flows} flowIds={active} focus={previewKey ? preview : null} animate={filter !== null} columns={columns} />}
      {filter && insightSettings.breakpoints && <Breakpoints key={`breakpoints:${filter}`} snapshot={snapshot} view={view} flows={flows} filter={filter} columns={columns} ready={insight.ready} submit={submit} seed={insight.seed} />}
      {columns.map(horizon => <Column key={horizon} horizon={horizon} items={byColumn.get(horizon)!}
        snapshot={snapshot} view={view} flows={flows} active={active} lines={lines} onPreview={onPreview} highlighted={highlighted} today={today} submit={submit} busy={busy} select={select}
        dragging={dragging} adding={adding?.horizon === horizon ? adding : null} onAdding={onAdding} onFocus={onFocus} insight={insight} sources={insightSettings.breakpoints ? empty.get(horizon as never) ?? null : null} />)}
    </main>
    {/* No drop animation: the overlay would fly back to the old slot before the authoritative refresh lands. */}
    <DragOverlay dropAnimation={null}>{dragging ? <div className="drag-overlay">{items.find(item => item.id === dragging)?.title}</div> : null}</DragOverlay>
  </DndContext>
})

const Column = memo(function Column({ horizon, items, snapshot, view, flows, active, lines, onPreview, highlighted, today, submit, busy, select, adding, onAdding, onFocus, dragging, insight, sources }: Omit<BoardProps, 'addRequest' | 'columns' | 'filter'> & {
  sources: ItemSummary[] | null
  active: string[]; lines: boolean; onPreview: (itemId: string | null) => void
  horizon: ItemHorizon; items: ItemSummary[]; today: string
  adding: { period: PlanningPeriod | null; split: SplitParent | null; key: number } | null
  dragging: string | null; onAdding: (horizon: ItemHorizon, open: boolean) => void
  onFocus: (horizon: ItemHorizon, editable: boolean) => void
}) {
  useLocale()
  const setAdding = (open: boolean) => onAdding(horizon, open), focus = (editable: boolean) => onFocus(horizon, editable)
  const [doneOpen, setDoneOpen] = useState(false), [backlog, setBacklog] = useState(false)
  const [menuItem, setMenuItem] = useState<string | null>(null)
  const drafts = useRef(new Map<string, QuickAddDraft>())
  const current = snapshot.periods.find(period => period.horizon === horizon)
  const period = view.periods[horizon] ?? null, mode = view.mode(horizon)
  const history = mode === 'history' ? period : null, future = mode === 'future'
  const loading = view.loading(horizon), failed = future && view.failed
  const disabled = busy || loading || failed
  const { setNodeRef, isOver } = useDroppable({ id: `column:${horizon}`, disabled: !!history || disabled })
  const calendar = snapshot.workspace.calendar!
  const previous = period ? precedingPeriod(calendar, period) : null
  const next = period && !history ? currentPeriod(calendar, period.horizon, period.endAt) : null
  const upcoming = useMemo(() => {
    if (!next) return null
    const periods = [next]
    while (periods.length < 3) periods.push(currentPeriod(calendar, next.horizon, periods.at(-1)!.endAt))
    return periods.map(value => ({ period: value, label: planningLabel(value, calendar, snapshot.observedAt) }))
  }, [next?.id, snapshot.observedAt])
  const target = mode === 'current' ? shorter(horizon) : null
  const split = useCallback((item: ItemSummary) => {
    if (target) void decompose({ snapshot, flows, ready: insight.ready, submit, seed: insight.seed }, { parent: item, target, children: [], manual: false })
  }, [target, snapshot, flows, insight, submit])
  const page = useHistoryPage(history, snapshot.workspace.revision)
  const earlier = history && (page.page ? page.page.previous !== null : previous !== null) ? previous : null
  const name = horizonNames[horizon]
  const displayName = future && period ? planningLabel(period, calendar, snapshot.observedAt) : name
  const section = useRef<HTMLElement | null>(null), refocus = useRef(false)
  const [focusAfterMove, setFocusAfterMove] = useState<string[] | null>(null)
  const switchTo = (target: PlanningPeriod | null) => {
    refocus.current = !!section.current?.contains(document.activeElement)
    setAdding(false); setMenuItem(null)
    view.choose(horizon, target?.id === current?.id ? null : target)
  }
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    section.current?.querySelector<HTMLElement>(mode !== 'current' ? '.period-title' : '[data-history-entry]')?.focus()
  }, [period?.id, mode])
  useEffect(() => { if (highlighted && items.some(item => item.id === highlighted && item.status === 'done')) setDoneOpen(true) }, [highlighted, items])
  const todo = useMemo(() => items.filter(item => item.status === 'todo'), [items]), done = useMemo(() => items.filter(item => item.status === 'done'), [items])
  const onMoved = useCallback((id: string) => {
    const index = todo.findIndex(item => item.id === id)
    setFocusAfterMove([...todo.slice(index + 1), ...todo.slice(0, index).reverse()].map(item => item.id))
  }, [todo])
  useEffect(() => {
    if (disabled || !focusAfterMove) return
    const id = focusAfterMove.find(value => todo.some(item => item.id === value))
    const frame = requestAnimationFrame(() => {
      if (id) revealRow(id, '.task-title')
      else section.current?.querySelector<HTMLElement>('[data-add-item]')?.focus()
      setFocusAfterMove(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [disabled, todo, focusAfterMove])
  const leaveOnEscape = (event: KeyboardEvent) => {
    if (mode !== 'current' && !busy && event.key === 'Escape' && !event.defaultPrevented && !event.nativeEvent.isComposing) { event.preventDefault(); switchTo(null) }
  }
  const row = (item: ItemSummary, index: number, total: number) => {
    const lit = active.length ? flows.of(item.id).find(flow => active.includes(flow.id)) : undefined
    return <TaskRow index={index} total={total} key={item.id} item={item} flows={flows} relations={snapshot.relations} candidates={view.candidates} today={today} rolloverFrom={view.rolloverSources[item.id]} selected={highlighted === item.id}
      dimmed={active.length > 0 && !lit} tint={lines && lit ? flowTint(lit.flowColor) : undefined} disabled={disabled} select={select} submit={submit} onPreview={onPreview}
      upcoming={upcoming} decompose={target ? split : null} onMenu={setMenuItem} onMoved={onMoved} />
  }
  const due = insight.due, review = mode !== 'current' || !due ? null
    : horizon === 'month' && (due.scope === 'month' || due.scope === 'both') ? due.month!
    : horizon === 'week' && due.scope === 'week' ? due.week! : null
  const reviewButton = review && <button className="review-entry" data-review={horizon} disabled={busy} onClick={() => insight.review(due!)}>
    <span className="review-entry-dot" />{review.lastDay ? due!.scope === 'both' ? insightMessages.reviewEntryBoth : insightMessages.reviewEntry : insightMessages.reviewEntryAfter(planningLabel(review.period, calendar, snapshot.observedAt))}
  </button>
  const addButton = <button className="icon-button small" data-add-item aria-label={messages.newInColumn(displayName)} aria-pressed={!!adding} disabled={disabled} onClick={() => setAdding(!adding)}><Icon name="add" size={16} /></button>
  return <section className={`board-column ${isOver ? 'drop-target' : ''}`} data-history={!!history} data-period-mode={mode} data-period-id={period?.id} aria-busy={loading}
    onKeyDown={leaveOnEscape} onFocusCapture={() => focus(!history)} onPointerDown={() => focus(!history)} data-horizon={horizon} aria-label={messages.columnLabel(name)} ref={node => { setNodeRef(node); section.current = node }}>
    {history ? <header className="column-header history-header">
      <button className="icon-button small" aria-label={messages.previousPeriod(name)} disabled={!earlier || busy} onClick={() => earlier && switchTo(earlier)}><Icon name="previous" size={16} /></button>
      <h2><PeriodPicker period={history} revision={snapshot.workspace.revision} onPick={switchTo} /></h2>
      <button className="icon-button small" aria-label={messages.nextPeriod(name)} disabled={busy} onClick={() => switchTo(currentPeriod(calendar, history.horizon, history.endAt))}><Icon name="next" size={16} /></button>
      <span className="column-spacer" />
      <button className="history-return" disabled={busy} onClick={() => switchTo(null)}>{messages.returnCurrent}<kbd className="keycap" aria-hidden="true">esc</kbd></button>
    </header> : future && period ? <>
      <header className="column-header future-header">
        <button className="icon-button small" aria-label={messages.previousPeriod(name)} disabled={!previous || busy} onClick={() => switchTo(previous)}><Icon name="previous" size={16} /></button>
        <h2><span className="period-title" tabIndex={-1} title={periodDates(period)}>{displayName}</span></h2>
        <button className="icon-button small" data-next-period aria-label={messages.nextPeriod(name)} disabled={busy} onClick={() => switchTo(next)}><Icon name="next" size={16} /></button>
        <span className="column-spacer" />{addButton}
      </header>
      <div className="future-period-meta"><span title={periodDates(period)}>{periodDates(period)}</span><button className="text-button" disabled={busy} onClick={() => switchTo(null)}>{messages.returnCurrentPeriod}</button></div>
    </> : <header className="column-header">
      <h2>{name}</h2>
      <span className="column-meta">{horizon === 'later' ? todo.length : periodLabel(horizon, period!)}</span>
      <span className="column-spacer" />
      {reviewButton}
      {period && <>
        <button className="icon-button small" data-history-entry aria-label={messages.historyButton(name)} title={previous ? messages.columnHistory(periodLabel(horizon, previous)) : undefined} disabled={!previous || busy} onClick={() => switchTo(previous)}><Icon name="history" size={16} /></button>
        <button className="icon-button small" data-next-period aria-label={messages.nextPeriod(name)} disabled={busy} onClick={() => switchTo(next)}><Icon name="next" size={16} /></button>
      </>}
      {addButton}
    </header>}
    {mode === 'current' && !!snapshot.backlog[horizon] && <button className="backlog-entry" onClick={() => setBacklog(true)}>{messages.backlogCount} {snapshot.backlog[horizon]}<Icon name="next" size={14} /></button>}
    {backlog && <Backlog horizon={horizon} revision={snapshot.workspace.revision} submit={submit} busy={busy} close={() => setBacklog(false)} select={select} />}
    <div className="column-content">
      {history ? <HistoryColumn history={page} select={select} onEarlier={earlier && (() => switchTo(earlier))} /> : <>
        {loading && items.length === 0 && <p className="period-loading" role="status">{messages.loadingPeriod}</p>}
        {failed && <p className="inline-error" role="alert">{messages.planningLoadFailed} <button className="text-button" onClick={view.retry}>{messages.retryPeriod}</button></p>}
        <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
          <VirtualRows items={todo} dragging={dragging} highlighted={highlighted} pinned={menuItem} render={row} />
          {adding && <QuickAdd key={`${adding.period?.id ?? 'later'}:${adding.key}`} horizon={horizon} period={adding.period} periodName={adding.period ? planningLabel(adding.period, calendar, snapshot.observedAt) : name}
            expired={!!adding.period && compareInstants(adding.period.endAt, snapshot.observedAt) <= 0} drafts={drafts.current} retarget={() => {
              const draft = drafts.current.get(adding.period?.id ?? 'later')
              if (draft) drafts.current.set(period?.id ?? 'later', draft)
              setAdding(true)
            }} flows={flows} items={view.candidates} split={adding.split} submit={submit} busy={disabled} close={() => setAdding(false)} />}
          {done.length > 0 && <details className="completed-fold" open={doneOpen} onToggle={event => setDoneOpen(event.currentTarget.open)}><summary>{messages.done} {done.length}<Icon name="next" size={14} /></summary>{doneOpen && <VirtualRows items={done} dragging={dragging} highlighted={highlighted} render={row} />}</details>}
        </SortableContext>
        {items.length === 0 && !adding && !loading && !failed && sources && <EmptyCard horizon={horizon as 'month' | 'week' | 'day'} sources={sources} period={current!} insight={insight} disabled={disabled} />}
        {items.length === 0 && !adding && !loading && !failed && !sources && <div className="empty-column"><Icon name="empty" size={44} strokeWidth={1.1} /><p>{horizon === 'later' ? messages.emptyLater : horizon === 'day' ? messages.emptyDay : messages.emptyDirection}</p></div>}
      </>}
    </div>
  </section>
})
