/**
 * [INPUT]: Explicit owner-only local file outside the restored business database and bounded metadata events.
 * [OUTPUT]: Real durable SQLite deletion ledger surviving process restart and isolated business restore.
 * [POS]: Development-only adapter. Never imported by Edge or selected as a production fallback.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { DatabaseSync } from 'node:sqlite'
import { chmodSync, lstatSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { canonicalJson } from '../../packages/contracts/src/canonical.ts'
const digest = record => createHash('sha256').update(canonicalJson(record)).digest('hex')
export class LocalSqliteLedger {
  constructor(path) {
    if (!isAbsolute(path) || path === ':memory:') throw Error('Explicit persistent local ledger path required')
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    try { if (lstatSync(path).isSymbolicLink()) throw Error('Ledger symlink rejected') } catch (error) { if (error.code !== 'ENOENT') throw error }
    this.db = new DatabaseSync(path)
    chmodSync(path, 0o600)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
    this.db.exec('CREATE TABLE IF NOT EXISTS identity(id INTEGER PRIMARY KEY CHECK(id=1),store_id TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(cursor INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,digest TEXT NOT NULL,record TEXT NOT NULL);')
    this.db.prepare('INSERT OR IGNORE INTO identity VALUES(1,?)').run(`local-development-${randomUUID()}`)
    this.storeId = this.db.prepare('SELECT store_id FROM identity WHERE id=1').get().store_id
  }
  async append(event) {
    if (!event || event.record?.eventId !== event.eventId || !/^[a-f0-9]{64}$/.test(event.digest) || digest(event.record) !== event.digest) throw Error('Invalid ledger event')
    const encoded = canonicalJson(event.record)
    if (Buffer.byteLength(encoded) > 8192) throw Error('Ledger record limit')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.db.prepare('SELECT cursor,digest,record FROM events WHERE event_id=?').get(event.eventId)
      if (previous && (previous.digest !== event.digest || previous.record !== encoded)) throw Error('Ledger event identity conflict')
      if (!previous) this.db.prepare('INSERT INTO events(event_id,digest,record) VALUES(?,?,?)').run(event.eventId,event.digest,encoded)
      const row = this.db.prepare('SELECT cursor,digest FROM events WHERE event_id=?').get(event.eventId)
      this.db.exec('COMMIT')
      return { storeId: this.storeId, cursor: String(row.cursor), digest: row.digest }
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  async get(eventId) {
    const row = this.db.prepare('SELECT cursor,event_id,digest,record FROM events WHERE event_id=?').get(eventId)
    return row ? { cursor: String(row.cursor), eventId: row.event_id, digest: row.digest, record: JSON.parse(row.record) } : null
  }
  async head() { return { storeId: this.storeId, cursor: String(this.db.prepare('SELECT COALESCE(MAX(cursor),0) n FROM events').get().n) } }
  async read(after, through, limit) {
    if (!/^(0|[1-9][0-9]*)$/.test(after ?? '0') || !/^(0|[1-9][0-9]*)$/.test(through) || !Number.isInteger(limit) || limit<1 || limit>100) throw Error('Invalid ledger cursor')
    if (BigInt(after ?? '0') > BigInt(through) || BigInt(through) > BigInt((await this.head()).cursor)) throw Error('Unavailable ledger prefix')
    const rows = this.db.prepare('SELECT cursor,event_id,digest,record FROM events WHERE cursor>? AND cursor<=? ORDER BY cursor LIMIT ?').all(BigInt(after ?? '0'), BigInt(through), limit)
    const next = rows.length ? String(rows.at(-1).cursor) : after ?? '0'
    let cursor = BigInt(after ?? '0')
    for (const row of rows) { if (BigInt(row.cursor) !== ++cursor) throw Error('Missing ledger prefix') }
    if (!rows.length && cursor < BigInt(through)) throw Error('Missing ledger prefix')
    return { storeId: this.storeId, entries: rows.map(row=>({cursor:String(row.cursor),eventId:row.event_id,digest:row.digest,record:JSON.parse(row.record)})), nextAfter: next, done: BigInt(next)>=BigInt(through) }
  }
  close() { this.db.close() }
}
