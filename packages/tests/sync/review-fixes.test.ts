import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { hex, newRecovery, publicFromSeed, sha256Hex, systemRandom, utf8 } from '@goalloom/crypto'
import {
  createRemoteWorkspace, exchange, joinWorkspace, maxOpCiphertextBytes, memoryRemote, newDeviceSecret, unlockWithPassword,
  SyncFailure, createMemoryWorld, type SyncRemote,
} from '@goalloom/sync'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import type { SqlDriver, SqlValue } from '@goalloom/store-core'
import { currentPeriod } from '../../../apps/desktop/src/domain/calendar'
import { openDatabase } from '../../../apps/desktop/src/main/storage/database'
import { migrate } from '../../../apps/desktop/src/main/storage/schema'
import { protectSyncBackup } from '../../../apps/desktop/src/main/workspace/sync/local'
import { SyncService } from '../../../apps/desktop/src/main/sync/service'
import { SyncVault, type VaultSecrets } from '../../../apps/desktop/src/main/sync/vault'
import { syncHost } from '../../../apps/desktop/src/main/sync/host'
import { Repository } from '../../../apps/desktop/src/main/workspace/repository'
import type { CommandInput } from '../../../apps/desktop/src/shared/contracts/commands'
import type { StorageClient } from '../../../apps/desktop/src/main/storage/client'
import type { Cipher } from '../../../apps/desktop/src/main/smart/credentials'

const now = '2026-10-13T00:00:00.000Z'
type WithoutEnvelope<T> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never

function machine(anchor = '2026-01-31') {
  const db = openDatabase(':memory:')
  migrate(db)
  const repo = new Repository(db, { now: () => now })
  const run = (command: WithoutEnvelope<CommandInput>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation } as CommandInput)
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: anchor }, confirmed: true })
  return { db, repo, run, driver: nodeSqlDriver(db), host: syncHost(db) }
}

async function register(world: ReturnType<typeof createMemoryWorld>, session: string) {
  const remote = memoryRemote(world, session)
  const secret = newDeviceSecret()
  const deviceId = await remote.registerDevice({
    name: session, platform: 'linux',
    signPub: publicFromSeed('ed25519', secret.signSk), boxPub: publicFromSeed('x25519', secret.boxSk),
  })
  return { remote, secret, deviceId }
}

function titles(db: DatabaseSync): string[] {
  return db.prepare('SELECT title FROM items WHERE deletedAt IS NULL ORDER BY title').all().map(row => String(row.title))
}

function identityCipher(): Cipher & { writes: number } {
  return {
    writes: 0,
    available: () => true,
    encrypt(text: string) { this.writes += 1; return Buffer.from(text) },
    decrypt: (data: Buffer) => data.toString('utf8'),
  }
}

it('documents the deployed envelope name clash and replaces it in 0006', () => {
  const deployed = readFileSync(new URL('../../../supabase/migrations/0005_desktop_client.sql', import.meta.url), 'utf8')
  const legacy = deployed.slice(deployed.indexOf('function public.put_key_envelopes'), deployed.indexOf('revoke execute'))
  expect(legacy).toContain('recipient text')
  expect(legacy).toContain('epoch int')
  expect(legacy).toContain('signature bytea')
  expect(legacy).toContain('roster_version int')
  const next = readFileSync(new URL('../../../supabase/migrations/0006_envelope_ambiguity.sql', import.meta.url), 'utf8')
  const replaced = next.slice(next.indexOf('function public.put_key_envelopes'), next.indexOf('function public.push_ops'))
  expect(replaced).not.toMatch(/\bepoch int\b/)
  expect(replaced).toContain('v_recipient')
  expect(replaced).toContain('v_epoch')
  expect(replaced).toContain('v_signature')
  expect(replaced).toContain('v_roster_version')
  const push = next.slice(next.indexOf('function public.push_ops'))
  expect(push).toContain(`octet_length(v_ct) > ${maxOpCiphertextBytes}`)
  expect(push).not.toContain('65536')
  const reset = readFileSync(new URL('../../../supabase/migrations/0007_reset_sync.sql', import.meta.url), 'utf8')
  expect(reset).toContain('function public.reset_sync')
  expect(reset).toContain('delete from public.workspaces')
  expect(reset).not.toMatch(/function public\.sync_entitled/)
})

