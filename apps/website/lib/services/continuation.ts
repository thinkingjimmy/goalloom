/**
 * [INPUT]: Finite BILL-12 URL fields, session-scoped storage and browser time.
 * [OUTPUT]: Validated non-authorizing continuation, bounded session recovery and fixed app return targets.
 * [POS]: Static website handoff boundary; the desktop/backend alone verify owner, operation and server expiry.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export type BillingKind = 'continue' | 'return'
export type Continuation = { id: string } & (
  { environment: 'production'; transport: 'app' } |
  { environment: 'development'; transport: 'loopback'; port: number }
)
export type ContinuationSession = { continuation: Continuation | null; expiresAt: number | null; invalid: boolean }

export const CONTINUATION_KEY = 'goalloom.billing.continuation.v1'
const maxAge = 24 * 60 * 60 * 1000
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const empty = (invalid = false): ContinuationSession => ({ continuation: null, expiresAt: null, invalid })

function parse(search: string): Continuation | null {
  if (search.length > 256) return null
  const params = new URLSearchParams(search)
  const keys = [...params.keys()]
  if (new Set(keys).size !== keys.length || keys.some(key => !['v', 'environment', 'continue', 'transport', 'port'].includes(key))) return null
  const id = params.get('continue') ?? ''
  if (params.get('v') !== '1' || !uuid.test(id)) return null
  if (keys.length === 4 && params.get('environment') === 'production' && params.get('transport') === 'app') return { id, environment: 'production', transport: 'app' }
  const port = params.get('port') ?? ''
  if (keys.length === 5 && params.get('environment') === 'development' && params.get('transport') === 'loopback'
    && /^[1-9][0-9]{3,4}$/u.test(port) && Number(port) >= 1024 && Number(port) <= 65535) return { id, environment: 'development', transport: 'loopback', port: Number(port) }
  return null
}

function fields(value: Continuation): URLSearchParams {
  return new URLSearchParams({ v: '1', environment: value.environment, continue: value.id })
}

function storedRecord(storage: Storage, now: number): { kind: BillingKind; fields: string; expiresAt: number } | null {
  const raw = storage.getItem(CONTINUATION_KEY)
  if (!raw) return null
  if (raw.length > 512) throw Error('invalid_continuation')
  const record = JSON.parse(raw)
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || Object.keys(record).sort().join(',') !== 'expiresAt,fields,kind'
    || !['continue', 'return'].includes(record.kind) || typeof record.fields !== 'string'
    || !Number.isSafeInteger(record.expiresAt) || record.expiresAt > now + maxAge || !parse(record.fields)) throw Error('invalid_continuation')
  return record
}

export function appReturn(value: Continuation): string {
  const base = value.transport === 'app' ? 'goalloom://billing-return' : `http://127.0.0.1:${value.port}/billing-return`
  return `${base}?${fields(value)}`
}

export function clearContinuation(storage: Storage): void {
  try { storage.removeItem(CONTINUATION_KEY) } catch { /* Manual app checks do not need browser storage. */ }
}

export function continuationSession(kind: BillingKind, search: string, hash: string, storage: Storage, now: number): ContinuationSession {
  if (search || hash) {
    const value = hash ? null : parse(search)
    if (!value) { clearContinuation(storage); return empty(true) }
    const params = fields(value)
    params.set('transport', value.transport)
    if (value.transport === 'loopback') params.set('port', String(value.port))
    // Store reconstructed fields only. URL content never becomes a destination or an account credential.
    let expiresAt = now + maxAge
    try {
      const previous = storedRecord(storage, now)
      if (previous && parse(previous.fields)?.id === value.id) {
        if (previous.fields !== params.toString() || previous.expiresAt <= now) { clearContinuation(storage); return empty(true) }
        expiresAt = previous.expiresAt
      }
      storage.setItem(CONTINUATION_KEY, JSON.stringify({ kind, fields: params.toString(), expiresAt }))
    }
    catch { return empty() }
    return { continuation: value, expiresAt, invalid: false }
  }
  try {
    const record = storedRecord(storage, now)
    if (!record) return empty()
    if (record.expiresAt <= now) throw Error('invalid_continuation')
    const value = parse(record.fields)
    if (!value) throw Error('invalid_continuation')
    if (record.kind !== kind) return empty()
    return { continuation: value, expiresAt: record.expiresAt, invalid: false }
  } catch { clearContinuation(storage); return empty(true) }
}
