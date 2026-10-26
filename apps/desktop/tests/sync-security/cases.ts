/**
 * [INPUT]: Production SyncService/SDK/storage and controlled HTTP, connectivity and clocks.
 * [OUTPUT]: Repeatable security/recovery assertions and a runtime-scoped JSON report.
 * [POS]: Feature E2E. It never reads a user profile, OS keys or a live account.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { arch, cpus, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createCloud } from '../sync-cost/cloud'
import { Clock } from '../sync-cost/clock'
import { cipher, worker } from '../sync-cost/peer'
import { calendar, command, password, seedLocal, settle, sql, tasks } from '../sync-join/peer'
import { SyncService } from '../../src/main/sync/service'
import { SyncVault } from '../../src/main/sync/vault'
import { createNetworkMonitor } from '../../src/main/sync/network-monitor'
import { DomainError } from '../../src/shared/contracts/commands'

async function main() {
const out = resolve('output/tests/sync-security')
await mkdir(out, { recursive: true })
const root = await mkdtemp(join(tmpdir(), 'goalloom-sync-security-'))
const cloud = await createCloud()
const peers: any[] = []
const report: any = { ok: false, checks: [], runtime: { electron: process.versions.electron, node: process.versions.node },
  host: { os: release(), arch: arch(), cpu: cpus()[0]?.model },
  scope: 'Production service/SDK and Electron SQLite worker; controlled encrypted HTTP and OS cipher. Native UI and hosted SQL have separate reports.' }
const check = (label: string) => { report.checks.push(label); console.log(`PASS ${label}`) }
const exists = async (path: string) => !!await stat(path).catch(() => null)
async function open(profile: string, name: string, online = { value: true }) {
  const storage = await worker(profile), clock = new Clock()
  const peer: any = { profile, storage, clock, online, status: null }
  peer.service = new SyncService({ userData: profile, storage, clock, cipher, random: () => 1,
    monitorNetwork: handler => createNetworkMonitor(handler, { clock, online: () => online.value }),
    openExternal: async () => {}, notify: status => { peer.status = status }, onApplied: () => {}, clipboard: () => {}, now: () => new Date().toISOString(),
    beginSignIn: async client => {
      const reply = await client.auth.refreshSession({ refresh_token: name })
      if (!reply.data.session) throw Error('Synthetic authorization failed')
      return reply.data.session
    },
  })
  peers.push(peer)
  await peer.service.start()
  return peer
}
async function close(peer: any) { peer.service.stop(); await peer.service.schedule.settle(); await peer.storage.close(); peers.splice(peers.indexOf(peer), 1) }
async function wait(peer: any) { await peer.service.operation; await peer.service.schedule.settle(); await peer.clock.advance(0); await peer.service.schedule.settle() }
try {
  const alpha = join(root, 'alpha'), beta = join(root, 'beta')
  await seedLocal(alpha, 'alpha', 3, cloud); await seedLocal(beta, 'beta', 0, cloud)
  let a = await open(alpha, 'alpha')
  await a.service.handle({ type: 'sign-in', provider: 'google' }); await a.service.handle({ type: 'create', password }); await settle(a)
  assert.equal(a.status.phase, 'ready')
  report.runtime.sqlite = (await a.storage.call('runtime')).sqlite
  const originalId = cloud.world.workspace!.id
  let b = await open(beta, 'beta')
  await b.service.handle({ type: 'sign-in', provider: 'google' }); await b.service.handle({ type: 'submit-password', password }); await settle(a, b)
  const originalTasks = tasks(alpha), originalCalendar = calendar(alpha)
  const originalVault = await new SyncVault(alpha, cipher).load()
  const keep = await a.service.handle({ type: 'sign-out' })
  assert.equal(keep.status.phase, 'signed-out'); assert.deepEqual(tasks(alpha), originalTasks)
  assert(await exists(join(alpha, 'workspace.sqlite')))
  const preserved = await new SyncVault(alpha, cipher).load()
  assert.deepEqual(preserved?.workspaceKey, originalVault?.workspaceKey)
  assert.equal(preserved?.refreshToken, null)
  assert.equal(a.clock.timers.size, 0, 'Sign-out must remove the connectivity watcher')
  check('Keep-local sign-out preserves SQLite, tasks, keys and send data; the monitor stops')

  a.service.deps.beginSignIn = async (client: any) => (await client.auth.refreshSession({ refresh_token: 'other-alpha' })).data.session
  const beforeSwitch = cloud.requests.length
  const switched = await a.service.handle({ type: 'sign-in', provider: 'google' })
  assert.equal(switched.status.error, 'mismatch'); assert.equal(switched.status.phase, 'signed-out')
  assert.equal(cloud.worlds.get('22222222-2222-4222-8222-222222222222')!.workspace, null)
  assert(!cloud.requests.slice(beforeSwitch).some(row => ['push_ops', 'bootstrap_workspace', 'create_new_workspace'].includes(row.rpc)))
  assert.deepEqual(tasks(alpha), originalTasks)
  check('A different account is rejected before device setup, workspace creation or upload')
  a.service.deps.beginSignIn = async (client: any) => (await client.auth.refreshSession({ refresh_token: 'alpha' })).data.session
  await a.service.handle({ type: 'sign-in', provider: 'google' }); await settle(a)
  assert.equal(a.status.phase, 'ready'); assert.equal(a.service.secrets.workspaceId, originalId)

  const oldRows = structuredClone(cloud.world.workspace!.ops)
  const recovered = await createGeneration(a, 'independent-password')
  assert.equal(recovered.status.phase, 'ready', JSON.stringify(recovered))
  await settle(a, b)
  const newId = a.service.secrets.workspaceId
  assert.notEqual(newId, originalId, JSON.stringify({ recovered, pending: (await a.service.bindingJournal.pending(a.service.accountId()))?.binding.workspaceId, initializations: [...cloud.world.workspaces.values()].map(row => ({ id: row.id, final: row.initialization?.finalSeq, finished: !!row.initialization?.receipt })), finishCalls: cloud.requests.filter(row => row.rpc === 'finish-initialization').length })); assert.equal(cloud.world.workspaces.size, 2)
  assert.deepEqual(cloud.world.workspaces.get(originalId)!.ops, oldRows)
  assert.deepEqual(tasks(alpha), originalTasks); assert.deepEqual(calendar(alpha), originalCalendar)
  await close(a); a = await open(alpha, 'alpha'); await settle(a)
  assert.equal(a.status.phase, 'ready'); assert.equal(a.service.secrets.workspaceId, newId)
  await close(b); b = await open(beta, 'beta'); await settle(b)
  assert.equal(b.status.phase, 'ready'); assert.equal(b.service.secrets.workspaceId, originalId)
  await command(b, { type: 'create', title: 'Only the preserved workspace', horizon: 'day' }); await settle(a, b)
  assert(tasks(beta).some(row => row.title === 'Only the preserved workspace'))
  assert(!tasks(alpha).some(row => row.title === 'Only the preserved workspace'))
  check('New workspace preserves old ciphertext; both devices restart on their pinned workspace and stay independent')

  const storageCall = a.storage.call.bind(a.storage)
  const countBeforeProtection = cloud.world.workspaces.size
  a.storage.call = async (method: string, action: any) => {
    if (method === 'sync' && action?.type === 'protect') throw new DomainError('backup', 'Synthetic protective-copy failure')
    return storageCall(method, action)
  }
  assert.equal((await createGeneration(a, 'installation-password')).status.error, 'storage')
  assert.equal(cloud.world.workspaces.size, countBeforeProtection)
  a.storage.call = async (method: string, action: any) => {
    if (method === 'sync' && action?.type === 'transition-commit') throw new DomainError('storage', 'Synthetic baseline-install failure')
    return storageCall(method, action)
  }
  const failedInstall = await createGeneration(a, 'installation-password')
  assert.equal(failedInstall.status.error, 'storage'); assert.equal(failedInstall.status.phase, 'enter-key')
  const installationId = (await a.service.bindingJournal.pending(a.service.accountId()))!.binding.workspaceId
  assert.equal(cloud.world.workspaces.get(installationId)!.ops.length, 0, 'Old local operations cannot exchange under the new cloud key')
  assert.equal(sql(alpha, 'SELECT workspaceId FROM sync_state')[0]!.workspaceId, newId)
  assert.deepEqual(tasks(alpha), originalTasks)
  a.storage.call = storageCall
  const installed = await createGeneration(a, 'installation-password')
  assert.equal(installed.status.phase, 'ready'); assert.equal(a.service.secrets.workspaceId, installationId)
  check('Protection and installation failures preserve the board and prevent exchange until atomic baseline/binding succeeds')

  // The server may accept creation while its response is lost. The encrypted draft is the retry identity.
  const beforeRetryWorkspace = a.service.secrets.workspaceId
  cloud.controls.fault = 'commit:create_new_workspace'; cloud.controls.session = 'alpha'
  const failedCreate = await createGeneration(a, 'third-password')
  assert.equal(failedCreate.status.error, 'network')
  const draftId = (await a.service.bindingJournal.pending(a.service.accountId()))!.binding.workspaceId
  const count = cloud.world.workspaces.size
  assert(cloud.world.workspaces.has(draftId)); assert.equal(a.service.secrets.workspaceId, beforeRetryWorkspace)
  await close(a); cloud.controls.fault = ''; cloud.controls.session = ''; a = await open(alpha, 'alpha')
  const retried = await createGeneration(a, 'third-password')
  assert.equal(retried.status.phase, 'ready'); assert.equal(a.service.secrets.workspaceId, draftId)
  assert.equal(cloud.world.workspaces.size, count)
  check('Lost creation response and restart reuse one encrypted recovery draft without duplicate workspaces')

  await assert.rejects(a.service.handle({ type: 'reset-sync', password: 'reset-password' }))
  await assert.rejects(a.service.handle({ type: 'reset-sync', password: 'reset-password', confirmation: 'delete all cloud data' }))
  await settle(a)
  const reset = await a.service.handle({ type: 'reset-sync', password: 'reset-password', confirmation: 'DELETE ALL CLOUD DATA' })
  assert.equal(reset.status.phase, 'ready'); assert(!cloud.world.workspaces.has(draftId))
  assert(cloud.world.workspaces.has(originalId)); assert(cloud.world.workspaces.has(newId))
  await settle(a, b)
  check('Destructive reset requires the exact IPC phrase and removes only the selected workspace')

  const beforeClear = a.status
  const beforeClearTasks = tasks(alpha)
  const receipt = join(alpha, 'sync-clear.json')
  await mkdir(receipt)
  const failedClear = await a.service.handle({ type: 'sign-out', clearLocal: true })
  assert.equal(failedClear.status.error, 'storage'); assert.equal(failedClear.status.phase, beforeClear.phase)
  assert.deepEqual(tasks(alpha), beforeClearTasks); assert(await exists(join(alpha, 'sync-vault.bin')))
  await rm(receipt, { recursive: true })
  check('Failed cleanup preparation retains the signed-in runtime, database and vault')

  const oldGeneration = (await a.service.local({ type: 'view' })).generation
  const marker = join(alpha, `sync-send-${'f'.repeat(64)}.bin`)
  await writeFile(marker, 'Synthetic prepared send')
  const backupFiles = await readdir(join(alpha, 'backups')); assert(backupFiles.length > 0)
  const oldInode = (await stat(join(alpha, 'workspace.sqlite'))).ino
  const cleared = await a.service.handle({ type: 'sign-out', clearLocal: true })
  assert.equal(cleared.status.phase, 'signed-out'); assert.equal(cleared.status.error, null)
  assert.deepEqual(tasks(alpha), [])
  assert.notEqual((await stat(join(alpha, 'workspace.sqlite'))).ino, oldInode)
  assert.equal(sql(alpha, 'SELECT setupConfirmedAt FROM workspace')[0]!.setupConfirmedAt, null)
  assert(!await exists(join(alpha, 'sync-vault.bin'))); assert(!await exists(marker))
  assert(!await exists(join(alpha, 'backups')) || (await readdir(join(alpha, 'backups'))).length === 0)
  const stale = await a.storage.call('command', { type: 'create', operationId: randomUUID(), generation: oldGeneration, title: 'Stale account task', horizon: 'day' }).catch((error: Error) => error)
  assert(stale instanceof Error)
  assert.equal(a.clock.timers.size, 0)
  check('Explicit clear replaces the closed database, removes backups/vault/send files and rejects old-generation writes')

  await close(a); a = await open(alpha, 'other-alpha')
  await a.service.handle({ type: 'sign-in', provider: 'google' }); assert.equal(a.status.phase, 'setup')
  assert.deepEqual(tasks(alpha), [])
  // The new account cannot receive the old board, even after restart and creating sync.
  const setup = await command(a, { type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-01-01' }, confirmed: true })
  assert(setup)
  await a.service.handle({ type: 'create', password }); await settle(a)
  assert.equal(a.status.phase, 'ready'); assert.deepEqual(tasks(alpha), [])
  check('After clear and restart, another account starts empty and never uploads the previous account’s tasks')

  // An unavailable cipher cannot authorize irreversible local cleanup.
  const bytesBefore = await readFile(join(alpha, 'sync-vault.bin'))
  a.service.vault = new SyncVault(alpha, { ...cipher, decrypt: () => { throw Error('Synthetic denied access') } })
  const denied = await a.service.handle({ type: 'sign-out', clearLocal: true })
  assert.equal(denied.status.error, 'storage'); assert.equal(denied.status.phase, 'ready')
  assert.deepEqual(await readFile(join(alpha, 'sync-vault.bin')), bytesBefore)
  a.service.vault = new SyncVault(alpha, cipher)
  check('Unreadable encrypted credentials prevent local deletion and preserve the original bytes')

  // Network restoration must clear transport backoff, but retain a server upload quota.
  a.online.value = false; await a.clock.advance(2_000)
  await command(a, { type: 'create', title: 'Offline task to recover', horizon: 'day' })
  a.service.exchangeState.uploadRetryAt = a.clock.now() + 60_000
  a.service.exchangeState.uploadReason = 'network'
  const beforeNetwork = cloud.requests.filter(row => row.rpc === 'get_sync_status' && row.peer === 'other-alpha').length
  a.online.value = true; await a.clock.advance(2_000); await wait(a); await settle(a)
  const afterNetwork = cloud.requests.filter(row => row.rpc === 'get_sync_status' && row.peer === 'other-alpha').length
  assert(afterNetwork > beforeNetwork); assert.equal(a.status.pending, 0)
  a.service.exchangeState.uploadRetryAt = a.clock.now() + 60_000; a.service.exchangeState.uploadReason = 'quota'
  const quotaUntil = a.service.exchangeState.uploadRetryAt
  a.online.value = false; await a.clock.advance(2_000); a.online.value = true; await a.clock.advance(2_000); await wait(a)
  assert.equal(a.service.exchangeState.uploadRetryAt, quotaUntil)
  check('OS online transitions retry pending work within two seconds without bypassing server upload quotas')

  // Startup session refresh can succeed before the first offline control read fails.
  const offlineProfile = beta
  await close(b)
  cloud.world.online = false
  const online = { value: false }
  const offlineStartRequests = cloud.requests.length
  let offline = await open(offlineProfile, 'beta', online)
  assert.equal(offline.status.error, 'network')
  assert.equal(cloud.requests.length, offlineStartRequests, 'An offline start waits for connectivity without entering SDK refresh backoff')
  cloud.world.online = true; online.value = true; await offline.clock.advance(2_000); await wait(offline)
  assert.equal(offline.status.phase, 'ready', JSON.stringify(offline.status))
  check('Offline startup resumes the saved session and original binding on a controlled OS online transition')

  await close(offline)
  cloud.world.online = false
  const resumedOnline = { value: false }
  offline = await open(offlineProfile, 'beta', resumedOnline)
  offline.service.suspend()
  cloud.world.online = true; resumedOnline.value = true
  await offline.clock.advance(2_000)
  await offline.service.resume(); await wait(offline)
  assert.equal(offline.status.phase, 'ready', 'A connectivity transition during suspension must resume the saved session after wake')
  check('Wake recovers an offline-start session when connectivity changed while monitoring was suspended')

  const subscriptions = cloud.controls.topics.filter(topic => topic === `realtime:cloud:v1:ws:${originalId}`).length
  const reads = cloud.requests.filter(row => row.rpc === 'get_sync_status' && row.peer === 'beta').length
  cloud.disconnectSockets()
  const deadline = Date.now() + 5_000
  while (cloud.controls.topics.filter(topic => topic === `realtime:cloud:v1:ws:${originalId}`).length <= subscriptions || cloud.requests.filter(row => row.rpc === 'get_sync_status' && row.peer === 'beta').length <= reads) {
    await offline.clock.advance(0)
    await offline.service.schedule.settle()
    assert(Date.now() < deadline, 'Realtime did not reconnect and request control metadata')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  await wait(offline)
  check('Real SDK WebSocket reconnection requests an immediate sync check without a manual retry')

  offline.service.schedule.heartbeat(true)
  offline.service.setForeground(false)
  assert.equal(offline.service.schedule.realtimeConnected, true)
  await offline.clock.advance(60_001); await wait(offline)
  assert.equal(offline.service.schedule.realtimeConnected, false)
  assert([...offline.clock.timers.values()].some((timer: any) => timer.at - offline.clock.now() <= 8_000))
  await close(offline)
  assert.equal(offline.clock.timers.size, 0)
  check('Heartbeat expiry restores bounded polling; stop removes connectivity and heartbeat timers')
  report.ok = true
} catch (error) { report.error = (error as Error).stack; throw error }
finally {
  for (const peer of [...peers]) await close(peer).catch(() => {})
  await cloud.close(); await rm(root, { recursive: true, force: true })
  await writeFile(join(out, 'cases.json'), JSON.stringify(report, null, 2))
}

}
void main().catch(error => { console.error(error); process.exitCode = 1 })

async function createGeneration(peer: any, password: string) {
  await settle(peer)
  const expectedAccountId = peer.service.accountId()
  const preview = await peer.service.handle({ type: 'generation-preview', expectedAccountId })
  assert(preview.generationPreview, JSON.stringify(preview))
  return peer.service.handle({ type: 'create-new-workspace', password, expectedAccountId, previewToken: preview.generationPreview.token, acknowledged: true })
}
