/**
 * [INPUT]: Workspace calendar, policies and guarded actions.
 * [OUTPUT]: Read-only calendar with reset navigation beside its section title and per-column rollover policies.
 * [POS]: Calendar settings; policy changes are revalidated in storage.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { CalendarConfig, Policy } from '../../../../shared/contracts/entities'
import { horizonNames, messages, settingsMessages as s } from '../../../i18n'
import { weekdayName } from '../../../i18n/format'
import type { Action } from '../../../state/use-workspace'
import { gmtOffset } from '../../../lib/timezones'
import { cycleRange, parseDate } from '../../../../domain/calendar'
import { SettingsGroup, Segmented } from './parts'

const modes = () => [{ value: 'manual', label: messages.manualShort }, { value: 'auto', label: messages.autoMode }] as const

export function CalendarPane({ calendar, policies, today, disabled, submit, goReset }: { calendar: CalendarConfig; policies: Policy[]; today: string; disabled: boolean; submit: (action: Action) => Promise<unknown>; goReset: () => void }) {
  // The cycle end is exclusive, so it is already the next cycle's first day.
  const next = cycleRange(calendar.cycleAnchor, parseDate(today))[1].toString()
  return <>
    <SettingsGroup title={s.calendarSettings} aside={<button type="button" className="settings-button" onClick={goReset}>{messages.goReset}</button>}>
      <dl className="calendar-facts">
        <div><dt>{messages.timezone}</dt><dd>{calendar.timezone}</dd><dd className="tabular">{gmtOffset(calendar.timezone)}</dd></div>
        <div><dt>{messages.weekStartRow}</dt><dd>{weekdayName(calendar.weekStart)}</dd></div>
        <div><dt>{messages.cycleAnchorRow}</dt><dd className="tabular">{calendar.cycleAnchor}</dd><dd className="tabular">{s.nextCycle(next)}</dd></div>
      </dl>
    </SettingsGroup>
    <SettingsGroup title={s.overdue} aside={<small>{messages.policyFootnote}</small>}>
      {policies.map(policy => {
        const name = horizonNames[policy.horizon]
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
