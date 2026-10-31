/**
 * [INPUT]: Ordered numeric neighbors or one visible/base placement-local sibling scope and semantic anchors.
 * [OUTPUT]: Gap-safe keys, semantic undo anchors and deterministic sibling normalization with increasing placement versions.
 * [POS]: Shared allocation policy for desktop writes and sync replay; normalization preserves semantic order and receipts.
 */
import { SyncApplyError, type SqlDriver } from './driver'
import { localParentSql } from './outline'

export const SORT_KEY_STEP = 1024

export function sortKeyBetween(previous: number | undefined, next: number | undefined): number | null {
  const key = previous === undefined ? (next ?? SORT_KEY_STEP) - SORT_KEY_STEP
    : next === undefined ? previous + SORT_KEY_STEP : previous + (next - previous) / 2
  return !Number.isFinite(key) || Math.abs(key) > 1e15 || key === previous || key === next ? null : key
}

export function sortKey(driver: SqlDriver, prefix: string, horizon: string, periodId: string | null, afterId: string | null, beforeId: string | null, excluded: string | null, nestingParentId: string | null, strict = false): number {
  if (nestingParentId && !driver.prepare(`SELECT 1 FROM ${prefix}item_placements WHERE itemId=? AND horizon=? AND periodId IS ?`).get(nestingParentId, horizon, periodId)) nestingParentId = null
  const rows = driver.prepare(`SELECT p.itemId,p.sortKey FROM ${prefix}item_placements p JOIN ${prefix}items i ON i.id=p.itemId
    WHERE i.deletedAt IS NULL AND p.horizon=? AND p.periodId IS ? AND ${localParentSql(prefix)} IS ? AND p.itemId IS NOT ? ORDER BY p.sortKey,p.itemId`).all(horizon, periodId, nestingParentId, excluded)
  const before = rows.findIndex(row => row.itemId === beforeId), after = rows.findIndex(row => row.itemId === afterId)
  const slot = before >= 0 ? before : after >= 0 ? after + 1 : rows.length
  if (strict && ((slot > 0 ? rows[slot - 1]!.itemId : null) !== afterId || (slot < rows.length ? rows[slot]!.itemId : null) !== beforeId)) {
    throw new SyncApplyError('revert_superseded')
  }
  const calculate = () => sortKeyBetween(slot > 0 ? Number(rows[slot - 1]!.sortKey) : undefined,
    slot < rows.length ? Number(rows[slot]!.sortKey) : undefined)
  const key = calculate()
  if (key !== null) return key
  const update = driver.prepare(`UPDATE ${prefix}item_placements SET sortKey=?,version=version+1 WHERE itemId=?`)
  rows.forEach((row, index) => {
    row.sortKey = (index + 1) * SORT_KEY_STEP
    update.run(row.sortKey, row.itemId!)
  })
  // Normalized peers have one full step between every pair, including either boundary.
  return calculate()!
}

export function placementSortHint(driver: SqlDriver, prefix: string, itemId: string): { afterId: string | null; beforeId: string | null } {
  const neighbor = (comparison: '<' | '>', order: 'ASC' | 'DESC') => {
    const row = driver.prepare(`SELECT p.itemId FROM ${prefix}item_placements p JOIN ${prefix}items i ON i.id=p.itemId
      JOIN ${prefix}item_placements current ON current.itemId=?
      WHERE i.deletedAt IS NULL AND p.horizon=current.horizon AND p.periodId IS current.periodId
      AND ${localParentSql(prefix)} IS ${localParentSql(prefix, 'current')}
      AND (p.sortKey,p.itemId) ${comparison} (current.sortKey,current.itemId) ORDER BY p.sortKey ${order},p.itemId ${order} LIMIT 1`).get(itemId)
    return row ? String(row.itemId) : null
  }
  return { afterId: neighbor('<', 'DESC'), beforeId: neighbor('>', 'ASC') }
}
