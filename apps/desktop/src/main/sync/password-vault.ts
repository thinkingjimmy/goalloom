/**
 * [INPUT]: Trusted immutable account/project/environment scope, an explicit password or verified workspace recovery key.
 * [OUTPUT]: Scope-authenticated password/recovery custody with filtered device state and verified atomic writes.
 * [POS]: Existing recovery container; original formal v1 files remain readable and unchanged, never cross-account key stores.
 */
import { renameSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { guardedAtomicJson } from '../storage/atomic-json'
import { join } from 'node:path'
import { z } from 'zod'
import { canonicalJson } from '@goalloom/contracts'
import { deriveSyncKek, sha256Hex, hex, syncPasswordKdf, systemRandom, wipe, type SyncKdfParams } from '@goalloom/crypto'
import { SyncFailure } from '@goalloom/sync'
import { decodeVault, decodeScopedVault, encodeScopedVault, filteredLegacyVault, type VaultSecrets } from './vault'
import { keyScopeSchema, scopeContext, scopeDirectory, scopeId, type KeyScope } from './key-scope'
import { openLocal, sealLocal } from './sealed-file'

const fields = {
  userId: z.uuid(), workspaceId: z.uuid(),
  kdf: z.strictObject({ alg: z.literal('argon2id'), salt: z.string().regex(/^[a-f0-9]{32}$/), m: z.number().int().min(8192).max(65536), t: z.number().int().min(1).max(4), p: z.literal(1) }),
  lock: z.string().max(512), body: z.string().max(2_000_000),
}
const legacySchema = z.strictObject({ v: z.literal(1), ...fields })
const schema = z.strictObject({ v: z.literal(2), scope: keyScopeSchema, ...fields })
type File = z.infer<typeof schema> | z.infer<typeof legacySchema>

export class PasswordVault {
  private kek: Uint8Array | null = null
  private kdf: SyncKdfParams | null = null
  private writing: Promise<void> = Promise.resolve()
  private revision = 0
  private consumedPreparation = -1
  readonly scope: KeyScope | undefined
  constructor(private directory: string, scope?: KeyScope, private preparedFor?: string) {
    this.scope = scope ? Object.freeze(keyScopeSchema.parse(scope)) : undefined
    if (preparedFor) z.uuid().parse(preparedFor)
  }
  get path(): string { return join(this.scope ? scopeDirectory(this.directory, this.scope) : this.directory, this.preparedFor ? `sync-password-${this.preparedFor}.bin` : 'sync-password.bin') }
  private context(file: File): string { return file.v === 1 ? `vault|${file.userId}|${file.workspaceId}` : `vault/v2|${scopeContext(file.scope)}|${file.workspaceId}` }
  private bodyContext(file: File): string { return file.v === 1 ? this.context(file) : `${this.context(file)}|lock:${sha256Hex(canonicalJson({ kdf: file.kdf, lock: file.lock }))}` }
  get prepared(): boolean { return Boolean(this.kek && this.kdf && this.consumedPreparation !== this.revision) }
  async exists(): Promise<boolean> { await this.writing; return Boolean(await this.readAt(this.path, false)) }
  async identity(): Promise<{ userId: string; workspaceId: string } | null> {
    const file = await this.read()
    return file ? { userId: file.userId, workspaceId: file.workspaceId } : null
  }
  async prepare(password: string): Promise<void> {
    const revision = this.revision
    const kdf: SyncKdfParams = { ...syncPasswordKdf, salt: hex(systemRandom().bytes(16)) }
    const { alg, salt, m, t, p } = kdf, kek = await deriveSyncKek(password, kdf)
    if (revision !== this.revision) { wipe(kek); throw new SyncFailure('cancelled') }
    this.forget(); this.kek = kek; this.kdf = { alg, salt, m, t, p }
  }
  async unlock(password: string, userId: string): Promise<VaultSecrets | null> {
    const file = await this.read()
    if (!file) { await this.prepare(password); return null }
    if (file.userId !== userId || this.scope && this.scope.accountId !== userId) throw new SyncFailure('mismatch')
    const kek = await deriveSyncKek(password, file.kdf)
    let key: Buffer
    try { key = openLocal(kek, `${this.context(file)}|password`, Buffer.from(file.lock, 'base64')) }
    catch { wipe(kek); await this.prepare(password); return null }
    try {
      const secrets = this.decode(file, key)
      this.forget(); this.kek = kek; this.kdf = file.kdf; this.consumedPreparation = this.revision
      return secrets
    } catch (error) { wipe(kek); throw error }
    finally { wipe(key) }
  }
  async recover(key: Uint8Array, userId: string, workspaceId: string): Promise<VaultSecrets | null> {
    const file = await this.read()
    if (!file) return null
    if (file.userId !== userId || file.workspaceId !== workspaceId || this.scope && this.scope.accountId !== userId) throw new SyncFailure('mismatch')
    return this.decode(file, key)
  }
  private decode(file: File, key: Uint8Array): VaultSecrets {
    try {
      const plain = openLocal(key, this.bodyContext(file), Buffer.from(file.body, 'base64'))
      try {
        const secrets = file.v === 2 ? decodeScopedVault(plain.toString(), this.scope!) : decodeVault(plain.toString())
        if (secrets.userId !== file.userId || (secrets.workspaceId ?? secrets.pendingRecovery?.workspaceId) !== file.workspaceId) throw Error('Invalid vault identity')
        const storedKey = secrets.recoveryBoxSk ?? secrets.pendingRecovery?.recoveryBoxSk
        if (!storedKey || !Buffer.from(storedKey).equals(key)) throw Error('Invalid recovery key')
        return file.v === 1 && this.scope ? filteredLegacyVault(secrets, this.scope) : secrets
      } finally { wipe(plain) }
    } catch { throw new SyncFailure('storage') }
  }
  async save(secrets: VaultSecrets): Promise<void> {
    const scope = this.scope, workspaceId = secrets.workspaceId ?? secrets.pendingRecovery?.workspaceId
    const originalKey = secrets.recoveryBoxSk ?? secrets.pendingRecovery?.recoveryBoxSk
    if (!scope || !workspaceId || !originalKey || secrets.userId !== scope.accountId) throw new SyncFailure('storage')
    const key = Buffer.from(originalKey), plain = Buffer.from(encodeScopedVault(secrets, scope))
    const originalKek = this.kek, kek = originalKek ? Buffer.from(originalKek) : null, kdf = this.kdf ? { ...this.kdf } : null
    const path = this.path, revision = this.revision, expectedMaster = secrets.bindingJournalKeys?.[scopeId(scope)] ? Buffer.from(secrets.bindingJournalKeys[scopeId(scope)]!) : null
    const writing = this.writing.then(async () => {
      if (revision !== this.revision) throw new SyncFailure('cancelled')
      const current = await this.readAt(path, false)
      const identity = { v: 2 as const, scope, userId: scope.accountId, workspaceId }
      let lock: string, params: File['kdf']
      if (kek && kdf && this.consumedPreparation !== revision) {
        params = fields.kdf.parse(kdf); lock = sealLocal(kek, `${this.context({ ...identity, kdf: params, lock: '', body: '' })}|password`, key).toString('base64')
      } else {
        if (!current || current.v !== 2 || current.workspaceId !== workspaceId) throw new SyncFailure('storage')
        this.decode(current, key)
        params = current.kdf; lock = current.lock
      }
      const file = { ...identity, kdf: params, lock, body: sealLocal(key, this.bodyContext({ ...identity, kdf: params, lock, body: '' }), plain).toString('base64') }
      await mkdir(scopeDirectory(this.directory, scope), { recursive: true, mode: 0o700 })
      let failed: unknown
      try { await guardedAtomicJson(path, file, async () => {}, () => { if (revision !== this.revision) throw new SyncFailure('cancelled') }) } catch (error) { failed = error }
      // A lost write result is resolved with the original key, never a replacement master.
      const stored = await this.readAt(path, false)
      if (!stored || stored.v !== 2 || stored.workspaceId !== workspaceId) throw failed ?? new SyncFailure('storage')
      const restored = this.decode(stored, key), actual = restored.bindingJournalKeys?.[scopeId(scope)]
      if (expectedMaster ? !actual || !Buffer.from(actual).equals(expectedMaster) : actual !== undefined) throw failed ?? new SyncFailure('storage')
      if (failed && stored.body !== file.body) throw failed
      if (kek && kdf && revision === this.revision) {
        this.consumedPreparation = revision
        if (this.kek === originalKek) { if (this.kek) wipe(this.kek); this.kek = null; this.kdf = null }
      }
    }).finally(() => { wipe(key); wipe(plain); if (kek) wipe(kek); if (expectedMaster) wipe(expectedMaster) })
    this.writing = writing.catch(() => {})
    try { await writing } catch { throw new SyncFailure('storage') }
  }
  async settle(): Promise<void> { await this.writing }
  forget(): void { this.revision++; if (this.kek) wipe(this.kek); this.kek = null; this.kdf = null }
  async promote(prepared: PasswordVault, secrets: VaultSecrets, guard: () => void): Promise<void> {
    const scope = this.scope, workspaceId = secrets.workspaceId, key = secrets.recoveryBoxSk
    if (!scope || !prepared.preparedFor || !workspaceId || !key || scopeContext(scope) !== scopeContext(prepared.scope!)) throw new SyncFailure('storage')
    const master = secrets.bindingJournalKeys?.[scopeId(scope)], deviceId = secrets.deviceId, generation = secrets.generation
    const expected = (file: File | null) => {
      if (!file || file.v !== 2 || file.workspaceId !== workspaceId) return false
      const saved = this.decode(file, key), stored = saved.bindingJournalKeys?.[scopeId(scope)]
      return saved.deviceId === deviceId && saved.generation === generation && Boolean(master && stored && Buffer.from(master).equals(stored))
    }
    const work = this.writing.then(async () => {
      const source = await prepared.readAt(prepared.path, false)
      if (!source) { if (!expected(await this.readAt(this.path, false))) throw new SyncFailure('storage'); guard(); return }
      if (!expected(source)) throw new SyncFailure('storage')
      guard()
      this.forget()
      try { renameSync(prepared.path, this.path) }
      catch (error) { if (!expected(await this.readAt(this.path, false))) throw error }
      if (!expected(await this.readAt(this.path, false))) throw new SyncFailure('storage')
      guard()
    })
    this.writing = work.catch(() => {})
    await work
  }
  private async read(): Promise<File | null> {
    await this.writing
    const current = await this.readAt(this.path, false)
    if (current || !this.scope || this.preparedFor) return current
    return this.readAt(join(this.directory, 'sync-password.bin'), true)
  }
  private async readAt(path: string, legacy: boolean): Promise<File | null> {
    try {
      const bytes = await readFile(path)
      if (bytes.length > 2_100_000) throw Error('Invalid protected file')
      const file = legacy || !this.scope ? legacySchema.parse(JSON.parse(bytes.toString())) : schema.parse(JSON.parse(bytes.toString()))
      if (this.scope && (file.userId !== this.scope.accountId || file.v === 2 && scopeContext(file.scope) !== scopeContext(this.scope))) throw Error('Invalid protected scope')
      return file
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
      throw new SyncFailure('storage')
    }
  }
}
