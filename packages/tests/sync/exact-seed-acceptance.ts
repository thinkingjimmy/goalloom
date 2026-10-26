/**
 * [INPUT]: Production desktop repositories, shared exact handoff/applier and isolated Electron SQLite files.
 * [OUTPUT]: Repeatable encrypted two-store convergence, failure rollback and retired-evidence report.
 * [POS]: Headless end-to-end core acceptance. Failure cases were recorded before implementation in d2-core-interfaces.md.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { arch, cpus, platform, release, tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonicalJson, parseSyncOp, type SyncOp } from '@goalloom/contracts'
import { sha256Hex, systemRandom } from '@goalloom/crypto'
import { syncBaselineDdl } from '../../schema/src/index'
import { assertActiveBinding, assertSeedBoundary, isRetiredCommand, mergeRemoteOps, readSeedState, rebuildVisibleFull, retiredBindingSummary,
  SeedIntegrityError, setActiveBinding, type BindingIdentity, type SqlDriver } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { captureExactSeed, commitBindingTransition, encodeExactSeed, previewBindingTransition, readSeedHandoff } from '../../sync/src/seed'
import { installJoined, joinPlan, pristineHistory } from '../../sync/src/join'
import { openOpWire, sealOpWire } from '../../sync/src/codec'
import { openDatabase, verifyDatabase } from '../../../apps/desktop/src/main/storage/database'
import { migrate } from '../../../apps/desktop/src/main/storage/schema'
import { Repository } from '../../../apps/desktop/src/main/workspace/repository'
import { syncHost } from '../../../apps/desktop/src/main/sync/host'
import type { CommandInput } from '../../../apps/desktop/src/shared/contracts/commands'

type LocalCommand<T> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never
const at = '2026-10-24T04:00:00.000Z'
const evidence = process.argv[2]!
const onlyEmptyJoin = process.argv.includes('--join-empty')
mkdirSync(evidence, { recursive: true })
const directory = mkdtempSync(join(tmpdir(), 'goalloom-exact-seed-'))
const checks: string[] = []
const observations: object[] = []
const report = {
  passed: false, checks, observations, failure: null as string | null, sourceFiles: directory,
  scope: 'Production repository, shared seed/handoff/applier, real Electron SQLite and real AEAD; synthetic log delivery and protected-context reference. No native UI, remote/provider, OS vault, packaged or Windows acceptance.',
  runtime: { electron: process.versions.electron ?? null, node: process.versions.node, sqlite: '' },
  platform: { os: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, macOS: platform() === 'darwin' ? spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim() : null, machineScope: 'Physical/VM not independently verified' },
}
function machine(name: string, setup = true) {
  const path = join(directory, `${name}.sqlite`)
  const db = openDatabase(path); migrate(db); db.exec(syncBaselineDdl)
  let clockAt = at
  const repo = new Repository(db, { now: () => clockAt }), driver = nodeSqlDriver(db), host = syncHost(db)
  const run = (command: LocalCommand<CommandInput>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation } as CommandInput)
  if (setup && !repo.store.workspace().setupConfirmedAt) run({ type: 'confirmSetup', timezone: 'Asia/Singapore', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-01' }, confirmed: true })
  return { db, driver, host, repo, run, path, setNow: (value: string) => { clockAt = value } }
}
function history(m: ReturnType<typeof machine>): string {
  return sha256Hex(canonicalJson(['operations', 'item_events', 'undo_effects'].map(table => [table, m.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()])))
}
function rawOps(m: ReturnType<typeof machine>): string { return canonicalJson(m.db.prepare('SELECT * FROM sync_ops ORDER BY opId').all()) }
function fatal(work: () => unknown, pattern?: RegExp): void {
  assert.throws(work, error => error instanceof SeedIntegrityError && (!pattern || pattern.test(error.message)))
}
function sourceDigest(m: ReturnType<typeof machine>): string { return captureExactSeed(m.driver, m.host).digest }


function emptySeedJoinAcceptance(): void {
  const empty = machine('empty-join-cloud'), tombstones = machine('empty-join-tombstones')
  let local = machine('empty-join-source')
  try {
    report.runtime.sqlite = String(local.db.prepare('SELECT sqlite_version() AS v').get()?.v)
    const created = local.run({ type: 'create', title: 'Keep automatic first join', horizon: 'week' })
    const id = created.itemId!, calendar = local.repo.store.workspace().calendar!, generation = local.repo.store.workspace().generation
    const snapshot = () => canonicalJson(['workspace', 'items', 'item_placements', 'planning_periods', 'rollover_policies', 'item_relations', 'item_guidance',
      'operations', 'item_events', 'undo_effects', 'sync_ops', 'canon_ops', 'canon_changes', 'sync_settings', 'sync_state', 'sync_seed_state', 'sync_active_binding', 'sync_binding_transitions', 'sync_retired_rows']
      .map(table => [table, local.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]))
    const before = snapshot(), digest = sourceDigest(local), originalHistory = history(local), target = randomUUID(), creator = randomUUID()
    const encoded = encodeExactSeed(captureExactSeed(empty.driver, empty.host), { seedId: randomUUID(), finalOpId: randomUUID(), deviceId: creator, at })
    const key = systemRandom().bytes(32)
    const log = encoded.ops.map((op, index) => {
      const sealed = sealOpWire({ op, workspaceKey: key, workspaceId: target, epoch: 1 })
      return { seq: index + 1, op: openOpWire({ ...sealed, seq: index + 1 }, { workspaceKey: key, workspaceId: target }) }
    })
    assert.equal(pristineHistory(log), false)
    assert.equal(pristineHistory(log, { driver: local.driver, host: local.host }), true)
    assert.equal(joinPlan(local.driver, target, log, local.host), 'automatic')
    assert.equal(snapshot(), before)
    assert.equal(pristineHistory(log.slice(0, -1), { driver: local.driver, host: local.host }), false)
    const corrupt = structuredClone(log)
    const final = corrupt.at(-1)!.op.actions[0]!
    if (final.t === 'seed.final') final.digest = '0'.repeat(64)
    assert.equal(pristineHistory(corrupt, { driver: local.driver, host: local.host }), false)
    const deleted = tombstones.run({ type: 'create', title: 'A tombstone is task history', horizon: 'later' })
    tombstones.run({ type: 'delete', itemId: deleted.itemId!, expectedVersion: tombstones.repo.store.item(deleted.itemId!).version })
    const deletedSeed = encodeExactSeed(captureExactSeed(tombstones.driver, tombstones.host), { seedId: randomUUID(), finalOpId: randomUUID(), deviceId: creator, at })
    const deletedLog = deletedSeed.ops.map((op, index) => ({ seq: index + 1, op }))
    assert.equal(pristineHistory(deletedLog, { driver: local.driver, host: local.host }), false)
    assert.equal(joinPlan(local.driver, target, deletedLog, local.host), 'choose')
    const forged = structuredClone(deletedLog)
    const begin = forged[0]!.op.actions[0]!
    if (begin.t === 'seed.begin') begin.manifest.counts.items = 0
    assert.equal(pristineHistory(forged, { driver: local.driver, host: local.host }), false)
    const newTask = parseSyncOp({ v: 1, opId: randomUUID(), deviceId: creator, at, actions: [{ t: 'item.create', id: randomUUID(), title: 'Later task history', description: '', dueDate: null, horizon: 'later', periodKey: null, sortHint: { afterId: null, beforeId: null } }] })
    assert.equal(pristineHistory([...log, { seq: log.length + 1, op: newTask }], { driver: local.driver, host: local.host }), false)
    const metadata = parseSyncOp({ v: 1, opId: randomUUID(), deviceId: creator, at, actions: [{ t: 'pref.set', key: 'theme', value: 'dark' }] })
    assert.equal(pristineHistory([...log, { seq: log.length + 1, op: metadata }], { driver: local.driver, host: local.host }), true)
    const brokenDriver: SqlDriver = { ...local.driver, exec(sql) { if (sql.startsWith('DELETE FROM item_guidance;')) throw Error('injected pristine storage failure'); local.driver.exec(sql) } }
    assert.throws(() => pristineHistory(log, { driver: brokenDriver, host: local.host }), /injected pristine storage failure/)
    assert.equal(snapshot(), before)
    assert.equal(installJoined(local.driver, local.host, { binding: { workspaceId: target, deviceId: randomUUID(), keyEpoch: 1 }, ops: log,
      at, merge: true, automatic: true, expectedGeneration: generation }), 'installed')
    assert.equal(local.repo.store.workspace().generation, generation)
    assert.equal(local.repo.store.workspace().calendar?.id, calendar.id)
    assert.ok(local.db.prepare('SELECT 1 FROM items WHERE id=? AND deletedAt IS NULL').get(id))
    assert.ok(local.db.prepare("SELECT 1 FROM sync_ops WHERE opId=? AND origin='local'").get(created.operationId))
    assert.equal(history(local), originalHistory)
    assert.equal(sourceDigest(local), digest)
    const joinedBinding: BindingIdentity = { accountId: randomUUID(), projectRef: 'synthetic-project', environment: 'development', workspaceId: target, generation: randomUUID(), localGeneration: generation, deviceId: String(local.db.prepare('SELECT deviceId FROM sync_state WHERE id=1').get()?.deviceId), keyEpoch: 1, bindingToken: randomUUID() }
    setActiveBinding(local.driver, joinedBinding)
    assert.equal(readSeedHandoff(local.driver, joinedBinding), null)
    local.db.exec('SAVEPOINT missing_owner_receipt')
    local.db.prepare("UPDATE sync_seed_state SET phase='loading',finalOpId=NULL,finalPayloadHash=NULL WHERE scope='visible'").run()
    fatal(() => readSeedHandoff(local.driver, joinedBinding), /seed transition binding mismatch/)
    local.db.exec('ROLLBACK TO missing_owner_receipt; RELEASE missing_owner_receipt')
    const afterJoin = local.run({ type: 'create', title: 'Peer writes after completed seed join', horizon: 'later' })
    const writtenDigest = sourceDigest(local)
    assert.equal(readSeedHandoff(local.driver, joinedBinding), null)
    local.db.close(); local = machine('empty-join-source', false)
    rebuildVisibleFull(local.driver, local.host)
    assert.equal(sourceDigest(local), writtenDigest)
    assert.equal(readSeedHandoff(local.driver, joinedBinding), null)
    assert.ok(local.db.prepare('SELECT 1 FROM items WHERE id=? AND deletedAt IS NULL').get(afterJoin.itemId!))
    const afterRestart = local.run({ type: 'create', title: 'Peer writes after restart', horizon: 'later' })
    assert.ok(local.db.prepare('SELECT 1 FROM items WHERE id=? AND deletedAt IS NULL').get(afterRestart.itemId!))
    assert.equal(readSeedHandoff(local.driver, joinedBinding), null)
    assert.equal(Number(local.db.prepare('SELECT count(*) AS n FROM sync_binding_transitions').get()?.n), 0)
    observations.push({ phase: 'empty-seed-automatic-join', seedItems: encoded.manifest.counts.items, preservedCalendar: true, preservedItemIdentity: true,
      invalidAndIncompleteRefused: true, tombstoneRefused: true, speculativeStateUnchanged: true, joinedPeerHasNoLocalHandoff: true, loadingSeedStillRequiresLocalReceipt: true, peerWriteAndRestart: true })
    checks.push('Verified complete zero-item seed automatically joins without changing source identity/calendar; invalid/incomplete/tombstone/history seeds are not pristine')
  } finally { for (const m of [empty, local, tombstones]) m.db.close() }
}

try {
  if (!onlyEmptyJoin) {
    let origin = machine('origin')
    report.runtime.sqlite = String(origin.db.prepare('SELECT sqlite_version() AS v').get()?.v)
    const target = origin.run({ type: 'create', title: 'Exact source', horizon: 'week' }).itemId!
    const done = origin.run({ type: 'create', title: 'Retained deleted done', horizon: 'week' }).itemId!
    const cleared = origin.run({ type: 'create', title: 'Cleared guidance', horizon: 'later' }).itemId!
    const owner = origin.run({ type: 'create', title: 'Goal', horizon: 'year', flowColor: 2 }).itemId!
    for (let i = 0; i < 205; i++) origin.run({ type: 'create', title: `Pending ${i}`, horizon: 'later' })
    let item = origin.repo.store.item(done)
    origin.run({ type: 'applyAssistance', itemId: done, expectedVersion: item.version, expectedGuidanceRevision: 0,
      guidance: { kind: 'set', value: { formatVersion: 1, kind: 'next_step', nextAction: 'Keep the original note', contextNote: null, scopeNote: null, authorship: 'user' } } })
    item = origin.repo.store.item(done)
    origin.run({ type: 'link', parentId: owner, childId: done, expectedParentVersion: origin.repo.store.item(owner).version, expectedChildVersion: item.version, autoPlace: false })
    for (const action of ['status', 'archive', 'delete'] as const) {
      item = origin.repo.store.item(done)
      origin.run(action === 'status' ? { type: 'status', itemId: done, expectedVersion: item.version, status: 'done' }
        : action === 'archive' ? { type: 'archive', itemId: done, expectedVersion: item.version, archived: true }
        : { type: 'delete', itemId: done, expectedVersion: item.version })
    }
    const nestedParent = origin.run({ type: 'create', title: 'Nested owner', horizon: 'week' }).itemId!
    const nestedOwner = origin.repo.store.item(nestedParent)
    const nestedChild = origin.run({ type: 'create', title: 'Nested child', horizon: 'week', nesting: { parentId: nestedParent, expectedParentVersion: nestedOwner.version, expectedParentPlacementVersion: nestedOwner.placement.version } }).itemId!
    origin.setNow('2026-08-15T04:00:00.000Z')
    const held = origin.run({ type: 'create', title: 'Held overdue', horizon: 'month' }).itemId!
    origin.setNow(at)
    const hold = origin.db.prepare("SELECT effectiveFromPeriodId FROM rollover_policies WHERE horizon='month'").get()?.effectiveFromPeriodId
    origin.db.prepare('UPDATE item_placements SET holdPeriodId=? WHERE itemId=?').run(String(hold), held)
    const calendar = String(origin.db.prepare('SELECT calendar FROM workspace WHERE id=1').get()?.calendar)
    const oldPeriod = origin.host.materializePeriod('month', '2026-08-01', calendar)
    origin.repo.store.ensurePeriod({ ...oldPeriod, horizon: 'month' })
    origin.db.prepare('UPDATE items SET version=77 WHERE id=?').run(target)
    origin.db.prepare('UPDATE item_placements SET version=55 WHERE itemId=?').run(target)
    origin.db.prepare('UPDATE rollover_policies SET version=17').run()
    origin.db.prepare('INSERT INTO item_guidance(itemId,revision,value,updatedAt,operationId) VALUES (?,?,NULL,?,?)').run(cleared, 9, at, randomUUID())
    const source = captureExactSeed(origin.driver, origin.host), beforeHistory = history(origin)
    const rows = origin.db.prepare('SELECT opId FROM sync_ops ORDER BY localOrder LIMIT 3').all()
    const oldApplied = String(rows[0]!.opId), oldAccepted = String(rows[1]!.opId), oldUnknown = String(rows[2]!.opId)
    origin.db.prepare("UPDATE sync_ops SET state='send_unknown',sendAttemptId=? WHERE opId IN (?,?,?)").run(randomUUID(), oldUnknown, oldAccepted, oldApplied)
    origin.db.prepare("UPDATE sync_ops SET state='accepted',seq=2 WHERE opId=?").run(oldAccepted)
    origin.db.prepare("UPDATE sync_ops SET state='applied',outcome='applied',seq=1 WHERE opId=?").run(oldApplied)
    origin.db.prepare("INSERT INTO canon_ops(seq,opId,deviceId,at,kind,outcome,errorCode) SELECT 1,opId,deviceId,at,'calendar.setup','applied',NULL FROM sync_ops WHERE opId=?").run(oldApplied)
    origin.db.prepare("INSERT INTO canon_changes(seq,idx,itemId,dim,before,after) VALUES (1,0,NULL,'calendar',NULL,?)").run(calendar)
    origin.db.prepare('UPDATE sync_state SET lastAppliedSeq=1,lastUploadedSeq=2 WHERE id=1').run()
    const oldBinding: BindingIdentity = {
      accountId: randomUUID(), projectRef: 'synthetic-project', environment: 'development', workspaceId: randomUUID(), generation: randomUUID(),
      localGeneration: origin.repo.store.workspace().generation, deviceId: String(origin.db.prepare('SELECT deviceId FROM sync_state WHERE id=1').get()?.deviceId), keyEpoch: 1, bindingToken: randomUUID(),
    }
    origin.db.prepare('UPDATE sync_state SET workspaceId=?,keyEpoch=1 WHERE id=1').run(oldBinding.workspaceId)
    setActiveBinding(origin.driver, oldBinding); setActiveBinding(origin.driver, oldBinding)
    fatal(() => setActiveBinding(origin.driver, { ...oldBinding, bindingToken: randomUUID() }), /already established/)
    const newBinding: BindingIdentity = { ...oldBinding, workspaceId: randomUUID(), generation: randomUUID(), deviceId: randomUUID(), bindingToken: randomUUID() }
    const requestId = randomUUID(), initializationRequestId = randomUUID(), seedId = randomUUID(), finalOpId = randomUUID()
    const preview = previewBindingTransition(origin.driver, origin.host, { expectedBinding: oldBinding, expectedLocalGeneration: oldBinding.localGeneration })
    const input = { requestId, initializationRequestId, expectedLocalGeneration: oldBinding.localGeneration, expectedBinding: oldBinding, newBinding, expectedRevision: preview.revision, expectedSourceDigest: preview.sourceDigest,
      seedId, finalOpId, protectedContextRef: `retained:${requestId}`, newProtectedContextRef: `prepared:${initializationRequestId}`, at }
    const beforeOps = rawOps(origin)
    fatal(() => commitBindingTransition(origin.driver, origin.host, { ...input, expectedRevision: preview.revision + 1 }), /source changed/)
    assert.equal(rawOps(origin), beforeOps)
    origin.db.exec("CREATE TRIGGER inject_retired_failure BEFORE INSERT ON sync_retired_rows BEGIN SELECT RAISE(ABORT,'injected retirement failure'); END")
    assert.throws(() => commitBindingTransition(origin.driver, origin.host, input), /injected retirement failure/)
    origin.db.exec('DROP TRIGGER inject_retired_failure')
    assert.equal(rawOps(origin), beforeOps); assert.equal(history(origin), beforeHistory); assert.equal(sourceDigest(origin), source.digest)
    assert.equal(retiredBindingSummary(origin.driver).rows, 0)
    checks.push('Bootstrap binding is immutable; stale preview and retirement-copy failure roll back original rows/history')
    const receipt = commitBindingTransition(origin.driver, origin.host, input)
    assert.deepEqual(commitBindingTransition(origin.driver, origin.host, input), receipt)
    fatal(() => commitBindingTransition(origin.driver, origin.host, { ...input, finalOpId: randomUUID() }), /identity changed/)
    fatal(() => assertActiveBinding(origin.driver, oldBinding), /stale active binding/)
    assert.equal(history(origin), beforeHistory); assert.equal(sourceDigest(origin), source.digest)
    assert.equal(receipt.finalSeq, receipt.manifest.chunks + 2)
    assert.equal(readSeedHandoff(origin.driver, newBinding)?.canonicalVerified, false)
    const retired = retiredBindingSummary(origin.driver)
    assert.equal(retired.unknown, 1); assert.equal(retired.acceptedNotApplied, 1)
    assert.equal(receipt.retired.counts.canon_op, 1); assert.equal(receipt.retired.counts.canon_change, 1)
    assert.equal(JSON.parse(String(origin.db.prepare("SELECT value FROM sync_retired_rows WHERE kind='canon_change'").get()?.value)).after, calendar)
    assert.ok(isRetiredCommand(origin.driver, oldBinding.localGeneration, oldAccepted))
    const retiredUnknown = origin.db.prepare("SELECT value FROM sync_retired_rows WHERE kind='sync_op' AND rowKey=?").get(oldUnknown)
    assert.equal(JSON.parse(String(retiredUnknown?.value)).state, 'send_unknown')
    assert.throws(() => origin.db.exec('UPDATE sync_retired_rows SET value=value'), /retired_evidence_immutable/)
    observations.push({ phase: 'handoff', digest: source.digest, counts: source.counts, rowBytes: source.rowBytes, finalSeq: receipt.finalSeq, retired })
    checks.push('Atomic handoff preserves exact source/history and immutable unknown/accepted evidence beside fresh active order')
    const ops = origin.db.prepare('SELECT payload FROM sync_ops ORDER BY localOrder').all().map(row => parseSyncOp(JSON.parse(String(row.payload))))
    const wk = systemRandom().bytes(32)
    const wire = ops.map(op => sealOpWire({ op, workspaceKey: wk, workspaceId: newBinding.workspaceId, epoch: 1 }))
    const log = wire.map((sealed, index) => ({ seq: index + 1, op: openOpWire({ ...sealed, seq: index + 1 }, { workspaceKey: wk, workspaceId: newBinding.workspaceId }) }))
    const isolated = machine('isolated-copy', false)
    for (let index = 0; index < log.length; index++) {
      mergeRemoteOps(isolated.driver, [log[index]!], isolated.host, at, { deferIncompleteSeed: true })
      if (index < log.length - 1) {
        assert.equal(isolated.db.prepare('SELECT calendar FROM workspace WHERE id=1').get()?.calendar, null)
        assert.equal(Number(isolated.db.prepare('SELECT count(*) AS n FROM items').get()?.n), 0)
      }
    }
    assert.equal(sourceDigest(isolated), source.digest)
    checks.push('Bounded isolated retrieval replay commits only canonical prefixes and publishes visible state after final')
    const peer = machine('peer')
    peer.run({ type: 'create', title: 'Peer local data stays during partial join', horizon: 'later' })
    const peerBefore = sourceDigest(peer), peerHistory = history(peer)
    fatal(() => installJoined(peer.driver, peer.host, { binding: { workspaceId: newBinding.workspaceId, deviceId: randomUUID(), keyEpoch: 1 }, ops: log.slice(0, 1), at, merge: false }), /initialization_pending/)
    assert.equal(sourceDigest(peer), peerBefore); assert.equal(history(peer), peerHistory)
    assert.equal(Number(peer.db.prepare('SELECT lastAppliedSeq FROM sync_state WHERE id=1').get()?.lastAppliedSeq), 0)
    checks.push('Partial first join rolls back the complete local install, retaining peer data/history')
    mergeRemoteOps(origin.driver, [log[0]!], origin.host, at)
    assert.equal(sourceDigest(origin), source.digest)
    const beforeBad = sourceDigest(origin)
    const ordinary: SyncOp = { v: 1, opId: randomUUID(), deviceId: newBinding.deviceId, at, actions: [{ t: 'item.set', id: target, fields: { title: 'Must not land' } }] }
    fatal(() => mergeRemoteOps(origin.driver, [{ seq: 2, op: ordinary }], origin.host, at), /ordinary operation inside seed/)
    const firstRows = structuredClone(log[1]!.op)
    firstRows.opId = randomUUID()
    if (firstRows.actions[0]?.t === 'seed.rows') firstRows.actions[0].index++
    fatal(() => mergeRemoteOps(origin.driver, [{ seq: 2, op: firstRows }], origin.host, at), /chunk order/)
    assert.equal(sourceDigest(origin), beforeBad)
    assert.equal(Number(origin.db.prepare('SELECT lastAppliedSeq FROM sync_state WHERE id=1').get()?.lastAppliedSeq), 1)
    checks.push('Interleaving/reordered seed chunks are fatal and cannot advance the canonical cursor')
    const edit = origin.run({ type: 'edit', itemId: target, expectedVersion: origin.repo.store.item(target).version, title: 'New binding edit after seed', description: origin.repo.store.item(target).description, dueDate: origin.repo.store.item(target).dueDate })
    const editedDigest = sourceDigest(origin)
    assert.equal(isRetiredCommand(origin.driver, oldBinding.localGeneration, edit.operationId), false)
    for (let index = 1; index < log.length; index++) {
      if (index === log.length - 1) {
        const corrupt = structuredClone(log[index]!.op); corrupt.opId = randomUUID()
        if (corrupt.actions[0]?.t === 'seed.final') corrupt.actions[0].digest = '0'.repeat(64)
        fatal(() => mergeRemoteOps(origin.driver, [{ seq: index + 1, op: corrupt }], origin.host, at), /incomplete final/)
      }
      mergeRemoteOps(origin.driver, [log[index]!], origin.host, at)
      assert.equal(sourceDigest(origin), editedDigest)
      observations.push({ phase: 'own-ack', seq: index + 1, visibleDigest: editedDigest, basePhase: readSeedState(origin.driver, 'base')?.phase })
      if (index === 1) {
        const duplicate = structuredClone(log[index]!.op); duplicate.opId = randomUUID()
        fatal(() => mergeRemoteOps(origin.driver, [{ seq: index + 2, op: duplicate }], origin.host, at), /chunk order/)
        assert.equal(Number(origin.db.prepare('SELECT lastAppliedSeq FROM sync_state WHERE id=1').get()?.lastAppliedSeq), index + 1)
        origin.db.close(); origin = machine('origin', false)
        rebuildVisibleFull(origin.driver, origin.host)
        assert.equal(sourceDigest(origin), editedDigest)
      }
    }
    const boundary = { requestId: initializationRequestId, creatorDeviceId: newBinding.deviceId, finalOpId, finalPayloadHash: receipt.finalPayloadHash, finalSeq: receipt.finalSeq }
    assertSeedBoundary(origin.driver, boundary)
    assert.equal(readSeedHandoff(origin.driver, newBinding)?.canonicalVerified, true)
    fatal(() => assertSeedBoundary(origin.driver, { ...boundary, finalPayloadHash: '0'.repeat(64) }), /mismatch/)
    fatal(() => assertSeedBoundary(origin.driver, null), /requires initialization proof/)
    installJoined(peer.driver, peer.host, { binding: { workspaceId: newBinding.workspaceId, deviceId: randomUUID(), keyEpoch: 1 }, ops: log, at, merge: false })
    assert.equal(sourceDigest(peer), source.digest)
    assertSeedBoundary(peer.driver, boundary)
    const editPayload = String(origin.db.prepare('SELECT payload FROM sync_ops WHERE opId=?').get(edit.operationId)?.payload)
    const editOp = parseSyncOp(JSON.parse(editPayload))
    const editedWire = sealOpWire({ op: editOp, workspaceKey: wk, workspaceId: newBinding.workspaceId, epoch: 1 })
    const openedEdit = openOpWire({ ...editedWire, seq: log.length + 1 }, { workspaceKey: wk, workspaceId: newBinding.workspaceId })
    mergeRemoteOps(origin.driver, [{ seq: log.length + 1, op: openedEdit }], origin.host, at)
    mergeRemoteOps(peer.driver, [{ seq: log.length + 1, op: openedEdit }], peer.host, at)
    assert.equal(sourceDigest(origin), editedDigest); assert.equal(sourceDigest(peer), editedDigest)
    assert.equal(Number(origin.db.prepare('SELECT version FROM items WHERE id=?').get(target)?.version), 78)
    assert.equal(Number(peer.db.prepare('SELECT version FROM item_placements WHERE itemId=?').get(target)?.version), 55)
    assert.equal(Number(peer.db.prepare('SELECT revision FROM item_guidance WHERE itemId=?').get(cleared)?.revision), 9)
    assert.deepEqual(origin.db.prepare('SELECT deletedAt,deletedBy,archivedAt,status,version FROM items WHERE id=?').get(done), peer.db.prepare('SELECT deletedAt,deletedBy,archivedAt,status,version FROM items WHERE id=?').get(done))
    checks.push('Every own ack/restart retains exact seed plus later local edit; fresh encrypted peer converges with versions/tombstones/null guidance intact')
    assert.equal(peer.db.prepare('SELECT nestingParentId FROM item_placements WHERE itemId=?').get(nestedChild)?.nestingParentId, nestedParent)
    assert.equal(peer.db.prepare('SELECT holdPeriodId FROM item_placements WHERE itemId=?').get(held)?.holdPeriodId, hold)
    let seq = log.length + 1
    const applyBoth = (actions: SyncOp['actions']) => {
      const op = parseSyncOp({ v: 1, opId: randomUUID(), deviceId: newBinding.deviceId, at, actions })
      const sealed = sealOpWire({ op, workspaceKey: wk, workspaceId: newBinding.workspaceId, epoch: 1 })
      const opened = openOpWire({ ...sealed, seq: ++seq }, { workspaceKey: wk, workspaceId: newBinding.workspaceId })
      for (const m of [origin, peer]) mergeRemoteOps(m.driver, [{ seq, op: opened }], m.host, at)
      assert.equal(sourceDigest(origin), sourceDigest(peer))
      return op
    }
    const beforeGuard = sourceDigest(origin)
    applyBoth([{ t: 'item.discardIfEmpty', id: target, expectVersion: 77 }])
    assert.equal(sourceDigest(origin), beforeGuard)
    applyBoth([{ t: 'guidance.set', itemId: cleared, baseRevision: 9, value: { formatVersion: 1, kind: 'next_step', nextAction: 'New binding note', contextNote: null, scopeNote: null, authorship: 'user' } }])
    assert.equal(Number(peer.db.prepare('SELECT revision FROM item_guidance WHERE itemId=?').get(cleared)?.revision), 10)
    const oldDeleteId = String(peer.db.prepare('SELECT deletedBy FROM items WHERE id=?').get(done)?.deletedBy)
    applyBoth([{ t: 'item.restore', id: done, expectedDeleteOpId: oldDeleteId }])
    assert.equal(peer.db.prepare('SELECT deletedBy FROM items WHERE id=?').get(done)?.deletedBy, null)
    const discarded = applyBoth([{ t: 'item.discardIfEmpty', id: target, expectVersion: 78 }])
    assert.equal(peer.db.prepare('SELECT deletedBy FROM items WHERE id=?').get(target)?.deletedBy, discarded.opId)
    checks.push('Seeded holds/outline survive; current-binding exact discard/guidance/restore guards use original versions and provenance')

    const first = machine('first-connection')
    const firstCommand = first.run({ type: 'create', title: 'First connection exact source', horizon: 'week' })
    const firstGeneration = first.repo.store.workspace().generation, firstHistory = history(first), firstDigest = sourceDigest(first)
    const firstBinding: BindingIdentity = { ...newBinding, workspaceId: randomUUID(), generation: randomUUID(), localGeneration: firstGeneration, deviceId: randomUUID(), bindingToken: randomUUID() }
    const firstPreview = previewBindingTransition(first.driver, first.host, { expectedBinding: null, expectedLocalGeneration: firstGeneration })
    const firstReceipt = commitBindingTransition(first.driver, first.host, { requestId: randomUUID(), initializationRequestId: randomUUID(), seedId: randomUUID(), finalOpId: randomUUID(),
      expectedBinding: null, expectedLocalGeneration: firstGeneration, expectedRevision: firstPreview.revision, expectedSourceDigest: firstPreview.sourceDigest,
      newBinding: firstBinding, protectedContextRef: null, newProtectedContextRef: `prepared:${randomUUID()}`, at })
    assert.equal(firstReceipt.oldBinding, null); assert.equal(firstReceipt.protectedContextRef, null)
    assert.equal(sourceDigest(first), firstDigest); assert.equal(history(first), firstHistory)
    assert.ok(isRetiredCommand(first.driver, firstGeneration, firstCommand.operationId))
    assert.equal(readSeedHandoff(first.driver, firstBinding)?.requestId, firstReceipt.initializationRequestId)
    assert.equal(readSeedHandoff(first.driver, firstBinding)?.seedId, firstReceipt.manifest.seedId)
    const ambiguous = machine('ambiguous-first')
    ambiguous.db.prepare("UPDATE sync_ops SET state='send_unknown',sendAttemptId=? WHERE localOrder=1").run(randomUUID())
    fatal(() => previewBindingTransition(ambiguous.driver, ambiguous.host, { expectedBinding: null, expectedLocalGeneration: ambiguous.repo.store.workspace().generation }), /delivery identity/)
    checks.push('Proven unbound first connection uses the same exact handoff with independent IDs; ambiguous sends are refused')
    const broken = machine('broken')
    broken.db.exec('PRAGMA defer_foreign_keys=ON; BEGIN IMMEDIATE')
    broken.db.prepare("INSERT INTO item_placements(itemId,horizon,periodId,sortKey,version,holdPeriodId,nestingParentId) VALUES (?,'later',NULL,1,1,NULL,NULL)").run(randomUUID())
    fatal(() => captureExactSeed(broken.driver, broken.host), /placement membership/)
    broken.db.exec('ROLLBACK')
    const emptySource = captureExactSeed(broken.driver, broken.host)
    assert.throws(() => encodeExactSeed({ ...emptySource, records: [...emptySource.records, ...Array(201).fill(emptySource.records[0])] },
      { seedId: randomUUID(), finalOpId: randomUUID(), deviceId: randomUUID(), at }))
    checks.push('Source orphan rows are rejected independently; malformed seed cannot be encoded as a valid baseline')
    const emptyId = machine('empty-primary-key')
    emptyId.db.prepare("INSERT INTO items(id,title,description,dueDate,status,completedAt,cancelledAt,archivedAt,deletedAt,deletedBy,createdAt,updatedAt,version,flowColor) VALUES ('','Unsupported identity','',NULL,'todo',NULL,NULL,NULL,NULL,NULL,?,?,1,NULL)").run(at, at)
    emptyId.db.prepare("INSERT INTO item_placements(itemId,horizon,periodId,sortKey,version,holdPeriodId,nestingParentId) VALUES ('','later',NULL,1,1,NULL,NULL)").run()
    const emptyRows = canonicalJson([emptyId.db.prepare('SELECT * FROM items').all(), emptyId.db.prepare('SELECT * FROM item_placements').all(), emptyId.db.prepare('SELECT * FROM sync_state').all()])
    const emptyHistory = history(emptyId), emptyGeneration = emptyId.repo.store.workspace().generation
    fatal(() => captureExactSeed(emptyId.driver, emptyId.host))
    fatal(() => commitBindingTransition(emptyId.driver, emptyId.host, { requestId: randomUUID(), initializationRequestId: randomUUID(), seedId: randomUUID(), finalOpId: randomUUID(),
      expectedBinding: null, expectedLocalGeneration: emptyGeneration, expectedRevision: emptyId.repo.store.workspace().revision,
      expectedSourceDigest: '0'.repeat(64), newBinding: { ...firstBinding, localGeneration: emptyGeneration, bindingToken: randomUUID() },
      protectedContextRef: null, newProtectedContextRef: 'prepared:invalid-source', at }))
    assert.equal(canonicalJson([emptyId.db.prepare('SELECT * FROM items').all(), emptyId.db.prepare('SELECT * FROM item_placements').all(), emptyId.db.prepare('SELECT * FROM sync_state').all()]), emptyRows)
    assert.equal(history(emptyId), emptyHistory); assert.equal(retiredBindingSummary(emptyId.driver).rows, 0)
    checks.push('Empty SQL item identity is read on the first page and rejected without losing source rows/history')
    const bound = machine('byte-bound')
    const description = '\u0001'.repeat(100_000)
    const itemInsert = bound.db.prepare("INSERT INTO items(id,title,description,dueDate,status,completedAt,cancelledAt,archivedAt,deletedAt,deletedBy,createdAt,updatedAt,version,flowColor) VALUES (?,?,?,NULL,'todo',NULL,NULL,NULL,NULL,NULL,?,?,1,NULL)")
    const placementInsert = bound.db.prepare("INSERT INTO item_placements(itemId,horizon,periodId,sortKey,version,holdPeriodId,nestingParentId) VALUES (?,'later',NULL,1,1,NULL,NULL)")
    bound.driver.transaction(() => { for (let i = 0; i < 180; i++) { const id = `bound-${String(i).padStart(4, '0')}`; itemInsert.run(id, 'Byte bound', description, at, at); placementInsert.run(id) } })
    let guidanceReads = 0, itemPages = 0
    const measured: SqlDriver = { ...bound.driver, prepare(sql) {
      if (/SELECT itemId,revision,value/.test(sql)) guidanceReads++
      if (/FROM items t WHERE/.test(sql)) { assert.match(sql, /LIMIT 16/); itemPages++ }
      return bound.driver.prepare(sql)
    } }
    const boundHistory = history(bound)
    fatal(() => captureExactSeed(measured, bound.host), /exceeds byte limit/)
    assert.ok(guidanceReads < 180); assert.ok(itemPages > 1)
    assert.equal(history(bound), boundHistory); assert.equal(retiredBindingSummary(bound.driver).rows, 0)
    observations.push({ phase: 'byte-bound', sourceRows: 180, guidanceReads, itemPages, limit: 104_857_600, rawDescriptionBytes: 18_000_000 })
    checks.push('Real SQLite escaped-byte overflow stops paged capture before remaining rows and preserves source/history')
    for (const m of [origin, peer, isolated, first, ambiguous, broken, emptyId, bound]) { verifyDatabase(m.db); m.db.close() }
  }
  emptySeedJoinAcceptance()
  report.passed = true
} catch (error) {
  report.failure = error instanceof Error ? error.stack ?? error.message : String(error)
  process.exitCode = 1
} finally {
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2))
  process.stdout.write(`${report.passed ? 'PASS' : 'FAIL'} exact seed acceptance: ${checks.length} checks\n`)
}
