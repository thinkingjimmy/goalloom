/**
 * [INPUT]: Selected backlog item/placement versions, target horizon and automatic-placement preference.
 * [OUTPUT]: One atomic undoable move to the current period or Later, with local groups placed without reordering existing roots.
 * [POS]: Backlog command boundary; item state and cross-period ownership remain independent.
 */
import { isBacklog } from '../../../domain/rollover'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import { moveItem } from './items'
import type { Context } from '../context'
import { serverText } from '../../../shared/i18n/server'
export function arrangeBacklog(context: Context, command: CommandOf<'arrangeBacklog'>): boolean {
  if (new Set(command.items.map(item => item.itemId)).size !== command.items.length) throw new DomainError('invalid', serverText().errors.duplicateSelection)
  const selected = command.items.map(expected => {
    const item = context.store.item(expected.itemId, expected.expectedVersion)
    if (item.placement.version !== expected.expectedPlacementVersion) throw new DomainError('stale', serverText().errors.placementChanged)
    const period = item.placement.periodId ? context.store.period(item.placement.periodId) : null
    if (!isBacklog({ ...item, period, holdPeriodId: item.placement.holdPeriodId }, context.now) || (command.horizon !== 'later' && command.horizon !== item.placement.horizon)) throw new DomainError('conflict', serverText().errors.notInBacklog)
    return { expected, item, period: period! }
  }).sort((a, b) => b.period.startAt.localeCompare(a.period.startAt) || a.item.placement.sortKey - b.item.placement.sortKey || a.item.id.localeCompare(b.item.id))
  const groups = new Set<string>()
  for (const { item } of selected) {
    if (groups.has(item.id)) continue
    const rootId = context.store.localParentId(item.placement) ?? item.id
    if (groups.has(rootId)) continue
    groups.add(rootId)
    const root = context.store.item(rootId)
    for (const child of context.store.nestedItems(rootId)) if (child.placement.horizon === root.placement.horizon && child.placement.periodId === root.placement.periodId) groups.add(child.id)
    moveItem(context, { ...command, type: 'move', itemId: root.id, expectedVersion: root.version, expectedPlacementVersion: root.placement.version })
  }
  context.label = serverText().labels.arrangeBacklog(selected.length)
  return true
}
