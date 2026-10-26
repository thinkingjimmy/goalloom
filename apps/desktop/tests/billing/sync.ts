/**
 * [INPUT]: Actual SyncService/SDK/SQLite worker and an isolated controlled encrypted cloud.
 * [OUTPUT]: Repeatable expiry, unknown-send receipt and restored-access evidence without local data loss.
 * [POS]: Billing/sync boundary E2E. No real user, provider, keychain, window or model request.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createCloud } from '../sync-cost/cloud'
import { seed, worker, cipher } from '../sync-cost/peer'
import { sql, tasks } from '../sync-join/peer'
import { Clock } from '../sync-cost/clock'
import { SyncService } from '../../src/main/sync/service'

async function main() {
  const out = resolve('../../output/tests/billing/desktop/d1-client'), root = await mkdtemp(join(tmpdir(), 'goalloom-billing-sync-'))
  await mkdir(out, { recursive: true })
  const report: any = { ok: false, checks: [], runtime: { electron: process.versions.electron, node: process.versions.node },
    host: { os: release(), arch: arch(), cpu: cpus()[0]?.model, physicalMachineOrVm: 'not independently established' },
    scope: 'Production sync service/SDK/Electron SQLite worker and controlled encrypted HTTP; no real Auth, hosted SQL, native UI, keychain, packaged client, Windows or model.' }
  const cloud = await createCloud(), profile = join(root, 'alpha'), clock = new Clock()
  let service: any = null, storage: Awaited<ReturnType<typeof worker>> | null = null, status: any = null
  const count = (rpc: string) => cloud.requests.filter(row => row.rpc === rpc).length
  const check = (name: string) => { report.checks.push(name); console.log(`PASS ${name}`) }
  const queued = () => sql(profile, 'SELECT opId,payloadHash,state FROM sync_ops WHERE state IN (\'never_sent\',\'send_unknown\') ORDER BY localOrder')
  try {
    await seed(profile, 'alpha', cloud.world, cloud.url)
    storage = await worker(profile)
    report.runtime.sqlite = (await storage.call<{ sqlite: string }>('runtime')).sqlite
    service = new SyncService({ userData: profile, storage, cipher, clock, random: () => 1,
      openExternal: async () => {}, notify: next => { status = next }, onApplied: () => {}, clipboard: () => {}, now: () => new Date().toISOString() })
    await service.start(); await service.schedule.settle(); await service.handle({ type: 'retry' }); await service.schedule.settle()
    assert.equal(status.phase, 'ready')
    const view: any = await storage.call('sync', { type: 'view' })
    const key = Buffer.from(service.secrets.workspaceKey).toString('hex'), device = service.secrets.deviceId
    const create = async (title: string) => storage!.call('command', { type: 'create', operationId: randomUUID(), generation: view.generation, title, horizon: 'day' })
    await create('Synthetic committed reply is lost')
    cloud.controls.dropped = true; cloud.controls.fault = 'commit:push_ops'
    await service.handle({ type: 'retry' }); await service.schedule.settle()
    const unknown = queued(); assert(unknown.some(row => row.state === 'send_unknown'))
    const cursor = Number(sql(profile, 'SELECT lastAppliedSeq FROM sync_state')[0]!.lastAppliedSeq)
    cloud.controls.fault = ''; cloud.controls.serviceError = 'service_expired'
    const reads = cloud.requests.length, pushes = count('push_ops'), pulls = count('pull_ops')
    await clock.advance(5001); await service.handle({ type: 'retry' }); await service.schedule.settle()
    const expiryCalls = cloud.requests.slice(reads).map(row => row.rpc)
    assert(expiryCalls.indexOf('receipts_for') >= 0 && expiryCalls.indexOf('receipts_for') < expiryCalls.indexOf('get_sync_status'))
    assert.equal(status.phase, 'ready'); assert.equal(status.error, 'service_expired'); assert.equal(service.accountId(), '11111111-1111-4111-8111-111111111111')
    assert.equal(queued().filter(row => row.state === 'send_unknown').length, 0)
    assert.equal(Number(sql(profile, 'SELECT lastAppliedSeq FROM sync_state')[0]!.lastAppliedSeq), cursor)
    assert.equal(count('push_ops'), pushes); assert.equal(count('pull_ops'), pulls)
    assert.equal(service.channel, null); assert.equal(clock.timers.size, 0)
    check('Expired access confirms original unknown hashes before admission, keeps identity/cursor and stops continuous sync without new transfer')
    await create('Synthetic local edit while expired')
    const local = tasks(profile), pending = queued()
    const beforeCheck = cloud.requests.length
    await service.billingChecked(false)
    assert(cloud.requests.slice(beforeCheck).every(row => row.rpc === 'receipts_for'))
    assert.deepEqual(tasks(profile), local); assert.deepEqual(queued(), pending)
    assert.equal(Buffer.from(service.secrets.workspaceKey).toString('hex'), key); assert.equal(service.secrets.deviceId, device)
    check('Independent receipt-only recovery cannot restart status, roster, pull, upload or device setup; local edits/outbox/keys remain')
    for (const code of ['service_not_started', 'service_revoked', 'upgrade_required', 'billing_configuration']) {
      cloud.controls.serviceError = code
      await service.handle({ type: 'retry' }); await service.schedule.settle()
      assert.equal(status.error, code); assert.equal(status.phase, 'ready'); assert.deepEqual(queued(), pending)
      assert(service.accountId()); assert.equal(service.channel, null)
    }
    check('Every service/configuration/upgrade refusal is distinct from logout and preserves the same pending operation identity')
    cloud.controls.serviceError = ''; cloud.controls.dropped = false
    await service.billingChecked(true); await service.schedule.settle()
    await clock.advance(Math.max(0, service.exchangeState.uploadRetryAt - clock.now()) + 1)
    await service.handle({ type: 'retry' }); await service.schedule.settle(); await service.handle({ type: 'retry' }); await service.schedule.settle()
    assert.equal(status.error, null); assert.equal(status.phase, 'ready'); assert.equal(status.pending, 0)
    assert.equal(service.secrets.deviceId, device); assert.equal(Buffer.from(service.secrets.workspaceKey).toString('hex'), key)
    assert.deepEqual(tasks(profile), local)
    check('Restored eligibility resumes the existing engine and sends pending local changes without replacing data, keys or device')
    report.ok = true
  } catch (error) { report.error = error instanceof Error ? error.stack : String(error); throw error }
  finally {
    service?.stop(); if (service) await service.schedule.settle(); await storage?.close(); await cloud.close()
    await writeFile(join(out, 'sync.json'), JSON.stringify(report, null, 2) + '\n'); await rm(root, { recursive: true, force: true })
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
