/**
 * [INPUT]: An authenticated binding, verified roster, scoped storage and bounded remote.
 * [OUTPUT]: One read-first page/batch turn; awaited post-apply projection before uploads, independent receipt and upload recovery.
 * [POS]: Desktop exchange policy. Scheduling and account lifecycle belong to SyncService.
 */
import { openOpWire, planPushBatches, restorePendingSecrets, sealPending, SyncFailure, type PendingPlain, type SyncHead, type SyncRemote } from '@goalloom/sync'
import type { PendingCache } from './pending-cache'
import { redactSyncOp, type RemoteEnvelope } from '@goalloom/store-core'
import { recoverUnknownReceipts } from './receipt-recovery'

export interface LocalView {
  workspaceId: string | null; deviceId: string | null; generation: string; keyEpoch: number | null
  paused: string | null; lastAppliedSeq: number; pending: number; conflicts: number; localItems: number
  initializing?: boolean
  hasTaskHistory?: boolean
}

export interface ExchangeState {
  uploadRetryAt: number
  uploadFailures: number
  receiptRetryAt: number
  receiptFailed: boolean
  verifyRoster: boolean
  uploadReason: 'quota' | 'network'
}

const sharedFailure = (error: unknown) => error instanceof SyncFailure && !['network', 'timeout', 'rate_limited'].includes(error.code)

