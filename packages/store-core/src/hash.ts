/**
 * [INPUT]: A base_ or visible business projection.
 * [OUTPUT]: projectionHash over every business table, period focus included.
 * [POS]: Cross-device projection equality check; omits history and device-local workspace columns.
 */
import { sha256Hex } from '@goalloom/crypto'
import { businessTables as tables } from '@goalloom/schema'
import type { SqlDriver } from './driver'

/** Canonical business projection. Omits operations, events and device-local workspace columns. */
export function projectionHash(driver: SqlDriver, scope: 'base' | 'visible'): string {
  const prefix = scope === 'base' ? 'base_' : ''
  const parts: unknown[] = []
  for (const table of tables) {
    const columns = table === 'workspace'
      ? 'generation, calendar, setupConfirmedAt, revision'
      : '*'
    parts.push([table, driver.prepare(`SELECT ${columns} FROM ${prefix}${table} ORDER BY 1`).all()])
  }
  return sha256Hex(JSON.stringify(parts))
}
