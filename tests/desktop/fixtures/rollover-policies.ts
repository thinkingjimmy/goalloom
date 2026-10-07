/**
 * [INPUT]: Production Repository/SQLite, explicit rolling/natural clocks and a synthetic evidence directory.
 * [OUTPUT]: Six-policy defaults, boundary/eligibility/version/undo checks and JSON/SQLite round-trip evidence.
 * [POS]: Storage half of calendar desktop acceptance; the native journey checks editing and restart persistence.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'
import { reconcile } from '../../../src/main/workspace/reconcile'
import { exportDataset, readSqliteDataset, replaceDataset } from '../../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../../src/domain/import-validation'
import { currentPeriod, precedingPeriod } from '../../../src/domain/calendar'
import { policyHorizons } from '../../../src/shared/contracts/values'

const directory = process.argv[2]!, checks: unknown[] = []
const databaseDirectory = mkdtempSync(join(directory, 'rollover-data-'))
for (const [mode, anchor, observation] of [
  ['rolling', '2024-01-31', '2026-02-01'],
  ['rolling', '2024-02-29', '2027-03-01'],
  ['natural', '2024-01-01', '2026-02-01'],
] as const) {
  for (const horizon of ['year', 'half', 'cycle'] as const) {
    const path = join(databaseDirectory, `${mode}-${anchor}-${horizon}.sqlite`)
    const db = openDatabase(path); migrate(db)
    let now = `${anchor}T12:00:00Z`
    const repo = new Repository(db, { now: () => now })
    const run = (action: Record<string, unknown>) => repo.execute({ ...action, generation: repo.store.workspace().generation, operationId: randomUUID() })
    run({ type: 'confirmSetup', mode, timezone: 'UTC', weekStart: 1, anchor: mode === 'natural' ? { kind: 'today', expected: anchor } : { kind: 'date', date: anchor }, confirmed: true })
    assert.deepEqual(repo.store.policies().map(policy => [policy.horizon, policy.mode]).sort(), policyHorizons.map(value => [value, value === 'day' ? 'auto' : 'manual']).sort())
    now = `${observation}T12:00:00Z`
    const calendar = repo.store.workspace().calendar!, source = currentPeriod(calendar, horizon, now)
    const previous = precedingPeriod(calendar, source)!
    const create = (title: string, extra: Record<string, unknown> = {}) => run({ type: 'create', horizon, title, description: 'Keep this note', dueDate: observation, ...extra }).itemId!
    now = previous.startAt
    const old = create('Older backlog')
    now = `${observation}T12:00:00Z`
    const eligible = create('Current unfinished item')
    const future = create('Future item', { period: { kind: 'date', startDate: source.endDate } })
    const later = create('Unplanned item', { horizon: 'later' })
    const ignored = [
      ['done', create('Done item')], ['cancelled', create('Cancelled item')],
      ['archive', create('Archived item')], ['delete', create('Deleted item')],
    ] as const
    for (const [state, id] of ignored) {
      run(state === 'archive' ? { type: 'archive', itemId: id, expectedVersion: 1, archived: true }
        : state === 'delete' ? { type: 'delete', itemId: id, expectedVersion: 1 }
          : { type: 'status', itemId: id, expectedVersion: 1, status: state })
    }
    const child = create('Linked child', { horizon: 'day', parentId: eligible, expectedParentVersion: repo.store.item(eligible).version })
    const dayPolicy = repo.store.policies().find(policy => policy.horizon === 'day')!
    run({ type: 'policy', horizon: 'day', mode: 'manual', expectedVersion: dayPolicy.version })
    const before = repo.store.item(eligible), relations = repo.store.relations()
    assert.equal(reconcile(repo), null, 'Manual policies leave expired backlog in place')
    const enabled = run({ type: 'policy', horizon, mode: 'auto', expectedVersion: 1 })
    assert(enabled.changed)
    assert.equal(reconcile(repo), null, 'Enabling never sweeps older backlog')
    const unchanged = exportDataset(repo.store, now)
    assert.throws(() => run({ type: 'policy', horizon, mode: 'manual', expectedVersion: 1 }))
    assert.deepEqual(exportDataset(repo.store, now), unchanged, 'A stale save has no side effects')
    now = source.endAt
    const batch = reconcile(repo)!
    assert(batch?.changed)
    const target = currentPeriod(calendar, horizon, now)
    assert.equal(repo.store.item(eligible).placement.periodId, target.id)
    assert.equal(repo.store.operation(batch.operationId)!.effects.length, 1)
    assert.equal(repo.store.item(old).placement.periodId, previous.id)
    assert.equal(repo.store.item(future).placement.periodId, target.id)
    for (const [, id] of ignored) assert.equal(repo.store.item(id).placement.periodId, source.id)
    assert.equal(repo.store.item(later).placement.horizon, 'later')
    assert.equal(repo.store.item(child).placement.horizon, 'day')
    assert.deepEqual(repo.store.relations(), relations)
    for (const field of ['title', 'description', 'dueDate', 'status'] as const) assert.equal(repo.store.item(eligible)[field], before[field])
    assert.equal(reconcile(repo), null, 'Repeated reconciliation is idempotent')
    run({ type: 'undoBatch', originalOperationId: batch.operationId })
    assert.equal(repo.store.item(eligible).placement.periodId, source.id)
    assert.equal(repo.store.item(eligible).placement.holdPeriodId, target.id)
    assert.equal(reconcile(repo), null, 'Undo holds the item in its restored period')
    run({ type: 'policy', horizon, mode: 'manual', expectedVersion: 2 })
    now = target.endAt
    assert.equal(reconcile(repo), null, 'Turning automatic rollover off leaves expired items in place')
    run({ type: 'policy', horizon, mode: 'auto', expectedVersion: 3 })
    assert.equal(reconcile(repo), null, 'Re-enabling starts a new non-retroactive boundary')
    const data = exportDataset(repo.store, now)
    assert.equal(data.schemaVersion, 8)
    assert.equal(data.policies.length, 6)
    assert.deepEqual(validateImport(data, now), data)
    const missing = structuredClone(data); missing.policies.pop()
    assert.throws(() => validateImport(missing, now))
    const duplicate = structuredClone(data); duplicate.policies[0] = duplicate.policies[1]!
    assert.throws(() => validateImport(duplicate, now))
    const mismatch = structuredClone(data)
    mismatch.policies[0]!.effectiveFromPeriodId = data.policies.find(policy => policy.horizon !== mismatch.policies[0]!.horizon)!.effectiveFromPeriodId
    assert.throws(() => validateImport(mismatch, now))
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    const sqlite = await readSqliteDataset(path, now)
    assert.deepEqual(sqlite, data)
    replaceDataset(repo.store, validateImport(data, now), 'restore', now)
    assert.deepEqual(exportDataset(repo.store, now).policies, data.policies)
    assert.equal(repo.store.workspace().pausedAfterRestore, true)
    assert.equal(reconcile(repo), null)
    checks.push({ mode, anchor, horizon, path, from: source.startDate, boundary: source.endDate, nextBoundary: target.endDate, policies: data.policies, runtime: { electron: process.versions.electron, node: process.versions.node, sqlite: db.prepare('SELECT sqlite_version() AS version').get()!.version } })
    db.close()
  }
}
writeFileSync(join(directory, 'rollover-report.json'), JSON.stringify({ passed: true, checks }, null, 2))
