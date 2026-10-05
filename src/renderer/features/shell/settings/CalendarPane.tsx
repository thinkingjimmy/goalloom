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
      <div className="settings-hero calendar-summary">
        <span className="settings-hero-icon" aria-hidden="true"><Icon name="calendar" size={18} /></span>
        <div className="settings-row-text">
          <span>{natural ? c.naturalMode : c.rollingMode}</span>
          <small>{natural ? c.naturalDescription : c.rollingSince(fullDate(calendar.cycleAnchor))}</small>
          <small>{c.zoneAndWeek(calendar.timezone, gmtOffset(calendar.timezone), weekdayName(calendar.weekStart))}</small>
        </div>
        <span className="calendar-lock"><Icon name="lock" size={14} />{c.locked}</span>
      </div>
      {progress && next && <div className="calendar-year">
        <div className="calendar-year-head">
          <span>{horizonName('year', calendar)}<span className="tabular">{fullDate(progress.year.startDate)} – {fullDate(addDays(progress.year.endDate, -1))}</span></span>
          <span className="tabular">{c.daysLeft(progress.total - progress.elapsed)}</span>
        </div>
        <YearTimeline progress={progress} />
        <dl className="calendar-facts">
          <div><dt>{c.nextYearStart}</dt><dd className="tabular">{fullDate(next.year)}</dd></div>
          <div><dt>{c.nextHalfStart}</dt><dd className="tabular">{fullDate(next.half)}</dd></div>
          <div><dt>{natural ? c.nextQuarterStart : c.nextCycleStart}</dt><dd className="tabular">{fullDate(next.cycle)}</dd></div>
        </dl>
      </div>}
      <button type="button" className="settings-row calendar-change" onClick={goReset}>
        <span className="settings-row-text"><span>{c.changeCalendar}</span><small>{c.changeCalendarNote}</small></span>
        <span className="calendar-change-target">{s.backupSection}<Icon name="next" size={16} /></span>
      </button>
    </SettingsGroup>
    <SettingsGroup title={s.overdue} aside={<small>{messages.policyFootnote}</small>}>
      {policyHorizons.map(horizon => {
        const policy = policies.find(policy => policy.horizon === horizon)
        if (!policy) return null
        const name = horizonName(horizon, calendar)
        return <div key={horizon} className="settings-row policy-row" data-policy-horizon={horizon}>
          <span className="policy-name">{name}</span>
          <span className="settings-hint policy-note">{s.policyNotes[policy.horizon][policy.mode]}</span>
          <Segmented label={name} value={policy.mode} options={modes()} disabled={disabled}
            onChange={mode => void submit({ type: 'policy', horizon: policy.horizon, mode, expectedVersion: policy.version })} />
        </div>
      })}
    </SettingsGroup>
  </>
}
