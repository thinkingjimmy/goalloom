/**
 * [INPUT]: Whole sync projection transactions, complete local event boundaries and verified source binding/cursor.
 * [OUTPUT]: Atomic guidance checkpoints and honest business-state observations; unchanged acknowledgements append nothing.
 * [POS]: Schema13 portable guidance provenance beside local history. It never invents executable origin receipts/events.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { canonicalJson } from '@goalloom/contracts'
import type { BindingIdentity, SqlDriver } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { guidanceRecordSchema, type GuidanceRecord } from '../../../shared/contracts/assistance'
import { guidanceCheckpointSchema, type GuidanceCheckpoint, type GuidanceState } from '../../../shared/contracts/provenance'
import { businessState, sameBusinessState } from '../../../shared/contracts/effects'
import { addBaseline } from '../baseline'
import { Store } from '../../storage/store'
import { guidanceIdentity } from '../commands/assistance'

function capture(db: DatabaseSync): Map<string, GuidanceState> {
  const store = new Store(db)
  return new Map(db.prepare('SELECT * FROM item_guidance ORDER BY itemId').all().map(row => {
    const head = guidanceRecordSchema.parse({ ...row, value: row.value === null ? null : JSON.parse(String(row.value)) })
    return [head.itemId, { head, identity: guidanceIdentity(store, head) }]
  }))
}
function boundary(db: DatabaseSync) {
  const event = db.prepare('SELECT operationId,seq FROM item_events ORDER BY seq DESC LIMIT 1').get()
  return { afterOperationId: event ? String(event.operationId) : null, afterEventSeq: Number(event?.seq ?? 0) }
}

export function appendGuidanceCheckpoint(db: DatabaseSync, checkpoint: GuidanceCheckpoint): void {
  const parsed = guidanceCheckpointSchema.parse(checkpoint)
  db.prepare('INSERT INTO guidance_baselines(position,id,record) VALUES (?,?,?)').run(parsed.order, parsed.id, canonicalJson(parsed))
}
export function baselineGuidanceCheckpoint(heads: GuidanceRecord[], at: string): GuidanceCheckpoint | null {
  if (!heads.length) return null
  return { id: randomUUID(), order: 1, at, afterOperationId: null, afterEventSeq: 0, source: null, cause: 'baseline',
    changes: [...heads].sort((a, b) => a.itemId < b.itemId ? -1 : 1).map(head => ({ itemId: head.itemId, before: null, after: { head, identity: head.operationId } })) }
}
export function withGuidanceCheckpoint<T>(db: DatabaseSync, input: {
  binding: BindingIdentity | null; cause: 'install' | 'absorb' | 'receipt'; at: string
}, work: (driver: SqlDriver) => T): T {
  const driver = nodeSqlDriver(db)
  return driver.transaction(() => {
    const store = new Store(db), beforeItems = new Map(store.items('1').map(item => [item.id, businessState(item)]))
    const tails = new Map(db.prepare(`SELECT e.itemId,json_extract(e.afterState,'$.version') AS version FROM item_events e
      JOIN (SELECT itemId,max(seq) AS seq FROM item_events GROUP BY itemId) tail ON tail.seq=e.seq`).all().map(row => [String(row.itemId), Number(row.version)]))
    const before = capture(db), localBoundary = boundary(db)
    const result = work({ ...driver, transaction: <R>(run: () => R): R => run() })
    const after = capture(db), changes: GuidanceCheckpoint['changes'] = []
    for (const itemId of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const previous = before.get(itemId) ?? null, next = after.get(itemId) ?? null
      if (canonicalJson(previous) !== canonicalJson(next)) changes.push({ itemId, before: previous, after: next })
    }
    if (input.cause === 'install' && result === 'choose') return result
    const observations = store.items('1').filter(item => {
      const previous = beforeItems.get(item.id)
      return !previous || !sameBusinessState(previous, businessState(item))
        || item.version < (tails.get(item.id) ?? 0)
        || input.cause === 'install' && result !== 'choose' && !tails.has(item.id)
    })
    if (!changes.length && !observations.length) return result
    if (!input.binding || canonicalJson(boundary(db)) !== canonicalJson(localBoundary)) throw Error('guidance_provenance_boundary')
    if (changes.length) appendGuidanceCheckpoint(db, { id: randomUUID(), order: Number(db.prepare('SELECT COALESCE(MAX(position),0)+1 AS n FROM guidance_baselines').get()?.n),
      at: input.at, ...localBoundary, source: { workspaceId: input.binding.workspaceId, generation: input.binding.generation, seq: Number(db.prepare('SELECT lastAppliedSeq FROM sync_state WHERE id=1').get()?.lastAppliedSeq) }, cause: input.cause, changes })
    addBaseline(store, input.at, observations)
    return result
  })
}
