/**
 * [INPUT]: Empty displayed column, eligible open parents without active displayed-period children, displayed period, batch-seed opener and the column's inline create opener.
 * [OUTPUT]: EmptyCard — "X is empty" with the source count in its body and same-row, equal-height draft/write actions. The manual label stays on one line; the draft label balances when the column is too narrow. Draft opens the batch composer; write opens the same inline entry as the column ＋.
 * [POS]: Empty-state insight for current periods and future half/cycle inside a displayed future parent; batch drafts write through Composer, manual writing uses the column QuickAdd.
 */
import { SettingsButton } from '../../components/ui/button'
import type { ItemSummary, PlanningPeriod } from '../../../shared/contracts/entities'
import { horizonNames, insightMessages as t } from '../../i18n'
import { Icon } from '../../components/icons'
import type { BoardInsight } from '../board/Board'
import type { ChildHorizon } from './signals'
import './insight.css'

const above: Record<ChildHorizon, 'year' | 'half' | 'cycle' | 'month' | 'week'> = { half: 'year', cycle: 'half', month: 'cycle', week: 'month', day: 'week' }

export function EmptyCard({ horizon, sources, period, insight, disabled, onWrite }: { horizon: ChildHorizon; sources: ItemSummary[]; period: PlanningPeriod; insight: Pick<BoardInsight, 'seed' | 'ready'>; disabled: boolean; onWrite: () => void }) {
  const base = { horizon, period, next: false, parent: null, note: null }
  return <div className="insight-empty" role="group" aria-label={t.emptyTitle(horizonNames[horizon])}>
    <p className="insight-empty-title">{t.emptyTitle(horizonNames[horizon])}</p>
    <p className="insight-empty-body">{t.emptyBody(horizonNames[above[horizon]], sources.length)}</p>
    <div className="insight-empty-actions">
      <SettingsButton variant="primary" type="button" disabled={disabled} onClick={() => insight.seed({ ...base, mode: 'batch', parents: sources, draft: insight.ready })}><Icon name="smart" size={14} /><span>{t.emptyDraft[horizon]}</span></SettingsButton>
      <SettingsButton type="button" disabled={disabled} onClick={onWrite}><span>{t.emptyOwn}</span></SettingsButton>
    </div>
  </div>
}
