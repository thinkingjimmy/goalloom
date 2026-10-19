/**
 * [INPUT]: A hidden outline parent's body-free summary and ordinary detail navigation.
 * [OUTPUT]: A local hidden-parent context and a cross-period parent link with ordinary accessible detail navigation.
 * [POS]: Shared current/past outline anchor; this context never contributes an additional task count.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ItemSummary } from '../../../shared/contracts/entities'
import { messages, statusNames } from '../../i18n'
import { sameOutlinePeriod } from '../../../domain/nesting'
import { nestingText } from '../../../shared/i18n/nesting'

export function TaskParentLink({ item, parent, disabled, select }: { item: ItemSummary; parent: ItemSummary | undefined; disabled: boolean; select: (id: string) => void }) {
  if (!parent || sameOutlinePeriod(item.placement, parent.placement)) return null
  return <button type="button" className="task-parent-link" disabled={disabled} onPointerDown={event => event.stopPropagation()} onClick={() => select(parent.id)}>{nestingText().belongsTo} {parent.title}</button>
}

export function TaskContext({ item, select }: { item: ItemSummary; select: (id: string) => void }) {
  return <article role="listitem" id={`item-${item.id}`} data-item-id={item.id} className="task-row nesting-context" data-context="true" data-done={item.status === 'done'}>
    <button type="button" className="task-title" onClick={() => select(item.id)}><span>{item.title}</span><small>{item.archivedAt ? messages.archivedSuffix : ` · ${statusNames[item.status]}`}</small></button>
  </article>
}
