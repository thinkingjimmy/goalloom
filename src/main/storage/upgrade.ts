/**
 * [INPUT]: Main-owned legacy workspace path, backup directory and explicit prepare/commit requests.
 * [OUTPUT]: Verified protective copy, validated temporary v8 database retaining source appearance and confirmed atomic file replacement.
 * [POS]: Startup-only recovery; legacy content is read-only until the final confirmed file handoff.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { open, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { readSqliteDataset, replaceDataset } from '../workspace/transfer/dataset'
import { BackupManager } from './backup/manager'
import { openDatabase, verifyDatabase } from './database'
import { migrate, schemaVersion, supportedVersions, userVersion } from './schema'
import { Store } from './store'
import { StartupError } from './startup'
import { serverText } from '../../shared/i18n/server'

interface UpgradePreview { token: string; version: number; items: number; backupPath: string }
export class StartupUpgrade {
  private pending: { preview: UpgradePreview; temporary: string; fingerprint: string } | null = null
  constructor(private readonly path: string, private readonly backups: string, private readonly now: () => string) {}
  async prepare(): Promise<UpgradePreview> {
    await this.cancel()
    const fingerprint = await this.fingerprint()
    const source = new DatabaseSync(this.path, { readOnly: true, allowExtension: false })
    let backupPath: string, version: number
    try {
      version = userVersion(source)
      if (!supportedVersions.includes(version) || version >= schemaVersion) throw new StartupError(serverText().storage.unsupportedVersion)
      const manager = new BackupManager(source, this.backups), workspace = new Store(source).workspace()
      const record = await manager.create('protective', workspace, this.now())
      await manager.verify(record)
      backupPath = manager.path(record.id)
    } finally { source.close() }
    const data = await readSqliteDataset(backupPath, this.now(), 'backup')
    const token = randomUUID(), temporary = join(dirname(this.path), `.workspace-upgrade-${token}.sqlite`)
    try {
      const target = openDatabase(temporary)
      try {
        migrate(target)
        replaceDataset(new Store(target), data, 'upgrade', this.now())
        verifyDatabase(target)
        target.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE')
      } finally { target.close() }
      const checked = await readSqliteDataset(temporary, this.now(), 'backup')
      if (checked.items.length !== data.items.length || await this.fingerprint() !== fingerprint) throw new StartupError(serverText().storage.changedAfterBackup, backupPath)
      const handle = await open(temporary, 'r+')
      try { await handle.sync() } finally { await handle.close() }
      const preview = { token, version, items: data.items.length, backupPath }
      this.pending = { preview, temporary, fingerprint }
      return preview
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      throw error instanceof StartupError ? error : new StartupError(serverText().storage.upgradeCheckFailed, backupPath)
    }
  }
  async commit(token: string): Promise<void> {
    const pending = this.pending
    if (!pending || token !== pending.preview.token || await this.fingerprint() !== pending.fingerprint) throw new StartupError(serverText().storage.changedAfterBackup, pending?.preview.backupPath ?? null)
    // Confirmation is the only point that permits a write-capable legacy connection. Checkpoint
    // its original data before replacing the file so a stale WAL cannot attach to the new database.
    const source = new DatabaseSync(this.path, { allowExtension: false })
    try {
      if (userVersion(source) !== pending.preview.version) throw new StartupError(serverText().storage.changedAfterBackup, pending.preview.backupPath)
      source.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE')
    } finally { source.close() }
    await rename(pending.temporary, this.path)
    this.pending = null
    const directory = await open(dirname(this.path), 'r')
    try { await directory.sync() } finally { await directory.close() }
  }
  async cancel(): Promise<void> {
    const pending = this.pending
    this.pending = null
    if (pending) await rm(pending.temporary, { force: true }).catch(() => undefined)
  }
  private async fingerprint(): Promise<string> {
    return JSON.stringify(await Promise.all([this.path, `${this.path}-wal`].map(async path => {
      const file = await stat(path).catch(() => null)
      return file ? [file.size, file.mtimeMs, file.ctimeMs] : null
    })))
  }
}
