/**
 * [INPUT]: Electron safeStorage/shell, noninteractive Keychain policy, fixed device directory and StorageClient.
 * [OUTPUT]: Shared OS cipher with typed native-access failures, guarded against macOS system dialogs, and the BYOK/hosted AI service composition with main-only account access.
 * [POS]: AI and sync credential boundary; policy failure blocks the cipher without plaintext fallback.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { join } from 'node:path'
import { HostedAttempts } from './attempts'
import { app, safeStorage, shell } from 'electron'
import type { StorageClient } from '../storage/client'
import { CredentialError, DeviceStore, type Cipher } from './credentials'
import { protectKeychainAccess } from '../keychain'
import { gatewayAdapter, systemOneAdapter } from './providers'
import { chatAdapter } from './insight'
import { SmartInputService } from './service'
import { hostedAdapters, hostedEligibility, type HostedAccount } from './hosted'
import { storageReader } from './context'

export const deviceCipher: Cipher = {
  available: () => protectKeychainAccess() && safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  encrypt: text => {
    if (!protectKeychainAccess()) throw new CredentialError('unavailable')
    return safeStorage.encryptString(text)
  },
  decrypt: data => {
    if (!protectKeychainAccess()) throw new CredentialError('unavailable')
    try { return safeStorage.decryptString(data) }
    catch { throw new CredentialError('unavailable') }
  },
}
export function createSmartService(directory: string, storage: () => StorageClient, onSyncedSettings?: (entries: { key: string; value: unknown }[]) => void, account?: HostedAccount): SmartInputService {
  const attempts = new HostedAttempts(join(directory, 'hosted-attempts.json'))
  const hosted = account ? hostedAdapters(account, attempts) : null
  return new SmartInputService({
    hostedAttempts: attempts, store: new DeviceStore(directory, deviceCipher, account?.id), reader: storageReader(storage),
    adapters: { ...(hosted ? { hosted: hosted.evaluate } : {}), 'vercel-gateway': gatewayAdapter(), openrouter: systemOneAdapter('openrouter') }, chat: { ...(hosted ? { hosted: hosted.chat } : {}), openrouter: chatAdapter('openrouter'), 'vercel-gateway': chatAdapter('vercel-gateway') },
    ...(account ? { hostedEligibility: () => hostedEligibility(account) } : {}),
    unsignedBuild: process.platform === 'darwin' && !app.isPackaged, openExternal: url => { void shell.openExternal(url) },
    completeCreation: async command => {
      try { return await storage().call('command', command) }
      catch (error) {
        const receipt = await storage().call<import('../../shared/contracts/commands').CommandResult | null>('query', { type: 'receipt', operationId: command.operationId, generation: command.generation }).catch(() => null)
        if (receipt) return receipt
        throw error
      }
    },
    ...(onSyncedSettings ? { onSyncedSettings } : {}),
  })
}
