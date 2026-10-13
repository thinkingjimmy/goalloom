import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { hex, publicFromSeed, sha256Hex, unhex, utf8 } from '@goalloom/crypto'
import { syncOpPayload, type CalendarWire, type SyncOp } from '@goalloom/contracts'
import {
  acceptRosterAdvance, bootstrapWorkspace, changeSyncPassword, createRemoteWorkspace, exchange, joinWorkspace, memoryCiphertext, memoryRemote, newDeviceSecret,
  queueBaseline, queueVisibleBaseline, repairRejectedBaseline, unlockWithPassword, SyncFailure, createMemoryWorld, type BoundWorkspace, type MemoryWorld,
} from '@goalloom/sync'
import { copyProjectionToBase, type ApplyHost, type SqlDriver } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../../../apps/desktop/src/main/storage/database'
import { migrate } from '../../../apps/desktop/src/main/storage/schema'
import { Repository } from '../../../apps/desktop/src/main/workspace/repository'
import { syncHost } from '../../../apps/desktop/src/main/sync/host'
import type { CommandInput } from '../../../apps/desktop/src/shared/contracts/commands'
import { openSync, seedItem } from './fixture'

const now = '2026-09-23T02:00:00.000Z'
type WithoutEnvelope<T> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never

function fresh() {
  const db = openDatabase(':memory:')
  migrate(db)
  const repo = new Repository(db, { now: () => now })
  const run = (command: WithoutEnvelope<CommandInput>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation } as CommandInput)
  return { db, repo, run, driver: nodeSqlDriver(db), host: syncHost(db) }
}

function desktop() {
  const db = openDatabase(':memory:')
  migrate(db)
  const repo = new Repository(db, { now: () => now })
  const run = (command: WithoutEnvelope<CommandInput>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation } as CommandInput)
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-21' }, confirmed: true })
  return { db, repo, run, driver: nodeSqlDriver(db), host: syncHost(db) }
}

async function register(world: MemoryWorld, session: string) {
  const remote = memoryRemote(world, session)
  const secret = newDeviceSecret()
  const deviceId = await remote.registerDevice({
    name: session, platform: 'linux',
    signPub: publicFromSeed('ed25519', secret.signSk), boxPub: publicFromSeed('x25519', secret.boxSk),
  })
  return { remote, secret, deviceId }
}

function push(side: { remote: ReturnType<typeof memoryRemote>; driver: SqlDriver; host: ApplyHost; deviceId: string }, bound: BoundWorkspace) {
  return exchange({
    remote: side.remote, driver: side.driver, host: side.host, deviceId: side.deviceId, workspaceId: bound.workspaceId,
    generation: bound.generation, epoch: bound.epoch, workspaceKey: bound.workspaceKey, at: now,
  })
}

function live(db: DatabaseSync) {
  return db.prepare(`SELECT i.title AS title, p.nestingParentId AS parent, i.deletedAt AS deleted
    FROM items i JOIN item_placements p ON p.itemId=i.id ORDER BY i.title`).all()
    .map(row => ({ title: String(row.title), parent: row.parent === null ? null : String(row.parent), deleted: row.deleted !== null }))
}

function confirmed(db: DatabaseSync) {
  const row = db.prepare('SELECT calendar, setupConfirmedAt FROM workspace WHERE id=1').get()
  return {
    calendar: row?.calendar ? JSON.parse(String(row.calendar)) as { id: string } : null,
    setupConfirmedAt: row?.setupConfirmedAt ? String(row.setupConfirmedAt) : null,
  }
}

function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (!needle.length || needle.length > haystack.length) return false
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((byte, offset) => haystack[index + offset] === byte)) return true
  }
  return false
}

