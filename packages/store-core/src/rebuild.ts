/**
 * [INPUT]: base_* projection, pending local sync_ops, and device-local workspace columns to preserve.
 * [OUTPUT]: Visible projection equals base plus replay of pending ops. Receipts and canon rows are not deleted.
 * [POS]: Reference rebase. A foreign-key failure aborts the caller transaction (storage pause).
 */
import { parseSyncOp, syncOpPayload, type SyncOp } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import { applySyncOp } from './apply'
import { businessCode } from './classify'
import type { ApplyHost, SqlDriver } from './driver'
import { SyncApplyError } from './driver'

const localColumns = ['theme', 'style', 'checkStyle', 'backupEnabled', 'backupRetention', 'clockAnomaly', 'lastObservedAt', 'pausedAfterRestore', 'generation'] as const

export function copyProjectionToBase(driver: SqlDriver): void {
  driver.exec(`DELETE FROM base_item_guidance; DELETE FROM base_item_relations; DELETE FROM base_item_placements; DELETE FROM base_rollover_policies;
    DELETE FROM base_items; DELETE FROM base_planning_periods; DELETE FROM base_workspace;`)
  for (const table of ['workspace', 'planning_periods', 'items', 'item_placements', 'item_relations', 'rollover_policies', 'item_guidance']) {
    driver.exec(`INSERT INTO base_${table} SELECT * FROM ${table}`)
  }
}

export function rebuildVisibleFull(driver: SqlDriver, host: ApplyHost): void {
  const local = driver.prepare(`SELECT ${localColumns.join(',')}, revision FROM workspace WHERE id=1`).get()
  if (!local) throw new SyncApplyError('storage', 'workspace missing')
  driver.exec(`DELETE FROM item_guidance; DELETE FROM item_relations; DELETE FROM item_placements; DELETE FROM rollover_policies; UPDATE items SET flowColor=NULL;`)
  driver.exec(`DELETE FROM items WHERE id NOT IN (SELECT id FROM base_items)`)
  driver.exec(`DELETE FROM planning_periods WHERE id NOT IN (SELECT id FROM base_planning_periods)`)
  driver.exec(`INSERT INTO planning_periods SELECT * FROM base_planning_periods WHERE id NOT IN (SELECT id FROM planning_periods)`)
  driver.exec(`INSERT INTO items SELECT * FROM base_items WHERE id NOT IN (SELECT id FROM items)`)
  driver.exec(`UPDATE items SET title=b.title, description=b.description, dueDate=b.dueDate, status=b.status, completedAt=b.completedAt, cancelledAt=b.cancelledAt,
    archivedAt=b.archivedAt, deletedAt=b.deletedAt, deletedBy=b.deletedBy, createdAt=b.createdAt, updatedAt=b.updatedAt, version=b.version, flowColor=NULL
    FROM base_items b WHERE items.id=b.id`)
  driver.exec(`UPDATE items SET flowColor=(SELECT flowColor FROM base_items b WHERE b.id=items.id)`)
  driver.exec(`INSERT INTO item_placements SELECT * FROM base_item_placements`)
  driver.exec(`INSERT INTO item_relations SELECT * FROM base_item_relations`)
  driver.exec(`INSERT INTO rollover_policies SELECT * FROM base_rollover_policies`)
  driver.exec(`INSERT INTO item_guidance SELECT * FROM base_item_guidance`)
  const baseWorkspace = driver.prepare('SELECT calendar, setupConfirmedAt, revision FROM base_workspace WHERE id=1').get()
  const revision = Math.max(Number(local.revision ?? 0), Number(baseWorkspace?.revision ?? 0))
  driver.prepare(`UPDATE workspace SET calendar=?, setupConfirmedAt=?, revision=?, theme=?, style=?, checkStyle=?, backupEnabled=?, backupRetention=?, clockAnomaly=?, lastObservedAt=?, pausedAfterRestore=?, generation=? WHERE id=1`)
    .run(baseWorkspace?.calendar ?? null, baseWorkspace?.setupConfirmedAt ?? null, revision,
      local.theme ?? 'system', local.style ?? 'paper', local.checkStyle ?? 'outline', local.backupEnabled ?? 1, local.backupRetention ?? 7,
      local.clockAnomaly ?? 0, local.lastObservedAt ?? null, local.pausedAfterRestore ?? 0, local.generation ?? '')
  for (const row of pending(driver)) {
    driver.exec('SAVEPOINT replay')
    try {
      applySyncOp(driver, parseSyncOp(JSON.parse(String(row.payload))), 'visible', host)
      driver.exec('RELEASE replay')
    } catch (error) {
      driver.exec('ROLLBACK TO replay'); driver.exec('RELEASE replay')
      if (!businessCode(error)) throw error
    }
  }
}

