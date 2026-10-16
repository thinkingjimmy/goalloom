/**
 * [INPUT]: Production scheduler, worker/SQLite and counted HTTP/WebSocket cloud.
 * [OUTPUT]: Burst batching, stable operation identity, notification dedup and fairness evidence.
 * [POS]: M2 E2E. Server-side SQL acceptance remains a separate hosted check.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
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
  const profile = await mkdtemp(join(tmpdir(), 'goalloom-sync-batch-')), out = resolve('output/tests/sync-cost')
  await mkdir(out, { recursive: true }); await seed(profile, 'alpha', cloud.world, cloud.url)
  const storage = await worker(profile)
  let status: any
  let onEncrypt: (() => void) | null = null
  const protectedCipher = { ...cipher, encrypt: (text: string) => { const bytes = cipher.encrypt(text); const work = onEncrypt; onEncrypt = null; work?.(); return bytes } }
  const service: any = new SyncService({ userData: profile, storage, cipher: protectedCipher, clock, random: () => 1, openExternal: async () => {},
    notify: value => { status = value }, onApplied: () => {}, clipboard: () => {}, now: () => new Date().toISOString() })
  const sql = (statement: string) => { const db = new DatabaseSync(join(profile, 'workspace.sqlite'), { readOnly: true }); try { return db.prepare(statement).all() } finally { db.close() } }
  const count = () => cloud.requests.filter(row => row.rpc === 'push_ops').length
  const drain = async () => { for (let n = 0; n < 15; n++) { await clock.advance(0); await service.schedule.settle(); if (status.pending === 0) return }; throw Error('Queue did not drain') }
  const create = async (title: string) => {
    const view: any = await storage.call('sync', { type: 'view' })
    return storage.call('command', { type: 'create', operationId: randomUUID(), generation: view.generation, title, horizon: 'day' })
  }
  try {
    await service.start(); await drain(); cloud.controls.dropped = true
    const before = count()
    for (let i = 0; i < 10; i++) { await create(`Burst ${i}`); service.nudge('write') }
    assert.equal(count(), before)
    assert.equal(sql("SELECT opId FROM sync_ops WHERE state='never_sent'").length, 10)
    await clock.advance(199); await service.schedule.settle(); assert.equal(count(), before)
    await create('Last moment edit'); service.nudge('write')
    await clock.advance(1); await service.schedule.settle()
    assert.equal(count(), before + 1)
    await drain()
    const local = sql("SELECT opId,payloadHash FROM sync_ops WHERE origin='local' ORDER BY localOrder")
    assert.deepEqual(local.map(row => row.opId), cloud.world.workspace!.ops.map(row => row.opId))
    assert.deepEqual(local.map(row => row.payloadHash), cloud.world.workspace!.ops.map(row => row.payloadHash))
    checks.push('S02/S12: eleven durable ops share one request at the first mutation deadline; identity/hash/order unchanged')

    const beforeUndo = count(), cancelled: any = await create('Undo inside send window')
    service.nudge('write')
    const view: any = await storage.call('sync', { type: 'view' })
    await storage.call('command', { type: 'undo', originalOperationId: cancelled.operationId, operationId: randomUUID(), generation: view.generation })
    await clock.advance(200); await service.schedule.settle(); await drain()
    assert.equal(count(), beforeUndo)
    assert(!cloud.world.workspace!.ops.some(row => row.opId === cancelled.operationId))
    checks.push('S12: undo inside the debounce window stays local and never sends the cancelled creation')

    const racing: any = await create('Undo during send preparation')
    let undoPrepared: Promise<unknown> | null = null
    onEncrypt = () => { undoPrepared = storage.call('command', { type: 'undo', originalOperationId: racing.operationId, operationId: randomUUID(), generation: view.generation }) }
    await service.handle({ type: 'retry' }); await undoPrepared; await drain()
    assert.equal(count(), beforeUndo)
    assert.equal(status.error, null)
    assert(!cloud.world.workspace!.ops.some(row => row.opId === racing.operationId))
    checks.push('S12: undo queued before the atomic send mark cancels that batch without an error or network send')

    const head = cloud.world.workspace!.headSeq, broadcasts = cloud.controls.broadcasts
    const existing = cloud.world.workspace!.ops.at(-1)!
    const binding = service.secrets
    const duplicate = await service.remote.pushOps({ workspaceId: binding.workspaceId, deviceId: binding.deviceId, generation: binding.generation, ops: [existing] })
    assert.equal(duplicate[0].duplicate, true)
    assert.equal(cloud.world.workspace!.headSeq, head)
    assert.equal(cloud.controls.broadcasts, broadcasts)
    checks.push('S11: idempotent retry returns the original receipt without another head or broadcast at the controlled cloud boundary')

    const statusCount = cloud.requests.length
    cloud.controls.fault = 'gate:get_sync_status'
    const running = service.handle({ type: 'retry' })
    const deadline = performance.now() + 5_000
    while (cloud.requests.length === statusCount) { if (performance.now() > deadline) throw Error('Gate not reached'); await new Promise(resolve => setImmediate(resolve)) }
    await create('Write while checking'); service.nudge('write')
    cloud.controls.fault = ''; cloud.releaseReplies(); await running; await drain()
    assert.equal(sql("SELECT id FROM items WHERE title='Write while checking'").length, 1)
    assert.equal(status.pending, 0)
    checks.push('S03/S07: a mutation during a status request is retained without cancelling the healthy request')

    const bulkStart = count()
    for (let i = 0; i < 205; i++) await create(`Bulk ${i}`)
    await service.handle({ type: 'retry' })
    assert.equal(count(), bulkStart + 1)
    assert.equal(sql("SELECT opId FROM sync_ops WHERE state='never_sent'").length, 5)
    await drain()
    assert.equal(count(), bulkStart + 2)
    assert.equal(status.pending, 0)
    assert.equal(new Set(cloud.world.workspace!.ops.map(row => row.opId)).size, cloud.world.workspace!.ops.length)
    checks.push('S26: 205 ops use two turns/batches; only the first 200 are marked before the first send')
    await writeFile(join(out, 'batching.json'), JSON.stringify({ ok: true, checks, burst: { ops: 11, pushes: 1, maxWindowMs: 200 }, bulk: { ops: 205, pushes: 2 }, requests: cloud.requests }, null, 2))
    console.log(`M2 batching passed: ${checks.length} checks`)
  } catch (error) { await writeFile(join(out, 'batching.json'), JSON.stringify({ ok: false, checks, failure: String(error), status, requests: cloud.requests }, null, 2)); throw error }
  finally { service.stop(); await storage.close(); await cloud.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
