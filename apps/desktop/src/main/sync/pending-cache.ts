/**
 * [INPUT]: Original prepared operations and the existing noninteractive OS cipher.
 * [OUTPUT]: Protected retry payloads bound to account/workspace/local generation.
 * [POS]: Send journal outside SQLite. Unknown sends never reread a changed API key.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readFile, writeFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { parseSyncOp, syncOpPayload } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import { SyncFailure, type PendingPlain } from '@goalloom/sync'
import type { Cipher } from '../smart/credentials'

export class PendingCache {
  private revision = 0
  private context = ''
  private rows = new Map<string, PendingPlain>()
  constructor(private directory: string, private cipher: Cipher) {}
  clear(): void { this.revision++; this.context = ''; this.rows.clear() }
  async open(context: string, signal?: AbortSignal): Promise<void> {
    const key = createHash('sha256').update(context).digest('hex')
    if (signal?.aborted) throw new SyncFailure('cancelled')
    if (key === this.context) return
    const revision = ++this.revision
    const next = new Map<string, PendingPlain>()
    let bytes: Buffer | null = null
    try { bytes = await readFile(join(this.directory, `sync-send-${key}.bin`), { signal }) }
    catch (error) {
      if (signal?.aborted) throw new SyncFailure('cancelled')
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw new SyncFailure('storage')
    }
    if (signal?.aborted || revision !== this.revision) throw new SyncFailure('cancelled')
    if (bytes) {
      try {
        if (bytes.length > 8_388_608 || !this.cipher.available()) throw new Error('Protected send journal unavailable')
        const body = JSON.parse(this.cipher.decrypt(bytes))
        if (body.context !== key || !Array.isArray(body.rows) || body.rows.length > 400) throw new Error('Invalid send journal')
        for (const row of body.rows as PendingPlain[]) {
          const op = parseSyncOp(JSON.parse(row.payload))
          if (op.opId !== row.opId || !Number.isSafeInteger(row.localOrder) || sha256Hex(syncOpPayload(op)) !== row.payloadHash) throw new Error('Invalid prepared payload')
          next.set(row.opId, row)
        }
      } catch { throw new SyncFailure('storage') }
    }
    this.context = key; this.rows = next
  }
  restore(rows: PendingPlain[], unknown = false): PendingPlain[] {
    return rows.map(row => {
      const prepared = this.rows.get(row.opId)
      if (!prepared && unknown) throw new SyncFailure('storage', 'missing prepared send')
      if (prepared && prepared.localOrder !== row.localOrder) throw new SyncFailure('storage')
      return prepared ?? row
    })
  }
  async remember(rows: PendingPlain[]): Promise<void> {
    for (const row of rows) this.rows.set(row.opId, row)
    await this.persist()
  }
  async forget(ids: string[]): Promise<void> {
    let changed = false
    for (const id of ids) changed = this.rows.delete(id) || changed
    if (changed) await this.persist()
  }
  async retain(ids: string[]): Promise<void> { await this.forget([...this.rows.keys()].filter(id => !ids.includes(id))) }
  private path() { return join(this.directory, `sync-send-${this.context}.bin`) }
  private async persist(): Promise<void> {
    if (!this.rows.size) { await rm(this.path(), { force: true }); return }
    if (!this.cipher.available()) throw new SyncFailure('key')
    const path = this.path()
    const bytes = this.cipher.encrypt(JSON.stringify({ context: this.context, rows: [...this.rows.values()] }))
    try { await writeFile(`${path}.tmp`, bytes, { mode: 0o600 }); await rename(`${path}.tmp`, path) }
    catch { throw new SyncFailure('storage') }
  }
}