it('converges a nested task between two computers without writing the title to the server', async () => {
  const world = createMemoryWorld()
  const first = desktop()
  const second = desktop()
  const alpha = await register(world, 'alpha')
  const beta = await register(world, 'beta')
  const bound = await bootstrapWorkspace({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', at: now,
  })
  const parent = first.run({ type: 'create', title: '季度目标', horizon: 'week' })
  const child = first.run({ type: 'create', title: '子任务', horizon: 'month', flowColor: 3 })
  const parentId = parent.itemId!
  const childId = child.itemId!
  const childRow = first.repo.store.item(childId)
  const parentRow = first.repo.store.item(parentId)
  first.run({
    type: 'nest', itemId: childId, parentId, expectedVersion: childRow.version, expectedParentVersion: parentRow.version,
    expectedPlacementVersion: childRow.placement.version, expectedParentPlacementVersion: parentRow.placement.version,
  })
  await push({ ...alpha, driver: first.driver, host: first.host }, bound)
  const joined = await joinWorkspace({
    remote: beta.remote, driver: second.driver, host: second.host, deviceId: beta.deviceId, secret: beta.secret,
    password: 'sync-pass', choice: 'use-remote', at: now,
  })
  expect(live(second.db)).toEqual(live(first.db))
  expect(second.db.prepare('SELECT nestingParentId FROM item_placements WHERE itemId=?').get(childId)).toMatchObject({ nestingParentId: parentId })
  expect(contains(unhex(memoryCiphertext(world)), utf8('季度目标'))).toBe(false)
  expect(contains(unhex(memoryCiphertext(world)), utf8('子任务'))).toBe(false)
  const chain = await alpha.remote.getRoster(bound.workspaceId, alpha.deviceId)
  const next = acceptRosterAdvance(bound.roster, chain, alpha.deviceId)
  expect(next.version).toBe(2)
  expect(next.devices.map(device => device.id).sort()).toEqual([alpha.deviceId, beta.deviceId].sort())
  expect(joined.workspaceId).toBe(bound.workspaceId)
  expect(second.repo.store.workspace().generation).not.toBe(bound.generation)
  first.db.close()
  second.db.close()
})

it('keeps an offline edit and records a delete that wins over a later edit', async () => {
  const world = createMemoryWorld()
  const first = desktop()
  const second = desktop()
  const alpha = await register(world, 'alpha')
  const beta = await register(world, 'beta')
  const bound = await bootstrapWorkspace({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', at: now,
  })
  const created = first.run({ type: 'create', title: '共享任务', horizon: 'later' })
  await push({ ...alpha, driver: first.driver, host: first.host }, bound)
  const joined = await joinWorkspace({
    remote: beta.remote, driver: second.driver, host: second.host, deviceId: beta.deviceId, secret: beta.secret,
    password: 'sync-pass', choice: 'use-remote', at: now,
  })
  world.online = false
  first.run({ type: 'create', title: '离线新增', horizon: 'later' })
  await expect(push({ ...alpha, driver: first.driver, host: first.host }, bound)).rejects.toMatchObject({ code: 'network' })
  world.online = true
  const item = second.repo.store.item(created.itemId!)
  second.run({ type: 'edit', itemId: item.id, expectedVersion: item.version, title: '改过的标题', description: item.description, dueDate: null })
  const original = first.repo.store.item(created.itemId!)
  first.run({ type: 'delete', itemId: original.id, expectedVersion: original.version })
  await push({ ...alpha, driver: first.driver, host: first.host }, bound)
  await push({ ...beta, driver: second.driver, host: second.host }, joined)
  await push({ ...alpha, driver: first.driver, host: first.host }, bound)
  for (const db of [first.db, second.db]) {
    expect(db.prepare('SELECT deletedAt FROM items WHERE title=?').get('共享任务')?.deletedAt).toBeTruthy()
    expect(db.prepare('SELECT title FROM items WHERE title=? AND deletedAt IS NULL').get('离线新增')?.title).toBe('离线新增')
    expect(String(db.prepare('SELECT code FROM sync_conflicts').get()?.code)).toBe('item_deleted')
  }
  first.db.close()
  second.db.close()
})

