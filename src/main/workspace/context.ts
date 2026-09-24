/**
 * [INPUT]: Authoritative workspace, command, injected observation time and Store.
 * [OUTPUT]: Shared period, color and indexed ordering primitives; lightweight rebalancing only when needed.
 * [POS]: Command context with transaction-local calculations and rollback-safe period insertion.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { currentPeriod } from '../../domain/calendar'
import { DomainError, type Command } from '../../shared/contracts/commands'
import type { Effect } from '../../shared/contracts/effects'
import type { Item, ItemHorizon, PlanningPeriod, Workspace } from '../../shared/contracts/entities'
import type { Store } from '../storage/store'
import { serverText } from '../../shared/i18n/server'

export interface Context {
  store: Store; workspace: Workspace; command: Pick<Command, 'operationId' | 'generation'>; now: string;
  effects: Effect[]; warnings: string[]; itemId: string | null; label: string; itemIds?: string[]
  periods?: Map<ItemHorizon, PlanningPeriod | null>
  restoreSource?: string; outcome?: 'conflict_skipped'; undone?: { originalId: string; index: number }[]
}
export function assertAvailable(item: Item): void { if (item.deletedAt !== null) throw new DomainError('conflict', serverText().errors.inTrash) }
export function hasActiveParent(context: Context, itemId: string): boolean {
  return !!context.store.db.prepare('SELECT 1 FROM item_relations WHERE childId=? AND invalidatedAt IS NULL LIMIT 1').get(itemId)
}
export function flowColorOwner(context: Context, color: number, exceptId: string | null): string | null {
  const row = context.store.db.prepare('SELECT title FROM items WHERE flowColor=? AND deletedAt IS NULL AND id IS NOT ? LIMIT 1').get(color, exceptId)
  return row ? String(row.title) : null
}
export function assertFlowColorFree(context: Context, color: number, exceptId: string | null): void {
  const owner = flowColorOwner(context, color, exceptId)
  if (owner !== null) throw new DomainError('conflict', serverText().errors.colorTaken(owner))
}
export function targetPeriod(context: Context, horizon: ItemHorizon): PlanningPeriod | null {
  if (horizon === 'later') return null
  if (!context.workspace.calendar) throw new DomainError('setup', serverText().errors.setupRequired)
  const period = context.periods?.get(horizon) ?? currentPeriod(context.workspace.calendar, horizon, context.now)
  // Cache only the calculation: a previous SAVEPOINT may have rolled back the insertion.
  context.store.ensurePeriod(period)
  context.periods ??= new Map(); context.periods.set(horizon, period)
  return period
}
export function touch(context: Context, item: Item): void {
  const previousVersion = item.version
  item.version++
  item.updatedAt = context.now
  context.store.saveItem(item, previousVersion)
}
export function nextSortKey(context: Context, horizon: ItemHorizon, periodId: string | null, beforeId: string | null, excludedId?: string): number {
  let neighbors = context.store.insertion(horizon, periodId, beforeId, excludedId ?? null)
  const calculate = (): number => {
    const previous = neighbors.previous?.sortKey, next = neighbors.next?.sortKey
    return previous === undefined ? (next ?? 1024) - 1024 : next === undefined ? previous + 1024 : previous + (next - previous) / 2
  }
  let key = calculate()
  if (!Number.isFinite(key) || Math.abs(key) > 1e15 || key === neighbors.previous?.sortKey || key === neighbors.next?.sortKey) {
    // Only exhausted gaps need a complete order. Exclude the moving row, preserving all other membership rules.
    context.store.order(horizon, periodId).filter(item => item.id !== excludedId).forEach((item, index) => {
      const previous = item.placement.version
      item.placement.sortKey = (index + 1) * 1024; item.placement.version++
      context.store.savePlacement(item.placement, previous)
    })
    neighbors = context.store.insertion(horizon, periodId, beforeId, excludedId ?? null)
    key = calculate()
  }
  return key
}
