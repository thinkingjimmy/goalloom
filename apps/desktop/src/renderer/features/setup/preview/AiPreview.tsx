/**
 * [INPUT]: Read-only scene with live calendar periods, localized samples and native composer/insight components.
 * [OUTPUT]: Inert smart-input and insight illustrations over the persistent Todo board; no API calls or writes.
 * [POS]: Onboarding-only presentation. Native Plan, EmptyCard and composer styles keep previews aligned with the product.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ItemSummary, PlanningPeriod } from '../../../../shared/contracts/entities'
import { currentPeriod } from '../../../../domain/calendar'
import { Temporal } from '../../../../domain/temporal'
import { Icon } from '../../../components/icons'
import { IconButton } from '../../../components/ui/button'
import { insightMessages as insight, messages, smartMessages as t } from '../../../i18n'
import { Plan, JevBadge } from '../../composer/Plan'
import type { EditableDraft } from '../../composer/draft'
import { EmptyCard } from '../../insight/EmptyCard'
import { periodLabel } from '../../board/period-labels'
import type { OnboardingScene } from '../OnboardingStage'
import '../../composer/composer.css'
import './ai-preview.css'

const noop = () => undefined
const previewInsight = { seed: noop, ready: true }
function sampleParent(direction: string, period: PlanningPeriod): ItemSummary {
  return { id: 'onboarding-example', title: direction.trim() || t.onboardingDemoGoal, dueDate: null, status: 'todo',
    completedAt: null, cancelledAt: null, archivedAt: null, deletedAt: null, deletedBy: null,
    createdAt: period.startAt, updatedAt: period.startAt, version: 1, flowColor: 0, note: null,
    placement: { itemId: 'onboarding-example', horizon: 'year', periodId: null, sortKey: 0, version: 1, holdPeriodId: null } }
}
export function InsightPreviewCard({ direction, period }: { direction: string; period: PlanningPeriod }) {
  return <div className="preview-insight" inert><EmptyCard horizon="half" sources={[sampleParent(direction, period)]} period={period} insight={previewInsight} disabled={false} onWrite={noop} /></div>
}
function Submit({ count }: { count: number }) {
  return <button type="button" className="composer-primary shrink-0 inline-flex items-center gap-2 h-7.5 pt-0 pr-2 pb-0 pl-3 rounded-[8px] bg-foreground text-surface text-[13px] font-semibold">{t.createCount(count)}<kbd className="keycap">↵</kbd></button>
}
export function AiPreview({ scene }: { scene: OnboardingScene }) {
  const { live, camera, target } = scene
  const half = target && target.id !== live.periods?.find(period => period.horizon === 'year')?.id
    ? currentPeriod(live.calendar, 'half', target.startAt) : live.periods?.find(period => period.horizon === 'half')
  const today = Temporal.PlainDate.from(live.today)
  const friday = today.add({ days: (5 - today.dayOfWeek + 7) % 7 }).toString()
  const drafts: EditableDraft[] = t.demoItems.map((title, index) => ({
    id: `onboarding-${index}`, source: null, title, description: '', horizon: index === 0 ? 'month' : index === 1 ? 'day' : 'week',
    horizonSuggestion: null, horizonInferred: false, future: false, due: index === 2 ? friday : null, dueSuggestion: null,
    parents: index ? [{ kind: 'draft', draftId: 'onboarding-0' }] : [], parentSuggestions: [], flowColor: null,
    manual: [], roleCertain: true, orphan: false, periods: null,
  }))
  return <>
    <figure className="modal palette composer-modal preview-composer" data-visible={camera === 'smart'} aria-label={t.demoFigure}>
      <div inert aria-hidden="true"><header className="modal-header"><div className="palette-search composer-search"><Icon name="add" size={18} /><textarea className="composer-input flex-1 min-w-0 w-auto min-h-6 max-h-42 p-0 text-[15px] leading-[24px] text-foreground" aria-label={t.inputLabel} rows={2} value={t.onboardingDemoInput} readOnly /></div><IconButton aria-label={t.discard}><Icon name="delete" size={16} /></IconButton><IconButton aria-label={messages.close}><Icon name="close" size={18} /></IconButton></header>
      <div className="composer-body flex flex-col gap-1.5"><section className="composer-cand flex flex-col gap-2.5 pt-3 pr-3 pb-2.5 pl-3.5 rounded-[10px]" data-tone="jev">
        <div className="cand-line flex items-start gap-2.5 min-h-7.5 text-[14px] leading-[22px]"><JevBadge /><div className="cand-text flex-1 min-w-0 pt-1"><Plan drafts={drafts} parents={new Map()} /></div><Submit count={3} /></div>
        <div className="cand-hints flex flex-wrap items-center gap-y-1.5 gap-x-3.5 text-[12px] text-muted-foreground"><span className="composer-hint inline-flex items-center gap-[5px]"><kbd className="keycap">Tab</kbd>{t.adjust}</span><span className="composer-hint inline-flex items-center gap-[5px]"><kbd className="keycap">⌥↵</kbd>{t.keepAsLater}</span></div>
      </section></div></div>
    </figure>
    <figure className="modal palette composer-modal seeded-composer preview-composer preview-seeded" data-visible={camera === 'insight'} aria-label={t.onboardingInsightFigure}>
      <div inert aria-hidden="true"><header className="modal-header"><div className="palette-search composer-search"><Icon name="add" size={18} /><span className="composer-input flex-1 min-w-0 text-[15px] leading-[24px] text-soft">{insight.emptyDraft.half}</span></div><IconButton aria-label={messages.close}><Icon name="close" size={18} /></IconButton></header>
      <div className="composer-body flex flex-col gap-1.5"><div className="seed-chips flex flex-wrap gap-1.5 pt-0 pr-2 pb-0.5 pl-9"><span className="seed-chip inline-flex items-center h-6 max-w-80 px-2 rounded-[6px] bg-hover text-[12px] text-soft">{half && periodLabel('half', half, live.calendar, live.today, true)}</span></div>
        <section className="composer-cand flex flex-col gap-2.5 pt-3 pr-3 pb-2.5 pl-3.5 rounded-[10px]" data-tone="jev"><div className="seed-list flex flex-col gap-0.5"><div className="seed-row flex items-center gap-2.5 min-h-8.5" data-on="true"><input type="checkbox" checked readOnly /><input className="seed-title flex-1 min-w-0 h-7.5 px-2 rounded-[6px] text-[14px] text-foreground" value={t.onboardingDemoStage} readOnly /></div></div><div className="cand-hints flex flex-wrap items-center gap-y-1.5 gap-x-3.5 text-[12px] text-muted-foreground"><span>{insight.seedBatchHint}</span><span className="column-spacer" /><Submit count={1} /></div></section>
      </div></div>
    </figure>
  </>
}