it('rejects a different sync password and baselines nested pre-sync rows', async () => {
  const world = createMemoryWorld()
  const { db, driver, host } = openSync()
  const parent = randomUUID()
  const child = randomUUID()
  seedItem(driver, 'base', parent, '基线父', null, 0)
  seedItem(driver, 'base', child, '基线子', null, 1)
  driver.prepare('UPDATE base_item_placements SET nestingParentId=? WHERE itemId=?').run(parent, child)
  const alpha = await register(world, 'alpha')
  const bound = await bootstrapWorkspace({
    remote: alpha.remote, driver, host, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', at: now,
  })
  await push({ ...alpha, driver, host }, bound)
  const peer = openSync()
  const beta = await register(world, 'beta')
  await expect(joinWorkspace({
    remote: beta.remote, driver: peer.driver, host: peer.host, deviceId: beta.deviceId, secret: beta.secret,
    password: 'other-pass', choice: 'use-remote', at: now,
  })).rejects.toBeInstanceOf(SyncFailure)
  await joinWorkspace({
    remote: beta.remote, driver: peer.driver, host: peer.host, deviceId: beta.deviceId, secret: beta.secret,
    password: 'sync-pass', choice: 'use-remote', at: now,
  })
  expect(db.prepare('SELECT nestingParentId FROM item_placements WHERE itemId=?').get(child)).toMatchObject({ nestingParentId: parent })
  expect(peer.db.prepare('SELECT nestingParentId FROM item_placements WHERE itemId=?').get(child)).toMatchObject({ nestingParentId: parent })
  expect(contains(unhex(memoryCiphertext(world)), utf8('基线子'))).toBe(false)
  expect(Number(db.prepare(`SELECT count(*) AS n FROM sync_ops WHERE payload LIKE '%item.nest%'`).get()?.n)).toBeGreaterThan(0)
  db.close()
  peer.db.close()
})

it('changes the password from an unlocked computer and resets cloud data from the local board', async () => {
  const world = createMemoryWorld()
  const first = desktop()
  const alpha = await register(world, 'alpha')
  const bound = await bootstrapWorkspace({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', at: now,
  })
  first.run({ type: 'create', title: '留在本机', horizon: 'later' })
  await push({ ...alpha, driver: first.driver, host: first.host }, bound)
  await changeSyncPassword({
    remote: alpha.remote, deviceId: alpha.deviceId, workspaceId: bound.workspaceId, recovery: bound.recovery, password: 'next-pass',
  })
  const beta = await register(world, 'beta')
  await expect(unlockWithPassword({ remote: beta.remote, deviceId: beta.deviceId, secret: beta.secret, password: 'sync-pass' })).rejects.toMatchObject({ code: 'password' })
  const unlocked = await unlockWithPassword({ remote: beta.remote, deviceId: beta.deviceId, secret: beta.secret, password: 'next-pass' })
  expect(hex(unlocked.bound.workspaceKey)).toBe(hex(bound.workspaceKey))
  await alpha.remote.resetSync(alpha.deviceId)
  expect(await alpha.remote.account()).toBeNull()
  queueVisibleBaseline(first.driver, first.host, alpha.deviceId, now)
  const again = await bootstrapWorkspace({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, secret: alpha.secret, password: 'fresh-pass', at: now,
  })
  expect(again.workspaceId).not.toBe(bound.workspaceId)
  await push({ ...alpha, driver: first.driver, host: first.host }, again)
  const peer = desktop()
  const gamma = await register(world, 'gamma')
  await expect(joinWorkspace({
    remote: gamma.remote, driver: peer.driver, host: peer.host, deviceId: gamma.deviceId, secret: gamma.secret,
    password: 'next-pass', choice: 'use-remote', at: now,
  })).rejects.toMatchObject({ code: 'password' })
  await joinWorkspace({
    remote: gamma.remote, driver: peer.driver, host: peer.host, deviceId: gamma.deviceId, secret: gamma.secret,
    password: 'fresh-pass', choice: 'use-remote', at: now,
  })
  expect(peer.db.prepare('SELECT title FROM items WHERE deletedAt IS NULL').all().map(row => String(row.title))).toContain('留在本机')
  first.db.close()
  peer.db.close()
})

