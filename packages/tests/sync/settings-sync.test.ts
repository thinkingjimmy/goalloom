import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { publicFromSeed, utf8, unhex } from '@goalloom/crypto'
import { parseSetting } from '@goalloom/contracts'
import { enqueueSettings, readSettings, type ApplyHost, type SqlDriver } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import {
  bootstrapWorkspace, exchange, joinWorkspace, memoryCiphertext, memoryRemote, newDeviceSecret, createMemoryWorld, type BoundWorkspace, type MemoryWorld,
} from '@goalloom/sync'
import { openDatabase } from '../../../apps/desktop/src/main/storage/database'
import { migrate, userVersion } from '../../../apps/desktop/src/main/storage/schema'
import { Repository } from '../../../apps/desktop/src/main/workspace/repository'
import { syncHost } from '../../../apps/desktop/src/main/sync/host'
import type { CommandInput } from '../../../apps/desktop/src/shared/contracts/commands'

const now = '2026-09-23T02:00:00.000Z'
const later = '2026-09-23T05:00:00.000Z'
const secret = 'sk-sync-settings-OPENROUTER-key-9f3c1a7b'
const about = 'ABOUT-MARKER-plain-insight-settings-sync'
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
  const secretKey = newDeviceSecret()
  const deviceId = await remote.registerDevice({
    name: session, platform: 'linux',
    signPub: publicFromSeed('ed25519', secretKey.signSk), boxPub: publicFromSeed('x25519', secretKey.boxSk),
  })
  return { remote, secret: secretKey, deviceId }
}

function push(side: { remote: ReturnType<typeof memoryRemote>; driver: SqlDriver; host: ApplyHost; deviceId: string }, bound: BoundWorkspace, at = now) {
  return exchange({
    remote: side.remote, driver: side.driver, host: side.host, deviceId: side.deviceId, workspaceId: bound.workspaceId,
    generation: bound.generation, epoch: bound.epoch, workspaceKey: bound.workspaceKey, at,
  })
}

function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (!needle.length || needle.length > haystack.length) return false
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((byte, offset) => haystack[index + offset] === byte)) return true
  }
  return false
}

it('syncs a setting and an API key between two computers, and the server never stores the plaintext', async () => {
  const world = createMemoryWorld()
  const first = desktop()
  const second = desktop()
  const alpha = await register(world, 'alpha')
  const beta = await register(world, 'beta')
  const bound = await bootstrapWorkspace({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', at: now,
  })
  first.run({ type: 'preferences', theme: 'dark' })
  enqueueSettings(first.driver, {
    opId: randomUUID(), deviceId: alpha.deviceId, at: now,
    entries: [
      { key: 'ai.key.openrouter', value: secret },
      { key: 'insight.prefs', value: { about, stepSize: 'hour', stepNotes: '', tone: 'direct', focus: ['gap'] } },
    ],
  })
  const localPayload = first.db.prepare('SELECT payload FROM sync_ops').all().map(row => String(row.payload)).join('\n')
  expect(localPayload).toContain(secret)
  expect(localPayload).toContain(about)
  await push({ ...alpha, driver: first.driver, host: first.host }, bound)
  const joined = await joinWorkspace({
    remote: beta.remote, driver: second.driver, host: second.host, deviceId: beta.deviceId, secret: beta.secret,
    password: 'sync-pass', choice: 'use-remote', at: now,
  })
  expect(String(second.db.prepare('SELECT theme FROM workspace WHERE id=1').get()!.theme)).toBe('dark')
  expect(readSettings(second.driver).find(row => row.key === 'ai.key.openrouter')?.value).toBe(secret)
  expect(readSettings(second.driver).find(row => row.key === 'insight.prefs')?.value).toMatchObject({ about })
  const server = unhex(memoryCiphertext(world))
  expect(contains(server, utf8(secret))).toBe(false)
  expect(contains(server, utf8(about))).toBe(false)
  expect(contains(server, utf8('sync-pass'))).toBe(false)
  enqueueSettings(second.driver, {
    opId: randomUUID(), deviceId: beta.deviceId, at: later, entries: [{ key: 'theme', value: 'light' }],
  })
  await push({ ...beta, driver: second.driver, host: second.host }, joined, later)
  await push({ ...alpha, driver: first.driver, host: first.host }, bound, later)
  expect(String(first.db.prepare('SELECT theme FROM workspace WHERE id=1').get()!.theme)).toBe('light')
  expect(readSettings(first.driver).find(row => row.key === 'theme')?.value).toBe('light')
  first.db.close()
  second.db.close()
})

it('rejects device-local keys and creates the settings table once', () => {
  expect(() => parseSetting('deviceId', 'device-1')).toThrow()
  expect(() => parseSetting('window.size', { width: 800, height: 600 })).toThrow()
  expect(() => parseSetting('sync.password', 'sync-pass')).toThrow()
  const db = openDatabase(':memory:')
  migrate(db)
  migrate(db)
  expect(userVersion(db)).toBe(10)
  expect(Number(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='sync_settings'").get()!.n)).toBe(1)
  db.prepare('INSERT INTO sync_settings (key, value, updatedAt, opId) VALUES (\'theme\', \'"dark"\', ?, ?)').run(now, randomUUID())
  migrate(db)
  expect(String(db.prepare('SELECT value FROM sync_settings WHERE key=\'theme\'').get()!.value)).toBe('"dark"')
  db.close()
})
