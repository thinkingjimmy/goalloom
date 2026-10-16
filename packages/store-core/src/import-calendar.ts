/**
 * [INPUT]: Validated first-import metadata, target projection and deterministic period mapping.
 * [OUTPUT]: Safe calendar adoption before task history, or placements aligned to the established calendar.
 * [POS]: Canonical import policy shared by pending and remote replay. Tombstones also lock the calendar.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Action, PeriodKey, SyncOp } from '@goalloom/contracts'
import type { ApplyHost, SqlDriver } from './driver'

export function canAdoptCalendar(driver: SqlDriver, prefix: string, op: SyncOp): boolean {
  if (!op.importedCalendar) return false
  if (driver.prepare(`SELECT 1 FROM ${prefix}items LIMIT 1`).get()) return false
  return !driver.prepare("SELECT 1 FROM canon_changes WHERE dim='create' LIMIT 1").get()
}

export function alignImportAction(driver: SqlDriver, prefix: string, op: SyncOp, action: Action, host: ApplyHost): Action | null {
  if (!op.importedCalendar) return action
  const raw = driver.prepare(`SELECT calendar FROM ${prefix}workspace WHERE id=1`).get()?.calendar
  if (!raw || JSON.parse(String(raw)).id === op.importedCalendar.id) return action
  if (action.t === 'policy.set') return null
  if (action.t === 'item.rollover' && host.alignImportedPeriod) {
    const align = (key: PeriodKey): PeriodKey => ({ ...key,
      startDate: host.alignImportedPeriod!(JSON.stringify(op.importedCalendar), key.horizon, key.startDate, op.at, String(raw)),
    })
    return { ...action, from: { ...action.from, periodKey: align(action.from.periodKey) }, to: align(action.to) }
  }
  if (!('periodKey' in action) || !action.periodKey || !host.alignImportedPeriod) return action
  const startDate = host.alignImportedPeriod(JSON.stringify(op.importedCalendar), action.periodKey.horizon, action.periodKey.startDate, op.at, String(raw))
  return { ...action, periodKey: { ...action.periodKey, startDate } }
}

/** Offline rollovers had no server sequence. Only their own imported placement chain can supply that predecessor. */
export function followsImportedPlacement(driver: SqlDriver, op: SyncOp, seq: number): boolean {
  if (!op.importedCalendar || !seq) return false
  const row = driver.prepare("SELECT payload FROM sync_ops WHERE seq=? AND state='applied'").get(seq)
  if (!row) return false
  const predecessor = JSON.parse(String(row.payload)) as SyncOp
  return predecessor.importedCalendar?.id === op.importedCalendar.id
}
