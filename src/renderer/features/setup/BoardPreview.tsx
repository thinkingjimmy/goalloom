/**
 * [INPUT]: Six calculated preview periods, calendar mode, workspace today and optional annual direction.
 * [OUTPUT]: Seven-column read-only header strip with one pending annual direction row.
 * [POS]: Direction confirmation preview; creates no entities or sample tasks.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { parseDate } from '../../../domain/calendar'
import { horizons } from '../../../shared/contracts/values'
import type { CalendarConfig, PlanningPeriod } from '../../../shared/contracts/entities'
import { messages } from '../../i18n'
import { horizonName, planningLabel } from '../../lib/periods'
import { periodLabel } from '../board/period-labels'

export function BoardPreview({ periods, calendar, today, direction, yearName }: { periods: PlanningPeriod[]; calendar: CalendarConfig; today: string; direction: string; yearName: string }) {
  return <figure className="board-preview" aria-label={messages.previewTitle}>
    {horizons.map(horizon => {
      const period = periods.find(period => period.horizon === horizon)
      return <section key={horizon} className="preview-column" data-horizon={horizon}>
        <header><h2>{horizon === 'year' ? yearName : period ? planningLabel(period, calendar, parseDate(today).toZonedDateTime(calendar.timezone).toInstant().toString()) : horizonName(horizon, calendar)}</h2>
          {period && !(calendar.mode === 'natural' && horizon === 'year') && <span className="column-meta">{periodLabel(horizon, period, calendar, today)}</span>}</header>
        {horizon === 'year' && direction && <div className="preview-row"><span className="check check-dashed" aria-hidden="true" /><span className="preview-title">{direction}</span><span className="row-meta">{messages.draftTag}</span></div>}
      </section>
    })}
  </figure>
}
