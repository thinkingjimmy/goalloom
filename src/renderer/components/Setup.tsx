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
    <p className="eyebrow">欢迎来到 Goalloom</p><h1>从一个方向，开始。</h1>
    <p className="intro">先选好计划使用的日历。之后，每一天的行动都会有清楚的位置。</p>
    <form onSubmit={event => event.preventDefault()}>
      <label>工作区时区<input list="timezones" value={timezone} onChange={event => setTimezone(event.target.value)} required aria-describedby="timezone-note" /></label>
      <datalist id="timezones">{timezones.map(zone => <option key={zone} value={zone} />)}</datalist>
      <p id="timezone-note" className="field-note">按这个时区计算日界；系统时区改变时不会自动跟随。</p>
      <label>一周从哪天开始<select value={weekStart} onChange={event => setWeekStart(Number(event.target.value))}>{['一', '二', '三', '四', '五', '六', '日'].map((label, index) => <option key={label} value={index + 1}>星期{label}</option>)}</select></label>
      <label>三个月周期的起点<input type="date" value={anchor} onChange={event => setAnchor(event.target.value)} required /></label>
      <p className="field-note">固定三日历月，起点不得晚于工作区今天；月底自动截断。</p>
      <div className="calendar-preview" aria-live="polite">{preview ? <>当前周期：<strong>{preview.startDate} — {preview.endDate}</strong><small>结束日不含在内</small></> : '请选择有效的时区和不晚于今天的起点'}</div>
      <p className="setup-lock-note">确认后，首版不能直接修改这个工作区的日历。重新配置需先备份并重置。</p>
      <Button type="button" disabled={busy || !preview} onClick={() => { if (preview) void submit({ type: 'confirmSetup', timezone, weekStart, cycleAnchor: anchor, confirmed: true }) }}>确认并开始</Button>
    </form>
  </main>
}
