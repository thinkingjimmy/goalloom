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
import { serverText } from '../../../shared/i18n/server'

export function setPolicy(context: Context, command: CommandOf<'policy'>): boolean {
  const policy = context.store.policies().find(policy => policy.horizon === command.horizon)
  if (!policy || policy.version !== command.expectedVersion) throw new DomainError('stale', serverText().errors.policyChanged)
  if (command.horizon === 'cycle' && command.mode !== 'manual') throw new DomainError('invalid', serverText().errors.cycleManualOnly)
  if (policy.mode === command.mode) return false
  const current = targetPeriod(context, command.horizon)!
  context.store.db.prepare('UPDATE rollover_policies SET mode=?,version=version+1,effectiveFromPeriodId=? WHERE horizon=? AND version=?').run(command.mode, current.id, command.horizon, policy.version)
  context.label = serverText().labels.policy
  return true
}
export function confirmRollover(context: Context): boolean {
  if (!context.workspace.pausedAfterRestore) return false
  context.workspace.pausedAfterRestore = false
  context.label = serverText().labels.confirmRestore
  return true
}
export function confirmClock(context: Context): boolean {
  if (!context.workspace.clockAnomaly) return false
  const calendar = context.workspace.calendar!
  if (workspaceDate(calendar.timezone, context.now) < calendar.cycleAnchor) throw new DomainError('invalid', serverText().errors.clockStillBehind)
  context.workspace.clockAnomaly = false
  context.workspace.lastObservedAt = context.now
  context.label = serverText().labels.clockConfirmed
  return true
}
export function setBackupPreferences(context: Context, command: CommandOf<'backupPreferences'>): boolean {
  if (context.workspace.backupEnabled === command.enabled && context.workspace.backupRetention === command.retention) return false
  context.workspace.backupEnabled = command.enabled
  context.workspace.backupRetention = command.retention
  context.label = serverText().labels.backupSettings
  return true
}
export function undoBatch(context: Context, command: CommandOf<'undoBatch'>): boolean {
  const original = context.store.operation(command.originalOperationId)
  if (!original || original.source !== 'system' || original.kind !== 'rollover') throw new DomainError('invalid', serverText().errors.batchMissing)
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
  context.label = serverText().labels.batchUndo(count, skipped)
  if (!count) context.warnings.push(serverText().warnings.batchNothingUndone)
  return count > 0
}