it('resumes the same workspace key when the first envelope upload fails', async () => {
  const world = createMemoryWorld()
  const alpha = await register(world, 'alpha')
  const recovery = newRecovery(systemRandom())
  const workspaceId = randomUUID()
  const workspaceKey = randomBytes(32)
  const generation = randomUUID()
  const original = alpha.remote.putEnvelopes.bind(alpha.remote)
  let puts = 0
  alpha.remote.putEnvelopes = async (id, device, envelopes) => {
    puts += 1
    if (puts === 1) throw new SyncFailure('network')
    return original(id, device, envelopes)
  }
  const input = {
    remote: alpha.remote, deviceId: alpha.deviceId, secret: alpha.secret, recovery, generation, workspaceId, workspaceKey,
  }
  await expect(createRemoteWorkspace({ ...input, password: 'sync-pass' })).rejects.toMatchObject({ code: 'network' })
  expect(world.workspace?.id).toBe(workspaceId)
  expect(world.workspace?.envelopes).toHaveLength(0)
  const bound = await createRemoteWorkspace({ ...input, password: 'sync-pass-2' })
  expect(hex(bound.workspaceKey)).toBe(hex(workspaceKey))
  expect(world.workspace?.envelopes.some(item => item.recipient === 'recovery')).toBe(true)
  const beta = await register(world, 'beta')
  await expect(unlockWithPassword({ remote: beta.remote, deviceId: beta.deviceId, secret: beta.secret, password: 'sync-pass' })).rejects.toMatchObject({ code: 'password' })
  const unlocked = await unlockWithPassword({ remote: beta.remote, deviceId: beta.deviceId, secret: beta.secret, password: 'sync-pass-2' })
  expect(hex(unlocked.bound.workspaceKey)).toBe(hex(workspaceKey))
})

it('does not replace envelopes when a later recovery key does not match the checkpoint', async () => {
  const world = createMemoryWorld()
  const recovery = newRecovery(systemRandom())
  const other = newRecovery(systemRandom())
  const alpha = await register(world, 'alpha')
  const workspaceId = randomUUID()
  const workspaceKey = randomBytes(32)
  const input = {
    remote: alpha.remote, deviceId: alpha.deviceId, secret: alpha.secret, generation: randomUUID(), workspaceId, workspaceKey,
  }
  alpha.remote.putEnvelopes = async () => { throw new SyncFailure('network') }
  await expect(createRemoteWorkspace({ ...input, password: 'sync-pass', recovery })).rejects.toMatchObject({ code: 'network' })
  await expect(createRemoteWorkspace({ ...input, password: 'sync-pass', recovery: other })).rejects.toMatchObject({ code: 'password' })
  expect(world.workspace?.envelopes).toHaveLength(0)
  alpha.remote.putEnvelopes = async (id, device, envelopes) => {
    const fresh = memoryRemote(world, 'alpha')
    return fresh.putEnvelopes(id, device, envelopes)
  }
  const bound = await createRemoteWorkspace({ ...input, password: 'sync-pass', recovery })
  expect(hex(bound.workspaceKey)).toBe(hex(workspaceKey))
})

it('rejects a phrase-era recovery envelope', async () => {
  const world = createMemoryWorld()
  const alpha = await register(world, 'alpha')
  await createRemoteWorkspace({
    remote: alpha.remote, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', generation: randomUUID(),
  })
  const row = world.workspace?.envelopes.find(item => item.recipient === 'recovery')
  if (!row) throw new Error('recovery envelope missing')
  row.ciphertext = hex(utf8(JSON.stringify({ v: 1 })))
  const beta = await register(world, 'beta')
  await expect(unlockWithPassword({ remote: beta.remote, deviceId: beta.deviceId, secret: beta.secret, password: 'sync-pass' })).rejects.toMatchObject({ code: 'key' })
})

it('loads a vault written before recovery secrets were stored', async () => {
  const cipher = identityCipher()
  const userData = mkdtempSync(join(tmpdir(), 'goalloom-sync-legacy-'))
  const secret = newDeviceSecret()
  await writeFile(join(userData, 'sync-vault.bin'), Buffer.from(JSON.stringify({
    v: 1, deviceId: null, signSk: hex(secret.signSk), boxSk: hex(secret.boxSk),
    workspaceKey: null, workspaceId: null, generation: null, epoch: null, roster: null,
    refreshToken: null, userId: null, accounts: {},
  })))
  const loaded = await new SyncVault(userData, cipher).load()
  expect(loaded?.recoveryBoxSk).toBeNull()
  expect(loaded?.recoverySignSk).toBeNull()
  expect(hex(loaded!.signSk)).toBe(hex(secret.signSk))
})

