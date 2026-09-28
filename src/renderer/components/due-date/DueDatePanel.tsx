/**
 * [INPUT]: Draft deadline, workspace calendar, optional suggested date and a selection callback.
 * [OUTPUT]: dueOptions and a calendar-first deadline panel with compact presets, accessible guidance and optional numeric shortcuts.
 * [POS]: Shared deadline content for detail and composer; callers own opening, focus return and saving.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { messages } from '../../i18n'
import { longDate } from '../../i18n/format'
import { addDays, monthEnd, weekday } from '../../lib/dates'
import { Icon } from '../icons'
import { Calendar } from './Calendar'
import './due-date.css'

export function dueOptions(today: string, compact = false): [string, string][] {
  const day = weekday(today)
  return [
    [messages.dueToday, today], [messages.dueTomorrow, addDays(today, 1)],
    ...(day >= 1 && day < 5 ? [[compact ? messages.dueFridayShort : messages.dueFriday, addDays(today, 5 - day)] as [string, string]] : []),
    [compact ? messages.dueNextMondayShort : messages.dueNextMonday, addDays(today, ((8 - day) % 7) || 7)],
    [compact ? messages.dueMonthEndShort : messages.dueMonthEnd, monthEnd(today)],
  ]
}

export function DueDatePanel({ id, value, today, weekStart, onSelect, suggestion, numericShortcuts = false }: {
  id?: string; value: string; today: string; weekStart: number; onSelect: (date: string) => void
  suggestion?: { date: string; label: string } | undefined; numericShortcuts?: boolean
}) {
  const options = dueOptions(today, true)
  return <div id={id} className="due-panel" role="dialog" aria-label={messages.dueDate} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return
    if (numericShortcuts && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && /^[1-9]$/.test(event.key)) {
      const index = Number(event.key) - 1
      const date = suggestion ? index === 0 ? suggestion.date : options[index - 1]?.[1] : options[index]?.[1]
      if (date) { event.preventDefault(); onSelect(date) }
    }
    // Calendar keys must not submit the surrounding form or operate the composer's draft list.
    if (event.key !== 'Escape') event.stopPropagation()
  }}>
    <div className="due-panel-heading"><span>{messages.dueDate}</span><DueInfo /></div>
    {suggestion && <button type="button" className="due-suggestion" onClick={() => onSelect(suggestion.date)}>
      <Icon name="smart" size={14} /><span>{longDate(suggestion.date)}</span><small>{suggestion.label}</small>
    </button>}
    <div className="due-shortcuts" role="group" aria-label={messages.dueQuickDates}>
      {options.map(([label, date], index) => <button type="button" key={label} aria-label={`${label} · ${longDate(date)}`} aria-pressed={value === date}
        aria-keyshortcuts={numericShortcuts ? String(index + 1 + Number(!!suggestion)) : undefined} title={`${label} · ${longDate(date)}`} onClick={() => onSelect(date)}>{label}</button>)}
    </div>
    <div className="due-separator" />
    <Calendar value={value} today={today} weekStart={weekStart} onSelect={onSelect} />
  </div>
}

function DueInfo() {
  const id = useId(), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false), [dismissed, setDismissed] = useState(false)
  const visible = !dismissed && (hovered || focused || pinned)
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!visible) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault(); event.stopPropagation(); clearTimeout(timer.current); setPinned(false); setDismissed(true)
    }
    window.addEventListener('keydown', escape, true)
    return () => window.removeEventListener('keydown', escape, true)
  }, [visible])
  return <span className="due-info" onPointerEnter={event => {
    if (event.pointerType !== 'touch') timer.current = setTimeout(() => { setDismissed(false); setHovered(true) }, 200)
  }} onPointerLeave={() => { clearTimeout(timer.current); setHovered(false) }}>
    <button type="button" className="due-icon" aria-label={messages.dueInfo} aria-describedby={visible ? id : undefined}
      onFocus={() => { setFocused(true); setDismissed(false) }} onBlur={() => { setFocused(false); setPinned(false) }}
      onClick={() => { setPinned(!pinned); setDismissed(pinned) }}><Icon name="info" size={16} /></button>
    {visible && <span id={id} role="tooltip" className="due-tooltip">{messages.dueDateNote}</span>}
  </span>
}
