// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Frozen D2 lifecycle/retrieval/privacy contract and verified server identities.
 * [OUTPUT]: One retained-boundary type, initialization tuple and finite lifecycle/privacy DTOs.
 * [POS]: Lifecycle integration seam consumed by retrieval and trusted Edge coordinators.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const SYNC_SERVICE_VERSION = 2 as const
export const LIFECYCLE_VERSION = 1 as const
export const PREPARE_HOURS = 24
export const RECEIPT_HOURS = 720
export type Environment = 'development' | 'production'
export type CloudTarget = { workspaceId: string; generation: string }
export type DataFailure = 'unsupported_profile' | 'incomplete_history' | 'integrity_failure'
export type GenerationState = 'active' | 'retained' | 'closed' | 'deleting' | 'deleted'
export type InitializationTuple = {
  requestId: string
  creatorDeviceId: string
  finalOpId: string
  finalPayloadHash: string
  finalSeq: number
}
export type InitialEnvelopeWire = {
  epoch: 1; recipient: string; ciphertext: string; signature: string; rosterVersion: 1; signerDevice: string
}
export type InitializationCreation = { requestId: string; finalOpId: string; envelopes: InitialEnvelopeWire[] }
/** Completion is internal only. Null initialization/completion means verified non-seed history. */
export type RetainedBoundary = {
  ownerId: string
  workspaceId: string
  generation: string
  lifecycleVersion: number
  state: 'retained'
  accessEndedAt: string
  retrieveUntil: string
  onlineDeleteBy: string
  headSeq: number
  minRetainedSeq: number
  keyEpoch: number
  rosterVersion: number
  checkpointVersion: number
  initialization: InitializationTuple | null
  initializationCompleted: boolean | null
}
export type BoundaryResult =
  | { ok: true; boundary: RetainedBoundary }
  | { ok: false; error: 'retrieval_closed' | 'retrieval_boundary_changed' }
  | { ok: false; error: 'retrieval_configuration' }
  | { ok: false; error: 'retrieval_data_unavailable'; reason: DataFailure }
export type FinishInitialization = {
  version: 1
  requestId: string
  target: CloudTarget
  creatorDeviceId: string
  finalOpId: string
  finalPayloadHash: string
  finalSeq: number
}
export type Scope = 'cloud' | 'account'
export type PrepareDelete = {
  version: 1
  requestId: string
  scope: Scope
  target: CloudTarget | null
  expectedRevision: number
  receiptDigest: string
}
export type ConfirmDelete = { version: 1; requestId: string; expectedRevision: number; acknowledge: true }
export type ReadDeleteReceipt = { version: 1; environment: Environment; requestId: string; secret: string }
export type DeletionProgress = {
  version: 1
  requestId: string
  scope: Scope
  serverNow: string
  accepted: boolean
  confirmedAt: string | null
  onlineDeleteBy: string | null
  statusExpiresAt: string
  intent: 'not_started' | 'pending' | 'durable'
  content: 'not_started' | 'pending' | 'deleting' | 'deleted'
  auth: 'not_applicable' | 'not_started' | 'pending' | 'deleted'
  renewal: 'not_applicable' | 'not_started' | 'pending' | 'stopped' | 'attention_required'
}
export type LifecycleFailure = { version: 1; error: string }
export type Rpc = <T = Record<string, unknown>>(name: string, args: Record<string, unknown>) => Promise<T>
