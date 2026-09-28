/**
 * [INPUT]: Current snapshot, selected planning views, stable flows, independent Later visibility and fixed planning columns, guarded actions and flow-insight hooks.
 * [OUTPUT]: One inline bidirectional period header, directional content entrances, period-scoped scroll, live past-task actions, current/future drafts/drops, virtual task menus and relation lines:
 *           persistent under a single-flow filter, transient while a row's flow dot is hovered or focused (its flows, lit and tinted).
 *           Exposes `data-filtered` so cycle TODO dots remain hover/focus controls under a selected flow.
 *           Flow insight: one breakpoint layer for filtered flows or the highlighted preview chain, retained pending actions across hover exits, empty-column cards, review prompts beside dates and per-row next steps.
 * [POS]: Main board view; group-aware optimistic drops and virtual-row FLIP follow the shared parent order, with authoritative transaction validation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { compareInstants, currentPeriod, precedingPeriod, workspaceDate } from '../../../domain/calendar'
import { horizons } from '../../../shared/contracts/values'
import type { ItemSummary, ItemHorizon, PlanningPeriod } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import { messages, horizonNames, insightMessages, useLocale } from '../../i18n'
import type { Action } from '../../state/use-workspace'
import { activeFlowGraph, flowChain, type Flows } from '../../state/flows'
import type { BoardView } from '../../state/board-periods'
import { useRelationLines } from '../../state/relation-lines'
import { flowTint } from '../../lib/colors'
import { Icon } from '../../components/icons'
import { PastPeriod, usePastPeriod } from './PastPeriod'
import { periodLabel, periodTitle } from './period-labels'
import { periodDates, planningLabel } from '../../lib/periods'
import { Backlog } from './Backlog'
import { QuickAdd, type QuickAddDraft, type SplitParent } from './QuickAdd'
import { RelationLines } from './RelationLines'
import { TaskRow } from './TaskRow'
import { VirtualRows, revealRow } from './VirtualRows'
import { useBoardDrag } from './useBoardDrag'
import { BoardLayout } from './BoardLayout'
import { usePeriodMotion } from './usePeriodMotion'
import { Breakpoints } from '../insight/Breakpoints'
import { EmptyCard } from '../insight/EmptyCard'
import { emptyColumns, shorter } from '../insight/signals'
import { decompose } from '../insight/decompose'
import type { ReviewDue } from '../insight/review'
import { useInsightSettings } from '../../state/insight'
import type { ComposerSeed } from '../composer/Seeded'

export interface AddRequest { seq: number; horizon: ItemHorizon | null; split: SplitParent | null }
export interface BoardInsight { ready: boolean; seed: (seed: Omit<ComposerSeed, 'key'>) => void; due: ReviewDue | null; review: (due: ReviewDue) => void }
interface BoardProps { snapshot: Snapshot; view: BoardView; flows: Flows; filter: string | null; columns: ItemHorizon[]; highlighted: string | null; addRequest: AddRequest | null; submit: (action: Action) => Promise<unknown>; busy: boolean; select: (id: string) => void; insight: BoardInsight }

export const Board = memo(function Board({ snapshot, view, flows, filter, columns, highlighted, addRequest, submit, busy, select, insight }: BoardProps) {
  useLocale()
  useEffect(() => { if (highlighted) { const frame = requestAnimationFrame(() => revealRow(highlighted)); return () => cancelAnimationFrame(frame) } }, [highlighted])
  const drag = useBoardDrag({ snapshot, view, columns, busy, submit })
  const { items, dragging } = drag
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
  const onAdding = useCallback((horizon: ItemHorizon, open: boolean) => setAdding(open ? { horizon, period: view.periods[horizon] ?? null, split: null, key: Date.now() } : null), [view.periods])
  const onFocus = useCallback((horizon: ItemHorizon, editable: boolean) => setFocused(editable ? horizon : 'later'), [])
  const today = workspaceDate(snapshot.workspace.calendar!.timezone, snapshot.observedAt)
  // A dot starts the preview; its flow rows and breakpoint controls keep it reachable until pointer/focus leaves.
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
  const graph = useMemo(() => activeFlowGraph(items, snapshot.relations, flows, active), [items, snapshot.relations, flows, active])
  const previewChain = useMemo(() => flowChain(graph, previewKey ? preview : null), [graph, previewKey, preview])
  const lines = enabled && active.length > 0
  const inPreview = (target: EventTarget | null) => {
    if (!previewKey || !(target instanceof Element)) return false
    if (target.closest('.breakpoints')) return true
    const id = target.closest<HTMLElement>('.task-row')?.dataset.itemId
    return !!id && flows.of(id).some(flow => active.includes(flow.id))
  }
  const holdPreview = (event: { target: EventTarget }) => { if (inPreview(event.target)) clearTimeout(previewTimer.current) }
  const leavePreview = (event: { relatedTarget: EventTarget | null }) => { if (preview && !inPreview(event.relatedTarget)) onPreview(null) }
  const insightSettings = useInsightSettings()
  const empty = useMemo(() => emptyColumns(snapshot, columns, view.mode), [snapshot, columns, view.mode])
  const column = (horizon: ItemHorizon) => <Column key={horizon} horizon={horizon} items={byColumn.get(horizon)!} visible={columns.includes(horizon)}
    snapshot={snapshot} view={view} flows={flows} active={active} lines={lines} onPreview={onPreview} highlighted={highlighted} today={today} submit={submit} busy={busy} select={select}
    dragging={dragging} adding={adding?.horizon === horizon ? adding : null} onAdding={onAdding} onFocus={onFocus} insight={insight} sources={insightSettings.breakpoints ? empty.get(horizon as never) ?? null : null} />
  return <DndContext sensors={drag.sensors} collisionDetection={drag.collision} onDragStart={drag.start} onDragCancel={drag.cancel} onDragEnd={drag.end} accessibility={{ announcements: { onDragStart: () => messages.dragStarted, onDragOver: () => messages.dragOver, onDragEnd: () => messages.dragEnded, onDragCancel: () => messages.dragCancelled }, screenReaderInstructions: { draggable: messages.dragInstructions } }}>
    <main className="board" aria-label={messages.board} data-lines={lines} data-filtered={filter !== null}
      onPointerOver={holdPreview} onPointerOut={leavePreview} onFocus={holdPreview} onBlur={leavePreview}>
      {/* Keyed by the filtered flow so switching flows replays the draw-in; a hover preview never animates in. */}
      {lines && <RelationLines key={`lines:${filter ?? 'preview'}`} items={items} graph={graph} flows={flows} focus={previewKey ? preview : null} animate={filter !== null} columns={columns} />}
      {insightSettings.breakpoints && <Breakpoints key={`breakpoints:${snapshot.workspace.generation}`} snapshot={snapshot} view={view} flows={flows} flowIds={active} previewChain={previewChain} columns={columns} ready={insight.ready} submit={submit} seed={insight.seed} />}
      <BoardLayout open={columns.includes('later')} sidebar={column('later')}>
        {columns.filter(horizon => horizon !== 'later').map(column)}
      </BoardLayout>
    </main>
    {/* The placement preview owns the drop; outer rows animate from the release position. */}
    <DragOverlay dropAnimation={null}>{dragging ? <div className="drag-overlay">{items.find(item => item.id === dragging)?.title}</div> : null}</DragOverlay>
  </DndContext>
})

