/**
 * [INPUT]: 权威快照、流程派生视图与筛选、受限提交、新建请求。
 * [OUTPUT]: 五列看板：极简列头、整行拖动排序/跨列、列内连续录入、完成折叠、往期入口与只读历史。
 * [POS]: renderer 主视图；位置/状态规则仍由事务复核，筛选只影响本会话显示。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useEffect, useRef, useState } from 'react'
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, pointerWithin, PointerSensor, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { currentPeriod, precedingPeriod, workspaceDate } from '../../../domain/calendar'
import { horizons, type Item, type ItemHorizon, type PlanningPeriod } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import { messages, horizonNames } from '../../i18n/messages'
import type { Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { Icon } from '../../components/icons'
import { HistoryColumn } from './HistoryColumn'
import { Backlog } from './Backlog'
import { QuickAdd, type SplitParent } from './QuickAdd'
import { TaskRow } from './TaskRow'

// Rows under the pointer win; empty column space appends to that column. Keyboard drags keep closest-center.
const collision: CollisionDetection = args => {
  const within = pointerWithin(args)
  if (!within.length) return closestCenter(args)
  const rows = within.filter(hit => !String(hit.id).startsWith('column:'))
  return rows.length ? closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(container => rows.some(hit => hit.id === container.id)) }) : within
}

export interface AddRequest { seq: number; horizon: ItemHorizon | null; split: SplitParent | null }
interface BoardProps { snapshot: Snapshot; flows: Flows; filter: string | null; highlighted: string | null; addRequest: AddRequest | null; submit: (action: Action) => Promise<unknown>; busy: boolean; select: (id: string) => void }

export function Board({ snapshot, flows, filter, highlighted, addRequest, submit, busy, select }: BoardProps) {
  useEffect(() => { if (highlighted) document.getElementById(`item-${highlighted}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [highlighted])
  const [focused, setFocused] = useState<ItemHorizon>('later')
  const [adding, setAdding] = useState<{ horizon: ItemHorizon; split: SplitParent | null; key: number } | null>(null)
  const handled = useRef(addRequest?.seq ?? 0)
  useEffect(() => {
    if (!addRequest || addRequest.seq === handled.current) return
    handled.current = addRequest.seq
    const horizon = addRequest.horizon ?? (document.activeElement?.closest('[data-horizon]') ? focused : 'later')
    setAdding({ horizon, split: addRequest.split, key: addRequest.seq })
    document.querySelector(`[data-horizon="${horizon}"]`)?.scrollIntoView({ inline: 'nearest' })
  }, [addRequest])
  const [dragging, setDragging] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const end = (event: DragEndEvent) => {
    setDragging(null)
    if (!event.over) return
    const item = snapshot.items.find(item => item.id === event.active.id)
    const target = snapshot.items.find(item => item.id === event.over!.id)
    const horizon = target?.placement.horizon ?? String(event.over.id).replace('column:', '') as ItemHorizon
    if (!item || !horizons.includes(horizon)) return
    let beforeId = target?.id ?? null
    const columnItems = snapshot.items.filter(row => row.placement.horizon === horizon)
    if (item.placement.horizon === horizon && target && columnItems.indexOf(target) > columnItems.indexOf(item)) beforeId = columnItems[columnItems.indexOf(target) + 1]?.id ?? null
    void submit({ type: 'move', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon, beforeId })
  }
  const today = workspaceDate(snapshot.workspace.calendar!.timezone, snapshot.observedAt)
  return <DndContext sensors={sensors} collisionDetection={collision} onDragStart={event => setDragging(String(event.active.id))} onDragCancel={() => setDragging(null)} onDragEnd={end} accessibility={{ announcements: { onDragStart: () => messages.dragStarted, onDragOver: () => messages.dragOver, onDragEnd: () => messages.dragEnded, onDragCancel: () => messages.dragCancelled }, screenReaderInstructions: { draggable: messages.dragInstructions } }}>
    <main className="board" aria-label={messages.board}>
      {horizons.map(horizon => <Column key={horizon} horizon={horizon} items={snapshot.items.filter(item => item.placement.horizon === horizon)}
        snapshot={snapshot} flows={flows} filter={filter} highlighted={highlighted} today={today} submit={submit} busy={busy} select={select}
        adding={adding?.horizon === horizon ? adding : null} setAdding={open => setAdding(open ? { horizon, split: null, key: Date.now() } : null)}
        focus={editable => setFocused(editable ? horizon : 'later')} />)}
    </main>
    {/* No drop animation: the overlay would fly back to the old slot before the authoritative refresh lands. */}
    <DragOverlay dropAnimation={null}>{dragging ? <div className="drag-overlay">{snapshot.items.find(item => item.id === dragging)?.title}</div> : null}</DragOverlay>
  </DndContext>
}

