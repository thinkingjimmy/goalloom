/**
 * [INPUT]: Actual installed peer binding, Repository/worker adapter and an injected observation clock.
 * [OUTPUT]: Business observation continuity, original-history preservation, gap facts and atomic rollback evidence.
 * [POS]: Owning D2 sync/history integration journey; no source-device execution is synthesized.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { canonicalJson, parseSyncOp, type SyncOp } from '@goalloom/contracts'
import type { BindingIdentity } from '@goalloom/store-core'
import type { PendingPlain } from '@goalloom/sync'
import { Repository } from '../../src/main/workspace/repository'
import { readHistory } from '../../src/main/workspace/history'
import { ExecutionQueries } from '../../src/main/workspace/execution'
import { runSyncLocal } from '../../src/main/workspace/sync/local'
import { exportDataset } from '../../src/main/workspace/transfer/dataset'
import { validateDataset } from '../../src/domain/import-validation'
import { currentPeriod } from '../../src/domain/calendar'

export async function verifyBusinessProvenance(db: DatabaseSync, binding: BindingIdentity, at: string): Promise<string[]> {
  let now = at
  const repo = new Repository(db, { now: () => now }), checks: string[] = [], facts = new ExecutionQueries(repo.store)
  const sourceSeq = () => Number(db.prepare('SELECT lastAppliedSeq FROM sync_state WHERE id=1').get()!.lastAppliedSeq)
  const call = <T>(action: object) => runSyncLocal(db, { ...action, expectedBinding: binding }) as Promise<T>
  const foreign = (actions: SyncOp['actions']) => parseSyncOp({ v: 1, opId: randomUUID(), deviceId: randomUUID(), at: now, actions })
  const absorb = (op: SyncOp) => call({ type: 'absorb', ops: [{ seq: sourceSeq() + 1, op }], at: now })
  const validate = () => { const data = exportDataset(repo.store, now); validateDataset(data, now); return data }
  const baselineCount = () => Number(db.prepare("SELECT count(*) AS n FROM item_events WHERE type='baseline'").get()!.n)
  const history = () => ({ operations: db.prepare('SELECT * FROM operations ORDER BY id').all(), events: db.prepare('SELECT * FROM item_events ORDER BY seq').all(), undo: db.prepare('SELECT * FROM undo_effects ORDER BY originalId,effectIndex').all() })
  const preserved = (before: ReturnType<typeof history>) => {
    const after = history()
    for (const [key, rows] of Object.entries(before)) for (const row of rows) assert(after[key as keyof typeof after].some(candidate => canonicalJson(candidate) === canonicalJson(row)))
  }
  const ack = async (operationId: string) => {
    const pending = (await call<PendingPlain[]>({ type: 'peek' })).find(row => row.opId === operationId)!
    assert(pending)
    const seq = sourceSeq() + 1
    await call({ type: 'mark', ids: [operationId], at: now, attemptId: randomUUID(), scope: { workspaceId: binding.workspaceId, generation: binding.localGeneration } })
    await call({ type: 'accept', pending: [pending], results: [{ opId: operationId, seq }], at: now })
    await call({ type: 'absorb', ops: [{ seq, op: parseSyncOp(JSON.parse(pending.payload)) }], at: now })
  }
  const itemId = randomUUID(), initialHistory = history()
  await absorb(foreign([{ t: 'item.create', id: itemId, title: 'Observed remote task', description: '', dueDate: null, horizon: 'later', periodKey: null, sortHint: { afterId: null, beforeId: null } }]))
  validate(); preserved(initialHistory)
  const initial = baselineCount(), text = foreign([{ t: 'item.set', id: itemId, fields: { title: 'Remote text only' } }])
  await absorb(text); validate()
  await call({ type: 'absorb', ops: [{ seq: sourceSeq(), op: text }], at: now }); validate()
  assert.equal(baselineCount(), initial)
  const status = (value: 'todo' | 'done' | 'cancelled') => repo.execute({ type: 'status', operationId: randomUUID(), generation: binding.localGeneration, itemId, expectedVersion: repo.store.item(itemId).version, status: value })
  now = new Date(Date.parse(at) + 10_000).toISOString()
  const done = status('done'); validate()
  const beforeAck = baselineCount()
  await ack(done.operationId); validate(); assert.equal(baselineCount(), beforeAck)
  const cutoff = new Date(Date.parse(at) + 15_000).toISOString()
  now = new Date(Date.parse(at) + 20_000).toISOString()
  const oldRevision = facts.revision(itemId, binding.localGeneration, cutoff), beforeRemote = history()
  await absorb(foreign([{ t: 'item.status', id: itemId, status: 'cancelled', completedAt: null, cancelledAt: now }]))
  validate(); preserved(beforeRemote)
  assert.equal(baselineCount(), beforeAck + 1)
  assert.notEqual(facts.revision(itemId, binding.localGeneration, cutoff), oldRevision)
  const historical = facts.summary({ type: 'executionSummary', itemId, generation: binding.localGeneration, cutoff }, now)
  assert.equal(historical.current.quality, 'unknown')
  assert(historical.coverage.reasons.includes('external_observation_gap'))
  const todo = status('todo'); validate(); await ack(todo.operationId); validate()
  const undo = repo.execute({ type: 'undo', operationId: randomUUID(), generation: binding.localGeneration, originalOperationId: todo.operationId })
  assert(undo.changed); assert.equal(repo.store.item(itemId).status, 'cancelled'); validate()
  await ack(undo.operationId); validate()
  const period = currentPeriod(repo.store.workspace().calendar!, 'week', now), beforeMove = history()
  await absorb(foreign([{ t: 'item.place', id: itemId, horizon: 'week', periodKey: { horizon: 'week', startDate: period.startDate }, sortHint: { afterId: null, beforeId: null }, reason: 'move' }]))
  validate(); preserved(beforeMove)
  const summary = facts.summary({ type: 'executionSummary', itemId, generation: binding.localGeneration }, now)
  assert.equal(summary.currentPlacement.quality, 'unknown'); assert.equal(summary.scheduleChanges.otherPlacementChanges.value, 0)
  assert.equal(summary.carryovers.lifetime.quality, 'partial')
  checks.push('Remote create/status/move append honest segments; local status/undo and original history survive; no-op/text/own ACK append none')
  checks.push('Observation gaps invalidate historical certainty and placement entry without inventing move/carry/episode times')
  const tables = ['workspace', 'items', 'item_placements', 'base_items', 'base_item_placements', 'sync_state', 'sync_ops', 'canon_ops', 'canon_changes', 'guidance_baselines', 'operations', 'item_events', 'undo_effects']
  const snapshot = () => canonicalJson(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]))
  const held = snapshot(), rejectedWrite = foreign([{ t: 'item.status', id: itemId, status: 'todo', completedAt: null, cancelledAt: null }])
  db.exec("CREATE TRIGGER fail_business_observation BEFORE INSERT ON item_events WHEN NEW.type='baseline' BEGIN SELECT RAISE(ABORT,'synthetic baseline failure'); END")
  await assert.rejects(absorb(rejectedWrite)); assert.equal(snapshot(), held)
  db.exec('DROP TRIGGER fail_business_observation'); await absorb(rejectedWrite); validate()
  const data = validate(), baseline = data.events.find(event => event.type === 'baseline')!
  const tamper = (change: (copy: typeof data) => void) => { const copy = structuredClone(data); change(copy); assert.throws(() => validateDataset(copy, now)) }
  tamper(copy => { copy.events.find(event => event.id === baseline.id)!.before = baseline.after })
  tamper(copy => { copy.events.find(event => event.id === baseline.id)!.undoOf = randomUUID() })
  tamper(copy => { copy.operations.find(operation => operation.id === baseline.operationId)!.source = 'user' })
  tamper(copy => { copy.operations.find(operation => operation.id === baseline.operationId)!.result.undoable = true })
  tamper(copy => { copy.operations.find(operation => operation.id === baseline.operationId)!.kind = 'preferences' })
  tamper(copy => { const op = copy.operations.find(operation => operation.id === baseline.operationId)!; op.effects.push({ kind: 'description', itemId, before: '', after: 'forged' }) })
  checks.push('Baseline write failure rolls back the whole sync transaction; forged executable/user/inverse baseline shapes are rejected')
  const created = repo.execute({ type: 'create', operationId: randomUUID(), generation: binding.localGeneration, title: 'Locally proven period-end task', horizon: 'day' })
  await ack(created.operationId)
  const historicalItem = created.itemId!, day = repo.store.period(repo.store.item(historicalItem).placement.periodId!)
  now = new Date(Date.parse(now) + 10000).toISOString()
  const completed = repo.execute({ type: 'status', operationId: randomUUID(), generation: binding.localGeneration, itemId: historicalItem, expectedVersion: repo.store.item(historicalItem).version, status: 'done' })
  await ack(completed.operationId)
  now = new Date(Date.parse(day.endAt) + 1000).toISOString()
  const historyQuery = { type: 'history' as const, horizon: 'day' as const, startDate: day.startDate, offset: 0, limit: 100 }
  assert.equal(readHistory(repo.store, historyQuery, now).rows.find(row => row.item.id === historicalItem)?.outcome, 'done')
  const beforeObservation = facts.summary({ type: 'executionSummary', itemId: historicalItem, generation: binding.localGeneration, cutoff: day.endAt }, now)
  assert.equal(beforeObservation.current.quality, 'complete')
  const genuineHistory = history()
  now = new Date(Date.parse(day.endAt) + 10000).toISOString()
  await absorb(foreign([{ t: 'item.status', id: historicalItem, status: 'todo', completedAt: null, cancelledAt: null }]))
  validate(); preserved(genuineHistory)
  assert.equal(readHistory(repo.store, historyQuery, now).rows.find(row => row.item.id === historicalItem)?.outcome, 'unknown')
  const inGap = facts.summary({ type: 'executionSummary', itemId: historicalItem, generation: binding.localGeneration, cutoff: day.endAt }, now)
  assert.equal(inGap.current.quality, 'unknown'); assert.notEqual(inGap.sourceRevision, beforeObservation.sourceRevision)
  const atObservation = facts.summary({ type: 'executionSummary', itemId: historicalItem, generation: binding.localGeneration, cutoff: now }, now)
  assert.equal(atObservation.current.quality, 'unknown')
  const after = new Date(Date.parse(now) + 1).toISOString()
  const afterObservation = facts.summary({ type: 'executionSummary', itemId: historicalItem, generation: binding.localGeneration, cutoff: after }, after)
  assert.equal(afterObservation.current.status, 'todo'); assert.equal(afterObservation.current.quality, 'complete')
  assert.equal(afterObservation.currentEpisode.quality, 'unknown'); assert.equal(afterObservation.currentPlacement.quality, 'unknown')
  assert.equal(afterObservation.placementDurations.day.quality, 'partial')
  assert(data.events.some(event => event.operationId === done.operationId && event.type === 'status_changed'))
  checks.push('Real period-end/history and execution queries invalidate cached inferred state across the gap, preserve actual local facts and keep observation episode/entry unknown')
  return checks
}

