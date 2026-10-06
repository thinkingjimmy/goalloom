/**
 * [INPUT]: Empty displayed column, eligible open parents without active displayed-period children, displayed period and seed opener.
 * [OUTPUT]: EmptyCard — "X is empty" with the source count in its body and same-row, equal-height draft/write actions with wrapping labels (batch/free composer seeds).
 * [POS]: Empty-state insight for current periods and future half/cycle inside a displayed future parent; writes through Composer.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ItemSummary, PlanningPeriod } from '../../../shared/contracts/entities'
import { horizonNames, insightMessages as t } from '../../i18n'
import { Icon } from '../../components/icons'
import type { BoardInsight } from '../board/Board'
import type { ChildHorizon } from './signals'
import './insight.css'

const above: Record<ChildHorizon, 'year' | 'half' | 'cycle' | 'month' | 'week'> = { half: 'year', cycle: 'half', month: 'cycle', week: 'month', day: 'week' }

export function EmptyCard({ horizon, sources, period, insight, disabled }: { horizon: ChildHorizon; sources: ItemSummary[]; period: PlanningPeriod; insight: BoardInsight; disabled: boolean }) {
  const base = { horizon, period, next: false, parent: null, note: null }
  return <div className="insight-empty" role="group" aria-label={t.emptyTitle(horizonNames[horizon])}>
    <p className="insight-empty-title">{t.emptyTitle(horizonNames[horizon])}</p>
    <p className="insight-empty-body">{t.emptyBody(horizonNames[above[horizon]], sources.length)}</p>
    <div className="insight-empty-actions">
      <button type="button" className="settings-button primary" disabled={disabled} onClick={() => insight.seed({ ...base, mode: 'batch', parents: sources, draft: insight.ready })}><Icon name="smart" size={14} /><span>{t.emptyDraft[horizon]}</span></button>
      <button type="button" className="settings-button" disabled={disabled} onClick={() => insight.seed({ ...base, mode: 'free', parents: [], draft: false })}><span>{t.emptyOwn}</span></button>
    </div>
  </div>
}
