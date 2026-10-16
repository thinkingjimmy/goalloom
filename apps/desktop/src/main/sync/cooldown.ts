/**
 * [INPUT]: Account identity and an upload retry deadline, without task/session content.
 * [OUTPUT]: Atomic device-level retry state that survives reconnect and process restart.
 * [POS]: Upload scheduling metadata outside the workspace; server quota remains authoritative.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { SyncFailure } from '@goalloom/sync'

interface Wait { until: number; reason: 'quota' | 'network' }
export class UploadCooldown {
  private loaded = false
  private writing: Promise<void> = Promise.resolve()
  private rows: Record<string, Wait> = {}
  constructor(private directory: string) {}
  private key(account: string) { return createHash('sha256').update(account).digest('hex') }
  async load(account: string, signal?: AbortSignal): Promise<Wait | null> {
    if (signal?.aborted) throw new SyncFailure('cancelled')
    if (this.loaded) return this.rows[this.key(account)] ?? null
    try {
      const file = JSON.parse(await readFile(join(this.directory, 'sync-upload-wait.json'), { encoding: 'utf8', signal }))
      if (signal?.aborted) throw new SyncFailure('cancelled')
      if (this.loaded) return this.rows[this.key(account)] ?? null
      if (file.version !== 1 || !file.accounts || typeof file.accounts !== 'object' || Array.isArray(file.accounts)) throw new Error('Invalid retry metadata')
      this.rows = Object.fromEntries(Object.entries(file.accounts).filter(([key, value]) => {
        const row = value as Partial<Wait>
        return /^[a-f0-9]{64}$/.test(key) && row && Number.isFinite(row.until) && row.until! > Date.now() && ['quota', 'network'].includes(row.reason ?? '')
      })) as Record<string, Wait>
    } catch (error) {
      if (signal?.aborted) throw new SyncFailure('cancelled')
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw new SyncFailure('storage')
    }
    this.loaded = true
    return this.rows[this.key(account)] ?? null
  }
  async save(account: string, wait: Wait | null): Promise<void> {
    if (!this.loaded) await this.load(account)
    if (wait) this.rows[this.key(account)] = wait
    else delete this.rows[this.key(account)]
    const path = join(this.directory, 'sync-upload-wait.json')
    const body = JSON.stringify({ version: 1, accounts: this.rows })
    const write = this.writing.then(async () => {
      await writeFile(`${path}.tmp`, body, { mode: 0o600 }); await rename(`${path}.tmp`, path)
    })
    this.writing = write.catch(() => undefined)
    try { await write } catch { throw new SyncFailure('storage') }
  }
}
