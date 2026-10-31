/**
 * [INPUT]: Synchronous SQL, deterministic period mapping and optional offline-history preparation. Promise-returning transaction bodies are rejected.
 * [OUTPUT]: exec / prepare / transaction with the same shape on node:sqlite and, later, expo-sqlite.
 * [POS]: The only database port store-core uses. File IO is not part of this interface.
 */
import type { SyncOp } from '@goalloom/contracts'

export type SqlValue = null | string | number | bigint | Uint8Array
export interface SqlStatement {
  run(...params: SqlValue[]): { changes: number }
  get(...params: SqlValue[]): Record<string, SqlValue> | undefined
  all(...params: SqlValue[]): Record<string, SqlValue>[]
}
export interface SqlDriver {
  exec(sql: string): void
  prepare(sql: string): SqlStatement
  transaction<T>(fn: () => T): T
}

export interface PeriodRow {
  id: string; horizon: string; startDate: string; endDate: string; startAt: string; endAt: string
}
export interface ApplyHost {
  materializePeriod(horizon: string, startDate: string, calendarJson?: string): PeriodRow
  /** Maps a captured period onto the calendar already installed by the remote log. */
  alignImportedPeriod?(localCalendarJson: string, horizon: string, startDate: string, at: string, targetCalendarJson?: string): string
  /** Missing pre-sync history, inserted before the next ordinary command during first connection only. */
  offlineOperations?(): { op: SyncOp; beforeOpId: string | null }[]
}

export class SyncApplyError extends Error {
  constructor(readonly code: string, message = code) { super(message); this.name = 'SyncApplyError' }
}
