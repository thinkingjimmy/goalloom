/**
 * [INPUT]: Existing draft date, live workspace today, busy state and caller-owned choose/close actions.
 * [OUTPUT]: Shared native Modal/Input date selection, submit-time validation and cancellation without draft writes.
 * [POS]: CalendarSentence's custom-start editor; confirmation still belongs to the later direction step.
 */
import { useId, useState } from 'react'
import { Temporal } from '../../../domain/temporal'
import { calendarMessages as c, settingsMessages as settings } from '../../i18n'
import { Modal } from '../../components/Modal'
import { Input } from '../../components/ui/fields'
import { Button } from '../../components/ui/button'
import { Icon } from '../../components/icons'

export function CalendarAnchorDialog({ initialDate, today, busy, close, choose }: {
  initialDate: string; today: string; busy: boolean; close: () => void; choose: (date: string) => void
}) {
  const [date, setDate] = useState(initialDate), [attempted, setAttempted] = useState(false)
  const inputId = useId(), errorId = useId()
  let valid = false
  try { valid = Temporal.PlainDate.from(date).toString() === date && date <= today } catch { /* Empty or malformed drafts remain editable. */ }
  const invalid = attempted && !valid
  return <Modal title={c.setupDateTitle} className="calendar-anchor-dialog" close={close}>
    <form className="calendar-date-form" noValidate onSubmit={event => { event.preventDefault(); setAttempted(true); if (valid && !busy) choose(date) }}>
      <p className="m-0 mb-5 text-[13px] leading-[1.8] text-muted-foreground">{c.setupDateNote}</p>
      <label htmlFor={inputId} className="m-0 mb-2 block text-[13px] font-medium">{c.anchorLabel}</label>
      <Input id={inputId} type="date" required autoFocus value={date} max={today} disabled={busy} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} onChange={event => setDate(event.target.value)} />
      {invalid && <p id={errorId} className="m-0 mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-destructive" role="alert"><Icon name="warning" size={14} />{c.setupInvalidDate}</p>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={close}>{settings.sync.cancel}</Button><Button className="calendar-primary" type="submit" disabled={busy}>{c.setupUseDate}</Button></div>
    </form>
  </Modal>
}
