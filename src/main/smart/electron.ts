/**
 * [INPUT]: Electron safeStorage/shell、main 固定的设备目录与 StorageClient。
 * [OUTPUT]: createSmartService：以 OS 保护 Cipher（Linux basic_text 视为不可用）、三个固定 adapter 和只读存储读取装配 SmartInputService。
 * [POS]: 智能输入在 Electron 中的组合点；只打开预设官方控制台链接，不跟随错误 body 中的任意 URL。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { safeStorage, shell } from 'electron'
import type { StorageClient } from '../storage/client'
import { DeviceStore, type Cipher } from './credentials'
import { gatewayAdapter, systemOneAdapter } from './providers'
import { SmartInputService } from './service'
import { storageReader } from './context'

const cipher: Cipher = {
  available: () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  encrypt: text => safeStorage.encryptString(text),
  decrypt: data => safeStorage.decryptString(data),
}
export function createSmartService(directory: string, storage: () => StorageClient): SmartInputService {
  return new SmartInputService({
    store: new DeviceStore(directory, cipher), reader: storageReader(storage),
    adapters: { typesafe: systemOneAdapter('typesafe'), 'vercel-gateway': gatewayAdapter(), openrouter: systemOneAdapter('openrouter') },
    unsignedBuild: process.platform === 'darwin', openExternal: url => { void shell.openExternal(url) },
  })
}
