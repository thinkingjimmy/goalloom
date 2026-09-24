/**
 * [INPUT]: Item summary, stable flow colors, snapshot topology/candidates for the flow dot, status indicators, the lit flow tint and actions.
 * [OUTPUT]: Memoized accessible task row (title clamped to two lines) with its flow dot and keyboard/pointer drag controls; a lit row carries `data-lit` and `--row-tint`.
 * [POS]: One virtual board row; Board owns placement, preview and dimming, detail loading owns description bodies.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { memo, type CSSProperties, type KeyboardEventHandler, type PointerEventHandler } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ItemSummary } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import { messages, useLocale } from '../../i18n'
import { flowVars } from '../../lib/colors'
import { longDate, shortDate } from '../../i18n/format'
import type { Flows } from '../../state/flows'
import type { Action } from '../../state/use-workspace'
import { Icon } from '../../components/icons'
import { FlowDot } from './FlowDot'

export const TaskRow = memo(function TaskRow({ index, total, item, flows, relations, candidates, today, rolloverFrom, selected, dimmed, tint, disabled, select, submit, onPreview }: {
  index: number; total: number; item: ItemSummary; flows: Flows; relations: Snapshot['relations']; candidates: ItemSummary[]; today: string; rolloverFrom: string | undefined
  selected: boolean; dimmed: boolean; tint: string | undefined; disabled: boolean
  select: (id: string) => void; submit: (action: Action) => Promise<unknown>; onPreview: (itemId: string | null) => void
}) {
  useLocale()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled })
  const done = item.status === 'done'
  const ring = done ? undefined : flowVars(flows.colorsOf(item.id))
  const owners = flows.of(item.id).map(flow => flow.title).join(messages.listJoin)
  const overdue = !done && item.dueDate !== null && item.dueDate < today
  return <article role="listitem" aria-posinset={index + 1} aria-setsize={total} id={`item-${item.id}`} ref={setNodeRef} className={`task-row ${isDragging ? 'dragging' : ''}`} data-item-id={item.id} data-highlighted={selected} data-dimmed={dimmed} data-done={done} data-lit={!!tint || undefined}
    style={{ transform: CSS.Transform.toString(transform), transition, '--row-tint': tint } as CSSProperties} onPointerDown={listeners?.onPointerDown as PointerEventHandler | undefined}>
    <FlowDot item={item} flows={flows} relations={relations} candidates={candidates} submit={submit} onPreview={onPreview} />
    <button className="drag-handle" {...attributes} onKeyDown={listeners?.onKeyDown as KeyboardEventHandler | undefined} aria-label={messages.dragItem(item.title)}><Icon name="drag" size={14} /></button>
    <button className="check" data-checked={done} style={ring} title={owners ? messages.labelled(messages.flow, owners) : undefined}
      aria-label={`${done ? messages.reopen : messages.complete} ${item.title}`} disabled={disabled}
      onClick={() => void submit({ type: 'status', itemId: item.id, expectedVersion: item.version, status: done ? 'todo' : 'done' })}>
      {done && <Icon name="check" size={12} strokeWidth={2.5} />}
    </button>
    <div className="task-line">
      <button className="task-title" title={item.title} onClick={() => select(item.id)}><span>{item.title}</span></button>
      {rolloverFrom && <span className="row-meta" title={messages.rolloverTitle(rolloverFrom)}>{messages.rolloverMark}</span>}
      {item.dueDate && !overdue && !done && <span className="row-meta tabular" title={`${messages.dueDate} ${longDate(item.dueDate)}`}>{shortDate(item.dueDate)}</span>}
      {overdue && <span className="row-icon overdue" role="img" aria-label={messages.dueOverdue(longDate(item.dueDate!))} title={messages.dueOverdue(longDate(item.dueDate!))}><Icon name="overdue" size={16} /></span>}
      {item.hasDescription && !done && <span className="row-icon" role="img" aria-label={messages.noteMark} title={messages.noteMark}><Icon name="note" size={16} /></span>}
    </div>
  </article>
})
