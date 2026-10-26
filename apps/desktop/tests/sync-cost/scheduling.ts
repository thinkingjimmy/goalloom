/**
 * [INPUT]: Production SyncService/SDK/storage and a fault-controlled HTTP/WS cloud.
 * [OUTPUT]: Reproducible timing, cancellation and two-peer convergence evidence.
 * [POS]: Sync-owned E2E; failure cases were frozen in the development plan before implementation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir, cpus, release, arch } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID, randomBytes } from 'node:crypto'
import { hex, unhex, utf8, rosterHash, signRoster, wrap, systemRandom } from '@goalloom/crypto'
import { createFetchRemote } from '@goalloom/sync'
import { SyncService } from '../../src/main/sync/service'
import { createCloud } from './cloud'
import { cipher, seed, worker } from './peer'
import { Clock } from './clock'

const immediate = () => new Promise<void>(resolve => setImmediate(resolve))
async function until(check: () => boolean | Promise<boolean>, label: string) {
  const limit = performance.now() + 10_000
  while (!await check()) { if (performance.now() > limit) throw new Error(`Timed out: ${label}`); await immediate() }
}

async function main() {
  const out = resolve('output/tests/sync-cost'); await mkdir(out, { recursive: true })
  const base = await mkdtemp(join(tmpdir(), 'goalloom-sync-schedule-'))
  const cloud = await createCloud(), clock = new Clock(), checks: string[] = []
  const check = (label: string) => { checks.push(label); console.log(label) }
  const peers: any[] = [], timeline: object[] = []
  const sql = (peer: any, statement: string) => {
    const db = new DatabaseSync(join(peer.profile, 'workspace.sqlite'), { readOnly: true })
    try { return db.prepare(statement).all() } finally { db.close() }
  }
  const rowCount = (rpc: string) => cloud.requests.filter(row => row.rpc === rpc).length
  async function open(name: string) {
    const profile = join(base, name); await seed(profile, name, cloud.world, cloud.url)
    const storage = await worker(profile)
    const peer: any = { profile, storage, status: null }
    peer.service = new SyncService({ userData: profile, storage, cipher, clock, random: () => 1,
      openExternal: async () => {}, notify: status => { peer.status = status; timeline.push({ at: clock.now(), peer: name, ...status }) },
      onApplied: () => {}, clipboard: () => {}, now: () => new Date().toISOString() })
    peers.push(peer); await peer.service.start()
    assert.equal(peer.status.phase, 'ready')
    await until(() => peer.service.schedule.subscribed, 'private channel subscription')
    return peer
  }
  async function settle(peer: any) {
    await peer.service.schedule.settle()
    await clock.advance(0)
    await peer.service.schedule.settle()
  }
  async function create(peer: any, title: string) {
    const view: any = await peer.service.local({ type: 'view' })
    return peer.storage.call('command', { type: 'create', operationId: randomUUID(), generation: view.generation, title, horizon: 'day' })
  }
  try {
    const a = await open('alpha'), b = await open('beta')
    await a.service.handle({ type: 'retry' }); await settle(a); await settle(b)
    const before = cloud.requests.length
    for (let i = 0; i < 30; i++) await a.service.handle({ type: 'retry' })
    const idle = cloud.requests.slice(before)
    assert.equal(idle.length, 30)
    assert(idle.every(row => row.rpc === 'get_sync_status'))
    assert.equal(a.status.syncing, false)
    check('S01: 30 unchanged foreground triggers use 30 status calls, zero roster/pull calls')

    a.service.setForeground(false)
    for (let t = 0; t < 128_000; t += 8_000) {
      await a.service.client.realtime.sendHeartbeat()
      await until(() => a.service.schedule.heartbeatAt === clock.now(), 'heartbeat acknowledgement')
      await clock.advance(8_000); await settle(a); await settle(b)
    }
    assert(a.service.schedule.idleStep > 0)
    const timer = [...clock.timers.values()].filter(row => row.at > clock.now()).map(row => row.at - clock.now())
    assert(timer.some(ms => ms > 8_000))
    check('S01: healthy background enters the staged idle schedule after 120 seconds')
    const focus = rowCount('get_sync_status')
    a.service.setForeground(true); await settle(a)
    assert(rowCount('get_sync_status') > focus)
    check('S06: foreground return checks immediately')

    // Replay the plan's 20% foreground / 80% healthy background idle workload.
    b.service.schedule.stop()
    const modelStart = cloud.requests.length, modelAt = clock.now()
    let nextHeartbeat = clock.now()
    const advanceHealthy = async (duration: number) => {
      const end = clock.now() + duration
      while (clock.now() < end) {
        if (clock.now() >= nextHeartbeat) {
          await a.service.client.realtime.sendHeartbeat()
          await until(() => a.service.schedule.heartbeatAt === clock.now(), 'model heartbeat')
          nextHeartbeat = clock.now() + 20_000
        }
        const due = Math.min(end, nextHeartbeat, ...[...clock.timers.values()].map(row => row.at))
        await clock.advance(Math.max(0, due - clock.now()))
        await a.service.schedule.settle()
      }
    }
    await advanceHealthy(2_880_000)
    a.service.setForeground(false)
    await advanceHealthy(11_520_000)
    assert(a.service.schedule.idleStep >= 3)
    const model = cloud.requests.slice(modelStart).filter(row => row.peer === 'alpha')
    assert(model.every(row => row.rpc === 'get_sync_status' && !row.aborted))
    assert(model.length < 450)
    await writeFile(join(out, 'idle-workload.json'), JSON.stringify({ ok: true, clockSeconds: (clock.now() - modelAt) / 1000,
      foregroundSeconds: 2880, backgroundSeconds: 11520, checks: model.length, responseBodyBytes: model.reduce((n, row) => n + row.bytes, 0),
      requestBodyBytes: model.reduce((n, row) => n + row.uploadedBytes, 0), maxIntervalMs: 300000,
      heartbeat: 'Real SDK/WS acknowledgements at a synthetic 20-second cadence; wire/TLS/Auth cost excluded from body totals.',
    }, null, 2))
    check('S01/S04: four-hour 20/80 idle workload reaches 300-second fallback with fewer than 450 checks and no roster/pull')
    cloud.controls.dropped = true
    await create(b, 'Fallback after a lost notification'); await b.service.handle({ type: 'retry' }); await settle(b)
    b.service.schedule.stop()
    const fallbackDeadline = clock.now() + 300_000
    while (!sql(a, "SELECT id FROM items WHERE title='Fallback after a lost notification'").length) {
      const nextCheck = Math.min(...[...clock.timers.values()].map(row => row.at))
      assert(Number.isFinite(nextCheck) && nextCheck <= fallbackDeadline, 'Lost notification must be recovered within 300 seconds')
      await clock.advance(nextCheck - clock.now()); await settle(a)
    }
    cloud.controls.dropped = false
    check('S04: a missed broadcast is recovered by the healthy background fallback within 300 seconds')
    a.service.setForeground(true); b.service.schedule.start(); await settle(a)

    const ws = cloud.world.workspace!, previousRoster = ws.rosters.at(-1)!.roster, key = randomBytes(32)
    const roster = { ...previousRoster, version: previousRoster.version + 1, epoch: previousRoster.epoch + 1, prevHash: rosterHash(previousRoster) }
    const signer = a.service.secrets
    ws.rosters.push({ version: roster.version, roster, bodyHash: rosterHash(roster), signature: hex(signRoster(roster, signer.signSk)), signerType: 'device', signerDevice: signer.deviceId })
    ws.rosterVersion = roster.version; ws.keyEpoch = roster.epoch
    for (const device of roster.devices) {
      const envelope = wrap({ senderId: signer.deviceId, signSk: signer.signSk, recipientId: device.id, recipientBoxPub: unhex(device.boxPub),
        ctx: `wk|${ws.id}|${roster.epoch}`, plaintext: key, random: systemRandom() })
      ws.envelopes.push({ epoch: roster.epoch, recipient: device.id, ciphertext: hex(utf8(JSON.stringify(envelope))), signature: envelope.sig,
        rosterVersion: roster.version, signerDevice: signer.deviceId })
    }
    await a.service.handle({ type: 'retry' }); await b.service.handle({ type: 'retry' })
    assert.equal(a.service.secrets.epoch, roster.epoch); assert.equal(b.service.secrets.epoch, roster.epoch)
    await create(b, 'New epoch operation'); await b.service.handle({ type: 'retry' }); await settle(b)
    await a.service.handle({ type: 'retry' }); await settle(a)
    assert.equal(sql(a, "SELECT id FROM items WHERE title='New epoch operation'").length, 1)
    check('S09: unchanged head with a new signed roster/epoch refreshes envelopes and decrypts subsequent operations')


    cloud.controls.fault = 'headers:get_sync_status'
    const headerStart = cloud.requests.length
    const hung = a.service.handle({ type: 'retry' })
    await until(() => cloud.requests.length > headerStart, 'header stall')
    await clock.advance(5_000); await hung
    await until(() => cloud.requests.some(row => row.rpc === 'get_sync_status' && row.aborted), 'aborted HTTP request')
    assert.equal(a.service.schedule.running, null)
    cloud.controls.fault = ''
    await a.service.handle({ type: 'retry' })
    assert.equal(a.status.offline, false)
    check('S19: header timeout aborts transport and releases the executor')

    cloud.controls.fault = 'body:get_sync_status'
    const body = a.service.handle({ type: 'retry' })
    const bodyStart = cloud.requests.length
    await until(() => cloud.requests.length > bodyStart, 'body stall')
    await clock.advance(5_000); await body
    assert.equal(a.service.schedule.running, null)
    cloud.controls.fault = ''
    await a.service.handle({ type: 'retry' })
    check('S20: response-body stall remains covered by the same deadline')

    let releaseToken!: (token: string) => void
    const tokenRemote = createFetchRemote({ url: cloud.url, anonKey: 'synthetic', clock, accessToken: () => new Promise(resolve => { releaseToken = resolve }) })
    const bound = a.service.secrets
    const late = tokenRemote.getSyncStatus(bound.workspaceId, bound.deviceId)
    const lateError = late.catch((error: any) => error.code)
    await immediate(); await clock.advance(5_000)
    assert.equal(await lateError, 'timeout')
    const lateCount = cloud.requests.length
    releaseToken('late'); await immediate()
    assert.equal(cloud.requests.length, lateCount)
    check('S21: hanging token wait expires; late token cannot start HTTP')

    cloud.controls.dropped = true
    await create(b, 'Remote before upload failure'); await b.service.handle({ type: 'retry' }); await settle(b)
    await create(a, 'Unknown committed upload')
    cloud.controls.fault = 'commit:push_ops'
    await a.service.handle({ type: 'retry' })
    assert(sql(a, "SELECT state FROM sync_ops WHERE origin='local' AND state='send_unknown'").length > 0)
    assert(sql(a, "SELECT id FROM items WHERE title='Remote before upload failure'").length === 1)
    cloud.controls.fault = ''
    await a.service.handle({ type: 'retry' }); await settle(a)
    assert.equal(sql(a, "SELECT state FROM sync_ops WHERE origin='local' AND state='send_unknown'").length, 0)
    assert.equal(a.status.pending, 0)
    check('S22: committed upload with lost response stays unknown, then confirms by independent receipt/pull')

    await clock.advance(8_000); await settle(a); await settle(b)
    await create(a, 'Late committed operation')
    cloud.controls.fault = 'late:push_ops'
    const latePushCount = rowCount('push_ops')
    const latePush = a.service.handle({ type: 'retry' })
    await until(() => rowCount('push_ops') > latePushCount, 'late push in flight')
    a.service.suspend(); await latePush
    assert(sql(a, "SELECT state FROM sync_ops WHERE origin='local' AND state='send_unknown'").length > 0)
    cloud.controls.fault = ''; cloud.controls.blocked = 'push_ops'; cloud.controls.retryAt = Date.now() + 60_000
    await a.service.resume(); await settle(a)
    cloud.controls.blocked = ''
    assert(sql(a, "SELECT state FROM sync_ops WHERE origin='local' AND state='send_unknown'").length > 0)
    await cloud.commitDelayed()
    await clock.advance(8_000); await a.service.handle({ type: 'retry' }); await settle(a)
    assert.equal(sql(a, "SELECT state FROM sync_ops WHERE origin='local' AND state='send_unknown'").length, 0)
    const ids = cloud.world.workspace!.ops.map(row => row.opId)
    assert.equal(new Set(ids).size, ids.length)
    check('S23: empty receipt after cancellation preserves identity; a later server commit converges once')

    cloud.controls.fault = 'headers:get_sync_status'
    const cancelled = a.service.handle({ type: 'retry' })
    const cancelCount = cloud.requests.length
    await until(() => cloud.requests.length > cancelCount, 'lifecycle stall')
    a.service.suspend(); await cancelled
    assert.equal(a.service.schedule.running, null)
    cloud.controls.fault = ''; await a.service.resume(); await settle(a)
    assert.equal(a.status.offline, false)
    check('S10: lifecycle cancellation releases executor and resume performs one fresh check')

    await b.service.handle({ type: 'retry' }); await settle(b); await a.service.handle({ type: 'retry' }); await settle(a)
    assert.deepEqual(sql(a, 'SELECT id,title,status FROM items ORDER BY id'), sql(b, 'SELECT id,title,status FROM items ORDER BY id'))
    check('Two real SQLite peers converge with continuous applied cursors')
    const configured = cloud.requests.length
    cloud.controls.fault = 'missing:get_sync_status'; cloud.controls.session = 'alpha'
    await a.service.handle({ type: 'retry' })
    assert.equal(a.status.error, 'configuration')
    const pausedCalls = cloud.requests.length
    for (let n = 0; n < 20; n++) a.service.nudge()
    await immediate(); assert.equal(cloud.requests.length, pausedCalls)
    assert(cloud.requests.slice(configured).every(row => row.peer !== 'alpha' || row.rpc === 'get_sync_status'))
    cloud.controls.fault = ''; cloud.controls.session = ''
    await a.service.handle({ type: 'retry' }); assert.equal(a.status.error, null)
    check('Missing target RPC pauses automatic work without fallback or a request loop; explicit retry recovers after repair')

    a.service.setForeground(false)
    cloud.disconnectSockets()
    await until(() => !a.service.schedule.subscribed, 'closed channel detected')
    const degraded = cloud.requests.length
    await clock.advance(8_000); await settle(a)
    assert(cloud.requests.slice(degraded).some(row => row.peer === 'alpha' && row.rpc === 'get_sync_status'))
    await until(() => a.service.schedule.subscribed, 'actual SDK reconnect')
    await a.service.schedule.settle()
    assert.equal(a.status.error, null)
    check('S05/S06: lost socket returns to short HTTP fallback; actual SDK resubscription immediately revalidates')

    b.service.schedule.stop()
    await a.service.local({ type: 'emit-settings', opId: randomUUID(), at: new Date().toISOString(), mode: 'change', entries: [{ key: 'theme', value: 'dark' }] })
    let releaseProjection!: (rows: string[]) => void
    a.service.deps.onSettings = () => new Promise<string[]>(resolve => { releaseProjection = resolve })
    const project = a.service.projectRemote.bind(a.service)
    let projection: Promise<unknown> | null = null
    a.service.projectRemote = () => { projection = project(); return projection }
    const blockedTurn = a.service.handle({ type: 'retry' })
    await until(() => Boolean(releaseProjection), 'uncancellable local projection')
    const oldProjection = projection!
    await clock.advance(60_000); await blockedTurn
    assert.equal(a.service.schedule.running, null)
    a.service.deps.onSettings = undefined
    await a.service.handle({ type: 'retry' }); await settle(a)
    const afterRecovery = cloud.requests.length
    releaseProjection(['theme'])
    assert.equal(await oldProjection.then(() => 'late success', (error: any) => error.code), 'timeout')
    await immediate(); assert.equal(cloud.requests.length, afterRecovery)
    a.service.projectRemote = project
    check('S26: the 60-second turn budget releases a stalled local callback; its late result cannot start another exchange')

    cloud.controls.dropped = false
    const changed = await a.service.handle({ type: 'change-password', password: 'synthetic-updated-password' })
    assert.equal(changed.status.error, null)
    assert.equal(a.service.client.getChannels().filter((channel: any) => channel.topic === `realtime:cloud:v1:ws:${a.service.secrets.workspaceId}`).length, 1)
    await create(b, 'Notification after password change'); await b.service.handle({ type: 'retry' }); await settle(b)
    await until(async () => { await clock.advance(0); await a.service.schedule.settle(); return sql(a, "SELECT id FROM items WHERE title='Notification after password change'").length === 1 }, 'head after same-binding lifecycle change')
    check('S06/S10: changing the sync password reuses one SDK subscription and subsequent notifications still download immediately')

    await writeFile(join(out, 'scheduling.json'), JSON.stringify({ ok: true, checks, runtime: await a.storage.call('runtime'),
      process: { electron: process.versions.electron, node: process.versions.node, os: process.platform, release: release(), arch: arch(), cpu: cpus()[0]?.model, machine: 'Physical/VM unverified' },
      scope: 'Production SyncService, SDK HTTP/WebSocket and real storage workers in Electron Node. Synthetic cloud/cipher/clock; native-window and hosted SQL acceptance separate.', idleRequests: idle.length,
    }, null, 2))
    await writeFile(join(out, 'requests.json'), JSON.stringify(cloud.requests, null, 2))
    await writeFile(join(out, 'schedule.json'), JSON.stringify(timeline, null, 2))
    console.log(`Sync scheduling passed: ${checks.length} checks`)
  } catch (error) {
    await writeFile(join(out, 'scheduling.json'), JSON.stringify({ ok: false, checks, failure: String(error), requests: cloud.requests, timeline }, null, 2))
    throw error
  } finally { for (const peer of peers) { peer.service.stop(); await peer.storage.close() }; await cloud.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
