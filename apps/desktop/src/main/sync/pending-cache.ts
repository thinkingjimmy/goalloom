/**
 * [INPUT]: Original prepared operations, a stable recovery key and the legacy noninteractive OS cipher.
 * [OUTPUT]: Protected retry payloads bound to account/workspace/local generation.
 * [POS]: Send journal outside SQLite. Unknown sends never reread a changed API key.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readFile, writeFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { isSecretFingerprint, isSecretSettingKey, parseSyncOp, syncOpPayload } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import { SyncFailure, type PendingPlain } from '@goalloom/sync'
import type { Cipher } from '../smart/credentials'
import { openLocal, sealLocal } from './sealed-file'

export class PendingCache {
  private revision = 0
  private context = ''
  private rows = new Map<string, PendingPlain>()
  private key: Uint8Array | null = null
  private legacyUnavailable = false
  private blocked = new Set<string>()
  constructor(private directory: string, private cipher: Cipher) {}
  clear(): void { this.revision++; this.context = ''; this.rows.clear(); this.key = null; this.blocked.clear(); this.legacyUnavailable = false }
  async open(context: string, signal?: AbortSignal, journalKey?: Uint8Array): Promise<void> {
    const key = createHash('sha256').update(context).digest('hex')
    if (signal?.aborted) throw new SyncFailure('cancelled')
    if (key === this.context) return
    const revision = ++this.revision
    const next = new Map<string, PendingPlain>()
    let legacyUnavailable = false
    for (const version of journalKey ? ['', 'v2-'] : ['']) {
      let bytes: Buffer
      try { bytes = await readFile(join(this.directory, `sync-send-${version}${key}.bin`), { signal }) }
      catch (error) {
        if (signal?.aborted) throw new SyncFailure('cancelled')
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue
        throw new SyncFailure('storage')
      }
      if (signal?.aborted || revision !== this.revision) throw new SyncFailure('cancelled')
      try {
        if (bytes.length > 8_388_608) throw new Error('Invalid protected send journal')
        let text: string
        if (version) text = openLocal(journalKey!, `send|${key}`, bytes).toString()
        else {
          try {
            if (!this.cipher.available()) throw Error('OS credentials unavailable')
            text = this.cipher.decrypt(bytes)
          } catch {
            if (!journalKey) throw new SyncFailure('storage')
            legacyUnavailable = true; continue
          }
        }
        const body = JSON.parse(text)
        if (body.context !== key || !Array.isArray(body.rows) || body.rows.length > 400) throw new Error('Invalid send journal')
        for (const row of body.rows as PendingPlain[]) {
          const op = parseSyncOp(JSON.parse(row.payload))
          if (op.opId !== row.opId || !Number.isSafeInteger(row.localOrder) || sha256Hex(syncOpPayload(op)) !== row.payloadHash) throw new Error('Invalid prepared payload')
          next.set(row.opId, row)
        }
      } catch { throw new SyncFailure('storage') }
    }
    if (signal?.aborted || revision !== this.revision) throw new SyncFailure('cancelled')
    this.context = key; this.rows = next; this.key = journalKey ?? null
    this.legacyUnavailable = legacyUnavailable; this.blocked.clear()
  }
  restore(rows: PendingPlain[], unknown = false): PendingPlain[] {
    return rows.flatMap(row => {
      const prepared = this.rows.get(row.opId)
      if (!prepared && unknown) {
        if (!this.legacyUnavailable) throw new SyncFailure('storage', 'missing prepared send')
        const op = parseSyncOp(JSON.parse(row.payload))
        // Task payloads are complete in SQLite. An old redacted API key is not reconstructible.
        if (op.actions.some(action => action.t === 'pref.set' && isSecretSettingKey(action.key) && isSecretFingerprint(action.value))) this.blocked.add(row.opId)
      }
      if (this.blocked.has(row.opId)) return []
      if (prepared && prepared.localOrder !== row.localOrder) throw new SyncFailure('storage')
      return [prepared ?? row]
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
  private path() { return join(this.directory, `sync-send-${this.key ? 'v2-' : ''}${this.context}.bin`) }
  private async persist(): Promise<void> {
    if (!this.rows.size) { await rm(this.path(), { force: true }); return }
    const path = this.path()
    const text = JSON.stringify({ context: this.context, rows: [...this.rows.values()] })
    if (!this.key && !this.cipher.available()) throw new SyncFailure('key')
    const bytes = this.key ? sealLocal(this.key, `send|${this.context}`, Buffer.from(text)) : this.cipher.encrypt(text)
    try { await writeFile(`${path}.tmp`, bytes, { mode: 0o600 }); await rename(`${path}.tmp`, path) }
    catch { throw new SyncFailure('storage') }
  }
}
