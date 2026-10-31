/**
 * [INPUT]: A never-sent offline board and deterministic replay host.
 * [OUTPUT]: A complete first-upload log with stable operation/item IDs, policies and already-applied offline placements.
 * [POS]: First-connection preparation. Implicit setup defaults and pre-sync rollover can be absent from the ordinary outbox.
 */
import { parseSyncOp, syncOpPayload, type Action, type SyncOp } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import { applySyncOp, rebuildVisibleFull, type ApplyHost, type SqlDriver } from '@goalloom/store-core'
import { captureVisibleBoard, queueBaselineInTransaction } from './board'
import { SyncFailure } from './failure'

export function prepareFirstConnection(driver: SqlDriver, host: ApplyHost, deviceId: string, at: string): void {
  driver.transaction(() => prepareFirstConnectionInTransaction(driver, host, deviceId, at))
}

export function prepareFirstConnectionInTransaction(driver: SqlDriver, host: ApplyHost, deviceId: string, at: string): SyncOp[] {
  const board = captureVisibleBoard(driver)
  if (driver.prepare("SELECT 1 FROM sync_ops WHERE origin='local' AND state NOT IN ('never_sent','reverted_local') LIMIT 1").get()) {
    throw new SyncFailure('storage', 'first connection has sent operations')
  }
  restoreOfflineOperations(driver, host, at)
  queueBaselineInTransaction(driver, host, deviceId, at)
  const rows = driver.prepare("SELECT opId,payload FROM sync_ops WHERE origin='local' AND state='never_sent' ORDER BY localOrder").all()
  const ops = rows.map(row => parseSyncOp({ ...JSON.parse(String(row.payload)), ...(board.calendar ? { importedCalendar: board.calendar } : {}) }))
  for (const op of ops) {
    const payload = syncOpPayload(op)
    driver.prepare('UPDATE sync_ops SET payload=?,payloadHash=? WHERE opId=?').run(payload, sha256Hex(payload), op.opId)
  }
  rebuildVisibleFull(driver, host, { strictOpIds: new Set(ops.map(op => op.opId)) })
  const replayed = captureVisibleBoard(driver)
  const actions: Action[] = board.policies.filter(policy => !replayed.policies.some(other => other.horizon === policy.horizon && other.mode === policy.mode && other.startDate === policy.startDate))
    .map(policy => ({ t: 'policy.set', horizon: policy.horizon, mode: policy.mode, effectiveFromKey: { horizon: policy.horizon, startDate: policy.startDate } }))
  const current = new Map(replayed.items.map(item => [item.id, item]))
  const ordered = board.items.filter(item => !item.deletedAt).sort((a, b) => a.sortKey - b.sortKey || a.id.localeCompare(b.id))
  const previousSibling = new Map<string, string>()
  for (const item of ordered) {
    const previous = current.get(item.id)
    if (!previous || previous.nestingParentId !== item.nestingParentId) throw new SyncFailure('storage', 'first connection identity mismatch')
    const group = `${item.horizon}|${item.period?.startDate ?? ''}|${item.nestingParentId ?? ''}`
    const afterId = previousSibling.get(group) ?? null
    previousSibling.set(group, item.id)
    if (previous.horizon === item.horizon && previous.period?.startDate === item.period?.startDate) continue
    actions.push({ t: 'item.place', id: item.id, horizon: item.horizon as 'day', periodKey: item.period,
      sortHint: { afterId, beforeId: null }, reason: 'rollover' })
  }
  let order = Number(driver.prepare('SELECT COALESCE(MAX(localOrder),0) AS n FROM sync_ops').get()?.n ?? 0)
  for (let index = 0; index < actions.length; index += 200) {
    const op = parseSyncOp({ v: 1, opId: globalThis.crypto.randomUUID(), deviceId, at, actions: actions.slice(index, index + 200),
      ...(board.calendar ? { importedCalendar: board.calendar } : {}) })
    applySyncOp(driver, op, 'visible', host)
    const payload = syncOpPayload(op)
    driver.prepare(`INSERT INTO sync_ops (opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,createdAt,updatedAt)
      VALUES (?,?,'local',1,?,?,?,?,'never_sent',?,?)`).run(op.opId, ++order, payload, sha256Hex(payload), op.deviceId, op.at, at, at)
    ops.push(op)
  }
  const final = captureVisibleBoard(driver)
  const identity = (items: typeof board.items) => items.map(({ sortKey: _sortKey, ...item }) => item).sort((a, b) => a.id.localeCompare(b.id))
  if (JSON.stringify(identity(board.items)) !== JSON.stringify(identity(final.items))) throw new SyncFailure('storage', 'first connection board mismatch')
  return ops
}

function restoreOfflineOperations(driver: SqlDriver, host: ApplyHost, at: string): void {
  const missing = host.offlineOperations?.() ?? []
  if (!missing.length) return
  const ordered = driver.prepare('SELECT opId FROM sync_ops WHERE localOrder IS NOT NULL ORDER BY localOrder').all().map(row => String(row.opId))
  let order = Number(driver.prepare('SELECT COALESCE(MAX(localOrder),0) AS n FROM sync_ops').get()?.n ?? 0)
  for (const { op, beforeOpId } of missing) {
    const payload = syncOpPayload(op)
    driver.prepare(`INSERT INTO sync_ops (opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,createdAt,updatedAt)
      VALUES (?,?,'local',1,?,?,?,?,'never_sent',?,?)`).run(op.opId, ++order, payload, sha256Hex(payload), op.deviceId, op.at, at, at)
    const next = beforeOpId ? ordered.indexOf(beforeOpId) : -1
    ordered.splice(next < 0 ? ordered.length : next, 0, op.opId)
  }
  driver.prepare('UPDATE sync_ops SET localOrder=-localOrder WHERE localOrder IS NOT NULL').run()
  ordered.forEach((id, index) => driver.prepare('UPDATE sync_ops SET localOrder=? WHERE opId=?').run(index + 1, id))
}
