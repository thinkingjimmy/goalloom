/**
 * [INPUT]: Protected original creation draft, prepared scoped password material, verified source and the sole storage-worker seam.
 * [OUTPUT]: Exact seed handoff and durable original-final acknowledgement before later uploads.
 * [POS]: Main initialization coordinator. Remote initialization, local transition and seed IDs remain distinct.
 */
import { hex, publicFromSeed, unhex } from '@goalloom/crypto'
import { createRemoteWorkspace, SyncFailure, type BindingTransitionPreview, type BindingTransitionReceipt, type BoundWorkspace, type DeviceSecret, type SeedHandoff, type SyncRemote } from '@goalloom/sync'
import type { BindingIdentity } from '@goalloom/store-core'
import type { BindingDraft, BindingJournal } from './binding-journal'
import type { VaultSecrets } from './vault'

export function restoredSeedBinding(draft: BindingDraft, secret: DeviceSecret, journal: BindingJournal): BoundWorkspace {
  const recovery = journal.recovery(draft), workspaceId = draft.binding.workspaceId
  return { workspaceId, generation: draft.binding.generation, epoch: 1, workspaceKey: unhex(draft.workspaceKey), recovery,
    roster: { workspaceId, version: 1, epoch: 1, prevHash: null, devices: [{ id: draft.binding.deviceId, signPub: hex(publicFromSeed('ed25519', secret.signSk)), boxPub: hex(publicFromSeed('x25519', secret.boxSk)) }], recoverySignPub: hex(recovery.signPub), recoveryBoxPub: hex(recovery.boxPub) } }
}
export async function createSeedBinding(input: {
  journal: BindingJournal; remote: SyncRemote; storage: <T>(command: object) => Promise<T>; secret: DeviceSecret; secrets: VaultSecrets
  scope: Omit<BindingIdentity, 'workspaceId' | 'generation' | 'keyEpoch' | 'bindingToken'>; expectedBinding: BindingIdentity | null
  remotePrepared?: () => void
  protectDraft?: (draft: BindingDraft) => Promise<void>
  promoteDraft?: (draft: BindingDraft) => Promise<void>
  preview?: BindingTransitionPreview; approvedBinding?: BindingIdentity | null; destructive?: boolean
  password: string; at: string; check: () => void
}): Promise<{ bound: BoundWorkspace; binding: BindingIdentity }> {
  const pending = await input.journal.pending(input.scope.accountId)
  if (pending && (pending.binding.localGeneration !== input.scope.localGeneration || pending.binding.deviceId !== input.scope.deviceId || pending.binding.projectRef !== input.scope.projectRef || pending.binding.environment !== input.scope.environment)) throw new SyncFailure('mismatch')
  const previous = pending ? await input.storage<BindingTransitionReceipt | null>({ type: 'transition-read', requestId: pending.transitionRequestId }) : null
  input.check()
  if (previous && pending) {
    if (previous.initializationRequestId !== pending.initializationRequestId || previous.manifest.seedId !== pending.seedId || previous.finalOpId !== pending.finalOpId || previous.newBinding.bindingToken !== pending.binding.bindingToken) throw new SyncFailure('storage')
    await input.promoteDraft?.(pending)
    input.check()
    return { bound: restoredSeedBinding(pending, input.secret, input.journal), binding: pending.binding }
  }
  if (input.preview && JSON.stringify(input.approvedBinding) !== JSON.stringify(input.expectedBinding)) throw new SyncFailure('mismatch')
  const preview = input.preview ?? await input.storage<BindingTransitionPreview>({ type: 'transition-preview', expectedBinding: input.expectedBinding, expectedLocalGeneration: input.scope.localGeneration })
  // Capture original password/send bytes before preparing the new password lock.
  const contextRef = input.expectedBinding ? await input.journal.retain(input.expectedBinding, input.secrets) : null
  input.check()
  const draft = await input.journal.begin(input.scope, input.at, input.protectDraft)
  input.check()
  await input.storage({ type: 'protect', at: input.at })
  input.check()
  const bound = await createRemoteWorkspace({ remote: input.remote, deviceId: draft.binding.deviceId, secret: input.secret, password: input.password,
    workspaceId: draft.binding.workspaceId, generation: draft.binding.generation, workspaceKey: unhex(draft.workspaceKey), recovery: input.journal.recovery(draft), createNew: input.expectedBinding !== null || Boolean(input.preview),
    ...(input.destructive && input.expectedBinding ? { beforeCreate: () => input.remote.resetSync(input.scope.deviceId, { workspaceId: input.expectedBinding!.workspaceId }) } : {}),
    initialization: { requestId: draft.initializationRequestId, finalOpId: draft.finalOpId, envelopes: draft.envelopes,
      persist: wires => input.journal.envelopes(draft, wires) },
  })
  input.check()
  input.remotePrepared?.()
  await input.storage({ type: 'transition-commit', input: {
    requestId: draft.transitionRequestId, initializationRequestId: draft.initializationRequestId, seedId: draft.seedId, finalOpId: draft.finalOpId,
    expectedBinding: input.expectedBinding, newBinding: draft.binding, expectedLocalGeneration: input.scope.localGeneration,
    expectedRevision: preview.revision, expectedSourceDigest: preview.sourceDigest, protectedContextRef: contextRef,
    newProtectedContextRef: draft.transitionRequestId, at: draft.createdAt,
  } })
  input.check()
  await input.promoteDraft?.(draft)
  input.check()
  await input.journal.remember(draft.binding)
  return { bound, binding: draft.binding }
}
export async function finishSeedBinding(input: {
  journal: BindingJournal; binding: BindingIdentity; remote: SyncRemote; storage: <T>(command: object) => Promise<T>; check: () => void
}): Promise<void> {
  const handoff = await input.storage<SeedHandoff | null>({ type: 'seed-handoff', expectedBinding: input.binding })
  input.check()
  if (!handoff?.canonicalVerified) return
  const draft = await input.journal.forBinding(input.binding)
  if (!draft || draft.initializationRequestId !== handoff.requestId || draft.seedId !== handoff.seedId || draft.transitionRequestId !== handoff.transitionRequestId) throw new SyncFailure('storage')
  const receipt = draft.finish ?? await input.remote.finishInitialization({ version: 1, requestId: handoff.requestId, target: handoff.target,
    creatorDeviceId: handoff.creatorDeviceId, finalOpId: handoff.finalOpId, finalPayloadHash: handoff.finalPayloadHash, finalSeq: handoff.finalSeq })
  input.check()
  if (receipt.finalPayloadHash !== handoff.finalPayloadHash || receipt.finalSeq !== handoff.finalSeq) throw new SyncFailure('storage')
  await input.journal.finish(draft, receipt)
  input.check()
  await input.storage({ type: 'seed-finished', expectedBinding: input.binding, receipt })
}
