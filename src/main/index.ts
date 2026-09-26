/**
 * [INPUT]: Electron lifecycle, security, storage, smart-input and link-preview services.
 * [OUTPUT]: Single window, startup/write gates, visible-change notifications and renderer-session cleanup.
 * [POS]: Application composition root; migrations remain protected before window creation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app, BrowserWindow, dialog, powerMonitor, protocol, screen, session } from 'electron'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StorageClient } from './storage/client'
import { registerIpc } from './ipc'
import { appOrigin, restrictSession, restrictWindow, serveResource } from './security'
import type { CommandResult } from '../shared/contracts/commands'
import type { WorkspaceMetadata } from '../shared/contracts/queries'
import { loadWindowState, saveWindowState } from './window/state'
import { LanguagePreference } from './window/language'
import { protectWindowClose } from './window/close'
import { createSmartService } from './smart/electron'
import { serverText } from '../shared/i18n/server'
import { LinkPreviewService } from './link-preview/service'

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
let language: LanguagePreference
let releaseRenderer: (() => void) | undefined

let storage: StorageClient | null = null
let reconciling = false
let boundaryTimer: ReturnType<typeof setTimeout> | undefined
let quitting = false
let firstSnapshotRead = false, firstVisible = false, initialStarted = false
let unlockFirstWrite: () => void
const firstWrite = new Promise<void>(resolve => { unlockFirstWrite = resolve })
let lastVisible = '', lastRevision = -1
function visibleKey(meta: WorkspaceMetadata): string {
  const { lastObservedAt: _observed, revision: _revision, ...workspace } = meta.workspace
  return JSON.stringify([workspace, meta.periods.map(period => period.id), meta.maintenance, meta.backupError])
}
function startInitialReconcile(): void {
  if (!firstSnapshotRead || !firstVisible || initialStarted) return
  initialStarted = true
  void requestReconcile().finally(unlockFirstWrite)
}
async function requestReconcile(notifyRevision = true): Promise<void> {
  if (!storage || !initialStarted || reconciling || quitting) return
  reconciling = true
  try {
    const result = await storage.call<CommandResult | null>('reconcile')
    const meta = await storage.call<WorkspaceMetadata>('metadata')
    const key = visibleKey(meta)
    if ((result?.changed || key !== lastVisible || (notifyRevision && meta.workspace.revision !== lastRevision)) && window && !window.isDestroyed()) window.webContents.send('goalloom:changed', result)
    lastVisible = key; lastRevision = meta.workspace.revision
    const next = Math.min(...meta.periods.map(period => Date.parse(period.endAt)))
    if (boundaryTimer) clearTimeout(boundaryTimer)
    if (Number.isFinite(next)) {
      boundaryTimer = setTimeout(() => { void requestReconcile() }, Math.max(100, Math.min(2_147_483_647, next - Date.now() + 20)))
      boundaryTimer.unref()
    }
  } catch { /* 存储错误由有限查询/命令反馈，不记录正文。 */ }
  finally { reconciling = false }
}

// --- Startup protection failure: no business window; show where the untouched data and copies live. ---
async function openStorage(): Promise<StorageClient | null> {
  const backups = join(app.getPath('userData'), 'backups')
  for (;;) {
    const client = new StorageClient(join(directory, 'storage.js'), join(app.getPath('userData'), 'workspace.sqlite'), backups, language.locale)
    const status = await client.call<{ ok: true } | { ok: false; message: string; backupPath: string | null; backupDirectory: string }>('startup').catch(() => ({ ok: false as const, message: serverText().dialogs.startupUnavailable, backupPath: null, backupDirectory: backups }))
    if (status.ok) return client
    await client.close().catch(() => undefined)
    const detail = serverText().dialogs.startupDetail(status.backupPath, status.backupDirectory, join(app.getPath('userData'), 'workspace.sqlite'))
    const choice = await dialog.showMessageBox({ type: 'error', title: serverText().dialogs.startupTitle, message: status.message, detail, buttons: [serverText().dialogs.retry, serverText().dialogs.quit], defaultId: 0, cancelId: 1, noLink: true })
    if (choice.response !== 0) return null
  }
}

async function createWindow(): Promise<void> {
  const statePath = join(app.getPath('userData'), 'window.json')
  const state = await loadWindowState(statePath, screen.getAllDisplays().map(display => display.workArea))
  window = new BrowserWindow({
    width: state?.width ?? 1280, height: state?.height ?? 840, ...(state ? { x: state.x, y: state.y } : {}), minWidth: 720, minHeight: 540, show: false,
    title: 'Goalloom', backgroundColor: '#f5f1eb',
    // macOS draws the traffic lights inside the renderer's 56px top bar; other platforms keep the native frame.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 20, y: 20 } } : {}),
    webPreferences: {
      preload: join(directory, '../preload/index.cjs'), contextIsolation: true,
      sandbox: true, nodeIntegration: false, webSecurity: true, webviewTag: false,
      devTools: !app.isPackaged,
    },
  })
  restrictWindow(window)
  protectWindowClose(window)
  window.webContents.on('did-start-navigation', details => { if (details.isMainFrame && !details.isSameDocument) releaseRenderer?.() })
  window.webContents.on('render-process-gone', () => releaseRenderer?.())
  window.webContents.on('destroyed', () => releaseRenderer?.())
  if (state?.maximized) window.maximize()
  let saving: ReturnType<typeof setTimeout> | undefined
  const persist = () => {
    if (!window || window.isDestroyed()) return
    void saveWindowState(statePath, window.getNormalBounds(), window.isMaximized()).catch(() => undefined)
  }
  const changed = () => { if (saving) clearTimeout(saving); saving = setTimeout(persist, 200) }
  window.on('resize', changed); window.on('move', changed)
  window.on('close', persist)
  window.once('ready-to-show', () => { window?.show(); firstVisible = true; startInitialReconcile() })
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
    // Packaged builds take the icon from the bundle; the dev Electron binary would otherwise show its own.
    if (!app.isPackaged) app.dock?.setIcon(join(directory, '../../resources/icon.png'))
    restrictSession(session.defaultSession)
    protocol.handle('goalloom', request => serveResource(join(directory, '../renderer'), request))
    // Before storage: startup-protection dialogs already speak the chosen language.
    language = new LanguagePreference(join(app.getPath('userData'), 'preferences.json'), () => app.getPreferredSystemLanguages())
    await language.load()
    storage = await openStorage()
    if (!storage) { app.exit(0); return }
    const client = storage
    const smart = createSmartService(join(app.getPath('userData'), 'smart-input'), () => client)
    const links = new LinkPreviewService(join(app.getPath('userData'), 'link-previews'))
    releaseRenderer = registerIpc(() => window, trustedUrl, storage, smart, language, links, () => { void requestReconcile(false) }, firstWrite, meta => {
      if (firstSnapshotRead) return
      firstSnapshotRead = true; lastVisible = visibleKey(meta); lastRevision = meta.workspace.revision; startInitialReconcile()
    })
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
