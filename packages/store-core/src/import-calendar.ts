/**
 * [INPUT]: Validated first-import metadata, target projection and deterministic period mapping.
 * [OUTPUT]: Safe calendar adoption before task history, or placement targets and carried-child source guards aligned to the established calendar.
 * [POS]: Canonical import policy shared by pending and remote replay. Tombstones also lock the calendar.
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
  if (!host.alignImportedPeriod) return action
  const align = (key: PeriodKey): PeriodKey => ({ ...key,
    startDate: host.alignImportedPeriod!(JSON.stringify(op.importedCalendar), key.horizon, key.startDate, op.at, String(raw)),
  })
  if (action.t === 'item.rollover') {
    return { ...action, from: { ...action.from, periodKey: align(action.from.periodKey) }, to: align(action.to) }
  }
  if (!('periodKey' in action)) return action
  return { ...action, periodKey: action.periodKey ? align(action.periodKey) : null,
    ...(action.t === 'item.place' && action.groupFrom ? { groupFrom: { ...action.groupFrom,
      periodKey: action.groupFrom.periodKey ? align(action.groupFrom.periodKey) : null } } : {}),
  }
}

/** Offline rollovers had no server sequence. Only their own imported placement chain can supply that predecessor. */
export function followsImportedPlacement(driver: SqlDriver, op: SyncOp, seq: number): boolean {
  if (!op.importedCalendar || !seq) return false
  const row = driver.prepare("SELECT payload FROM sync_ops WHERE seq=? AND state='applied'").get(seq)
  if (!row) return false
  const predecessor = JSON.parse(String(row.payload)) as SyncOp
  return predecessor.importedCalendar?.id === op.importedCalendar.id
}
