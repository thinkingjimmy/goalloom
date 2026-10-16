/**
 * [INPUT]: An authenticated session. Payloads are ciphertext; this interface never sees a workspace key.
 * [OUTPUT]: The RPC surface desktop and mobile share. Tests substitute an in-memory server.
 * [POS]: Network port for the sync engine. It does not import supabase/ or a Supabase client.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { CheckpointBody, RosterBody } from '@goalloom/crypto'
import type { RequestOptions } from './request'

export type DevicePlatform = 'ios' | 'android' | 'macos' | 'windows' | 'linux'

export interface AccountView {
  workspaceId: string
  generation: string
  keyEpoch: number
  headSeq: number
  rosterVersion: number
}

export interface SyncHead extends AccountView {
  minRetainedSeq: number
  minProtocolRead: number
  minProtocolWrite: number
}

export interface ReceiptWire { opId: string; payloadHash: string; seq: number }

export interface EnvelopeWire {
  epoch: number
  recipient: string
  ciphertext: string
  signature: string
  rosterVersion: number
  signerDevice: string | null
}

export interface RosterWire {
  version: number
  roster: RosterBody
  bodyHash: string
  signature: string
  signerType: 'device' | 'recovery'
  signerDevice: string | null
}

export interface CheckpointWire {
  cpVersion: number
  body: CheckpointBody
  recSig: string
  devSig: string
}

export interface PushWire {
  opId: string
  payloadHash: string
  formatVersion: number
  keyEpoch: number
  ciphertext: string
}

export interface PushResultWire {
  opId: string
  seq?: number
  duplicate?: boolean
  error?: string
}

export interface PullWire {
  seq: number
  opId: string
  payloadHash: string
  formatVersion: number
  keyEpoch: number
  ciphertext: string
}

export interface RecoveryChallenge {
  challengeId: string
  nonce: string
  rosterVersion: number
  rosterHash: string
}

export interface SyncRemote {
  registerDevice(input: { name: string; platform: DevicePlatform; signPub: Uint8Array; boxPub: Uint8Array }, options?: RequestOptions): Promise<string>
  rebindDevice(deviceId: string, message: Uint8Array, signature: Uint8Array, options?: RequestOptions): Promise<void>
  account(options?: RequestOptions): Promise<AccountView | null>
  bootstrap(input: {
    deviceId: string; workspaceId: string; generation: string; roster: RosterBody; rosterHash: string
    rosterSig: Uint8Array; checkpoint: CheckpointBody; recSig: Uint8Array; devSig: Uint8Array
  }, options?: RequestOptions): Promise<void>
  putEnvelopes(workspaceId: string, deviceId: string, envelopes: EnvelopeWire[], options?: RequestOptions): Promise<void>
  getEnvelopes(workspaceId: string, deviceId: string, options?: RequestOptions): Promise<EnvelopeWire[]>
  getCheckpoint(workspaceId: string, deviceId: string, options?: RequestOptions): Promise<CheckpointWire | null>
  getRoster(workspaceId: string, deviceId: string, options?: RequestOptions): Promise<RosterWire[]>
  getSyncStatus(workspaceId: string, deviceId: string, options?: RequestOptions): Promise<SyncHead>
  receiptsFor(workspaceId: string, deviceId: string, opIds: string[], options?: RequestOptions): Promise<ReceiptWire[]>
  startRecovery(workspaceId: string, deviceId: string, options?: RequestOptions): Promise<RecoveryChallenge>
  completeRecovery(input: {
    workspaceId: string; deviceId: string; challengeId: string; signature: Uint8Array
    roster: RosterBody; bodyHash: string; rosterSig: Uint8Array
  }, options?: RequestOptions): Promise<void>
  pushOps(input: { workspaceId: string; deviceId: string; generation: string; ops: PushWire[] }, options?: RequestOptions): Promise<PushResultWire[]>
  pullOps(input: { workspaceId: string; deviceId: string; after: number; limit: number }, options?: RequestOptions): Promise<PullWire[]>
  resetSync(deviceId: string, options?: RequestOptions): Promise<void>
}
