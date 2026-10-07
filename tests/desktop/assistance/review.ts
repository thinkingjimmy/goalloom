/**
 * [INPUT]: Production Repository, transfer and execution reads with synthetic data and an injected clock.
 * [OUTPUT]: Repeatable review regressions, source-preservation checks and counted large-batch validation work.
 * [POS]: Assistance E2E data boundary; no user data, live providers or production test controls.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 * Failure cases: partial composite undo passes import; clear is ignored at historical cutoff;
 * undone lifecycle events remain effective; midnight belongs to two dates; upgrade resets appearance;
 * guidance validation scans every effect for every event in a large rollover batch.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir, cpus, release } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { openDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'
import { reconcile } from '../../../src/main/workspace/reconcile'
import { exportDataset, replaceDataset, readSqliteDataset } from '../../../src/main/workspace/transfer/dataset'
import { validateImport, validateDataset } from '../../../src/domain/import-validation'
import { StartupUpgrade } from '../../../src/main/storage/upgrade'
import { currentPeriod } from '../../../src/domain/calendar'
import type { GuidanceValue } from '../../../src/shared/contracts/assistance'

const out = resolve('output/tests/assistance'), groups = process.argv.slice(2)
const report = { ok: true, cases: [] as { name: string; ok: boolean; error?: string }[], measurements: {} as Record<string, unknown>,
  scope: 'Production Repository, SQLite, import and startup upgrade with synthetic fixtures; no native UI or packaged acceptance',
  runtime: { electron: process.versions.electron, node: process.versions.node, sqlite: '' },
  host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model, physicalOrVm: 'unverified' } }
const guidance: GuidanceValue = { formatVersion: 1, kind: 'waiting_note', nextAction: 'Wait for the reviewed example', contextNote: null, scopeNote: null, authorship: 'user' }
async function fixture(work: (f: ReturnType<typeof setup>, directory: string) => Promise<void> | void, timezone = 'UTC') {
  const directory = await mkdtemp(join(tmpdir(), 'Goalloom assistance review ')), f = setup(join(directory, 'workspace.sqlite'), timezone)
  try { await work(f, directory) } finally { f.db.close(); await rm(directory, { recursive: true, force: true }) }
}
function setup(path: string, timezone = 'UTC') {
  const db = openDatabase(path); migrate(db)
  report.runtime.sqlite = String(db.prepare('SELECT sqlite_version() AS version').get()!.version)
  let now = timezone === 'UTC' ? '2026-10-01T12:00:00Z' : '2026-03-01T12:00:00Z'
  const repo = new Repository(db, { now: () => now }), generation = repo.store.workspace().generation
  const run = (command: object) => repo.execute({ ...command, generation, operationId: randomUUID() })
  run({ type: 'confirmSetup', mode: 'rolling', timezone, weekStart: 1, anchor: { kind: 'date', date: '2026-01-01' }, confirmed: true })
  const item = (id: string) => repo.store.item(id)
  const create = (horizon = 'day') => run({ type: 'create', title: 'Synthetic review task', horizon }).itemId!
  const apply = (id: string, value: GuidanceValue | null, extra = {}) => run({ type: 'applyAssistance', itemId: id, expectedVersion: item(id).version,
    expectedGuidanceRevision: repo.store.guidance(id)?.revision ?? 0, guidance: value ? { kind: 'set', value } : { kind: 'clear' }, ...extra })
  return { db, repo, generation, run, create, apply, item, time: (value: string) => { now = value }, now: () => now }
}
async function check(name: string, work: () => Promise<void>) {
  try { await work(); report.cases.push({ name, ok: true }); console.log(`✓ review: ${name}`) }
  catch (error) { report.ok = false; report.cases.push({ name, ok: false, error: error instanceof Error ? error.stack ?? error.message : String(error) }); console.log(`✗ review: ${name}`) }
}

if (groups.includes('undo') || groups.includes('recovery')) await check('composite adoption rejects an import that undoes only guidance', () => fixture(f => {
  const id = f.create('week')
  const adopted = f.apply(id, guidance, { move: { horizon: 'day', startDate: '2026-10-01', previewPeriodId: currentPeriod(f.repo.store.workspace().calendar!, 'day', f.now()).id, expectedPlacementVersion: f.item(id).placement.version, confirmedLater: false } })
  f.time('2026-10-01T13:00:00Z')
  const undone = f.run({ type: 'undo', originalOperationId: adopted.operationId })
  const data = exportDataset(f.repo.store, f.now())
  validateImport(data, f.now())
  const positionIndex = data.operations.find(op => op.id === adopted.operationId)!.effects.findIndex(effect => effect.kind === 'position')
  data.undoEffects = data.undoEffects.filter(marker => marker.originalId !== adopted.operationId || marker.effectIndex !== positionIndex)
  const undoEvents = data.events.filter(event => event.operationId === undone.operationId)
  const guidanceUndo = undoEvents.find(event => event.before?.periodId === event.after.periodId)!
  const moveEvent = data.events.find(event => event.operationId === adopted.operationId && event.type !== 'guidance_changed')!
  guidanceUndo.before = { ...moveEvent.after }
  guidanceUndo.after = { ...moveEvent.after, version: moveEvent.after.version + 1 }
  guidanceUndo.eventIndex = 0
  data.events = data.events.filter(event => event.operationId !== undone.operationId || event.id === guidanceUndo.id)
  const item = data.items.find(item => item.id === id)!, place = data.placements.find(place => place.itemId === id)!
  item.version = guidanceUndo.after.version
  Object.assign(place, { horizon: moveEvent.after.horizon, periodId: moveEvent.after.periodId, sortKey: moveEvent.after.sortKey, holdPeriodId: null })
  assert.throws(() => validateImport(data, f.now()), 'A composite operation cannot have a partial undo')
}))
if (groups.includes('undo') || groups.includes('recovery')) await check('composite adoption also requires its Later parent-unlink effect to be undone', () => fixture(f => {
  const root = f.create('month'), id = f.run({ type: 'create', title: 'Synthetic child', horizon: 'week', parentId: root, expectedParentVersion: f.item(root).version }).itemId!
  const adopted = f.apply(id, guidance, { move: { horizon: 'later', startDate: null, previewPeriodId: null, expectedPlacementVersion: f.item(id).placement.version, confirmedLater: true } })
  f.time('2026-10-01T13:00:00Z'); f.run({ type: 'undo', originalOperationId: adopted.operationId })
  const data = exportDataset(f.repo.store, f.now()), original = data.operations.find(op => op.id === adopted.operationId)!
  validateImport(data, f.now())
  const index = original.effects.findIndex(effect => effect.kind === 'relations'), effect = original.effects[index]!
  assert.equal(effect.kind, 'relations')
  if (effect.kind !== 'relations') throw Error('Missing synthetic relation effect')
  data.undoEffects = data.undoEffects.filter(marker => marker.originalId !== original.id || marker.effectIndex !== index)
  const delta = effect.edges[0]!
  data.relations[data.relations.findIndex(edge => edge.id === delta.after.id)] = { ...delta.after }
  assert.throws(() => validateImport(data, f.now()), 'The event-free relation effect belongs to the same composite undo')
}))

if (groups.includes('statistics')) {
  await check('historical pressure replays clear and undo instead of keeping an old confirmation', () => fixture(f => {
    const id = f.create()
    const summary = (cutoff?: string) => f.repo.execution.summary({ type: 'executionSummary', itemId: id, generation: f.generation, ...(cutoff ? { cutoff } : {}) }, f.now())
    for (const day of ['02', '03', '04']) {
      f.time(`2026-10-${day}T12:00:00Z`)
      f.run({ type: 'move', itemId: id, expectedVersion: f.item(id).version, expectedPlacementVersion: f.item(id).placement.version, horizon: 'day' })
    }
    f.apply(id, guidance)
    f.time('2026-10-04T13:00:00Z'); const cleared = f.apply(id, null)
    f.time('2026-10-04T14:00:00Z')
    const current = summary(), historical = summary(f.now())
    assert.equal(current.pressure.level.value, 'reconfirm')
    assert.deepEqual(historical.pressure.suppression, current.pressure.suppression)
    assert.equal(historical.pressure.level.value, current.pressure.level.value)
    f.run({ type: 'undo', originalOperationId: cleared.operationId })
    f.time('2026-10-04T15:00:00Z')
    assert.equal(summary().pressure.suppression.value?.reconfirmationSuppressed, true)
    assert.deepEqual(summary(f.now()).pressure.suppression, summary().pressure.suppression)
    assert.equal(summary('2026-10-04T14:00:00Z').pressure.level.value, 'reconfirm', 'Later undo must not alter the earlier cutoff')
  }))
  await check('undone status, archive, deletion and creation events are ineffective only after their undo', () => fixture(f => {
    const id = f.create()
    const commands = [
      { type: 'status', status: 'done' }, { type: 'status', status: 'cancelled' },
      { type: 'archive', archived: true }, { type: 'delete' },
    ]
    for (const [index, command] of commands.entries()) {
      f.time(`2026-10-01T${String(13 + index).padStart(2, '0')}:00:00Z`)
      const changed = f.run({ ...command, itemId: id, expectedVersion: f.item(id).version })
      const at = f.now()
      f.time(`2026-10-01T${String(13 + index).padStart(2, '0')}:01:00Z`)
      f.run({ type: 'undo', originalOperationId: changed.operationId })
      const activity = f.repo.execution.page({ type: 'activityPage', generation: f.generation, itemId: id, limit: 100 }, f.now())
      assert.equal(activity.entries.find(entry => entry.event.operationId === changed.operationId)!.evidence.effective, false)
      const historical = f.repo.execution.summary({ type: 'executionSummary', generation: f.generation, itemId: id, cutoff: at.replace('00:00Z', '00:30Z') }, f.now())
      assert.equal(historical.evidence.find(entry => entry.operationId === changed.operationId)!.effective, true)
    }
    const created = f.repo.store.operation(f.repo.store.events(id)[0]!.operationId)!
    f.time('2026-10-01T18:00:00Z'); f.run({ type: 'undo', originalOperationId: created.id })
    const activity = f.repo.execution.page({ type: 'activityPage', generation: f.generation, itemId: id, limit: 100 }, f.now())
    assert.equal(activity.entries.find(entry => entry.event.operationId === created.id)!.evidence.effective, false)
  }))
  await check('day and month activity use exclusive local end boundaries and stable pagination', () => fixture(f => {
    f.time('2026-10-31T23:59:59.999999Z'); const id = f.create()
    f.time('2026-11-01T00:00:00Z'); f.apply(id, guidance)
    f.time('2026-11-01T01:00:00Z')
    const day = (date: string) => f.repo.execution.page({ type: 'activityDay', generation: f.generation, itemId: id, date, limit: 1 }, f.now())
    const month = (month: string) => f.repo.execution.month({ type: 'activityMonth', generation: f.generation, itemId: id, month }, f.now())
    assert.deepEqual(day('2026-10-31').entries.map(entry => entry.event.type), ['created'])
    assert.equal(day('2026-10-31').cursor, null)
    assert.deepEqual(day('2026-11-01').entries.map(entry => entry.event.type), ['guidance_changed'])
    assert.deepEqual(month('2026-10-01').dates.map(date => date.date), ['2026-10-31'])
    assert.deepEqual(month('2026-11-01').dates.map(date => date.date), ['2026-11-01'])
    const all = f.repo.execution.page({ type: 'activityPage', generation: f.generation, itemId: id, limit: 1 }, f.now())
    assert(all.cursor)
    const next = f.repo.execution.page({ type: 'activityPage', generation: f.generation, itemId: id, limit: 1, cursor: all.cursor }, f.now())
    assert.equal(next.entries[0]!.event.type, 'created'); assert.equal(next.cursor, null)
  }))
  for (const boundary of [
    { date: '2026-03-08', instants: ['2026-03-08T04:59:59.999999Z', '2026-03-08T05:00:00Z', '2026-03-09T03:59:59.999999Z', '2026-03-09T04:00:00Z'], now: '2026-03-09T05:00:00Z', hours: 23 },
    { date: '2026-11-01', instants: ['2026-11-01T03:59:59.999999Z', '2026-11-01T04:00:00Z', '2026-11-02T04:59:59.999999Z', '2026-11-02T05:00:00Z'], now: '2026-11-02T06:00:00Z', hours: 25 },
  ]) await check(`local activity pagination respects a ${boundary.hours}-hour DST date`, () => fixture(f => {
    f.time(boundary.instants[0]!); const id = f.create()
    for (let index = 1; index < boundary.instants.length; index++) { f.time(boundary.instants[index]!); f.apply(id, { ...guidance, nextAction: `Synthetic progress ${index}` }) }
    f.time(boundary.now)
    const first = f.repo.execution.page({ type: 'activityDay', generation: f.generation, itemId: id, date: boundary.date, limit: 1 }, f.now())
    assert.equal(first.entries[0]!.event.at, boundary.instants[2]); assert(first.cursor)
    const next = f.repo.execution.page({ type: 'activityDay', generation: f.generation, itemId: id, date: boundary.date, limit: 1, cursor: first.cursor }, f.now())
    assert.equal(next.entries[0]!.event.at, boundary.instants[1]); assert.equal(next.cursor, null)
    const month = f.repo.execution.month({ type: 'activityMonth', generation: f.generation, itemId: id, month: `${boundary.date.slice(0, 7)}-01` }, f.now())
    assert.equal(month.dates.find(row => row.date === boundary.date)!.total, 2)
  }, 'America/New_York'))
}

if (groups.includes('recovery')) {
  await check('startup v7 upgrade retains theme, surface and completion style', () => fixture(async (f, directory) => {
    f.create('week'); f.run({ type: 'preferences', theme: 'dark', style: 'minimal', checkStyle: 'tint' })
    const original = f.repo.store.workspace()
    f.db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE; DROP TABLE item_guidance; PRAGMA user_version=7')
    const path = join(directory, 'legacy.sqlite'); await writeFile(path, await readFile(join(directory, 'workspace.sqlite')))
    const upgrade = new StartupUpgrade(path, join(directory, 'backups'), f.now), preview = await upgrade.prepare()
    await upgrade.commit(preview.token)
    const data = await readSqliteDataset(path, f.now(), 'backup')
    for (const field of ['theme', 'style', 'checkStyle'] as const) assert.equal(data.workspace[field], original[field])
    const target = setup(join(directory, 'restore.sqlite'))
    try {
      target.run({ type: 'preferences', theme: 'light', style: 'paper', checkStyle: 'outline' })
      replaceDataset(target.repo.store, data, 'restore', f.now())
      assert.equal(target.repo.store.workspace().theme, 'light', 'Normal restore keeps the target appearance')
      assert.equal(target.repo.store.workspace().style, 'paper'); assert.equal(target.repo.store.workspace().checkStyle, 'outline')
    } finally { target.db.close() }
  }))
  await check('large rollover import reads each effect a bounded number of times', () => fixture(f => {
    const id = f.create(); f.time('2026-10-02T12:00:00Z'); const result = reconcile(f.repo)!
    const source = exportDataset(f.repo.store, f.now()), created = source.operations.find(op => op.kind === 'create')!
    const createEvent = source.events.find(event => event.type === 'created')!, rollEvent = source.events.find(event => event.operationId === result.operationId)!
    const rollover = source.operations.find(op => op.id === result.operationId)!
    const size = Number(process.env.GOALLOOM_REVIEW_BATCH_SIZE ?? 50_000)
    const data = { ...source, items: [], placements: [], events: [], operations: source.operations.filter(op => op.id !== created.id && op.id !== rollover.id), guidance: [], undoEffects: [] } as typeof source
    const effects = [] as typeof rollover.effects
    for (let index = 0; index < size; index++) {
      const itemId = `${id}-${index}`, operationId = `${created.id}-${index}`
      data.items.push({ ...source.items[0]!, id: itemId })
      data.placements.push({ ...source.placements[0]!, itemId, sortKey: index * 1024 })
      data.operations.push({ ...created, id: operationId, result: { ...created.result, operationId, itemId }, effects: [{ ...created.effects[0]!, itemId }] })
      data.events.push({ ...createEvent, id: `${createEvent.id}-${index}`, itemId, operationId, seq: index + 1 })
      data.events.push({ ...rollEvent, id: `${rollEvent.id}-${index}`, itemId, eventIndex: index, seq: size + index + 1 })
      effects.push({ ...rollover.effects[0]!, itemId })
    }
    let reads = 0
    const counted = new Proxy(effects, { get(target, key, receiver) { if (typeof key === 'string' && /^\d+$/.test(key)) reads++; return Reflect.get(target, key, receiver) } })
    data.operations.push({ ...rollover, effects: counted })
    const start = performance.now(); validateDataset(data, f.now()); const elapsedMs = performance.now() - start
    report.measurements.rollover = { items: size, events: data.events.length, effects: effects.length, effectReads: reads, readsPerEffect: reads / size, elapsedMs }
    assert(reads <= size * 12, `Expected linear validation work; ${reads} effect reads for ${size} effects`)
  }))
}
await mkdir(out, { recursive: true })
await writeFile(join(out, 'review-report.json'), JSON.stringify(report, null, 2))
if (!report.ok) process.exitCode = 1
