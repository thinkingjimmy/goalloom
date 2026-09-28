/**
 * [INPUT]: Authoritative placements, active relations, guarded moves and the transaction clock.
 * [OUTPUT]: Group-checked neighbors and one reversible materialization of every editable parent-ordered period.
 * [POS]: Ordering command boundary; sequential position effects keep reverse replay safe and atomic.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { buildParentOrder, parentOrderedHorizon } from '../../../domain/parent-order'
import { DomainError } from '../../../shared/contracts/commands'
import type { Item, ItemHorizon, PlanningPeriod } from '../../../shared/contracts/entities'
import { serverText } from '../../../shared/i18n/server'
import { nextSortKey, type Context } from '../context'
import { orderNodes } from '../ordering'

export function assertParentOrderTarget(context: Context, item: Item, horizon: ItemHorizon, period: PlanningPeriod | null, beforeId: string | null): void {
  if (!parentOrderedHorizon(horizon) || !period || !beforeId) return
  const rows = context.store.summaries("i.deletedAt IS NULL AND i.archivedAt IS NULL AND p.horizon=? AND p.periodId=? AND i.status=?", [horizon, period.id, item.status])
  const nodes = orderNodes(context.store, [...rows.map(row => row.id), item.id])
  const moved = nodes.find(node => node.id === item.id)!
  Object.assign(moved, { horizon, periodId: period.id, periodStart: period.startDate, periodEnd: period.endAt })
  const order = buildParentOrder(nodes, context.store.relations(), context.now)
  if (!rows.some(row => row.id === beforeId && order.group(row.id) === order.group(item.id))) throw new DomainError('conflict', serverText().errors.sortTargetGone)
}

export function materializeParentOrder(context: Context): boolean {
  // Archived/cancelled ancestors still define downstream groups; persist their order too, without changing lifecycle state.
  const items = context.store.summaries(`i.deletedAt IS NULL
    AND p.horizon IN ('month','week','day') AND p.periodId IN (SELECT id FROM planning_periods WHERE julianday(endAt)>julianday(?))`, [context.now])
  const order = buildParentOrder(orderNodes(context.store, items.map(item => item.id)), context.store.relations(), context.now)
  const buckets = new Map<string, typeof items>()
  for (const item of items) {
    const key = item.placement.periodId!, bucket = buckets.get(key) ?? []
    bucket.push(item); buckets.set(key, bucket)
  }
  for (const bucket of buckets.values()) {
    const members = new Map(bucket.map(item => [item.id, item]))
    const full = order.sort(bucket).map(item => item.id)
    for (let position = full.length - 1; position >= 0; position--) {
      const item = members.get(full[position]!)
      if (!item) continue
      const beforeId = full[position + 1] ?? null
      item.placement = context.store.prepare('SELECT * FROM item_placements WHERE itemId=?').get(item.id) as unknown as Item['placement']
      const before = context.store.position(item)
      if (before.nextId === beforeId) continue
      const key = nextSortKey(context, item.placement.horizon, item.placement.periodId, beforeId, item.id)
      // Gap normalization may have changed this placement's version.
      const current = context.store.prepare('SELECT * FROM item_placements WHERE itemId=?').get(item.id) as unknown as Item['placement']
      item.placement = { ...current, sortKey: key, version: current.version + 1 }
      context.store.savePlacement(item.placement, current.version)
      context.store.prepare('UPDATE items SET version=version+1 WHERE id=?').run(item.id)
      context.effects.push({ kind: 'position', itemId: item.id, before, after: context.store.position(item) })
    }
  }
  context.label = serverText().labels.sort
  return context.effects.length > 0
}
