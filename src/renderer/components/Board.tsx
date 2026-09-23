import { messages } from '../lib/messages'
import { currentPeriod, precedingPeriod, workspaceDate } from '../../domain/calendar'
import { useEffect, useRef, useState } from 'react'
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { horizons, type Item, type ItemHorizon, type PlanningPeriod } from '../../shared/contracts/entities'
import type { Snapshot } from '../../shared/contracts/queries'
import type { Action } from '../lib/use-workspace'
import { relationColorIndex, relationColors } from '../lib/colors'
import { horizonNames } from '../lib/messages'
import { Button } from './ui/button'
import { Icon } from './icons'
import { HistoryColumn } from './HistoryColumn'
import { Backlog } from './Backlog'

interface BoardProps { highlighted: string | null; newRequest: number; snapshot: Snapshot; submit: (action: Action) => Promise<unknown>; busy: boolean; select: (id: string) => void }
export function Board({ snapshot, submit, busy, select, newRequest, highlighted }: BoardProps) {
  useEffect(() => { if (highlighted) document.getElementById(`item-${highlighted}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [highlighted])
  const [focused, setFocused] = useState<ItemHorizon>('later')
  const [addingTo, setAddingTo] = useState<ItemHorizon | null>(null)
  const previousRequest = useRef(newRequest)
  useEffect(() => {
    if (newRequest !== previousRequest.current) setAddingTo(document.activeElement?.closest('[data-horizon]') ? focused : 'later')
    previousRequest.current = newRequest
  }, [newRequest])
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
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={event => setDragging(String(event.active.id))} onDragCancel={() => setDragging(null)} onDragEnd={end} accessibility={{ announcements: { onDragStart: () => messages.dragStarted, onDragOver: () => messages.dragOver, onDragEnd: () => messages.dragEnded, onDragCancel: () => messages.dragCancelled }, screenReaderInstructions: { draggable: messages.dragInstructions } }}>
    <main className="board" aria-label={messages.board}>
      {horizons.map(horizon => <Column highlighted={highlighted} adding={addingTo === horizon} setAdding={value => setAddingTo(value ? horizon : null)} focus={editable => setFocused(editable ? horizon : 'later')} newRequest={newRequest} key={horizon} horizon={horizon} items={snapshot.items.filter(item => item.placement.horizon === horizon)} snapshot={snapshot} submit={submit} busy={busy} select={select} />)}
    </main>
    <DragOverlay>{dragging ? <div className="drag-overlay">{snapshot.items.find(item => item.id === dragging)?.title}</div> : null}</DragOverlay>
  </DndContext>
}

function Column({ horizon, items, snapshot, submit, busy, select, adding, setAdding, focus, highlighted }: BoardProps & { horizon: ItemHorizon; items: Item[]; adding: boolean; setAdding: (value: boolean) => void; focus: (editable: boolean) => void }) {
  const [history, setHistory] = useState<PlanningPeriod | null>(null), [backlog, setBacklog] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: `column:${horizon}`, disabled: history !== null })
  const [title, setTitle] = useState('')
  const current = snapshot.periods.find(period => period.horizon === horizon)
  const period = history ?? current
  const previous = period ? precedingPeriod(snapshot.workspace.calendar!, period) : null
  return <section className={`board-column ${isOver ? 'drop-target' : ''}`} onFocusCapture={() => focus(!history)} onPointerDown={() => focus(!history)} data-horizon={horizon} aria-label={messages.columnLabel(horizonNames[horizon])} ref={setNodeRef}>
    <header><div><h2>{horizonNames[horizon]} <span>{history ? messages.history : items.length}</span></h2><p>{period ? `${period.startDate} — ${period.endDate}` : messages.futureIdeas}</p></div><Button variant="ghost" size="icon" aria-label={messages.newInColumn(horizonNames[horizon])} disabled={!!history || busy} onClick={() => setAdding(true)}><Icon name="add" /></Button></header>
    {period && <div className="period-navigation"><Button variant="ghost" size="icon" aria-label={messages.previousPeriod(horizonNames[horizon])} disabled={!previous} onClick={() => { setHistory(previous); setAdding(false); focus(false) }}><Icon name="previous" size={16} /></Button>{history && <><Button variant="ghost" onClick={() => setHistory(null)}>{messages.returnCurrent}</Button><Button variant="ghost" size="icon" aria-label={messages.nextPeriod(horizonNames[horizon])} onClick={() => { const next = currentPeriod(snapshot.workspace.calendar!, history.horizon, history.endAt); setHistory(next.id === current?.id ? null : next) }}><Icon name="next" size={16} /></Button></>}</div>}
    {!history && !!snapshot.backlog[horizon] && <button className="backlog-entry" onClick={() => setBacklog(true)}>{messages.backlogCount} {snapshot.backlog[horizon]}</button>}
    {backlog && <Backlog horizon={horizon} revision={snapshot.workspace.revision} submit={submit} busy={busy} close={() => setBacklog(false)} select={select} />}
    <div className="column-content">
      {history ? <HistoryColumn key={history.id} period={history} revision={snapshot.workspace.revision} select={select} /> : <>
      <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
        {items.filter(item => item.status === 'todo').map(item => <TaskCard highlighted={highlighted === item.id} key={item.id} item={item} snapshot={snapshot} select={select} disabled={busy} submit={submit} />)}
        {items.some(item => item.status === 'done') && <details className="completed-fold"><summary>{messages.done} {items.filter(item => item.status === 'done').length}</summary>{items.filter(item => item.status === 'done').map(item => <TaskCard highlighted={highlighted === item.id} key={item.id} item={item} snapshot={snapshot} select={select} disabled={busy} submit={submit} />)}</details>}
      </SortableContext>
      {items.length === 0 && !adding && <p className="empty-column">{horizon === 'later' ? messages.emptyLater : horizon === 'day' ? messages.emptyDay : messages.emptyDirection}</p>}
      {adding ? <form className="quick-add" onSubmit={async event => {
        event.preventDefault()
        if (!title.trim()) return
        const result = await submit({ type: 'create', title, horizon })
        if (result) { setTitle(''); setAdding(false) }
      }}><input aria-label={messages.newToColumn(horizonNames[horizon])} placeholder={messages.titlePlaceholder} autoFocus value={title} maxLength={500} onChange={event => setTitle(event.target.value)} onKeyDown={event => {
        if (event.nativeEvent.isComposing && event.key === 'Enter') event.preventDefault()
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.stopPropagation(); setAdding(false); setTitle('') }
      }} /><div><Button disabled={busy || !title.trim()} type="submit">{messages.addTo}{horizonNames[horizon]}</Button><Button variant="ghost" type="button" onClick={() => { setAdding(false); setTitle('') }}>{messages.cancel}</Button></div></form>
        : <button className="add-row" onClick={() => setAdding(true)}><Icon name="add" size={16} />{messages.addItem}</button>}
      </>}
    </div>
  </section>
}

function TaskCard({ item, snapshot, select, disabled, submit, highlighted }: { highlighted: boolean; item: Item; snapshot: Snapshot; select: (id: string) => void; disabled: boolean; submit: BoardProps['submit'] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled })
  const parents = snapshot.relations.filter(edge => edge.childId === item.id)
  return <article id={`item-${item.id}`} data-highlighted={highlighted} ref={setNodeRef} className={`task-card ${isDragging ? 'dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }} data-item-id={item.id}>
    <button className="drag-handle" {...attributes} {...listeners} aria-label={messages.dragItem(item.title)}><Icon name="drag" size={16} /></button>
    <button className="status-toggle" aria-label={`${item.status === 'done' ? messages.reopen : messages.complete} ${item.title}`} disabled={disabled} onClick={() => void submit({ type: 'status', itemId: item.id, expectedVersion: item.version, status: item.status === 'done' ? 'todo' : 'done' })}><Icon name={item.status === 'done' ? 'done' : 'todo'} size={20} /></button>
    <div className="task-content"><button className="task-title" onClick={() => select(item.id)}>{item.title}</button>
      {item.dueDate && <small className="due-date">{item.dueDate < workspaceDate(snapshot.workspace.calendar!.timezone, snapshot.observedAt) ? messages.overdue : messages.dueDatePrefix}{item.dueDate}</small>}
      {snapshot.rolloverSources[item.id] && <small className="field-note">{messages.rolloverFrom} {snapshot.rolloverSources[item.id]}</small>}
      {parents.length > 0 && <div className="parent-badges">{parents.slice(0, 2).map(edge => {
        const palette = relationColors[relationColorIndex(edge.parentId)]!
        return <button key={edge.id} className="relation-badge" style={{ backgroundColor: `light-dark(${palette.light[0]},${palette.dark[0]})`, color: `light-dark(${palette.light[1]},${palette.dark[1]})`, borderColor: `light-dark(${palette.light[2]},${palette.dark[2]})` }} onClick={() => select(edge.parentId)} aria-label={messages.parentLabel(edge.parentTitle)}><Icon name="link" size={16} />{edge.parentTitle}</button>
      })}{parents.length > 2 && <button onClick={() => select(item.id)} className="relation-badge">+{parents.length - 2}</button>}</div>}
      {snapshot.relations.some(edge => edge.parentId === item.id) && <button className="child-link" onClick={() => select(item.id)}>{messages.childrenCount} {snapshot.relations.filter(edge => edge.parentId === item.id).length}</button>}
    </div>
  </article>
}
