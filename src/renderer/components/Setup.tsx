import { messages } from '../lib/messages'
import { useMemo, useState } from 'react'
import { currentPeriod, workspaceDate } from '../../domain/calendar'
import type { Action } from '../lib/use-workspace'
import { Button } from './ui/button'

export function Setup({ submit, busy }: { submit: (action: Action) => Promise<unknown>; busy: boolean }) {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  const [timezone, setTimezone] = useState(detected)
  const [weekStart, setWeekStart] = useState(1)
  const [anchor, setAnchor] = useState(detected ? workspaceDate(detected, new Date().toISOString()) : '')
  const preview = useMemo(() => {
    try { return currentPeriod({ id: 'preview', timezone, weekStart, cycleAnchor: anchor }, 'cycle', new Date().toISOString()) }
    catch { return null }
  }, [timezone, weekStart, anchor])
  const timezones = useMemo(() => [...new Set(['UTC', detected, ...Intl.supportedValuesOf('timeZone')])].filter(Boolean), [detected])
  return <main className="setup-page">
    <p className="eyebrow">{messages.welcome}</p><h1>{messages.setupHeading}</h1>
    <p className="intro">{messages.setupIntroduction}</p>
    <form onSubmit={event => event.preventDefault()}>
      <label>{messages.timezone}<input list="timezones" value={timezone} onChange={event => setTimezone(event.target.value)} required aria-describedby="timezone-note" /></label>
      <datalist id="timezones">{timezones.map(zone => <option key={zone} value={zone} />)}</datalist>
      <p id="timezone-note" className="field-note">{messages.timezoneNote}</p>
      <label>{messages.weekStart}<select value={weekStart} onChange={event => setWeekStart(Number(event.target.value))}>{[messages.monday, messages.tuesday, messages.wednesday, messages.thursday, messages.friday, messages.saturday, messages.sunday].map((label, index) => <option key={label} value={index + 1}>{messages.weekdayPrefix}{label}</option>)}</select></label>
      <label>{messages.cycleAnchor}<input type="date" value={anchor} onChange={event => setAnchor(event.target.value)} required /></label>
      <p className="field-note">{messages.cycleNote}</p>
      <div className="calendar-preview" aria-live="polite">{preview ? <>{messages.currentPeriod}<strong>{preview.startDate} — {preview.endDate}</strong><small>{messages.exclusiveEnd}</small></> : messages.setupInvalid}</div>
      <p className="setup-lock-note">{messages.calendarLockNote}</p>
      <Button type="button" disabled={busy || !preview} onClick={() => { if (preview) void submit({ type: 'confirmSetup', timezone, weekStart, cycleAnchor: anchor, confirmed: true }) }}>{messages.confirmSetup}</Button>
    </form>
  </main>
}
