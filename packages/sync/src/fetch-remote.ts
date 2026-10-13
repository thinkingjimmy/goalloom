/**
 * [INPUT]: A Supabase project URL, the anon key, and a fresh access token.
 * [OUTPUT]: SyncRemote over PostgREST RPC. Ciphertext stays opaque.
 * [POS]: The HTTP adapter mobile and desktop share. OAuth stays in the desktop shell.
 */
import { hex } from '@goalloom/crypto'
import { SyncFailure } from './failure'
import type { AccountView, CheckpointWire, EnvelopeWire, PullWire, PushResultWire, RecoveryChallenge, RosterWire, SyncRemote } from './remote'

function field(row: unknown, camel: string, snake: string): unknown {
  if (!row || typeof row !== 'object') return undefined
  const record = row as Record<string, unknown>
  return record[camel] ?? record[snake]
}

function pushResults(rows: unknown): PushResultWire[] {
  if (!Array.isArray(rows)) return []
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
  if (!Array.isArray(rows)) return []
  return rows.map(row => ({
    seq: Number(field(row, 'seq', 'seq')),
    opId: String(field(row, 'opId', 'op_id') ?? ''),
    payloadHash: String(field(row, 'payloadHash', 'payload_hash') ?? ''),
    formatVersion: Number(field(row, 'formatVersion', 'format_version')),
    keyEpoch: Number(field(row, 'keyEpoch', 'key_epoch')),
    ciphertext: String(field(row, 'ciphertext', 'ciphertext') ?? ''),
  }))
}

export function createFetchRemote(input: { url: string; anonKey: string; accessToken: () => Promise<string> }): SyncRemote {
  const call = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
    let token: string
    try { token = await input.accessToken() }
    catch { throw new SyncFailure('auth') }
    let response: Response
    try {
      response = await fetch(`${input.url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: input.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new SyncFailure('network')
    }
    const text = await response.text()
    if (!response.ok) {
      const message = text.slice(0, 180)
      if (response.status === 401 || message.includes('42501') || message.includes('not authenticated') || message.includes('device not bound')) throw new SyncFailure('auth', message)
      if (message.includes('workspace exists')) throw new SyncFailure('rejected', 'workspace exists')
      throw new SyncFailure('rejected', message || `rpc ${response.status}`)
    }
    return (text ? JSON.parse(text) : null) as T
  }
  const bytea = (bytes: Uint8Array) => `\\x${hex(bytes)}`
  return {
    registerDevice: input => call<string>('register_device', {
      p_name: input.name.slice(0, 64), p_platform: input.platform, p_sign_pub: bytea(input.signPub), p_box_pub: bytea(input.boxPub), p_protocol: 1,
    }),
    rebindDevice: (deviceId, message, signature) => call<void>('rebind_device', { p_device: deviceId, p_message: bytea(message), p_signature: bytea(signature) }),
    account: () => call<AccountView | null>('list_account', {}),
    bootstrap: input => call<void>('bootstrap_workspace', {
      p_device: input.deviceId, p_workspace: input.workspaceId, p_generation: input.generation, p_roster: input.roster,
      p_roster_hash: input.rosterHash, p_roster_sig: bytea(input.rosterSig), p_checkpoint: input.checkpoint,
      p_rec_sig: bytea(input.recSig), p_dev_sig: bytea(input.devSig),
    }),
    putEnvelopes: (workspaceId, deviceId, envelopes) => call<void>('put_key_envelopes', { p_workspace: workspaceId, p_device: deviceId, p_envelopes: envelopes }),
    getEnvelopes: (workspaceId, deviceId) => call<EnvelopeWire[]>('get_key_envelopes', { p_workspace: workspaceId, p_device: deviceId }).then(rows => rows ?? []),
    getCheckpoint: (workspaceId, deviceId) => call<CheckpointWire | null>('get_latest_checkpoint', { p_workspace: workspaceId, p_device: deviceId }),
    getRoster: (workspaceId, deviceId) => call<RosterWire[]>('get_roster', { p_workspace: workspaceId, p_device: deviceId }).then(rows => rows ?? []),
    startRecovery: (workspaceId, deviceId) => call<RecoveryChallenge>('start_recovery', { p_workspace: workspaceId, p_device: deviceId }),
    completeRecovery: input => call<void>('complete_recovery', {
      p_workspace: input.workspaceId, p_device: input.deviceId, p_challenge: input.challengeId, p_signature: bytea(input.signature),
      p_roster: input.roster, p_body_hash: input.bodyHash, p_roster_sig: bytea(input.rosterSig),
    }),
    pushOps: input => call<unknown[]>('push_ops', {
      p_workspace: input.workspaceId, p_device: input.deviceId, p_generation: input.generation,
      p_ops: input.ops.map(op => ({ op_id: op.opId, payload_hash: op.payloadHash, format_version: op.formatVersion, key_epoch: op.keyEpoch, ciphertext: op.ciphertext })),
    }).then(rows => pushResults(rows)),
    pullOps: async input => {
      const rows = await call<unknown[]>('pull_ops', { p_workspace: input.workspaceId, p_device: input.deviceId, p_after: input.after, p_limit: input.limit })
      return pullRows(rows)
    },
    resetSync: deviceId => call<void>('reset_sync', { p_device: deviceId }),
  }
}
