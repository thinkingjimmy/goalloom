/**
 * [INPUT]: Live calendar periods, the actual direction destination, localized board labels and one persistent camera ref.
 * [OUTPUT]: Read-only product corner, decorative macOS controls, live draft row and optional inert capability overlays.
 * [POS]: Independently clipped first-run canvas, shared by calendar, direction and AI; no Later, scrolling or writes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ReactNode, Ref } from 'react'
import { currentPeriod } from '../../../domain/calendar'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import { Icon } from '../../components/icons'
import { calendarMessages as c, messages } from '../../i18n'
import { periodLabel, periodTitle } from '../board/period-labels'
import type { useSetupCalendar } from './use-setup-calendar'

export type PreviewCalendar = Pick<ReturnType<typeof useSetupCalendar>, 'today' | 'now' | 'calendar' | 'periods'>
export type SetupCamera = 'overview' | 'year' | 'smart' | 'insight'

export function SetupCanvas({ live, direction, step, camera = step === 'direction' ? 'year' : 'overview', target, worldRef, children, halfContent }: {
  live: PreviewCalendar; direction: string; step?: 'calendar' | 'direction'; camera?: SetupCamera; target: PlanningPeriod | undefined; worldRef: Ref<HTMLDivElement>
  children?: ReactNode; halfContent?: ((period: PlanningPeriod) => ReactNode) | undefined
}) {
  return <aside id="onboarding-product-preview" className="setup-canvas" data-entry-part="canvas" role={children ? 'group' : 'img'} aria-label={c.setupPreview}>
    <div ref={worldRef} className="setup-world" data-camera={camera}>
      <div className="setup-board-toolbar" aria-hidden="true"><div className="preview-window-controls"><span data-control="close" /><span data-control="minimize" /><span data-control="zoom" /></div><span className="setup-board-filter"><Icon name="all" size={16} />{messages.allFlows}</span></div>
      <div className="setup-board-timeline" aria-hidden="true">
        {live.periods?.map(current => {
          const annual = current.horizon === 'year'
          const futureYear = target && target.id !== live.periods?.find(period => period.horizon === 'year')?.id
          const period = camera !== 'overview' && target && (annual || (futureYear && current.horizon === 'half'))
            ? annual ? target : currentPeriod(live.calendar, 'half', target.startAt) : current
          const title = periodTitle(period, current, live.calendar)
          const date = annual && live.calendar.mode === 'natural' ? null : periodLabel(period.horizon, period, live.calendar, live.today, true)
          const goal = annual && camera !== 'overview' ? direction.trim() : ''
          return <section className="setup-product-column" data-horizon={period.horizon} data-start={period.startDate} data-end={period.endDate} key={period.horizon}>
            <header className="setup-column-header"><div className="setup-period-heading"><span className="setup-period-title">{title}</span>{date && <span className="setup-period-date">{date}</span>}<Icon name="expand" size={12} /></div><span className="setup-column-add"><Icon name="add" size={16} /></span></header>
            {period.horizon === 'half' && halfContent ? halfContent(period) : goal ? <><article className="setup-product-row"><span className="setup-product-checkbox" /><span className="setup-product-task-title">{goal}</span></article><span className="setup-product-add"><Icon name="add" size={16} />{messages.addTask}</span></>
              : <div className="setup-product-empty"><Icon name="empty" size={44} strokeWidth={1.1} /><p>{period.horizon === 'day' ? messages.emptyDay : messages.emptyDirection}</p></div>}
          </section>
        })}
      </div>
      {children}
    </div>
  </aside>
}
