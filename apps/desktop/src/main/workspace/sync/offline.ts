/**
 * [INPUT]: Validated local operation effects, pending sync rows and original planning periods.
 * [OUTPUT]: Missing pre-sync rollover operations placed before subsequent user commands.
 * [POS]: Desktop history adapter for first connection. It preserves later edits, order and deletion without restoring any task.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { DatabaseSync } from 'node:sqlite'
import { parseSyncOp, type Action, type PeriodKey, type SyncOp } from '@goalloom/contracts'
import { uuidv5 } from '@goalloom/crypto'
import type { Effect } from '../../../shared/contracts/effects'

export function offlineRolloverOperations(db: DatabaseSync): { op: SyncOp; beforeOpId: string | null }[] {
  const pending = db.prepare(`SELECT s.opId,s.payload,o.rowid AS position FROM sync_ops s LEFT JOIN operations o ON o.id=s.opId
    WHERE s.origin='local' ORDER BY s.localOrder`).all()
  const ids = new Set(pending.map(row => String(row.opId)))
  const represented = new Set(pending.flatMap(row => parseSyncOp(JSON.parse(String(row.payload))).actions.flatMap(action =>
    action.t === 'item.rollover' ? [`${action.id}|${action.from.periodKey.horizon}|${action.from.periodKey.startDate}|${action.to.startDate}`] : [])))
  const generation = String(db.prepare('SELECT generation FROM workspace WHERE id=1').get()!.generation)
  const operations = db.prepare("SELECT rowid AS position,id,at,effects FROM operations WHERE generation=? AND kind='rollover' AND source='system' ORDER BY rowid").all(generation)
  const period = (id: string): PeriodKey => {
    const row = db.prepare('SELECT horizon,startDate FROM planning_periods WHERE id=?').get(id)
    if (!row) throw Error('Missing offline rollover period')
    return { horizon: String(row.horizon) as PeriodKey['horizon'], startDate: String(row.startDate) }
  }
  const result: { op: SyncOp; beforeOpId: string | null }[] = []
  for (const operation of operations) {
    const actions: Action[] = []
    const undone = new Set(db.prepare('SELECT effectIndex FROM undo_effects WHERE originalId=?').all(String(operation.id)).map(row => Number(row.effectIndex)))
    for (const [index, effect] of (JSON.parse(String(operation.effects)) as Effect[]).entries()) {
      if (undone.has(index)) continue
      if ((effect.kind !== 'position' && effect.kind !== 'groupPlacement') || !effect.before.periodId || !effect.after.periodId || effect.before.periodId === effect.after.periodId) continue
      const from = period(effect.before.periodId), to = period(effect.after.periodId)
      if (represented.has(`${effect.itemId}|${from.horizon}|${from.startDate}|${to.startDate}`)) continue
      actions.push({ t: 'item.place', id: effect.itemId, horizon: effect.after.horizon, periodKey: to, reason: 'rollover',
        sortHint: { afterId: effect.kind === 'position' ? effect.after.previousId : null, beforeId: effect.kind === 'position' ? effect.after.nextId : null } })
    }
    const next = pending.find(row => row.position !== null && Number(row.position) > Number(operation.position))
    for (let index = 0; index < actions.length; index += 200) {
      const opId = index === 0 ? String(operation.id) : uuidv5(`offline-rollover:${operation.id}:${index}`, generation)
      if (ids.has(opId)) continue
      result.push({ op: parseSyncOp({ v: 1, opId, deviceId: 'system', at: String(operation.at), actions: actions.slice(index, index + 200) }), beforeOpId: next ? String(next.opId) : null })
    }
  }
  return result
}
