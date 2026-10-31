/**
 * [INPUT]: Verified expected binding identities and transaction-owned active operational rows.
 * [OUTPUT]: Bootstrap-once binding guards, immutable retirement copies/digests and bounded aggregate evidence summaries.
 * [POS]: Same-database ownership seam; retired rows never participate in active replay or sending.
 */
import { canonicalJson } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import type { SqlDriver, SqlValue } from './driver'
import { seedAssert } from './seed-types'

export interface BindingIdentity {
  accountId: string; projectRef: string; environment: 'development' | 'production'
  workspaceId: string; generation: string; localGeneration: string
  deviceId: string; keyEpoch: number; bindingToken: string
}
export const retiredKinds = ['sync_op', 'canon_op', 'canon_change', 'conflict', 'sync_state', 'sync_setting', 'seed_state', 'active_binding', 'command_identity'] as const
export type RetiredKind = typeof retiredKinds[number]
export type RetiredCounts = Record<RetiredKind, number>
interface RetiredRow { kind: RetiredKind; rowKey: string; value: string }
export interface RetiredEvidence { counts: RetiredCounts; digest: string }
export interface RetiredBindingSummary {
  bindings: number; rows: number; unresolved: number; unknown: number; acceptedNotApplied: number
  evidenceState: 'none' | 'retained'
}
const emptyCounts = (): RetiredCounts => Object.fromEntries(retiredKinds.map(kind => [kind, 0])) as RetiredCounts
const fields = ['accountId', 'projectRef', 'environment', 'workspaceId', 'generation', 'localGeneration', 'deviceId', 'keyEpoch', 'bindingToken'] as const

export function validateBinding(value: BindingIdentity): void {
  seedAssert(value && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field)), 'binding fields')
  for (const field of fields) if (field !== 'keyEpoch') seedAssert(typeof value[field] === 'string' && value[field].length > 0 && value[field].length <= 180 && /^[a-zA-Z0-9:_-]+$/.test(value[field]), `binding ${field}`)
  seedAssert(['development', 'production'].includes(value.environment) && Number.isSafeInteger(value.keyEpoch) && value.keyEpoch > 0, 'binding profile')
}
export function readActiveBinding(driver: SqlDriver): BindingIdentity | null {
  const row = driver.prepare('SELECT identity FROM sync_active_binding WHERE id=1').get()
  if (!row) return null
  const binding = JSON.parse(String(row.identity)) as BindingIdentity
  validateBinding(binding)
  return binding
}
function assertRuntimeBinding(driver: SqlDriver, binding: BindingIdentity): void {
  const row = driver.prepare('SELECT s.workspaceId,s.deviceId,s.keyEpoch,w.generation FROM sync_state s CROSS JOIN workspace w WHERE s.id=1 AND w.id=1').get()
  seedAssert(row && row.workspaceId === binding.workspaceId && row.deviceId === binding.deviceId && row.keyEpoch === binding.keyEpoch && row.generation === binding.localGeneration, 'active runtime binding mismatch')
}
export function setActiveBinding(driver: SqlDriver, binding: BindingIdentity): void {
  validateBinding(binding)
  assertRuntimeBinding(driver, binding)
  const current = readActiveBinding(driver)
  seedAssert(!current || canonicalJson(current) === canonicalJson(binding), 'active binding already established')
  if (!current) driver.prepare('INSERT INTO sync_active_binding(id,identity) VALUES (1,?)').run(canonicalJson(binding))
}
export function assertActiveBinding(driver: SqlDriver, expected: BindingIdentity): void {
  validateBinding(expected)
  seedAssert(canonicalJson(readActiveBinding(driver)) === canonicalJson(expected), 'stale active binding')
  assertRuntimeBinding(driver, expected)
}

export function assertUnboundBinding(driver: SqlDriver, expectedLocalGeneration: string): void {
  seedAssert(!readActiveBinding(driver), 'unbound source already has active identity')
  const state = driver.prepare('SELECT * FROM sync_state WHERE id=1').get()
  seedAssert(state && state.workspaceId === null && state.keyEpoch === null && Number(state.lastAppliedSeq) === 0 && Number(state.lastUploadedSeq) === 0
    && driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation === expectedLocalGeneration, 'unbound source identity')
  seedAssert(!driver.prepare('SELECT 1 FROM canon_ops LIMIT 1').get() && !driver.prepare('SELECT 1 FROM canon_changes LIMIT 1').get()
    && !driver.prepare('SELECT 1 FROM sync_conflicts LIMIT 1').get() && !driver.prepare('SELECT 1 FROM sync_seed_state LIMIT 1').get(), 'unbound canonical or initialization evidence')
  seedAssert(!driver.prepare(`SELECT 1 FROM sync_ops WHERE origin<>'local' OR state NOT IN ('never_sent','reverted_local')
    OR seq IS NOT NULL OR sendAttemptId IS NOT NULL OR keyEpoch IS NOT NULL OR outcome IS NOT NULL LIMIT 1`).get(), 'unbound source has delivery identity')
}