it('rolls back a merge when importing the local board fails', async () => {
  const world = createMemoryWorld()
  const first = machine()
  const second = machine('2026-01-01')
  const alpha = await register(world, 'alpha')
  const beta = await register(world, 'beta')
  first.run({ type: 'create', title: '远程任务', horizon: 'week' })
  second.run({ type: 'create', title: 'BOOM', horizon: 'week' })
  const bound = await createRemoteWorkspace({
    remote: alpha.remote, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', generation: randomUUID(),
  })
  await exchange({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, workspaceId: bound.workspaceId,
    generation: bound.generation, epoch: bound.epoch, workspaceKey: bound.workspaceKey, at: now,
  })
  const inner = second.driver
  const driver: SqlDriver = {
    exec: sql => inner.exec(sql),
    prepare(sql: string) {
      const statement = inner.prepare(sql)
      return {
        run: (...params: SqlValue[]) => {
          if (params.some(value => value === 'BOOM')) throw new Error('import failed')
          return statement.run(...params)
        },
        get: (...params: SqlValue[]) => statement.get(...params),
        all: (...params: SqlValue[]) => statement.all(...params),
      }
    },
    transaction: fn => inner.transaction(fn),
  }
  await expect(joinWorkspace({
    remote: beta.remote, driver, host: second.host, deviceId: beta.deviceId, secret: beta.secret, password: 'sync-pass', choice: 'merge', at: now,
  })).rejects.toThrow('import failed')
  expect(titles(second.db)).toEqual(['BOOM'])
})

it('keeps a task created while the merge is waiting on the network', async () => {
  const world = createMemoryWorld()
  const first = machine()
  const second = machine()
  const alpha = await register(world, 'alpha')
  const beta = await register(world, 'beta')
  first.run({ type: 'create', title: '已有远程', horizon: 'week' })
  second.run({ type: 'create', title: '已有本地', horizon: 'week' })
  const bound = await createRemoteWorkspace({
    remote: alpha.remote, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', generation: randomUUID(),
  })
  await exchange({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, workspaceId: bound.workspaceId,
    generation: bound.generation, epoch: bound.epoch, workspaceKey: bound.workspaceKey, at: now,
  })
  const original = beta.remote.getEnvelopes.bind(beta.remote)
  beta.remote.getEnvelopes = async (...args) => {
    second.run({ type: 'create', title: '期间新增', horizon: 'week' })
    return original(...args)
  }
  await joinWorkspace({
    remote: beta.remote, driver: second.driver, host: second.host, deviceId: beta.deviceId, secret: beta.secret,
    password: 'sync-pass', choice: 'merge', at: now,
  })
  expect(titles(second.db)).toContain('期间新增')
  expect(titles(second.db)).toContain('已有远程')
  first.db.close()
  second.db.close()
})

it('places a merged task on the adopted calendar period and bumps revision', async () => {
  const world = createMemoryWorld()
  const first = machine('2026-01-31')
  const second = machine('2026-01-01')
  const alpha = await register(world, 'alpha')
  const beta = await register(world, 'beta')
  first.run({ type: 'create', title: '远程季度', horizon: 'cycle' })
  second.run({ type: 'create', title: '本地季度', horizon: 'cycle' })
  const before = Number(second.db.prepare('SELECT revision FROM workspace WHERE id=1').get()?.revision)
  const bound = await createRemoteWorkspace({
    remote: alpha.remote, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', generation: randomUUID(),
  })
  await exchange({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, workspaceId: bound.workspaceId,
    generation: bound.generation, epoch: bound.epoch, workspaceKey: bound.workspaceKey, at: now,
  })
  await joinWorkspace({
    remote: beta.remote, driver: second.driver, host: second.host, deviceId: beta.deviceId, secret: beta.secret,
    password: 'sync-pass', choice: 'merge', at: now,
  })
  const calendar = second.repo.store.workspace().calendar!
  const current = currentPeriod(calendar, 'cycle', now)
  const local = second.db.prepare(`SELECT pp.startDate AS startDate, pp.endDate AS endDate, pp.id AS id
    FROM items i JOIN item_placements p ON p.itemId=i.id JOIN planning_periods pp ON pp.id=p.periodId WHERE i.title='本地季度'`).get()
  expect(current.startDate).toBe('2026-07-31')
  expect(local).toMatchObject({ startDate: current.startDate, endDate: current.endDate, id: current.id })
  expect(Number(second.db.prepare('SELECT revision FROM workspace WHERE id=1').get()?.revision)).toBeGreaterThan(before)
  first.db.close()
  second.db.close()
})

