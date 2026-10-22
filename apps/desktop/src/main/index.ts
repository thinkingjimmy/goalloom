/**
 * [INPUT]: Electron lifecycle, application identity, noninteractive Keychain policy, security, storage and desktop services.
 * [OUTPUT]: Stable packaged identity, isolated development credentials, disabled Keychain dialogs, device-aware reconciliation, single window, write gates, notifications and session cleanup.
 * [POS]: Application composition root; the renderer parse overlaps guarded storage startup, and migrations remain protected before writes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app, BrowserWindow, clipboard, dialog, powerMonitor, protocol, screen, session, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StorageClient } from './storage/client'
import { registerIpc } from './ipc'
import { appOrigin, restrictSession, restrictWindow, serveResource } from './security'
import type { CommandResult } from '../shared/contracts/commands'
import type { WorkspaceMetadata } from '../shared/contracts/queries'
import { loadWindowState, saveWindowState } from './window/state'
import { LanguagePreference } from './window/language'
import { ParentOrderPreference } from './window/parent-order'
import { protectWindowClose } from './window/close'
import { createSmartService, deviceCipher } from './smart/electron'
import { sessionCipher } from './sync/session-cipher'
import { serverText } from '../shared/i18n/server'
import { LinkPreviewService } from './link-preview/service'
import { UpdateService } from './update'
import { installMenu } from './window/menu'
import { openAboutEvent, updateEvent } from '../shared/contracts/update'
import { assistanceServerText } from '../shared/i18n/assistance'
import { SyncService } from './sync/service'
import { createNetworkMonitor } from './sync/network-monitor'
import { projectSettingRows } from './sync/project-settings'
import { syncEvent } from '../shared/contracts/sync'
import { aiRefreshEvent, devicePrefsEvent, languageEvent } from '../shared/contracts/runtime'
import { isGoalloomProtocol, protocolRegistration, protocolUrlFromArgv, secondInstanceFocus } from './protocol'
import { applicationIdentity } from './identity'
import { protectKeychainAccess } from './keychain'

const directory = fileURLToPath(new URL('.', import.meta.url))
const developmentUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
const trustedUrl = developmentUrl ?? `${appOrigin}/index.html`
const identity = applicationIdentity(app.isPackaged, app.getPath('appData'), app.commandLine.getSwitchValue('user-data-dir'))
protectKeychainAccess()
app.setName(identity.name)
// The native macOS About panel (reachable outside our menu) must name Goalloom, not the development Electron binary.
app.setAboutPanelOptions({ applicationName: 'Goalloom', applicationVersion: app.getVersion(), version: '' })
app.setAppUserModelId(identity.appUserModelId)
app.setPath('userData', identity.userData)
protocol.registerSchemesAsPrivileged([{ scheme: 'goalloom', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

let window: BrowserWindow | null = null
let returnFocus = false
function focusMainWindow(): void {
  if (!window || window.isDestroyed()) { returnFocus = true; return }
  returnFocus = false
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}
function registerDesktopProtocol(): void {
  if (!app.isPackaged) return
  const entry = process.argv[1]
  const registration = protocolRegistration({ defaultApp: process.defaultApp === true, execPath: process.execPath, ...(entry ? { entry } : {}) })
  if (registration.command && registration.args) app.setAsDefaultProtocolClient(registration.scheme, registration.command, registration.args)
  else app.setAsDefaultProtocolClient(registration.scheme)
}
let language: LanguagePreference
let parentOrder: ParentOrderPreference
let releaseRenderer: (() => void) | undefined
let updates: UpdateService

let storage: StorageClient | null = null
let sync: SyncService | undefined
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
    const result = await storage.call<CommandResult | null>('reconcile', parentOrder.enabled)
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
    const status = await client.call<{ ok: true } | { ok: false; message: string; backupPath: string | null; backupDirectory: string; legacyVersion: number | null }>('startup').catch(() => ({ ok: false as const, message: serverText().dialogs.startupUnavailable, backupPath: null, backupDirectory: backups, legacyVersion: null }))
    if (status.ok) return client
    if (status.legacyVersion !== null) {
      const t = assistanceServerText()
      const begin = await dialog.showMessageBox({ type: 'info', title: t.upgradeTitle, message: t.upgradePrepare, detail: `v${status.legacyVersion} → v8`, buttons: [t.prepare, t.cancel], defaultId: 1, cancelId: 1, noLink: true })
      if (begin.response !== 0) { await client.close().catch(() => undefined); return null }
      try {
        const preview = await client.call<{ token: string; backupPath: string }>('prepareStartupUpgrade')
        const confirm = await dialog.showMessageBox({ type: 'question', title: t.upgradeTitle, message: t.upgradeConfirm, detail: preview.backupPath, buttons: [t.confirm, t.cancel], defaultId: 1, cancelId: 1, noLink: true })
        if (confirm.response !== 0) { await client.close().catch(() => undefined); return null }
        await client.call('commitStartupUpgrade', preview.token)
        await client.close().catch(() => undefined)
        continue
      } catch (error) { status.message = error instanceof Error ? error.message : serverText().storage.upgradeFailed }
    }
    await client.close().catch(() => undefined)
    const detail = serverText().dialogs.startupDetail(status.backupPath, status.backupDirectory, join(app.getPath('userData'), 'workspace.sqlite'))
    const choice = await dialog.showMessageBox({ type: 'error', title: serverText().dialogs.startupTitle, message: status.message, detail, buttons: [serverText().dialogs.retry, serverText().dialogs.quit], defaultId: 0, cancelId: 1, noLink: true })
    if (choice.response !== 0) return null
  }
}

function send(channel: string, value: unknown): void {
  if (window && !window.isDestroyed()) window.webContents.send(channel, value)
}
function openAbout(check: boolean): void {
  if (!window) { void createWindow(); return }
  if (window.isMinimized()) window.restore()
  window.show(); window.focus()
  send(openAboutEvent, null)
  if (check) void updates.check(true)
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
      spellcheck: false, devTools: !app.isPackaged,
    },
  })
  restrictWindow(window)
  protectWindowClose(window, trustedUrl)
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
  window.once('ready-to-show', () => { window?.show(); firstVisible = true; startInitialReconcile(); if (returnFocus) focusMainWindow() })
  window.on('focus', () => { void requestReconcile(); sync?.setForeground(true) })
  window.on('blur', () => sync?.setForeground(false))
  window.on('hide', () => sync?.setForeground(false))
  window.on('show', () => { sync?.setForeground(window?.isFocused() ?? false); sync?.nudge() })
  window.on('closed', () => { window = null })
  await window.loadURL(trustedUrl)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // macOS delivers goalloom://signed-in here. The URL is not loaded; the existing window comes forward.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (isGoalloomProtocol(url)) focusMainWindow()
  })
  // Windows delivers the same URL on argv. Any other second launch still focuses the open window.
  app.on('second-instance', (_event, argv) => {
    if (secondInstanceFocus(argv)) focusMainWindow()
  })
  app.whenReady().then(async () => {
    registerDesktopProtocol()
    if (protocolUrlFromArgv(process.argv)) focusMainWindow()
    // Packaged builds take the icon from the bundle; the dev Electron binary would otherwise show its own.
    if (!app.isPackaged) app.dock?.setIcon(join(directory, '../../resources/icon.png'))
    restrictSession(session.defaultSession)
    protocol.handle('goalloom', request => serveResource(join(directory, '../renderer'), request))
    // Before storage: startup-protection dialogs already speak the chosen language.
    language = new LanguagePreference(join(app.getPath('userData'), 'preferences.json'), () => app.getPreferredSystemLanguages())
    parentOrder = new ParentOrderPreference(join(app.getPath('userData'), 'parent-order.json'))
    await Promise.all([language.load(), parentOrder.load()])
    installMenu(openAbout)
    language.onChange(() => installMenu(openAbout))
    updates = new UpdateService(info => send(updateEvent, info))
    let unlockStorage!: (client: StorageClient) => void
    const pendingStorage = new Promise<StorageClient>(resolve => { unlockStorage = resolve })
    const storageProxy = {
      call: (method: Parameters<StorageClient['call']>[0], argument?: unknown) => pendingStorage.then(client => client.call(method, argument)),
      close: () => pendingStorage.then(client => client.close()),
    } as StorageClient
    let client!: StorageClient
    const smart = createSmartService(join(app.getPath('userData'), 'smart-input'), () => client, entries => {
      void storageProxy.call('sync', { type: 'emit-settings', entries, at: new Date().toISOString(), opId: randomUUID(), mode: 'change' }).then(() => sync?.nudge('write')).catch(() => undefined)
    })
    const links = new LinkPreviewService(join(app.getPath('userData'), 'link-previews'))
    const syncing = sync = new SyncService({
      userData: app.getPath('userData'), packaged: app.isPackaged, cipher: deviceCipher, storage: storageProxy,
      sessionCipher: sessionCipher(app.getPath('userData'), deviceCipher),
      monitorNetwork: createNetworkMonitor,
      onLocalCleared: () => { smart.releaseSession(); links.releaseSession() },
      openExternal: url => shell.openExternal(url),
      onBrowserReturn: () => focusMainWindow(),
      notify: status => send(syncEvent, status),
      onApplied: () => { send('goalloom:changed', null); void requestReconcile(false) },
      settingsRevision: () => parentOrder.revision,
      onSettings: (rows, revision) => projectSettingRows(rows, {
        language, parentOrder, smart,
        notifyLanguage: state => send(languageEvent, state),
        notifyDevicePrefs: entries => send(devicePrefsEvent, entries),
        notifyAi: () => send(aiRefreshEvent, null),
      }, revision),
      collectSeed: () => smart.syncedSettingEntries(),
      readSecret: key => smart.syncedSecret(key),
      applySecret: (key, value) => smart.applyRemoteSetting(key, value),
      language: () => language.state.language,
      locale: () => language.state.locale,
      clipboard: text => clipboard.writeText(text),
      now: () => new Date().toISOString(),
    })
    releaseRenderer = registerIpc(() => window, trustedUrl, storageProxy, smart, language, parentOrder, links, updates, syncing, () => { void requestReconcile(false); syncing.nudge('write') }, firstWrite, meta => {
      if (firstSnapshotRead) return
      firstSnapshotRead = true; lastVisible = visibleKey(meta); lastRevision = meta.workspace.revision; startInitialReconcile()
    })
    const opening = openStorage()
    const windowing = createWindow().then(() => ({ ok: true as const }), error => ({ ok: false as const, error }))
    const opened = await opening
    if (!opened) { window?.destroy(); app.exit(0); return }
    storage = client = opened
    unlockStorage(opened)
    void syncing.start()
    const openedWindow = await windowing
    if (!openedWindow.ok) throw openedWindow.error
    updates.start()
    syncing.setForeground(window?.isVisible() === true && window.isFocused())
    powerMonitor.on('suspend', () => sync?.suspend())
    powerMonitor.on('resume', () => { void requestReconcile(); sync?.resume() })
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
    sync?.stop()
    if (boundaryTimer) clearTimeout(boundaryTimer)
    void storage.close().catch(() => undefined).finally(() => { drained = true; app.quit() })
  })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
