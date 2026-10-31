/**
 * [INPUT]: Authoritative workspace, command, injected observation time and Store.
 * [OUTPUT]: Validated current/explicit periods, ancestor-based flow membership, color and gap-safe placement-local ordering primitives.
 * [POS]: Command context with transaction-local calculations and rollback-safe period insertion.
 */
import { flowIndex } from '../../domain/flows'
import { SORT_KEY_STEP, sortKeyBetween } from '@goalloom/store-core'
import { combinedTopology } from '../../domain/nesting'
import { currentPeriod } from '../../domain/calendar'
import { DomainError, type Command, type CreatePeriodTarget } from '../../shared/contracts/commands'
import { readPlanningPeriod } from './periods'
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
  return !!context.store.item(itemId).placement.nestingParentId || !!context.store.db.prepare('SELECT 1 FROM item_relations WHERE childId=? AND invalidatedAt IS NULL LIMIT 1').get(itemId)
}
export function hasFlow(context: Context, itemId: string): boolean {
  const roots = context.store.prepare('SELECT id FROM items WHERE flowColor IS NOT NULL AND deletedAt IS NULL').all().map(row => String(row.id))
  return flowIndex(combinedTopology(context.store.relations(), context.store.nestingLinks()), roots)(itemId).length > 0
}
export function flowColorOwner(context: Context, color: number, exceptId: string | null): string | null {
  const row = context.store.db.prepare('SELECT title FROM items WHERE flowColor=? AND deletedAt IS NULL AND id IS NOT ? LIMIT 1').get(color, exceptId)
  return row ? String(row.title) : null
}
export function assertFlowColorFree(context: Context, color: number, exceptId: string | null): void {
  const owner = flowColorOwner(context, color, exceptId)
  if (owner !== null) throw new DomainError('conflict', serverText().errors.colorTaken(owner))
}
export function targetPeriod(context: Context, horizon: ItemHorizon, target?: CreatePeriodTarget): PlanningPeriod | null {
  if (horizon === 'later') {
    if (target?.kind === 'date') throw new DomainError('invalid', serverText().errors.invalidPlanningPeriod)
    return null
  }
  if (!context.workspace.calendar) throw new DomainError('setup', serverText().errors.setupRequired)
  const period = target?.kind === 'date' ? readPlanningPeriod(context.store, horizon, target.startDate, context.now)
    : context.periods?.get(horizon) ?? currentPeriod(context.workspace.calendar, horizon, context.now)
  // Cache only the calculation: a previous SAVEPOINT may have rolled back the insertion.
  context.store.ensurePeriod(period)
  if (target?.kind !== 'date') { context.periods ??= new Map(); context.periods.set(horizon, period) }
  return period
}
export function touch(context: Context, item: Item): void {
  const previousVersion = item.version
  item.version++
  item.updatedAt = context.now
  context.store.saveItem(item, previousVersion)
}
export function nextSortKey(context: Context, horizon: ItemHorizon, periodId: string | null, beforeId: string | null, excludedId?: string, nestingParentId: string | null = null): number {
  let neighbors = context.store.insertion(horizon, periodId, beforeId, excludedId ?? null, nestingParentId)
  const calculate = () => sortKeyBetween(neighbors.previous?.sortKey, neighbors.next?.sortKey)
  let key = calculate()
  if (key === null) {
    const localParentId = context.store.localParentId({ horizon, periodId, nestingParentId })
    // Normalization belongs to one sibling scope and does not change semantic order or receipts.
    context.store.order(horizon, periodId).filter(item => item.id !== excludedId && context.store.localParentId(item.placement) === localParentId).forEach((item, index) => {
      const previous = item.placement.version
      item.placement.sortKey = (index + 1) * SORT_KEY_STEP; item.placement.version++
      context.store.savePlacement(item.placement, previous)
    })
    neighbors = context.store.insertion(horizon, periodId, beforeId, excludedId ?? null, nestingParentId)
    key = calculate()
  }
  return key!
}
