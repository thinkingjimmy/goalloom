/**
 * [INPUT]: A private profile and the current OS-protected session cipher.
 * [OUTPUT]: Protected current sessions and durable noninteractive sign-out.
 * [POS]: Session storage policy. It never opens or migrates retired credential files.
 */
import type { Cipher } from '../smart/credentials'
import { SyncVault, type VaultSecrets } from './vault'

export class SessionVault {
  private current: SyncVault
  constructor(directory: string, cipher: Cipher) { this.current = new SyncVault(directory, cipher, 'sync-session.bin') }
  get available(): boolean { return this.current.available }
  load(options: { resumeOnly?: boolean; signal?: AbortSignal } = {}): Promise<VaultSecrets | null> { return this.current.load(options) }
  save(secrets: VaultSecrets): Promise<void> { return this.current.save(secrets) }
  signOut(): Promise<void> { return this.current.signOut() }
}
