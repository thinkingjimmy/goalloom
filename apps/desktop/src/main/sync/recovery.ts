/**
 * [INPUT]: An authenticated remote, device keys, password and encrypted recovery draft.
 * [OUTPUT]: A fresh cloud binding; retries reuse its identity without changing the old workspace.
 * [POS]: Desktop recovery preparation. Local baseline installation follows successful cloud creation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { newRecovery, publicFromSeed, systemRandom } from '@goalloom/crypto'
import { createRemoteWorkspace, SyncFailure, type BoundWorkspace, type DeviceSecret, type SyncRemote } from '@goalloom/sync'
import type { VaultSecrets } from './vault'

export async function createRecoveryWorkspace(input: {
  remote: SyncRemote; deviceId: string; secret: DeviceSecret; secrets: VaultSecrets; password: string
  sourceWorkspaceId: string; localGeneration: string; destructive: boolean; persist: () => Promise<void>
}): Promise<BoundWorkspace> {
  const { secrets } = input
  if (secrets.pendingRecovery && (secrets.pendingRecovery.sourceWorkspaceId !== input.sourceWorkspaceId
    || secrets.pendingRecovery.localGeneration !== input.localGeneration || secrets.pendingRecovery.destructive !== input.destructive)) throw new SyncFailure('mismatch')
  if (!secrets.pendingRecovery) {
    const random = systemRandom(), recovery = newRecovery(random)
    secrets.pendingRecovery = { sourceWorkspaceId: input.sourceWorkspaceId, destructive: input.destructive, localGeneration: input.localGeneration,
      workspaceId: globalThis.crypto.randomUUID(), generation: globalThis.crypto.randomUUID(), workspaceKey: random.bytes(32),
      recoveryBoxSk: recovery.boxSk, recoverySignSk: recovery.signSk }
    await input.persist()
  }
  const draft = secrets.pendingRecovery
  if (draft.destructive) await input.remote.resetSync(input.deviceId, { workspaceId: draft.sourceWorkspaceId })
  return createRemoteWorkspace({ remote: input.remote, deviceId: input.deviceId, secret: input.secret, password: input.password,
    workspaceId: draft.workspaceId, workspaceKey: draft.workspaceKey, generation: draft.generation, createNew: true,
    recovery: { boxSk: draft.recoveryBoxSk, signSk: draft.recoverySignSk,
      boxPub: publicFromSeed('x25519', draft.recoveryBoxSk), signPub: publicFromSeed('ed25519', draft.recoverySignSk) },
  })
}
