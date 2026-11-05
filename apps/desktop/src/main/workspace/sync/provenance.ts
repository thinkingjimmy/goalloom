/**
 * [INPUT]: Whole projection transactions, exact local event boundaries and a verified current binding.
 * [OUTPUT]: Honest business-state observations after remote changes without invented executable history.
 * [POS]: Current sync/history bridge. It does not preserve removed guidance metadata.
 */
import type { DatabaseSync } from 'node:sqlite'
import { canonicalJson } from '@goalloom/contracts'
import type { BindingIdentity, SqlDriver } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { businessState, sameBusinessState } from '../../../shared/contracts/effects'
import { addBaseline } from '../baseline'
import { Store } from '../../storage/store'

function boundary(db: DatabaseSync) {
  const event = db.prepare('SELECT operationId,seq FROM item_events ORDER BY seq DESC LIMIT 1').get()
  return { afterOperationId: event ? String(event.operationId) : null, afterEventSeq: Number(event?.seq ?? 0) }
}
export function withProjectionObservation<T>(db: DatabaseSync, input: {
  binding: BindingIdentity | null; cause: 'install' | 'absorb' | 'receipt'; at: string
}, work: (driver: SqlDriver) => T): T {
  return nodeSqlDriver(db).transaction(() => {
    const driver = nodeSqlDriver(db), store = new Store(db)
    const before = new Map(store.items('1').map(item => [item.id, businessState(item)]))
    const tails = new Map(db.prepare(`SELECT e.itemId,json_extract(e.afterState,'$.version') AS version FROM item_events e
      JOIN (SELECT itemId,max(seq) AS seq FROM item_events GROUP BY itemId) tail ON tail.seq=e.seq`).all().map(row => [String(row.itemId), Number(row.version)]))
    const localBoundary = boundary(db)
    const result = work({ ...driver, transaction: <R>(run: () => R): R => run() })
    if (input.cause === 'install' && result === 'choose') return result
    const observations = store.items('1').filter(item => {
      const previous = before.get(item.id)
      return !previous || !sameBusinessState(previous, businessState(item)) || item.version < (tails.get(item.id) ?? 0)
        || input.cause === 'install' && !tails.has(item.id)
    })
    if (!observations.length) return result
    if (!input.binding || canonicalJson(boundary(db)) !== canonicalJson(localBoundary)) throw Error('projection_observation_boundary')
    addBaseline(store, input.at, observations)
    return result
  })
}
