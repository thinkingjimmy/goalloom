/**
 * [INPUT]: Isolated evidence directory, exact legacy v5 DDL and production Repository/transfer APIs.
 * [OUTPUT]: Legacy transfer fidelity, v6 round trips and first-month/week review guards before the original anchor.
 * [POS]: Calendar storage acceptance under Electron's actual Node/SQLite, with an injected clock.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLegacyV5 } from './legacy-v5'
import { openDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'
import { exportDataset, readSqliteDataset, replaceDataset } from '../../../src/main/workspace/transfer/dataset'
import { validateDataset } from '../../../src/domain/import-validation'
import { openWorkspace } from '../../../src/main/storage/startup'
import { readReviewContext } from '../../../src/main/workspace/review'
import { currentPeriod, precedingPeriod } from '../../../src/domain/calendar'

const directory = process.argv[2]!
const path = join(directory, 'legacy-v5.sqlite'), db = openDatabase(path)
createLegacyV5(db)
let now = '2026-01-31T12:00:00Z'
const repo = new Repository(db, { now: () => now })
const run = (action: Record<string, unknown>) => repo.execute({ generation: repo.store.workspace().generation, operationId: randomUUID(), ...action })
run({ type: 'confirmSetup', mode: 'rolling', timezone: 'UTC', weekStart: 1, anchor: { kind: 'date', date: '2026-01-31' }, confirmed: true })
const root = run({ type: 'create', title: 'Legacy direction', horizon: 'cycle', flowColor: 0 }).itemId!
const held = run({ type: 'create', title: 'Legacy held item', horizon: 'month', parentId: root, expectedParentVersion: 1 }).itemId!
now = '2026-10-02T12:00:00Z'
const item = repo.store.item(held)
const moved = run({ type: 'move', itemId: held, horizon: 'month', expectedVersion: item.version, expectedPlacementVersion: item.placement.version })
run({ type: 'undo', originalOperationId: moved.operationId })
const period = repo.snapshot().periods.find(p => p.horizon === 'week')!
const plan = run({ type: 'createPlan', items: [{ draftId: 'legacy-plan', title: 'Legacy planned action', description: 'Preserved description', dueDate: null, horizon: 'week', previewPeriodId: period.id, parentRefs: [{ kind: 'existing', itemId: root, expectedVersion: repo.store.item(root).version }], flowColor: null }] })
run({ type: 'undo', originalOperationId: plan.operationId })
// v5 had no mode property; the new reader must normalize it to rolling without changing the source.
db.exec("UPDATE workspace SET calendar=json_remove(calendar,'$.mode')")
const source = exportDataset(repo.store, now, 5)
assert(source.events.length > 3 && source.undoEffects.length > 0)
assert(source.placements.some(row => row.holdPeriodId !== null))
assert(source.operations.some(row => row.kind === 'createPlan' && row.result.itemIds?.length))
const legacyJson = structuredClone(source)
Reflect.deleteProperty(legacyJson.workspace.calendar!, 'mode')
writeFileSync(join(directory, 'legacy-v5.json'), JSON.stringify(legacyJson))
db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close()
await assert.rejects(() => openWorkspace(path, join(directory, "refused-backups"), () => now), /version|版本|unsupported|支持/i)
const sources = [validateDataset(legacyJson, now), await readSqliteDataset(path, now)]
const fields = ['items', 'placements', 'periods', 'relations', 'events', 'operations', 'undoEffects', 'policies'] as const
const checks: string[] = []
// A preceding review must load without inventing year/half/cycle periods before setup.
for (const [horizon, date] of [['month', '2026-10-01'], ['week', '2026-10-05']] as const) {
  const target = openDatabase(':memory:'); migrate(target)
  const observation = `${date}T12:00:00Z`
  const destination = new Repository(target, { now: () => observation })
  destination.execute({ type: 'confirmSetup', mode: 'rolling', timezone: 'UTC', weekStart: 1, anchor: { kind: 'today', expected: date }, confirmed: true,
    generation: destination.store.workspace().generation, operationId: randomUUID() })
  const previous = precedingPeriod(destination.store.workspace().calendar!, currentPeriod(destination.store.workspace().calendar!, horizon, observation))!
  const review = readReviewContext(destination, { type: 'reviewContext', generation: destination.store.workspace().generation, periods: [{ horizon, startDate: previous.startDate }] })
  assert.deepEqual(review.board.periods.map(period => period.horizon), ['month', 'week', 'day'])
  checks.push(`BUG-11: first ${horizon} boundary loads preceding review without pre-anchor year/half/cycle`)
  target.close()
}
for (const [index, dataset] of sources.entries()) {
  const target = openDatabase(':memory:'); migrate(target)
  const destination = new Repository(target, { now: () => now })
  replaceDataset(destination.store, dataset, 'restore', now)
  const roundTrip = exportDataset(destination.store, now)
  assert.equal(roundTrip.schemaVersion, 6)
  assert.equal(roundTrip.workspace.calendar!.mode, 'rolling')
  assert.equal(roundTrip.workspace.calendar!.cycleAnchor, '2026-01-31')
  for (const field of fields) assert.deepEqual(roundTrip[field], source[field], `${index}/${field}`)
  const fresh = validateDataset(roundTrip, now)
  replaceDataset(destination.store, fresh, 'restore', now)
  for (const field of fields) assert.deepEqual(exportDataset(destination.store, now)[field], source[field])
  checks.push(`${index === 0 ? 'JSON' : 'SQLite'} v5 import and v6 round-trip preserve every business row`)
  target.close()
}
writeFileSync(join(directory, 'legacy-report.json'), JSON.stringify({ checks, counts: Object.fromEntries(fields.map(field => [field, source[field].length])), hold: source.placements.find(row => row.holdPeriodId)?.holdPeriodId, runtime: { node: process.versions.node, sqlite: process.versions.sqlite, electron: process.versions.electron } }, null, 2))
console.log(JSON.stringify({ checks }))
