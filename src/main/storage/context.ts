/**
 * [INPUT]: 权威事务快照、命令、注入观察时刻和 Store。
 * [OUTPUT]: 命令共享上下文、当前周期与有限顺序重排工具。
 * [POS]: 存储命令库的公共原语；不在此打开嵌套事务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { currentPeriod } from '../../domain/calendar'
import { DomainError, type Command } from '../../shared/contracts/commands'
import type { Effect } from '../../shared/contracts/effects'
import type { Item, ItemHorizon, PlanningPeriod, Workspace } from '../../shared/contracts/entities'
import type { Store } from './store'

export interface Context {
  store: Store; workspace: Workspace; command: Pick<Command, 'operationId' | 'generation'>; now: string;
  effects: Effect[]; warnings: string[]; itemId: string | null; label: string
  restoreSource?: string; outcome?: 'conflict_skipped'; undone?: { originalId: string; index: number }[]
}
export function assertAvailable(item: Item): void { if (item.deletedAt !== null) throw new DomainError('conflict', '条目已在回收站中') }
export function targetPeriod(context: Context, horizon: ItemHorizon): PlanningPeriod | null {
  if (horizon === 'later') return null
  if (!context.workspace.calendar) throw new DomainError('setup', '请先确认工作区配置')
  const period = currentPeriod(context.workspace.calendar, horizon, context.now)
  context.store.ensurePeriod(period)
  return period
}
export function touch(context: Context, item: Item): void {
  const previousVersion = item.version
  item.version++
  item.updatedAt = context.now
  context.store.saveItem(item, previousVersion)
}
export function nextSortKey(context: Context, horizon: ItemHorizon, periodId: string | null, beforeId: string | null, excludedId?: string): number {
  const order = context.store.order(horizon, periodId).filter(item => item.id !== excludedId)
  const index = beforeId === null ? order.length : order.findIndex(item => item.id === beforeId)
  if (index < 0) throw new DomainError('conflict', '排序目标已不在该列')
  const calculate = (): number => {
    const previous = order[index - 1]?.placement.sortKey
    const next = order[index]?.placement.sortKey
    return previous === undefined ? (next ?? 1024) - 1024 : next === undefined ? previous + 1024 : previous + (next - previous) / 2
  }
  let key = calculate()
  if (!Number.isFinite(key) || Math.abs(key) > 1e15 || key === order[index - 1]?.placement.sortKey || key === order[index]?.placement.sortKey) {
    order.forEach((item, index) => {
      const previous = item.placement.version
      item.placement.sortKey = (index + 1) * 1024
      item.placement.version++
      context.store.savePlacement(item.placement, previous)
    })
    key = calculate()
  }
  return key
}
