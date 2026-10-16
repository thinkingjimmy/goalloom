/**
 * [INPUT]: Workspace calendar, observation time, policies, guarded actions and the reset navigation.
 * [OUTPUT]: Locked calendar summary/timeline, reset navigation and six editable rollover policies ordered from year to day.
 * [POS]: Calendar settings; policy changes are revalidated in storage.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { CalendarConfig, Policy } from '../../../../shared/contracts/entities'
import { policyHorizons } from '../../../../shared/contracts/values'
import { calendarMessages as c, messages, settingsMessages as s } from '../../../i18n'
import { horizonName } from '../../../lib/periods'
import { fullDate, weekdayName } from '../../../i18n/format'
import type { Action } from '../../../state/use-workspace'
import { gmtOffset } from '../../../lib/timezones'
import { addDays } from '../../../lib/dates'
import { parseDate } from '../../../../domain/calendar'
import { Icon } from '../../../components/icons'
import { YearTimeline, yearProgress } from '../../../components/YearTimeline'
import { SettingsGroup, Segmented } from './parts'

const modes = () => [{ value: 'manual', label: messages.manualShort }, { value: 'auto', label: messages.autoMode }] as const

export function CalendarPane({ calendar, policies, observedAt, today, disabled, submit, goReset }: { calendar: CalendarConfig; policies: Policy[]; observedAt: string; today: string; disabled: boolean; submit: (action: Action) => Promise<unknown>; goReset: () => void }) {
  const natural = calendar.mode === 'natural'
  // A clock set before the anchor still shows the first year rather than failing.
  const progress = yearProgress(calendar, today < calendar.cycleAnchor ? parseDate(calendar.cycleAnchor).toZonedDateTime(calendar.timezone).toInstant().toString() : observedAt)
  const next = progress && (() => {
    const { year, cycles, today } = progress, half = cycles[2]!.startDate
    return { year: year.endDate, half: today < half ? half : year.endDate, cycle: cycles.find(cycle => cycle.startDate > today)?.startDate ?? year.endDate }
  })()
  return <>
    <SettingsGroup title={s.calendarSettings}>
      <div className="settings-hero calendar-summary flex gap-3.5 pt-4 pr-4 pb-4 pl-4.5 rounded-[12px] bg-hover items-start">
        <span className="settings-hero-icon w-9 h-9 shrink-0 grid place-items-center rounded-[10px] bg-raised text-muted-foreground" aria-hidden="true"><Icon name="calendar" size={18} /></span>
        <div className="settings-row-text flex-1 min-w-0 flex flex-col gap-[3px] text-[14px]">
          <span>{natural ? c.naturalMode : c.rollingMode}</span>
          <small>{natural ? c.naturalDescription : c.rollingSince(fullDate(calendar.cycleAnchor))}</small>
          <small>{c.zoneAndWeek(calendar.timezone, gmtOffset(calendar.timezone), weekdayName(calendar.weekStart))}</small>
        </div>
        <span className="calendar-lock shrink-0 h-6 mt-1.5 pt-0 pr-[9px] pb-0 pl-[7px] inline-flex items-center gap-[5px] rounded-[12px] bg-hover text-soft text-[12px] font-medium whitespace-nowrap"><Icon name="lock" size={14} />{c.locked}</span>
      </div>
      {progress && next && <div className="calendar-year pt-3.5 pr-4.5 pb-4 pl-4.5 flex flex-col gap-1">
        <div className="calendar-year-head flex items-baseline justify-between gap-3 text-[13px] font-medium">
          <span>{horizonName('year', calendar)}<span className="tabular">{fullDate(progress.year.startDate)} – {fullDate(addDays(progress.year.endDate, -1))}</span></span>
          <span className="tabular">{c.daysLeft(progress.total - progress.elapsed)}</span>
        </div>
        <YearTimeline progress={progress} />
        <dl className="calendar-facts mt-2.5 mr-0 mb-0 ml-0 pt-3 grid gap-4">
          <div><dt>{c.nextYearStart}</dt><dd className="tabular">{fullDate(next.year)}</dd></div>
          <div><dt>{c.nextHalfStart}</dt><dd className="tabular">{fullDate(next.half)}</dd></div>
          <div><dt>{natural ? c.nextQuarterStart : c.nextCycleStart}</dt><dd className="tabular">{fullDate(next.cycle)}</dd></div>
        </dl>
      </div>}
      <button type="button" className="settings-row calendar-change min-h-14 pt-2.5 pr-4 pb-2.5 pl-4.5 flex items-center gap-4" onClick={goReset}>
        <span className="settings-row-text flex-1 min-w-0 flex flex-col gap-[3px] text-[14px]"><span>{c.changeCalendar}</span><small>{c.changeCalendarNote}</small></span>
        <span className="calendar-change-target shrink-0 inline-flex items-center gap-0.5 text-[12.5px] text-muted-foreground">{s.backupSection}<Icon name="next" size={16} /></span>
      </button>
    </SettingsGroup>
    <SettingsGroup title={s.overdue}>
      {policyHorizons.map(horizon => {
        const policy = policies.find(policy => policy.horizon === horizon)
        if (!policy) return null
        const name = horizonName(horizon, calendar)
        return <div key={horizon} className="settings-row policy-row min-h-14 pt-2.5 pr-4 pb-2.5 pl-4.5 flex items-center gap-4" data-policy-horizon={horizon}>
          <span className="policy-name min-w-10 text-[14px] font-medium whitespace-nowrap">{name}</span>
          <span className="settings-hint policy-note shrink-0 text-[12px] text-muted-foreground min-w-0">{s.policyNotes[policy.horizon][policy.mode]}</span>
          <Segmented label={name} value={policy.mode} options={modes()} disabled={disabled}
            onChange={mode => void submit({ type: 'policy', horizon: policy.horizon, mode, expectedVersion: policy.version })} />
        </div>
      })}
    </SettingsGroup>
  </>
}
