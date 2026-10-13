import { DatabaseSync } from 'node:sqlite'
import { parseSyncOp, syncOpPayload, type SyncOp } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import type { ApplyHost, SqlDriver } from '@goalloom/store-core'
import { openDatabase } from '../../../apps/desktop/src/main/storage/database'
import { migrate } from '../../../apps/desktop/src/main/storage/schema'

export const at = '2026-09-23T02:00:00.000Z'

export function openSync(): { db: DatabaseSync; driver: SqlDriver; host: ApplyHost } {
  const db = openDatabase(':memory:')
  migrate(db)
  return { db, driver: nodeSqlDriver(db), host: fakeHost() }
}

export function fakeHost(): ApplyHost {
  return { materializePeriod(horizon, startDate) {
    return { id: `${horizon}:${startDate}`, horizon, startDate, endDate: '2099-01-01', startAt: `${startDate}T00:00:00.000Z`, endAt: '2099-01-01T00:00:00.000Z' }
  } }
}

export function seedItem(driver: SqlDriver, scope: 'base' | 'visible', id: string, title: string, flowColor: number | null, sortKey = 0): void {
  const prefix = scope === 'base' ? 'base_' : ''
  driver.prepare(`INSERT INTO ${prefix}items (id,title,description,dueDate,status,completedAt,cancelledAt,archivedAt,deletedAt,deletedBy,createdAt,updatedAt,version,flowColor)
    VALUES (?,?, '', NULL, 'todo', NULL, NULL, NULL, NULL, NULL, ?, ?, 1, ?)`).run(id, title, at, at, flowColor)
  driver.prepare(`INSERT INTO ${prefix}item_placements (itemId,horizon,periodId,sortKey,version,holdPeriodId) VALUES (?, 'later', NULL, ?, 1, NULL)`).run(id, sortKey)
}

export function pendingOp(driver: SqlDriver, op: SyncOp, state = 'never_sent', seq: number | null = null): void {
  const payload = syncOpPayload(op)
  const order = Number(driver.prepare('SELECT COALESCE(MAX(localOrder),0) AS n FROM sync_ops').get()?.n ?? 0) + 1
  driver.prepare(`INSERT INTO sync_ops (opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,seq,createdAt,updatedAt)
    VALUES (?,?,'local',1,?,?,?,?,?,?,?,?)`).run(op.opId, order, payload, sha256Hex(payload), op.deviceId, op.at, state, seq, at, at)
}

export function op(partial: Pick<SyncOp, 'opId' | 'actions'> & Partial<SyncOp>): SyncOp {
  return parseSyncOp({ v: 1, deviceId: 'device-a', at, ...partial })
}

export function color(driver: SqlDriver, id: string): number | null {
  const row = driver.prepare('SELECT flowColor FROM items WHERE id=?').get(id)
  return row?.flowColor === null || row?.flowColor === undefined ? null : Number(row.flowColor)
}
