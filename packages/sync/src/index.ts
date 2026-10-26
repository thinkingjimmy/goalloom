/**
 * [INPUT]: Crypto/store interfaces, sync wire definitions and finite service admission contracts.
 * [OUTPUT]: Sync workflows, guarded transports, exact receipt recovery primitives and typed service failures.
 * [POS]: Sync package public entry. Account login and billing policy remain outside the engine.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export { applyPushReceipts, type PushReceipt } from './receipts'
export { rejectStaleEpoch, runLocalPrototype, snapshotPlaintext, type ProtoBox, type PrototypeRow } from './prototype'
export { rejectMissingKey, rejectUnknownFormat } from './pause'
export { maxOpCiphertextBytes, missingBlobHoldsCursor, planPushBatches, type PushCandidate } from './push'
export { SyncFailure, isServiceFailureCode, serviceFailureCodes, type ServiceFailureCode } from './failure'
export { joinPlan, pristineHistory } from './join'
export { prepareFirstConnection } from './first-connection'
export { openOpWire, sealOpWire } from './codec'
export { createFetchRemote } from './fetch-remote'
export { createMemoryWorld, memoryCiphertext, memoryRemote, type MemoryWorld } from './memory-remote'
export { bindWorkspace, captureVisibleBoard, clearProjection, conflictCount, localLiveCount, queueBaseline, queueVisibleBaseline, repairRejectedBaseline, stageImportedBoard, syncCursor, type LocalBoard } from './board'
export {
  acceptPushResults, acceptRosterAdvance, absorbOpened, absorbPulled, bootstrapWorkspace, createRemoteWorkspace, downloadWorkspace,
  changeSyncPassword, exchange, installJoined, joinWorkspace, newDeviceSecret, pullOpened, rebindMessage, restorePendingSecrets, sealPending, takePending, unlockWithPassword, workspaceKeyFromEnvelope,
  type BoundWorkspace, type DeviceSecret, peekPending, markPending, type PendingPlain, type SecretLookup,
} from './session'
export type { AccountView, DevicePlatform, PushResultWire, SyncHead, ReceiptWire, SyncRemote } from './remote'

export { scopedRemote, boundedRequest, requestLimits, syncClock, type RequestOptions, type SyncClock } from './request'

export { createCloudRemote, readBoundedJson, CloudFailure, cloudFailureCodes, type CloudRemote, type CloudFailureCode, type RetrievalDataFailure } from './cloud-remote'
export type { EnvelopeWire, RosterWire, CheckpointWire, PullWire } from './remote'

export { retrieveRetained, retrievalProofDigest, type RetrievalCredentials, type RetrievalIdentity, type RetrievedOperation } from './retrieval'

export { captureExactSeed, encodeExactSeed, previewBindingTransition, commitBindingTransition, readBindingTransition, readSeedHandoff, retiredBindingSummary, type EncodedSeed, type BindingTransitionInput, type BindingTransitionPreview, type BindingTransitionReceipt, type SeedHandoff } from './seed'
