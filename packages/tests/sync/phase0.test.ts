import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { mergeRemoteOps, projectionHash, rebuildVisibleFull, cancelIfNeverSent, markSendUnknown } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { planPushBatches } from '@goalloom/sync'
import { emitRolloverOp } from '../../../apps/desktop/src/main/workspace/sync/emit'
import { openDatabase } from '../../../apps/desktop/src/main/storage/database'
import { migrate } from '../../../apps/desktop/src/main/storage/schema'
import { Repository } from '../../../apps/desktop/src/main/workspace/repository'
import { at, color, fakeHost, openSync, op, pendingOp, seedItem } from './fixture'

it('case 9 blue rebase keeps the canonical colours', () => {
  const { db, driver, host } = openSync()
  seedItem(driver, 'base', 'A', 'A', 1)
  seedItem(driver, 'base', 'B', 'B', null, 1024)
  driver.prepare(`INSERT INTO base_planning_periods (id,horizon,startDate,endDate,startAt,endAt) VALUES ('month-1','month','2026-09-01','2026-10-01','2026-09-01T00:00:00.000Z','2026-10-01T00:00:00.000Z')`).run()
  driver.prepare(`UPDATE base_item_placements SET horizon='month', periodId='month-1' WHERE itemId IN ('A','B')`).run()
  pendingOp(driver, op({ opId: randomUUID(), actions: [{ t: 'item.set', id: 'A', fields: { flowColor: 2 } }] }))
  mergeRemoteOps(driver, [{ seq: 1, op: op({ opId: randomUUID(), actions: [{ t: 'item.set', id: 'B', fields: { flowColor: 2 } }] }) }], host, at)
  expect(color(driver, 'A')).toBe(1)
  expect(color(driver, 'B')).toBe(2)
  expect(String(driver.prepare("SELECT state FROM sync_ops WHERE payload LIKE '%\"A\"%'").get()?.state)).toBe('never_sent')
  expect(driver.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  db.close()
})

it('case 11 a future accepted op is not rejected by an intermediate batch', () => {
  const { db, driver, host } = openSync()
  seedItem(driver, 'base', 'P', '父', null)
  seedItem(driver, 'base', 'C', '子', null, 1024)
  driver.prepare(`INSERT INTO base_planning_periods (id,horizon,startDate,endDate,startAt,endAt) VALUES ('y','year','2026-01-01','2027-01-01','2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z'), ('m','month','2026-09-01','2026-10-01','2026-09-01T00:00:00.000Z','2026-10-01T00:00:00.000Z')`).run()
  driver.prepare(`UPDATE base_item_placements SET horizon='year', periodId='y' WHERE itemId='P'`).run()
  driver.prepare(`UPDATE base_item_placements SET horizon='month', periodId='m' WHERE itemId='C'`).run()
  driver.prepare('UPDATE sync_state SET lastAppliedSeq=100').run()
  const deleteId = randomUUID(), restoreId = randomUUID(), linkId = randomUUID()
  pendingOp(driver, op({ opId: linkId, actions: [{ t: 'rel.link', id: 'edge-1', parentId: 'P', childId: 'C' }] }), 'accepted', 103)
  mergeRemoteOps(driver, [{ seq: 101, op: op({ opId: deleteId, actions: [{ t: 'item.delete', id: 'P' }] }) }], host, at)
  expect(driver.prepare('SELECT state, outcome FROM sync_ops WHERE opId=?').get(linkId)).toMatchObject({ state: 'accepted', outcome: null })
  mergeRemoteOps(driver, [
    { seq: 102, op: op({ opId: restoreId, actions: [{ t: 'item.restore', id: 'P', expectedDeleteOpId: deleteId }] }) },
    { seq: 103, op: op({ opId: linkId, actions: [{ t: 'rel.link', id: 'edge-1', parentId: 'P', childId: 'C' }] }) },
  ], host, at)
  expect(driver.prepare("SELECT count(*) AS n FROM item_relations WHERE id='edge-1' AND invalidatedAt IS NULL").get()!.n).toBe(1)
  expect(String(driver.prepare('SELECT outcome FROM sync_ops WHERE opId=?').get(linkId)?.outcome)).toBe('applied')
  db.close()
})

it('case 12 canonical history matches across devices', () => {
  const left = openSync(), right = openSync()
  for (const box of [left, right]) seedItem(box.driver, 'base', 'X', 'X', null)
  const remote = [
    { seq: 1, op: op({ opId: randomUUID(), actions: [{ t: 'item.set', id: 'X', fields: { title: 'B' } }] }) },
    { seq: 2, op: op({ opId: randomUUID(), actions: [{ t: 'item.set', id: 'X', fields: { title: 'A' } }] }) },
  ]
  pendingOp(left.driver, op({ opId: randomUUID(), actions: [{ t: 'item.set', id: 'X', fields: { title: 'local' } }] }))
  mergeRemoteOps(left.driver, remote, left.host, at)
  mergeRemoteOps(right.driver, remote, right.host, at)
  expect(left.driver.prepare('SELECT title FROM base_items').get()).toEqual(right.driver.prepare('SELECT title FROM base_items').get())
  expect(left.driver.prepare('SELECT dim, after FROM canon_changes ORDER BY seq, idx').all()).toEqual(right.driver.prepare('SELECT dim, after FROM canon_changes ORDER BY seq, idx').all())
  expect(projectionHash(left.driver, 'base')).not.toBe('')
  left.db.close(); right.db.close()
})

it('case 19 releases relations, accepts remote guidance, and retries a cancelled create once', () => {
  const { db, driver, host } = openSync()
  seedItem(driver, 'base', 'A', 'A', null)
  seedItem(driver, 'base', 'B', 'B', 3, 1024)
  driver.prepare(`INSERT INTO base_item_relations (id,parentId,childId,invalidatedAt,invalidatedBy,reason,createdAt) VALUES ('r1','A','B',?,?, 'unlink', ?)`).run(at, 'remote', at)
  rebuildVisibleFull(driver, host)
  driver.prepare(`UPDATE items SET flowColor=NULL WHERE id='B'`).run()
  driver.prepare(`UPDATE item_relations SET invalidatedAt=NULL, invalidatedBy=NULL, reason=NULL WHERE id='r1'`).run()
  rebuildVisibleFull(driver, host)
  expect(color(driver, 'B')).toBe(3)
  expect(driver.prepare(`SELECT invalidatedAt FROM item_relations WHERE id='r1'`).get()?.invalidatedAt).toBeTruthy()
  driver.prepare(`INSERT INTO base_item_guidance (itemId,revision,value,updatedAt,operationId) VALUES ('A', 1, NULL, ?, 'remote-only')`).run(at)
  rebuildVisibleFull(driver, host)
  expect(driver.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  expect(driver.prepare('SELECT count(*) AS n FROM operations').get()!.n).toBe(0)

  const repo = new Repository(db, { now: () => at })
  const generation = () => repo.store.workspace().generation
  repo.execute({ type: 'confirmSetup', operationId: randomUUID(), generation: generation(), timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-21' }, confirmed: true })
  const operationId = randomUUID()
  const created = repo.execute({ type: 'create', operationId, generation: generation(), title: '临时', horizon: 'later' })
  repo.execute({ type: 'undo', operationId: randomUUID(), generation: generation(), originalOperationId: operationId })
  rebuildVisibleFull(driver, host)
  expect(driver.prepare('SELECT id FROM items WHERE id=? AND deletedAt IS NULL').get(created.itemId!)).toBeUndefined()
  const again = repo.execute({ type: 'create', operationId, generation: generation(), title: '临时', horizon: 'later' })
  expect(again.itemId).toBe(created.itemId)
  expect(driver.prepare("SELECT count(*) AS n FROM items WHERE title='临时' AND deletedAt IS NULL").get()!.n).toBe(0)
  db.close()
})

it('cases 2, 3, 10 and 20 keep send_unknown and do not resurrect', () => {
  const db = openDatabase(':memory:')
  migrate(db)
  const repo = new Repository(db, { now: () => at })
  const generation = () => repo.store.workspace().generation
  const run = (command: Record<string, unknown>) => repo.execute({ ...command, operationId: randomUUID(), generation: generation() })
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-21' }, confirmed: true })
  const operationId = randomUUID()
  const created = repo.execute({ type: 'create', operationId, generation: generation(), title: '会同步', horizon: 'later' })
  const driver = nodeSqlDriver(db)
  markSendUnknown(driver, [operationId], 'attempt-1', at)
  expect(cancelIfNeverSent(driver, operationId, at)).toBe(false)
  expect(() => driver.prepare(`UPDATE sync_ops SET state='never_sent' WHERE opId=?`).run(operationId)).toThrow(/send_state_irreversible/)
  run({ type: 'undo', originalOperationId: operationId })
  expect(String(driver.prepare('SELECT state FROM sync_ops WHERE opId=?').get(operationId)?.state)).toBe('send_unknown')
  const revert = driver.prepare("SELECT opId, payload FROM sync_ops WHERE opId!=? AND json_extract(payload,'$.actions[0].t')='revert'").get(operationId)
  expect(revert).toBeTruthy()
  const host = fakeHost()
  const createPayload = JSON.parse(String(driver.prepare('SELECT payload FROM sync_ops WHERE opId=?').get(operationId)!.payload))
  mergeRemoteOps(driver, [{ seq: 1, op: createPayload }, { seq: 2, op: JSON.parse(String(revert!.payload)) }], host, at)
  expect(driver.prepare('SELECT deletedAt FROM items WHERE id=?').get(created.itemId!)?.deletedAt).toBeTruthy()
  const gap = openSync()
  pendingOp(gap.driver, op({ opId: randomUUID(), actions: [{ t: 'item.set', id: 'missing', fields: { title: 'nope' } }] }))
  expect(() => mergeRemoteOps(gap.driver, [{ seq: 5, op: op({ opId: randomUUID(), actions: [{ t: 'item.create', id: 'Z', title: 'Z', description: '', dueDate: null, horizon: 'later', periodKey: null, sortHint: { afterId: null, beforeId: null } }] }) }], gap.host, at)).toThrow()
  expect(String(gap.driver.prepare('SELECT state FROM sync_ops').get()?.state)).toBe('never_sent')
  expect(Number(gap.driver.prepare('SELECT lastAppliedSeq AS n FROM sync_state').get()?.n)).toBe(0)
  db.close(); gap.db.close()
})

it('cases 13 and 14 share a rollover hash and reject a stale one', () => {
  const first = openSync(), second = openSync()
  for (const box of [first, second]) {
    box.driver.prepare(`UPDATE sync_state SET workspaceId='11111111-1111-4111-8111-111111111111'`).run()
    box.driver.prepare(`INSERT INTO planning_periods (id,horizon,startDate,endDate,startAt,endAt) VALUES ('from','week','2026-09-21','2026-09-28','2026-09-20T16:00:00.000Z','2026-09-27T16:00:00.000Z')`).run()
    box.driver.prepare(`INSERT INTO base_planning_periods SELECT * FROM planning_periods`).run()
    seedItem(box.driver, 'base', 'item', '任务', null)
    box.driver.prepare(`UPDATE base_item_placements SET horizon='week', periodId='from' WHERE itemId='item'`).run()
    box.driver.prepare(`INSERT INTO rollover_policies (horizon,mode,version,effectiveFromPeriodId) VALUES ('week','auto',1,'from')`).run()
    box.driver.prepare(`INSERT INTO base_rollover_policies SELECT * FROM rollover_policies`).run()
    box.driver.prepare(`INSERT INTO planning_periods (id,horizon,startDate,endDate,startAt,endAt) VALUES ('to','week','2026-09-28','2026-10-05','2026-09-27T16:00:00.000Z','2026-10-04T16:00:00.000Z')`).run()
  }
  emitRolloverOp(first.db, { itemId: 'item', fromPeriodId: 'from', toPeriodId: 'to', placementSeq: 0, at })
  emitRolloverOp(second.db, { itemId: 'item', fromPeriodId: 'from', toPeriodId: 'to', placementSeq: 0, at })
  expect(first.driver.prepare('SELECT payloadHash FROM sync_ops').get()?.payloadHash).toBe(second.driver.prepare('SELECT payloadHash FROM sync_ops').get()?.payloadHash)
  const stale = openSync()
  seedItem(stale.driver, 'base', 'item', '任务', null)
  mergeRemoteOps(stale.driver, [{ seq: 1, op: op({ opId: randomUUID(), actions: [{ t: 'item.rollover', id: 'item', from: { periodKey: { horizon: 'week', startDate: '2026-09-21' }, placementSeq: 4 }, to: { horizon: 'week', startDate: '2026-09-28' }, position: 'append' }] }) }], stale.host, at)
  expect(String(stale.driver.prepare('SELECT errorCode FROM canon_ops WHERE seq=1').get()?.errorCode)).toBe('rollover_stale')
  first.db.close(); second.db.close(); stale.db.close()
})

it('case 18 does not let a later complete pass a blob that is not ready', () => {
  const batches = planPushBatches([
    { opId: 'create', localOrder: 1, bytes: 100, blobReady: false },
    { opId: 'complete', localOrder: 2, bytes: 80, blobReady: true },
  ])
  expect(batches).toEqual([])
  const ready = planPushBatches([
    { opId: 'create', localOrder: 1, bytes: 100, blobReady: true },
    { opId: 'complete', localOrder: 2, bytes: 80, blobReady: true },
  ])
  expect(ready).toEqual([['create', 'complete']])
})
