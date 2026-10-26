/**
 * [INPUT]: Original scoped preparation, complete binding, immutable SQL receipt and captured custody callbacks.
 * [OUTPUT]: Same-request epoch recovery with durable custody before runtime promotion; mismatches fail closed.
 * [POS]: Existing journal handoff coordinator. No transport, key generation or second persistence engine.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { canonicalJson } from '@goalloom/contracts'
import { rosterHash, sha256Hex } from '@goalloom/crypto'
import type { BindingEpochReceipt, BindingIdentity } from '@goalloom/store-core'
import { SyncFailure } from '@goalloom/sync'
import { decodeScopedVault, type VaultSecrets } from './vault'
import type { KeyScope } from './key-scope'
import type { BindingJournal, PreparedEpoch } from './binding-journal'

export async function resolvePreparedEpoch(input: {
  prepared: PreparedEpoch; scope: KeyScope; secrets: VaultSecrets; journal: BindingJournal
  storage: <T>(command: object) => Promise<T>; save: (secrets: VaultSecrets) => Promise<void>; check: () => void
}): Promise<{ binding: BindingIdentity; secrets: VaultSecrets }> {
  const p = input.prepared, previous = p.expectedBinding, binding = { ...previous, keyEpoch: p.nextEpoch }
  const original = decodeScopedVault(p.vault, input.scope), current = input.secrets
  if (sha256Hex(p.vault) !== p.contextDigest || !original.roster || rosterHash(original.roster) !== p.rosterHash
    || original.epoch !== p.nextEpoch || !original.workspaceKey || current.userId !== previous.accountId
    || current.workspaceId !== previous.workspaceId || current.generation !== previous.generation || current.deviceId !== previous.deviceId
    || original.userId !== current.userId || original.workspaceId !== current.workspaceId || original.generation !== current.generation
    || ![previous.keyEpoch, p.nextEpoch].includes(current.epoch ?? 0)
    || current.epoch === p.nextEpoch && (!current.workspaceKey || !Buffer.from(current.workspaceKey).equals(original.workspaceKey) || !current.roster
      || (!p.finished || current.roster.version <= original.roster.version) && rosterHash(current.roster) !== p.rosterHash)
    || original.deviceId !== current.deviceId || !Buffer.from(original.signSk).equals(current.signSk)
    || !Buffer.from(original.boxSk).equals(current.boxSk)) throw new SyncFailure('storage', 'epoch preparation identity')
  input.check()
  let receipt = await input.storage<BindingEpochReceipt | null>({ type: 'epoch-read', requestId: p.requestId })
  input.check()
  if (!receipt) {
    try { receipt = await input.storage<BindingEpochReceipt>({ type: 'epoch-advance', expectedBinding: previous, nextEpoch: p.nextEpoch,
      proof: { requestId: p.requestId, rosterHash: p.rosterHash, contextDigest: p.contextDigest, at: p.at } }) }
    catch (error) {
      input.check()
      receipt = await input.storage<BindingEpochReceipt | null>({ type: 'epoch-read', requestId: p.requestId })
      if (!receipt) throw error
    }
  }
  input.check()
  if (!receipt || canonicalJson(receipt) !== canonicalJson({ version: 1, requestId: p.requestId, previousBinding: previous, binding,
    rosterHash: p.rosterHash, contextDigest: p.contextDigest, committedAt: p.at })) throw new SyncFailure('storage', 'epoch receipt mismatch')
  const active = await input.storage<BindingIdentity | null>({ type: 'active-binding' })
  input.check()
  if (canonicalJson(active) !== canonicalJson(binding)) throw new SyncFailure('storage', 'epoch active identity mismatch')
  const roster = p.finished && current.epoch === p.nextEpoch && current.roster && current.roster.version > original.roster.version ? current.roster : original.roster
  const secrets = { ...current, workspaceKey: original.workspaceKey, epoch: p.nextEpoch, roster }
  await input.save(secrets); input.check()
  await input.journal.remember(binding); input.check()
  await input.journal.finishEpoch(p.requestId); input.check()
  return { binding, secrets }
}
