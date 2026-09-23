/**
 * [INPUT]: Electron 生命周期、安全策略、内部存储 worker、严格共享 DTO。
 * [OUTPUT]: 单实例窗口、受限读写 IPC 与持久化存储 worker。
 * [POS]: 应用组合根，协调权限/存储/窗口，不承载领域规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { app, BrowserWindow, protocol, session } from 'electron'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StorageClient } from './storage-client'
import { registerIpc } from './ipc'
import { appOrigin, restrictSession, restrictWindow, serveResource } from './security'

const directory = fileURLToPath(new URL('.', import.meta.url))
const developmentUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
const trustedUrl = developmentUrl ?? `${appOrigin}/index.html`
app.setName('Goalloom')
app.setAppUserModelId('com.goalloom.desktop')
// --- 默认身份稳定；标准 Chromium profile 参数用于隔离运行，不通过 IPC 暴露。 ---
const profile = app.commandLine.getSwitchValue('user-data-dir')
app.setPath('userData', profile ? resolve(profile) : join(app.getPath('appData'), 'Goalloom'))
protocol.registerSchemesAsPrivileged([{ scheme: 'goalloom', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

let window: BrowserWindow | null = null

let storage: StorageClient | null = null

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1280, height: 840, minWidth: 720, minHeight: 540, show: false,
    title: 'Goalloom', backgroundColor: '#f7f7f2',
    webPreferences: {
      preload: join(directory, '../preload/index.cjs'), contextIsolation: true,
      sandbox: true, nodeIntegration: false, webSecurity: true, webviewTag: false,
      devTools: !app.isPackaged,
    },
  })
  restrictWindow(window)
  window.once('ready-to-show', () => window?.show())
  window.on('closed', () => { window = null })
  await window.loadURL(trustedUrl)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore()
    window?.show()
    window?.focus()
  })
  app.whenReady().then(async () => {
    restrictSession(session.defaultSession)
    protocol.handle('goalloom', request => serveResource(join(directory, '../renderer'), request))
    storage = new StorageClient(join(directory, 'storage.js'), join(app.getPath('userData'), 'workspace.sqlite'), join(app.getPath('userData'), 'backups'))
    registerIpc(() => window, trustedUrl, storage)
    await createWindow()
    app.on('activate', () => { if (!window) void createWindow() })
  }).catch(() => { app.exit(1) })
  let drained = false
  app.on('before-quit', event => {
    if (drained || !storage) return
    event.preventDefault()
    void storage.close().finally(() => { drained = true; app.quit() })
  })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
