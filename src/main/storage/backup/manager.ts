/**
 * [INPUT]: Authoritative database, injected workspace/time and fixed backup directory.
 * [OUTPUT]: Verified copies, fingerprinted daily reuse and daily-only retention.
 * [POS]: Backup adapter with receipts outside workspace replacement; protective checks always revalidate.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { workspaceDate } from '../../../domain/calendar'
import type { Workspace } from '../../../shared/contracts/entities'
import { DomainError } from '../../../shared/contracts/commands'
import { backupRecordSchema, type BackupRecord, type BackupStatus } from '../../../shared/contracts/transfer'
import { consistentBackup } from './snapshot'
import { verifyDatabase } from '../database'
import { atomicJson } from '../atomic-json'
import { serverText } from '../../../shared/i18n/server'

async function checksum(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
async function fingerprint(path: string): Promise<string> {
  const file = await stat(path, { bigint: true })
  if (!file.isFile()) throw new DomainError('backup', serverText().storage.backupMismatch)
  return [file.dev, file.ino, file.size, file.mtimeNs, file.ctimeNs].join(':')
}
export class BackupManager {
  // Persisted as a kind, rendered in the current language on read, so switching language never leaves stale text.
  private failure: 'create' | 'rotation' | null = null
  private verified = new Map<string, string>()
  private dailyResult: { key: string; record: BackupRecord; stamp: string } | null = null
  get lastError(): string | null { return this.failure && (this.failure === 'create' ? serverText().storage.backupFailed : serverText().storage.backupRotationFailed) }
  constructor(readonly db: DatabaseSync, readonly directory: string) {}
  path(id: string): string { return join(this.directory, `${backupRecordSchema.shape.id.parse(id)}.sqlite`) }
  async records(): Promise<BackupRecord[]> {
    await mkdir(this.directory, { recursive: true })
    const records: BackupRecord[] = []
    for (const name of await readdir(this.directory)) {
      if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue
      try {
        const record = backupRecordSchema.parse(JSON.parse(await readFile(join(this.directory, name), 'utf8')))
        if (name !== `${record.id}.json` || !(await stat(this.path(record.id))).isFile()) continue
        records.push(record)
      } catch { /* 损坏/外部文件不会作为可恢复回执，也不会参与轮换。 */ }
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  }
  async status(): Promise<BackupStatus> {
    try { const saved = JSON.parse(await readFile(join(this.directory, 'last-result.json'), 'utf8')); this.failure = saved.error === 'rotation' ? 'rotation' : saved.error ? 'create' : null } catch { /* 首次无结果。 */ }
    return { directory: this.directory, records: await this.records(), lastError: this.lastError }
  }
  private async stamp(record: BackupRecord): Promise<string> {
    return JSON.stringify([record, await fingerprint(this.path(record.id)), await fingerprint(join(this.directory, `${record.id}.json`))])
  }
  async verify(record: BackupRecord, reuse = false): Promise<void> {
    const path = this.path(record.id)
    const before = await this.stamp(record)
    if (reuse && this.verified.get(record.id) === before) return
    if ((await stat(path)).size !== record.size || await checksum(path) !== record.sha256) throw new DomainError('backup', serverText().storage.backupMismatch)
    const copy = new DatabaseSync(path, { readOnly: true })
    try { verifyDatabase(copy) } finally { copy.close() }
    if (before !== await this.stamp(record)) throw new DomainError('backup', serverText().storage.backupMismatch)
    this.verified.set(record.id, before)
  }
  async create(kind: BackupRecord['kind'], workspace: Workspace, now: string): Promise<BackupRecord> {
    try {
      const path = await consistentBackup(this.db, this.directory)
      const record: BackupRecord = { id: basename(path, '.sqlite'), kind, createdAt: now, localDate: workspace.calendar ? workspaceDate(workspace.calendar.timezone, now) : null,
        generation: workspace.generation, revision: workspace.revision, size: (await stat(path)).size, sha256: await checksum(path) }
      await atomicJson(join(this.directory, `${record.id}.json`), record)
      this.verified.set(record.id, await this.stamp(record))
      this.failure = null
      await atomicJson(join(this.directory, 'last-result.json'), { error: null })
      return record
    } catch (error) {
      this.failure = 'create'
      await atomicJson(join(this.directory, 'last-result.json'), { error: this.failure }).catch(() => undefined)
      throw error
    }
  }
  async daily(workspace: Workspace, now: string): Promise<void> {
    if (!workspace.backupEnabled || !workspace.calendar || !workspace.setupConfirmedAt) return
    try {
      const date = workspaceDate(workspace.calendar.timezone, now)
      const key = JSON.stringify([workspace.generation, date, workspace.backupRetention])
      if (this.dailyResult?.key === key && this.failure === null) {
        try { if (this.dailyResult.stamp === await this.stamp(this.dailyResult.record)) return } catch { /* A missing file needs a new copy. */ }
      }
      const candidates = (await this.records()).filter(record => record.kind === 'daily' && record.generation === workspace.generation && record.localDate === date)
      let latest: BackupRecord | undefined
      for (const candidate of candidates) { try { await this.verify(candidate, true); latest = candidate; break } catch { /* 无效副本不阻止同日重试。 */ } }
      latest ??= await this.create('daily', workspace, now)
      const old = (await this.records()).filter(record => record.kind === 'daily' && record.id !== latest.id).slice(workspace.backupRetention - 1)
      for (const record of old) {
        await rm(this.path(record.id))
        await rm(join(this.directory, `${record.id}.json`))
        this.verified.delete(record.id)
      }
      this.failure = null
      await atomicJson(join(this.directory, 'last-result.json'), { error: null })
      this.dailyResult = { key, record: latest, stamp: await this.stamp(latest) }
    } catch (error) {
      this.dailyResult = null
      this.failure = 'rotation'
      await atomicJson(join(this.directory, 'last-result.json'), { error: this.failure }).catch(() => undefined)
      throw error
    }
  }
}
