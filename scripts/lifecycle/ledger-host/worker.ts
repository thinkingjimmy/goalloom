// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Fixed store identity, a private random Bearer token and validated deletion metadata.
 * [OUTPUT]: Authenticated append-only SQLite acknowledgements and bounded contiguous prefix reads.
 * [POS]: Independent Cloudflare Workers Free host. No business restore or destructive endpoint.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { DurableObject } from 'cloudflare:workers'
import { canonicalJson } from '../../../packages/contracts/src/canonical.ts'
import { secretMatches } from '../../../supabase/functions/billing/http.ts'
import { body, object, uuid } from '../../../supabase/functions/lifecycle/http.ts'
import { ledgerCursor, validateEvent } from '../../../supabase/functions/lifecycle/ledger.ts'

type Env = {
  LEDGER: DurableObjectNamespace<DeletionLedgerObject>
  LEDGER_TOKEN: string
  STORE_ID: string
  ENVIRONMENT: 'production' | 'development'
}
type Row = { cursor: string; event_id: string; digest: string; record: string }
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: {
  'content-type': 'application/json', 'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff',
} })
const unavailable = () => response({ error: 'ledger_unavailable' }, 503)
async function admitted(request: Request, env: Env): Promise<boolean> {
  return /^[a-f0-9]{64}$/.test(env.LEDGER_TOKEN ?? '') && uuid.test(env.STORE_ID ?? '')
    && ['production', 'development'].includes(env.ENVIRONMENT)
    && request.method === 'POST' && !request.headers.has('origin')
    && await secretMatches(request.headers.get('authorization'), `Bearer ${env.LEDGER_TOKEN}`)
}
function action(request: Request): string | null {
  const url = new URL(request.url)
  return !url.search && !url.hash && /^\/(append|get|head|read)$/.test(url.pathname) ? url.pathname.slice(1) : null
}
const entry = (row: Row) => ({ cursor: row.cursor, eventId: row.event_id, digest: row.digest, record: JSON.parse(row.record) })

