/**
 * [INPUT]: Displayed editable period, localized column name, write availability and guarded workspace submission.
 * [OUTPUT]: Accessible one-shot parent arrangement, restoring focus after the guarded write re-enables its trigger.
 * [POS]: Column-header action; automatic placement preferences remain independent.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import type { Action } from '../../state/use-workspace'
import { messages } from '../../i18n'
import { Icon } from '../../components/icons'
import { Popover } from '../../components/Popover'
import { returnFocus } from '../../lib/focus'

export function ColumnOrderMenu({ period, name, disabled, submit }: { period: PlanningPeriod; name: string; disabled: boolean; submit: (action: Action) => Promise<unknown> }) {
  const [open, setOpen] = useState(false)
  const [focusReturn, setFocusReturn] = useState<{ periodId: string; origin: 'pointer' | 'keyboard' } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null), action = useRef<HTMLButtonElement>(null)
  const close = () => {
    setOpen(false)
    if (action.current === document.activeElement) trigger.current?.focus({ preventScroll: true })
  }
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => action.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [open])
  useEffect(() => setOpen(false), [period.id, disabled])
  useLayoutEffect(() => {
    if (!focusReturn) return
    if (focusReturn.periodId !== period.id) { setFocusReturn(null); return }
    if (disabled) return
    setFocusReturn(null)
    const control = trigger.current
    if (control && !control.disabled && (document.activeElement === document.body || document.activeElement === control)) returnFocus(control, focusReturn.origin)
  }, [disabled, period.id, focusReturn])
  const horizon = period.horizon
  if (horizon === 'year') return null
  return <Popover open={open} onClose={close} floating align="end" anchor={
    <button ref={trigger} type="button" className="icon-button small" data-column-actions aria-label={messages.columnActions(name)} title={messages.columnActions(name)}
      aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}><Icon name="more" size={16} /></button>
  }>
    <div className="menu column-order-menu" role="menu" aria-label={messages.columnActions(name)} onKeyDown={event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); action.current?.focus() }
      if (event.key === 'Tab') close()
    }}>
      <button ref={action} type="button" className="menu-item" role="menuitem" disabled={disabled} onClick={async event => {
        const origin = event.detail > 0 ? 'pointer' : 'keyboard'
        close()
        const result = await submit({ type: 'materializeParentOrder', horizon, period: { kind: 'date', startDate: period.startDate } })
        if (result) setFocusReturn({ periodId: period.id, origin })
      }}><Icon name="refresh" size={16} /><span>{messages.sortByParent}</span></button>
    </div>
  </Popover>
}
