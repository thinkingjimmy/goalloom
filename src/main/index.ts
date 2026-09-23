/**
 * [INPUT]: Electron 生命周期、安全策略、内部存储 worker、严格共享 DTO。
 * [OUTPUT]: 单实例窗口与只读诊断 IPC；业务写入尚未开放。
 * [POS]: 应用组合根，协调权限/存储/窗口，不承载领域规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { app, BrowserWindow, ipcMain, protocol, session } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { runtimeChannel, runtimeInfoSchema, type RuntimeInfo } from '../shared/contracts/runtime'
import { appOrigin, isTrustedFrameUrl, restrictSession, restrictWindow, serveResource } from './security'

const directory = fileURLToPath(new URL('.', import.meta.url))
const developmentUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
const trustedUrl = developmentUrl ?? `${appOrigin}/index.html`
app.setName('Goalloom')
app.setAppUserModelId('com.goalloom.desktop')
app.setPath('userData', join(app.getPath('appData'), 'Goalloom'))
protocol.registerSchemesAsPrivileged([{ scheme: 'goalloom', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

let window: BrowserWindow | null = null

async function readRuntime(): Promise<RuntimeInfo> {
  const sqlite = await new Promise<string>((resolve, reject) => {
    const worker = new Worker(join(directory, 'storage.js'))
    worker.once('message', (data: unknown) => {
      const result = data as { sqlite?: unknown }
      if (typeof result?.sqlite === 'string') resolve(result.sqlite)
      else reject(new Error('存储服务启动失败'))
    })
    worker.once('error', reject)
    worker.once('exit', code => { if (code !== 0) reject(new Error('存储服务退出')) })
  })
  return runtimeInfoSchema.parse({ electron: process.versions.electron, node: process.versions.node, sqlite, platform: process.platform, arch: process.arch })
}

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
    const runtime = readRuntime().catch(() => null)
    // --- IPC 只接受唯一主窗口的主 frame，错误信息不泄露私有路径。 ---
    ipcMain.handle(runtimeChannel, async (event, ...args: unknown[]) => {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !isTrustedFrameUrl(event.senderFrame.url, trustedUrl) || args.length !== 0) {
        throw new Error('请求来源或参数无效')
      }
      const info = await runtime
      if (!info) throw new Error('本地存储服务不可用，请重启应用')
      return info
    })
    await createWindow()
    app.on('activate', () => { if (!window) void createWindow() })
  }).catch(() => { app.exit(1) })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