export class DeletionLedgerObject extends DurableObject<Env> {
  private initialized = false
  private initialize(): void {
    if (this.initialized) return
    const sql = this.ctx.storage.sql
    this.ctx.storage.transactionSync(() => {
      sql.exec(`CREATE TABLE IF NOT EXISTS identity(id INTEGER PRIMARY KEY CHECK(id=1),store_id TEXT NOT NULL,environment TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(cursor INTEGER PRIMARY KEY CHECK(typeof(cursor)='integer' AND cursor>0),event_id TEXT NOT NULL UNIQUE,digest TEXT NOT NULL,record TEXT NOT NULL);
        CREATE TRIGGER IF NOT EXISTS no_event_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'append_only'); END;
        CREATE TRIGGER IF NOT EXISTS no_event_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'append_only'); END;
        CREATE TRIGGER IF NOT EXISTS no_identity_update BEFORE UPDATE ON identity BEGIN SELECT RAISE(ABORT,'fixed_identity'); END;
        CREATE TRIGGER IF NOT EXISTS no_identity_delete BEFORE DELETE ON identity BEGIN SELECT RAISE(ABORT,'fixed_identity'); END;`)
      sql.exec('INSERT OR IGNORE INTO identity VALUES(1,?,?)', this.env.STORE_ID, this.env.ENVIRONMENT)
      const identity = sql.exec<{ store_id: string; environment: string }>('SELECT store_id,environment FROM identity WHERE id=1').one()
      if (identity.store_id !== this.env.STORE_ID || identity.environment !== this.env.ENVIRONMENT) throw Error('identity_conflict')
    })
    this.initialized = true
  }
  private head(): string {
    return this.ctx.storage.sql.exec<{ cursor: string }>('SELECT CAST(COALESCE(MAX(cursor),0) AS TEXT) cursor FROM events').one().cursor
  }
  async fetch(request: Request): Promise<Response> {
    try {
      if (!await admitted(request, this.env)) return response({ error: 'authentication_failed' }, 401)
      const name = action(request)
      if (!name) return response({ error: 'invalid_request' }, 400)
      const fields: Record<string, string[]> = { append: ['version', 'event'], get: ['version', 'eventId'], head: ['version'], read: ['version', 'after', 'through', 'limit'] }
      const input = object(await body(request, 12288), fields[name])
      if (input.version !== 1) return response({ error: 'invalid_request' }, 400)
      // Validation may yield; the entire read/compare/write sequence below must remain synchronous.
      const event = name === 'append' ? await validateEvent(input.event) : null
      if (event && event.record.environment !== this.env.ENVIRONMENT) return response({ error: 'invalid_request' }, 400)
      if (name === 'get' && (typeof input.eventId !== 'string' || !uuid.test(input.eventId))) return response({ error: 'invalid_request' }, 400)
      if (name === 'read' && (!ledgerCursor(input.after ?? '0') || !ledgerCursor(input.through)
        || BigInt(String(input.after ?? '0')) > BigInt(String(input.through))
        || !Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 100)) return response({ error: 'invalid_request' }, 400)
      this.initialize()
      const sql = this.ctx.storage.sql, storeId = this.env.STORE_ID
      if (event) {
        const acknowledgment = this.ctx.storage.transactionSync(() => {
          const encoded = canonicalJson(event.record)
          const previous = sql.exec<Row>('SELECT CAST(cursor AS TEXT) cursor,event_id,digest,record FROM events WHERE event_id=?', event.eventId).toArray()[0]
          if (previous) {
            if (previous.digest !== event.digest || previous.record !== encoded) return null
            return { storeId, cursor: previous.cursor, digest: previous.digest }
          }
          const cursor = String(BigInt(this.head()) + 1n)
          if (!ledgerCursor(cursor)) throw Error('cursor_exhausted')
          sql.exec('INSERT INTO events(cursor,event_id,digest,record) VALUES(CAST(? AS INTEGER),?,?,?)', cursor, event.eventId, event.digest, encoded)
          return { storeId, cursor, digest: event.digest }
        })
        return acknowledgment ? response(acknowledgment) : response({ error: 'event_conflict' }, 409)
      }
      if (name === 'head') return response({ storeId, cursor: this.head() })
      if (name === 'get') {
        const row = sql.exec<Row>('SELECT CAST(cursor AS TEXT) cursor,event_id,digest,record FROM events WHERE event_id=?', String(input.eventId)).toArray()[0]
        return response({ storeId, entry: row ? entry(row) : null })
      }
      const after = String(input.after ?? '0'), through = String(input.through)
      if (BigInt(through) > BigInt(this.head())) return response({ error: 'prefix_unavailable' }, 409)
      const rows = sql.exec<Row>('SELECT CAST(cursor AS TEXT) cursor,event_id,digest,record FROM events WHERE events.cursor>CAST(? AS INTEGER) AND events.cursor<=CAST(? AS INTEGER) ORDER BY events.cursor LIMIT ?', after, through, Number(input.limit)).toArray()
      let cursor = BigInt(after)
      for (const row of rows) if (BigInt(row.cursor) !== ++cursor) throw Error('prefix_missing')
      if (!rows.length && cursor < BigInt(through)) throw Error('prefix_missing')
      return response({ storeId, entries: rows.map(entry), nextAfter: String(cursor), done: cursor === BigInt(through) })
    } catch { return unavailable() }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (!await admitted(request, env)) return response({ error: 'authentication_failed' }, 401)
      if (!action(request)) return response({ error: 'invalid_request' }, 400)
      // One permanent object name: a STORE_ID change must reach the original object and fail closed.
      return await env.LEDGER.get(env.LEDGER.idFromName('deletion-ledger-v1')).fetch(request)
    } catch { return unavailable() }
  },
}
