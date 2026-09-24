/**
 * [INPUT]: 当前条目、流程颜色、截止/顺延标记与受限提交。
 * [OUTPUT]: 极简可拖动行：流程描边复选框、标题、截止/说明/顺延提示；键盘拖动手柄仅在聚焦时出现。
 * [POS]: board 列内的单行视图；打开详情、切换完成，拖放由 Board 的 DndContext 处理。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { KeyboardEventHandler, PointerEventHandler } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Item } from '../../../shared/contracts/entities'
import { messages } from '../../i18n'
import { flowVars } from '../../lib/colors'
import { longDate, shortDate } from '../../i18n/format'
import type { Flows } from '../../state/flows'
import type { Action } from '../../state/use-workspace'
import { Icon } from '../../components/icons'

export function TaskRow({ item, flows, today, rolloverFrom, selected, dimmed, disabled, select, submit }: {
  item: Item; flows: Flows; today: string; rolloverFrom: string | undefined; selected: boolean; dimmed: boolean; disabled: boolean
  select: (id: string) => void; submit: (action: Action) => Promise<unknown>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled })
  const done = item.status === 'done'
  const ring = done ? undefined : flowVars(flows.colorsOf(item.id))
  const owners = flows.of(item.id).map(flow => flow.title).join(messages.listJoin)
  const overdue = !done && item.dueDate !== null && item.dueDate < today
  return <article id={`item-${item.id}`} ref={setNodeRef} className={`task-row ${isDragging ? 'dragging' : ''}`} data-item-id={item.id} data-highlighted={selected} data-dimmed={dimmed} data-done={done}
    style={{ transform: CSS.Transform.toString(transform), transition }} onPointerDown={listeners?.onPointerDown as PointerEventHandler | undefined}>
    <button className="drag-handle" {...attributes} onKeyDown={listeners?.onKeyDown as KeyboardEventHandler | undefined} aria-label={messages.dragItem(item.title)}><Icon name="drag" size={14} /></button>
    <button className="check" data-checked={done} style={ring} title={owners ? messages.labelled(messages.flow, owners) : undefined}
      aria-label={`${done ? messages.reopen : messages.complete} ${item.title}`} disabled={disabled}
      onClick={() => void submit({ type: 'status', itemId: item.id, expectedVersion: item.version, status: done ? 'todo' : 'done' })}>
      {done && <Icon name="check" size={12} strokeWidth={2.5} />}
    </button>
    <div className="task-line">
      <button className="task-title" onClick={() => select(item.id)}>{item.title}</button>
      {rolloverFrom && <span className="row-meta" title={messages.rolloverTitle(rolloverFrom)}>{messages.rolloverMark}</span>}
      {item.dueDate && !overdue && !done && <span className="row-meta tabular" title={`${messages.dueDate} ${longDate(item.dueDate)}`}>{shortDate(item.dueDate)}</span>}
      {overdue && <span className="row-icon overdue" role="img" aria-label={messages.dueOverdue(longDate(item.dueDate!))} title={messages.dueOverdue(longDate(item.dueDate!))}><Icon name="overdue" size={16} /></span>}
      {item.description.trim() && !done && <span className="row-icon" role="img" aria-label={messages.noteMark} title={messages.noteMark}><Icon name="note" size={16} /></span>}
    </div>
  </article>
}
