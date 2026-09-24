/**
 * [INPUT]: 日历草稿（时区/周起始/起点方式/自选日期）与修改回调、方向草稿、候选时区；domain/calendar 的 currentPeriod/workspaceDate。
 * [OUTPUT]: 首次流程第 2 步：一句话里三个可改的胶囊（时区、周起始、3个月起点：今天/本月初/本季度初/自选），剩余天数提示与真实列头的看板预览；「确认并开始」提交已校验的日历。
 * [POS]: features/setup 的日历步；预览只在本机计算，确认即锁定日历，服务端事务仍复核起点不晚于今天。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useId, useMemo, type ReactNode } from 'react'
import { currentPeriod, workspaceDate, type Horizon, type Period } from '../../../domain/calendar'
import { messages } from '../../i18n'
import { monthDay, weekdayName } from '../../i18n/format'
import { Button } from '../../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { BoardPreview } from './BoardPreview'
import { OnboardingFrame } from './OnboardingFrame'
import { TimezoneSelect } from './TimezoneSelect'

export type AnchorMode = 'today' | 'month' | 'quarter' | 'custom'
export interface CalendarDraft { timezone: string; weekStart: number; anchorMode: AnchorMode; customAnchor: string }
export interface CalendarChoice { timezone: string; weekStart: number; cycleAnchor: string }

const periodHorizons: Horizon[] = ['cycle', 'month', 'week', 'day']
const dayMs = 86_400_000

/** Preset anchors are derived from the workspace's today, so they always satisfy "no later than today". */
export function presetAnchors(today: string): Record<Exclude<AnchorMode, 'custom'>, string> {
  const month = Number(today.slice(5, 7))
  const quarter = String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')
  return { today, month: `${today.slice(0, 8)}01`, quarter: `${today.slice(0, 5)}${quarter}-01` }
}

export function CalendarStep({ draft, change, direction, zones, back, confirm, busy }: {
  draft: CalendarDraft; change: (patch: Partial<CalendarDraft>) => void; direction: string; zones: string[]
  back: () => void; confirm: (choice: CalendarChoice) => void; busy: boolean
}) {
  const timezoneLabel = useId()
  const now = new Date().toISOString()
  const today = workspaceDate(draft.timezone, now)
  const presets = presetAnchors(today)
  const cycleAnchor = draft.anchorMode === 'custom' ? draft.customAnchor : presets[draft.anchorMode]
  const preview = useMemo(() => {
    if (!cycleAnchor || cycleAnchor > today) return null
    try {
      const calendar = { id: 'preview', timezone: draft.timezone, weekStart: draft.weekStart, cycleAnchor }
      return Object.fromEntries(periodHorizons.map(horizon => [horizon, currentPeriod(calendar, horizon, now)])) as Record<Horizon, Period>
    } catch { return null }
  }, [draft.timezone, draft.weekStart, cycleAnchor, today])
  const cycle = preview?.cycle
  const remaining = cycle ? Math.round((Date.parse(cycle.endDate) - Date.parse(today)) / dayMs) : 0

  const slots: Record<string, ReactNode> = {
    timezone: <><span id={timezoneLabel} className="sr-only">{messages.timezone}</span>
      <TimezoneSelect className="pill-trigger" value={draft.timezone} zones={zones} labelId={timezoneLabel} onChange={timezone => change({ timezone })} /></>,
    weekStart: <Select value={String(draft.weekStart)} onValueChange={value => change({ weekStart: Number(value) })}>
      <SelectTrigger className="pill-trigger" aria-label={messages.weekStart}><SelectValue /></SelectTrigger>
      <SelectContent>{[1, 2, 3, 4, 5, 6, 7].map(day => <SelectItem key={day} value={String(day)}>{weekdayName(day)}</SelectItem>)}</SelectContent>
    </Select>,
    anchor: <><Select value={draft.anchorMode} onValueChange={value => change({ anchorMode: value as AnchorMode, customAnchor: draft.customAnchor || today })}>
      <SelectTrigger className="pill-trigger" aria-label={messages.cycleAnchor}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="today">{messages.anchorToday(monthDay(presets.today))}</SelectItem>
        <SelectItem value="month">{messages.anchorMonth(monthDay(presets.month))}</SelectItem>
        <SelectItem value="quarter">{messages.anchorQuarter(monthDay(presets.quarter))}</SelectItem>
        <SelectItem value="custom">{messages.anchorCustom}</SelectItem>
      </SelectContent>
    </Select>{draft.anchorMode === 'custom' && <input type="date" className="pill-date" aria-label={messages.customAnchor} max={today} required value={draft.customAnchor} onChange={event => change({ customAnchor: event.target.value })} />}</>,
  }
  // Word order differs per language, so the sentence is a template with named slots.
  const sentence = messages.calendarSentence.split(/\{(\w+)\}/).map((part, index) => index % 2 ? <span key={index}>{slots[part]}</span> : part)

  return <OnboardingFrame step={1} label={messages.stepCalendar} note={messages.calendarLockNote} lock
    actions={<>
      <Button type="button" variant="ghost" onClick={back}>{messages.previousStep}</Button>
      <Button type="button" disabled={busy || !preview} onClick={() => { if (preview) confirm({ timezone: draft.timezone, weekStart: draft.weekStart, cycleAnchor }) }}>{messages.confirmSetup}</Button>
    </>}>
    <section className="onboarding-calendar">
      <h1 className="onboarding-title small">{direction ? messages.calendarGoalTitle(direction) : messages.calendarTitle}</h1>
      <p className="calendar-sentence">{sentence}</p>
      <p className="onboarding-hint" aria-live="polite">{cycle ? messages.cycleRemaining(remaining, monthDay(cycle.endDate)) : ' '}</p>
    </section>
    <p className="preview-caption">{messages.previewTitle}</p>
    {preview && <BoardPreview periods={preview} direction={direction} />}
  </OnboardingFrame>
}