/** Only the atomic transition may install a different binding, against its durable matching receipt. */
export function switchActiveBinding(driver: SqlDriver, expected: BindingIdentity | null, next: BindingIdentity, at: string, requestId: string): void {
  if (expected) assertActiveBinding(driver, expected)
  else assertUnboundBinding(driver, next.localGeneration)
  validateBinding(next)
  const stored = driver.prepare('SELECT receipt FROM sync_binding_transitions WHERE requestId=?').get(requestId)
  seedAssert(stored, 'binding switch requires transition receipt')
  const receipt = JSON.parse(String(stored.receipt)) as { oldBinding: BindingIdentity | null; newBinding: BindingIdentity }
  seedAssert(canonicalJson(receipt.oldBinding) === canonicalJson(expected) && canonicalJson(receipt.newBinding) === canonicalJson(next), 'binding transition receipt mismatch')
  seedAssert(next.keyEpoch === 1 && (!expected || next.localGeneration === expected.localGeneration && next.workspaceId !== expected.workspaceId
    && next.generation !== expected.generation && next.bindingToken !== expected.bindingToken && next.accountId === expected.accountId
    && next.projectRef === expected.projectRef && next.environment === expected.environment), 'new binding identity')
  driver.prepare('UPDATE sync_state SET workspaceId=?,deviceId=?,keyEpoch=?,lastAppliedSeq=0,lastUploadedSeq=0,paused=NULL,updatedAt=? WHERE id=1')
    .run(next.workspaceId, next.deviceId, next.keyEpoch, at)
  driver.prepare('INSERT INTO sync_active_binding(id,identity,transitionRequestId) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET identity=excluded.identity,transitionRequestId=excluded.transitionRequestId')
    .run(canonicalJson(next), requestId)
}

