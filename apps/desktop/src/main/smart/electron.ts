/**
 * [INPUT]: Electron safeStorage/shell, noninteractive Keychain policy, fixed device directory and StorageClient.
 * [OUTPUT]: Shared OS cipher guarded against macOS system dialogs and the AI service composition.
 * [POS]: AI and sync credential boundary; policy failure blocks the cipher without plaintext fallback.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app, safeStorage, shell } from 'electron'
import type { StorageClient } from '../storage/client'
import { CredentialError, DeviceStore, type Cipher } from './credentials'
import { protectKeychainAccess } from '../keychain'
import { gatewayAdapter, systemOneAdapter } from './providers'
import { chatAdapter } from './insight'
import { SmartInputService } from './service'
import { storageReader } from './context'

export const deviceCipher: Cipher = {
  available: () => protectKeychainAccess() && safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  encrypt: text => {
    if (!protectKeychainAccess()) throw new CredentialError('unavailable')
    return safeStorage.encryptString(text)
  },
  decrypt: data => {
    if (!protectKeychainAccess()) throw new CredentialError('unavailable')
    return safeStorage.decryptString(data)
  },
}
export function createSmartService(directory: string, storage: () => StorageClient, onSyncedSettings?: (entries: { key: string; value: unknown }[]) => void): SmartInputService {
  return new SmartInputService({
    store: new DeviceStore(directory, deviceCipher), reader: storageReader(storage),
    adapters: { 'vercel-gateway': gatewayAdapter(), openrouter: systemOneAdapter('openrouter') }, chat: { openrouter: chatAdapter('openrouter'), 'vercel-gateway': chatAdapter('vercel-gateway') },
    unsignedBuild: process.platform === 'darwin' && !app.isPackaged, openExternal: url => { void shell.openExternal(url) },
    ...(onSyncedSettings ? { onSyncedSettings } : {}),
  })
}
