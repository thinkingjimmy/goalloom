/**
 * [INPUT]: Production Repository, sync worker adapter, exact seed and real Electron SQLite/AEAD.
 * [OUTPUT]: Guidance set/clear/revert metadata parity, immutable own history and strict backup evidence.
 * [POS]: Headless D2 regression journey; failure cases precede the fix in d2-core-interfaces.md.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { arch, cpus, platform, release } from 'node:os'
import { join } from 'node:path'
import { canonicalJson, parseSyncOp, type SyncOp } from '@goalloom/contracts'
import { systemRandom } from '@goalloom/crypto'
import { type BindingIdentity, rebuildVisibleFull } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { captureExactSeed, encodeExactSeed } from '../../sync/src/seed'
import { openOpWire, sealOpWire } from '../../sync/src/codec'
import { openDatabase, verifyDatabase } from '../../../apps/desktop/src/main/storage/database'
import { migrate } from '../../../apps/desktop/src/main/storage/schema'
import { consistentBackup } from '../../../apps/desktop/src/main/storage/backup/snapshot'
import { Repository } from '../../../apps/desktop/src/main/workspace/repository'
import { syncHost } from '../../../apps/desktop/src/main/sync/host'
import { runSyncLocal } from '../../../apps/desktop/src/main/workspace/sync/local'
import { exportDataset, readSqliteDataset, replaceDataset } from '../../../apps/desktop/src/main/workspace/transfer/dataset'
import { validateDataset } from '../../../apps/desktop/src/domain/import-validation'
import type { GuidanceValue } from '../../../apps/desktop/src/shared/contracts/assistance'
import type { CommandInput } from '../../../apps/desktop/src/shared/contracts/commands'
import type { PendingPlain } from '@goalloom/sync'

type LocalCommand<T> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never
const evidence = process.argv[2]!, checks: string[] = [], observations: object[] = []
mkdirSync(evidence, { recursive: true })
let now = '2026-10-24T04:00:00.000Z'
const report = { passed: false, checks, observations, failure: null as string | null,
  runtime: { electron: process.versions.electron, node: process.versions.node, sqlite: '' },
  platform: { os: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, macOS: spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim(), machineScope: 'Physical/VM not independently verified' },
  scope: 'Production Repository/worker adapter, real Electron SQLite and AEAD, synthetic ordered delivery. No native UI, OS vault, remote/provider, Windows or packaged acceptance.' }
function machine(name: string, path = join(evidence, `${randomUUID()}-${name}.sqlite`)) {
  const db = openDatabase(path); migrate(db)
  const repo = new Repository(db, { now: () => now })
  const run = (command: LocalCommand<CommandInput>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation } as CommandInput)
  return { db, repo, run, path }
}
const origin = machine('origin'), peer = machine('peer')
let local = machine('local')
const value = (nextAction: string): GuidanceValue => ({ formatVersion: 1, kind: 'next_step', nextAction, contextNote: null, scopeNote: null, authorship: 'user' })
const history = () => canonicalJson(['operations', 'item_events', 'undo_effects'].map(table => [table, local.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]))
const validate = () => { const data = exportDataset(local.repo.store, now); validateDataset(data, now); return data }
async function main() {
  report.runtime.sqlite = String(local.db.prepare('SELECT sqlite_version() AS v').get()?.v)
  origin.run({ type: 'confirmSetup', timezone: 'Asia/Singapore', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-01' }, confirmed: true })
  const itemId = origin.run({ type: 'create', title: 'Guidance metadata parity', horizon: 'week' }).itemId!
  const movingId = origin.run({ type: 'create', title: 'Guidance plus placement', horizon: 'week' }).itemId!
  const workspaceId = randomUUID(), key = systemRandom().bytes(32)
  const encoded = encodeExactSeed(captureExactSeed(nodeSqlDriver(origin.db), syncHost(origin.db)), { seedId: randomUUID(), finalOpId: randomUUID(), deviceId: randomUUID(), at: now })
  const wire = (op: SyncOp, seq: number) => ({ seq, op: openOpWire({ ...sealOpWire({ op, workspaceKey: key, workspaceId, epoch: 1 }), seq }, { workspaceKey: key, workspaceId }) })
  const log = encoded.ops.map((op, index) => wire(op, index + 1))
  const identity = { accountId: randomUUID(), environment: 'development' as const, projectRef: 'synthetic-project', workspaceId, generation: randomUUID(), keyEpoch: 1 }
  const bindings = new Map<typeof local, BindingIdentity>()
  for (const m of [local, peer]) {
    const binding = { ...identity, localGeneration: m.repo.store.workspace().generation, deviceId: randomUUID(), bindingToken: randomUUID() }
    bindings.set(m, binding)
    await runSyncLocal(m.db, { type: 'install', binding: { workspaceId, deviceId: binding.deviceId, keyEpoch: 1 }, sourceBinding: binding,
      expectedGeneration: binding.localGeneration, ops: log, at: now, merge: false })
  }
  validate()
  assert.equal(Number(local.db.prepare("SELECT count(*) AS n FROM operations WHERE kind='baseline'").get()?.n), 1)
  const call = <T>(m: typeof local, action: object) => runSyncLocal(m.db, { ...action, expectedBinding: bindings.get(m) }) as Promise<T>
  const nextSeq = () => Number(local.db.prepare('SELECT lastAppliedSeq AS seq FROM sync_state WHERE id=1').get()?.seq) + 1
  const originalItem = (id: string) => canonicalJson(local.db.prepare('SELECT * FROM items WHERE id=?').get(id))
  const ack = async (operationId: string, id: string) => {
    const before = originalItem(id), beforeHistory = history(), checkpoints = Number(local.db.prepare('SELECT count(*) AS n FROM guidance_baselines').get()?.n)
    const pending = (await call<PendingPlain[]>(local, { type: 'peek' })).find(row => row.opId === operationId)!
    assert(pending)
    const op = parseSyncOp(JSON.parse(pending.payload)), entry = wire(op, nextSeq())
    await call(local, { type: 'mark', ids: [operationId], at: now, attemptId: randomUUID(), scope: { workspaceId, generation: bindings.get(local)!.localGeneration } })
    await call(local, { type: 'accept', pending: [pending], results: [{ opId: operationId, seq: entry.seq }], at: now })
    await call(local, { type: 'absorb', ops: [entry], at: now })
    assert.equal(originalItem(id), before, 'Own ACK must retain the exact desktop item version and timestamp')
    assert.equal(history(), beforeHistory, 'Own ACK must not fabricate a baseline or rewrite business history')
    assert.equal(Number(local.db.prepare('SELECT count(*) AS n FROM guidance_baselines').get()?.n), checkpoints)
    await call(peer, { type: 'absorb', ops: [entry], at: now })
    assert.equal(canonicalJson(peer.db.prepare('SELECT * FROM items WHERE id=?').get(id)), before)
    assert.equal(canonicalJson(peer.db.prepare('SELECT * FROM item_guidance WHERE itemId=?').get(id)), canonicalJson(local.db.prepare('SELECT * FROM item_guidance WHERE itemId=?').get(id)))
    await call(local, { type: 'absorb', ops: [entry], at: now })
    rebuildVisibleFull(nodeSqlDriver(local.db), syncHost(local.db))
    assert.equal(originalItem(id), before); assert.equal(history(), beforeHistory)
    validate(); validateDataset(exportDataset(peer.repo.store, now), now)
    observations.push({ phase: op.actions[0]!.t, itemVersion: local.repo.store.item(id).version, itemUpdatedAt: local.repo.store.item(id).updatedAt, guidanceRevision: local.repo.store.guidance(id)?.revision })
  }
  const guidance = (id: string, next: GuidanceValue | null, move = false) => {
    const item = local.repo.store.item(id), version = item.version
    const result = local.run({ type: 'applyAssistance', itemId: id, expectedVersion: version, expectedGuidanceRevision: local.repo.store.guidance(id)?.revision ?? 0,
      guidance: next ? { kind: 'set', value: next } : { kind: 'clear' },
      ...(move ? { move: { horizon: 'later' as const, startDate: null, previewPeriodId: null, expectedPlacementVersion: item.placement.version, confirmedLater: true } } : {}) })
    assert.equal(local.repo.store.item(id).version, version + (move ? 2 : 1))
    validate(); return result
  }
  now = '2026-10-24T04:01:00.000Z'
  const first = guidance(itemId, value('Set accepted guidance')); await ack(first.operationId, itemId)
  now = '2026-10-24T04:02:00.000Z'
  const cleared = guidance(itemId, null); await ack(cleared.operationId, itemId)
  now = '2026-10-24T04:03:00.000Z'
  const undo = local.run({ type: 'undo', originalOperationId: cleared.operationId }); assert(undo.changed); await ack(undo.operationId, itemId)
  checks.push('Seeded peer set, clear and successful revert retain desktop item versions/timestamps, guidance heads and immutable original history through AEAD ACK/replay')
  const noOpBefore = originalItem(itemId), pendingBefore = Number(local.db.prepare("SELECT count(*) AS n FROM sync_ops WHERE origin='local'").get()?.n)
  const noOp = local.run({ type: 'applyAssistance', itemId, expectedVersion: local.repo.store.item(itemId).version, expectedGuidanceRevision: local.repo.store.guidance(itemId)!.revision, guidance: { kind: 'set', value: value('Set accepted guidance') } })
  assert.equal(noOp.changed, false); assert.equal(originalItem(itemId), noOpBefore)
  assert.equal(Number(local.db.prepare("SELECT count(*) AS n FROM sync_ops WHERE origin='local'").get()?.n), pendingBefore)
  now = '2026-10-24T04:04:00.000Z'
  const moved = guidance(movingId, value('Move with guidance'), true); await ack(moved.operationId, movingId)
  assert.equal(local.repo.store.item(movingId).placement.horizon, 'later')
  checks.push('Desktop no-op emits no guidance action; combined guidance and placement preserve both item touches')
  const rejected = async (actions: SyncOp['actions'], code: string) => {
    const before = originalItem(itemId), head = canonicalJson(local.repo.store.guidance(itemId)), saved = history()
    const entry = wire(parseSyncOp({ v: 1, opId: randomUUID(), deviceId: randomUUID(), at: now, actions }), nextSeq())
    await call(local, { type: 'absorb', ops: [entry], at: now }); await call(peer, { type: 'absorb', ops: [entry], at: now })
    assert.equal(local.db.prepare('SELECT errorCode FROM canon_ops WHERE opId=?').get(entry.op.opId)?.errorCode, code)
    assert.equal(originalItem(itemId), before); assert.equal(canonicalJson(local.repo.store.guidance(itemId)), head); assert.equal(history(), saved)
    validate()
  }
  await rejected([{ t: 'guidance.set', itemId, baseRevision: 0, value: value('Stale guidance') }], 'guidance_stale')
  await rejected([{ t: 'revert', targetOpId: first.operationId, mode: 'all_or_nothing' }], 'revert_superseded')
  checks.push('Stale guidance and superseded revert leave item metadata, heads and original business history unchanged')
  const rollbackTables = ['items', 'base_items', 'item_guidance', 'base_item_guidance', 'sync_state', 'sync_ops', 'canon_ops', 'canon_changes', 'guidance_baselines']
  const snapshot = () => canonicalJson(rollbackTables.map(table => [table, local.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]))
  const beforeFailure = snapshot(), failureHistory = history()
  const failureOp = wire(parseSyncOp({ v: 1, opId: randomUUID(), deviceId: randomUUID(), at: now,
    actions: [{ t: 'guidance.set', itemId, baseRevision: local.repo.store.guidance(itemId)!.revision, value: value('Injected rollback') }] }), nextSeq())
  local.db.exec("CREATE TRIGGER fail_guidance_item_touch BEFORE UPDATE ON base_items BEGIN SELECT RAISE(ABORT,'injected guidance item touch failure'); END")
  await assert.rejects(call(local, { type: 'absorb', ops: [failureOp], at: now }), /injected guidance item touch failure/)
  local.db.exec('DROP TRIGGER fail_guidance_item_touch')
  assert.equal(snapshot(), beforeFailure); assert.equal(history(), failureHistory)
  checks.push('Item-touch storage failure rolls back the already-written guidance head, cursor, canonical receipt and original history')
  const savedBinding = bindings.get(local)!, restartState = originalItem(itemId), restartHistory = history(), path = local.path
  local.db.close(); local = machine('local-reopened', path); bindings.set(local, savedBinding)
  rebuildVisibleFull(nodeSqlDriver(local.db), syncHost(local.db))
  assert.equal(originalItem(itemId), restartState); assert.equal(history(), restartHistory)
  const data = validate(), beforeBackupHistory = history()
  writeFileSync(join(evidence, 'complete-dataset.json'), JSON.stringify(data, null, 2))
  const backupPath = await consistentBackup(local.db, join(evidence, 'backups'))
  const backup = await readSqliteDataset(backupPath, now, 'backup'); validateDataset(backup, now)
  assert.equal(backup.historyMode, 'complete'); assert.equal(history(), beforeBackupHistory)
  const restored = machine('restored')
  try { replaceDataset(restored.repo.store, backup, 'restore', now); validateDataset(exportDataset(restored.repo.store, now), now); verifyDatabase(restored.db) } finally { restored.db.close() }
  observations.push({ phase: 'backup', path: backupPath, historyMode: backup.historyMode, operations: data.operations.length, events: data.events.length })
  checks.push('Actual SQLite backup reopens as strict complete history and restores without fallback or fabricated own-ACK baselines')
  for (const m of [origin, local, peer]) verifyDatabase(m.db)
  report.passed = true
}
main().catch(error => { report.failure = error instanceof Error ? error.stack ?? error.message : String(error); process.exitCode = 1 }).finally(() => {
  for (const m of [origin, local, peer]) m.db.close()
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2))
  process.stdout.write(`${report.passed ? 'PASS' : 'FAIL'} guidance touch acceptance: ${checks.length} checks\n`)
})