function commandKey(localGeneration: string, operationId: string): string { return canonicalJson([localGeneration, operationId]) }
export function isRetiredCommand(driver: SqlDriver, localGeneration: string, operationId: string): boolean {
  return Boolean(driver.prepare("SELECT 1 FROM sync_retired_rows WHERE kind='command_identity' AND rowKey=? LIMIT 1").get(commandKey(localGeneration, operationId)))
}
function encodeRow(row: Record<string, SqlValue>): string {
  seedAssert(Object.values(row).every(value => value === null || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))), 'unsupported retired SQL value')
  return canonicalJson(row)
}
function numericKey(value: SqlValue | undefined): string {
  seedAssert(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, 'retired numeric identity')
  return String(value).padStart(16, '0')
}
function* activeRows(driver: SqlDriver, localGeneration: string): Generator<RetiredRow> {
  const sources: { kind: RetiredKind; table: string; keys: string[]; key: (row: Record<string, SqlValue>) => string }[] = [
    { kind: 'sync_op', table: 'sync_ops', keys: ['opId'], key: row => String(row.opId) },
    { kind: 'canon_op', table: 'canon_ops', keys: ['seq'], key: row => numericKey(row.seq) },
    { kind: 'canon_change', table: 'canon_changes', keys: ['seq', 'idx'], key: row => `${numericKey(row.seq)}:${numericKey(row.idx)}` },
    { kind: 'conflict', table: 'sync_conflicts', keys: ['opId'], key: row => String(row.opId) },
    { kind: 'sync_state', table: 'sync_state', keys: ['id'], key: () => '1' },
    { kind: 'sync_setting', table: 'sync_settings', keys: ['key'], key: row => String(row.key) },
    { kind: 'seed_state', table: 'sync_seed_state', keys: ['scope'], key: row => String(row.scope) },
    { kind: 'active_binding', table: 'sync_active_binding', keys: ['id'], key: () => '1' },
  ]
  for (const source of sources) {
    if (!driver.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(source.table)) continue
    const names = driver.prepare(`PRAGMA table_info(${source.table})`).all().map(row => String(row.name))
    seedAssert(!driver.prepare(`SELECT 1 FROM ${source.table} WHERE ${names.map(name => `length(CAST(${name} AS BLOB))>4194304`).join(' OR ')} LIMIT 1`).get(), 'retired field exceeds supported record size')
    let after: SqlValue[] | null = null
    for (;;) {
      const guard: string = after ? `WHERE (${source.keys.join(',')})>(${source.keys.map(() => '?').join(',')})` : ''
      const rows: Record<string, SqlValue>[] = driver.prepare(`SELECT * FROM ${source.table} ${guard} ORDER BY ${source.keys.join(',')} LIMIT 16`).all(...(after ?? []))
      if (!rows.length) break
      for (const row of rows) { yield { kind: source.kind, rowKey: source.key(row), value: encodeRow(row) }; after = source.keys.map((key): SqlValue => row[key]!) }
    }
  }
  let after: string | null = null
  for (;;) {
    const rows: Record<string, SqlValue>[] = driver.prepare(`SELECT id,generation FROM operations WHERE generation=?${after === null ? '' : ' AND id>?'} ORDER BY id LIMIT 16`).all(localGeneration, ...(after === null ? [] : [after]))
    if (!rows.length) break
    for (const row of rows) {
      const id = String(row.id); after = id
      if (!isRetiredCommand(driver, localGeneration, id)) yield { kind: 'command_identity', rowKey: commandKey(localGeneration, id), value: encodeRow(row) }
    }
  }
}
/** A domain-separated digest fold bounds memory to one source/copy page. */
function evidence(rows: Iterable<RetiredRow>): RetiredEvidence {
  const counts = emptyCounts()
  let digest = sha256Hex('goalloom/retired-binding/v1|')
  for (const row of rows) { counts[row.kind]++; digest = sha256Hex(`${digest}\n${canonicalJson(row)}`) }
  return { counts, digest }
}
function* retainedRows(driver: SqlDriver, requestId: string): Generator<RetiredRow> {
  for (const kind of retiredKinds) {
    let after: string | null = null
    for (;;) {
      const rows: Record<string, SqlValue>[] = driver.prepare(`SELECT rowKey,value FROM sync_retired_rows WHERE requestId=? AND kind=?${after === null ? '' : ' AND rowKey>?'} ORDER BY rowKey LIMIT 16`).all(requestId, kind, ...(after === null ? [] : [after]))
      if (!rows.length) break
      for (const row of rows) { after = String(row.rowKey); yield { kind, rowKey: after, value: String(row.value) } }
    }
  }
}
export function previewRetiredEvidence(driver: SqlDriver, localGeneration: string): RetiredEvidence {
  return evidence(activeRows(driver, localGeneration))
}
/** Caller owns the handoff transaction and the deferred transition-manifest insertion. Does not delete active rows. */
export function retainBindingRows(driver: SqlDriver, requestId: string, localGeneration: string): RetiredEvidence {
  const insert = driver.prepare('INSERT INTO sync_retired_rows(requestId,kind,rowKey,value) VALUES (?,?,?,?)')
  function* copy(): Generator<RetiredRow> {
    for (const row of activeRows(driver, localGeneration)) { insert.run(requestId, row.kind, row.rowKey, row.value); yield row }
  }
  const original = evidence(copy())
  seedAssert(canonicalJson(evidence(retainedRows(driver, requestId))) === canonicalJson(original), 'retired copy verification failed')
  return original
}

export function retiredBindingSummary(driver: SqlDriver): RetiredBindingSummary {
  const total = driver.prepare(`SELECT count(DISTINCT requestId) AS bindings,count(*) AS rows,
    COALESCE(sum(CASE WHEN kind='sync_op' AND json_extract(value,'$.state') IN ('never_sent','send_unknown','accepted') THEN 1 ELSE 0 END),0) AS unresolved,
    COALESCE(sum(CASE WHEN kind='sync_op' AND json_extract(value,'$.state')='send_unknown' THEN 1 ELSE 0 END),0) AS unknown,
    COALESCE(sum(CASE WHEN kind='sync_op' AND json_extract(value,'$.state')='accepted' THEN 1 ELSE 0 END),0) AS acceptedNotApplied FROM sync_retired_rows`).get()!
  return { bindings: Number(total.bindings), rows: Number(total.rows), unresolved: Number(total.unresolved), unknown: Number(total.unknown),
    acceptedNotApplied: Number(total.acceptedNotApplied), evidenceState: Number(total.rows) ? 'retained' : 'none' }
}