it('keeps a configured board when the first computer enables sync', async () => {
  const world = createMemoryWorld()
  const first = desktop()
  first.run({ type: 'create', title: '已有任务', horizon: 'week' })
  const before = confirmed(first.db)
  const alpha = await register(world, 'alpha')
  const bound = await bootstrapWorkspace({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', at: now,
  })
  expect(confirmed(first.db)).toEqual(before)
  expect(first.db.prepare('SELECT title FROM items WHERE deletedAt IS NULL').all().map(row => String(row.title))).toContain('已有任务')
  await push({ ...alpha, driver: first.driver, host: first.host }, bound)
  expect(confirmed(first.db)).toEqual(before)
  expect(first.db.prepare('SELECT title FROM items WHERE deletedAt IS NULL').all().map(row => String(row.title))).toContain('已有任务')
  const peer = desktop()
  const beta = await register(world, 'beta')
  await joinWorkspace({
    remote: beta.remote, driver: peer.driver, host: peer.host, deviceId: beta.deviceId, secret: beta.secret,
    password: 'sync-pass', choice: 'use-remote', at: now,
  })
  expect(confirmed(peer.db).calendar?.id).toBe(before.calendar?.id)
  expect(peer.db.prepare('SELECT title FROM items WHERE deletedAt IS NULL').all().map(row => String(row.title))).toContain('已有任务')
  first.db.close()
  peer.db.close()
})

it('keeps an upgraded shadow board when the first computer enables sync', async () => {
  const world = createMemoryWorld()
  const first = desktop()
  const parent = first.run({ type: 'create', title: '年度方向', horizon: 'year', flowColor: 1 })
  const child = first.run({ type: 'create', title: '本周任务', horizon: 'week' })
  const parentRow = first.repo.store.item(parent.itemId!)
  const childRow = first.repo.store.item(child.itemId!)
  first.run({
    type: 'nest', itemId: child.itemId!, parentId: parent.itemId!, expectedVersion: childRow.version, expectedParentVersion: parentRow.version,
    expectedPlacementVersion: childRow.placement.version, expectedParentPlacementVersion: parentRow.placement.version,
  })
  copyProjectionToBase(first.driver)
  const before = confirmed(first.db)
  const alpha = await register(world, 'alpha')
  const bound = await bootstrapWorkspace({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', at: now,
  })
  expect(confirmed(first.db)).toEqual(before)
  expect(first.db.prepare('SELECT title FROM items WHERE deletedAt IS NULL ORDER BY title').all().map(row => String(row.title))).toEqual(['年度方向', '本周任务'])
  await push({ ...alpha, driver: first.driver, host: first.host }, bound)
  expect(confirmed(first.db)).toEqual(before)
  expect(first.db.prepare('SELECT nestingParentId FROM item_placements WHERE itemId=?').get(child.itemId!)).toMatchObject({ nestingParentId: parent.itemId })
  first.db.close()
})

