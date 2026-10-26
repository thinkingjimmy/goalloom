/**
 * [INPUT]: Verified binding scope, exact initial envelopes, authenticated epoch preparations and immutable old protected send files.
 * [OUTPUT]: Crash-safe creation/epoch drafts, retired key/journal contexts and matched initialization acknowledgements.
 * [POS]: Main-only handoff journal. It has no retired uploader or session-resume API.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID, createHash } from 'node:crypto'
import { readdir, readFile, lstat, access } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { canonicalJson, cloudEnvelopeWireSchema, initializationReceiptSchema } from '@goalloom/contracts'
import { newRecovery, systemRandom, hex, unhex, publicFromSeed, sha256Hex } from '@goalloom/crypto'
import type { BindingIdentity } from '@goalloom/store-core'
import type { EnvelopeWire } from '@goalloom/sync'
import { ProtectedRecords } from './protected-records'
import type { Cipher } from '../smart/credentials'
import { encodeScopedVault, type VaultSecrets } from './vault'

import { keyScopeSchema, scopeContext, scopeDirectory, type KeyScope } from './key-scope'
import { bindingIdentitySchema } from './binding-identity'

const draftSchema = z.strictObject({
  transitionRequestId: z.uuid(), initializationRequestId: z.uuid(), seedId: z.uuid(), finalOpId: z.uuid(),
  binding: bindingIdentitySchema, workspaceKey: z.string().regex(/^[a-f0-9]{64}$/), recoveryBoxSk: z.string().regex(/^[a-f0-9]{64}$/), recoverySignSk: z.string().regex(/^[a-f0-9]{64}$/),
  envelopes: z.array(cloudEnvelopeWireSchema).length(2).nullable(), createdAt: z.string(), finish: initializationReceiptSchema.nullable(),
})
const contextSchema = z.strictObject({ ref: z.uuid(), binding: bindingIdentitySchema, vault: z.string(), files: z.array(z.strictObject({ name: z.string(), bytes: z.string(), digest: z.string() })).max(1024), digest: z.string() })
const epochSchema = z.strictObject({ requestId: z.uuid(), expectedBinding: bindingIdentitySchema, nextEpoch: z.number().int().positive(), rosterHash: z.string().regex(/^[a-f0-9]{64}$/), contextDigest: z.string().regex(/^[a-f0-9]{64}$/), at: z.string(), vault: z.string().max(2_000_000), finished: z.boolean() })
  .refine(value => value.nextEpoch > value.expectedBinding.keyEpoch && sha256Hex(value.vault) === value.contextDigest)
const schema = z.strictObject({ scope: keyScopeSchema, drafts: z.array(draftSchema).max(100), contexts: z.array(contextSchema).max(100), bindings: z.array(bindingIdentitySchema).max(100), epochAdvances: z.array(epochSchema).max(100).default([]) })
export type BindingDraft = z.infer<typeof draftSchema>
export type PreparedEpoch = z.infer<typeof epochSchema>
export class BindingJournal {
  private file: ProtectedRecords<z.infer<typeof schema>>
  constructor(private directory: string, readonly scope: KeyScope, cipher: () => Cipher) {
    this.scope = Object.freeze(keyScopeSchema.parse(scope))
    this.file = new ProtectedRecords(this.path, `sync-bindings/v2|${scopeContext(this.scope)}`, cipher, value => {
      const parsed = schema.parse(value)
      if (scopeContext(parsed.scope) !== scopeContext(this.scope) || [...parsed.bindings, ...parsed.drafts.map(row => row.binding), ...parsed.contexts.map(row => row.binding), ...parsed.epochAdvances.map(row => row.expectedBinding)].some(binding => binding.accountId !== scope.accountId || binding.projectRef !== scope.projectRef || binding.environment !== scope.environment)) throw Error('binding_scope_mismatch')
      return parsed
    })
  }
  get path(): string { return join(scopeDirectory(this.directory, this.scope), 'sync-bindings.bin') }
  async exists(): Promise<boolean> {
    try { return (await readdir(scopeDirectory(this.directory, this.scope))).some(name => name === 'sync-bindings.bin' || name.startsWith('sync-bindings.bin.') && name.endsWith('.tmp')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
  }
  async settle(): Promise<void> { await this.file.settle() }
  private async data() { return await this.file.load() ?? { scope: this.scope, drafts: [], contexts: [], bindings: [], epochAdvances: [] } }
  async binding(accountId: string, workspaceId: string): Promise<BindingIdentity | null> { return (await this.data()).bindings.find(row => row.accountId === accountId && row.workspaceId === workspaceId) ?? null }
  async remember(binding: BindingIdentity): Promise<void> { await this.file.update(value => ({ scope: this.scope, drafts: value?.drafts ?? [], contexts: value?.contexts ?? [], epochAdvances: value?.epochAdvances ?? [], bindings: [...(value?.bindings ?? []).filter(row => row.accountId !== binding.accountId || row.workspaceId !== binding.workspaceId), binding] })) }
  async pendingEpoch(accountId: string, workspaceId: string, interruptedEpoch?: number): Promise<PreparedEpoch | null> { return (await this.data()).epochAdvances.find(row => (!row.finished || row.expectedBinding.keyEpoch === interruptedEpoch) && row.expectedBinding.accountId === accountId && row.expectedBinding.workspaceId === workspaceId) ?? null }
  async epochPreparation(binding: BindingIdentity): Promise<PreparedEpoch | null> { return (await this.data()).epochAdvances.find(row => canonicalJson({ ...row.expectedBinding, keyEpoch: row.nextEpoch }) === canonicalJson(binding)) ?? null }
  async prepareEpoch(input: Omit<PreparedEpoch, 'finished'>): Promise<PreparedEpoch> {
    const prepared = epochSchema.parse({ ...input, finished: false })
    await this.file.update(value => {
      const current = value ?? { scope: this.scope, drafts: [], contexts: [], bindings: [], epochAdvances: [] }
      const previous = current.epochAdvances.find(row => row.requestId === prepared.requestId || !row.finished && row.expectedBinding.bindingToken === prepared.expectedBinding.bindingToken)
      if (previous && canonicalJson(previous) !== canonicalJson(prepared)) throw Error('epoch_preparation_conflict')
      return previous ? current : { ...current, epochAdvances: [...current.epochAdvances, prepared] }
    })
    const saved = await this.pendingEpoch(prepared.expectedBinding.accountId, prepared.expectedBinding.workspaceId)
    if (canonicalJson(saved) !== canonicalJson(prepared)) throw Error('epoch_preparation_unverified')
    return saved!
  }
  async finishEpoch(requestId: string): Promise<void> {
    await this.file.update(value => {
      if (!value?.epochAdvances.some(row => row.requestId === requestId)) throw Error('epoch_preparation_missing')
      return { ...value, epochAdvances: value.epochAdvances.map(row => row.requestId === requestId ? { ...row, finished: true } : row) }
    })
  }
  async forBinding(binding: BindingIdentity): Promise<BindingDraft | null> { return (await this.data()).drafts.find(row => row.binding.bindingToken === binding.bindingToken && row.binding.accountId === binding.accountId) ?? null }
  async pending(accountId: string): Promise<BindingDraft | null> { return (await this.data()).drafts.find(row => row.binding.accountId === accountId && !row.finish) ?? null }
  async begin(scope: Omit<BindingIdentity, 'workspaceId' | 'generation' | 'keyEpoch' | 'bindingToken'>, now: string, protect?: (draft: BindingDraft) => Promise<void>): Promise<BindingDraft> {
    const previous = await this.pending(scope.accountId)
    if (previous) {
      if (previous.binding.localGeneration !== scope.localGeneration || previous.binding.deviceId !== scope.deviceId || previous.binding.projectRef !== scope.projectRef || previous.binding.environment !== scope.environment) throw Error('binding_draft_conflict')
      return previous
    }
    const recovery = newRecovery(systemRandom())
    const draft: BindingDraft = { transitionRequestId: randomUUID(), initializationRequestId: randomUUID(), seedId: randomUUID(), finalOpId: randomUUID(),
      binding: { ...scope, workspaceId: randomUUID(), generation: randomUUID(), keyEpoch: 1, bindingToken: randomUUID() }, workspaceKey: hex(systemRandom().bytes(32)), recoveryBoxSk: hex(recovery.boxSk), recoverySignSk: hex(recovery.signSk), envelopes: null, createdAt: now, finish: null }
    await protect?.(draft)
    await this.file.update(value => ({ ...value ?? { scope: this.scope, contexts: [], bindings: [], epochAdvances: [] }, drafts: [...value?.drafts ?? [], draft] }))
    return draft
  }
  async envelopes(draft: BindingDraft, envelopes: EnvelopeWire[]): Promise<void> {
    await this.file.update(value => {
      if (!value) throw Error('binding_draft_missing')
      const current = value.drafts.find(row => row.transitionRequestId === draft.transitionRequestId)
      if (!current || current.envelopes && JSON.stringify(current.envelopes) !== JSON.stringify(envelopes)) throw Error('binding_envelopes_changed')
      return { ...value, drafts: value.drafts.map(row => row === current ? { ...row, envelopes } : row) }
    })
  }
  recovery(draft: BindingDraft) { const boxSk = unhex(draft.recoveryBoxSk), signSk = unhex(draft.recoverySignSk); return { boxSk, signSk, boxPub: publicFromSeed('x25519', boxSk), signPub: publicFromSeed('ed25519', signSk) } }
  async retain(binding: BindingIdentity, secrets: VaultSecrets): Promise<string> {
    const files: z.infer<typeof contextSchema>['files'] = []
    const partition = scopeDirectory(this.directory, this.scope)
    const names = (await readdir(this.directory)).filter(name => /^sync-send-(?:v2-)?[a-f0-9]{64}\.bin$/.test(name)).sort()
    try { await access(join(partition, 'sync-password.bin')); names.push('sync-password.bin') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    for (const name of names) {
      const path = join(name === 'sync-password.bin' ? partition : this.directory, name), stat = await lstat(path)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) throw Error('binding_context_unavailable')
      const bytes = await readFile(path)
      files.push({ name, bytes: bytes.toString('base64'), digest: createHash('sha256').update(bytes).digest('hex') })
    }
    const vault = encodeScopedVault(secrets, this.scope), ref = randomUUID()
    const digest = createHash('sha256').update(JSON.stringify({ binding, vault, files })).digest('hex')
    const context = { ref, binding, vault, files, digest }
    await this.file.update(value => ({ scope: this.scope, drafts: value?.drafts ?? [], bindings: value?.bindings ?? [], epochAdvances: value?.epochAdvances ?? [], contexts: [...value?.contexts ?? [], context] }))
    const saved = (await this.data()).contexts.find(row => row.ref === ref)
    if (!saved || saved.digest !== digest) throw Error('binding_context_unavailable')
    return ref
  }
  async finish(draft: BindingDraft, receipt: z.infer<typeof initializationReceiptSchema>): Promise<void> {
    if (receipt.requestId !== draft.initializationRequestId || receipt.target.workspaceId !== draft.binding.workspaceId || receipt.target.generation !== draft.binding.generation || receipt.finalOpId !== draft.finalOpId) throw Error('initialization_conflict')
    await this.file.update(value => {
      if (!value) throw Error('binding_draft_missing')
      return { ...value, drafts: value.drafts.map(row => row.transitionRequestId === draft.transitionRequestId ? { ...row, finish: receipt } : row) }
    })
  }
}
