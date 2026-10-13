/**
 * [INPUT]: ISO deadline, workspace today/week start, read-only state and the immediate autosave callback.
 * [OUTPUT]: Width-bounded deadline trigger with a full accessible label, floating calendar/focus restoration and dueOptions presets.
 * [POS]: Detail field; shared calendar content stays in components/due-date and persistence stays in the detail autosave boundary.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useId, useRef, useState } from 'react'
import { messages } from '../../i18n'
import { longDate } from '../../i18n/format'
import { Popover } from '../../components/Popover'
import { Icon } from '../../components/icons'
import { DueDatePanel } from '../../components/due-date/DueDatePanel'

export { dueOptions } from '../../components/due-date/DueDatePanel'

export function DuePicker({ value, today, weekStart = 1, readOnly, onChange }: { value: string; today: string; weekStart?: number; readOnly: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null), id = useId()
  const overdue = !!value && value < today
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }) }
  const choose = (next: string) => { onChange(next); close() }
  return <Popover floating open={open} onClose={close} anchor={
    <button type="button" ref={trigger} className="field-button tabular" data-empty={!value} data-overdue={overdue} aria-label={messages.labelled(messages.dueDate, value ? longDate(value) : messages.noDue)}
      aria-haspopup="dialog" aria-controls={open ? id : undefined} aria-expanded={open} title={value ? longDate(value) : messages.addDue} disabled={readOnly} onClick={() => setOpen(!open)}>
      <Icon name="calendar" size={16} /><span className="detail-chip-text">{value ? `${longDate(value)}${overdue ? messages.overdueSuffix : ''}` : messages.addDue}</span>
    </button>
  }>
    <DueDatePanel id={id} value={value} today={today} weekStart={weekStart} onSelect={choose} />
  </Popover>
}
