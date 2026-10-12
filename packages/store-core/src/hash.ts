import { sha256Hex } from '@goalloom/crypto'
import type { SqlDriver } from './driver'

const tables = ['workspace', 'planning_periods', 'items', 'item_placements', 'item_relations', 'rollover_policies', 'item_guidance'] as const

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