const Column = memo(function Column({ horizon, items, visible, snapshot, view, flows, active, lines, onPreview, highlighted, today, submit, busy, select, adding, onAdding, onFocus, dragging, insight, sources }: Omit<BoardProps, 'addRequest' | 'columns' | 'filter'> & {
  sources: ItemSummary[] | null
  active: string[]; lines: boolean; onPreview: (itemId: string | null) => void
  horizon: ItemHorizon; items: ItemSummary[]; today: string; visible: boolean
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
  const disabled = busy || loading || failed || !visible
  const { setNodeRef, isOver } = useDroppable({ id: `column:${horizon}`, disabled: !!history || disabled })
  const calendar = snapshot.workspace.calendar!
  const previous = period ? precedingPeriod(calendar, period) : null
  const next = period ? currentPeriod(calendar, period.horizon, period.endAt) : null
  const upcoming = useMemo(() => {
    if (!next || history) return null
    const periods = [next]
    while (periods.length < 3) periods.push(currentPeriod(calendar, next.horizon, periods.at(-1)!.endAt))
    return periods.map(value => ({ period: value, label: planningLabel(value, calendar, snapshot.observedAt) }))
  }, [next?.id, history?.id, snapshot.observedAt])
  const target = mode === 'current' ? shorter(horizon) : null
  const split = useCallback((item: ItemSummary) => {
    if (target) void decompose({ snapshot, flows, ready: insight.ready, submit, seed: insight.seed }, { parent: item, target, children: [], manual: false })
  }, [target, snapshot, flows, insight, submit])
  const page = usePastPeriod(history, snapshot.workspace.generation, snapshot.workspace.revision)
  const earlier = history && (page.page ? page.page.previous !== null : previous !== null) ? previous : null
  const name = horizonNames[horizon]
  const displayName = mode !== 'current' && period ? planningLabel(period, calendar, snapshot.observedAt) : name
  const section = useRef<HTMLElement | null>(null), refocus = useRef<string | null>(null)
  const prepareMotion = usePeriodMotion(section, snapshot.workspace.generation, period?.id, loading || page.loading)
  const [focusAfterMove, setFocusAfterMove] = useState<string[] | null>(null)
  const switchTo = (target: PlanningPeriod | null, animate = false) => {
    const destination = target ?? current
    if (destination && period && destination.id !== period.id) prepareMotion(destination.id, destination.startDate > period.startDate ? 1 : -1, animate)
    const active = document.activeElement
    refocus.current = section.current?.contains(active) ? active?.hasAttribute('data-next-period') ? '[data-next-period]' : '[data-previous-period]' : null
    setAdding(false); setMenuItem(null)
    view.choose(horizon, target?.id === current?.id ? null : target)
  }
  useEffect(() => { section.current?.querySelector('.column-content')?.scrollTo({ top: 0 }) }, [period?.id])
  useEffect(() => {
    if (!refocus.current || history && page.loading) return
    const target = section.current?.querySelector<HTMLButtonElement>(refocus.current)
    if (section.current?.contains(document.activeElement) || document.activeElement === document.body) {
      if (target && !target.disabled) target.focus()
      else section.current?.querySelector<HTMLElement>('.period-title')?.focus()
    }
    refocus.current = null
  }, [period?.id, mode, history ? page.loading : false])
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
    return <TaskRow index={index} total={total} key={item.id} item={item} flows={flows} relations={snapshot.relations} candidates={view.candidates} today={today} selected={highlighted === item.id}
      dimmed={active.length > 0 && !lit} tint={lines && lit ? flowTint(lit.flowColor) : undefined} disabled={disabled} select={select} submit={submit} onPreview={onPreview}
      upcoming={upcoming} decompose={target ? split : null} onMenu={setMenuItem} onMoved={onMoved} />
  }
  const due = insight.due, review = mode !== 'current' || !due ? null
    : horizon === 'month' && (due.scope === 'month' || due.scope === 'both') ? due.month!
    : horizon === 'week' && due.scope === 'week' ? due.week! : null
  const reviewLabel = review ? review.lastDay ? due!.scope === 'both' ? insightMessages.reviewEntryBoth : insightMessages.reviewEntry : insightMessages.reviewEntryAfter(planningLabel(review.period, calendar, snapshot.observedAt)) : undefined
  const reviewButton = review && <button className="review-entry" data-review={horizon} title={reviewLabel} disabled={busy} onClick={() => insight.review(due!)}>
    <span className="review-entry-dot" /><span className="review-entry-label">{reviewLabel}</span>
  </button>
  const addButton = <button className="icon-button small" data-add-item aria-label={messages.newInColumn(displayName)} aria-pressed={!!adding} disabled={disabled} onClick={() => setAdding(!adding)}><Icon name="add" size={16} /></button>
  const back = history ? earlier : previous
  const returnLabel = horizon === 'later' ? '' : messages.returnCurrentPeriod[horizon]
  const heading = period && current ? periodTitle(period, current, calendar) : name
  const date = period ? periodLabel(horizon, period) : null
  return <section className={`board-column ${isOver ? 'drop-target' : ''}`} data-history={!!history} data-period-mode={mode} data-period-id={period?.id} aria-busy={loading || page.loading}
    onKeyDown={leaveOnEscape} onFocusCapture={() => focus(!history)} onPointerDown={() => focus(!history)} data-horizon={horizon} aria-label={messages.columnLabel(name)} ref={node => { setNodeRef(node); section.current = node }}>
    <header className={`column-header ${period ? 'period-header' : ''}`}>
      {period ? <div className="period-nav">
        <button className="icon-button small" data-previous-period aria-label={messages.previousPeriod(name)} title={back ? periodDates(back) : undefined} disabled={!back || busy} onClick={event => switchTo(back, event.detail > 0)}><Icon name="previous" size={16} /></button>
        <div className="period-heading" aria-live="polite" aria-atomic="true">
          <h2 className="period-title" tabIndex={-1} title={periodDates(period)}>{heading ?? date}</h2>
          {heading && <span className="column-meta" title={periodDates(period)}>{date}</span>}
        </div>
        {mode === 'current' ? reviewButton : <button className="period-return" data-return-current title={returnLabel} disabled={busy} onClick={event => switchTo(null, event.detail > 0)}><span>{returnLabel}</span></button>}
        <button className="icon-button small" data-next-period aria-label={messages.nextPeriod(name)} title={next ? periodDates(next) : undefined} disabled={busy} onClick={event => switchTo(next, event.detail > 0)}><Icon name="next" size={16} /></button>
      </div> : <><h2>{name}</h2><span className="column-spacer" /></>}
      <span className="column-add-slot">{!history && addButton}</span>
    </header>
    {mode === 'current' && !!snapshot.backlog[horizon] && <button className="backlog-entry" onClick={() => setBacklog(true)}>{messages.backlogCount} {snapshot.backlog[horizon]}<Icon name="next" size={14} /></button>}
    {backlog && <Backlog horizon={horizon} revision={snapshot.workspace.revision} submit={submit} busy={busy} close={() => setBacklog(false)} select={select} />}
    <div className="column-content">
      <div className="period-body">
      {history ? <PastPeriod key={history.id} history={page} select={select} submit={submit} busy={busy} /> : <>
        {loading && items.length === 0 && <p className="period-loading" role="status">{messages.loadingPeriod}</p>}
        {failed && <p className="inline-error" role="alert">{messages.planningLoadFailed} <button className="text-button" onClick={view.retry}>{messages.retryPeriod}</button></p>}
        <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
          <VirtualRows scope={`${snapshot.workspace.generation}:${period?.id ?? "later"}:todo`} items={todo} dragging={dragging} highlighted={highlighted} pinned={menuItem} render={row} />
          {adding && <QuickAdd key={`${adding.period?.id ?? 'later'}:${adding.key}`} horizon={horizon} period={adding.period} periodName={adding.period ? planningLabel(adding.period, calendar, snapshot.observedAt) : name}
            expired={!!adding.period && compareInstants(adding.period.endAt, snapshot.observedAt) <= 0} drafts={drafts.current} retarget={() => {
              const draft = drafts.current.get(adding.period?.id ?? 'later')
              if (draft) drafts.current.set(period?.id ?? 'later', draft)
              setAdding(true)
            }} flows={flows} items={view.candidates} split={adding.split} submit={submit} busy={disabled} close={() => setAdding(false)} />}
          {done.length > 0 && <details className="completed-fold" open={doneOpen} onToggle={event => setDoneOpen(event.currentTarget.open)}><summary>{messages.done} {done.length}<Icon name="next" size={14} /></summary>{doneOpen && <VirtualRows scope={`${snapshot.workspace.generation}:${period?.id ?? "later"}:done`} items={done} dragging={dragging} highlighted={highlighted} render={row} />}</details>}
        </SortableContext>
        {items.length === 0 && !adding && !loading && !failed && sources && <EmptyCard horizon={horizon as 'month' | 'week' | 'day'} sources={sources} period={current!} insight={insight} disabled={disabled} />}
        {items.length === 0 && !adding && !loading && !failed && !sources && <div className="empty-column"><Icon name="empty" size={44} strokeWidth={1.1} /><p>{horizon === 'later' ? messages.emptyLater : horizon === 'day' ? messages.emptyDay : messages.emptyDirection}</p></div>}
      </>}
      </div>
    </div>
  </section>
})
