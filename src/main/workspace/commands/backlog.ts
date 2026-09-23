/**
 * [INPUT]: 已选往期项当前版本与目标尺度，事务最新状态。
 * [OUTPUT]: 批量安排当前同尺度/Later，一个可撤销操作，保持独立状态。
 * [POS]: 往期入口命令库；不增加隐藏/snooze 状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { isBacklog } from '../../../domain/rollover'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import { moveItem } from './items'
import type { Context } from '../context'
export function arrangeBacklog(context: Context, command: CommandOf<'arrangeBacklog'>): boolean {
  if (new Set(command.items.map(item => item.itemId)).size !== command.items.length) throw new DomainError('invalid', '不能重复选择同一条目')
  const selected = command.items.map(expected => {
    const item = context.store.item(expected.itemId, expected.expectedVersion)
    const period = item.placement.periodId ? context.store.period(item.placement.periodId) : null
    if (!isBacklog({ ...item, period, holdPeriodId: item.placement.holdPeriodId }, context.now) || (command.horizon !== 'later' && command.horizon !== item.placement.horizon)) throw new DomainError('conflict', '所选条目已不属于该往期入口')
    return { expected, item, period: period! }
  }).sort((a, b) => b.period.startAt.localeCompare(a.period.startAt) || a.item.placement.sortKey - b.item.placement.sortKey || a.item.id.localeCompare(b.item.id))
  for (const { expected } of selected) moveItem(context, { ...command, type: 'move', ...expected, beforeId: null })
  context.label = `安排 ${selected.length} 个往期条目`
  return true
}
