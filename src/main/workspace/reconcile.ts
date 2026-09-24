/**
 * [INPUT]: Repository、一次注入观察时刻；调用方已经执行日常备份检查。
 * [OUTPUT]: 权威事务内重读的自动顺延、原子系统批次和时钟异常标记。
 * [POS]: 统一核对库；启动/前台/唤醒/边界都调用同一入口。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { randomUUID, createHash } from 'node:crypto'
import { compareInstants } from '../../domain/calendar'
import { canRollover } from '../../domain/rollover'
import type { CommandResult } from '../../shared/contracts/commands'
import { targetPeriod, type Context } from './context'
import { moveItem } from './commands/items'
import { transaction } from '../storage/database'
import type { Repository } from './repository'
import { serverText } from '../../shared/i18n/server'

export function reconcile(repository: Repository, now = repository.clock.now()): CommandResult | null {
  if (repository.maintenance) return null
  return transaction(repository.db, () => {
    const store = repository.store, workspace = store.workspace()
    if (!workspace.setupConfirmedAt) return null
    const backward = workspace.lastObservedAt !== null && compareInstants(now, workspace.lastObservedAt) < 0
    if (backward) workspace.clockAnomaly = true
    else workspace.lastObservedAt = now
    store.saveWorkspace(workspace)
    if (workspace.clockAnomaly || workspace.pausedAfterRestore) return null
    const operationId = randomUUID()
    const context: Context = { store, workspace, command: { operationId, generation: workspace.generation }, now, effects: [], warnings: [], itemId: null, label: '' }
    for (const policy of store.policies().filter(policy => policy.mode === 'auto')) {
      const current = targetPeriod(context, policy.horizon)!, effectiveFrom = store.period(policy.effectiveFromPeriodId)
      const candidates = store.items("i.status='todo' AND i.archivedAt IS NULL AND i.deletedAt IS NULL AND p.horizon=? AND p.periodId!=?", [policy.horizon, current.id], 'ORDER BY (SELECT julianday(startAt) FROM planning_periods WHERE id=p.periodId) DESC,p.sortKey,i.id')
      for (const item of candidates) {
        const period = store.period(item.placement.periodId!)
        if (!canRollover({ ...item, period, holdPeriodId: item.placement.holdPeriodId }, { clock: { now: () => now }, current, mode: policy.mode, effectiveFrom, setupConfirmed: true, maintenance: false, pausedAfterRestore: false })) continue
        moveItem(context, { type: 'move', operationId, generation: workspace.generation, itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: policy.horizon, beforeId: null })
      }
    }
    if (!context.effects.length) return null
    workspace.revision++
    store.saveWorkspace(workspace)
    const result: CommandResult = { operationId, generation: workspace.generation, changed: true, undoable: false, outcome: 'committed', itemId: null, label: serverText().labels.autoRollover(context.effects.length), warnings: [], restoreSource: null, originalOperationId: null }
    store.saveOperation({ id: operationId, generation: workspace.generation, requestHash: createHash('sha256').update(`${workspace.generation}:${now}:${operationId}`).digest('hex'), kind: 'rollover', source: 'system', at: now, effectsVersion: 1, effects: context.effects, result })
    return result
  })
}
