/**
 * [INPUT]: 唯一窗口、可信 URL 与内部 StorageClient。
 * [OUTPUT]: 有限查询/命令/原生导出对话框、语言偏好读写（同步 main 与 worker 文案）与独立智能输入通道；main/worker 双重验证。
 * [POS]: renderer 权限边界；文件路径只来自本机原生对话框。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { commandSchema, DomainError, type CommandResult } from '../shared/contracts/commands'
import { querySchema } from '../shared/contracts/queries'
import { languageChannel, runtimeChannel, runtimeInfoSchema } from '../shared/contracts/runtime'
import { languageSchema } from '../shared/i18n/locale'
import type { LanguagePreference } from './window/language'
import { isTrustedFrameUrl } from './security'
import type { StorageClient } from './storage/client'
import { dataActionSchema } from '../shared/contracts/transfer'
import { atomicJson } from './storage/atomic-json'
import { smartChannel } from '../shared/contracts/smart-input'
import type { SmartInputService } from './smart/service'
import { serverText } from '../shared/i18n/server'

export function registerIpc(window: () => BrowserWindow | null, trustedUrl: string, storage: StorageClient, smart: SmartInputService, language: LanguagePreference, changed: () => void): void {
  const guard = (event: IpcMainInvokeEvent) => {
    const current = window()
    if (!current || event.sender !== current.webContents || event.senderFrame !== current.webContents.mainFrame || !isTrustedFrameUrl(event.senderFrame.url, trustedUrl)) throw new Error(serverText().storage.invalidSource)
  }
  ipcMain.handle(runtimeChannel, async (event, ...args: unknown[]) => {
    guard(event)
    if (args.length) throw new Error(serverText().storage.invalidRequest)
    const { sqlite } = await storage.call<{ sqlite: string }>('runtime')
    return runtimeInfoSchema.parse({ sqlite, electron: process.versions.electron, node: process.versions.node, platform: process.platform, arch: process.arch })
  })
  ipcMain.handle(languageChannel, async (event, ...args: unknown[]) => {
    guard(event)
    if (args.length === 0) return language.state
    if (args.length !== 1) throw new Error(serverText().storage.invalidRequest)
    const state = await language.set(languageSchema.parse(args[0]))
    await storage.call('locale', state.locale)
    return state
  })
  ipcMain.handle('goalloom:query', async (event, input: unknown) => { guard(event); return storage.call('query', querySchema.parse(input)) })
  ipcMain.handle('goalloom:command', async (event, input: unknown) => {
    guard(event)
    try {
      const result = await storage.call<CommandResult>('command', commandSchema.parse(input))
      if (result.changed) changed()
      return { ok: true, result }
    }
    catch (error) { return { ok: false, code: error instanceof DomainError ? error.code : 'invalid', message: error instanceof DomainError ? error.message : serverText().storage.invalidRequest } }
  })
  // Separate async channel: cloud waits never enter the serial storage queue or hold a transaction.
  ipcMain.handle(smartChannel, async (event, input: unknown) => { guard(event); return smart.handle(input) })
  ipcMain.handle('goalloom:export', async event => {
    guard(event)
    const selected = await dialog.showSaveDialog(window()!, { title: serverText().dialogs.exportTitle, defaultPath: 'Goalloom-workspace.json', filters: [{ name: 'Goalloom JSON', extensions: ['json'] }] })
    if (selected.canceled || !selected.filePath) return false
    await atomicJson(selected.filePath, await storage.call('export'))
    return true
  })
  ipcMain.handle('goalloom:data', async (event, input: unknown) => {
    guard(event)
    const action = dataActionSchema.parse(input)
    if (action.type !== 'chooseImport') return storage.call('data', action)
    const choice = await dialog.showOpenDialog(window()!, { title: serverText().dialogs.importTitle, properties: ['openFile'], filters: [{ name: 'Goalloom JSON / SQLite', extensions: ['json', 'sqlite'] }] })
    const path = choice.filePaths[0]
    if (choice.canceled || !path) return { type: 'cancelled' }
    if ((await stat(path)).size > 100 * 1024 * 1024) throw new Error(serverText().dialogs.importTooLarge)
    // One picker for both formats; the extension decides, and each importer still validates the content.
    const format = extname(path).toLowerCase() === '.json' ? 'json' : 'sqlite'
    const source = format === 'json' ? { content: JSON.parse(await readFile(path, 'utf8')) } : { path }
    return storage.call('previewImport', { generation: action.generation, format, ...source })
  })
}
