/**
 * [INPUT]: OS cipher, device directory and a main-owned vault filename.
 * [OUTPUT]: Native scope-key maps plus explicitly filtered scoped recovery serialization, deferred AI secrets and recovery drafts; atomic OS-vault writes and a public resume flag. Sign-out and inactive-session checks do not use the OS cipher.
 * [POS]: Desktop secret store. Sign-out preserves ciphertext, including legacy bytes; unavailable access never replaces saved keys.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readFile, rm } from 'node:fs/promises'
import { atomicFile } from '../storage/atomic-json'
import { join } from 'node:path'
import { z } from 'zod'
import { hex, unhex, type RosterBody } from '@goalloom/crypto'
import { keyScopeSchema, scopeContext, scopeId, type KeyScope } from './key-scope'
import { CredentialError, type Cipher } from '../smart/credentials'

const vaultHeader = Buffer.from('Goalloom sync vault 1\n')

const accountSchema = z.strictObject({
  deviceId: z.string().nullable(),
  workspaceKey: z.string().nullable(),
  workspaceId: z.string().nullable(),
  generation: z.string().nullable(),
  epoch: z.number().int().positive().nullable(),
  roster: z.unknown().nullable(),
  recoveryBoxSk: z.string().nullable().default(null),
  recoverySignSk: z.string().nullable().default(null),
})

const fileSchema = z.strictObject({
  v: z.literal(1),
  bindingJournalKey: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  bindingJournalKeys: z.record(z.string().regex(/^[a-f0-9]{64}$/), z.string().regex(/^[a-f0-9]{64}$/)).default({}).refine(keys => Object.keys(keys).length <= 100),
  accountOnly: z.boolean().default(false),
  deviceId: z.string().nullable(),
  signSk: z.string(),
  boxSk: z.string(),
  workspaceKey: z.string().nullable(),
  workspaceId: z.string().nullable(),
  generation: z.string().nullable(),
  epoch: z.number().int().positive().nullable(),
  roster: z.unknown().nullable(),
  recoveryBoxSk: z.string().nullable().default(null),
  recoverySignSk: z.string().nullable().default(null),
  refreshToken: z.string().nullable(),
  userId: z.string().nullable().default(null),
  accounts: z.record(z.string(), accountSchema).default({}),
  pendingSecrets: z.record(z.string(), z.strictObject({ value: z.string().nullable(), opId: z.uuid(), updatedAt: z.string() })).default({}),
  pendingRecovery: z.strictObject({
    sourceWorkspaceId: z.uuid(), destructive: z.boolean(), localGeneration: z.uuid(), workspaceId: z.uuid(), generation: z.uuid(),
    workspaceKey: z.string(), recoveryBoxSk: z.string(), recoverySignSk: z.string(),
  }).nullable().default(null),
})

export interface AccountSecrets {
  deviceId: string | null
  workspaceKey: Uint8Array | null
  workspaceId: string | null
  generation: string | null
  epoch: number | null
  roster: RosterBody | null
  recoveryBoxSk: Uint8Array | null
  recoverySignSk: Uint8Array | null
}

export interface VaultSecrets {
  bindingJournalKey?: Uint8Array | null
  bindingJournalKeys?: Record<string, Uint8Array>
  accountOnly?: boolean
  deviceId: string | null
  signSk: Uint8Array
  boxSk: Uint8Array
  workspaceKey: Uint8Array | null
  workspaceId: string | null
  generation: string | null
  epoch: number | null
  roster: RosterBody | null
  recoveryBoxSk: Uint8Array | null
  recoverySignSk: Uint8Array | null
  refreshToken: string | null
  userId: string | null
  accounts: Record<string, AccountSecrets>
  pendingRecovery?: PendingRecovery | null
  pendingSecrets?: Record<string, { value: string | null; opId: string; updatedAt: string }>
}

export interface PendingRecovery {
  sourceWorkspaceId: string; destructive: boolean; localGeneration: string; workspaceId: string; generation: string
  workspaceKey: Uint8Array; recoveryBoxSk: Uint8Array; recoverySignSk: Uint8Array
}

export class SyncVault {
  private writing: Promise<void> = Promise.resolve()
  constructor(private directory: string, private cipher: Cipher, private filename = 'sync-vault.bin') {}
  get available(): boolean { return this.cipher.available() }
  async exists(): Promise<boolean> {
    await this.writing
    try { await readFile(join(this.directory, this.filename)); return true }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false
      throw error
    }
  }
  async load({ resumeOnly = false, signal, migrateLegacy = true }: { resumeOnly?: boolean; signal?: AbortSignal; migrateLegacy?: boolean } = {}): Promise<VaultSecrets | null> {
    await this.writing
    signal?.throwIfAborted()
    let bytes: Buffer
    try { bytes = await readFile(join(this.directory, this.filename), { signal }) }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null
      throw error
    }
    signal?.throwIfAborted()
    const legacy = !bytes.subarray(0, vaultHeader.length).equals(vaultHeader)
    let active = true
    if (!legacy) {
      const resume = bytes[vaultHeader.length]
      if (resume !== 0 && resume !== 1) throw new Error('Invalid sync vault header')
      active = resume === 1
      if (resumeOnly && !active) return null
      bytes = bytes.subarray(vaultHeader.length + 1)
    }
    if (!this.available) throw new CredentialError('unavailable')
    const secrets = decodeVault(this.cipher.decrypt(bytes))
    if (!active) secrets.refreshToken = null
    if (legacy && migrateLegacy) await this.save(secrets)
    return secrets
  }
  async save(secrets: VaultSecrets): Promise<void> {
    if (!this.available) throw new CredentialError('unavailable')
    const body = encodeVault(secrets)
    const encrypted = this.cipher.encrypt(body)
    const bytes = Buffer.concat([vaultHeader, Buffer.from([secrets.refreshToken ? 1 : 0]), encrypted])
    await this.mutate(() => this.replace(bytes))
  }
  async signOut(): Promise<void> {
    await this.mutate(async () => {
      let bytes: Buffer
      try { bytes = await readFile(join(this.directory, this.filename)) }
      catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return
        throw error
      }
      if (bytes.subarray(0, vaultHeader.length).equals(vaultHeader)) {
        const resume = bytes[vaultHeader.length]
        if (resume === 0) return
        if (resume !== 1) throw new Error('Invalid sync vault header')
        bytes = bytes.subarray(vaultHeader.length + 1)
      }
      await this.replace(Buffer.concat([vaultHeader, Buffer.from([0]), bytes]))
    })
  }
  private async replace(bytes: Buffer): Promise<void> {
    const path = join(this.directory, this.filename)
    await atomicFile(path, file => file.writeFile(bytes))
  }
  private mutate(operation: () => Promise<void>): Promise<void> {
    const result = this.writing.then(operation)
    this.writing = result.catch(() => undefined)
    return result
  }
  async clear(): Promise<void> {
    await this.mutate(() => rm(join(this.directory, this.filename), { force: true }))
  }
}

export function decodeVault(text: string): VaultSecrets {
  const parsed = fileSchema.parse(JSON.parse(text))
  const accounts: Record<string, AccountSecrets> = {}
  for (const [userId, account] of Object.entries(parsed.accounts)) {
    accounts[userId] = {
      deviceId: account.deviceId, workspaceKey: account.workspaceKey ? unhex(account.workspaceKey) : null,
      workspaceId: account.workspaceId, generation: account.generation, epoch: account.epoch, roster: account.roster as RosterBody | null,
      recoveryBoxSk: account.recoveryBoxSk ? unhex(account.recoveryBoxSk) : null,
      recoverySignSk: account.recoverySignSk ? unhex(account.recoverySignSk) : null,
    }
  }
  const secrets: VaultSecrets = {
    deviceId: parsed.deviceId, signSk: unhex(parsed.signSk), boxSk: unhex(parsed.boxSk),
    workspaceKey: parsed.workspaceKey ? unhex(parsed.workspaceKey) : null,
    workspaceId: parsed.workspaceId, generation: parsed.generation, epoch: parsed.epoch,
    roster: parsed.roster as RosterBody | null,
    recoveryBoxSk: parsed.recoveryBoxSk ? unhex(parsed.recoveryBoxSk) : null,
    recoverySignSk: parsed.recoverySignSk ? unhex(parsed.recoverySignSk) : null,
    bindingJournalKey: parsed.bindingJournalKey ? unhex(parsed.bindingJournalKey) : null,
    bindingJournalKeys: Object.fromEntries(Object.entries(parsed.bindingJournalKeys).map(([id, key]) => [id, unhex(key)])),
    accountOnly: parsed.accountOnly, refreshToken: parsed.refreshToken, userId: parsed.userId, accounts, pendingSecrets: parsed.pendingSecrets,
    pendingRecovery: parsed.pendingRecovery ? { ...parsed.pendingRecovery, workspaceKey: unhex(parsed.pendingRecovery.workspaceKey),
      recoveryBoxSk: unhex(parsed.pendingRecovery.recoveryBoxSk), recoverySignSk: unhex(parsed.pendingRecovery.recoverySignSk) } : null,
  }
  return secrets
}

export function encodeVault(secrets: VaultSecrets): string {
  const accounts: Record<string, z.infer<typeof accountSchema>> = {}
  for (const [userId, account] of Object.entries(secrets.accounts)) {
    accounts[userId] = {
      deviceId: account.deviceId, workspaceKey: account.workspaceKey ? hex(account.workspaceKey) : null,
      workspaceId: account.workspaceId, generation: account.generation, epoch: account.epoch, roster: account.roster,
      recoveryBoxSk: account.recoveryBoxSk ? hex(account.recoveryBoxSk) : null,
      recoverySignSk: account.recoverySignSk ? hex(account.recoverySignSk) : null,
    }
  }
  return JSON.stringify({
    v: 1, bindingJournalKey: secrets.bindingJournalKey ? hex(secrets.bindingJournalKey) : null, bindingJournalKeys: Object.fromEntries(Object.entries(secrets.bindingJournalKeys ?? {}).map(([id, key]) => [id, hex(key)])), accountOnly: secrets.accountOnly ?? false, deviceId: secrets.deviceId, signSk: hex(secrets.signSk), boxSk: hex(secrets.boxSk),
    workspaceKey: secrets.workspaceKey ? hex(secrets.workspaceKey) : null,
    workspaceId: secrets.workspaceId, generation: secrets.generation, epoch: secrets.epoch,
    roster: secrets.roster,
    recoveryBoxSk: secrets.recoveryBoxSk ? hex(secrets.recoveryBoxSk) : null,
    recoverySignSk: secrets.recoverySignSk ? hex(secrets.recoverySignSk) : null,
    refreshToken: secrets.refreshToken, userId: secrets.userId, accounts, pendingSecrets: secrets.pendingSecrets ?? {},
    pendingRecovery: secrets.pendingRecovery ? { ...secrets.pendingRecovery, workspaceKey: hex(secrets.pendingRecovery.workspaceKey),
      recoveryBoxSk: hex(secrets.pendingRecovery.recoveryBoxSk), recoverySignSk: hex(secrets.pendingRecovery.recoverySignSk) } : null,
  })
}

// Recovery payloads deliberately cannot express another account, an Auth token or a complete key map.
const scopedSchema = fileSchema.omit({ v: true, bindingJournalKey: true, bindingJournalKeys: true, refreshToken: true, accounts: true }).extend({
  scope: keyScopeSchema, journalKey: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
})
export function encodeScopedVault(secrets: VaultSecrets, scope: KeyScope): string {
  if (secrets.userId !== scope.accountId) throw new Error('scoped_vault_identity')
  const encoded = JSON.parse(encodeVault(secrets))
  const payload = scopedSchema.parse({ scope, journalKey: secrets.bindingJournalKeys?.[scopeId(scope)] ? hex(secrets.bindingJournalKeys[scopeId(scope)]!) : null,
    accountOnly: encoded.accountOnly, deviceId: encoded.deviceId, signSk: encoded.signSk, boxSk: encoded.boxSk,
    workspaceKey: encoded.workspaceKey, workspaceId: encoded.workspaceId, generation: encoded.generation, epoch: encoded.epoch, roster: encoded.roster,
    recoveryBoxSk: encoded.recoveryBoxSk, recoverySignSk: encoded.recoverySignSk, userId: encoded.userId,
    pendingSecrets: encoded.pendingSecrets, pendingRecovery: encoded.pendingRecovery })
  return JSON.stringify(payload)
}
export function decodeScopedVault(text: string, scope: KeyScope): VaultSecrets {
  const payload = scopedSchema.parse(JSON.parse(text)), { scope: actual, journalKey, ...fields } = payload
  if (scopeContext(actual) !== scopeContext(scope) || fields.userId !== scope.accountId) throw new Error('scoped_vault_identity')
  return decodeVault(JSON.stringify({ v: 1, ...fields, refreshToken: null, accounts: {}, bindingJournalKey: null,
    bindingJournalKeys: journalKey ? { [scopeId(scope)]: journalKey } : {} }))
}
export function filteredLegacyVault(secrets: VaultSecrets, scope: KeyScope): VaultSecrets {
  return decodeScopedVault(encodeScopedVault({ ...secrets, bindingJournalKeys: {} }, scope), scope)
}
