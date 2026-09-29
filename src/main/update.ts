/**
 * [INPUT]: electron-updater with the GitHub Releases feed baked into packaged builds (app-update.yml), Electron app identity.
 * [OUTPUT]: UpdateService: periodic background check + download, manual check, restart-to-install and phase notifications.
 * [POS]: main's only software-update path; development builds report `unsupported` and never reach the network.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateInfo, UpdateState } from '../shared/contracts/update'

const firstCheckDelay = 15_000
const checkInterval = 4 * 60 * 60 * 1000

export class UpdateService {
  private state: UpdateState = app.isPackaged ? { phase: 'idle' } : { phase: 'unsupported' }
  // Phase to return to when a background check fails, so a flaky network never surfaces as an error.
  private settled: UpdateState = this.state
  private manual = false

  constructor(private readonly notify: (info: UpdateInfo) => void) {
    if (!app.isPackaged) return
    const updater = electronUpdater.autoUpdater
    updater.logger = null
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.on('checking-for-update', () => this.set({ phase: 'checking' }))
    updater.on('update-not-available', () => this.settle({ phase: 'latest', checkedAt: new Date().toISOString() }))
    updater.on('update-available', info => this.set({ phase: 'downloading', version: info.version, percent: 0 }))
    updater.on('download-progress', progress => {
      if (this.state.phase !== 'downloading') return
      const percent = Math.min(100, Math.max(0, Math.floor(progress.percent)))
      if (percent !== this.state.percent) this.set({ ...this.state, percent })
    })
    updater.on('update-downloaded', info => this.settle({ phase: 'ready', version: info.version }))
    updater.on('error', () => this.settle(this.manual ? { phase: 'failed' } : this.settled))
  }

  get info(): UpdateInfo { return { version: app.getVersion(), state: this.state } }

  start(): void {
    if (this.state.phase === 'unsupported') return
    setTimeout(() => { void this.check(false) }, firstCheckDelay).unref()
    setInterval(() => { void this.check(false) }, checkInterval).unref()
  }

  async check(manual: boolean): Promise<UpdateInfo> {
    const { phase } = this.state
    // A running check/download or a staged update already answers the question.
    if (phase === 'unsupported' || phase === 'checking' || phase === 'downloading' || phase === 'ready') return this.info
    this.manual = manual
    // Rejections are also emitted as 'error', which owns the resulting phase.
    await electronUpdater.autoUpdater.checkForUpdates().catch(() => undefined)
    return this.info
  }

  install(): void {
    // Silent on Windows so the assisted NSIS installer reuses the existing directory, then relaunches.
    if (this.state.phase === 'ready') electronUpdater.autoUpdater.quitAndInstall(true, true)
  }

  private settle(state: UpdateState): void {
    this.manual = false
    this.settled = state.phase === 'failed' ? this.settled : state
    this.set(state)
  }

  private set(state: UpdateState): void {
    this.state = state
    this.notify(this.info)
  }
}