it('keeps a moved goal edge when the upgraded board is baselined', async () => {
  const world = createMemoryWorld()
  const first = desktop()
  const parent = first.run({ type: 'create', title: '年度方向', horizon: 'year', flowColor: 1 })
  const child = first.run({ type: 'create', title: '月度任务', horizon: 'month' })
  const linkedParent = first.repo.store.item(parent.itemId!)
  const linkedChild = first.repo.store.item(child.itemId!)
  first.run({
    type: 'link', parentId: parent.itemId!, childId: child.itemId!,
    expectedParentVersion: linkedParent.version, expectedChildVersion: linkedChild.version,
  })
  const moved = first.repo.store.item(child.itemId!)
  first.run({
    type: 'move', itemId: child.itemId!, expectedVersion: moved.version, expectedPlacementVersion: moved.placement.version, horizon: 'year',
  })
  expect(first.db.prepare(`SELECT p.horizon AS horizon FROM items i JOIN item_placements p ON p.itemId=i.id WHERE i.deletedAt IS NULL ORDER BY i.title`).all())
    .toEqual([{ horizon: 'year' }, { horizon: 'year' }])
  expect(Number(first.db.prepare('SELECT count(*) AS n FROM item_relations WHERE invalidatedAt IS NULL').get()?.n)).toBe(1)
  copyProjectionToBase(first.driver)
  first.db.exec('DELETE FROM sync_ops')
  const before = confirmed(first.db)
  const alpha = await register(world, 'alpha')
  const started = '2026-10-13T07:56:00.000Z'
  const bound = await bootstrapWorkspace({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', at: started,
  })
  const payloads = first.db.prepare('SELECT payload FROM sync_ops ORDER BY localOrder').all().map(row => JSON.parse(String(row.payload)) as SyncOp)
  const calendarOp = payloads.find(op => op.actions.some(action => action.t === 'calendar.setup'))
  expect(calendarOp?.actions).toEqual([{ t: 'calendar.setup', calendar: before.calendar, confirmedAt: before.setupConfirmedAt }])
  expect(payloads.some(op => op.actions.length > 0 && op.actions.every(action => action.t === 'policy.set'))).toBe(true)
  expect(payloads.flatMap(op => op.actions).find(action => action.t === 'rel.link')).toMatchObject({ retain: true, parentId: parent.itemId, childId: child.itemId })
  expect(confirmed(first.db)).toEqual(before)
  expect(first.db.prepare('SELECT title FROM items WHERE deletedAt IS NULL ORDER BY title').all().map(row => String(row.title))).toEqual(['年度方向', '月度任务'])
  expect(first.db.prepare('SELECT parentId, childId FROM item_relations WHERE invalidatedAt IS NULL').get()).toMatchObject({ parentId: parent.itemId, childId: child.itemId })
  await push({ ...alpha, driver: first.driver, host: first.host }, bound)
  expect(first.db.prepare('SELECT errorCode FROM sync_ops WHERE errorCode IS NOT NULL').all()).toEqual([])
  expect(confirmed(first.db)).toEqual(before)
  expect(String(first.db.prepare('SELECT paused FROM sync_state WHERE id=1').get()?.paused ?? '')).toBe('')
  first.db.close()
})

