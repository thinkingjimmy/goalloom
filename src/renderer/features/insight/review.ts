/**
 * [INPUT]: Current or review-scoped snapshots (periods, items, relations, observedAt), flows and the device's reviewed/skipped period keys.
 * [OUTPUT]: reviewDue (which week/month review is open today — last day of the period or, if not yet done, the first day after — merged when both end together),
 *           reviewSignals (code-computed gap/skip/pace facts for the model), goalRows (flow × column counts) and planCandidates (parents needing a next-period step).
 * [POS]: features/insight 的复盘纯规则；不写入、不联网，入口显示与抽屉步骤都从这里取数。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { currentPeriod, precedingPeriod, workspaceDate } from '../../../domain/calendar'
import type { ItemSummary, PlanningPeriod } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import type { InsightBoard, InsightSignal } from '../../../shared/contracts/smart-input'
import type { Flows } from '../../state/flows'
import { mapPeriodHorizons, periodHorizons } from '../../../shared/contracts/values'
import { addDays } from '../../lib/dates'
import { breakpoints, type ChildHorizon, type Planned } from './signals'

export type ReviewHorizon = 'week' | 'month'
export interface ReviewTarget { horizon: ReviewHorizon; period: PlanningPeriod; next: PlanningPeriod; key: string; lastDay: boolean }
export interface ReviewDue { scope: 'week' | 'month' | 'both'; week: ReviewTarget | null; month: ReviewTarget | null }

export const reviewKey = (period: PlanningPeriod) => `${period.horizon}:${period.startDate}`

// Open on the period's last day; on the next period's first day only if that review was neither done nor skipped (so at most two days).
export function reviewTarget(snapshot: Snapshot, horizon: ReviewHorizon, reviewed: string[]): ReviewTarget | null {
  const calendar = snapshot.workspace.calendar
  const current = snapshot.periods.find(period => period.horizon === horizon)
  if (!calendar || !current) return null
  const today = workspaceDate(calendar.timezone, snapshot.observedAt)
  if (addDays(current.endDate, -1) === today) {
    const key = reviewKey(current)
    return reviewed.includes(key) ? null : { horizon, period: current, next: currentPeriod(calendar, horizon, current.endAt), key, lastDay: true }
  }
  if (current.startDate === today) {
    const previous = precedingPeriod(calendar, current)
    if (!previous || reviewed.includes(reviewKey(previous))) return null
    return { horizon, period: previous, next: current, key: reviewKey(previous), lastDay: false }
  }
  return null
}
export function reviewDue(snapshot: Snapshot, reviewed: string[]): ReviewDue | null {
  const week = reviewTarget(snapshot, 'week', reviewed), month = reviewTarget(snapshot, 'month', reviewed)
  // Only one entry when both end together; it lives on the month header.
  if (week && month && week.lastDay === month.lastDay) return { scope: 'both', week, month }
  if (month) return { scope: 'month', week: null, month }
  if (week) return { scope: 'week', week, month: null }
  return null
}

const open = (item: ItemSummary) => item.status === 'todo' && !item.archivedAt && !item.deletedAt
const inPeriod = (item: ItemSummary, period: PlanningPeriod) => item.placement.horizon === period.horizon && item.placement.periodId === period.id

export interface GoalRow { id: string; title: string; flowColor: number; counts: Record<Planned, number>; done: Record<Planned, number>; skip: boolean }
export function goalRows(snapshot: Snapshot, flows: Flows): GoalRow[] {
  const current = new Map(snapshot.periods.map(period => [period.horizon, period.id]))
  return flows.all.filter(flow => !flow.archived).map(flow => {
    const counts = mapPeriodHorizons(() => 0), done = mapPeriodHorizons(() => 0)
    for (const item of snapshot.items) {
      const horizon = item.placement.horizon
      if (horizon === 'later' || item.placement.periodId !== current.get(horizon) || item.deletedAt || item.archivedAt || item.status === 'cancelled') continue
      if (!flows.of(item.id).some(value => value.id === flow.id)) continue
      counts[horizon]++
      if (item.status === 'done') done[horizon]++
    }
    const skip = breakpoints(snapshot, flows, [flow.id], [...periodHorizons], () => 'current').skips.length > 0
    return { id: flow.id, title: flow.title, flowColor: flow.flowColor, counts, done, skip }
  })
}

export function reviewSignals(snapshot: Snapshot, flows: Flows, due: ReviewDue): InsightSignal[] {
  const signals: InsightSignal[] = []
  const names = Object.fromEntries(snapshot.periods.map(period => [period.horizon, `${period.startDate} 至 ${addDays(period.endDate, -1)}`]))
  for (const flow of flows.all.filter(value => !value.archived).slice(0, 12)) {
    const found = breakpoints(snapshot, flows, [flow.id], [...periodHorizons], () => 'current')
    const byLevel = new Map<ChildHorizon, string[]>()
    for (const gap of found.gaps) byLevel.set(gap.target, [...byLevel.get(gap.target) ?? [], gap.parent.title])
    for (const [target, titles] of byLevel) signals.push({ kind: 'gap', goal: flow.title, detail: `${titles.slice(0, 3).join('、')}${titles.length > 3 ? ` 等 ${titles.length} 项` : ''}在${names[target]}没有下级` })
    const members = snapshot.items.filter(item => flows.of(item.id).some(value => value.id === flow.id) && item.id !== flow.id)
    if (!members.some(item => item.placement.horizon !== 'later')) signals.push({ kind: 'gap', goal: flow.title, detail: '复盘范围内没有它的条目' })
    for (const skip of found.skips) signals.push({ kind: 'skip', goal: flow.title, detail: `${names.day} 的 ${skip.children.length} 项直接挂在月计划「${skip.parent.title}」下，跳过 ${names.week}` })
  }
  for (const target of [due.week, due.month]) {
    if (!target) continue
    const left = snapshot.items.filter(item => open(item) && inPeriod(item, target.period))
    if (left.length) signals.push({ kind: 'pace', goal: names[target.horizon]!, detail: `${target.lastDay ? '今天结束' : '已结束'}，还有 ${left.length} 项未完成` })
  }
  return signals.slice(0, 16)
}

// The caller supplies the exact destination periods; children in other periods never cover this plan.
export function planCandidates(snapshot: Snapshot, horizon: ReviewHorizon): ItemSummary[] {
  const parentHorizon = horizon === 'week' ? 'month' : 'cycle'
  const parentPeriod = snapshot.periods.find(period => period.horizon === parentHorizon)
  const byId = new Map(snapshot.items.map(item => [item.id, item]))
  const covered = (id: string) => snapshot.relations.some(edge => {
    if (edge.parentId !== id) return false
    const child = byId.get(edge.childId)
    return !!child && !child.archivedAt && !child.deletedAt && child.status !== 'cancelled' && child.placement.periodId === snapshot.periods.find(period => period.horizon === horizon)?.id
  })
  return snapshot.items.filter(item => open(item) && !!parentPeriod && inPeriod(item, parentPeriod) && !covered(item.id)).slice(0, 8)
}
export const reviewedOpen = (snapshot: Snapshot, period: PlanningPeriod) => snapshot.items.filter(item => open(item) && inPeriod(item, period))

export function reviewDigest(snapshot: Snapshot, flows: Flows): InsightBoard {
  const rows = snapshot.items
  const titles = (items: ItemSummary[], horizon: Planned) => items.filter(item => item.placement.horizon === horizon).slice(0, 24)
    .map(item => `［${item.status === 'done' ? '已完成' : '未完成'}］${item.title}`)
  const goals = goalRows(snapshot, flows).slice(0, 12).map(goal => {
    const members = rows.filter(item => item.id !== goal.id && flows.of(item.id).some(flow => flow.id === goal.id))
    return { title: goal.title, half: titles(members, 'half'), cycle: titles(members, 'cycle'), month: titles(members, 'month'), week: titles(members, 'week'), day: titles(members, 'day') }
  })
  const loose = rows.filter(item => flows.of(item.id).length === 0)
  return { today: workspaceDate(snapshot.workspace.calendar!.timezone, snapshot.observedAt),
    periods: Object.fromEntries(snapshot.periods.map(period => [period.horizon, `${period.startDate} 至 ${addDays(period.endDate, -1)}`])),
    goals, unlinked: { half: titles(loose, 'half'), cycle: titles(loose, 'cycle'), month: titles(loose, 'month'), week: titles(loose, 'week'), day: titles(loose, 'day') } }
}
