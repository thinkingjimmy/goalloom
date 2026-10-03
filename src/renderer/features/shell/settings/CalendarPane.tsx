/**
 * [INPUT]: Workspace calendar, policies and guarded actions.
 * [OUTPUT]: Locked mode/anchor, next annual/half starts, static manual year/half rows and four editable rollover policies.
 * [POS]: Calendar settings; policy changes are revalidated in storage.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { CalendarConfig, Policy } from '../../../../shared/contracts/entities'
import { calendarMessages as c, messages, settingsMessages as s } from '../../../i18n'
import { horizonName } from '../../../lib/periods'
import { weekdayName } from '../../../i18n/format'
import type { Action } from '../../../state/use-workspace'
import { gmtOffset } from '../../../lib/timezones'
import { anchoredRange, parseDate } from '../../../../domain/calendar'
import { SettingsGroup, Segmented } from './parts'

const modes = () => [{ value: 'manual', label: messages.manualShort }, { value: 'auto', label: messages.autoMode }] as const

export function CalendarPane({ calendar, policies, today, disabled, submit, goReset }: { calendar: CalendarConfig; policies: Policy[]; today: string; disabled: boolean; submit: (action: Action) => Promise<unknown>; goReset: () => void }) {
  const observed = parseDate(today < calendar.cycleAnchor ? calendar.cycleAnchor : today)
  const next = (months: number) => anchoredRange(calendar.cycleAnchor, observed, months)[1].toString()
  return <>
    <SettingsGroup title={s.calendarSettings} aside={<button type="button" className="settings-button" onClick={goReset}>{messages.goReset}</button>}>
      <dl className="calendar-facts">
        <div><dt>{c.calendarMode}</dt><dd>{calendar.mode === 'natural' ? c.naturalMode : c.rollingMode}</dd></div>
        <div><dt>{messages.timezone}</dt><dd>{calendar.timezone}</dd><dd className="tabular">{gmtOffset(calendar.timezone)}</dd></div>
        <div><dt>{messages.weekStartRow}</dt><dd>{weekdayName(calendar.weekStart)}</dd></div>
        <div><dt>{c.anchorLabel}</dt><dd className="tabular">{calendar.cycleAnchor}</dd><dd className="tabular">{s.nextCycle(next(3))}</dd></div>
        <div><dt>{c.nextYearStart}</dt><dd className="tabular">{next(12)}</dd></div>
        <div><dt>{c.nextHalfStart}</dt><dd className="tabular">{next(6)}</dd></div>
      </dl>
    </SettingsGroup>
    <SettingsGroup title={s.overdue} aside={<small>{messages.policyFootnote}</small>}>
      {(['year', 'half'] as const).map(horizon => <div key={horizon} className="settings-row policy-row">
        <span className="policy-name">{horizonName(horizon, calendar)}</span><span className="settings-hint">{c.manualAlways}</span>
      </div>)}
      {policies.map(policy => {
        const name = horizonName(policy.horizon, calendar)
        return <div key={policy.horizon} className="settings-row policy-row">
          <span className="policy-name">{name}</span>
          {policy.horizon === 'cycle'
            ? <><span className="settings-hint policy-note">{messages.cyclePolicyNote}</span><span className="settings-hint">{messages.cycleAlwaysManual}</span></>
            : <><span className="settings-hint policy-note">{s.policyNotes[policy.horizon][policy.mode]}</span>
              <Segmented label={name} value={policy.mode} options={modes()} disabled={disabled}
                onChange={mode => void submit({ type: 'policy', horizon: policy.horizon, mode, expectedVersion: policy.version })} /></>}
        </div>
      })}
    </SettingsGroup>
  </>
}