it('rebuilds a rejected baseline from its payload without asking for setup again', () => {
  const first = desktop()
  const parent = first.run({ type: 'create', title: '年度方向', horizon: 'year', flowColor: 1 })
  const child = first.run({ type: 'create', title: '月度任务', horizon: 'month' })
  const parentId = parent.itemId!
  const childId = child.itemId!
  const linkedParent = first.repo.store.item(parentId)
  const linkedChild = first.repo.store.item(childId)
  first.run({
    type: 'link', parentId, childId, expectedParentVersion: linkedParent.version, expectedChildVersion: linkedChild.version,
  })
  const moved = first.repo.store.item(childId)
  first.run({ type: 'move', itemId: childId, expectedVersion: moved.version, expectedPlacementVersion: moved.placement.version, horizon: 'year' })
  const calendar = JSON.parse(String(first.db.prepare('SELECT calendar FROM workspace WHERE id=1').get()?.calendar)) as CalendarWire
  const startDate = String(first.db.prepare(`SELECT pp.startDate AS startDate FROM planning_periods pp JOIN item_placements p ON p.periodId=pp.id WHERE p.itemId=?`).get(parentId)?.startDate)
  const policies = first.db.prepare(`SELECT r.horizon AS horizon, r.mode AS mode, pp.startDate AS startDate, pp.horizon AS periodHorizon
    FROM rollover_policies r JOIN planning_periods pp ON pp.id=r.effectiveFromPeriodId`).all()
  const baselineAt = '2026-10-04T03:00:00.000Z'
  const deviceId = 'device-a'
  const baselineId = randomUUID()
  const edgeId = randomUUID()
  const baseline: SyncOp = {
    v: 1, opId: baselineId, deviceId, at: baselineAt,
    actions: [
      { t: 'calendar.setup', calendar },
      ...policies.map(row => ({
        t: 'policy.set' as const,
        horizon: String(row.horizon) as 'year',
        mode: String(row.mode) as 'auto',
        effectiveFromKey: { horizon: String(row.periodHorizon) as 'year', startDate: String(row.startDate) },
      })),
      { t: 'item.create', id: parentId, title: '年度方向', description: '', dueDate: null, horizon: 'year', periodKey: { horizon: 'year', startDate }, sortHint: { afterId: null, beforeId: null }, flowColor: 1 },
      { t: 'item.create', id: childId, title: '月度任务', description: '', dueDate: null, horizon: 'year', periodKey: { horizon: 'year', startDate }, sortHint: { afterId: parentId, beforeId: null } },
      { t: 'rel.link', id: edgeId, parentId, childId },
    ],
  }
  const rollover = (): SyncOp => ({
    v: 1, opId: randomUUID(), deviceId: 'system', at: '2026-09-28T00:00:00.000Z',
    actions: [{ t: 'item.rollover', id: childId, from: { periodKey: { horizon: 'month', startDate: '2026-09-01' }, placementSeq: 1 }, to: { horizon: 'month', startDate: '2026-10-01' }, position: 'append' }],
  })
  first.db.exec(`DELETE FROM item_guidance; DELETE FROM item_relations; DELETE FROM item_placements; DELETE FROM items;
    DELETE FROM base_item_guidance; DELETE FROM base_item_relations; DELETE FROM base_item_placements; DELETE FROM base_items; DELETE FROM sync_ops;`)
  first.db.prepare('UPDATE workspace SET calendar=NULL, setupConfirmedAt=NULL WHERE id=1').run()
  first.db.prepare('UPDATE base_workspace SET calendar=NULL, setupConfirmedAt=NULL WHERE id=1').run()
  const rejected = (op: SyncOp, order: number, seq: number, errorCode: string) => {
    const payload = syncOpPayload(op)
    first.db.prepare(`INSERT INTO sync_ops (opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,outcome,seq,errorCode,createdAt,updatedAt)
      VALUES (?,?,'local',1,?,?,?,?, 'applied','rejected',?,?,?,?)`).run(op.opId, order, payload, sha256Hex(payload), op.deviceId, op.at, seq, errorCode, baselineAt, baselineAt)
  }
  const earlyRollover = rollover()
  const nextRollover = rollover()
  rejected(baseline, 1, 1, 'horizon_order')
  rejected(earlyRollover, 2, 2, 'item_deleted')
  rejected(nextRollover, 3, 3, 'item_deleted')
  const unrelated: SyncOp = {
    v: 1, opId: randomUUID(), deviceId: 'device-b', at: '2026-10-12T00:00:00.000Z',
    actions: [{ t: 'item.set', id: childId, fields: { title: '另一处改动' } }],
  }
  rejected(unrelated, 4, 4, 'item_deleted')
  const conflict = (op: SyncOp, seq: number, code: string) => {
    first.db.prepare('INSERT INTO sync_conflicts (opId, seq, code, itemId, detail, at) VALUES (?,?,?,?,?,?)').run(op.opId, seq, code, childId, code, op.at)
  }
  conflict(baseline, 1, 'horizon_order')
  conflict(earlyRollover, 2, 'item_deleted')
  conflict(nextRollover, 3, 'item_deleted')
  conflict(unrelated, 4, 'item_deleted')
  first.db.prepare('UPDATE sync_state SET lastAppliedSeq=4, updatedAt=? WHERE id=1').run(baselineAt)
  expect(confirmed(first.db).setupConfirmedAt).toBeNull()
  expect(repairRejectedBaseline(first.driver, first.host)).toBe(true)
  expect(confirmed(first.db).calendar?.id).toBe(calendar.id)
  expect(confirmed(first.db).setupConfirmedAt).toBe(baselineAt)
  expect(first.db.prepare('SELECT title FROM items WHERE deletedAt IS NULL ORDER BY title').all().map(row => String(row.title))).toEqual(['年度方向', '月度任务'])
  expect(first.db.prepare('SELECT parentId, childId FROM item_relations WHERE invalidatedAt IS NULL').get()).toMatchObject({ parentId, childId })
  expect(first.db.prepare('SELECT opId FROM sync_conflicts').all().map(row => String(row.opId))).toEqual([unrelated.opId])
  expect(repairRejectedBaseline(first.driver, first.host)).toBe(false)
  expect(first.db.prepare('SELECT opId FROM sync_conflicts').all().map(row => String(row.opId))).toEqual([unrelated.opId])
  first.db.close()
})