function Column({ horizon, items, snapshot, flows, filter, highlighted, today, submit, busy, select, adding, setAdding, focus }: Omit<BoardProps, 'addRequest'> & {
  horizon: ItemHorizon; items: Item[]; today: string; adding: { split: SplitParent | null; key: number } | null; setAdding: (open: boolean) => void; focus: (editable: boolean) => void
}) {
  const [history, setHistory] = useState<PlanningPeriod | null>(null), [backlog, setBacklog] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: `column:${horizon}`, disabled: history !== null })
  const current = snapshot.periods.find(period => period.horizon === horizon)
  const period = history ?? current
  const calendar = snapshot.workspace.calendar!
  const previous = period ? precedingPeriod(calendar, period) : null
  const todo = items.filter(item => item.status === 'todo'), done = items.filter(item => item.status === 'done')
  const row = (item: Item) => <TaskRow key={item.id} item={item} flows={flows} today={today} rolloverFrom={snapshot.rolloverSources[item.id]} selected={highlighted === item.id}
    dimmed={filter !== null && !flows.of(item.id).some(flow => flow.id === filter)} disabled={busy} select={select} submit={submit} />
  return <section className={`board-column ${isOver ? 'drop-target' : ''}`} onFocusCapture={() => focus(!history)} onPointerDown={() => focus(!history)} data-horizon={horizon} aria-label={messages.columnLabel(horizonNames[horizon])} ref={setNodeRef}>
    <header className="column-header">
      <h2>{horizonNames[horizon]}</h2>
      <span className="column-meta">{history ? messages.history : horizon === 'later' ? todo.length : periodLabel(horizon, period!)}</span>
      <span className="column-spacer" />
      {period && !history && <button className="icon-button small" aria-label={messages.previousPeriod(horizonNames[horizon])} title={messages.columnHistory(horizonNames[horizon])} disabled={!previous} onClick={() => { setHistory(previous); setAdding(false); focus(false) }}><Icon name="history" size={16} /></button>}
      {!history && <button className="icon-button small" aria-label={messages.newInColumn(horizonNames[horizon])} aria-pressed={!!adding} disabled={busy} onClick={() => setAdding(!adding)}><Icon name="add" size={16} /></button>}
    </header>
    {history && <div className="period-navigation">
      <button className="icon-button small" aria-label={messages.previousPeriod(horizonNames[horizon])} disabled={!previous} onClick={() => setHistory(previous)}><Icon name="previous" size={16} /></button>
      <span className="tabular">{history.startDate} — {history.endDate}</span>
      <button className="icon-button small" aria-label={messages.nextPeriod(horizonNames[horizon])} onClick={() => { const next = currentPeriod(calendar, history.horizon, history.endAt); setHistory(next.id === current?.id ? null : next) }}><Icon name="next" size={16} /></button>
      <button className="text-button" onClick={() => setHistory(null)}>{messages.returnCurrent}</button>
    </div>}
    {!history && !!snapshot.backlog[horizon] && <button className="backlog-entry" onClick={() => setBacklog(true)}>{messages.backlogCount} {snapshot.backlog[horizon]}<Icon name="next" size={14} /></button>}
    {backlog && <Backlog horizon={horizon} revision={snapshot.workspace.revision} submit={submit} busy={busy} close={() => setBacklog(false)} select={select} />}
    <div className="column-content">
      {history ? <HistoryColumn key={history.id} period={history} revision={snapshot.workspace.revision} select={select} /> : <>
        <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
          {todo.map(row)}
          {adding && <QuickAdd key={adding.key} horizon={horizon} flows={flows} split={adding.split} submit={submit} busy={busy} close={() => setAdding(false)} />}
          {done.length > 0 && <details className="completed-fold"><summary>{messages.done} {done.length}<Icon name="next" size={14} /></summary>{done.map(row)}</details>}
        </SortableContext>
        {items.length === 0 && !adding && <div className="empty-column"><Icon name="empty" size={44} strokeWidth={1.1} /><p>{horizon === 'later' ? messages.emptyLater : horizon === 'day' ? messages.emptyDay : messages.emptyDirection}</p></div>}
      </>}
    </div>
  </section>
}

function periodLabel(horizon: ItemHorizon, period: PlanningPeriod): string {
  const [, sm, sd] = period.startDate.split('-').map(Number)
  if (horizon === 'day') return `${sm}月${sd}日`
  if (horizon === 'month') return `${sm}月`
  const end = new Date(`${period.endDate}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1)
  return `${sm}.${sd} – ${end.getUTCMonth() + 1}.${end.getUTCDate()}`
}
