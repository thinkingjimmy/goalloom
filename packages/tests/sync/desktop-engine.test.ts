import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { hex, publicFromSeed, unhex, utf8 } from '@goalloom/crypto'
import {
  acceptRosterAdvance, bootstrapWorkspace, changeSyncPassword, exchange, joinWorkspace, memoryCiphertext, memoryRemote, newDeviceSecret,
  queueVisibleBaseline, unlockWithPassword, SyncFailure, createMemoryWorld, type BoundWorkspace, type MemoryWorld,
} from '@goalloom/sync'
import type { ApplyHost, SqlDriver } from '@goalloom/store-core'
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
