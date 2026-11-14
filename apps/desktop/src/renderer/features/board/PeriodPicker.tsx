/**
 * [INPUT]: Displayed/current periods, workspace calendar/day, previous navigation bound and column controls.
 * [OUTPUT]: A board header popover with the shared period picker, history counts and retry.
 * [POS]: Board navigation adapter; Column owns switching, motion, focus return and Escape to current.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { CalendarConfig, PlanningPeriod } from '../../../shared/contracts/entities'
import type { HistoryIndex } from '../../../shared/contracts/history'
import { desktopApi } from '../../state/use-workspace'
import { Popover } from '../../components/Popover'
import { PeriodPickerPanel } from '../../components/period-picker/PeriodPickerPanel'
import './period-picker.css'

export function PeriodPicker({ name, period, current, calendar, today, back, busy, open, setOpen, choose, anchor }: {
  name: string; period: PlanningPeriod; current: PlanningPeriod; calendar: CalendarConfig; today: string
  back: PlanningPeriod | null; busy: boolean
  open: boolean; setOpen: (open: boolean) => void; choose: (target: PlanningPeriod, pointer: boolean) => void; anchor: ReactNode
}) {
  const [index, setIndex] = useState<HistoryIndex['periods']>([])
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const { horizon } = period
  useEffect(() => {
    if (!open) return
    let active = true
    setFailed(false)
    void desktopApi().getHistoryIndex(horizon).then(value => { if (active) setIndex(value.periods) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [open, horizon, attempt])

  return <Popover open={open} onClose={() => setOpen(false)} className="period-picker-popover" anchor={anchor}>
    {open && <PeriodPickerPanel name={name} period={period} current={current} calendar={calendar} today={today} busy={busy} choose={choose}
      history={{ back, index, retry: failed ? () => setAttempt(value => value + 1) : null }} />}
  </Popover>
}
