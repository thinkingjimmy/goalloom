/**
 * [INPUT]: Saved deadline, workspace today, active locale and the title's description target ID.
 * [OUTPUT]: An inline calendar marker with the short date, localized urgency and a full accessible date.
 * [POS]: Board deadline presentation; TaskRow owns visibility for completed tasks and missing dates.
 */
import { messages } from '../../i18n'
import { calendarDate, shortDate } from '../../i18n/format'
import { addDays } from '../../lib/dates'
import { Icon } from '../icons'

export function DueDateBadge({ id, date, today }: { id: string; date: string; today: string }) {
  const state = date < today ? 'overdue' : date === addDays(today, 1) ? 'tomorrow' : 'normal'
  const label = state === 'overdue' ? messages.dueOverdueShort : state === 'tomorrow' ? messages.dueTomorrow : ''
  const accessible = state === 'overdue' ? messages.dueOverdue(calendarDate(date)) : `${messages.dueDate} ${calendarDate(date)}`
  return <time id={id} className="due-badge tabular" data-state={state} dateTime={date} title={accessible} aria-label={accessible}>
    <Icon name="calendar" size={14} />
    <span>{label && `${label} · `}{shortDate(date)}</span>
  </time>
}
