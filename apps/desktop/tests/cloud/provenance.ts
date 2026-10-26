/**
 * [INPUT]: Actual installed peer seed, Repository/worker adapter and real SQLite backup/restore.
 * [OUTPUT]: Strict continuous guidance provenance, rollback and malformed-boundary acceptance evidence.
 * [POS]: Owning D2 integration journey; no synthetic executable origin history or unit substitute.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { canonicalJson, parseSyncOp, type SyncOp } from '@goalloom/contracts'
import type { BindingIdentity } from '@goalloom/store-core'
import { ExecutionQueries } from '../../src/main/workspace/execution'
import { Repository } from '../../src/main/workspace/repository'
import { runSyncLocal } from '../../src/main/workspace/sync/local'
import { validateDataset } from '../../src/domain/import-validation'
import { exportDataset, readBackupDataset, replaceDataset } from '../../src/main/workspace/transfer/dataset'
import { consistentBackup } from '../../src/main/storage/backup/snapshot'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import type { GuidanceValue } from '../../src/shared/contracts/assistance'
import type { PendingPlain } from '@goalloom/sync'

export async function verifyContinuousProvenance(db: DatabaseSync, binding: BindingIdentity, directory: string, at: string): Promise<string[]> {
  const checks: string[] = [], repo = new Repository(db, { now: () => at })
  const itemId = repo.store.items('1').find(item => repo.store.guidance(item.id)?.value != null)?.id
  assert(itemId)
  const value = (text: string): GuidanceValue => ({ formatVersion: 1, kind: 'next_step', nextAction: text, contextNote: null, scopeNote: null, authorship: 'user' })
  const current = () => repo.store.guidance(itemId)!
  const sourceSeq = () => Number(db.prepare('SELECT lastAppliedSeq FROM sync_state WHERE id=1').get()!.lastAppliedSeq)
  const checkpoints = () => db.prepare('SELECT record FROM guidance_baselines ORDER BY position').all().map(row => JSON.parse(String(row.record)))
  const validate = () => { const data = exportDataset(repo.store, at); try { validateDataset(data, at) } catch (error) { console.error('PROVENANCE_HISTORY_FAILURE', canonicalJson({ items: data.items.map(({ id, version, status }) => ({ id, version, status })), tails: data.items.map(item => data.events.filter(event => event.itemId === item.id).at(-1)) })); throw error }; return data }
  const call = <T>(action: object) => runSyncLocal(db, { ...action, expectedBinding: binding }) as Promise<T>
  const local = (text: string) => repo.execute({ type: 'applyAssistance', operationId: randomUUID(), generation: repo.store.workspace().generation,
    itemId, expectedVersion: repo.store.item(itemId).version, expectedGuidanceRevision: current().revision, guidance: { kind: 'set', value: value(text) } })
  const foreign = (next: GuidanceValue | null, baseRevision = Number(db.prepare('SELECT revision FROM base_item_guidance WHERE itemId=?').get(itemId)?.revision ?? 0)) => parseSyncOp({ v: 1, opId: randomUUID(), deviceId: randomUUID(), at, actions: [{ t: 'guidance.set', itemId, baseRevision, value: next }] })
  const absorb = (op: SyncOp) => call({ type: 'absorb', ops: [{ seq: sourceSeq() + 1, op }], at })
  const ack = async (operationId: string) => {
    const pending = (await call<PendingPlain[]>({ type: 'peek' })).find(row => row.opId === operationId)
    assert(pending)
    const seq = sourceSeq() + 1
    await call({ type: 'mark', ids: [operationId], at, attemptId: randomUUID(), scope: { workspaceId: binding.workspaceId, generation: binding.localGeneration } })
    await call({ type: 'accept', pending: [pending], results: [{ opId: operationId, seq }], at })
    const op = parseSyncOp(JSON.parse(pending.payload))
    await call({ type: 'absorb', ops: [{ seq, op }], at })
    await call({ type: 'absorb', ops: [{ seq, op }], at })
  }
  const tables = ['workspace', 'item_guidance', 'base_item_guidance', 'sync_state', 'sync_ops', 'canon_ops', 'canon_changes', 'guidance_baselines', 'operations', 'item_events', 'undo_effects']
  const snapshot = () => canonicalJson(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]))
  validate()
  const initialCount = checkpoints().length, first = local('Local accepted step')
  validate(); await ack(first.operationId); validate()
  assert.equal(checkpoints().length, initialCount)
  checks.push('Unchanged own receipt/acknowledgement and repeated pull append no guidance checkpoint')
  await absorb(foreign(value('Remote step one'))); validate()
  const second = local('Local step after remote')
  validate()
  const undo = repo.execute({ type: 'undo', operationId: randomUUID(), generation: binding.localGeneration, originalOperationId: second.operationId })
  assert.equal(undo.changed, true); validate()
  const beforeUndoRemote = current()
  await absorb(foreign(value('Remote after local undo'))); validate()
  const last = checkpoints().at(-1)!, stateBefore = last.changes.find((change: { itemId: string }) => change.itemId === itemId).before
  assert.equal(stateBefore.head.operationId, beforeUndoRemote.operationId)
  assert.notEqual(stateBefore.identity, stateBefore.head.operationId)
  checks.push('Local→remote→local→undo and undo→remote retain exact stored head operation separately from logical identity')
  await absorb(foreign(null)); validate()
  const cleared = checkpoints().at(-1)!.changes.find((change: { itemId: string }) => change.itemId === itemId).after
  assert(cleared && cleared.head.value === null)
  const boundary = checkpoints().at(-1)!.afterEventSeq
  await absorb(foreign(value('Remote at same local boundary one'))); await absorb(foreign(value('Remote at same local boundary two')))
  validate()
  assert.equal(checkpoints().at(-1)!.afterEventSeq, boundary); assert.equal(checkpoints().at(-2)!.afterEventSeq, boundary)
  checks.push('Clear tombstones remain distinct from absence; multiple remote updates at one local boundary keep deterministic order')
  local('Pending guidance that loses the canonical race')
  const canonicalBefore = Number(db.prepare('SELECT revision FROM base_item_guidance WHERE itemId=?').get(itemId)!.revision)
  await absorb(foreign(value('Canonical winner'), canonicalBefore)); validate()
  checks.push('Canonical rejection/rebuild of pending guidance records the whole visible transition without changing local receipts')
  const held = snapshot(), op = foreign(value('Rollback on checkpoint failure'))
  db.exec("CREATE TRIGGER fail_guidance_checkpoint BEFORE INSERT ON guidance_baselines BEGIN SELECT RAISE(ABORT,'synthetic checkpoint failure'); END")
  await assert.rejects(absorb(op)); assert.equal(snapshot(), held)
  db.exec('DROP TRIGGER fail_guidance_checkpoint')
  await absorb(op); validate()
  checks.push('Checkpoint insert failure atomically rolls back visible/base guidance, cursor, canonical receipts and local history')
  const plan = repo.execute({ type: 'createPlan', operationId: randomUUID(), generation: binding.localGeneration, items: ['A', 'B'].map(draftId => ({ draftId, title: `Boundary ${draftId}`, description: '', dueDate: null, horizon: 'later', previewPeriodId: null, parentRefs: [], flowColor: null })) })
  await absorb(foreign(value('After complete multi-event operation')))
  const interleaved = repo.execute({ type: 'create', operationId: randomUUID(), generation: binding.localGeneration, title: 'Interleaved boundary', horizon: 'later' })
  await absorb(foreign(value('After another complete operation')))
  const data = validate(), complete = checkpoints().find(row => row.afterOperationId === plan.operationId)!
  const events = data.events.filter(event => event.operationId === plan.operationId)
  assert(events.length > 1)
  const tamper = (change: (data: ReturnType<typeof validate>) => void) => { const copy = structuredClone(data); change(copy); assert.throws(() => validateDataset(copy, at)) }
  tamper(copy => { copy.guidanceCheckpoints!.find(row => row.afterOperationId === plan.operationId)!.afterEventSeq = events[0]!.seq })
  tamper(copy => { copy.guidanceCheckpoints!.at(-1)!.afterEventSeq += 100 })
  tamper(copy => { copy.guidanceCheckpoints!.at(-1)!.order = 1 })
  tamper(copy => { copy.guidanceCheckpoints!.at(-1)!.changes[0]!.before = null })
  tamper(copy => { copy.guidanceCheckpoints!.at(-1)!.id = copy.guidanceCheckpoints![0]!.id })
  tamper(copy => {
    const a = copy.events.filter(event => event.operationId === plan.operationId).sort((x, y) => x.seq - y.seq)
    const b = copy.events.find(event => event.operationId === interleaved.operationId)!
    const lastA = a.at(-1)!, bSeq = b.seq
    b.seq = lastA.seq; lastA.seq = bSeq
    const first = copy.guidanceCheckpoints!.find(row => row.afterOperationId === plan.operationId)!
    const last = copy.guidanceCheckpoints!.at(-1)!
    last.afterEventSeq = b.seq
    last.changes[0]!.before = first.changes[0]!.before
    copy.guidanceCheckpoints = copy.guidanceCheckpoints!.filter(row => row.id !== first.id).map((row, index) => ({ ...row, order: index + 1 }))
  })
  assert.equal(complete.afterOperationId, plan.operationId)
  const portable = JSON.stringify(data.guidanceCheckpoints)
  for (const privateId of [binding.accountId, binding.deviceId, binding.bindingToken]) assert(!portable.includes(privateId))
  checks.push('Tampered before/order/duplicate/future/internal-operation boundaries are rejected; portable source excludes private binding identifiers')
  const origin = Date.parse(at), facts = new ExecutionQueries(repo.store)
  at = new Date(origin + 3600000).toISOString()
  const aConfirmation = local('A confirmed before another task event'); await ack(aConfirmation.operationId)
  const cutoff = new Date(origin + 3600000 + 15 * 60000).toISOString()
  at = new Date(origin + 3600000 + 30 * 60000).toISOString()
  const bEvent = repo.execute({ type: 'create', operationId: randomUUID(), generation: binding.localGeneration, title: 'Unrelated task boundary', horizon: 'later' })
  const prior = facts.insightContext({ type: 'insightTaskContext', itemId, generation: binding.localGeneration, cutoff }, at)
  assert.equal(prior.guidance.quality, 'complete')
  const previousRevision = prior.executionFacts.sourceRevision
  at = new Date(origin + 2 * 3600000).toISOString()
  await absorb(foreign(value('Remote A after unrelated B boundary'))); validate()
  assert.equal(checkpoints().at(-1)!.afterOperationId, bEvent.operationId)
  const observed = facts.insightContext({ type: 'insightTaskContext', itemId, generation: binding.localGeneration, cutoff }, at)
  assert.notEqual(observed.executionFacts.sourceRevision, previousRevision)
  assert.equal(observed.guidance.quality, 'unknown'); assert.equal(observed.guidance.value, null)
  checks.push('Historical A guidance/revision use A’s own evidence across a future checkpoint, never unrelated B boundary time')
  at = new Date(origin + 2 * 3600000 + 5 * 60000).toISOString()
  await absorb(foreign(value('First observed value without local confirmation')))
  const observedCutoff = new Date(origin + 2 * 3600000 + 6 * 60000).toISOString()
  at = observedCutoff
  const knownObservation = facts.insightContext({ type: 'insightTaskContext', itemId, generation: binding.localGeneration, cutoff: observedCutoff }, at)
  assert.equal(knownObservation.guidance.quality, 'complete')
  assert.equal(knownObservation.guidance.value?.nextAction, 'First observed value without local confirmation')
  assert.equal(knownObservation.executionFacts.pressure.suppression.quality, 'unknown')
  at = new Date(origin + 2 * 3600000 + 15 * 60000).toISOString()
  repo.execute({ type: 'create', operationId: randomUUID(), generation: binding.localGeneration, title: 'Second unrelated task boundary', horizon: 'later' })
  at = new Date(origin + 2 * 3600000 + 30 * 60000).toISOString()
  await absorb(foreign(value('Second observed value without local confirmation')))
  const nextObservation = facts.insightContext({ type: 'insightTaskContext', itemId, generation: binding.localGeneration, cutoff: observedCutoff }, at)
  assert.equal(nextObservation.guidance.quality, 'unknown')
  assert.notEqual(nextObservation.executionFacts.sourceRevision, knownObservation.executionFacts.sourceRevision)
  at = new Date(origin + 2 * 3600000 + 40 * 60000).toISOString()
  local('Actual local confirmation after the observed gap')
  at = new Date(origin + 2 * 3600000 + 41 * 60000).toISOString()
  const confirmed = facts.insightContext({ type: 'insightTaskContext', itemId, generation: binding.localGeneration, cutoff: at }, at)
  assert.equal(confirmed.guidance.quality, 'complete'); assert.equal(confirmed.guidance.value?.nextAction, 'Actual local confirmation after the observed gap')
  checks.push('Prior A checkpoints seed exact observed guidance without confirmation; later observations invalidate gaps and genuine local confirmations remain provable')
  const finalData = validate()
  const path = await consistentBackup(db, join(directory, 'provenance-backups')), backup = await readBackupDataset(path, at)
  const restored = openDatabase(join(directory, 'provenance-restored.sqlite')); migrate(restored)
  try {
    const target = new Repository(restored, { now: () => at })
    replaceDataset(target.store, backup.data, 'restore', at)
    const again = exportDataset(target.store, at); validateDataset(again, at)
    assert.deepEqual(again.guidanceCheckpoints, finalData.guidanceCheckpoints)
    assert.deepEqual(again.guidance, finalData.guidance)
    assert.deepEqual(again.operations, finalData.operations); assert.deepEqual(again.events, finalData.events); assert.deepEqual(again.undoEffects, finalData.undoEffects)
  } finally { restored.close() }
  const damagedPath = join(directory, 'provenance-damaged-history.sqlite')
  await copyFile(path, damagedPath)
  const damaged = new DatabaseSync(damagedPath)
  damaged.prepare("UPDATE operations SET result=json_set(result,'$.operationId',?) WHERE id=(SELECT id FROM operations LIMIT 1)").run(randomUUID())
  damaged.close()
  const recovered = await readBackupDataset(damagedPath, at)
  assert.equal(recovered.historyRecovered, true); assert.equal(recovered.data.historyMode, 'baseline')
  assert.deepEqual(recovered.data.guidanceCheckpoints, []); assert.deepEqual(recovered.data.guidance, finalData.guidance)
  const recoveryDb = openDatabase(join(directory, 'provenance-current-data-recovered.sqlite')); migrate(recoveryDb)
  try {
    const target = new Repository(recoveryDb, { now: () => at })
    replaceDataset(target.store, recovered.data, 'restore', at)
    const again = exportDataset(target.store, at); validateDataset(again, at)
    assert.equal(again.guidanceCheckpoints?.length, 1)
    assert.equal(again.guidanceCheckpoints?.[0]?.cause, 'baseline')
    assert(again.operations.every(operation => operation.kind === 'baseline'))
  } finally { recoveryDb.close() }
  checks.push('Damaged actual backup history falls back to exact current heads without old checkpoints and restores a fresh honest baseline')
  checks.push('Continuous provenance survives actual SQLite backup/restore with original operations/events/undo markers unchanged')
  return checks
}
