/**
 * [INPUT]: Repository, main-owned placement preference and one observation time after the daily-backup attempt.
 * [OUTPUT]: Revalidated local-group rollover, committed sync anchors, atomic system batches and clock-anomaly state.
 * [POS]: Common reconcile path for startup, focus, wake and time boundaries.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { effectsVersion } from '../../shared/contracts/effects'
import { randomUUID, createHash } from 'node:crypto'
import { compareInstants } from '../../domain/calendar'
import { canRollover } from '../../domain/rollover'
import type { CommandResult } from '../../shared/contracts/commands'
import type { PlanningPeriod } from '../../shared/contracts/entities'
import { targetPeriod, type Context } from './context'
import { moveItem } from './commands/items'
import { assertOutline } from './commands/nesting'
import { transaction } from '../storage/database'
import type { Repository } from './repository'
import { serverText } from '../../shared/i18n/server'
import { emitRolloverOp } from './sync/emit'

export function reconcile(repository: Repository, now = repository.clock.now(), autoPlace = false): CommandResult | null {
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
    const processed = new Set<string>()
    const periods = new Map<string, PlanningPeriod>()
    for (const policy of store.policies().filter(policy => policy.mode === 'auto')) {
      const current = targetPeriod(context, policy.horizon)!, effectiveFrom = store.period(policy.effectiveFromPeriodId)
      const candidates = store.summaries("i.status='todo' AND i.archivedAt IS NULL AND i.deletedAt IS NULL AND p.horizon=? AND p.periodId!=?", [policy.horizon, current.id], 'ORDER BY (SELECT julianday(startAt) FROM planning_periods WHERE id=p.periodId) DESC,p.sortKey,i.id')
      for (const candidate of candidates) {
        const item = store.item(candidate.id)
        const periodId = item.placement.periodId!
        let period = periods.get(periodId)
        if (!period) { period = store.period(periodId); periods.set(periodId, period) }
        if (!canRollover({ ...item, period, holdPeriodId: item.placement.holdPeriodId }, { clock: { now: () => now }, current, mode: policy.mode, effectiveFrom, setupConfirmed: true, maintenance: false, pausedAfterRestore: false })) continue
        const rootId = store.localParentId(item.placement) ?? item.id
        if (processed.has(rootId)) continue
        const root = store.item(rootId), members = [root, ...store.nestedItems(rootId).filter(child => child.placement.horizon === root.placement.horizon && child.placement.periodId === root.placement.periodId)]
        if (members.some(member => member.status === 'todo' && member.placement.holdPeriodId === current.id)) continue
        processed.add(rootId)
        const start = context.effects.length
        moveItem(context, { type: 'move', operationId, generation: workspace.generation, itemId: root.id, expectedVersion: root.version, expectedPlacementVersion: root.placement.version, horizon: policy.horizon, autoPlace })
        for (const effect of context.effects.slice(start)) {
          if ((effect.kind !== 'position' && effect.kind !== 'groupPlacement') || !effect.before.periodId || !effect.after.periodId || effect.before.periodId === effect.after.periodId) continue
          const seq = store.db.prepare(`SELECT MAX(seq) AS seq FROM canon_changes WHERE itemId=? AND dim IN ('placement','create')`).get(effect.itemId)
          const position = store.position(store.item(effect.itemId))
          emitRolloverOp(store.db, { itemId: effect.itemId, fromPeriodId: effect.before.periodId, toPeriodId: effect.after.periodId,
            placementSeq: seq?.seq == null ? 0 : Number(seq.seq), at: now,
            sortHint: { afterId: position.previousId, beforeId: position.nextId }, ...(members.length > 1 ? { groupRootId: root.id } : {}) })
        }
      }
    }
    if (!context.effects.length) return null
    assertOutline(context)
    workspace.revision++
    store.saveWorkspace(workspace)
    const result: CommandResult = { operationId, generation: workspace.generation, changed: true, undoable: false, outcome: 'committed', itemId: null, label: serverText().labels.autoRollover(context.effects.length), warnings: [], restoreSource: null, originalOperationId: null }
    store.saveOperation({ id: operationId, generation: workspace.generation, requestHash: createHash('sha256').update(`${workspace.generation}:${now}:${operationId}`).digest('hex'), kind: 'rollover', source: 'system', at: now, effectsVersion: effectsVersion(context.effects), effects: context.effects, result })
    return result
  })
}
