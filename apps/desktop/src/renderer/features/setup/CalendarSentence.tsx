/**
 * [INPUT]: Calendar draft, live workspace dates, locale sentence templates and the shared Select controls.
 * [OUTPUT]: Three inline calendar choices and a validated custom-date dialog with focus return; all changes remain drafts.
 * [POS]: CalendarStep's sentence editor; keeps date rules in useSetupCalendar and the main confirmation transaction.
 */
import { Fragment, useRef, useState, type ReactNode } from 'react'
import { calendarMessages as c, messages } from '../../i18n'
import { fullDate, weekdayName } from '../../i18n/format'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { CalendarAnchorDialog } from './CalendarAnchorDialog'
import type { CalendarDraft, useSetupCalendar } from './use-setup-calendar'

export function CalendarSentence({ draft, change, live, busy }: {
  draft: CalendarDraft; change: (patch: Partial<CalendarDraft>) => void; live: ReturnType<typeof useSetupCalendar>; busy: boolean
}) {
  const anchorRoot = useRef<HTMLSpanElement>(null), openingDate = useRef(false)
  const [dateOpen, setDateOpen] = useState(false)
  const closeDate = () => {
    setDateOpen(false)
    requestAnimationFrame(() => anchorRoot.current?.querySelector('button')?.focus())
  }
  const controls: Record<string, ReactNode> = {
    mode: <Select value={draft.mode} disabled={busy} onValueChange={mode => change({ mode: mode as CalendarDraft['mode'] })}>
      <SelectTrigger id="setup-calendar-mode" className="calendar-select" aria-label={c.calendarMode}><SelectValue /></SelectTrigger>
      <SelectContent className="calendar-select-menu"><SelectItem value="rolling">{c.rollingMode}</SelectItem><SelectItem value="natural">{c.naturalMode}</SelectItem></SelectContent>
    </Select>,
    anchor: draft.mode === 'natural' ? <span className="calendar-fixed-anchor">{c.setupNaturalStart}</span> : <span ref={anchorRoot} className="calendar-anchor-root">
      <Select value={draft.anchorMode} disabled={busy} onValueChange={value => {
        if (value === 'custom') { openingDate.current = true; setDateOpen(true) }
        else change({ anchorMode: value as CalendarDraft['anchorMode'] })
      }}>
        <SelectTrigger id="setup-calendar-anchor" className="calendar-select" aria-label={c.anchorLabel}><SelectValue /></SelectTrigger>
        <SelectContent className="calendar-select-menu" onCloseAutoFocus={event => { if (openingDate.current) { event.preventDefault(); openingDate.current = false } }}>
          <SelectItem value="today">{c.setupToday}</SelectItem><SelectItem value="monthStart">{c.setupMonthStart}</SelectItem>
          {draft.anchorMode === 'date' && <SelectItem value="date">{draft.customAnchor ? fullDate(draft.customAnchor) : messages.anchorCustom}</SelectItem>}
          <SelectItem value="custom">{messages.anchorCustom}</SelectItem>
        </SelectContent>
      </Select>
    </span>,
    weekStart: <Select value={String(draft.weekStart)} disabled={busy} onValueChange={value => change({ weekStart: Number(value) })}>
      <SelectTrigger id="setup-week-start" className="calendar-select" aria-label={messages.weekStart}><SelectValue /></SelectTrigger>
      <SelectContent className="calendar-select-menu">{[1, 2, 3, 4, 5, 6, 7].map(day => <SelectItem key={day} value={String(day)}>{weekdayName(day)}</SelectItem>)}</SelectContent>
    </Select>,
  }
  return <>
    <div className="calendar-sentence calendar-modes m-0 text-[15px] text-soft" role="paragraph">
      {c.setupSentence.split(/(\{mode\}|\{anchor\}|\{weekStart\})/).map((part, index) => controls[part.slice(1, -1)]
        ? <Fragment key={index}>{controls[part.slice(1, -1)]}</Fragment>
        : <span key={index} className="calendar-copy">{part}</span>)}
    </div>
    {!live.periods && <p className="m-0 mt-3 text-[12px] leading-relaxed text-destructive" role="alert">{c.setupInvalidDate}</p>}
    {dateOpen && <CalendarAnchorDialog initialDate={draft.customAnchor || live.today} today={live.today} busy={busy} close={closeDate} choose={customAnchor => { change({ anchorMode: 'date', customAnchor }); closeDate() }} />}
  </>
}
