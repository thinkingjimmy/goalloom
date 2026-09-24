/**
 * [INPUT]: 受限提交与忙碌状态；domain/calendar 的周期预览；本机检测到的时区；LanguageSelect 语言控件。
 * [OUTPUT]: 首次配置页：语言（即时切换，不写入工作区）、时区、一周开始（按当前语言的星期名）、三个月周期起点与当前周期预览，显式确认后提交 confirmSetup。
 * [POS]: features/setup 的入口视图；确认只锁定日历，语言仍可在设置中更改。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { messages } from '../../i18n'
import { weekdayName } from '../../i18n/format'
import { useMemo, useState } from 'react'
import { currentPeriod, workspaceDate } from '../../../domain/calendar'
import type { Action } from '../../state/use-workspace'
import { Button } from '../../components/ui/button'
import { TimezoneSelect } from './TimezoneSelect'
import { LanguageSelect } from '../../components/LanguageSelect'

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
      <label>{messages.language}<LanguageSelect id="setup-language" /></label>
      <div className="field"><span id="timezone-label">{messages.timezone}</span><TimezoneSelect value={timezone} zones={timezones} onChange={setTimezone} labelId="timezone-label" describedBy="timezone-note" /></div>
      <p id="timezone-note" className="field-note">{messages.timezoneNote}</p>
      <label>{messages.weekStart}<select value={weekStart} onChange={event => setWeekStart(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map(day => <option key={day} value={day}>{weekdayName(day)}</option>)}</select></label>
      <label>{messages.cycleAnchor}<input type="date" value={anchor} onChange={event => setAnchor(event.target.value)} required /></label>
      <p className="field-note">{messages.cycleNote}</p>
      <div className="calendar-preview" aria-live="polite">{preview ? <>{messages.currentPeriod}<strong>{preview.startDate} — {preview.endDate}</strong><small>{messages.exclusiveEnd}</small></> : messages.setupInvalid}</div>
      <p className="setup-lock-note">{messages.calendarLockNote}</p>
      <Button type="button" disabled={busy || !preview} onClick={() => { if (preview) void submit({ type: 'confirmSetup', timezone, weekStart, cycleAnchor: anchor, confirmed: true }) }}>{messages.confirmSetup}</Button>
    </form>
  </main>
}
