/**
 * [INPUT]: Two real storage peers on one controlled account and production SyncService.
 * [OUTPUT]: Upload-only cooldown, delayed peer download, restart and ordered recovery evidence.
 * [POS]: M3 client E2E. Actual SQL quota concurrency/cleanup is hosted acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { SyncService } from '../../src/main/sync/service'
import { createCloud } from './cloud'
import { Clock } from './clock'
import { cipher, seed, worker } from './peer'

async function main() {
  const cloud = await createCloud(), clock = new Clock(), checks: string[] = []
  const base = await mkdtemp(join(tmpdir(), 'goalloom-sync-quota-')), out = resolve('output/tests/sync-cost')
  await mkdir(out, { recursive: true })
  const peers: any[] = []
  const count = (rpc: string) => cloud.requests.filter(row => row.rpc === rpc).length
  const sql = (peer: any, statement: string) => { const db = new DatabaseSync(join(peer.profile, 'workspace.sqlite'), { readOnly: true }); try { return db.prepare(statement).all() } finally { db.close() } }
  const build = (peer: any) => new SyncService({ userData: peer.profile, storage: peer.storage, cipher, clock, random: () => 1,
    readSecret: async key => peer.keys?.[key] ?? null, applySecret: async (key, value) => { peer.keys ??= {}; peer.keys[key] = value },
    openExternal: async () => {}, notify: status => { peer.status = status }, onApplied: () => {}, clipboard: () => {}, now: () => new Date().toISOString() })
  const drain = async (peer: any) => { for (let n = 0; n < 20; n++) { await clock.advance(0); await peer.service.schedule.settle(); if (!peer.status.pending) return }; throw Error('Queue did not drain') }
  const open = async (name: string) => { const profile = join(base, name); await seed(profile, name, cloud.world, cloud.url); const peer: any = { profile, storage: await worker(profile) }; peer.service = build(peer); peers.push(peer); await peer.service.start(); await drain(peer); return peer }
  const create = async (peer: any, title: string) => {
    const view: any = await peer.storage.call('sync', { type: 'view' })
    return peer.storage.call('command', { type: 'create', operationId: randomUUID(), generation: view.generation, title, horizon: 'day' })
  }
  try {
    const a = await open('alpha'), b = await open('beta')
    cloud.controls.dropped = true
    await create(a, 'Waiting local change')
    cloud.controls.fault = 'gate-limit:push_ops'; cloud.controls.session = 'alpha'
    const pushes = count('push_ops'), upload = a.service.handle({ type: 'retry' })
    const deadline = performance.now() + 5_000
    while (count('push_ops') === pushes) { if (performance.now() > deadline) throw Error('Upload gate not reached'); await new Promise(resolve => setImmediate(resolve)) }
    await create(b, 'Accepted before quota exhausted'); await b.service.handle({ type: 'retry' }); await drain(b)
    cloud.controls.fault = ''; cloud.controls.session = ''; cloud.controls.blocked = 'push_ops'; cloud.controls.retryAt = Date.now() + 60_000
    cloud.releaseReplies(); await upload
    assert(a.status.uploadWait)
    assert.equal(a.status.offline, false)
    assert.equal(sql(a, "SELECT id FROM items WHERE title='Accepted before quota exhausted'").length, 0)
    const protectedPushes = count('push_ops'), receipts = count('receipts_for')
    cloud.controls.dropped = false; cloud.broadcast()
    await a.service.handle({ type: 'retry' }); await a.service.schedule.settle()
    assert.equal(sql(a, "SELECT id FROM items WHERE title='Accepted before quota exhausted'").length, 1)
    assert(count('receipts_for') > receipts)
    assert.equal(count('push_ops'), protectedPushes)
    assert(a.status.pending > 0 && a.status.uploadWait)
    checks.push('S24: B commits before quota exhaustion; delayed notification downloads on A during upload cooldown, with receipt reads preserved')

    a.service.setForeground(false); a.service.setForeground(true); a.service.nudge(); await a.service.handle({ type: 'retry' })
    assert.equal(count('push_ops'), protectedPushes)
    a.service.stop(); await a.service.schedule.settle()
    a.service = build(a); await a.service.start(); await a.service.schedule.settle()
    await a.service.handle({ type: 'retry' })
    assert.equal(count('push_ops'), protectedPushes)
    assert(a.status.uploadWait && a.status.pending > 0 && !a.status.offline)
    checks.push('S25: focus, events, manual retry and a fresh service/vault restore cannot bypass account upload cooldown; read success keeps waiting status')

    cloud.controls.blocked = ''
    await clock.advance(Math.max(0, a.service.exchangeState.uploadRetryAt - clock.now()) + 1)
    await a.service.handle({ type: 'retry' }); await drain(a)
    await b.service.handle({ type: 'retry' }); await drain(b)
    assert.equal(a.status.uploadWait, undefined)
    assert.equal(a.status.pending, 0)
    assert.deepEqual(sql(a, 'SELECT id,title,status FROM items ORDER BY id'), sql(b, 'SELECT id,title,status FROM items ORDER BY id'))
    const world = cloud.world.workspace!
    assert.equal(new Set(world.ops.map(row => row.opId)).size, world.ops.length)
    assert.equal(Number(sql(a, 'SELECT lastAppliedSeq FROM sync_state WHERE id=1')[0]!.lastAppliedSeq), world.headSeq)
    checks.push('Upload resumes in original order after expiry; both projections and continuous cursors converge without duplicate acceptance')
    const keyName = 'ai.key.openrouter', originalKey = 'sk-synthetic-original-retry-key', nextKey = 'sk-synthetic-newer-local-key'
    a.keys = { [keyName]: originalKey }
    await a.storage.call('sync', { type: 'emit-settings', opId: randomUUID(), at: new Date().toISOString(), mode: 'change', entries: [{ key: keyName, value: originalKey }] })
    cloud.controls.fault = 'commit:push_ops'
    await a.service.handle({ type: 'retry' })
    a.keys[keyName] = nextKey
    await a.storage.call('sync', { type: 'emit-settings', opId: randomUUID(), at: new Date(Date.now() + 1).toISOString(), mode: 'change', entries: [{ key: keyName, value: nextKey }] })
    cloud.controls.fault = ''
    a.service.stop(); await a.service.schedule.settle(); a.service = build(a); await a.service.start()
    await a.service.handle({ type: 'retry' })
    assert.equal(a.keys[keyName], nextKey)
    await clock.advance(Math.max(0, a.service.exchangeState.uploadRetryAt - clock.now()) + 1)
    await a.service.handle({ type: 'retry' }); await drain(a)
    await b.service.handle({ type: 'retry' }); await drain(b)
    assert.equal(b.keys[keyName], nextKey)
    for (const file of await readdir(a.profile)) {
      if (!file.startsWith('sync-') && !file.startsWith('workspace.sqlite')) continue
      const bytes = await readFile(join(a.profile, file))
      assert(!bytes.includes(Buffer.from(originalKey)) && !bytes.includes(Buffer.from(nextKey)))
    }
    checks.push('Unknown secret preference keeps its original hash across vault restore and a changed local key; older incoming key cannot overwrite a newer local preference')

    const convergence = { aPending: a.status.pending, bPending: b.status.pending, head: world.headSeq, uniqueOperations: new Set(world.ops.map(row => row.opId)).size, sameProjection: true }
    await writeFile(join(out, 'convergence.json'), JSON.stringify(convergence, null, 2))
    await writeFile(join(out, 'protection.json'), JSON.stringify({ ok: true, checks, convergence, requests: cloud.requests,
      scope: 'Real SyncService/SDK/storage peers with a controlled quota response. Hosted SQL counters, concurrency and cleanup are unverified.' }, null, 2))
    console.log(`M3 upload protection passed: ${checks.length} checks`)
  } catch (error) { await writeFile(join(out, 'protection.json'), JSON.stringify({ ok: false, checks, statuses: peers.map(peer => peer.status), failure: String(error), requests: cloud.requests }, null, 2)); throw error }
  finally { for (const peer of peers) { peer.service.stop(); await peer.storage.close() }; await cloud.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
