/**
 * [INPUT]: Isolated evidence directory, frozen v5/v6 DDL and production Repository/transfer APIs.
 * [OUTPUT]: Legacy transfer fidelity, historical milestone validation/undo, manual year/half defaults, v7 round trips and pre-anchor review guards.
 * [POS]: Calendar storage acceptance under Electron's actual Node/SQLite, with an injected clock.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLegacyV5, createLegacyV6 } from './legacy-v5'
import { openDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Store } from '../../../src/main/storage/store'
import { Repository } from '../../../src/main/workspace/repository'
import { exportDataset, readSqliteDataset, replaceDataset } from '../../../src/main/workspace/transfer/dataset'
import { validateDataset, validateImport } from '../../../src/domain/import-validation'
import { openWorkspace } from '../../../src/main/storage/startup'
import { readReviewContext } from '../../../src/main/workspace/review'
import { currentPeriod, precedingPeriod } from '../../../src/domain/calendar'
import { seedLegacyMilestone } from './legacy-milestone'

const directory = process.argv[2]!
const db = openDatabase(':memory:'); migrate(db)
let now = '2026-01-31T12:00:00Z'
const repo = new Repository(db, { now: () => now })
const run = (action: Record<string, unknown>) => repo.execute({ generation: repo.store.workspace().generation, operationId: randomUUID(), ...action })
run({ type: 'confirmSetup', mode: 'rolling', timezone: 'UTC', weekStart: 1, anchor: { kind: 'date', date: '2026-01-31' }, confirmed: true })
const root = run({ type: 'create', title: 'Legacy direction', horizon: 'cycle', flowColor: 0 }).itemId!
assert.equal(run({ type: 'move', itemId: root, horizon: 'cycle', expectedVersion: 1, expectedPlacementVersion: 1 }).changed, false)
const held = run({ type: 'create', title: 'Legacy held item', horizon: 'month', parentId: root, expectedParentVersion: 1 }).itemId!
now = '2026-10-02T12:00:00Z'
const item = repo.store.item(held)
const moved = run({ type: 'move', itemId: held, horizon: 'month', expectedVersion: item.version, expectedPlacementVersion: item.placement.version })
run({ type: 'undo', originalOperationId: moved.operationId })
const period = repo.snapshot().periods.find(p => p.horizon === 'week')!
const plan = run({ type: 'createPlan', items: [{ draftId: 'legacy-plan', title: 'Legacy planned action', description: 'Preserved description', dueDate: null, horizon: 'week', previewPeriodId: period.id, parentRefs: [{ kind: 'existing', itemId: root, expectedVersion: repo.store.item(root).version }], flowColor: null }] })
run({ type: 'undo', originalOperationId: plan.operationId })
const milestone = seedLegacyMilestone(repo, now)
const reversedMilestone = seedLegacyMilestone(repo, now)
assert.equal(run({ type: 'undo', originalOperationId: reversedMilestone }).outcome, 'committed')
const withMilestone = exportDataset(repo.store, now)
validateImport(withMilestone, now)
assert.throws(() => run({ type: 'insertBetween', title: 'Retired live write' }))
for (const mutation of ['duplicate-child', 'extra-create', 'missing-edge'] as const) {
  const malformed = structuredClone(withMilestone)
  const operation = malformed.operations.find(row => row.id === milestone)!
  if (mutation === 'duplicate-child') operation.effects.push(structuredClone(operation.effects[1]!))
  if (mutation === 'extra-create') operation.effects.push(structuredClone(operation.effects[0]!))
  if (mutation === 'missing-edge') {
    const effect = operation.effects[1]!
    if (effect.kind === 'relations') effect.edges.pop()
  }
  assert.throws(() => validateImport(malformed, now), mutation)
}
const fields = ['items', 'placements', 'periods', 'relations', 'events', 'operations', 'undoEffects', 'policies'] as const
const checks: string[] = []
checks.push('Legacy milestone: reject duplicate children, extra creates, malformed edge pairs and retired live writes')
checks.push('Unchanged move receipts with no effects survive JSON/SQLite import')
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
for (const version of [5, 6]) {
  if (version === 6) for (const horizon of ['year', 'half']) run({ type: 'create', title: `Legacy ${horizon}`, horizon })
  const path = join(directory, `legacy-v${version}.sqlite`), legacy = openDatabase(path)
  if (version === 5) createLegacyV5(legacy); else createLegacyV6(legacy)
  const store = new Store(legacy)
  store.saveWorkspace(repo.store.workspace())
  // Copy raw rows into the frozen schema; current setup intentionally writes six policies.
  for (const table of ['planning_periods', 'items', 'item_placements', 'item_relations', 'rollover_policies', 'operations', 'item_events', 'undo_effects']) {
    const where = table === 'rollover_policies' || version === 5 && table === 'planning_periods' ? " WHERE horizon NOT IN ('year','half')" : ''
    for (const row of db.prepare(`SELECT * FROM ${table}${where}`).all()) {
      legacy.prepare(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row))
    }
  }
  if (version === 5) legacy.exec("UPDATE workspace SET calendar=json_remove(calendar,'$.mode')")
  const source = exportDataset(store, now, version)
  assert(source.events.length > 3 && source.undoEffects.length > 0)
  assert(source.placements.some(row => row.holdPeriodId !== null))
  assert(source.operations.some(row => row.kind === 'createPlan' && row.result.itemIds?.length))
  const legacyJson = structuredClone(source)
  if (version === 5) Reflect.deleteProperty(legacyJson.workspace.calendar!, 'mode')
  writeFileSync(join(directory, `legacy-v${version}.json`), JSON.stringify(legacyJson))
  legacy.exec('PRAGMA wal_checkpoint(TRUNCATE)'); legacy.close()
  const bytes = readFileSync(path)
  await assert.rejects(() => openWorkspace(path, join(directory, 'refused-backups'), () => now), /version|版本|unsupported|支持/i)
  assert.deepEqual(readFileSync(path), bytes)
  const invalid = structuredClone(legacyJson); invalid.policies.pop()
  assert.throws(() => validateImport(invalid, now), 'Legacy imports still require all four original policies')
  const sources = [validateImport(legacyJson, now), await readSqliteDataset(path, now)]
  for (const [index, dataset] of sources.entries()) {
    const target = openDatabase(':memory:'); migrate(target)
    const destination = new Repository(target, { now: () => now })
    replaceDataset(destination.store, dataset, 'restore', now)
    const roundTrip = exportDataset(destination.store, now)
    assert.equal(roundTrip.schemaVersion, 8)
    assert.equal(roundTrip.workspace.calendar!.mode, 'rolling')
    assert.equal(roundTrip.workspace.calendar!.cycleAnchor, '2026-01-31')
    for (const field of fields) {
      if (field === 'policies') assert.deepEqual(roundTrip.policies.filter(policy => policy.horizon !== 'year' && policy.horizon !== 'half'), source.policies)
      else if (field === 'periods') for (const period of source.periods) assert.deepEqual(roundTrip.periods.find(row => row.id === period.id), period)
      else assert.deepEqual(roundTrip[field], source[field], `${index}/${field}`)
    }
    for (const horizon of ['year', 'half']) assert.equal(roundTrip.policies.find(policy => policy.horizon === horizon)!.mode, 'manual')
    assert.equal(roundTrip.policies.length, 6)
    assert.equal(roundTrip.workspace.pausedAfterRestore, true)
    const fresh = validateDataset(roundTrip, now)
    replaceDataset(destination.store, fresh, 'restore', now)
    for (const field of fields) assert.deepEqual(exportDataset(destination.store, now)[field], roundTrip[field])
    const undone = destination.execute({ type: 'undo', originalOperationId: milestone, generation: destination.store.workspace().generation, operationId: randomUUID() })
    assert.equal(undone.outcome, 'conflict_skipped', 'Restore must invalidate old-generation undo')
    validateImport(exportDataset(destination.store, now), now)
    checks.push(`${index === 0 ? 'JSON' : 'SQLite'} v${version} import preserves business rows and four policies, adds manual year/half defaults, round-trips v7, preserves historical milestone undo and rejects old-generation undo`)
    target.close()
  }
}
db.close()
writeFileSync(join(directory, 'legacy-report.json'), JSON.stringify({ checks, runtime: { node: process.versions.node, sqlite: process.versions.sqlite, electron: process.versions.electron } }, null, 2))
console.log(JSON.stringify({ checks }))
