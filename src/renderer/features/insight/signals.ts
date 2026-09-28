/**
 * [INPUT]: Current snapshot items/relations/periods, flow membership, visible columns and their period modes.
 * [OUTPUT]: breakpoints (gaps and skips of one filtered flow), emptyColumns (current columns with no items under a non-empty previous column), draftTarget (current or next period for a new child), boardDigest / periodText (the bounded Chinese text context sent to the model).
 * [POS]: features/insight 的纯信号计算；与 domain/relations 的周期规则一致，不做网络与写入。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { currentPeriod, workspaceDate } from '../../../domain/calendar'
import type { CalendarConfig, ItemHorizon, ItemSummary, PlanningPeriod } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import type { InsightBoard } from '../../../shared/contracts/smart-input'
import type { Flows } from '../../state/flows'
import { addDays } from '../../lib/dates'

export type Planned = 'cycle' | 'month' | 'week' | 'day'
export type ChildHorizon = 'month' | 'week' | 'day'
const chain: Planned[] = ['cycle', 'month', 'week', 'day']
export const shorter = (horizon: ItemHorizon): ChildHorizon | null => (chain[chain.indexOf(horizon as Planned) + 1] ?? null) as ChildHorizon | null

export interface Gap { parent: ItemSummary; target: ChildHorizon }
export interface Skip { parent: ItemSummary; children: ItemSummary[] }
export interface Breakpoints { gaps: Gap[]; skips: Skip[] }

type Mode = (horizon: ItemHorizon) => 'current' | 'future' | 'history'
const live = (item: ItemSummary) => item.status !== 'cancelled' && !item.archivedAt && !item.deletedAt
const open = (item: ItemSummary) => item.status === 'todo' && !item.archivedAt && !item.deletedAt

function currentIds(snapshot: Snapshot): Map<string, string> {
  return new Map(snapshot.periods.map(period => [period.horizon, period.id]))
}
function inCurrent(item: ItemSummary, current: Map<string, string>): boolean {
  return item.placement.horizon !== 'later' && item.placement.periodId === current.get(item.placement.horizon)
}

// --- A gap asks only for the nearest missing level: a month plan without week children, never also a day node for it. ---
export function breakpoints(snapshot: Snapshot, flows: Flows, flowId: string, columns: ItemHorizon[], mode: Mode): Breakpoints {
  const current = currentIds(snapshot)
  const byId = new Map(snapshot.items.map(item => [item.id, item]))
  const member = (item: ItemSummary) => flows.of(item.id).some(flow => flow.id === flowId)
  const shown = (horizon: ItemHorizon) => columns.includes(horizon) && mode(horizon) === 'current'
  const children = new Map<string, ItemSummary[]>()
  for (const edge of snapshot.relations) {
    const child = byId.get(edge.childId)
    if (child && live(child) && inCurrent(child, current)) children.set(edge.parentId, [...children.get(edge.parentId) ?? [], child])
  }
  // An empty target column shows its own card instead of one ＋ per parent.
  const filled = new Set(snapshot.items.filter(item => live(item) && inCurrent(item, current)).map(item => item.placement.horizon))
  const gaps: Gap[] = [], skips: Skip[] = []
  for (const parent of snapshot.items) {
    if (!open(parent) || !inCurrent(parent, current) || !member(parent) || !shown(parent.placement.horizon)) continue
    const target = shorter(parent.placement.horizon)
    if (!target) continue
    const kids = children.get(parent.id) ?? []
    if (!kids.length && shown(target) && filled.has(target)) gaps.push({ parent, target })
    if (parent.placement.horizon === 'month' && shown('week') && shown('day')) {
      const skipped = kids.filter(child => child.placement.horizon === 'day' && open(child) && member(child))
      if (skipped.length) skips.push({ parent, children: skipped.slice(0, 8) })
    }
  }
  return { gaps, skips }
}

// An empty current column under a previous column that still has open, current work.
export function emptyColumns(snapshot: Snapshot, columns: ItemHorizon[], mode: Mode): Map<ChildHorizon, ItemSummary[]> {
  const current = currentIds(snapshot)
  const result = new Map<ChildHorizon, ItemSummary[]>()
  for (const horizon of ['month', 'week', 'day'] as const) {
    if (!columns.includes(horizon) || mode(horizon) !== 'current') continue
    if (snapshot.items.some(item => item.placement.horizon === horizon && inCurrent(item, current) && live(item))) continue
    const above = chain[chain.indexOf(horizon) - 1]!
    const sources = snapshot.items.filter(item => item.placement.horizon === above && inCurrent(item, current) && open(item))
    if (sources.length) result.set(horizon, sources.slice(0, 8))
  }
  return result
}

// On the last day of a week/month a new child goes to the next period; a day target is always today.
export function draftTarget(snapshot: Snapshot, horizon: ChildHorizon): { period: PlanningPeriod; next: boolean } {
  const calendar = snapshot.workspace.calendar!
  const current = snapshot.periods.find(period => period.horizon === horizon) ?? currentPeriod(calendar, horizon, snapshot.observedAt)
  const today = workspaceDate(calendar.timezone, snapshot.observedAt)
  if (horizon !== 'day' && addDays(current.endDate, -1) === today) return { period: currentPeriod(calendar, horizon, current.endAt), next: true }
  return { period: current, next: false }
}

// --- Model context: Chinese labels by design (prompts are Chinese-only); bounded lists, titles only. ---
const names: Record<Planned, string> = { cycle: '3个月', month: '本月', week: '本周', day: '今天' }
const nextNames: Record<Planned, string> = { cycle: '下个3个月', month: '下月', week: '下周', day: '明天' }
export function periodText(period: PlanningPeriod, next: boolean): string {
  const horizon = period.horizon as Planned
  const range = period.startDate === addDays(period.endDate, -1) ? period.startDate : `${period.startDate} 至 ${addDays(period.endDate, -1)}`
  return `${next ? nextNames[horizon] : names[horizon]}（${range}）`
}
export function boardDigest(snapshot: Snapshot, flows: Flows, calendar: CalendarConfig = snapshot.workspace.calendar!): InsightBoard {
  const current = currentIds(snapshot)
  const openNow = snapshot.items.filter(item => open(item) && inCurrent(item, current))
  const titles = (rows: ItemSummary[], horizon: ItemHorizon) => rows.filter(item => item.placement.horizon === horizon).slice(0, 24).map(item => item.title)
  const goals = flows.all.filter(flow => !flow.archived).slice(0, 12).map(flow => {
    const rows = openNow.filter(item => item.id !== flow.id && flows.of(item.id).some(value => value.id === flow.id))
    return { title: flow.title, month: titles(rows, 'month'), week: titles(rows, 'week'), day: titles(rows, 'day') }
  })
  const loose = openNow.filter(item => flows.of(item.id).length === 0)
  const periods = Object.fromEntries(snapshot.periods.map(period => [period.horizon, periodText(period, false)]))
  return { today: workspaceDate(calendar.timezone, snapshot.observedAt), periods, goals, unlinked: { month: titles(loose, 'month'), week: titles(loose, 'week'), day: titles(loose, 'day') } }
}
