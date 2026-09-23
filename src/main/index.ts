/**
 * [INPUT]: Electron 生命周期、安全策略、内部存储 worker、严格共享 DTO。
 * [OUTPUT]: 单实例窗口、受限读写 IPC 与持久化存储 worker。
 * [POS]: 应用组合根，协调权限/存储/窗口，不承载领域规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { app, BrowserWindow, powerMonitor, protocol, screen, session } from 'electron'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StorageClient } from './storage-client'
import { registerIpc } from './ipc'
import { appOrigin, restrictSession, restrictWindow, serveResource } from './security'
import type { CommandResult } from '../shared/contracts/commands'
import type { Snapshot } from '../shared/contracts/queries'
import { loadWindowState, saveWindowState } from './window-state'
import { protectWindowClose } from './window-close'

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
let reconciling = false
let boundaryTimer: ReturnType<typeof setTimeout> | undefined
let quitting = false
async function requestReconcile(): Promise<void> {
  if (!storage || reconciling || quitting) return
  reconciling = true
  try {
    const result = await storage.call<CommandResult | null>('reconcile')
    if (window && !window.isDestroyed()) window.webContents.send('goalloom:changed', result)
    const snapshot = await storage.call<Snapshot>('query', { type: 'snapshot' })
    const next = Math.min(...snapshot.periods.map(period => Date.parse(period.endAt)))
    if (boundaryTimer) clearTimeout(boundaryTimer)
    if (Number.isFinite(next)) {
      boundaryTimer = setTimeout(() => { void requestReconcile() }, Math.max(100, Math.min(2_147_483_647, next - Date.now() + 20)))
      boundaryTimer.unref()
    }
  } catch { /* 存储错误由有限查询/命令反馈，不记录正文。 */ }
  finally { reconciling = false }
}

async function createWindow(): Promise<void> {
  const statePath = join(app.getPath('userData'), 'window.json')
  const state = await loadWindowState(statePath, screen.getAllDisplays().map(display => display.workArea))
  window = new BrowserWindow({
    width: state?.width ?? 1280, height: state?.height ?? 840, ...(state ? { x: state.x, y: state.y } : {}), minWidth: 720, minHeight: 540, show: false,
    title: 'Goalloom', backgroundColor: '#f7f7f2',
    webPreferences: {
      preload: join(directory, '../preload/index.cjs'), contextIsolation: true,
      sandbox: true, nodeIntegration: false, webSecurity: true, webviewTag: false,
      devTools: !app.isPackaged,
    },
  })
  restrictWindow(window)
  protectWindowClose(window)
  if (state?.maximized) window.maximize()
  let saving: ReturnType<typeof setTimeout> | undefined
  const persist = () => {
    if (!window || window.isDestroyed()) return
    void saveWindowState(statePath, window.getNormalBounds(), window.isMaximized()).catch(() => undefined)
  }
  const changed = () => { if (saving) clearTimeout(saving); saving = setTimeout(persist, 200) }
  window.on('resize', changed); window.on('move', changed)
  window.on('close', persist)
  window.once('ready-to-show', () => window?.show())
  window.on('focus', () => { void requestReconcile() })
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
    registerIpc(() => window, trustedUrl, storage, () => { void requestReconcile() })
    await requestReconcile()
    await createWindow()
    powerMonitor.on('resume', () => { void requestReconcile() })
    const timer = setInterval(() => { void requestReconcile() }, 30_000)
    timer.unref()
    app.on('activate', () => { if (!window) void createWindow() })
  }).catch(() => { app.exit(1) })
  let drained = false
  // 先让窗口确认未保存草稿；窗口取消退出时，存储服务必须继续可用。
  app.on('will-quit', event => {
    if (drained || !storage) return
    event.preventDefault()
    quitting = true
    if (boundaryTimer) clearTimeout(boundaryTimer)
    void storage.close().catch(() => undefined).finally(() => { drained = true; app.quit() })
  })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