it('ends a recovered month-end cycle on the anchor boundary', () => {
  const box = machine('2026-01-31')
  const period = box.host.materializePeriod('cycle', '2026-04-30')
  expect(period.startDate).toBe('2026-04-30')
  expect(period.endDate).toBe('2026-07-31')
  box.db.close()
})

it('syncs a long description and still applies remote ops when another op is too large', async () => {
  const world = createMemoryWorld()
  const first = machine()
  const second = machine()
  const alpha = await register(world, 'alpha')
  const beta = await register(world, 'beta')
  const created = first.run({ type: 'create', title: '长文', horizon: 'week' })
  const item = first.repo.store.item(created.itemId!)
  const description = '测'.repeat(30_000)
  first.run({
    type: 'edit', itemId: item.id, expectedVersion: item.version, title: item.title, description, dueDate: null,
  })
  const bound = await createRemoteWorkspace({
    remote: alpha.remote, deviceId: alpha.deviceId, secret: alpha.secret, password: 'sync-pass', generation: randomUUID(),
  })
  await exchange({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, workspaceId: bound.workspaceId,
    generation: bound.generation, epoch: bound.epoch, workspaceKey: bound.workspaceKey, at: now,
  })
  const largest = Math.max(...(world.workspace?.ops.map(op => op.ciphertext.length / 2) ?? [0]))
  expect(largest).toBeGreaterThan(65_536)
  expect(largest).toBeLessThanOrEqual(maxOpCiphertextBytes)
  const joined = await joinWorkspace({
    remote: beta.remote, driver: second.driver, host: second.host, deviceId: beta.deviceId, secret: beta.secret,
    password: 'sync-pass', choice: 'use-remote', at: now,
  })
  expect(String(second.db.prepare('SELECT description FROM items WHERE title=?').get('长文')?.description)).toHaveLength(30_000)
  first.run({ type: 'create', title: '来自另一台', horizon: 'day' })
  await exchange({
    remote: alpha.remote, driver: first.driver, host: first.host, deviceId: alpha.deviceId, workspaceId: bound.workspaceId,
    generation: bound.generation, epoch: bound.epoch, workspaceKey: bound.workspaceKey, at: now,
  })
  const blockedId = randomUUID()
  const blocked = { v: 1, opId: blockedId, deviceId: beta.deviceId, at: now, actions: [{ t: 'item.create', id: randomUUID(), title: '暂时发不出', description: '', dueDate: null, horizon: 'later', periodKey: null, sortHint: { afterId: null, beforeId: null } }] }
  const payload = JSON.stringify(blocked)
  second.db.prepare(`INSERT INTO sync_ops (opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,createdAt,updatedAt)
    VALUES (?,?,'local',1,?,?,?,?, 'never_sent', ?, ?)`).run(blockedId, 1, payload, sha256Hex(payload), beta.deviceId, now, now, now)
  const push = beta.remote.pushOps.bind(beta.remote)
  beta.remote.pushOps = async input => (await push(input)).map(result => result.opId === blockedId ? { opId: blockedId, error: 'payload_too_large' } : result)
  await expect(exchange({
    remote: beta.remote, driver: second.driver, host: second.host, deviceId: beta.deviceId, workspaceId: joined.workspaceId,
    generation: joined.generation, epoch: joined.epoch, workspaceKey: joined.workspaceKey, at: now,
  })).rejects.toMatchObject({ message: 'payload_too_large' })
  expect(titles(second.db)).toContain('来自另一台')
  expect(String(second.db.prepare('SELECT state FROM sync_ops WHERE opId=?').get(blockedId)?.state)).not.toBe('accepted')
  first.db.close()
  second.db.close()
})

