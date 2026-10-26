/**
 * [INPUT]: A Supabase project URL, the anon key, and a fresh access token.
 * [OUTPUT]: SyncRemote over PostgREST RPC. Ciphertext stays opaque.
 * [POS]: Shared cancellable HTTP adapter. OAuth stays in the desktop shell.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createCloudRemote } from './cloud-remote'
import { hex } from '@goalloom/crypto'
import { cloudServiceHeaders } from '@goalloom/contracts'
import { isServiceFailureCode, SyncFailure } from './failure'
import { boundedRequest, requestLimits, syncClock, type RequestOptions, type SyncClock } from './request'
import type { AccountView, CheckpointWire, EnvelopeWire, PullWire, PushResultWire, RecoveryChallenge, ReceiptWire, RosterWire, SyncHead, SyncRemote } from './remote'

function field(row: unknown, camel: string, snake: string): unknown {
  if (!row || typeof row !== 'object') return undefined
  const record = row as Record<string, unknown>
  return record[camel] ?? record[snake]
}

function pushResults(rows: unknown): PushResultWire[] {
  if (!Array.isArray(rows)) throw new SyncFailure('configuration')
  return rows.map(row => {
    const result: PushResultWire = { opId: String(field(row, 'opId', 'op_id') ?? '') }
    const seq = field(row, 'seq', 'seq')
    const duplicate = field(row, 'duplicate', 'duplicate')
    const error = field(row, 'error', 'error')
    if (seq !== undefined && seq !== null) result.seq = Number(seq)
    if (typeof duplicate === 'boolean') result.duplicate = duplicate
    if (typeof error === 'string') result.error = error
    return result
  })
}

function pullRows(rows: unknown): PullWire[] {
  if (!Array.isArray(rows)) throw new SyncFailure('configuration')
  return rows.map(row => ({
    seq: Number(field(row, 'seq', 'seq')),
    opId: String(field(row, 'opId', 'op_id') ?? ''),
    payloadHash: String(field(row, 'payloadHash', 'payload_hash') ?? ''),
    formatVersion: Number(field(row, 'formatVersion', 'format_version')),
    keyEpoch: Number(field(row, 'keyEpoch', 'key_epoch')),
    ciphertext: String(field(row, 'ciphertext', 'ciphertext') ?? ''),
  }))
}

export function createFetchRemote(input: {
  url: string; anonKey: string; accessToken: () => Promise<string>
  signal?: () => AbortSignal; clock?: SyncClock
}): SyncRemote {
  const call = <T>(name: string, body: Record<string, unknown>, options?: RequestOptions): Promise<T> => {
    const read = ['get_sync_status', 'receipts_for', 'pull_ops', 'get_roster', 'get_key_envelopes', 'get_latest_checkpoint', 'list_account'].includes(name)
    const ms = ['get_sync_status', 'receipts_for'].includes(name) ? requestLimits.status
      : name === 'pull_ops' ? requestLimits.pull : read ? requestLimits.metadata : requestLimits.write
    return boundedRequest({ ms, clock: input.clock ?? syncClock, signals: [options?.signal, input.signal?.()] }, async signal => {
      let token: string
      try { token = await input.accessToken() }
      catch { signal.throwIfAborted(); throw new SyncFailure('auth') }
      signal.throwIfAborted()
      let response: Response
      let text: string
      try {
        response = await fetch(`${input.url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
          method: 'POST', signal,
          headers: { apikey: input.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...cloudServiceHeaders },
          redirect: 'error',
          body: JSON.stringify(body),
        })
        text = await response.text()
      } catch { signal.throwIfAborted(); throw new SyncFailure('network') }
      signal.throwIfAborted()
      if (!response.ok) {
        let detail: { message?: string; code?: string; details?: string } = {}
        try { detail = JSON.parse(text) } catch { /* HTTP status still classifies a non-JSON failure. */ }
        const message = detail.message ?? `rpc ${response.status}`
        if (message === 'initialization_pending' || message === 'initialization_conflict') throw new SyncFailure(message)
        if (isServiceFailureCode(message)) throw new SyncFailure(message)
        if (response.status >= 500) throw new SyncFailure('network')
        if (message.includes('rate_limited') || response.status === 429) {
          let rate: { retryAt?: number; scope?: string } = {}
          try { rate = JSON.parse(detail.details ?? '{}') } catch { /* Use a bounded retry when no hint is supplied. */ }
          const hinted = Number(rate.retryAt)
          const header = Number(response.headers.get('retry-after'))
          const retryAt = Number.isSafeInteger(hinted) && hinted > Date.now() && hinted <= Date.now() + 7 * 86_400_000 ? hinted : Date.now() + (header > 0 && header <= 604800 ? header * 1000 : 60_000)
          throw new SyncFailure('rate_limited', 'rate_limited', retryAt, read ? 'read' : 'upload')
        }
        if (response.status === 401 || detail.code === '42501' || message.includes('not authenticated') || message.includes('device not bound')) throw new SyncFailure('auth', message)
        if (detail.code === 'PGRST202' || response.status === 404) throw new SyncFailure('configuration')
        if (message.includes('workspace exists')) throw new SyncFailure('rejected', 'workspace exists')
        throw new SyncFailure('rejected', message)
      }
      try { return (text ? JSON.parse(text) : null) as T }
      catch { throw new SyncFailure('configuration') }
    })
  }
  const bytea = (bytes: Uint8Array) => `\\x${hex(bytes)}`
  return {
    finishInitialization: (value, options) => createCloudRemote(input).finishInitialization(value, options),
    registerDevice: (input, options) => call<string>('register_device', {
      p_name: input.name.slice(0, 64), p_platform: input.platform, p_sign_pub: bytea(input.signPub), p_box_pub: bytea(input.boxPub), p_protocol: 1,
    }, options),
    rebindDevice: (deviceId, message, signature, options) => call<void>('rebind_device', { p_device: deviceId, p_message: bytea(message), p_signature: bytea(signature) }, options),
    account: options => call<AccountView | null>('list_account', options?.workspaceId ? { p_workspace: options.workspaceId } : {}, options),
    bootstrap: (input, options) => call<void>(input.createNew ? 'create_new_workspace' : 'bootstrap_workspace', {
      p_device: input.deviceId, p_workspace: input.workspaceId, p_generation: input.generation, p_roster: input.roster,
      p_roster_hash: input.rosterHash, p_roster_sig: bytea(input.rosterSig), p_checkpoint: input.checkpoint,
      p_rec_sig: bytea(input.recSig), p_dev_sig: bytea(input.devSig),
      ...(input.initialization ? { p_initialization: input.initialization } : {}),
    }, options),
    putEnvelopes: (workspaceId, deviceId, envelopes, options) => call<void>('put_key_envelopes', { p_workspace: workspaceId, p_device: deviceId, p_envelopes: envelopes }, options),
    getEnvelopes: (workspaceId, deviceId, options) => call<EnvelopeWire[]>('get_key_envelopes', { p_workspace: workspaceId, p_device: deviceId }, options).then(rows => rows ?? []),
    getCheckpoint: (workspaceId, deviceId, options) => call<CheckpointWire | null>('get_latest_checkpoint', { p_workspace: workspaceId, p_device: deviceId }, options),
    getRoster: (workspaceId, deviceId, options) => call<RosterWire[]>('get_roster', { p_workspace: workspaceId, p_device: deviceId }, options).then(rows => rows ?? []),
    getSyncStatus: async (workspaceId, deviceId, options) => {
      const value = await call<SyncHead>('get_sync_status', { p_workspace: workspaceId, p_device: deviceId }, options)
      const numbers = ['headSeq', 'rosterVersion', 'keyEpoch', 'minRetainedSeq', 'minProtocolRead', 'minProtocolWrite'] as const
      if (!value || value.workspaceId !== workspaceId || typeof value.generation !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.generation)
        || numbers.some(key => !Number.isSafeInteger(value[key]) || value[key] < (key === 'headSeq' || key === 'minRetainedSeq' ? 0 : 1))) throw new SyncFailure('configuration')
      return value
    },
    receiptsFor: async (workspaceId, deviceId, operations, options) => {
      const opIds = operations.map(row => row.opId)
      if (operations.length > 200 || new Set(opIds).size !== opIds.length || operations.some(row => !/^[a-f0-9]{64}$/.test(row.payloadHash))) throw new SyncFailure('configuration')
      const rows = await call<unknown[]>('receipts_for', { p_workspace: workspaceId, p_device: deviceId, p_op_ids: opIds, p_payload_hashes: operations.map(row => row.payloadHash) }, options)
      if (!Array.isArray(rows) || rows.length > operations.length) throw new SyncFailure('configuration')
      const seen = new Set<string>()
      return rows.map(row => {
        const receipt: ReceiptWire = { opId: String(field(row, 'opId', 'op_id') ?? ''), payloadHash: String(field(row, 'payloadHash', 'payload_hash') ?? ''), seq: Number(field(row, 'seq', 'seq')) }
        if (operations.find(row => row.opId === receipt.opId)?.payloadHash !== receipt.payloadHash || seen.has(receipt.opId) || !/^[a-f0-9]{64}$/.test(receipt.payloadHash) || !Number.isSafeInteger(receipt.seq) || receipt.seq < 1) throw new SyncFailure('configuration')
        seen.add(receipt.opId)
        return receipt
      })
    },
    startRecovery: (workspaceId, deviceId, options) => call<RecoveryChallenge>('start_recovery', { p_workspace: workspaceId, p_device: deviceId }, options),
    completeRecovery: (input, options) => call<void>('complete_recovery', {
      p_workspace: input.workspaceId, p_device: input.deviceId, p_challenge: input.challengeId, p_signature: bytea(input.signature),
      p_roster: input.roster, p_body_hash: input.bodyHash, p_roster_sig: bytea(input.rosterSig),
    }, options),
    pushOps: (input, options) => call<unknown[]>('push_ops', {
      p_workspace: input.workspaceId, p_device: input.deviceId, p_generation: input.generation,
      p_ops: input.ops.map(op => ({ op_id: op.opId, payload_hash: op.payloadHash, format_version: op.formatVersion, key_epoch: op.keyEpoch, ciphertext: op.ciphertext })),
    }, options).then(rows => {
      const results = pushResults(rows)
      if (results.length !== input.ops.length || new Set(results.map(row => row.opId)).size !== results.length || results.some(row =>
        !input.ops.some(op => op.opId === row.opId) || (!row.error && (!Number.isSafeInteger(row.seq) || row.seq! < 1)))) throw new SyncFailure('configuration')
      return results
    }),
    pullOps: async (input, options) => {
      const rows = await call<unknown[]>('pull_ops', { p_workspace: input.workspaceId, p_device: input.deviceId, p_after: input.after, p_limit: input.limit }, options)
      const result = pullRows(rows)
      if (result.length > input.limit || result.some((row, index) => !Number.isSafeInteger(row.seq) || row.seq <= (index ? result[index - 1]!.seq : input.after)
        || !Number.isSafeInteger(row.formatVersion) || row.formatVersion < 1 || !Number.isSafeInteger(row.keyEpoch) || row.keyEpoch < 1
        || !/^[a-f0-9]{64}$/.test(row.payloadHash) || !/^[a-f0-9]+$/.test(row.ciphertext) || row.ciphertext.length % 2 || row.ciphertext.length > 2097152)) throw new SyncFailure('configuration')
      return result
    },
    resetSync: (deviceId, options) => call<void>('reset_sync', { p_device: deviceId, ...(options?.workspaceId ? { p_workspace: options.workspaceId } : {}) }, options),
  }
}