export async function exchangeTurn(input: {
  remote: SyncRemote
  signal: AbortSignal
  cache: PendingCache
  account: string
  binding: () => { workspaceId: string; generation: string; deviceId: string; workspaceKey: Uint8Array; journalKey?: Uint8Array; epoch: number; rosterVersion: number; context?: string }
  view: () => Promise<LocalView>
  storage: <T>(command: unknown) => Promise<T>
  finishSeed?: () => Promise<void>
  followRoster: () => Promise<void>
  lookup: () => Promise<(key: string) => string | null | undefined>
  deliver: (ops: RemoteEnvelope[]) => Promise<void>
  applied: () => void | Promise<void>
  busy: () => void
  check: () => void
  at: () => string
  now: () => number
  cooldown: () => Promise<void>
  remaining: () => number
  random: () => number
}, state: ExchangeState): Promise<{ more: boolean; sendable: boolean }> {
  let binding = input.binding()
  let view = await input.view()
  input.check()
  if (view.paused || view.workspaceId !== binding.workspaceId) throw new SyncFailure('mismatch')
  const scope = { workspaceId: binding.workspaceId, generation: view.generation }
  const save = async <T>(command: object): Promise<T> => { input.check(); return input.storage<T>({ ...command, scope }) }
  let receiptBlocked = state.receiptFailed
  let recoveredSeq = 0
  let confirmed: string[] = []
  if (state.receiptRetryAt <= input.now() && input.remaining() >= 5_000) {
    try {
      const recovered = await recoverUnknownReceipts({ remote: input.remote, workspaceId: binding.workspaceId,
        deviceId: binding.deviceId, generation: view.generation, signal: input.signal, storage: input.storage, at: input.at, check: input.check })
      recoveredSeq = recovered.maxSeq; confirmed = recovered.confirmed
      state.receiptRetryAt = recovered.queried ? input.now() + 5_000 : 0
      state.receiptFailed = false; receiptBlocked = false
    } catch (error) {
      input.check()
      if (sharedFailure(error)) throw error
      state.receiptRetryAt = input.now() + 8_000
      state.receiptFailed = true; receiptBlocked = true
    }
  }
  // Receipt recovery is reachable even when ordinary service access has ended.
  const head: SyncHead = await input.remote.getSyncStatus(binding.workspaceId, binding.deviceId)
  input.check()
  if (head.generation !== binding.generation || head.headSeq < view.lastAppliedSeq) throw new SyncFailure('mismatch')
  if (head.minProtocolRead > 1 || head.minProtocolWrite > 1) throw new SyncFailure('version')
  if (view.lastAppliedSeq < head.minRetainedSeq) throw new SyncFailure('version', 'missing operations')
  if (state.verifyRoster || head.rosterVersion !== binding.rosterVersion || head.keyEpoch !== binding.epoch) {
    await input.followRoster(); input.check(); binding = input.binding()
    if (binding.epoch !== head.keyEpoch || binding.rosterVersion !== head.rosterVersion) throw new SyncFailure('key')
    state.verifyRoster = false
  }
  await input.cache.open(binding.context ?? `${input.account}|${binding.workspaceId}|${view.generation}`, input.signal, binding.journalKey ?? binding.workspaceKey)
  if (confirmed.length) await input.cache.forget(confirmed)
  const lookup = view.pending ? await input.lookup() : () => undefined
  input.check()
  const target = Math.max(head.headSeq, recoveredSeq)
  const unknown = restorePendingSecrets(input.cache.restore(await input.storage<PendingPlain[]>({ type: 'peek', unknownOnly: true }), true), lookup).rows
  // A failed upload can never gate this path. Own receipts do not advance the apply cursor.
  let more = false
  if (target > view.lastAppliedSeq) {
    if (input.remaining() < 15_000) return { more: true, sendable: false }
    input.busy()
    const rows = await input.remote.pullOps({ workspaceId: binding.workspaceId, deviceId: binding.deviceId, after: view.lastAppliedSeq, limit: 200 })
    input.check()
    if (!rows.length) throw new SyncFailure('configuration', 'missing operation page')
    const opened = rows.map(row => ({ seq: row.seq, op: openOpWire(row, binding) }))
    await input.deliver(opened); input.check()
    const applied = Number(await save({ type: 'absorb', ops: opened.map(row => ({ ...row, op: redactSyncOp(row.op) })), at: input.at() }) ?? 0)
    input.check()
    await input.cache.forget(opened.map(row => row.op.opId))
    if (applied) { await input.applied(); input.check() }
    view = await input.view(); input.check()
    more = view.lastAppliedSeq < target
  }
  await input.finishSeed?.(); input.check()
  const queued = await input.storage<PendingPlain[]>({ type: 'peek' })
  input.check()
  await input.cache.retain(queued.map(row => row.opId))
  const pending = restorePendingSecrets(input.cache.restore(queued), lookup)
  input.check()
  const cooling = state.uploadRetryAt > input.now()
  if (!cooling && !receiptBlocked && pending.rows.length) {
    if (input.remaining() < 30_000) return { more: true, sendable: true }
    const sealed = sealPending(pending.rows, binding)
    const ids = planPushBatches(sealed.map(row => ({ opId: row.opId, localOrder: row.localOrder, bytes: row.wire.ciphertext.length / 2, blobReady: true })))[0] ?? []
    if (ids.length) {
      input.busy()
      await input.cache.remember(pending.rows.filter(row => ids.includes(row.opId)))
      input.check()
      const marked = await save<boolean>({ type: 'mark', ids, at: input.at(), attemptId: globalThis.crypto.randomUUID() })
      if (marked === false) {
        await input.cache.forget(ids.filter(id => !unknown.some(row => row.opId === id)))
        return { more: true, sendable: false }
      }
      input.check()
      try {
        const results = await input.remote.pushOps({ workspaceId: binding.workspaceId, deviceId: binding.deviceId, generation: binding.generation, ops: ids.map(id => sealed.find(row => row.opId === id)!.wire) })
        input.check()
        const held = await save<string | null>({ type: 'accept', pending: pending.rows, results, at: input.at() })
        input.check()
        await input.cache.forget(results.filter(row => !row.error).map(row => row.opId))
        if (held) throw new SyncFailure(held === 'stale_epoch' ? 'key' : 'rejected', held)
        state.uploadFailures = 0; state.uploadRetryAt = 0
        await input.cooldown()
        more = true
      } catch (error) {
        input.check()
        if (sharedFailure(error)) throw error
        const delay = [8_000, 16_000, 32_000, 60_000][Math.min(state.uploadFailures++, 3)]! * (0.9 + input.random() * 0.1)
        state.uploadReason = error instanceof SyncFailure && error.code === 'rate_limited' ? 'quota' : 'network'
        state.uploadRetryAt = input.now() + Math.max(delay, error instanceof SyncFailure && error.retryAt ? error.retryAt - Date.now() : 0)
        await input.cooldown()
      }
    }
  }
  await input.view(); input.check()
  return { more, sendable: pending.rows.length > 0 && !receiptBlocked && state.uploadRetryAt <= input.now() }
}
