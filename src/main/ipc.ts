/**
 * [INPUT]: Trusted window sender, strict DTOs and an internal StorageClient.
 * [OUTPUT]: Narrow commands/queries, native-picker transfers, validated link preview/browser actions and session cancellation.
 * [POS]: Renderer permission boundary; paths never come from renderer input and stale sessions cannot resume maintenance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { extname } from 'node:path'
import { commandSchema, DomainError, type CommandResult } from '../shared/contracts/commands'
import { querySchema, type WorkspaceMetadata } from '../shared/contracts/queries'
import { languageChannel, languageSchema, runtimeChannel, runtimeInfoSchema } from '../shared/contracts/runtime'
import type { LanguagePreference } from './window/language'
import { isTrustedFrameUrl } from './security'
import type { StorageClient } from './storage/client'
import { dataActionSchema, type DataReply } from '../shared/contracts/transfer'
import { smartChannel } from '../shared/contracts/smart-input'
import type { SmartInputService } from './smart/service'
import { serverText } from '../shared/i18n/server'
import { linkActionSchema, linkChannel, linkPreviewSchema } from '../shared/contracts/link-preview'
import type { LinkPreviewService } from './link-preview/service'

export function registerIpc(window: () => BrowserWindow | null, trustedUrl: string, storage: StorageClient, smart: SmartInputService, language: LanguagePreference, links: LinkPreviewService, changed: () => void, firstWrite: Promise<void>, snapshotRead: (metadata: WorkspaceMetadata) => void): () => void {
  let rendererSession = 0
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
  ipcMain.handle('goalloom:query', async (event, input: unknown) => {
    guard(event)
    const query = querySchema.parse(input)
    const value = await storage.call('query', query)
    if (query.type === 'snapshot') snapshotRead(value as WorkspaceMetadata)
    return value
  })
  ipcMain.handle('goalloom:command', async (event, input: unknown) => {
    guard(event)
    try {
      await firstWrite
      const result = await storage.call<CommandResult>('command', commandSchema.parse(input))
      if (result.changed) { window()?.webContents.send('goalloom:changed', null); changed() }
      return { ok: true, result }
    }
    catch (error) { return { ok: false, code: error instanceof DomainError ? error.code : 'invalid', message: error instanceof DomainError ? error.message : serverText().storage.invalidRequest } }
  })
  // Separate async channel: cloud waits never enter the serial storage queue or hold a transaction.
  ipcMain.handle(smartChannel, async (event, input: unknown) => { guard(event); return smart.handle(input) })
  ipcMain.handle(linkChannel, async (event, ...args: unknown[]) => {
    guard(event)
    if (args.length !== 1) throw new Error(serverText().storage.invalidRequest)
    const action = linkActionSchema.parse(args[0])
    if (action.type === 'preview') return linkPreviewSchema.parse(await links.get(action.url))
    try { await shell.openExternal(action.url); return true } catch { return false }
  })
  ipcMain.handle('goalloom:export', async event => {
    guard(event)
    const session = rendererSession
    const selected = await dialog.showSaveDialog(window()!, { title: serverText().dialogs.exportTitle, defaultPath: 'Goalloom-workspace.json', filters: [{ name: 'Goalloom JSON', extensions: ['json'] }] })
    if (selected.canceled || !selected.filePath || session !== rendererSession) return false
    await storage.call('export', selected.filePath)
    return true
  })
  ipcMain.handle('goalloom:data', async (event, input: unknown) => {
    guard(event)
    const action = dataActionSchema.parse(input)
    if (action.type !== 'backupStatus') await firstWrite
    if (action.type !== 'chooseImport') {
      const reply = await storage.call<DataReply>('data', action)
      if (reply.type === 'replaced') { smart.releaseSession(); links.releaseSession() }
      return reply
    }
    const session = rendererSession
    const choice = await dialog.showOpenDialog(window()!, { title: serverText().dialogs.importTitle, properties: ['openFile'], filters: [{ name: 'Goalloom JSON / SQLite', extensions: ['json', 'sqlite'] }] })
    const path = choice.filePaths[0]
    if (choice.canceled || !path) return { type: 'cancelled' }
    if (session !== rendererSession) return { type: 'cancelled' }
    // One picker for both formats; the extension decides, and each importer still validates the content.
    const format = extname(path).toLowerCase() === '.json' ? 'json' : 'sqlite'
    return storage.call('previewImport', { generation: action.generation, format, path })
  })
  return () => {
    rendererSession++
    smart.releaseSession()
    links.releaseSession()
    // Queued after accepted preparation/writes and before a replacement renderer's requests.
    void storage.call('releaseTransfer').catch(() => undefined)
  }
}
