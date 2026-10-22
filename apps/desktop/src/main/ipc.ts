/**
 * [INPUT]: Trusted window sender, strict DTOs and an internal StorageClient.
 * [OUTPUT]: Narrow commands/queries, immediate device placement preference updates, native-picker transfers, validated link preview/browser actions, fixed update actions and session cancellation.
 * [POS]: Renderer permission boundary; paths never come from renderer input and stale sessions cannot resume maintenance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { isRendererSettingKey, parseSetting } from '@goalloom/contracts'
import { commandSchema, DomainError, type Command, type CommandResult } from '../shared/contracts/commands'
import { querySchema, type WorkspaceMetadata } from '../shared/contracts/queries'
import { devicePrefsChannel, devicePrefsReportSchema, languageChannel, languageSchema, parentOrderChannel, parentOrderRequestSchema, runtimeChannel, runtimeInfoSchema } from '../shared/contracts/runtime'
import type { LanguagePreference } from './window/language'
import type { ParentOrderPreference } from './window/parent-order'
import { isTrustedFrameUrl } from './security'
import type { StorageClient } from './storage/client'
import { dataActionSchema, type DataReply } from '../shared/contracts/transfer'
import { smartChannel } from '../shared/contracts/smart-input'
import type { SmartInputService } from './smart/service'
import { serverText } from '../shared/i18n/server'
import { linkActionSchema, linkChannel, linkPreviewSchema } from '../shared/contracts/link-preview'
import type { LinkPreviewService } from './link-preview/service'
import { updateActionSchema, updateChannel, updateInfoSchema } from '../shared/contracts/update'
import type { UpdateService } from './update'
import { syncChannel } from '../shared/contracts/sync'
import type { SyncService } from './sync/service'

export function registerIpc(window: () => BrowserWindow | null, trustedUrl: string, storage: StorageClient, smart: SmartInputService, language: LanguagePreference, parentOrder: ParentOrderPreference, links: LinkPreviewService, updates: UpdateService, sync: SyncService, changed: () => void, firstWrite: Promise<void>, snapshotRead: (metadata: WorkspaceMetadata) => void): () => void {
  let rendererSession = 0
  smart.onCaptureChanged(() => { window()?.webContents.send('goalloom:changed', null); changed() })
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
    try {
      await storage.call('sync', { type: 'emit-settings', opId: randomUUID(), at: new Date().toISOString(), mode: 'change', entries: [{ key: 'language', value: state.language }] })
      changed()
    } catch { /* The language is saved on this device. The next change reports it again. */ }
    return state
  })
  ipcMain.handle(devicePrefsChannel, async (event, ...args: unknown[]) => {
    guard(event)
    if (args.length === 0) {
      const rows = await storage.call<{ key: string; value: unknown }[]>('sync', { type: 'settings' })
      return (Array.isArray(rows) ? rows : []).filter(row => isRendererSettingKey(row.key)).map(row => ({ key: row.key, value: row.key === 'parentOrder' ? parentOrder.enabled : row.value }))
    }
    if (args.length !== 1) throw new Error(serverText().storage.invalidRequest)
    const report = devicePrefsReportSchema.parse(args[0])
    const entries = report.entries.map(entry => {
      if (!isRendererSettingKey(entry.key)) throw new Error(serverText().storage.invalidRequest)
      const setting = parseSetting(entry.key, entry.value)
      return { key: setting.key, value: setting.value }
    })
    const placement = entries.find(entry => entry.key === 'parentOrder')
    if (report.mode === 'change' && placement && typeof placement.value === 'boolean') await parentOrder.set(placement.value)
    await storage.call('sync', { type: 'emit-settings', opId: randomUUID(), at: new Date().toISOString(), mode: report.mode, entries })
    changed()
    return null
  })
  ipcMain.handle(parentOrderChannel, async (event, ...args: unknown[]) => {
    guard(event)
    if (args.length !== 1) throw new Error(serverText().storage.invalidRequest)
    const request = parentOrderRequestSchema.parse(args[0])
    if (request.type === 'initialize') return parentOrder.initialize(request.enabled)
    const at = new Date().toISOString(), opId = randomUUID()
    const enabled = await parentOrder.set(request.enabled)
    try {
      await firstWrite
      await storage.call('sync', { type: 'emit-settings', opId, at, mode: 'change', entries: [{ key: 'parentOrder', value: enabled }] })
      sync.nudge('write')
    } catch { /* The device preference remains saved; a later change can report it again. */ }
    return parentOrder.enabled
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
    let parsed: Command | null = null
    try {
      await firstWrite
      const command = commandSchema.parse(input)
      parsed = command
      smart.observeCommand(command)
      const selection = smart.prepareCreation(command)
      if (command.type === 'applyAssistance' && command.contextId) {
        const receipt = await storage.call<CommandResult | null>('query', { type: 'receipt', operationId: command.operationId, generation: command.generation })
        if (!receipt) await smart.validateAssistanceApply(command)
      }
      const captured = (command.type === 'create' || command.type === 'createPlan') && command.smartCapture
      const result = captured ? await storage.call<CommandResult>('capturedCommand', { command, ...(selection ? { selection } : {}) })
        : await storage.call<CommandResult>('command', command)
      smart.created(command, result)
      if (result.changed) { window()?.webContents.send('goalloom:changed', null); changed() }
      return { ok: true, result }
    }
    catch (error) {
      if (parsed && error instanceof DomainError && ['invalid', 'stale', 'stale_preview', 'conflict', 'generation', 'setup', 'maintenance'].includes(error.code)) smart.creationFailed(parsed)
      return { ok: false, code: error instanceof DomainError ? error.code : 'invalid', message: error instanceof DomainError ? error.message : serverText().storage.invalidRequest }
    }
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
  ipcMain.handle(syncChannel, async (event, input: unknown) => { guard(event); return sync.handle(input) })
  ipcMain.handle(updateChannel, async (event, ...args: unknown[]) => {
    guard(event)
    if (args.length !== 1) throw new Error(serverText().storage.invalidRequest)
    const action = updateActionSchema.parse(args[0])
    if (action === 'install') updates.install()
    return updateInfoSchema.parse(action === 'check' ? await updates.check(true) : updates.info)
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
      if (reply.type === 'replaced') { sync.workspaceReplaced(); smart.releaseSession(); links.releaseSession() }
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
