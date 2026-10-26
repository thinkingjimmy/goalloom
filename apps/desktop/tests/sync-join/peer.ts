/**
 * [INPUT]: Temporary profile, source calendar and controlled cloud.
 * [OUTPUT]: Offline-created boards and real service/storage peers with synthetic Google sessions.
 * [POS]: First-connection acceptance setup; no production credentials.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { copyProjectionToBase } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { reconcile } from '../../src/main/workspace/reconcile'
import { SyncService } from '../../src/main/sync/service'
import { cipher, worker } from '../sync-cost/peer'
import { Clock } from '../sync-cost/clock'
import type { createCloud } from '../sync-cost/cloud'

export const password = 'synthetic-sync-password'
export async function seedLocal(profile: string, name: string, count: number, cloud: Awaited<ReturnType<typeof createCloud>>, aged: boolean | 'baseline' = false) {
  await mkdir(profile, { recursive: true })
  const db = openDatabase(join(profile, 'workspace.sqlite')); migrate(db)
  let now = new Date(Date.now() - (aged ? 2 * 86_400_000 : 0)).toISOString()
  const repo = new Repository(db, { now: () => now })
  const generation = repo.store.workspace().generation
  assert(repo.execute({ type: 'confirmSetup', operationId: randomUUID(), generation, timezone: name === 'alpha' ? 'Asia/Singapore' : 'UTC',
    weekStart: name === 'alpha' ? 1 : 7, mode: 'rolling', anchor: { kind: 'date', date: name === 'alpha' ? '2026-01-31' : '2026-01-01' }, confirmed: true }).outcome === 'committed')
  for (let index = 0; index < count; index++) assert(repo.execute({ type: 'create', operationId: randomUUID(), generation, title: `${name} task ${index}`,
    horizon: index === 0 ? 'year' : index === 1 ? 'cycle' : 'day' }).outcome === 'committed')
  if (aged === 'baseline') { copyProjectionToBase(nodeSqlDriver(db)); db.exec('DELETE FROM sync_ops') }
  if (aged) { now = new Date().toISOString(); assert(reconcile(repo), 'Expected an offline automatic rollover') }
  db.close()
  await writeFile(join(profile, 'sync-config.json'), JSON.stringify({ url: cloud.url, anonKey: 'synthetic-anon' }))
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
}
export function sql(profile: string, query: string) {
  const db = new DatabaseSync(join(profile, 'workspace.sqlite'), { readOnly: true })
  try { return db.prepare(query).all() } finally { db.close() }
}
export const tasks = (profile: string) => sql(profile, 'SELECT id,title,status,deletedAt FROM items ORDER BY id')
export const calendar = (profile: string) => JSON.parse(String(sql(profile, 'SELECT calendar FROM workspace')[0]!.calendar))
export async function openPeer(profile: string, name: string, workerPath?: string) {
  const storage = await worker(profile, workerPath), clock = new Clock()
  const peer: any = { profile, storage, clock, status: null, keys: new Map<string, string | null>() }
  peer.service = new SyncService({ userData: profile, storage, cipher, clock, random: () => 1,
    openExternal: async () => {}, notify: status => { peer.status = status }, onApplied: () => {}, clipboard: () => {}, now: () => new Date().toISOString(),
    readSecret: async key => peer.keys.get(key) ?? null, applySecret: async (key, value) => { peer.keys.set(key, value) },
    beginSignIn: async client => {
      const reply = await client.auth.refreshSession({ refresh_token: name })
      if (!reply.data.session) throw Error('Synthetic sign-in failed')
      return reply.data.session
    },
  })
  await peer.service.start()
  return peer
}
export async function settle(...peers: any[]) {
  for (let turn = 0; turn < 5; turn++) for (const peer of peers) {
    await peer.service.schedule.settle()
    await peer.service.handle({ type: 'retry' })
    await peer.clock.advance(0)
    await peer.service.schedule.settle()
  }
}
export async function closePeer(peer: any) { peer.service.stop(); await peer.service.schedule.settle(); await peer.storage.close() }
export async function command(peer: any, input: object) {
  const view = await (peer.service ? peer.service.local({ type: 'view' }) : peer.storage.call('sync', { type: 'view' }))
  const result = await peer.storage.call('command', { ...input, generation: view.generation, operationId: randomUUID() })
  assert(result.outcome === 'committed', JSON.stringify(result))
  return result
}
