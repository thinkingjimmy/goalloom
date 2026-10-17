/**
 * [INPUT]: Google account identity, a sync password or a verified cloud recovery key, and the private profile directory.
 * [OUTPUT]: Password-wrapped recovery keys and encrypted device credentials, with atomic serialized writes.
 * [POS]: No-Keychain recovery store. The original OS vault is preserved; password changes can recover through the cloud key.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { deriveSyncKek, hex, syncPasswordKdf, systemRandom, wipe, type SyncKdfParams } from '@goalloom/crypto'
import { SyncFailure } from '@goalloom/sync'
import { decodeVault, encodeVault, type VaultSecrets } from './vault'
import { openLocal, sealLocal } from './sealed-file'

const schema = z.strictObject({
  v: z.literal(1), userId: z.uuid(), workspaceId: z.uuid(),
  kdf: z.strictObject({ alg: z.literal('argon2id'), salt: z.string().regex(/^[a-f0-9]{32}$/), m: z.number().int().min(8192).max(65536), t: z.number().int().min(1).max(4), p: z.literal(1) }),
  lock: z.string().max(512), body: z.string().max(2_000_000),
})
type File = z.infer<typeof schema>

export class PasswordVault {
  private kek: Uint8Array | null = null
  private kdf: SyncKdfParams | null = null
  private writing: Promise<void> = Promise.resolve()
  constructor(private directory: string) {}
  private get path() { return join(this.directory, 'sync-password.bin') }
  private context(file: Pick<File, 'userId' | 'workspaceId'>) { return `vault|${file.userId}|${file.workspaceId}` }
  async identity(): Promise<{ userId: string; workspaceId: string } | null> {
    const file = await this.read()
    return file ? { userId: file.userId, workspaceId: file.workspaceId } : null
  }
  async prepare(password: string): Promise<void> {
    const kdf: SyncKdfParams = { ...syncPasswordKdf, salt: hex(systemRandom().bytes(16)) }
    // The stored schema contains only Argon2's input parameters.
    const { alg, salt, m, t, p } = kdf
    const kek = await deriveSyncKek(password, kdf)
    this.forget(); this.kek = kek; this.kdf = { alg, salt, m, t, p }
  }
  async unlock(password: string, userId: string): Promise<VaultSecrets | null> {
    const file = await this.read()
    if (!file) { await this.prepare(password); return null }
    if (file.userId !== userId) throw new SyncFailure('mismatch')
    const kek = await deriveSyncKek(password, file.kdf)
    let key: Buffer
    try { key = openLocal(kek, `${this.context(file)}|password`, Buffer.from(file.lock, 'base64')) }
    catch { wipe(kek); await this.prepare(password); return null }
    try {
      const secrets = this.decode(file, key)
      this.forget(); this.kek = kek; this.kdf = file.kdf
      return secrets
    } catch (error) { wipe(kek); throw error }
    finally { wipe(key) }
  }
  async recover(key: Uint8Array, userId: string, workspaceId: string): Promise<VaultSecrets | null> {
    const file = await this.read()
    if (!file) return null
    if (file.userId !== userId || file.workspaceId !== workspaceId) throw new SyncFailure('mismatch')
    return this.decode(file, key)
  }
  private decode(file: File, key: Uint8Array): VaultSecrets {
    try {
      const plain = openLocal(key, this.context(file), Buffer.from(file.body, 'base64'))
      try {
        const secrets = decodeVault(plain.toString())
        if (secrets.userId !== file.userId || (secrets.workspaceId ?? secrets.pendingRecovery?.workspaceId) !== file.workspaceId) throw Error('Invalid vault identity')
        const storedKey = secrets.recoveryBoxSk ?? secrets.pendingRecovery?.recoveryBoxSk
        if (!storedKey || !Buffer.from(storedKey).equals(key)) throw Error('Invalid recovery key')
        return secrets
      } finally { wipe(plain) }
    } catch { throw new SyncFailure('storage') }
  }
  async save(secrets: VaultSecrets): Promise<void> {
    const workspaceId = secrets.workspaceId ?? secrets.pendingRecovery?.workspaceId
    const key = secrets.recoveryBoxSk ?? secrets.pendingRecovery?.recoveryBoxSk
    if (!this.kek || !this.kdf || !workspaceId || !key || !secrets.userId) throw new SyncFailure('storage')
    const identity = { userId: secrets.userId, workspaceId }, context = this.context(identity)
    const plain = Buffer.from(encodeVault(secrets))
    let body: string
    try { body = sealLocal(key, context, plain).toString('base64') } finally { wipe(plain) }
    const file = JSON.stringify({ v: 1, ...identity, kdf: this.kdf,
      lock: sealLocal(this.kek, `${context}|password`, key).toString('base64'), body })
    const writing = this.writing.then(async () => {
      await writeFile(`${this.path}.tmp`, file, { mode: 0o600 }); await rename(`${this.path}.tmp`, this.path)
    })
    this.writing = writing.catch(() => {})
    try { await writing } catch { throw new SyncFailure('storage') }
  }
  forget(): void { if (this.kek) wipe(this.kek); this.kek = null; this.kdf = null }
  private async read(): Promise<File | null> {
    await this.writing
    try {
      const bytes = await readFile(this.path)
      if (bytes.length > 2_100_000) throw Error('Invalid protected file')
      return schema.parse(JSON.parse(bytes.toString()))
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
      throw new SyncFailure('storage')
    }
  }
}
