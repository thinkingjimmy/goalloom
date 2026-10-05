/**
 * [INPUT]: Visible item summary, flow colors, topology/candidates, workspace date, upcoming destinations, an optional decompose action and guarded actions.
 * [OUTPUT]: Accessible task row with saved links, a due indicator, a description signal/peek between title and link cards, flow dot with independent relation dragging, pointer/keyboard placement drag and TODO context menu; task titles have no native tooltip, and lit rows carry `data-lit` and `--row-tint`. Later checkboxes stay uncolored.
 * [POS]: One virtual board row; Board owns placement, preview and dimming; the peek and detail own description bodies.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { memo, useMemo, type CSSProperties, type KeyboardEventHandler, type PointerEventHandler } from 'react'
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
import { NoteSignal } from './NoteSignal'
import { LinkTitle } from '../../components/links/LinkText'
import { LinkPreviews } from '../../components/links/LinkPreviews'
import { linkUrls } from '../../components/links/parse'
import { TaskMenu, type Upcoming } from './TaskMenu'

export const TaskRow = memo(function TaskRow({ index, total, item, flows, relations, candidates, today, selected, dimmed, tint, disabled, select, submit, onPreview, upcoming, decompose, onMenu, onMoved }: {
  index: number; total: number; item: ItemSummary; flows: Flows; relations: Snapshot['relations']; candidates: ItemSummary[]; today: string
  selected: boolean; dimmed: boolean; tint: string | undefined; disabled: boolean
  select: (id: string) => void; submit: (action: Action) => Promise<unknown>; onPreview: (itemId: string | null) => void
  upcoming: Upcoming[] | null; decompose: ((item: ItemSummary) => void) | null; onMenu: (id: string | null) => void; onMoved: (id: string) => void
}) {
  useLocale()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled, animateLayoutChanges: () => false })
  const done = item.status === 'done'
  const colored = !done && item.placement.horizon !== 'later'
  const ring = colored ? flowVars(flows.colorsOf(item.id)) : undefined
  const owners = flows.of(item.id).map(flow => flow.title).join(messages.listJoin)
  const overdue = !done && item.dueDate !== null && item.dueDate < today
  const hasLinks = useMemo(() => linkUrls(item.title).length > 0, [item.title])
  const line = <div className="task-line">
    {hasLinks ? <LinkTitle text={item.title} onOpen={() => select(item.id)} /> : <button className="task-title" onClick={() => select(item.id)}><span>{item.title}</span></button>}
    {item.dueDate && !overdue && !done && <span className="row-meta tabular" title={`${messages.dueDate} ${longDate(item.dueDate)}`}>{shortDate(item.dueDate)}</span>}
    {overdue && <span className="row-icon overdue" role="img" aria-label={messages.dueOverdue(longDate(item.dueDate!))} title={messages.dueOverdue(longDate(item.dueDate!))}><Icon name="overdue" size={16} /></span>}
  </div>
  const row = <article role="listitem" aria-posinset={index + 1} aria-setsize={total} id={`item-${item.id}`} ref={setNodeRef} className={`task-row ${isDragging ? 'dragging' : ''}`} data-item-id={item.id} data-highlighted={selected} data-dimmed={dimmed} data-done={done} data-lit={!!tint || undefined}
    style={{ transform: CSS.Transform.toString(transform), transition, '--row-tint': tint } as CSSProperties} onPointerDown={event => { if (event.button === 0 && !event.ctrlKey) (listeners?.onPointerDown as PointerEventHandler | undefined)?.(event) }}>
    <FlowDot item={item} flows={flows} relations={relations} candidates={candidates} disabled={disabled} submit={submit} onPreview={onPreview} />
    <button className="drag-handle" {...attributes} onKeyDown={listeners?.onKeyDown as KeyboardEventHandler | undefined} aria-label={messages.dragItem(item.title)}><Icon name="drag" size={14} /></button>
    <button className="check" data-checked={done} style={ring} title={colored && owners ? messages.labelled(messages.flow, owners) : undefined}
      aria-label={`${done ? messages.reopen : messages.complete} ${item.title}`} disabled={disabled}
      onClick={() => void submit({ type: 'status', itemId: item.id, expectedVersion: item.version, status: done ? 'todo' : 'done' })}>
      {done && <Icon name="check" size={12} strokeWidth={2.5} />}
    </button>
    {hasLinks || item.note ? <div className="task-content">{line}{item.note && <NoteSignal itemId={item.id} title={item.title} note={item.note} />}{hasLinks && <LinkPreviews text={item.title} />}</div> : line}
  </article>
  const links = relations.filter(edge => edge.parentId === item.id || edge.childId === item.id).length
  return upcoming && item.status === 'todo' ? <TaskMenu item={item} upcoming={upcoming} relations={links} disabled={disabled || isDragging} submit={submit} select={select}
    decompose={decompose && (() => decompose(item))} onMenu={onMenu} onMoved={onMoved}>{row}</TaskMenu> : row
})