it('writes a protective backup and asks for one transaction before replacing the board', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'goalloom-sync-'))
  const db = openDatabase(join(dir, 'board.sqlite'))
  migrate(db)
  const repo = new Repository(db, { now: () => now })
  const run = (command: WithoutEnvelope<CommandInput>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation } as CommandInput)
  run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-01-01' }, confirmed: true })
  run({ type: 'create', title: '备份前', horizon: 'day' })
  const backupId = await protectSyncBackup(db, join(dir, 'backups'), now)
  const copy = new DatabaseSync(join(dir, 'backups', `${backupId}.sqlite`), { readOnly: true })
  expect(copy.prepare('SELECT title FROM items').all().map(row => String(row.title))).toContain('备份前')
  copy.close()
  db.close()

  const calls: { type?: string; merge?: boolean; closed?: boolean }[] = []
  const cipher = identityCipher()
  const userData = mkdtempSync(join(tmpdir(), 'goalloom-sync-svc-'))
  const secret = newDeviceSecret()
  const workspaceId = randomUUID()
  const service = new SyncService({
    userData, cipher, storage: { call: async (_method: string, argument?: unknown) => {
      const action = argument as { type?: string; merge?: boolean; closed?: boolean }
      calls.push(action)
      if (action.type === 'view') return { workspaceId, deviceId: null, generation: workspaceId, keyEpoch: 1, paused: null, lastAppliedSeq: 0, pending: 0, conflicts: 0, localItems: 2 }
      if (action.type === 'take') return []
      return null
    } } as unknown as StorageClient,
    openExternal: async () => undefined, notify: () => undefined, onApplied: () => undefined, clipboard: () => undefined, now: () => now,
  })
  const opened = service as unknown as {
    started: boolean
    secrets: VaultSecrets
    remote: SyncRemote
    phase: string
  }
  opened.started = true
  opened.secrets = {
    deviceId: randomUUID(), signSk: secret.signSk, boxSk: secret.boxSk, workspaceKey: randomBytes(32), workspaceId,
    generation: randomUUID(), epoch: 1, roster: { workspaceId, version: 1, epoch: 1, prevHash: null, devices: [], recoverySignPub: 'aa', recoveryBoxPub: 'bb' },
    recoveryBoxSk: null, recoverySignSk: null, refreshToken: null, userId: null, accounts: {},
  }
  opened.remote = {
    pullOps: async () => [], pushOps: async () => [], getRoster: async () => { throw new SyncFailure('network') },
    getEnvelopes: async () => [], account: async () => null, registerDevice: async () => randomUUID(), rebindDevice: async () => undefined,
    bootstrap: async () => undefined, putEnvelopes: async () => undefined, getCheckpoint: async () => null,
    startRecovery: async () => { throw new SyncFailure('network') }, completeRecovery: async () => undefined, resetSync: async () => undefined,
  }
  await service.handle({ type: 'join', choice: 'merge', acknowledged: true })
  const types = calls.map(call => call.type)
  expect(types.indexOf('protect')).toBeGreaterThan(types.indexOf('hold'))
  expect(types.indexOf('install')).toBeGreaterThan(types.indexOf('protect'))
  expect(types.lastIndexOf('hold')).toBeGreaterThan(types.indexOf('install'))
  expect(calls.find(call => call.type === 'hold')?.closed).toBe(true)
  expect(calls.filter(call => call.type === 'hold').at(-1)?.closed).toBe(false)
  expect(calls.find(call => call.type === 'install')?.merge).toBe(true)
  expect(types).not.toContain('capture')
  expect(types).not.toContain('import')
})

