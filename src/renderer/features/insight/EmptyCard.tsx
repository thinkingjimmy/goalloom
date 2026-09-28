/**
 * [INPUT]: An empty current column, the open items of the column above it, that column's current period and the board insight seed opener.
 * [OUTPUT]: EmptyCard — "X is empty" with two actions: draft a step for each source (batch composer seed) or write one (free seed).
 * [POS]: features/insight replacement for the generic empty state when the column above still has open work; writes only through the composer.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ItemSummary, PlanningPeriod } from '../../../shared/contracts/entities'
import { horizonNames, insightMessages as t } from '../../i18n'
import { Icon } from '../../components/icons'
import type { BoardInsight } from '../board/Board'
import type { ChildHorizon } from './signals'
import './insight.css'

const above: Record<ChildHorizon, 'cycle' | 'month' | 'week'> = { month: 'cycle', week: 'month', day: 'week' }

export function EmptyCard({ horizon, sources, period, insight, disabled }: { horizon: ChildHorizon; sources: ItemSummary[]; period: PlanningPeriod; insight: BoardInsight; disabled: boolean }) {
  const base = { horizon, period, next: false, parent: null, children: [], note: null }
  return <div className="insight-empty" role="group" aria-label={t.emptyTitle(horizonNames[horizon])}>
    <p className="insight-empty-title">{t.emptyTitle(horizonNames[horizon])}</p>
    <p className="insight-empty-body">{t.emptyBody(horizonNames[above[horizon]], sources.length)}</p>
    <div className="insight-empty-actions">
      <button type="button" className="settings-button primary" disabled={disabled} onClick={() => insight.seed({ ...base, mode: 'batch', parents: sources, draft: insight.ready })}><Icon name="smart" size={14} />{t.emptyDraft(sources.length)}</button>
      <button type="button" className="settings-button" disabled={disabled} onClick={() => insight.seed({ ...base, mode: 'free', parents: [], draft: false })}>{t.emptyOwn}</button>
    </div>
  </div>
}
