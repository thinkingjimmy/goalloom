/**
 * [INPUT]: 唯一窗口、可信 URL 与内部 StorageClient。
 * [OUTPUT]: 有限查询/命令/原生导出对话框；main/worker 双重验证。
 * [POS]: renderer 权限边界；文件路径只来自本机原生对话框。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { commandSchema, DomainError, type CommandResult } from '../shared/contracts/commands'
import { querySchema } from '../shared/contracts/queries'
import { runtimeChannel, runtimeInfoSchema } from '../shared/contracts/runtime'
import { isTrustedFrameUrl } from './security'
import type { StorageClient } from './storage/client'
import { dataActionSchema } from '../shared/contracts/transfer'
import { atomicJson } from './storage/atomic-json'

export function registerIpc(window: () => BrowserWindow | null, trustedUrl: string, storage: StorageClient, changed: () => void): void {
  const guard = (event: IpcMainInvokeEvent) => {
    const current = window()
    if (!current || event.sender !== current.webContents || event.senderFrame !== current.webContents.mainFrame || !isTrustedFrameUrl(event.senderFrame.url, trustedUrl)) throw new Error('请求来源无效')
  }
  ipcMain.handle(runtimeChannel, async (event, ...args: unknown[]) => {
    guard(event)
    if (args.length) throw new Error('请求参数无效')
    const { sqlite } = await storage.call<{ sqlite: string }>('runtime')
    return runtimeInfoSchema.parse({ sqlite, electron: process.versions.electron, node: process.versions.node, platform: process.platform, arch: process.arch })
  })
  ipcMain.handle('goalloom:query', async (event, input: unknown) => { guard(event); return storage.call('query', querySchema.parse(input)) })
  ipcMain.handle('goalloom:command', async (event, input: unknown) => {
    guard(event)
    try {
      const result = await storage.call<CommandResult>('command', commandSchema.parse(input))
      if (result.changed) changed()
      return { ok: true, result }
    }
    catch (error) { return { ok: false, code: error instanceof DomainError ? error.code : 'invalid', message: error instanceof DomainError ? error.message : '请求参数无效' } }
  })
  ipcMain.handle('goalloom:export', async event => {
    guard(event)
    const selected = await dialog.showSaveDialog(window()!, { title: '导出完整工作区', defaultPath: 'Goalloom-workspace.json', filters: [{ name: 'Goalloom JSON', extensions: ['json'] }] })
    if (selected.canceled || !selected.filePath) return false
    await atomicJson(selected.filePath, await storage.call('export'))
    return true
  })
  ipcMain.handle('goalloom:data', async (event, input: unknown) => {
    guard(event)
    const action = dataActionSchema.parse(input)
    if (action.type !== 'chooseImport') return storage.call('data', action)
    const choice = await dialog.showOpenDialog(window()!, { title: '选择工作区恢复文件', properties: ['openFile'], filters: [{ name: action.format === 'json' ? 'Goalloom JSON' : 'Goalloom SQLite', extensions: [action.format === 'json' ? 'json' : 'sqlite'] }] })
    const path = choice.filePaths[0]
    if (choice.canceled || !path) return { type: 'cancelled' }
    if ((await stat(path)).size > 100 * 1024 * 1024) throw new Error('文件超过 100 MB 导入限制')
    const source = action.format === 'json' ? { content: JSON.parse(await readFile(path, 'utf8')) } : { path }
    return storage.call('previewImport', { generation: action.generation, format: action.format, ...source })
  })
}
