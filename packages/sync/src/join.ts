/**
 * [INPUT]: Complete verified remote history, current local projection and confirmed join intent.
 * [OUTPUT]: Atomic identity-preserving first join or cursor-preserving resume; automatic joins can request a decision without writes.
 * [POS]: Shared join transaction. A cloud with task history, including seeded tombstones, is never considered new; complete zero-item seed can adopt an unsynced source; incomplete seed cannot replace local data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { parseSyncOp, syncOpPayload, type SyncOp } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import { applyRemoteBatch, applySyncOp, type ApplyHost, type RemoteEnvelope, type SqlDriver } from '@goalloom/store-core'
import { applyImportedBoard, bindWorkspace, captureVisibleBoard, clearProjection, syncCursor } from './board'
import { prepareFirstConnectionInTransaction } from './first-connection'
import { readSeedState, seedAssert, SeedIntegrityError, SyncApplyError } from '@goalloom/store-core'
import { SyncFailure } from './failure'

const metadataActions = new Set(['calendar.setup', 'policy.set', 'pref.set'])

/** A zero-item seed is pristine only after the ordinary applier proves its complete exact state. */
export function pristineHistory(ops: RemoteEnvelope[], validation?: { driver: SqlDriver; host: ApplyHost }): boolean {
  if (ops.every(entry => entry.op.actions.every(action => metadataActions.has(action.t)))) return true
  const begin = ops.find(entry => entry.seq === 1)?.op.actions[0]
  if (!validation || begin?.t !== 'seed.begin' || begin.manifest.counts.items !== 0
    || !ops.every(entry => entry.op.actions.every(action => metadataActions.has(action.t) || action.t.startsWith('seed.')))) return false
  try { for (const entry of ops) parseSyncOp(entry.op) } catch { return false }
  const { driver, host } = validation
  driver.exec('SAVEPOINT pristine_seed')
  try {
    clearProjection(driver, { workspaceId: 'pristine-probe', deviceId: 'pristine-probe', keyEpoch: 1 }, ops[0]!.op.at)
    applyRemoteBatch(driver, ops, host, ops[0]!.op.at)
    const state = readSeedState(driver, 'base')
    return state?.phase === 'complete' && state.manifest.counts.items === 0
      && !driver.prepare('SELECT 1 FROM base_items LIMIT 1').get()
      && !driver.prepare("SELECT 1 FROM canon_ops WHERE outcome<>'applied' LIMIT 1").get()
  } catch (error) {
    if (error instanceof SeedIntegrityError || error instanceof SyncApplyError && error.message === 'seq gap') return false
    throw error
  } finally {
    driver.exec('ROLLBACK TO pristine_seed'); driver.exec('RELEASE pristine_seed')
  }
}

export function joinPlan(driver: SqlDriver, workspaceId: string, ops: RemoteEnvelope[], host?: ApplyHost): 'resume' | 'automatic' | 'choose' {
  const state = driver.prepare('SELECT workspaceId,paused FROM sync_state WHERE id=1').get()
  if (state?.workspaceId === workspaceId && !state.paused) return 'resume'
  if (state?.paused) return 'choose'
  const known = new Set(ops.flatMap(entry => entry.op.actions.flatMap(action => action.t === 'item.create' ? [action.id]
    : action.t === 'seed.rows' ? action.records.flatMap(record => record.kind === 'item' ? [record.row.id] : []) : [])))
  const independent = captureVisibleBoard(driver).items.some(item => !item.deletedAt && !known.has(item.id))
  if (!independent) return 'automatic'
  return pristineHistory(ops, host ? { driver, host } : undefined) ? 'automatic' : 'choose'
}

export function installJoined(driver: SqlDriver, host: ApplyHost, input: {
  binding: { workspaceId: string; deviceId: string; keyEpoch: number }; ops: RemoteEnvelope[]; at: string; merge: boolean; automatic?: boolean; expectedGeneration?: string
}): 'installed' | 'resume' | 'choose' {
  return driver.transaction(() => {
    if (input.expectedGeneration && driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation !== input.expectedGeneration) {
      throw new SyncFailure('storage', 'workspace replaced during join')
    }
    const plan = joinPlan(driver, input.binding.workspaceId, input.ops, host)
    if (plan === 'resume') {
      applyRemoteBatch(driver, input.ops.filter(entry => entry.seq > syncCursor(driver)), host, input.at)
      bindWorkspace(driver, input.binding, input.at)
      return 'resume'
    }
    if (input.automatic && plan === 'choose') return 'choose'
    const captured = input.merge ? captureVisibleBoard(driver) : null
    const adoptCalendar = Boolean(captured?.calendar && captured.items.length && pristineHistory(input.ops, { driver, host }))
    const previous = driver.prepare('SELECT workspaceId FROM sync_state WHERE id=1').get()?.workspaceId
    let pending: SyncOp[] | null = null
    if (adoptCalendar && !previous) {
      pending = prepareFirstConnectionInTransaction(driver, host, input.binding.deviceId, input.at)
    }
    clearProjection(driver, input.binding, input.at)
    applyRemoteBatch(driver, input.ops, host, input.at)
    seedAssert(readSeedState(driver, 'base')?.phase !== 'loading', 'initialization_pending')
    if (pending) {
      const knownOps = new Set(input.ops.map(entry => entry.op.opId))
      for (const [index, op] of pending.filter(op => !knownOps.has(op.opId)).entries()) {
        applySyncOp(driver, op, 'visible', host)
        const payload = syncOpPayload(op)
        driver.prepare(`INSERT INTO sync_ops (opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,createdAt,updatedAt)
          VALUES (?,?,'local',1,?,?,?,?,'never_sent',?,?)`).run(op.opId, index + 1, payload, sha256Hex(payload), op.deviceId, op.at, input.at, input.at)
      }
    } else if (captured) applyImportedBoard(driver, host, captured, input.binding.deviceId, input.at, { preserveIds: true, adoptCalendar })
    return 'installed'
  })
}
