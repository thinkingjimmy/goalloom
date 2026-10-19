/**
 * [INPUT]: Authoritative placements/effective parents, explicit column/period and the transaction clock.
 * [OUTPUT]: Local placement of one root and atomic, reversible arrangement of one current/future column.
 * [POS]: Ordering command boundary; other tasks retain their relative order during automatic placement.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { buildParentOrder } from '../../../domain/parent-order'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import type { Item } from '../../../shared/contracts/entities'
import { serverText } from '../../../shared/i18n/server'
import { nextSortKey, targetPeriod, touch, type Context } from '../context'
import { orderNodes } from '../ordering'
import { localParentSql } from '@goalloom/store-core'

export function orderingParent(context: Context, itemId: string): string | null {
  return buildParentOrder(orderNodes(context.store, [itemId]), context.store.effectiveRelations(), context.now).group(itemId)
}

export function placeByParent(context: Context, item: Item, record = true): boolean {
  if (context.store.localParentId(item.placement) || item.archivedAt || item.status === 'cancelled') return false
  const { horizon, periodId } = item.placement
  const rows = context.store.summaries(`i.deletedAt IS NULL AND ${localParentSql()} IS NULL AND p.horizon=? AND p.periodId IS ?`, [horizon, periodId])
  const order = buildParentOrder(orderNodes(context.store, rows.map(row => row.id)), context.store.effectiveRelations(), context.now)
  if (!order.editable(item.id)) return false
  const others = rows.filter(row => row.id !== item.id), group = order.group(item.id)
  const visible = others.filter(row => !row.archivedAt && row.status !== 'cancelled')
  const last = group ? visible.filter(row => order.group(row.id) === group).at(-1) : null
  const beforeId = !group ? null : last ? others[others.indexOf(last) + 1]?.id ?? null
    : visible.find(row => order.compare(item.id, row.id) < 0)?.id ?? null
  const before = context.store.position(item)
  if (before.nextId === beforeId) return false
  const key = nextSortKey(context, horizon, periodId, beforeId, item.id)
  const placement = context.store.item(item.id).placement
  item.placement = { ...placement, sortKey: key, version: placement.version + 1 }
  context.store.savePlacement(item.placement, placement.version)
  if (record) {
    touch(context, item)
    context.effects.push({ kind: 'position', itemId: item.id, before, after: context.store.position(item) })
  }
  return true
}

export function materializeParentOrder(context: Context, command: CommandOf<'materializeParentOrder'>): boolean {
  const period = targetPeriod(context, command.horizon, command.period)!
  if (Date.parse(period.endAt) <= Date.parse(context.now)) throw new DomainError('conflict', serverText().errors.invalidPlanningPeriod)
  const items = context.store.summaries(`i.deletedAt IS NULL AND ${localParentSql()} IS NULL AND p.horizon=? AND p.periodId=?`, [command.horizon, period.id])
  const order = buildParentOrder(orderNodes(context.store, items.map(item => item.id)), context.store.effectiveRelations(), context.now)
  const full = order.sort(items).map(item => item.id)
  for (let position = full.length - 1; position >= 0; position--) {
    const item = context.store.item(full[position]!), beforeId = full[position + 1] ?? null
    const before = context.store.position(item)
    if (before.nextId === beforeId) continue
    const key = nextSortKey(context, command.horizon, period.id, beforeId, item.id)
    const placement = context.store.item(item.id).placement
    item.placement = { ...placement, sortKey: key, version: placement.version + 1 }
    context.store.savePlacement(item.placement, placement.version); touch(context, item)
    context.effects.push({ kind: 'position', itemId: item.id, before, after: context.store.position(item) })
  }
  context.label = serverText().labels.sort
  return context.effects.length > 0
}
