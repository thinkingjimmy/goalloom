/**
 * [INPUT]: A hidden outline parent's body-free summary and ordinary detail navigation.
 * [OUTPUT]: A two-line parent title with a separate visible lifecycle label and ordinary detail navigation above children.
 * [POS]: Shared current/past outline anchor; this context never contributes an additional task count.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ItemSummary } from '../../../shared/contracts/entities'
import { messages, statusNames } from '../../i18n'

export function TaskContext({ item, select }: { item: ItemSummary; select: (id: string) => void }) {
  return <article role="listitem" id={`item-${item.id}`} data-item-id={item.id} className="task-row nesting-context" data-context="true">
    <button type="button" className="task-title" onClick={() => select(item.id)}><span>{item.title}</span><small>{item.archivedAt ? messages.archivedSuffix : ` · ${statusNames[item.status]}`}</small></button>
  </article>
}
