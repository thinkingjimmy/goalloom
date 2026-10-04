/**
 * [INPUT]: electron-updater with the GitHub Releases feed baked into packaged builds (app-update.yml), Electron app identity.
 * [OUTPUT]: UpdateService: periodic background check + download, manual check, restart-to-install and phase notifications.
 * [POS]: main's only software-update path; development builds report `unsupported` and never load electron-updater.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app } from 'electron'
import type { AppUpdater } from 'electron-updater'
import type { UpdateInfo, UpdateState } from '../shared/contracts/update'

const firstCheckDelay = 15_000
const checkInterval = 4 * 60 * 60 * 1000

export class UpdateService {
  private state: UpdateState = app.isPackaged ? { phase: 'idle' } : { phase: 'unsupported' }
  // Phase to return to when a background check fails, so a flaky network never surfaces as an error.
  private settled: UpdateState = this.state
  private manual = false
  private updater: AppUpdater | null = null
  private attached: Promise<void> = Promise.resolve()

  constructor(private readonly notify: (info: UpdateInfo) => void) {}

  get info(): UpdateInfo { return { version: app.getVersion(), state: this.state } }

  start(): void {
    if (this.state.phase === 'unsupported') return
    this.attached = this.attach()
    setTimeout(() => { void this.check(false) }, firstCheckDelay).unref()
    setInterval(() => { void this.check(false) }, checkInterval).unref()
  }

  async check(manual: boolean): Promise<UpdateInfo> {
    await this.attached
    const { phase } = this.state
    // A running check/download or a staged update already answers the question.
    if (!this.updater || phase === 'unsupported' || phase === 'checking' || phase === 'downloading' || phase === 'ready') return this.info
    this.manual = manual
    // Rejections are also emitted as 'error', which owns the resulting phase.
    await this.updater.checkForUpdates().catch(() => undefined)
    return this.info
  }

  install(): void {
    // Silent on Windows so the assisted NSIS installer reuses the existing directory, then relaunches.
    if (this.state.phase === 'ready') this.updater?.quitAndInstall(true, true)
  }

  private async attach(): Promise<void> {
    const electronUpdater = await import('electron-updater')
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
    this.updater = updater
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