it('backs up the board before the first device baselines and before a reset upload', async () => {
  const remote = (): SyncRemote => ({
    pullOps: async () => [], pushOps: async () => [], getRoster: async () => { throw new SyncFailure('network') },
    getEnvelopes: async () => [], account: async () => null, registerDevice: async () => randomUUID(), rebindDevice: async () => undefined,
    bootstrap: async () => undefined, putEnvelopes: async () => undefined, getCheckpoint: async () => null,
    startRecovery: async () => { throw new SyncFailure('network') }, completeRecovery: async () => undefined, resetSync: async () => undefined,
  })
  const open = (phase: 'setup' | 'enter-key') => {
    const calls: { type?: string }[] = []
    const secret = newDeviceSecret()
    const service = new SyncService({
      userData: mkdtempSync(join(tmpdir(), 'goalloom-sync-baseline-')), cipher: identityCipher(),
      storage: { call: async (_method: string, argument?: unknown) => {
        const action = argument as { type?: string }
        calls.push(action)
        if (action.type === 'view') return { workspaceId: null, deviceId: null, generation: randomUUID(), keyEpoch: null, paused: null, lastAppliedSeq: 0, pending: 0, conflicts: 0, localItems: 2 }
        if (action.type === 'take') return []
        return null
      } } as unknown as StorageClient,
      openExternal: async () => undefined, notify: () => undefined, onApplied: () => undefined, clipboard: () => undefined, now: () => now,
    })
    const opened = service as unknown as { started: boolean; secrets: VaultSecrets; remote: SyncRemote; phase: string }
    opened.started = true
    opened.phase = phase
    opened.secrets = {
      deviceId: randomUUID(), signSk: secret.signSk, boxSk: secret.boxSk, workspaceKey: null, workspaceId: null,
      generation: null, epoch: null, roster: null, recoveryBoxSk: null, recoverySignSk: null, refreshToken: null, userId: null, accounts: {},
    }
    opened.remote = remote()
    return { service, calls }
  }
  const created = open('setup')
  await created.service.handle({ type: 'create', password: 'sync-pass' })
  expect(created.calls.map(call => call.type).filter(type => type === 'protect' || type === 'baseline')).toEqual(['protect', 'baseline'])
  const reset = open('enter-key')
  await reset.service.handle({ type: 'reset-sync', password: 'sync-pass' })
  expect(reset.calls.map(call => call.type).filter(type => type === 'protect' || type === 'rebaseline')).toEqual(['protect', 'rebaseline'])
})

it('signs out of this computer only and leaves a failed sign-in retryable', async () => {
  const cipher = identityCipher()
  const userData = mkdtempSync(join(tmpdir(), 'goalloom-sync-auth-'))
  await writeFile(join(userData, 'sync-config.json'), JSON.stringify({ anonKey: 'test-anon-key' }))
  let scope = 'unset'
  const service = new SyncService({
    userData, cipher,
    storage: { call: async () => ({ workspaceId: null, deviceId: null, generation: '', keyEpoch: null, paused: null, lastAppliedSeq: 0, pending: 0, conflicts: 0, localItems: 0 }) } as unknown as StorageClient,
    openExternal: async () => undefined, notify: () => undefined, onApplied: () => undefined, clipboard: () => undefined, now: () => now,
    beginSignIn: async () => { throw new SyncFailure('auth', 'timeout') },
  })
  await service.start()
  const failed = await service.handle({ type: 'sign-in' })
  expect(failed.status.phase).toBe('signed-out')
  expect(failed.status.error).toBe('auth')
  const opened = service as unknown as { client: { auth: { signOut: (options?: { scope?: string }) => Promise<void> } } }
  opened.client = { auth: { signOut: async options => { scope = options?.scope ?? 'unset' } } }
  await service.handle({ type: 'sign-out' })
  expect(scope).toBe('local')
})

it('does not replace a vault that cannot be decrypted', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'goalloom-sync-vault-'))
  await writeFile(join(userData, 'sync-config.json'), JSON.stringify({ anonKey: 'test-anon-key' }))
  const file = join(userData, 'sync-vault.bin')
  await writeFile(file, Buffer.from('still-recoverable'))
  let writes = 0
  const cipher: Cipher = {
    available: () => true,
    encrypt: () => { writes += 1; return Buffer.from('replaced') },
    decrypt: () => { throw new Error('decrypt') },
  }
  const service = new SyncService({
    userData, cipher,
    storage: { call: async () => ({ workspaceId: null, deviceId: null, generation: '', keyEpoch: null, paused: null, lastAppliedSeq: 0, pending: 0, conflicts: 0, localItems: 0 }) } as unknown as StorageClient,
    openExternal: async () => undefined, notify: () => undefined, onApplied: () => undefined, clipboard: () => undefined, now: () => now,
  })
  await service.start()
  const status = await service.handle({ type: 'status' })
  expect(status.status.phase).toBe('locked')
  expect(status.status.error).toBe('storage')
  expect(writes).toBe(0)
  expect((await readFile(file)).toString()).toBe('still-recoverable')
  await expect(new SyncVault(userData, cipher).load()).rejects.toThrow('decrypt')
  expect(await new SyncVault(mkdtempSync(join(tmpdir(), 'goalloom-sync-empty-')), identityCipher()).load()).toBeNull()
})

