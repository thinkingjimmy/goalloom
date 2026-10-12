/**
 * [INPUT]: Persisted sync_ops rows.
 * [OUTPUT]: Send-state transitions. send_unknown never returns to never_sent; the sticky trigger is the backstop.
 * [POS]: Lifecycle helpers shared by the push loop and undo.
 */
import { SyncApplyError, type SqlDriver } from './driver'

export function markSendUnknown(driver: SqlDriver, opIds: string[], attemptId: string, at: string): void {
  driver.transaction(() => {
    for (const opId of opIds) {
      const result = driver.prepare(`UPDATE sync_ops SET state='send_unknown', sendAttemptId=?, updatedAt=? WHERE opId=? AND state='never_sent'`).run(attemptId, at, opId)
      if (result.changes !== 1) {
        const state = driver.prepare('SELECT state FROM sync_ops WHERE opId=?').get(opId)
        if (!state || String(state.state) !== 'send_unknown') throw new SyncApplyError('storage', 'send transition rejected')
      }
    }
  })
}

export function markAccepted(driver: SqlDriver, opId: string, seq: number, at: string): void {
  const result = driver.prepare(`UPDATE sync_ops SET state='accepted', seq=?, updatedAt=? WHERE opId=? AND state IN ('send_unknown','accepted')`).run(seq, at, opId)
  if (result.changes !== 1) throw new SyncApplyError('storage', 'accept transition rejected')
}

/** Returns true when the op was still never_sent and is now reverted_local. */
export function cancelIfNeverSent(driver: SqlDriver, opId: string, at: string): boolean {
  return driver.prepare(`UPDATE sync_ops SET state='reverted_local', updatedAt=? WHERE opId=? AND state='never_sent'`).run(at, opId).changes === 1
}

export function pauseWorkspace(driver: SqlDriver, reason: string, at: string): void {
  driver.prepare('UPDATE sync_state SET paused=?, updatedAt=? WHERE id=1').run(reason, at)
}
