import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { mergeRemoteOps, rebuildVisibleFull } from '@goalloom/store-core'
import type { SqlDriver } from '@goalloom/store-core'
import type { SyncOp } from '@goalloom/contracts'
import { at, openSync, op, seedItem } from './fixture'

function periods(driver: SqlDriver): void {
  driver.prepare(`INSERT INTO base_planning_periods (id,horizon,startDate,endDate,startAt,endAt) VALUES
    ('year-1','year','2026-01-01','2027-01-01','2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z'),
    ('month-1','month','2026-09-01','2026-10-01','2026-09-01T00:00:00.000Z','2026-10-01T00:00:00.000Z')`).run()
}

function place(driver: SqlDriver, id: string, horizon: string, periodId: string | null): void {
  driver.prepare('UPDATE base_item_placements SET horizon=?, periodId=? WHERE itemId=?').run(horizon, periodId, id)
}

function apply(driver: SqlDriver, host: ReturnType<typeof openSync>['host'], seq: number, actions: SyncOp['actions'], opId = randomUUID()): string {
  mergeRemoteOps(driver, [{ seq, op: op({ opId, actions }) }], host, at)
  return opId
}

function edgeLive(driver: SqlDriver, id = 'edge-1'): boolean {
  const row = driver.prepare('SELECT invalidatedAt FROM base_item_relations WHERE id=?').get(id)
  return !!row && row.invalidatedAt === null
}

function colorOf(driver: SqlDriver, id: string): number | null {
  const row = driver.prepare('SELECT flowColor FROM base_items WHERE id=?').get(id)
  return row?.flowColor === null || row?.flowColor === undefined ? null : Number(row.flowColor)
}

it('rejects a link whose parent is not in a strictly longer horizon', () => {
  const { db, driver, host } = openSync()
  periods(driver)
  seedItem(driver, 'base', 'P', '父', null)
  seedItem(driver, 'base', 'C', '子', null, 1024)
  apply(driver, host, 1, [{ t: 'rel.link', id: 'edge-1', parentId: 'P', childId: 'C' }])
  expect(String(driver.prepare('SELECT errorCode FROM canon_ops WHERE seq=1').get()?.errorCode)).toBe('horizon_order')
  expect(driver.prepare('SELECT count(*) AS n FROM base_item_relations').get()?.n).toBe(0)
  place(driver, 'P', 'month', 'month-1')
  place(driver, 'C', 'month', 'month-1')
  apply(driver, host, 2, [{ t: 'rel.link', id: 'edge-1', parentId: 'P', childId: 'C' }])
  expect(String(driver.prepare('SELECT errorCode FROM canon_ops WHERE seq=2').get()?.errorCode)).toBe('horizon_order')
  place(driver, 'P', 'month', 'month-1')
  place(driver, 'C', 'year', 'year-1')
  apply(driver, host, 3, [{ t: 'rel.link', id: 'edge-1', parentId: 'P', childId: 'C' }])
  expect(String(driver.prepare('SELECT errorCode FROM canon_ops WHERE seq=3').get()?.errorCode)).toBe('horizon_order')
  place(driver, 'P', 'year', 'year-1')
  place(driver, 'C', 'month', 'month-1')
  apply(driver, host, 4, [{ t: 'rel.link', id: 'edge-1', parentId: 'P', childId: 'C' }])
  expect(driver.prepare('SELECT errorCode FROM canon_ops WHERE seq=4').get()?.errorCode).toBeNull()
  expect(edgeLive(driver)).toBe(true)
  db.close()
})

