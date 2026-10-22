/**
 * [INPUT]: Saved deadline, workspace today and the active locale; theme tokens supply status colors.
 * [OUTPUT]: A non-interactive calendar capsule with a visible date, localized urgency and a full accessible date.
 * [POS]: Board deadline presentation; TaskRow owns visibility for completed tasks and missing dates.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { messages } from '../../i18n'
import { calendarDate, shortDate } from '../../i18n/format'
import { addDays } from '../../lib/dates'
import { Icon } from '../icons'

export function DueDateBadge({ date, today }: { date: string; today: string }) {
  const state = date < today ? 'overdue' : date === addDays(today, 1) ? 'tomorrow' : 'normal'
  const label = state === 'overdue' ? messages.dueOverdueShort : state === 'tomorrow' ? messages.dueTomorrow : ''
  const accessible = state === 'overdue' ? messages.dueOverdue(calendarDate(date)) : `${messages.dueDate} ${calendarDate(date)}`
  return <time className="due-badge tabular" data-state={state} dateTime={date} title={accessible} aria-label={accessible}>
    <Icon name="calendar" size={14} />
    <span>{label && `${label} · `}{shortDate(date)}</span>
  </time>
}
