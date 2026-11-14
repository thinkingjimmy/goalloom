/**
 * [INPUT]: The task's actual period and label, workspace calendar/clock and guarded move callback.
 * [OUTPUT]: Detail header trigger with a floating period picker and focus return after selection or dismissal.
 * [POS]: Detail placement control; ItemDetail owns the write and retains the native dialog.
 */
import { useId, useMemo, useRef, useState } from 'react'
import { currentPeriod } from '../../../domain/calendar'
import type { CalendarConfig, PlanningPeriod } from '../../../shared/contracts/entities'
import { Icon } from '../../components/icons'
import { PeriodPickerPanel } from '../../components/period-picker/PeriodPickerPanel'
import { Popover } from '../../components/Popover'
import { calendarMessages, messages } from '../../i18n'

export function DetailPeriod({ label, period, calendar, today, observedAt, busy, move }: {
  label: string; period: PlanningPeriod; calendar: CalendarConfig; today: string; observedAt: string
  busy: boolean; move: (target: PlanningPeriod) => void
}) {
  const [open, setOpen] = useState(false)
  const id = useId(), trigger = useRef<HTMLButtonElement>(null)
  const { horizon } = period
  const current = useMemo(() => currentPeriod(calendar, horizon, observedAt), [calendar, horizon, observedAt])
  const close = () => {
    setOpen(false)
    if (document.getElementById(id)?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true })
  }
  return <Popover floating open={open} onClose={close} className="period-picker-popover" anchor={
    <button type="button" ref={trigger} className="placement-chip" title={label}
      aria-label={messages.labelled(calendarMessages.changeTaskPeriod, label)} aria-haspopup="dialog" aria-controls={open ? id : undefined} aria-expanded={open} aria-disabled={busy}
      onClick={() => { if (!busy) setOpen(!open) }} onKeyDown={event => {
        if (!busy && event.key === 'ArrowDown' && !event.nativeEvent.isComposing) { event.preventDefault(); setOpen(true) }
      }}>
      <span className="placement-text">{label}</span><Icon name="expand" size={12} />
    </button>
  }>
    <PeriodPickerPanel id={id} name={calendarMessages.changeTaskPeriod} period={period} current={current} calendar={calendar} today={today} busy={busy} choose={target => {
      close()
      if (target.id !== period.id) move(target)
    }} />
  </Popover>
}