it('promotes a flow color only onto an isolated uncolored parent', () => {
  const { db, driver, host } = openSync()
  periods(driver)
  seedItem(driver, 'base', 'P', '父', null)
  seedItem(driver, 'base', 'C', '子', 4, 1024)
  place(driver, 'P', 'year', 'year-1')
  place(driver, 'C', 'month', 'month-1')
  apply(driver, host, 1, [{ t: 'rel.link', id: 'edge-1', parentId: 'P', childId: 'C' }])
  expect(String(driver.prepare('SELECT errorCode FROM canon_ops WHERE seq=1').get()?.errorCode)).toBe('flow_root_parent')
  expect(colorOf(driver, 'C')).toBe(4)
  const linkId = apply(driver, host, 2, [{ t: 'rel.link', id: 'edge-1', parentId: 'P', childId: 'C', adoptParentFlow: true }])
  expect(colorOf(driver, 'P')).toBe(4)
  expect(colorOf(driver, 'C')).toBeNull()
  expect(edgeLive(driver)).toBe(true)
  apply(driver, host, 3, [{ t: 'revert', targetOpId: linkId, mode: 'all_or_nothing' }])
  expect(colorOf(driver, 'P')).toBeNull()
  expect(colorOf(driver, 'C')).toBe(4)
  expect(edgeLive(driver)).toBe(false)

  seedItem(driver, 'base', 'Colored', '有色', 1)
  seedItem(driver, 'base', 'Child', '下级', 2)
  place(driver, 'Colored', 'year', 'year-1')
  place(driver, 'Child', 'month', 'month-1')
  apply(driver, host, 4, [{ t: 'rel.link', id: 'edge-2', parentId: 'Colored', childId: 'Child', adoptParentFlow: true }])
  expect(colorOf(driver, 'Colored')).toBe(1)
  expect(colorOf(driver, 'Child')).toBeNull()

  seedItem(driver, 'base', 'Root', '根', null)
  seedItem(driver, 'base', 'Mid', '中', null)
  seedItem(driver, 'base', 'Leaf', '叶', 6)
  driver.prepare(`INSERT INTO base_planning_periods (id,horizon,startDate,endDate,startAt,endAt) VALUES ('week-1','week','2026-09-21','2026-09-28','2026-09-21T00:00:00.000Z','2026-09-28T00:00:00.000Z')`).run()
  place(driver, 'Root', 'year', 'year-1')
  place(driver, 'Mid', 'month', 'month-1')
  place(driver, 'Leaf', 'week', 'week-1')
  apply(driver, host, 5, [{ t: 'rel.link', id: 'edge-3', parentId: 'Root', childId: 'Mid' }])
  apply(driver, host, 6, [{ t: 'rel.link', id: 'edge-4', parentId: 'Root', childId: 'Leaf', adoptParentFlow: true }])
  expect(colorOf(driver, 'Root')).toBeNull()
  expect(colorOf(driver, 'Leaf')).toBeNull()
  expect(edgeLive(driver, 'edge-4')).toBe(true)
  db.close()
})

it('restores sortKey, link, and unlink when those ops are reverted', () => {
  const { db, driver, host } = openSync()
  periods(driver)
  seedItem(driver, 'base', 'A', '甲', null, 0)
  seedItem(driver, 'base', 'B', '乙', null, 1024)
  const placeId = apply(driver, host, 1, [{ t: 'item.place', id: 'B', horizon: 'later', periodKey: null, sortHint: { afterId: null, beforeId: 'A' }, reason: 'arrange' }])
  expect(Number(driver.prepare(`SELECT sortKey FROM base_item_placements WHERE itemId='B'`).get()?.sortKey)).toBeLessThan(0)
  apply(driver, host, 2, [{ t: 'revert', targetOpId: placeId, mode: 'all_or_nothing' }])
  expect(Number(driver.prepare(`SELECT sortKey FROM base_item_placements WHERE itemId='B'`).get()?.sortKey)).toBe(1024)

  place(driver, 'A', 'year', 'year-1')
  place(driver, 'B', 'month', 'month-1')
  const linkId = apply(driver, host, 3, [{ t: 'rel.link', id: 'edge-1', parentId: 'A', childId: 'B' }])
  expect(edgeLive(driver)).toBe(true)
  apply(driver, host, 4, [{ t: 'revert', targetOpId: linkId, mode: 'all_or_nothing' }])
  expect(edgeLive(driver)).toBe(false)
  apply(driver, host, 5, [{ t: 'rel.link', id: 'edge-2', parentId: 'A', childId: 'B' }])
  const unlinkId = apply(driver, host, 6, [{ t: 'rel.unlink', id: 'edge-2' }])
  expect(edgeLive(driver, 'edge-2')).toBe(false)
  apply(driver, host, 7, [{ t: 'revert', targetOpId: unlinkId, mode: 'all_or_nothing' }])
  expect(edgeLive(driver, 'edge-2')).toBe(true)
  db.close()
})