function rememberOp(driver: SqlDriver, entry: RemoteEnvelope, outcome: 'applied' | 'rejected' | 'partial', errorCode: string | null, at: string): void {
  const stored = outcome === 'rejected' ? 'rejected' : 'applied'
  const payload = syncOpPayload(entry.op)
  const existing = driver.prepare('SELECT opId FROM sync_ops WHERE opId=?').get(entry.op.opId)
  if (existing) driver.prepare(`UPDATE sync_ops SET state='applied', outcome=?, seq=?, errorCode=?, updatedAt=? WHERE opId=?`).run(stored, entry.seq, errorCode, at, entry.op.opId)
  else driver.prepare(`INSERT INTO sync_ops (opId, localOrder, origin, formatVersion, payload, payloadHash, deviceId, at, keyEpoch, state, outcome, seq, errorCode, createdAt, updatedAt)
    VALUES (?, NULL, 'remote', 1, ?, ?, ?, ?, NULL, 'applied', ?, ?, ?, ?, ?)`).run(entry.op.opId, payload, sha256Hex(payload), entry.op.deviceId, entry.op.at, stored, entry.seq, errorCode, at, at)
}

function pending(driver: SqlDriver): Record<string, import('./driver').SqlValue>[] {
  const cursor = Number(driver.prepare('SELECT lastAppliedSeq AS seq FROM sync_state WHERE id=1').get()?.seq ?? 0)
  return driver.prepare(`SELECT payload FROM sync_ops WHERE origin='local' AND state IN ('never_sent','send_unknown','accepted') AND (seq IS NULL OR seq>?) ORDER BY localOrder`).all(cursor)
}

export function assertForeignKeys(driver: SqlDriver): void {
  const rows = driver.prepare('PRAGMA foreign_key_check').all()
  if (rows.length) throw new SyncApplyError('storage', 'foreign_key_check failed')
}

export type RemoteEnvelope = { seq: number; op: SyncOp }

export function mergeRemoteOps(driver: SqlDriver, batch: RemoteEnvelope[], host: ApplyHost, at: string): void {
  driver.transaction(() => {
    const ordered = [...batch].sort((left, right) => left.seq - right.seq)
    for (const entry of ordered) {
      const cursor = Number(driver.prepare('SELECT lastAppliedSeq AS seq FROM sync_state WHERE id=1').get()?.seq ?? 0)
      if (entry.seq !== cursor + 1) throw new SyncApplyError('storage', 'seq gap')
      let outcome: 'applied' | 'rejected' | 'partial' = 'applied'
      let errorCode: string | null = null
      let changes: { itemId: string | null; dim: string; before: unknown; after: unknown }[] = []
      let kind = entry.op.actions[0]?.t ?? 'empty'
      driver.exec('SAVEPOINT canon')
      try {
        const applied = applySyncOp(driver, entry.op, 'base', host)
        outcome = applied.outcome
        changes = applied.changes
        kind = applied.kind
        driver.exec('RELEASE canon')
      } catch (error) {
        driver.exec('ROLLBACK TO canon'); driver.exec('RELEASE canon')
        const code = businessCode(error)
        if (!code) throw error
        outcome = 'rejected'
        errorCode = code
      }
      rememberOp(driver, entry, outcome, errorCode, at)
      if (errorCode) {
        const first = entry.op.actions[0]
        const itemId = first && 'id' in first ? first.id : first && 'itemId' in first ? first.itemId : null
        driver.prepare('INSERT INTO sync_conflicts (opId, seq, code, itemId, detail, at) VALUES (?,?,?,?,?,?) ON CONFLICT(opId) DO UPDATE SET seq=excluded.seq, code=excluded.code, detail=excluded.detail')
          .run(entry.op.opId, entry.seq, errorCode, itemId, errorCode, at)
      }
      driver.prepare('INSERT INTO canon_ops (seq, opId, deviceId, at, kind, outcome, errorCode) VALUES (?,?,?,?,?,?,?)').run(entry.seq, entry.op.opId, entry.op.deviceId, entry.op.at, kind, outcome, errorCode)
      changes.forEach((change, index) => {
        driver.prepare('INSERT INTO canon_changes (seq, idx, itemId, dim, before, after) VALUES (?,?,?,?,?,?)')
          .run(entry.seq, index, change.itemId, change.dim, change.before === undefined ? null : JSON.stringify(change.before), change.after === undefined ? null : JSON.stringify(change.after))
      })
      driver.prepare('UPDATE sync_state SET lastAppliedSeq=?, updatedAt=? WHERE id=1').run(entry.seq, at)
    }
    rebuildVisibleFull(driver, host)
    assertForeignKeys(driver)
  })
}
