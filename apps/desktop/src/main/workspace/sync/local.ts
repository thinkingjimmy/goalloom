/**
 * [INPUT]: Sync commands from the main process. Opened ops cross this boundary only inside the app.
 * [OUTPUT]: Cursor, pending ops, and merged rows. Network and workspace keys stay in the main process.
 * [POS]: Storage-worker adapter over the shared sync engine.
 */
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import type { RemoteEnvelope } from '@goalloom/store-core'
import { enqueueSettings, readSettings } from '@goalloom/store-core'
import {
  absorbOpened, acceptPushResults, bindWorkspace, captureVisibleBoard, conflictCount, installJoined, localLiveCount, queueBaseline, queueVisibleBaseline,
  stageImportedBoard, syncCursor, takePending, type LocalBoard, type PendingPlain, type PushResultWire,
} from '@goalloom/sync'
import { syncHost } from '../../sync/host'
import { DomainError } from '../../../shared/contracts/commands'
import { BackupManager } from '../../storage/backup/manager'
import { Store } from '../../storage/store'

const binding = z.strictObject({ workspaceId: z.uuid(), deviceId: z.uuid(), keyEpoch: z.number().int().positive() })
const pending = z.strictObject({ opId: z.uuid(), localOrder: z.number().int(), payload: z.string(), payloadHash: z.string() })
const opened = z.strictObject({ seq: z.number().int().positive(), op: z.unknown() })
const command = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('view') }),
  z.strictObject({ type: z.literal('capture') }),
  z.strictObject({ type: z.literal('bind'), binding, at: z.string() }),
  z.strictObject({ type: z.literal('baseline'), deviceId: z.uuid(), at: z.string() }),
  z.strictObject({ type: z.literal('rebaseline'), deviceId: z.uuid(), at: z.string() }),
  z.strictObject({ type: z.literal('take'), at: z.string(), attemptId: z.uuid() }),
  z.strictObject({ type: z.literal('accept'), pending: z.array(pending), results: z.array(z.strictObject({
    opId: z.uuid(), seq: z.number().int().positive().optional(), duplicate: z.boolean().optional(), error: z.string().optional(),
  })), at: z.string() }),
  z.strictObject({ type: z.literal('absorb'), ops: z.array(opened), at: z.string() }),
  z.strictObject({ type: z.literal('install'), binding, ops: z.array(opened), at: z.string(), merge: z.boolean() }),
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
  const action = command.parse(argument)
  const driver = nodeSqlDriver(db)
  const host = syncHost(db)
  if (action.type === 'view') {
    const state = db.prepare('SELECT workspaceId, deviceId, keyEpoch, paused FROM sync_state WHERE id=1').get()
    return {
      workspaceId: state?.workspaceId ? String(state.workspaceId) : null,
      deviceId: state?.deviceId ? String(state.deviceId) : null,
      generation: String(db.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation ?? ''),
      keyEpoch: state?.keyEpoch === null || state?.keyEpoch === undefined ? null : Number(state.keyEpoch),
      paused: state?.paused ? String(state.paused) : null,
      lastAppliedSeq: syncCursor(driver),
      pending: Number(db.prepare(`SELECT count(*) AS n FROM sync_ops WHERE origin='local' AND state IN ('never_sent','send_unknown','accepted')`).get()?.n ?? 0),
      conflicts: conflictCount(driver),
      localItems: localLiveCount(driver),
    }
  }
  if (action.type === 'capture') return captureVisibleBoard(driver)
  if (action.type === 'bind') { bindWorkspace(driver, action.binding, action.at); return null }
  if (action.type === 'baseline') return queueBaseline(driver, host, action.deviceId, action.at)
  if (action.type === 'rebaseline') return queueVisibleBaseline(driver, host, action.deviceId, action.at)
  if (action.type === 'take') return takePending(driver, action.at, action.attemptId)
  if (action.type === 'accept') {
    return acceptPushResults(driver, action.pending as PendingPlain[], action.results.map(result => {
      const wire: PushResultWire = { opId: result.opId }
      if (result.seq !== undefined) wire.seq = result.seq
      if (result.duplicate !== undefined) wire.duplicate = result.duplicate
      if (result.error !== undefined) wire.error = result.error
      return wire
    }), action.at)
  }
  if (action.type === 'absorb') return absorbOpened(driver, host, action.ops as RemoteEnvelope[], action.at)
  if (action.type === 'install') {
    installJoined(driver, host, { binding: action.binding, ops: action.ops as RemoteEnvelope[], at: action.at, merge: action.merge })
    return null
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