it('records Later parent releases and restores them, including a paired unlink', () => {
  const { db, driver, host } = openSync()
  periods(driver)
  seedItem(driver, 'base', 'P', '父', null)
  seedItem(driver, 'base', 'C', '子', null, 1024)
  place(driver, 'P', 'year', 'year-1')
  place(driver, 'C', 'month', 'month-1')
  apply(driver, host, 1, [{ t: 'rel.link', id: 'edge-1', parentId: 'P', childId: 'C' }])
  const moved = apply(driver, host, 2, [{ t: 'item.place', id: 'C', horizon: 'later', periodKey: null, sortHint: { afterId: null, beforeId: null }, reason: 'move' }])
  expect(edgeLive(driver)).toBe(false)
  expect(driver.prepare(`SELECT count(*) AS n FROM canon_changes WHERE seq=2 AND dim='relation'`).get()?.n).toBe(1)
  apply(driver, host, 3, [{ t: 'revert', targetOpId: moved, mode: 'all_or_nothing' }])
  expect(edgeLive(driver)).toBe(true)
  expect(String(driver.prepare(`SELECT horizon FROM base_item_placements WHERE itemId='C'`).get()?.horizon)).toBe('month')

  const paired = apply(driver, host, 4, [
    { t: 'item.place', id: 'C', horizon: 'later', periodKey: null, sortHint: { afterId: null, beforeId: null }, reason: 'move' },
    { t: 'rel.unlink', id: 'edge-1' },
  ])
  expect(String(driver.prepare('SELECT outcome FROM canon_ops WHERE seq=4').get()?.outcome)).toBe('applied')
  expect(driver.prepare(`SELECT count(*) AS n FROM canon_changes WHERE seq=4 AND dim='relation'`).get()?.n).toBe(1)
  expect(edgeLive(driver)).toBe(false)
  apply(driver, host, 5, [{ t: 'revert', targetOpId: paired, mode: 'all_or_nothing' }])
  expect(edgeLive(driver)).toBe(true)
  db.close()
})

it('revives delete-owned edges except a deleted endpoint or a flow-root child', () => {
  const { db, driver, host } = openSync()
  periods(driver)
  seedItem(driver, 'base', 'P', '父', null)
  seedItem(driver, 'base', 'C', '子', null, 1024)
  place(driver, 'P', 'year', 'year-1')
  place(driver, 'C', 'month', 'month-1')
  apply(driver, host, 1, [{ t: 'rel.link', id: 'edge-1', parentId: 'P', childId: 'C' }])
  const deleted = apply(driver, host, 2, [{ t: 'item.delete', id: 'C' }])
  apply(driver, host, 3, [{ t: 'item.restore', id: 'C', expectedDeleteOpId: deleted }])
  expect(edgeLive(driver)).toBe(true)
  expect(driver.prepare(`SELECT deletedAt FROM base_items WHERE id='C'`).get()?.deletedAt).toBeNull()

  const deletedChild = apply(driver, host, 4, [{ t: 'item.delete', id: 'C' }])
  apply(driver, host, 5, [{ t: 'item.delete', id: 'P' }])
  apply(driver, host, 6, [{ t: 'item.restore', id: 'C', expectedDeleteOpId: deletedChild }])
  expect(edgeLive(driver)).toBe(false)

  seedItem(driver, 'base', 'D', '丁', null)
  seedItem(driver, 'base', 'E', '戊', null)
  place(driver, 'D', 'year', 'year-1')
  place(driver, 'E', 'month', 'month-1')
  apply(driver, host, 7, [{ t: 'rel.link', id: 'edge-2', parentId: 'D', childId: 'E' }])
  const deletedRoot = apply(driver, host, 8, [{ t: 'item.delete', id: 'D' }])
  driver.prepare(`UPDATE base_items SET flowColor=5 WHERE id='E'`).run()
  apply(driver, host, 9, [{ t: 'item.restore', id: 'D', expectedDeleteOpId: deletedRoot }])
  expect(edgeLive(driver, 'edge-2')).toBe(false)
  expect(colorOf(driver, 'E')).toBe(5)

  seedItem(driver, 'base', 'F', '己', 3)
  seedItem(driver, 'base', 'G', '庚', null)
  const deletedColor = apply(driver, host, 10, [{ t: 'item.delete', id: 'F' }])
  driver.prepare(`UPDATE base_items SET flowColor=3 WHERE id='G'`).run()
  apply(driver, host, 11, [{ t: 'item.restore', id: 'F', expectedDeleteOpId: deletedColor }])
  expect(colorOf(driver, 'F')).toBeNull()
  expect(colorOf(driver, 'G')).toBe(3)
  db.close()
})

it('keeps the higher workspace revision across a visible rebuild', () => {
  const { db, driver, host } = openSync()
  driver.prepare('UPDATE workspace SET revision=4').run()
  driver.prepare('UPDATE base_workspace SET revision=1').run()
  rebuildVisibleFull(driver, host)
  expect(Number(driver.prepare('SELECT revision FROM workspace WHERE id=1').get()?.revision)).toBe(4)
  driver.prepare('UPDATE base_workspace SET revision=9').run()
  rebuildVisibleFull(driver, host)
  expect(Number(driver.prepare('SELECT revision FROM workspace WHERE id=1').get()?.revision)).toBe(9)
  db.close()
})
