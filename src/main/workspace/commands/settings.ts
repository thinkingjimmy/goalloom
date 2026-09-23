/**
 * [INPUT]: 严格设置/系统批次命令、事务内当前策略和效果。
 * [OUTPUT]: 非追溯策略边界、显式暂停解除、部分成功的批次撤销。
 * [POS]: 工作区控制库；日历锁不提供修改入口。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import { targetPeriod, type Context } from '../context'
import { reverseEffect } from './undo'
import { workspaceDate } from '../../../domain/calendar'

export function setPolicy(context: Context, command: CommandOf<'policy'>): boolean {
  const policy = context.store.policies().find(policy => policy.horizon === command.horizon)
  if (!policy || policy.version !== command.expectedVersion) throw new DomainError('stale', '顺延策略已变化，请刷新')
  if (command.horizon === 'cycle' && command.mode !== 'manual') throw new DomainError('invalid', '3个月固定为手动安排')
  if (policy.mode === command.mode) return false
  const current = targetPeriod(context, command.horizon)!
  context.store.db.prepare('UPDATE rollover_policies SET mode=?,version=version+1,effectiveFromPeriodId=? WHERE horizon=? AND version=?').run(command.mode, current.id, command.horizon, policy.version)
  context.label = '更新未完成事项处理'
  return true
}
export function confirmRollover(context: Context): boolean {
  if (!context.workspace.pausedAfterRestore) return false
  context.workspace.pausedAfterRestore = false
  context.label = '确认恢复后的往期处理'
  return true
}
export function confirmClock(context: Context): boolean {
  if (!context.workspace.clockAnomaly) return false
  const calendar = context.workspace.calendar!
  if (workspaceDate(calendar.timezone, context.now) < calendar.cycleAnchor) throw new DomainError('invalid', '系统时间仍早于已锁定的周期起点，请先校正系统时间')
  context.workspace.clockAnomaly = false
  context.workspace.lastObservedAt = context.now
  context.label = '已复核系统时间'
  return true
}
export function setBackupPreferences(context: Context, command: CommandOf<'backupPreferences'>): boolean {
  if (context.workspace.backupEnabled === command.enabled && context.workspace.backupRetention === command.retention) return false
  context.workspace.backupEnabled = command.enabled
  context.workspace.backupRetention = command.retention
  context.label = '更新备份设置'
  return true
}
export function undoBatch(context: Context, command: CommandOf<'undoBatch'>): boolean {
  const original = context.store.operation(command.originalOperationId)
  if (!original || original.source !== 'system' || original.kind !== 'rollover') throw new DomainError('invalid', '顺延批次不存在')
  let skipped = 0
  context.undone = []
  for (let index = original.effects.length - 1; index >= 0; index--) {
    if (context.store.db.prepare('SELECT 1 FROM undo_effects WHERE originalId=? AND effectIndex=?').get(original.id, index)) { skipped++; continue }
    context.store.db.exec('SAVEPOINT batch_effect')
    try {
      reverseEffect(context, original.effects[index]!, original.id)
      context.store.db.exec('RELEASE batch_effect')
      context.undone.push({ originalId: original.id, index })
    } catch (error) {
      context.store.db.exec('ROLLBACK TO batch_effect; RELEASE batch_effect')
      if (!(error instanceof DomainError) || !['conflict', 'invalid', 'stale'].includes(error.code)) throw error
      skipped++
    }
  }
  const count = context.undone.length
  context.label = `批次顺延（${count} 项已撤销，${skipped} 项跳过）`
  if (!count) context.warnings.push('本批次没有可安全撤销的条目：已撤销或相关位置/依赖已变化')
  return count > 0
}
