/**
 * [INPUT]: Exact current item states, the active local generation and an injected observation time.
 * [OUTPUT]: One non-undoable system baseline operation and body-free observation events for selected items.
 * [POS]: Shared restore/sync history segmentation; observations never claim source execution time.
 */
import { createHash, randomUUID } from 'node:crypto'
import type { Item } from '../../shared/contracts/entities'
import type { Store } from '../storage/store'
import { serverText } from '../../shared/i18n/server'

export function addBaseline(store: Store, now: string, items: Item[] = store.items('1')): void {
  if (!items.length) return
  const id = randomUUID(), generation = store.workspace().generation
  const result = { operationId: id, generation, changed: true, undoable: false, outcome: 'committed' as const, itemId: null, label: serverText().labels.importBaseline, warnings: [], restoreSource: null, originalOperationId: null }
  store.saveOperation({ id, generation, requestHash: createHash('sha256').update(id).digest('hex'), kind: 'baseline', source: 'system', at: now, effectsVersion: 1, effects: [], result })
  for (const item of items) store.event(id, now, 'baseline', null, item)
}
