/**
 * [INPUT]: Isolated SQLite/profile paths and a synthetic cloud.
 * [OUTPUT]: Real production repositories, encrypted vaults and storage workers.
 * [POS]: Peer setup for sync-owned acceptance; the synthetic cipher never accesses the OS vault.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { publicFromSeed } from '@goalloom/crypto'
import { bootstrapWorkspace, joinWorkspace, memoryRemote, newDeviceSecret, type MemoryWorld } from '@goalloom/sync'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { syncHost } from '../../src/main/sync/host'
import { SyncVault } from '../../src/main/sync/vault'
import { StorageClient } from '../../src/main/storage/client'

export const cipher = { available: () => true, encrypt: (text: string) => Buffer.from(Buffer.from(text).map(byte => byte ^ 0x5a)), decrypt: (bytes: Buffer) => Buffer.from(Buffer.from(bytes).map(byte => byte ^ 0x5a)).toString() }
export async function seed(profile: string, name: string, world: MemoryWorld, url: string) {
  await mkdir(profile, { recursive: true })
  const db = openDatabase(join(profile, 'workspace.sqlite')); migrate(db)
  const repo = new Repository(db, { now: () => new Date().toISOString() })
  const at = new Date().toISOString()
  const remote = memoryRemote(world, name), secret = newDeviceSecret()
  const deviceId = await remote.registerDevice({ name, platform: 'macos', signPub: publicFromSeed('ed25519', secret.signSk), boxPub: publicFromSeed('x25519', secret.boxSk) })
  const driver = nodeSqlDriver(db), host = syncHost(db)
  let bound
  if (!world.workspace) {
    repo.execute({ type: 'confirmSetup', operationId: randomUUID(), generation: repo.store.workspace().generation, timezone: 'Asia/Singapore', weekStart: 1,
      mode: 'rolling', anchor: { kind: 'date', date: new Date().toISOString().slice(0, 10) }, confirmed: true })
    bound = await bootstrapWorkspace({ driver, host, remote, deviceId, secret, password: 'synthetic-password', at })
  } else bound = await joinWorkspace({ driver, host, remote, deviceId, secret, password: 'synthetic-password', choice: 'use-remote', at })
  await new SyncVault(profile, cipher).save({ ...secret, deviceId, workspaceKey: bound.workspaceKey, workspaceId: bound.workspaceId, generation: bound.generation,
    epoch: bound.epoch, roster: bound.roster, recoveryBoxSk: bound.recovery.boxSk, recoverySignSk: bound.recovery.signSk,
    refreshToken: name, userId: '11111111-1111-4111-8111-111111111111', accounts: {} })
  await writeFile(join(profile, 'sync-config.json'), JSON.stringify({ url, anonKey: 'synthetic-anon' }))
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
  db.close()
  return { deviceId, bound }
}
export async function worker(profile: string, workerPath = resolve('out/main/storage.js')) {
  const storage = new StorageClient(workerPath, join(profile, 'workspace.sqlite'), join(profile, 'backups'), 'en')
  const startup = await storage.call<{ ok: boolean; message?: string }>('startup')
  if (!startup.ok) { await storage.close(); throw new Error(`Synthetic storage startup failed: ${startup.message ?? 'Unknown startup error'}`) }
  return storage
}
