/**
 * [INPUT]: Sync commands from the main process. Opened ops cross this boundary only inside the app.
 * [OUTPUT]: Cursor, pending ops, merged rows and generation-bound read-only conflict comparisons. Network and workspace keys stay in the main process.
 * [POS]: Storage-worker adapter; scoped writes reject replaced workspaces.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import type { RemoteEnvelope } from '@goalloom/store-core'
import { enqueueSettings, readSettings, SyncApplyError, readActiveBinding, setActiveBinding, assertActiveBinding, advanceActiveBindingEpoch, readBindingEpochReceipt } from '@goalloom/store-core'
import {
  absorbOpened, acceptPushResults, bindWorkspace, captureVisibleBoard, conflictCount, installJoined, joinPlan, localLiveCount, prepareFirstConnection, queueVisibleBaseline,
  previewBindingTransition, commitBindingTransition, readBindingTransition, readSeedHandoff, retiredBindingSummary,
  stageImportedBoard, syncCursor, takePending, peekPending, markPending, type LocalBoard, type PendingPlain, type PushResultWire,
} from '@goalloom/sync'
import { bindingIdentitySchema } from '../../sync/binding-identity'
import { canonicalJson, initializationReceiptSchema } from '@goalloom/contracts'
import { syncHost } from '../../sync/host'
import { DomainError } from '../../../shared/contracts/commands'
import { BackupManager } from '../../storage/backup/manager'
import { Store } from '../../storage/store'
import { withGuidanceCheckpoint } from './provenance'
import { readSyncReviews } from './review'

const binding = z.strictObject({ workspaceId: z.uuid(), deviceId: z.uuid(), keyEpoch: z.number().int().positive() })
const pending = z.strictObject({ opId: z.uuid(), localOrder: z.number().int(), payload: z.string(), payloadHash: z.string() })
const opened = z.strictObject({ seq: z.number().int().positive(), op: z.unknown() })
const scope = z.strictObject({ workspaceId: z.uuid(), generation: z.uuid() })
const command = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('active-binding'), binding: bindingIdentitySchema.optional() }),
  z.strictObject({ type: z.literal('epoch-read'), requestId: z.uuid() }),
  z.strictObject({ type: z.literal('epoch-current'), binding: bindingIdentitySchema }),
  z.strictObject({ type: z.literal('epoch-advance'), expectedBinding: bindingIdentitySchema, nextEpoch: z.number().int().positive(), proof: z.strictObject({ requestId: z.uuid(), rosterHash: z.string().regex(/^[a-f0-9]{64}$/), contextDigest: z.string().regex(/^[a-f0-9]{64}$/), at: z.string() }) }),
  z.strictObject({ type: z.literal('transition-preview'), expectedBinding: bindingIdentitySchema.nullable(), expectedLocalGeneration: z.uuid() }),
  z.strictObject({ type: z.literal('transition-commit'), input: z.strictObject({ requestId: z.uuid(), initializationRequestId: z.uuid(), expectedBinding: bindingIdentitySchema.nullable(), newBinding: bindingIdentitySchema, expectedLocalGeneration: z.uuid(), expectedRevision: z.number().int().nonnegative(), expectedSourceDigest: z.string(), seedId: z.uuid(), finalOpId: z.uuid(), protectedContextRef: z.string().nullable(), newProtectedContextRef: z.string(), at: z.string() }) }),
  z.strictObject({ type: z.literal('transition-read'), requestId: z.uuid() }),
  z.strictObject({ type: z.literal('seed-handoff'), expectedBinding: bindingIdentitySchema }),
  z.strictObject({ type: z.literal('seed-finished'), expectedBinding: bindingIdentitySchema, receipt: initializationReceiptSchema }),
  z.strictObject({ type: z.literal('retired-summary') }),
  z.strictObject({ type: z.literal('view') }),
  z.strictObject({ type: z.literal('production-transition'), at: z.string() }),
  z.strictObject({ type: z.literal('reviews'), generation: z.uuid(), at: z.string() }),
  z.strictObject({ type: z.literal('capture') }),
  z.strictObject({ type: z.literal('bind'), binding, at: z.string() }),
  z.strictObject({ type: z.literal('baseline'), deviceId: z.uuid(), at: z.string() }),
  z.strictObject({ type: z.literal('rebaseline'), deviceId: z.uuid(), at: z.string() }),
  z.strictObject({ type: z.literal('recover-bind'), binding, at: z.string(), expectedGeneration: z.uuid() }),
  z.strictObject({ type: z.literal('peek'), unknownOnly: z.boolean().optional() }),
  z.strictObject({ type: z.literal('mark'), ids: z.array(z.uuid()).min(1).max(200), at: z.string(), attemptId: z.uuid(), scope }),
  z.strictObject({ type: z.literal('take'), at: z.string(), attemptId: z.uuid() }),
  z.strictObject({ type: z.literal('accept'), scope: scope.optional(), pending: z.array(pending), results: z.array(z.strictObject({
    opId: z.uuid(), seq: z.number().int().positive().optional(), duplicate: z.boolean().optional(), error: z.string().optional(),
  })), at: z.string() }),
  z.strictObject({ type: z.literal('absorb'), scope: scope.optional(), ops: z.array(opened), at: z.string() }),
  z.strictObject({ type: z.literal('join-plan'), workspaceId: z.uuid(), ops: z.array(opened) }),
  z.strictObject({ type: z.literal('install'), binding, sourceBinding: bindingIdentitySchema, ops: z.array(opened), at: z.string(), merge: z.boolean(), automatic: z.boolean().optional(), expectedGeneration: z.uuid().optional() }),
  z.strictObject({ type: z.literal('import'), deviceId: z.uuid(), board: z.unknown(), at: z.string() }),
  z.strictObject({ type: z.literal('hold'), closed: z.boolean() }),
  z.strictObject({ type: z.literal('protect'), at: z.string() }),
  z.strictObject({ type: z.literal('pause'), reason: z.string().max(40).nullable(), at: z.string() }),
  z.strictObject({
    type: z.literal('emit-settings'),
    opId: z.uuid(),
    at: z.string().min(20).max(40),
    mode: z.enum(['change', 'seed']),
    entries: z.array(z.strictObject({ key: z.string().min(1).max(80), value: z.unknown() })).min(1).max(40),
  }),
  z.strictObject({ type: z.literal('settings') }),
])

export async function protectSyncBackup(db: DatabaseSync, directory: string, now: string): Promise<string> {
  const manager = new BackupManager(db, directory)
  const record = await manager.create('protective', new Store(db).workspace(), now)
  await manager.verify(record)
  return record.id
}

export async function runSyncLocal(db: DatabaseSync, argument: unknown, hooks?: {
  hold?: (closed: boolean) => void
  protect?: () => Promise<string>
}): Promise<unknown> {
  const ownGuard = ['transition-preview', 'seed-handoff', 'seed-finished', 'epoch-advance'].includes(String((argument as { type?: unknown })?.type))
  const guarded = ownGuard ? {} : z.object({ expectedBinding: bindingIdentitySchema.optional() }).parse(argument)
  const action = command.parse(!ownGuard && guarded.expectedBinding ? Object.fromEntries(Object.entries(argument as object).filter(([key]) => key !== 'expectedBinding')) : argument)
  const driver = nodeSqlDriver(db)
  const host = syncHost(db)
  const currentBinding = readActiveBinding(driver)
  const protectedTypes = ['peek', 'mark', 'take', 'accept', 'absorb', 'install', 'bind', 'baseline', 'rebaseline', 'recover-bind', 'pause', 'settings', 'emit-settings']
  if (currentBinding && protectedTypes.includes(action.type)) {
    if (!guarded.expectedBinding) throw new DomainError('conflict', 'sync binding required')
    assertActiveBinding(driver, guarded.expectedBinding)
  } else if (guarded.expectedBinding && !ownGuard) assertActiveBinding(driver, guarded.expectedBinding)
  if (action.type === 'active-binding') {
    if (action.binding) setActiveBinding(driver, action.binding)
    return readActiveBinding(driver)
  }
  if (action.type === 'epoch-read') return readBindingEpochReceipt(driver, action.requestId)
  if (action.type === 'epoch-current') {
    assertActiveBinding(driver, action.binding)
    const row = db.prepare('SELECT requestId FROM sync_binding_epoch_receipts WHERE bindingToken=? AND toEpoch=?').get(action.binding.bindingToken, action.binding.keyEpoch)
    return row ? readBindingEpochReceipt(driver, String(row.requestId)) : null
  }
  if (action.type === 'epoch-advance') return advanceActiveBindingEpoch(driver, action.expectedBinding, action.nextEpoch, action.proof)
  if (action.type === 'transition-preview') return { ...previewBindingTransition(driver, host, action), delivery: { unknown: Number(db.prepare("SELECT count(*) AS n FROM sync_ops WHERE origin='local' AND state='send_unknown'").get()?.n ?? 0) } }
  if (action.type === 'transition-commit') return commitBindingTransition(driver, host, action.input)
  if (action.type === 'transition-read') return readBindingTransition(driver, action.requestId)
  if (action.type === 'seed-handoff') return readSeedHandoff(driver, action.expectedBinding)
  if (action.type === 'retired-summary') return retiredBindingSummary(driver)
  if (action.type === 'seed-finished') {
    assertActiveBinding(driver, action.expectedBinding)
    const handoff = readSeedHandoff(driver, action.expectedBinding), r = action.receipt
    if (!handoff?.canonicalVerified || handoff.requestId !== r.requestId || handoff.target.workspaceId !== r.target.workspaceId || handoff.target.generation !== r.target.generation || handoff.finalOpId !== r.finalOpId || handoff.finalPayloadHash !== r.finalPayloadHash || handoff.finalSeq !== r.finalSeq) throw new DomainError('conflict', 'initialization receipt mismatch')
    driver.prepare('INSERT INTO sync_initialization_ack(bindingToken,requestId,receipt) VALUES (?,?,?) ON CONFLICT(bindingToken) DO NOTHING').run(action.expectedBinding.bindingToken, r.requestId, JSON.stringify(r))
    return null
  }
  const handoff = currentBinding ? readSeedHandoff(driver, currentBinding) : null
  const finalOrder = handoff && !db.prepare('SELECT 1 FROM sync_initialization_ack WHERE bindingToken=?').get(currentBinding!.bindingToken)
    ? Number(db.prepare('SELECT localOrder FROM sync_ops WHERE opId=?').get(handoff.finalOpId)?.localOrder ?? 0) : null
  const limitPending = <T extends { localOrder: number }>(rows: T[]) => finalOrder === null ? rows : rows.filter(row => row.localOrder <= finalOrder)
  if (action.type === 'mark' && finalOrder !== null && action.ids.some(id => Number(db.prepare('SELECT localOrder FROM sync_ops WHERE opId=?').get(id)?.localOrder ?? Infinity) > finalOrder)) throw new DomainError('conflict', 'initialization pending')

  if (action.type === 'production-transition') {
    const unknownSends = Number(db.prepare("SELECT count(*) AS n FROM sync_ops WHERE state='send_unknown'").get()?.n ?? 0)
    const bound = db.prepare('SELECT workspaceId FROM sync_state WHERE id=1').get()?.workspaceId
    const sent = db.prepare("SELECT 1 FROM sync_ops WHERE state NOT IN ('never_sent','reverted_local') LIMIT 1").get()
    if (!bound && !sent) return { unknownSends: 0, oldReceiptsNotReconciled: false, baselineRebuilt: false }
    const deviceId = randomUUID()
    driver.transaction(() => {
      const nested = { ...driver, transaction: <T>(work: () => T): T => work() }
      queueVisibleBaseline(nested, host, deviceId, action.at)
      db.prepare('UPDATE sync_state SET workspaceId=NULL, deviceId=NULL, keyEpoch=NULL WHERE id=1').run()
    })
    return { unknownSends, oldReceiptsNotReconciled: unknownSends > 0, baselineRebuilt: true }
  }
  if ('scope' in action && action.scope) {
    const current = db.prepare('SELECT s.workspaceId, w.generation FROM sync_state s CROSS JOIN workspace w WHERE s.id=1 AND w.id=1').get()
    if (current?.workspaceId !== action.scope.workspaceId || current?.generation !== action.scope.generation) throw new DomainError('invalid', 'sync generation')
  }
  if (action.type === 'view') {
    const state = db.prepare('SELECT workspaceId, deviceId, keyEpoch, paused FROM sync_state WHERE id=1').get()
    return {
      initializing: finalOrder !== null,
      workspaceId: state?.workspaceId ? String(state.workspaceId) : null,
      deviceId: state?.deviceId ? String(state.deviceId) : null,
      generation: String(db.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation ?? ''),
      keyEpoch: state?.keyEpoch === null || state?.keyEpoch === undefined ? null : Number(state.keyEpoch),
      paused: state?.paused ? String(state.paused) : null,
      lastAppliedSeq: syncCursor(driver),
      pending: Number(db.prepare(`SELECT count(*) AS n FROM sync_ops WHERE origin='local' AND state IN ('never_sent','send_unknown','accepted')`).get()?.n ?? 0),
      conflicts: conflictCount(driver),
      localItems: localLiveCount(driver),
      hasTaskHistory: Boolean(db.prepare('SELECT 1 FROM items LIMIT 1').get() || db.prepare("SELECT 1 FROM canon_changes WHERE dim='create' LIMIT 1").get()),
    }
  }
  if (action.type === 'capture') return captureVisibleBoard(driver)
  if (action.type === 'reviews') return readSyncReviews(db, action.generation, action.at)
  if (action.type === 'bind') { bindWorkspace(driver, action.binding, action.at); return null }
  if (action.type === 'baseline') { prepareFirstConnection(driver, host, action.deviceId, action.at); return null }
  if (action.type === 'rebaseline') return queueVisibleBaseline(driver, host, action.deviceId, action.at)
  if (action.type === 'recover-bind') {
    const generation = String(db.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation ?? '')
    if (generation !== action.expectedGeneration) throw new DomainError('generation', 'sync generation')
    const current = db.prepare('SELECT workspaceId FROM sync_state WHERE id=1').get()?.workspaceId
    if (current === action.binding.workspaceId) return null
    return queueVisibleBaseline(driver, host, action.binding.deviceId, action.at, action.binding)
  }
  if (action.type === 'peek') return limitPending(peekPending(driver, action.unknownOnly))
  if (action.type === 'mark') {
    try { markPending(driver, action.ids, action.at, action.attemptId); return true }
    catch (error) {
      if (error instanceof SyncApplyError && error.message === 'send transition rejected') return false
      throw error
    }
  }
  if (action.type === 'take') { if (finalOrder !== null) throw new DomainError('conflict', 'use guarded seed selection'); return takePending(driver, action.at, action.attemptId) }
  if (action.type === 'accept') {
    return withGuidanceCheckpoint(db, { binding: currentBinding, cause: 'receipt', at: action.at }, nested => acceptPushResults(nested, action.pending as PendingPlain[], action.results.map(result => {
      const wire: PushResultWire = { opId: result.opId }
      if (result.seq !== undefined) wire.seq = result.seq
      if (result.duplicate !== undefined) wire.duplicate = result.duplicate
      if (result.error !== undefined) wire.error = result.error
      return wire
    }), action.at))
  }
  if (action.type === 'absorb') return withGuidanceCheckpoint(db, { binding: currentBinding, cause: 'absorb', at: action.at }, nested => absorbOpened(nested, host, action.ops as RemoteEnvelope[], action.at))
  if (action.type === 'join-plan') return joinPlan(driver, action.workspaceId, action.ops as RemoteEnvelope[], host)
  if (action.type === 'install') {
    const source = action.sourceBinding
    if (source.workspaceId !== action.binding.workspaceId || source.deviceId !== action.binding.deviceId || source.keyEpoch !== action.binding.keyEpoch
      || source.localGeneration !== action.expectedGeneration || currentBinding && canonicalJson(currentBinding) !== canonicalJson(source)) throw new DomainError('conflict', 'sync source binding')
    return withGuidanceCheckpoint(db, { binding: source, cause: 'install', at: action.at }, nested => {
      const result = installJoined(nested, host, {
        binding: action.binding, ops: action.ops as RemoteEnvelope[], at: action.at, merge: action.merge,
        ...(action.automatic !== undefined ? { automatic: action.automatic } : {}),
        ...(action.expectedGeneration ? { expectedGeneration: action.expectedGeneration } : {}),
      })
      if (result !== 'choose') setActiveBinding(nested, source)
      return result
    })
  }
  if (action.type === 'hold') { hooks?.hold?.(action.closed); return null }
  if (action.type === 'protect') {
    if (!hooks?.protect) throw new DomainError('backup', 'backup')
    return hooks.protect()
  }
  if (action.type === 'import') return stageImportedBoard(driver, host, action.board as LocalBoard, action.deviceId, action.at)
  if (action.type === 'pause') {
    driver.prepare('UPDATE sync_state SET paused=?, updatedAt=? WHERE id=1').run(action.reason, action.at)
    return null
  }
  if (action.type === 'settings') return readSettings(driver)
  if (action.type === 'emit-settings') {
    const state = db.prepare('SELECT deviceId FROM sync_state WHERE id=1').get()
    try {
      return enqueueSettings(driver, {
        opId: action.opId, deviceId: state?.deviceId ? String(state.deviceId) : 'local', at: action.at,
        entries: action.entries, onlyAbsent: action.mode === 'seed',
      }) !== null
    } catch { throw new DomainError('invalid', 'setting') }
  }
  throw new DomainError('invalid', 'sync')
}