it('keeps the previous Google account key when another account signs in', async () => {
  const cipher = identityCipher()
  const userData = mkdtempSync(join(tmpdir(), 'goalloom-sync-acct-'))
  const vault = new SyncVault(userData, cipher)
  const secret = newDeviceSecret()
  const workspaceA = randomUUID()
  const deviceA = randomUUID()
  const key = randomBytes(32)
  const stored: VaultSecrets = {
    deviceId: deviceA, signSk: secret.signSk, boxSk: secret.boxSk, workspaceKey: key, workspaceId: workspaceA,
    generation: randomUUID(), epoch: 1,
    roster: { workspaceId: workspaceA, version: 1, epoch: 1, prevHash: null, devices: [], recoverySignPub: 'aa', recoveryBoxPub: 'bb' },
    recoveryBoxSk: null, recoverySignSk: null, refreshToken: null, userId: 'user-a', accounts: {},
  }
  await vault.save(stored)
  const service = new SyncService({
    userData, cipher,
    storage: { call: async () => {
      const current = (service as unknown as { secrets: VaultSecrets }).secrets
      return { workspaceId: current.workspaceId, deviceId: current.deviceId, generation: current.generation ?? '', keyEpoch: current.epoch, paused: null, lastAppliedSeq: 0, pending: 0, conflicts: 0, localItems: 0 }
    } } as unknown as StorageClient,
    openExternal: async () => undefined, notify: () => undefined, onApplied: () => undefined, clipboard: () => undefined, now: () => now,
  })
  const opened = service as unknown as {
    started: boolean
    secrets: VaultSecrets
    remote: SyncRemote
    client: { auth: { getSession: () => Promise<{ data: { session: { user: { id: string, email?: string } } | null } }> } }
    afterAuth: () => Promise<void>
  }
  opened.started = true
  opened.secrets = (await vault.load())!
  const account = (workspaceId: string) => ({ workspaceId, generation: workspaceA, keyEpoch: 1, headSeq: 0, rosterVersion: 1 })
  const sessionFor = (id: string) => ({
    auth: { getSession: async () => ({ data: { session: { user: { id } } } }) },
    channel: () => ({ on() { return this }, subscribe() { return undefined }, async unsubscribe() { return undefined } }),
  })
  opened.client = sessionFor('user-a')
  opened.remote = {
    account: async () => account(workspaceA),
    rebindDevice: async () => { throw new SyncFailure('auth') },
    registerDevice: async () => randomUUID(),
    getRoster: async () => { throw new SyncFailure('network') },
    pullOps: async () => [], pushOps: async () => [], getEnvelopes: async () => [],
    bootstrap: async () => undefined, putEnvelopes: async () => undefined, getCheckpoint: async () => null,
    startRecovery: async () => { throw new SyncFailure('network') }, completeRecovery: async () => undefined, resetSync: async () => undefined,
  }
  await opened.afterAuth()
  expect(hex(opened.secrets.workspaceKey!)).toBe(hex(key))
  await vault.save(stored)
  opened.secrets = (await vault.load())!
  opened.client = sessionFor('user-b')
  opened.remote = { ...opened.remote, account: async () => account(randomUUID()), rebindDevice: async () => undefined }
  await opened.afterAuth()
  const parked = await vault.load()
  expect(parked?.accounts['user-a']?.workspaceId).toBe(workspaceA)
  expect(hex(parked!.accounts['user-a']!.workspaceKey!)).toBe(hex(key))
  expect(parked?.workspaceKey).toBeNull()
  let rebound = ''
  opened.client = sessionFor('user-a')
  opened.remote = {
    ...opened.remote,
    account: async () => account(workspaceA),
    rebindDevice: async id => { rebound = id },
    registerDevice: async () => { throw new Error('should keep the saved device') },
  }
  await opened.afterAuth()
  expect(rebound).toBe(deviceA)
  expect(hex(opened.secrets.workspaceKey!)).toBe(hex(key))
})
