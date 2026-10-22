/**
 * [INPUT]: Production preference projection, SyncService/SQLite, a synthetic encrypted HTTP cloud and explicit deferred completions.
 * [OUTPUT]: Repeatable stale-notification and pull-before-reconcile evidence, including a blocked later upload.
 * [POS]: Parent-placement race acceptance; failure cases are declared before their implementation below.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { memoryRemote, sealOpWire } from '@goalloom/sync'
import { ParentOrderPreference } from '../../src/main/window/parent-order'
import { projectSettingRows } from '../../src/main/sync/project-settings'
import { SyncService } from '../../src/main/sync/service'
import { createCloud } from '../sync-cost/cloud'
import { cipher, seed, worker } from '../sync-cost/peer'
import { Clock } from '../sync-cost/clock'
import { currentParentOrder, setParentOrder, startParentOrder } from '../../src/renderer/state/parent-order'

// Failure cases: delayed remote persistence must not echo over a newer local toggle;
// a slow later setting must not publish a stale placement value; pulled settings must
// finish projection before reconciliation and before a subsequent stalled upload.
// An older remote event received before main accepts a local toggle must not undo
// the optimistic renderer value; only the latest write acknowledgement can settle it.
// A setting snapshot read before a deferred secret write must not overwrite a local
// toggle accepted before that same snapshot reaches the device projector.
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
async function until(check: () => boolean, label: string) {
  const deadline = performance.now() + 10_000
  while (!check()) {
    if (performance.now() > deadline) throw new Error(`Timed out: ${label}`)
    await new Promise<void>(resolve => setImmediate(resolve))
  }
}
async function main() {
const directory = resolve('output/tests/parent-placement')
await mkdir(directory, { recursive: true })
const temporary = await mkdtemp(join(tmpdir(), 'goalloom-parent-preferences-'))
const report: any = { passed: false, checks: [], runtime: process.versions,
  scope: 'Source Electron Node, real preference files, production SyncService/SDK/storage/SQLite and a controlled encrypted HTTP cloud. No native UI or live account.' }
let cloud: Awaited<ReturnType<typeof createCloud>> | undefined
let storage: Awaited<ReturnType<typeof worker>> | undefined
let service: SyncService | undefined
const projector = (parentOrder: { enabled: boolean; revision: number; set: (enabled: boolean) => Promise<boolean> }, notifyDevicePrefs: (entries: { key: string; value: unknown }[]) => void, smart: any = { applyRemoteSetting: async () => {} }) => ({
  parentOrder, notifyDevicePrefs, smart, language: { state: { language: 'en' as const, locale: 'en' as const, system: 'en' as const }, set: async () => ({ language: 'en' as const, locale: 'en' as const, system: 'en' as const }) }, notifyLanguage: () => {},
})
try {
  const acknowledgements: ((enabled: boolean) => void)[] = []
  let receive!: (entries: { key: string; value: unknown }[]) => void
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { goalloom: {
    initializeParentOrder: async () => false,
    onDevicePrefs: (listener: typeof receive) => { receive = listener; return () => {} },
    setParentOrder: () => new Promise<boolean>(resolve => { acknowledgements.push(resolve) }),
  } } })
  await startParentOrder()
  setParentOrder(true)
  receive([{ key: 'parentOrder', value: false }])
  assert.equal(currentParentOrder(), true, 'An older event must not overwrite a local IPC request in flight')
  acknowledgements.shift()!(true)
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(currentParentOrder(), true)
  setParentOrder(false)
  receive([{ key: 'parentOrder', value: true }])
  acknowledgements.shift()!(true)
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(currentParentOrder(), true, 'The latest main value must win when the remote change was accepted later')
  setParentOrder(false); setParentOrder(true)
  acknowledgements.shift()!(false)
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(currentParentOrder(), true, 'An older local acknowledgement cannot overwrite a newer toggle')
  acknowledgements.shift()!(true)
  await new Promise<void>(resolve => setImmediate(resolve))
  Reflect.deleteProperty(globalThis, 'window')
  report.checks.push('Renderer ignores pre-acceptance remote events and older local acknowledgements; the latest acknowledgement uses main current state')

  const preference = new ParentOrderPreference(join(temporary, 'parent-order.json'))
  await preference.load(); await preference.initialize(true)
  const notifications: { key: string; value: unknown }[][] = []
  const saved = deferred(), release = deferred()
  const projection = projectSettingRows([{ key: 'parentOrder', value: false, updatedAt: new Date().toISOString(), opId: randomUUID() }], projector({
    get enabled() { return preference.enabled },
    get revision() { return preference.revision },
    set: async enabled => { const value = await preference.set(enabled); saved.resolve(); await release.promise; return value },
  }, entries => notifications.push(entries)))
  await saved.promise
  await preference.set(true)
  release.resolve(); await projection
  assert.equal(preference.enabled, true)
  assert.equal(JSON.parse(await readFile(join(temporary, 'parent-order.json'), 'utf8')).enabled, true)
  assert(notifications.flat().every(entry => entry.key !== 'parentOrder' || entry.value === true))
  report.checks.push('A delayed remote save cannot notify its old value after a newer local toggle is accepted')

  const laterEntered = deferred(), laterRelease = deferred()
  const laterProjection = projectSettingRows([
    { key: 'parentOrder', value: false, updatedAt: new Date().toISOString(), opId: randomUUID() },
    { key: 'ai.key.openrouter', value: 'synthetic-key', updatedAt: new Date().toISOString(), opId: randomUUID() },
  ], projector(preference, entries => notifications.push(entries), { applyRemoteSetting: async () => { laterEntered.resolve(); await laterRelease.promise } }))
  await laterEntered.promise
  await preference.set(true)
  laterRelease.resolve(); await laterProjection
  assert(notifications.flat().every(entry => entry.key !== 'parentOrder' || entry.value === true))
  report.checks.push('A slow later setting cannot publish an already superseded parent-order value')

  const earlierEntered = deferred(), earlierRelease = deferred()
  const earlierProjection = projectSettingRows([
    { key: 'ai.key.openrouter', value: 'synthetic-key', updatedAt: new Date().toISOString(), opId: randomUUID() },
    { key: 'parentOrder', value: false, updatedAt: new Date().toISOString(), opId: randomUUID() },
  ], projector(preference, entries => notifications.push(entries), { applyRemoteSetting: async () => { earlierEntered.resolve(); await earlierRelease.promise } }))
  await earlierEntered.promise
  await preference.set(true)
  earlierRelease.resolve(); await earlierProjection
  assert.equal(preference.enabled, true)
  assert(notifications.flat().every(entry => entry.key !== 'parentOrder' || entry.value === true))
  report.checks.push('A local toggle accepted during an earlier keychain write also supersedes the pending remote placement value')

  cloud = await createCloud()
  const source = await seed(join(temporary, 'source'), 'alpha', cloud.world, cloud.url)
  const targetPath = join(temporary, 'target')
  await seed(targetPath, 'beta', cloud.world, cloud.url)
  const targetPreference = new ParentOrderPreference(join(targetPath, 'parent-order.json'))
  await targetPreference.load(); await targetPreference.initialize(false)
  storage = await worker(targetPath)
  const clock = new Clock(), applied: boolean[] = [], reconciles: Promise<unknown>[] = []
  const projectionEntered = deferred(), projectionRelease = deferred()
  const secretEntered = deferred(), secretRelease = deferred()
  let holdProjection = false
  service = new SyncService({ userData: targetPath, storage, cipher, clock, random: () => 1,
    openExternal: async () => {}, notify: () => {}, clipboard: () => {}, now: () => new Date().toISOString(),
    settingsRevision: () => targetPreference.revision,
    applySecret: async () => { secretEntered.resolve(); await secretRelease.promise },
    onSettings: (rows, revision) => projectSettingRows(rows, projector({
      get enabled() { return targetPreference.enabled },
      get revision() { return targetPreference.revision },
      set: async enabled => {
        const value = await targetPreference.set(enabled)
        if (holdProjection) { projectionEntered.resolve(); await projectionRelease.promise }
        return value
      },
    }, () => {}), revision),
    onApplied: () => { applied.push(targetPreference.enabled); reconciles.push(storage!.call('reconcile', targetPreference.enabled)) },
  })
  await service.start()
  await (service as any).schedule.settle()
  applied.length = 0
  await storage.call('sync', { type: 'emit-settings', mode: 'change', opId: randomUUID(), at: new Date().toISOString(), entries: [{ key: 'relationLines', value: false }] })
  const op = { v: 1 as const, opId: randomUUID(), deviceId: source.deviceId, at: new Date().toISOString(), actions: [{ t: 'pref.set' as const, key: 'parentOrder' as const, value: true }] }
  const wire = sealOpWire({ op, workspaceId: source.bound.workspaceId, workspaceKey: source.bound.workspaceKey, epoch: source.bound.epoch })
  await memoryRemote(cloud.world, 'alpha').pushOps({ workspaceId: source.bound.workspaceId, deviceId: source.deviceId, generation: source.bound.generation, ops: [wire] })
  cloud.controls.session = 'beta'; cloud.controls.fault = 'gate:push_ops'
  holdProjection = true
  const requestStart = cloud.requests.length
  const retry = service.handle({ type: 'retry' })
  await projectionEntered.promise
  assert.deepEqual(applied, [], 'Reconciliation must wait for projection to finish')
  projectionRelease.resolve()
  await until(() => cloud!.requests.slice(requestStart).some(row => row.rpc === 'push_ops'), 'upload after preference projection')
  assert.deepEqual(applied, [true], 'Reconciliation must already use the pulled preference while upload is stalled')
  await Promise.all(reconciles)
  cloud.releaseReplies()
  await retry; await (service as any).schedule.settle()
  assert.equal(targetPreference.enabled, true)
  report.checks.push('Pulled parent-order completes before onApplied/reconcile and before a subsequent blocked upload')
  report.appliedPreference = applied
  holdProjection = false
  const staleId = randomUUID(), staleAt = new Date().toISOString()
  await storage.call('sync', { type: 'emit-settings', mode: 'change', opId: staleId, at: staleAt,
    entries: [{ key: 'parentOrder', value: false }, { key: 'ai.key.openrouter', value: 'synthetic-key' }] })
  ;(service as any).secrets.pendingSecrets = { 'ai.key.openrouter': { opId: staleId, updatedAt: staleAt, value: 'synthetic-key' } }
  await targetPreference.set(false)
  const delayedProjection = (service as any).projectRemote()
  await secretEntered.promise
  await targetPreference.set(true)
  secretRelease.resolve(); await delayedProjection
  assert.equal(targetPreference.enabled, true, 'A setting read before the local toggle must remain stale after deferred secret persistence')
  report.checks.push('A setting snapshot held by deferred secret persistence cannot overwrite a newer local toggle')
  report.passed = true
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error)
  throw error
} finally {
  cloud?.releaseReplies()
  service?.stop()
  await (service as any)?.schedule.settle().catch(() => {})
  await storage?.close()
  await cloud?.close()
  await writeFile(join(directory, 'preferences-report.json'), JSON.stringify(report, null, 2))
  await rm(temporary, { recursive: true, force: true })
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks, evidence: join(directory, 'preferences-report.json') }))
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