it('drops stale baseline conflicts after the board is already restored', () => {
  const first = desktop()
  first.run({ type: 'create', title: '仍在的任务', horizon: 'later' })
  const title = '仍在的任务'
  const before = confirmed(first.db)
  const calendar = before.calendar as CalendarWire
  const baselineAt = '2026-10-04T03:00:00.000Z'
  const baseline: SyncOp = {
    v: 1, opId: randomUUID(), deviceId: 'device-a', at: baselineAt,
    actions: [{ t: 'calendar.setup', calendar }],
  }
  const rollover = (): SyncOp => ({
    v: 1, opId: randomUUID(), deviceId: 'system', at: '2026-09-28T00:00:00.000Z',
    actions: [{ t: 'item.rollover', id: randomUUID(), from: { periodKey: { horizon: 'month', startDate: '2026-09-01' }, placementSeq: 1 }, to: { horizon: 'month', startDate: '2026-10-01' }, position: 'append' }],
  })
  const applied: SyncOp = {
    v: 1, opId: randomUUID(), deviceId: 'device-a', at: '2026-10-13T01:00:00.000Z',
    actions: [{ t: 'item.set', id: randomUUID(), fields: { title: '后来的改动' } }],
  }
  const later = rollover()
  const write = (op: SyncOp, order: number, seq: number, outcome: 'rejected' | 'applied', errorCode: string | null) => {
    const payload = syncOpPayload(op)
    first.db.prepare(`INSERT INTO sync_ops (opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,outcome,seq,errorCode,createdAt,updatedAt)
      VALUES (?,?,'local',1,?,?,?,?, 'applied',?,?,?,?,?)`).run(op.opId, order, payload, sha256Hex(payload), op.deviceId, op.at, outcome, seq, errorCode, baselineAt, baselineAt)
    if (errorCode) first.db.prepare('INSERT INTO sync_conflicts (opId, seq, code, itemId, detail, at) VALUES (?,?,?,?,?,?)').run(op.opId, seq, errorCode, null, errorCode, op.at)
  }
  write(baseline, 80, 80, 'rejected', 'horizon_order')
  write(rollover(), 81, 81, 'rejected', 'item_deleted')
  write(rollover(), 82, 82, 'rejected', 'item_deleted')
  write(applied, 90, 90, 'applied', null)
  write(later, 91, 91, 'rejected', 'item_deleted')
  expect(repairRejectedBaseline(first.driver, first.host)).toBe(false)
  expect(confirmed(first.db)).toEqual(before)
  expect(String(first.db.prepare('SELECT title FROM items WHERE deletedAt IS NULL LIMIT 1').get()?.title ?? '')).toBe(title)
  expect(first.db.prepare('SELECT opId FROM sync_conflicts ORDER BY seq').all().map(row => String(row.opId))).toEqual([later.opId])
  expect(repairRejectedBaseline(first.driver, first.host)).toBe(false)
  expect(first.db.prepare('SELECT opId FROM sync_conflicts').all().map(row => String(row.opId))).toEqual([later.opId])
  first.db.close()
})

