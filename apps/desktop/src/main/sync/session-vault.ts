/**
 * [INPUT]: Private profile, current OS cipher and optional legacy Safe Storage cipher.
 * [OUTPUT]: Authoritative protected sessions, one-way legacy migration and durable noninteractive sign-out.
 * [POS]: Session storage policy. Old ciphertext and password recovery are preserved during migration.
 */
import type { Cipher } from '../smart/credentials'
import { SyncVault, type VaultSecrets } from './vault'

export class SessionVault {
  private current: SyncVault
  private legacy: SyncVault | null
  constructor(directory: string, legacyCipher: Cipher, sessionCipher?: Cipher) {
    this.current = new SyncVault(directory, sessionCipher ?? legacyCipher, sessionCipher ? 'sync-session.bin' : 'sync-vault.bin')
    this.legacy = sessionCipher ? new SyncVault(directory, legacyCipher) : null
  }
  get available(): boolean { return this.current.available }
  async load(options: { resumeOnly?: boolean; signal?: AbortSignal; passwordFallback?: boolean } = {}): Promise<VaultSecrets | null> {
    if (await this.current.exists()) return this.current.load(options)
    if (options.passwordFallback || !this.legacy) return null
    const secrets = await this.legacy.load({ ...options, migrateLegacy: false })
    options.signal?.throwIfAborted()
    if (secrets) await this.current.save(secrets)
    return secrets
  }
  save(secrets: VaultSecrets): Promise<void> { return this.current.save(secrets) }
  async signOut(): Promise<void> {
    // A present current file is authoritative, including its inactive flag.
    // Waiting for queued saves before checking existence prevents a first-save race.
    if (await this.current.exists() || !this.legacy) await this.current.signOut()
    else await this.legacy.signOut()
  }
}
