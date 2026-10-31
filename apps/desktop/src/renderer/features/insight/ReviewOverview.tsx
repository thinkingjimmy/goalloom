/**
 * [INPUT]: Historical summaries, flow topology, selected periods, shared outline ordering and saved-link rendering.
 * [OUTPUT]: Summary-first brief, board-ordered monthly outlines with placement-local subtask indentation, original state/flow markers and a noninteractive goal matrix.
 * [POS]: Read-only review presentation; no historical versions are submitted as commands.
 */
import type { ReviewContext } from '../../../shared/contracts/queries'
import type { ItemSummary } from '../../../shared/contracts/entities'
import { outlineRows, localNestingParentId } from '../../../domain/nesting'
import { periodHorizons } from '../../../shared/contracts/values'
import { horizonNames, insightMessages as t } from '../../i18n'
import { useFlows } from '../../state/flows'
import { periodDates } from '../../lib/periods'
import { flowStroke, flowVars } from '../../lib/colors'
import { Icon } from '../../components/icons'
import { LinkText } from '../../components/links/LinkText'
import { goalRows, type ReviewDue } from './review'
import { ReviewSummary } from './ReviewSummary'

export function ReviewOverview({ due, context, ready }: { due: ReviewDue; context: ReviewContext; ready: boolean }) {
  const { board, unknown } = context
  const flows = useFlows(board, board.items), goals = goalRows(board, flows)
  const targets = [due.month, due.week].flatMap(target => target ? [target.period.id] : [])
  const records = board.items.filter(item => targets.includes(item.placement.periodId!))
  const completed = records.filter(item => item.status === 'done').length
  const related = goals.filter(goal => records.some(item => flows.of(item.id).some(flow => flow.id === goal.id))).length
  const byId = new Map([...(board.nestingParents ?? []), ...board.items].map(item => [item.id, item]))
  const list = (items: ItemSummary[]) => <ul className="review-records m-0 pt-0 pr-0 pb-3 pl-6 list-none">{outlineRows(items, undefined, [...board.items, ...(board.nestingParents ?? [])]).map(item => <li key={item.id} data-item-id={item.id} data-nested={!!localNestingParentId(item, byId)} data-status={item.status}>
    <span className="check review-todo-check" aria-hidden="true" data-checked={item.status === 'done'} style={item.status === 'done' ? undefined : flowVars(flows.colorsOf(item.id))}>{item.status === 'done' && <Icon name="check" size={12} strokeWidth={2.5} />}</span>
    <span className="review-item-title min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap"><LinkText text={item.title} /></span><small>{item.status === 'done' ? t.reviewDoneCount : t.reviewOpenCount}</small>
  </li>)}</ul>
  const monthRecords = records.filter(item => item.placement.horizon === 'month')
  const loose = monthRecords.filter(item => !flows.of(item.id).length)
  const cycle = board.periods.find(period => period.horizon === 'cycle')
  return <>
    <section className="review-progress pb-[23px] mb-6" aria-label={t.reviewProgress}>
      <ReviewSummary due={due} snapshot={board} flows={flows} ready={ready} />
      <dl className="review-metrics flex items-baseline flex-wrap gap-y-2 gap-x-5.5 mt-[17px] mr-0 mb-0 ml-0 leading-[1.6]">
        {[[completed, t.reviewDoneCount], [records.length - completed, t.reviewOpenCount], [related, t.reviewGoalCount]].map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {!!unknown && <p className="review-note m-0 text-[12px] leading-[1.8] text-muted-foreground" role="status">{t.reviewUnknown(unknown)}</p>}
    </section>
    {due.month && <section className="review-section flex flex-col gap-3">
      <h3>{cycle ? t.goals(periodDates(cycle)) : t.reviewRecords(periodDates(due.month.period))}</h3>
      {goals.map(goal => {
        const items = monthRecords.filter(item => flows.of(item.id).some(flow => flow.id === goal.id))
        return <details key={goal.id} className="review-goal-records">
          <summary><span className="review-mark w-3 h-3 rounded-[3px] shrink-0" style={{ borderColor: flowStroke(goal.flowColor) }} /><span className="review-goal-title flex-1 min-w-0 text-[14px] leading-[1.5] text-left [overflow-wrap:anywhere]"><LinkText text={goal.title} /><small>{items.length ? t.reviewGoalStats(items.filter(item => item.status === 'done').length, items.length) : t.reviewGoalEmpty}</small></span><Icon name="next" size={14} /></summary>
          {list(items)}
        </details>
      })}
      {!!loose.length && <details className="review-goal-records"><summary><span className="review-goal-title flex-1 min-w-0 text-[14px] leading-[1.5] text-left [overflow-wrap:anywhere]">{t.reviewUnlinked}<small>{t.reviewGoalStats(loose.filter(item => item.status === 'done').length, loose.length)}</small></span><Icon name="next" size={14} /></summary>{list(loose)}</details>}
      <p className="review-note m-0 text-[12px] leading-[1.8] text-muted-foreground">{t.reviewIndependent}</p>
    </section>}
    {due.week && <section className="review-section flex flex-col gap-3"><h3>{t.matrix}</h3>
      <div className="review-matrix flex flex-col gap-1.5" role="table">
        <div role="row"><span role="columnheader" />{(periodHorizons).map(horizon => <span key={horizon} role="columnheader">{horizonNames[horizon]}</span>)}</div>
        {goals.map(goal => <div key={goal.id} role="row">
          <div role="rowheader" className="review-goal-title flex-1 min-w-0 text-[14px] leading-[1.5] text-left [overflow-wrap:anywhere]"><span className="review-mark w-3 h-3 rounded-[3px] shrink-0" style={{ borderColor: flowStroke(goal.flowColor) }} /><span className="review-item-title min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap"><LinkText text={goal.title} /></span></div>
          {(periodHorizons).map(horizon => <span key={horizon} role="cell" className="review-matrix-cell h-7 flex items-center justify-center rounded-[6px] bg-hover text-[13px] font-medium tabular-nums" data-empty={!goal.counts[horizon]} data-skip={horizon === 'week' && goal.skip}>{goal.counts[horizon] || t.matrixEmpty}</span>)}
        </div>)}
      </div>
      <ul className="review-matrix-legend mt-1 mr-0 mb-0 ml-0 p-0 list-none flex flex-wrap gap-y-2 gap-x-4.5 text-[12px] leading-[1.6] text-muted-foreground">
        <li><span className="review-matrix-cell h-7 flex items-center justify-center rounded-[6px] bg-hover text-[13px] font-medium tabular-nums" data-empty="true" aria-hidden="true">{t.matrixEmpty}</span><span>{t.matrixLegendEmpty}</span></li>
        <li><span className="review-matrix-cell h-7 flex items-center justify-center rounded-[6px] bg-hover text-[13px] font-medium tabular-nums" data-skip="true" aria-hidden="true" /><span>{t.matrixLegendSkip}</span></li>
      </ul>
    </section>}
  </>
}