it('does not clear a local board when the cloud workspace is still phrase-era', async () => {
  const world = createMemoryWorld()
  const local = desktop()
  local.run({ type: 'create', title: '本机任务', horizon: 'later' })
  const before = confirmed(local.db)
  const alpha = await register(world, 'alpha')
  await createRemoteWorkspace({
    remote: alpha.remote, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', generation: randomUUID(),
  })
  const row = world.workspace?.envelopes.find(item => item.recipient === 'recovery')
  if (!row) throw new Error('recovery envelope missing')
  row.ciphertext = hex(utf8(JSON.stringify({ v: 1 })))
  const beta = await register(world, 'beta')
  await expect(bootstrapWorkspace({
    remote: beta.remote, driver: local.driver, host: local.host, deviceId: beta.deviceId, secret: beta.secret, password: 'sync-pass', at: now,
  })).rejects.toMatchObject({ code: 'rejected' })
  await expect(unlockWithPassword({
    remote: beta.remote, deviceId: beta.deviceId, secret: beta.secret, password: 'sync-pass',
  })).rejects.toMatchObject({ code: 'key' })
  await expect(joinWorkspace({
    remote: beta.remote, driver: local.driver, host: local.host, deviceId: beta.deviceId, secret: beta.secret,
    password: 'sync-pass', choice: 'use-remote', at: now,
  })).rejects.toBeInstanceOf(SyncFailure)
  expect(confirmed(local.db)).toEqual(before)
  expect(local.db.prepare('SELECT title FROM items WHERE deletedAt IS NULL').get()?.title).toBe('本机任务')
  local.db.close()
})

it('installs the cloud calendar on a joining device that has not run setup', async () => {
  const world = createMemoryWorld()
  const first = desktop()
  const cloud = confirmed(first.db)
  expect(cloud.setupConfirmedAt).toBe(now)
  const alpha = await register(world, 'alpha')
  const bound = await bootstrapWorkspace({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', at: now,
  })
  await push({ ...alpha, driver: first.driver, host: first.host }, bound)
  const second = fresh()
  expect(confirmed(second.db).setupConfirmedAt).toBeNull()
  const beta = await register(world, 'beta')
  await joinWorkspace({
    remote: beta.remote, driver: second.driver, host: second.host, deviceId: beta.deviceId, secret: beta.secret,
    password: 'sync-pass', choice: 'use-remote', at: now,
  })
  expect(confirmed(second.db).setupConfirmedAt).toBe(cloud.setupConfirmedAt)
  expect(confirmed(second.db).calendar?.id).toBe(cloud.calendar?.id)
  first.db.close()
  second.db.close()
})

it('keeps setup when the first device baselines after confirmation', async () => {
  const world = createMemoryWorld()
  const first = fresh()
  first.run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-21' }, confirmed: true })
  first.run({ type: 'create', title: '首台任务', horizon: 'week' })
  const before = confirmed(first.db)
  const alpha = await register(world, 'alpha')
  expect(queueBaseline(first.driver, first.host, alpha.deviceId, now)).toBe(0)
  expect(confirmed(first.db)).toEqual(before)
  expect(first.db.prepare('SELECT title FROM items WHERE deletedAt IS NULL').all().map(row => String(row.title))).toContain('首台任务')
  const bound = await bootstrapWorkspace({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', at: now,
  })
  expect(confirmed(first.db)).toEqual(before)
  await push({ ...alpha, driver: first.driver, host: first.host }, bound)
  expect(confirmed(first.db)).toEqual(before)
  const second = fresh()
  const beta = await register(world, 'beta')
  await joinWorkspace({
    remote: beta.remote, driver: second.driver, host: second.host, deviceId: beta.deviceId, secret: beta.secret,
    password: 'sync-pass', choice: 'use-remote', at: now,
  })
  expect(confirmed(second.db).setupConfirmedAt).toBe(before.setupConfirmedAt)
  expect(confirmed(second.db).calendar?.id).toBe(before.calendar?.id)
  expect(second.db.prepare('SELECT title FROM items WHERE deletedAt IS NULL').all().map(row => String(row.title))).toContain('首台任务')
  first.db.close()
  second.db.close()
})
