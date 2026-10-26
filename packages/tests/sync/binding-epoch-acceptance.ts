/**
 * [INPUT]: Production repositories, exact seed handoff, signed rosters and real Electron SQLite/AEAD.
 * [OUTPUT]: Repeatable epoch CAS rollback, immutable recovery receipt, initialization lineage and encrypted peer continuation evidence.
 * [POS]: Headless core E2E; failure cases were fixed before implementation in d2-epoch-seam.md.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { arch, cpus, platform, release } from 'node:os'
import { join } from 'node:path'
import { canonicalJson, parseSyncOp } from '@goalloom/contracts'
import { hex, newRecovery, publicFromSeed, rosterHash, sha256Hex, signRoster, systemRandom, verifyRosterExtension, type RosterBody } from '@goalloom/crypto'
import { advanceActiveBindingEpoch, assertActiveBinding, assertBindingEpochLineage, mergeRemoteOps, readBindingEpochReceipt,
  readActiveBinding, SeedIntegrityError, setActiveBinding, type BindingEpochProof, type BindingIdentity } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { syncBaselineDdl } from '../../schema/src/index'
import { captureExactSeed, commitBindingTransition, previewBindingTransition, readSeedHandoff } from '../../sync/src/seed'
import { installJoined } from '../../sync/src/join'
import { newDeviceSecret } from '../../sync/src/session'
import { openOpWire, sealOpWire } from '../../sync/src/codec'
import { openDatabase, verifyDatabase } from '../../../apps/desktop/src/main/storage/database'
import { migrate } from '../../../apps/desktop/src/main/storage/schema'
import { Repository } from '../../../apps/desktop/src/main/workspace/repository'
import { syncHost } from '../../../apps/desktop/src/main/sync/host'
import type { CommandInput } from '../../../apps/desktop/src/shared/contracts/commands'

type LocalCommand<T> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never
const evidence = process.argv[2]!, at = '2026-10-24T12:00:00.000Z'
mkdirSync(evidence, { recursive: true })
const checks: string[] = [], observations: object[] = []
const report = { passed: false, checks, observations, failure: null as string | null,
  runtime: { electron: process.versions.electron, node: process.versions.node, sqlite: '' },
  platform: { os: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, macOS: spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim(), machineScope: 'Physical/VM not independently verified' },
  scope: 'Production Repository/SQLite, exact seed/handoff and epoch CAS; real signed roster and AEAD with synthetic ordered delivery/context digest. No desktop custody/main wiring, network, native UI, remote/backend, packaged or Windows acceptance.' }
function machine(name: string, path = join(evidence, `${randomUUID()}-${name}.sqlite`)) {
  const db = openDatabase(path); migrate(db); db.exec(syncBaselineDdl)
  const driver = nodeSqlDriver(db), host = syncHost(db), repo = new Repository(db, { now: () => at })
  const run = (command: LocalCommand<CommandInput>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation } as CommandInput)
  return { db, driver, host, repo, run, path }
}
let local = machine('creator')
const peer = machine('peer')
const tables = ['workspace', 'items', 'item_placements', 'planning_periods', 'rollover_policies', 'item_relations', 'item_guidance',
  'base_workspace', 'base_items', 'base_item_placements', 'base_planning_periods', 'base_rollover_policies', 'base_item_relations', 'base_item_guidance',
  'operations', 'item_events', 'undo_effects', 'sync_ops', 'canon_ops', 'canon_changes', 'sync_conflicts', 'sync_settings', 'sync_state',
  'sync_seed_state', 'sync_active_binding', 'sync_binding_transitions', 'sync_retired_rows', 'sync_binding_epoch_receipts']
const snapshot = () => canonicalJson(tables.map(table => [table, local.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]))
const ownedUnchanged = () => canonicalJson(tables.filter(table => !['sync_active_binding', 'sync_state', 'sync_binding_epoch_receipts'].includes(table))
  .map(table => [table, local.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]))
function fatal(work: () => unknown) { assert.throws(work, error => error instanceof SeedIntegrityError) }
try {
  report.runtime.sqlite = String(local.db.prepare('SELECT sqlite_version() AS v').get()?.v)
  local.run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-01' }, confirmed: true })
  const itemId = local.run({ type: 'create', title: 'Keep exact epoch history', horizon: 'week' }).itemId!
  const generation = local.repo.store.workspace().generation, source = captureExactSeed(local.driver, local.host)
  const first: BindingIdentity = { accountId: randomUUID(), projectRef: 'synthetic-project', environment: 'development', workspaceId: randomUUID(), generation: randomUUID(),
    localGeneration: generation, deviceId: randomUUID(), keyEpoch: 1, bindingToken: randomUUID() }
  const preview = previewBindingTransition(local.driver, local.host, { expectedBinding: null, expectedLocalGeneration: generation })
  const transition = commitBindingTransition(local.driver, local.host, { requestId: randomUUID(), initializationRequestId: randomUUID(), expectedBinding: null,
    newBinding: first, expectedLocalGeneration: generation, expectedRevision: preview.revision, expectedSourceDigest: source.digest, seedId: randomUUID(), finalOpId: randomUUID(),
    protectedContextRef: null, newProtectedContextRef: 'prepared:first', at })
  const key1 = systemRandom().bytes(32), key2 = systemRandom().bytes(32)
  const seedLog = local.db.prepare("SELECT payload FROM sync_ops WHERE origin='local' ORDER BY localOrder").all().map((row, index) => {
    const op = parseSyncOp(JSON.parse(String(row.payload))), sealed = sealOpWire({ op, workspaceKey: key1, workspaceId: first.workspaceId, epoch: 1 })
    return { seq: index + 1, op: openOpWire({ ...sealed, seq: index + 1 }, { workspaceKey: key1, workspaceId: first.workspaceId }) }
  })
  mergeRemoteOps(local.driver, seedLog, local.host, at)
  const peerFirst = { ...first, deviceId: randomUUID(), localGeneration: peer.repo.store.workspace().generation, bindingToken: randomUUID() }
  installJoined(peer.driver, peer.host, { binding: { workspaceId: first.workspaceId, deviceId: peerFirst.deviceId, keyEpoch: 1 }, ops: seedLog, at, merge: false, expectedGeneration: peerFirst.localGeneration })
  setActiveBinding(peer.driver, peerFirst)
  const initialHandoff = readSeedHandoff(local.driver, first)!
  assert(initialHandoff.canonicalVerified); assert.equal(readSeedHandoff(peer.driver, peerFirst), null)
  const pending = local.run({ type: 'edit', itemId, expectedVersion: local.repo.store.item(itemId).version, title: 'Pending through epoch rotation', description: '', dueDate: null })
  const originalTransition = canonicalJson(local.db.prepare('SELECT * FROM sync_binding_transitions').all())
  const originalSeed = canonicalJson(local.db.prepare('SELECT * FROM sync_seed_state ORDER BY scope').all())
  const unchanged = ownedUnchanged(), stateBefore = local.db.prepare('SELECT * FROM sync_state WHERE id=1').get()!, pointerBefore = local.db.prepare('SELECT transitionRequestId FROM sync_active_binding WHERE id=1').get()?.transitionRequestId
  const a = newDeviceSecret(), b = newDeviceSecret(), recovery = newRecovery(systemRandom())
  const roster1: RosterBody = { workspaceId: first.workspaceId, version: 1, epoch: 1, prevHash: null,
    devices: [{ id: first.deviceId, signPub: hex(publicFromSeed('ed25519', a.signSk)), boxPub: hex(publicFromSeed('x25519', a.boxSk)) }, { id: peerFirst.deviceId, signPub: hex(publicFromSeed('ed25519', b.signSk)), boxPub: hex(publicFromSeed('x25519', b.boxSk)) }],
    recoverySignPub: hex(recovery.signPub), recoveryBoxPub: hex(recovery.boxPub) }
  const roster2 = { ...roster1, version: 2, epoch: 2, prevHash: rosterHash(roster1) }
  verifyRosterExtension(roster1, { body: roster2, signature: signRoster(roster2, a.signSk), signerId: first.deviceId })
  const proof: BindingEpochProof = { requestId: randomUUID(), rosterHash: rosterHash(roster2), contextDigest: sha256Hex(canonicalJson({ binding: first, nextEpoch: 2, workspaceKey: hex(key2), rosterHash: rosterHash(roster2) })), at }
  for (const [name, trigger] of [
    ['identity-ignore', 'BEFORE UPDATE OF identity ON sync_active_binding BEGIN SELECT RAISE(IGNORE); END'],
    ['runtime-ignore', 'BEFORE UPDATE OF keyEpoch ON sync_state BEGIN SELECT RAISE(IGNORE); END'],
    ['runtime-failure', "BEFORE UPDATE OF keyEpoch ON sync_state BEGIN SELECT RAISE(ABORT,'injected epoch runtime failure'); END"],
    ['receipt-failure', "BEFORE INSERT ON sync_binding_epoch_receipts BEGIN SELECT RAISE(ABORT,'injected epoch receipt failure'); END"],
  ]) {
    const before = snapshot(); local.db.exec(`CREATE TRIGGER epoch_failure ${trigger}`)
    assert.throws(() => advanceActiveBindingEpoch(local.driver, first, 2, proof))
    local.db.exec('DROP TRIGGER epoch_failure'); assert.equal(snapshot(), before, name)
  }
  checks.push('Real SQLite ignored CAS and storage failures after identity/runtime updates roll back identity, epoch and receipt with all original rows unchanged')
  const beforeReject = snapshot()
  for (const field of ['accountId', 'projectRef', 'environment', 'workspaceId', 'generation', 'localGeneration', 'deviceId', 'bindingToken'] as const) {
    const changed = { ...first, [field]: field === 'environment' ? 'production' : randomUUID() } as BindingIdentity
    fatal(() => advanceActiveBindingEpoch(local.driver, changed, 2, proof))
  }
  for (const epoch of [0, 1, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) fatal(() => advanceActiveBindingEpoch(local.driver, first, epoch, proof))
  fatal(() => advanceActiveBindingEpoch(local.driver, first, 2, { ...proof, contextDigest: '' }))
  fatal(() => setActiveBinding(local.driver, { ...first, bindingToken: randomUUID() }))
  fatal(() => setActiveBinding(local.driver, { ...first, keyEpoch: 2 }))
  assert.equal(snapshot(), beforeReject)
  checks.push('Every foreign identity field, invalid/non-increasing epoch and malformed preparation is refused; bootstrap-once binding remains intact')
  const receipt = advanceActiveBindingEpoch(local.driver, first, 2, proof), second = receipt.binding
  assert.deepEqual(second, { ...first, keyEpoch: 2 }); assertActiveBinding(local.driver, second)
  assert.equal(ownedUnchanged(), unchanged)
  assert.equal(canonicalJson(local.db.prepare('SELECT * FROM sync_state WHERE id=1').get()), canonicalJson({ ...stateBefore, keyEpoch: 2 }))
  assert.equal(local.db.prepare('SELECT transitionRequestId FROM sync_active_binding WHERE id=1').get()?.transitionRequestId, pointerBefore)
  assert.equal(canonicalJson(local.db.prepare('SELECT * FROM sync_binding_transitions').all()), originalTransition)
  assert.equal(canonicalJson(local.db.prepare('SELECT * FROM sync_seed_state ORDER BY scope').all()), originalSeed)
  const committed = snapshot()
  assert.deepEqual(advanceActiveBindingEpoch(local.driver, first, 2, proof), receipt); assert.equal(snapshot(), committed)
  assert.deepEqual(readBindingEpochReceipt(local.driver, proof.requestId), receipt)
  fatal(() => advanceActiveBindingEpoch(local.driver, first, 2, { ...proof, rosterHash: '0'.repeat(64) }))
  fatal(() => advanceActiveBindingEpoch(local.driver, first, 2, { ...proof, requestId: randomUUID() }))
  assert.equal(snapshot(), committed)
  assert.throws(() => local.db.prepare("UPDATE sync_binding_epoch_receipts SET requestHash='forged'").run(), /binding_epoch_receipt_immutable/)
  assert.deepEqual(readSeedHandoff(local.driver, second), initialHandoff)
  checks.push('Committed same-request readback is exact/idempotent; competing predecessors and changed requests fail without touching initialization, cursor, pending payload or history')
  const peerSecond = advanceActiveBindingEpoch(peer.driver, peerFirst, 2, { ...proof, requestId: randomUUID(), contextDigest: sha256Hex(canonicalJson({ binding: peerFirst, workspaceKey: hex(key2) })) }).binding
  assert.equal(readSeedHandoff(peer.driver, peerSecond), null)
  const pendingRow = local.db.prepare('SELECT payload,payloadHash FROM sync_ops WHERE opId=?').get(pending.operationId)!
  const next = parseSyncOp(JSON.parse(String(pendingRow.payload))), sealed = sealOpWire({ op: next, workspaceKey: key2, workspaceId: first.workspaceId, epoch: 2 })
  assert.throws(() => openOpWire({ ...sealed, seq: seedLog.length + 1 }, { workspaceKey: key1, workspaceId: first.workspaceId }))
  const opened = { seq: seedLog.length + 1, op: openOpWire({ ...sealed, seq: seedLog.length + 1 }, { workspaceKey: key2, workspaceId: first.workspaceId }) }
  for (const m of [local, peer]) mergeRemoteOps(m.driver, [opened], m.host, at)
  assert.equal(captureExactSeed(local.driver, local.host).digest, captureExactSeed(peer.driver, peer.host).digest)
  assert.equal(local.db.prepare('SELECT payloadHash FROM sync_ops WHERE opId=?').get(pending.operationId)?.payloadHash, pendingRow.payloadHash)
  checks.push('Two seeded peers continue real epoch-2 AEAD replay with the same pending operation ID/hash; old key cannot open the new envelope')
  const roster3 = { ...roster2, version: 3, epoch: 3, prevHash: rosterHash(roster2) }
  verifyRosterExtension(roster2, { body: roster3, signature: signRoster(roster3, a.signSk), signerId: first.deviceId })
  const proof3 = { requestId: randomUUID(), rosterHash: rosterHash(roster3), contextDigest: '3'.repeat(64), at }
  const third = advanceActiveBindingEpoch(local.driver, second, 3, proof3).binding
  assert.deepEqual(readSeedHandoff(local.driver, third), initialHandoff)
  fatal(() => advanceActiveBindingEpoch(local.driver, first, 2, proof))
  assert.deepEqual(readBindingEpochReceipt(local.driver, proof.requestId), receipt)
  for (const statement of [
    `DELETE FROM sync_binding_epoch_receipts WHERE requestId='${proof.requestId}'`,
    "DROP TRIGGER sync_binding_epoch_immutable; UPDATE sync_binding_epoch_receipts SET requestHash='forged'",
  ]) {
    local.db.exec('SAVEPOINT corrupt_lineage'); local.db.exec(statement)
    fatal(() => readSeedHandoff(local.driver, third))
    local.db.exec('ROLLBACK TO corrupt_lineage; RELEASE corrupt_lineage')
  }
  fatal(() => assertBindingEpochLineage(local.driver, { ...first, accountId: randomUUID() }, third))
  assert.equal(canonicalJson(local.db.prepare('SELECT * FROM sync_binding_transitions').all()), originalTransition)
  const path = local.path, beforeRestart = snapshot(); local.db.close(); local = machine('reopened', path)
  assert.equal(snapshot(), beforeRestart); assert.deepEqual(readBindingEpochReceipt(local.driver, proof.requestId), receipt)
  assert.deepEqual(readActiveBinding(local.driver), third); assert.deepEqual(readSeedHandoff(local.driver, third), initialHandoff)
  assert.equal(readBindingEpochReceipt(local.driver, randomUUID()), null)
  checks.push('Committed multi-epoch lineage survives actual database reopen; stale writes cannot reactivate epoch 2, and missing/corrupt/crossed proof fails closed without rewriting the original initialization receipt')
  observations.push({ transitionRequestId: transition.requestId, epochRequests: [proof.requestId, proof3.requestId], epochs: [1, 2, 3], bindingTokenPreserved: third.bindingToken === first.bindingToken,
    originalInitializationUnchanged: true, originalFinal: initialHandoff, pendingOperation: { opId: pending.operationId, payloadHash: pendingRow.payloadHash }, currentEpoch: readActiveBinding(local.driver)?.keyEpoch })
  for (const m of [local, peer]) verifyDatabase(m.db)
  report.passed = true
} catch (error) { report.failure = error instanceof Error ? error.stack ?? error.message : String(error); process.exitCode = 1 }
finally {
  for (const m of [local, peer]) m.db.close()
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2))
  process.stdout.write(`${report.passed ? 'PASS' : 'FAIL'} binding epoch acceptance: ${checks.length} checks\n`)
}
