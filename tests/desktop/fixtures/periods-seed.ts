/**
 * [INPUT]: Isolated profile and evidence paths; production Repository/SQLite with an injected clock.
 * [OUTPUT]: Repeatable planning boundary evidence and a real database for the desktop journey.
 * [POS]: Test-only fixture; failure scenarios are specified in docs/features/period-planning.md before implementation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cpus, release } from 'node:os'
import { Temporal } from '../../../src/domain/temporal'
import { currentPeriod, type Horizon } from '../../../src/domain/calendar'
import { openDatabase, verifyDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'
import { readBoardPeriods } from '../../../src/main/workspace/periods'
import { readHistoryIndex } from '../../../src/main/workspace/history'
import { reconcile } from '../../../src/main/workspace/reconcile'
import { exportDataset, replaceDataset } from '../../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../../src/domain/import-validation'

const checks: string[] = [], boundaries: unknown[] = []
function workspace(now: string, timezone = 'UTC', weekStart = 1, cycleAnchor = '2026-01-31', path = ':memory:') {
  const db = openDatabase(path); migrate(db)
  const time = { now }, repo = new Repository(db, { now: () => time.now })
  const generation = repo.store.workspace().generation
  const run = (action: Record<string, unknown>) => repo.execute({ generation, operationId: randomUUID(), ...action })
  run({ type: 'confirmSetup', timezone, weekStart, cycleAnchor, confirmed: true })
  const create = (horizon: string, title = 'Boundary task', extra = {}) => run({ type: 'create', horizon, title, ...extra }).itemId!
  const advance = (id: string, extra = {}) => {
    const item = repo.store.item(id)
    return run({ type: 'move', itemId: id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: item.placement.horizon, period: { kind: 'next' }, ...extra })
  }
  return { db, time, repo, generation, run, create, advance }
}

const cases: { horizon: Horizon; now: string; timezone?: string; weekStart?: number; anchor?: string; start: string; end: string; hours?: number }[] = [
  { horizon: 'day', now: '2026-12-31T12:00:00Z', start: '2027-01-01', end: '2027-01-02' },
  { horizon: 'week', now: '2026-12-31T12:00:00Z', weekStart: 7, start: '2027-01-03', end: '2027-01-10' },
  { horizon: 'month', now: '2026-01-31T12:00:00Z', start: '2026-02-01', end: '2026-03-01' },
  { horizon: 'day', now: '2028-02-28T12:00:00Z', start: '2028-02-29', end: '2028-03-01' },
  { horizon: 'day', now: '2026-03-07T12:00:00Z', timezone: 'America/New_York', start: '2026-03-08', end: '2026-03-09', hours: 23 },
  { horizon: 'day', now: '2026-10-31T12:00:00Z', timezone: 'America/New_York', start: '2026-11-01', end: '2026-11-02', hours: 25 },
  { horizon: 'cycle', now: '2026-04-29T12:00:00Z', start: '2026-04-30', end: '2026-07-31' },
  { horizon: 'cycle', now: '2026-07-30T12:00:00Z', start: '2026-07-31', end: '2026-10-31' },
  { horizon: 'day', now: '2026-12-31T15:59:59Z', timezone: 'Asia/Shanghai', start: '2027-01-01', end: '2027-01-02' },
]
for (const scenario of cases) {
  const w = workspace(scenario.now, scenario.timezone, scenario.weekStart)
  const id = w.create(scenario.horizon), source = w.repo.detail(id)
  const target = currentPeriod(w.repo.store.workspace().calendar!, scenario.horizon, source.period!.endAt)
  const beforeRead = w.repo.store.periods().length
  assert.equal(readBoardPeriods(w.repo.store, { type: 'boardPeriods', generation: w.generation, periods: [{ horizon: scenario.horizon, startDate: target.startDate }] }, w.time.now).items.length, 0)
  assert.equal(w.repo.store.periods().length, beforeRead, 'Reading a future period must not materialize it')
  w.advance(id)
  const period = w.repo.detail(id).period!
  assert.equal(period.startDate, scenario.start); assert.equal(period.endDate, scenario.end)
  if (scenario.hours) assert.equal((Date.parse(period.endAt) - Date.parse(period.startAt)) / 3600000, scenario.hours)
  assert.equal(w.repo.snapshot().items.some(item => item.id === id), false)
  boundaries.push({ ...scenario, period }); verifyDatabase(w.db); w.db.close()
}
checks.push('Day/week/month/year/leap-day boundaries, Sunday week start, 23/25-hour DST days and non-drifting month-end cycles; future reads make no writes')

{
  const w = workspace('2026-09-27T23:59:59Z'), id = w.create('day')
  const original = w.repo.store.item(id)
  const operationId = randomUUID(), result = w.advance(id, { operationId })
  assert.deepEqual(w.run({ type: 'move', itemId: id, expectedVersion: original.version, expectedPlacementVersion: original.placement.version, horizon: 'day', period: { kind: 'next' }, operationId }), result)
  assert.equal(w.repo.detail(id).period!.startDate, '2026-09-28')
  const moved = w.repo.store.item(id)
  w.run({ type: 'edit', itemId: id, expectedVersion: moved.version, title: 'Edited after postponing', description: 'Keep this edit', dueDate: '2026-10-01' })
  w.time.now = '2026-09-28T12:00:00Z'
  w.run({ type: 'undo', originalOperationId: result.operationId })
  const undone = w.repo.store.item(id)
  assert.equal(undone.title, 'Edited after postponing'); assert.equal(undone.description, 'Keep this edit'); assert.equal(undone.dueDate, '2026-10-01')
  assert.equal(undone.placement.periodId, original.placement.periodId)
  assert.equal(undone.placement.holdPeriodId, currentPeriod(w.repo.store.workspace().calendar!, 'day', w.time.now).id)
  assert.equal(reconcile(w.repo), null)
  const future = w.create('day', 'Future auto-isolation', { period: { kind: 'date', startDate: '2026-10-10' } })
  assert.equal(reconcile(w.repo), null); assert.equal(w.repo.detail(future).period!.startDate, '2026-10-10')
  const expired = w.create('week', 'Boundary menu')
  w.time.now = '2026-10-05T00:00:00Z'
  w.advance(expired)
  assert.equal(w.repo.detail(expired).period!.startDate, '2026-10-05', 'An open menu advances the original period, without skipping at midnight')
  const dataset = validateImport(exportDataset(w.repo.store, w.time.now), w.time.now)
  const restored = workspace(w.time.now)
  replaceDataset(restored.repo.store, dataset, 'restore', w.time.now)
  assert.equal(restored.repo.detail(future).period!.startDate, '2026-10-10')
  assert.throws(() => readBoardPeriods(restored.repo.store, { type: 'boardPeriods', generation: w.generation, periods: [{ horizon: 'day', startDate: '2026-10-10' }] }, w.time.now))
  restored.db.close(); verifyDatabase(w.db); w.db.close()
}
checks.push('Idempotent receipts, unchanged later edits, expired undo hold, future auto-rollover isolation, boundary-time next, validated export/restore and generation isolation')

{
  const w = workspace('2026-09-20T12:00:00Z')
  const id = w.create('month'), later = w.create('later')
  const rejected = (action: () => unknown) => {
    const before = JSON.stringify(exportDataset(w.repo.store, w.time.now))
    assert.throws(action)
    assert.equal(JSON.stringify(exportDataset(w.repo.store, w.time.now)), before, 'Rejected commands leave no business, period, history or receipt changes')
  }
  rejected(() => w.run({ type: 'create', title: 'Invalid later', horizon: 'later', period: { kind: 'date', startDate: '2026-10-01' } }))
  rejected(() => w.run({ type: 'create', title: 'Invalid month', horizon: 'month', period: { kind: 'date', startDate: '2026-10-02' } }))
  rejected(() => w.run({ type: 'create', title: 'Expired input', horizon: 'day', period: { kind: 'date', startDate: '2026-09-19' } }))
  rejected(() => w.advance(later)); rejected(() => w.advance(id, { horizon: 'week' }))
  rejected(() => w.advance(id, { expectedVersion: 999 })); rejected(() => w.advance(id, { expectedPlacementVersion: 999 }))
  rejected(() => w.advance(id, { generation: 'old-workspace' })); rejected(() => w.advance(id, { beforeId: later }))
  for (const state of ['done', 'archived', 'deleted']) {
    const target = w.create('day', state)
    w.run({ itemId: target, expectedVersion: 1, ...(state === 'done' ? { type: 'status', status: 'done' } : state === 'archived' ? { type: 'archive', archived: true } : { type: 'delete' }) })
    rejected(() => w.advance(target))
  }
  rejected(() => readBoardPeriods(w.repo.store, { type: 'boardPeriods', generation: w.generation, periods: [{ horizon: 'month', startDate: '2026-10-01' }, { horizon: 'month', startDate: '2026-11-01' }] }, w.time.now))
  w.time.now = '2026-10-01T12:00:00Z'
  for (let month = 0; month < 30; month++) {
    const startDate = Temporal.PlainDate.from('2026-11-01').add({ months: month }).toString()
    w.create('month', `Future ${month}`, { period: { kind: 'date', startDate } })
  }
  const index = readHistoryIndex(w.repo.store, { type: 'historyIndex', horizon: 'month' }, w.time.now)
  assert(index.periods.some(entry => entry.period.startDate === '2026-09-01'))
  verifyDatabase(w.db); w.db.close()
}
checks.push('Invalid period/next/lifecycle/version/generation/order rejection is atomic; 30 future periods cannot displace the historical index')

const today = Temporal.Now.zonedDateTimeISO('Asia/Shanghai')
const past = today.subtract({ months: 2 }), anchor = `${today.year - 1}-01-31`
const w = workspace(past.toInstant().toString(), 'Asia/Shanghai', 1, anchor, join(process.argv[2]!, 'workspace.sqlite'))
const old = w.create('month', 'Historical planning fixture')
w.time.now = today.toInstant().toString()
const ids: Record<string, string> = { old }
ids.cycle = w.create('cycle', 'Cycle task', { flowColor: 0 })
ids.month = w.create('month', 'Month task', { parentId: ids.cycle, expectedParentVersion: w.repo.store.item(ids.cycle).version })
ids.week = w.create('week', 'Week task', { parentId: ids.month, expectedParentVersion: w.repo.store.item(ids.month).version, description: 'Keep this description', dueDate: today.add({ days: 4 }).toPlainDate().toString() })
ids.day = w.create('day', 'Day task', { parentId: ids.week, expectedParentVersion: w.repo.store.item(ids.week).version })
ids.sibling = w.create('week', 'Week sibling')
ids.later = w.create('later', 'Later task')
ids.done = w.create('week', 'Completed task')
w.run({ type: 'status', itemId: ids.done, expectedVersion: 1, status: 'done' })
ids.link = w.create('day', '[Planning link](https://example.invalid/task)')
const snapshot = w.repo.snapshot()
const next = snapshot.periods.map(period => currentPeriod(snapshot.workspace.calendar!, period.horizon, period.endAt))
const report = { checks, boundaries, runtime: { electron: process.versions.electron, node: process.versions.node, sqlite: w.db.prepare('SELECT sqlite_version() AS version').get()!.version, platform: process.platform, arch: process.arch, osRelease: release(), cpu: cpus()[0]!.model } }
writeFileSync(process.argv[3]!, JSON.stringify(report, null, 2))
writeFileSync(join(process.argv[2]!, 'fixture.json'), JSON.stringify({ ids, current: snapshot.periods, next, relations: snapshot.relations, report }))
verifyDatabase(w.db); w.db.close()
