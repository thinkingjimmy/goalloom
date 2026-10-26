// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Metadata-only deletion events and an explicitly configured independent durable store.
 * [OUTPUT]: Idempotent durable append/get/head/bounded-read; no production local-file fallback.
 * [POS]: Restore-independent deletion ledger port. Development SQLite lives under scripts/lifecycle.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { canonicalJson } from '../../../packages/contracts/src/canonical.ts'
import { body, hex32, LifecycleError, object, uuid } from './http.ts'
export type LedgerEvent = { eventId: string; digest: string; record: Record<string, unknown> }
export type LedgerEntry = LedgerEvent & { cursor: string }
export type LedgerHead = { storeId: string; cursor: string }
export type LedgerPage = { storeId: string; entries: LedgerEntry[]; nextAfter: string; done: boolean }
export function ledgerCursor(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n
}
export interface DeletionLedger {
  append(event: LedgerEvent): Promise<LedgerHead & { digest: string }>
  get(eventId: string): Promise<LedgerEntry | null>
  head(): Promise<LedgerHead>
  read(after: string | null, through: string, limit: number): Promise<LedgerPage>
}
export async function eventDigest(record: Record<string, unknown>): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(record))))].map(value => value.toString(16).padStart(2, '0')).join('')
}
export async function validateEvent(value: unknown): Promise<LedgerEvent> {
  const event = object(value, ['eventId','digest','record'])
  if (!uuid.test(String(event.eventId)) || !hex32.test(String(event.digest))) throw new LifecycleError('lifecycle_unavailable')
  const record = event.record as Record<string, unknown>
  const allowed = ['version','eventId','environment','projectRef','subjectId','ownerTag','requestId','target','lifecycleVersion','reason','kind','closedAt','retrieveUntil','onlineDeleteBy','onlineDeletedAt','scheduledAccessEnd','accessEndedAt','deletionReceipt']
  if (!record || typeof record !== 'object' || Array.isArray(record) || Object.keys(record).some(key => !allowed.includes(key)) || record.version !== 1
    || record.eventId !== event.eventId || !['development','production'].includes(String(record.environment))
    || !uuid.test(String(record.subjectId)) || !hex32.test(String(record.ownerTag))
    || !['intent','online_deleted','account_deleted','ordinary_cancelled'].includes(String(record.kind))
    || !Number.isSafeInteger(record.lifecycleVersion) || Number(record.lifecycleVersion) < 0
    || await eventDigest(record) !== event.digest) throw new LifecycleError('lifecycle_unavailable')
  const refs = { development: 'asqyvcnxdltzzfutbbqy', production: 'keqprrgvcefqdwnxaafv' }
  if (record.projectRef !== refs[record.environment as keyof typeof refs]
    || record.requestId !== null && !uuid.test(String(record.requestId))
    || record.reason !== null && !['ordinary_expiry','explicit_cloud','account_delete','reset_sync'].includes(String(record.reason))) throw new LifecycleError('lifecycle_unavailable')
  if (record.target !== null) {
    const target = object(record.target, ['workspaceId','generation'])
    if (!uuid.test(String(target.workspaceId)) || !uuid.test(String(target.generation))) throw new LifecycleError('lifecycle_unavailable')
  } else if (record.reason !== 'account_delete' || !['intent','account_deleted'].includes(String(record.kind))) throw new LifecycleError('lifecycle_unavailable')
  for (const key of ['closedAt','retrieveUntil','onlineDeleteBy','onlineDeletedAt','scheduledAccessEnd','accessEndedAt']) {
    const value = record[key]
    if (value !== null && value !== undefined && (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value) || !Number.isFinite(Date.parse(value)))) throw new LifecycleError('lifecycle_unavailable')
  }
  if (record.requestId !== null) {
    const receipt = object(record.deletionReceipt, ['scope','receiptDigest','expectedRevision','preparedAt','confirmedAt'])
    if (!['account','cloud'].includes(String(receipt.scope)) || !hex32.test(String(receipt.receiptDigest))
      || !Number.isSafeInteger(receipt.expectedRevision) || Number(receipt.expectedRevision) < 0
      || receipt.scope === 'cloud' && record.target === null) throw new LifecycleError('lifecycle_unavailable')
    for (const key of ['preparedAt','confirmedAt']) if (typeof receipt[key] !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(String(receipt[key])) || !Number.isFinite(Date.parse(String(receipt[key])))) throw new LifecycleError('lifecycle_unavailable')
    const prepared = Date.parse(String(receipt.preparedAt)), confirmed = Date.parse(String(receipt.confirmedAt))
    if (confirmed < prepared || confirmed >= prepared + 24 * 3600_000) throw new LifecycleError('lifecycle_unavailable')
  } else if (record.deletionReceipt !== null) throw new LifecycleError('lifecycle_unavailable')
  if (new TextEncoder().encode(JSON.stringify(event)).length > 8192) throw new LifecycleError('lifecycle_unavailable')
  return event as LedgerEvent
}
/** Only an owner-selected independent service can satisfy production readiness. */
export function httpLedger(config: { url: string; token: string; storeId: string; environment: string; fetch?: typeof fetch }): DeletionLedger {
  const endpoint = new URL(config.url), http = config.fetch ?? fetch
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !config.token || config.token.length < 32 || !config.storeId
    || endpoint.protocol !== 'https:' && !(config.environment === 'development' && endpoint.protocol === 'http:' && ['127.0.0.1','localhost'].includes(endpoint.hostname))) throw new LifecycleError('lifecycle_unavailable')
  const call = async <T>(action: string, request: Record<string, unknown>): Promise<T> => {
    const response = await http(`${config.url.replace(/\/$/, '')}/${action}`, { method: 'POST',
      headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ version: 1, ...request }),
      signal: AbortSignal.timeout(10000), redirect: 'error' })
    if (!response.ok) throw new LifecycleError('lifecycle_unavailable')
    const value = await body(response, 1024 * 1024) as Record<string, unknown>
    if (value.storeId !== config.storeId) throw new LifecycleError('lifecycle_unavailable')
    return value as T
  }
  const validate = async (event: unknown): Promise<LedgerEvent> => {
    const value = await validateEvent(event)
    if (value.record.environment !== config.environment) throw new LifecycleError('lifecycle_unavailable')
    return value
  }
  return {
    async append(input) {
      const event = await validate(input)
      const acknowledgment = await call<LedgerHead & { digest: string }>('append', { event })
      if (acknowledgment.digest !== event.digest || !ledgerCursor(acknowledgment.cursor) || acknowledgment.cursor === '0') throw new LifecycleError('lifecycle_unavailable')
      return acknowledgment
    },
    async get(eventId) {
      if (!uuid.test(eventId)) throw new LifecycleError('lifecycle_unavailable')
      const value = await call<{ entry: LedgerEntry | null }>('get', { eventId })
      if (value.entry) {
        if (value.entry.eventId !== eventId || !ledgerCursor(value.entry.cursor) || value.entry.cursor === '0') throw new LifecycleError('lifecycle_unavailable')
        await validate({ eventId: value.entry.eventId, digest: value.entry.digest, record: value.entry.record })
      } else if (value.entry !== null) throw new LifecycleError('lifecycle_unavailable')
      return value.entry
    },
    async head() {
      const head = await call<LedgerHead>('head', {})
      if (!ledgerCursor(head.cursor)) throw new LifecycleError('lifecycle_unavailable')
      return head
    },
    async read(after, through, limit) {
      if (!ledgerCursor(after ?? '0') || !ledgerCursor(through) || BigInt(after ?? '0') > BigInt(through)
        || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new LifecycleError('lifecycle_unavailable')
      const page = await call<LedgerPage>('read', { after, through, limit })
      if (!Array.isArray(page.entries) || page.entries.length > limit || typeof page.nextAfter !== 'string' || typeof page.done !== 'boolean') throw new LifecycleError('lifecycle_unavailable')
      let cursor = BigInt(after ?? '0')
      for (const entry of page.entries) {
        if (!ledgerCursor(entry.cursor) || BigInt(entry.cursor) !== cursor + 1n || BigInt(entry.cursor) > BigInt(through)) throw new LifecycleError('lifecycle_unavailable')
        await validate({ eventId: entry.eventId, digest: entry.digest, record: entry.record }); cursor++
      }
      if (page.nextAfter !== String(cursor) || page.done !== (cursor === BigInt(through)) || !page.done && page.entries.length === 0) throw new LifecycleError('lifecycle_unavailable')
      return page
    },
  }
}
