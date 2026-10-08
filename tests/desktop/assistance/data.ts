/**
 * [INPUT]: Isolated synthetic databases, real Repository commands and an injected fixture clock.
 * [OUTPUT]: Repeatable apply/undo/recovery/statistics evidence under Electron's SQLite runtime.
 * [POS]: E2E data boundary; production has no test clock, arbitrary SQL API or provider bypass.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 * Failure cases: partial adoption/undo, ABA, duplicate receipts, lifecycle bypass, bad imports,
 * note rewrite guards, stale note undo, description-effect import forgery, unsafe upgrades, incorrect carryovers, undo erasing actual intervals, unfrozen history and unbounded reads.
 */
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir, cpus, release } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { openDatabase } from '../../../src/main/storage/database'
import { migrate, schemaVersion } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'
import { reconcile } from '../../../src/main/workspace/reconcile'
import { exportDataset, replaceDataset, readSqliteDataset } from '../../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../../src/domain/import-validation'
import { StartupUpgrade } from '../../../src/main/storage/upgrade'
import { probeSource } from '../../../src/main/storage/startup'
import { readAssistanceContext } from '../../../src/main/workspace/assistance-context'
import { currentPeriod } from '../../../src/domain/calendar'
import { assistanceOutputSchema } from '../../../src/shared/contracts/assistance'
import { snapshotSchema } from '../../../src/shared/contracts/queries'
import { executionFactsSchema } from '../../../src/shared/contracts/execution'
import type { GuidanceValue } from '../../../src/shared/contracts/assistance'
import type { ItemHorizon } from '../../../src/shared/contracts/entities'

const out = resolve('output/tests/assistance')
const groups = process.argv.slice(2)
const guidance = (text: string, kind: GuidanceValue['kind'] = 'next_step'): GuidanceValue => ({ formatVersion: 1, kind, nextAction: text, contextNote: null, scopeNote: null, authorship: 'user' })
async function fixture(work: (f: ReturnType<typeof createFixture>, directory: string) => Promise<void> | void) {
  const directory = await mkdtemp(join(tmpdir(), 'Goalloom assistance boundary ')), f = createFixture(join(directory, 'workspace.sqlite'))
  try { await work(f, directory) } finally { f.db.close(); await rm(directory, { recursive: true, force: true }) }
}
function createFixture(path: string) {
  const db = openDatabase(path); migrate(db)
  let now = '2026-09-01T12:00:00Z'
  const repo = new Repository(db, { now: () => now }), generation = repo.store.workspace().generation
  const run = (action: object) => repo.execute({ ...action, generation, operationId: randomUUID() })
  run({ type: 'confirmSetup', mode: 'rolling', timezone: 'UTC', weekStart: 1, anchor: { kind: 'date', date: '2026-01-01' }, confirmed: true })
  now = '2026-10-01T12:00:00Z'
  const item = (id: string) => repo.store.item(id)
  const create = (horizon: ItemHorizon = 'day', options: object = {}) => run({ type: 'create', title: 'Synthetic task', horizon, ...options }).itemId!
  const apply = (id: string, value: GuidanceValue | null, extra: object = {}) => run({ type: 'applyAssistance', itemId: id, expectedVersion: item(id).version,
    expectedGuidanceRevision: repo.store.guidance(id)?.revision ?? 0, guidance: value ? { kind: 'set', value } : { kind: 'clear' }, ...extra })
  const move = (id: string, horizon: ItemHorizon, date?: string) => run({ type: 'move', itemId: id, expectedVersion: item(id).version, expectedPlacementVersion: item(id).placement.version, horizon, ...(date ? { period: { kind: 'date', startDate: date } } : {}) })
  const status = (id: string, value: 'todo' | 'done' | 'cancelled') => run({ type: 'status', itemId: id, expectedVersion: item(id).version, status: value })
  const summary = (id: string, cutoff?: string) => executionFactsSchema.parse(repo.execution.summary({ type: 'executionSummary', itemId: id, generation, ...(cutoff ? { cutoff } : {}) }, now))
  return { db, repo, run, item, create, apply, move, status, summary, generation, now: () => now, time: (at: string) => { now = at } }
}
const report: Record<string, unknown> = { scope: 'Source Electron Node runtime, real production SQLite/Repository, synthetic fixtures; no native UI, live model, packaged or Windows acceptance', host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model, physicalOrVm: 'unverified' }, groups: {} }
const checks: Record<string, string[]> = {}
function checked(group: string, label: string) { (checks[group] ??= []).push(label); console.log(`✓ ${group}: ${label}`) }

async function applyCases() {
  await fixture(async (f, directory) => {
    const before = '- [x] Complete the outline\n- [ ] Verify the example', after = `${before}\n- [ ] Run one path`
    const id = f.create('week', { description: before })
    const rewrite = () => {
      const context = readAssistanceContext(f.repo.store, f.repo.execution, { type: 'assistanceContext', itemId: id, generation: f.generation }, f.now())
      return { type: 'applyAssistance', itemId: id, expectedVersion: f.item(id).version, expectedGuidanceRevision: 0, guidance: { kind: 'keep' }, description: after, contextId: randomUUID(), guard: context.guard }
    }
    const stale = rewrite()
    f.run({ type: 'edit', itemId: id, expectedVersion: f.item(id).version, title: 'Edited title', description: before, dueDate: null })
    assert.throws(() => f.run({ ...stale, expectedVersion: f.item(id).version }))
    const command = { ...rewrite(), generation: f.generation, operationId: randomUUID() }, applied = f.repo.execute(command)
    assert(applied.undoable)
    assert.deepEqual(f.repo.execute(command), applied)
    assert.equal(f.item(id).description, after)
    assert.equal(f.repo.detail(id).assistedNotes, true)
    const exported = exportDataset(f.repo.store, f.now())
    validateImport(JSON.parse(JSON.stringify(exported)), f.now())
    const { consistentBackup } = await import('../../../src/main/storage/backup/snapshot')
    const backup = await consistentBackup(f.db, join(directory, 'rewrite-backup'))
    const restored = await readSqliteDataset(backup, f.now(), 'backup')
    assert.equal(restored.items.find(row => row.id === id)?.description, after)
    for (const mutate of [
      (data: typeof exported) => { data.operations.find(row => row.id === applied.operationId)!.kind = 'edit' },
      (data: typeof exported) => { data.operations.find(row => row.id === applied.operationId)!.effectsVersion = 1 },
      (data: typeof exported) => { data.events = data.events.filter(row => row.operationId !== applied.operationId) },
    ]) { const data = structuredClone(exported); mutate(data); assert.throws(() => validateImport(data, f.now())) }
    f.run({ type: 'edit', itemId: id, expectedVersion: f.item(id).version, title: 'Later title', description: after, dueDate: '2026-11-01' })
    f.run({ type: 'undo', originalOperationId: applied.operationId })
    assert.equal(f.item(id).description, before)
    assert.equal(f.item(id).title, 'Later title')
    assert.equal(f.item(id).dueDate, '2026-11-01')
    assert.equal(f.repo.detail(id).assistedNotes, false)
    validateImport(exportDataset(f.repo.store, f.now()), f.now())
    const second = f.run(rewrite())
    f.run({ type: 'edit', itemId: id, expectedVersion: f.item(id).version, title: 'Later title', description: 'User changed notes', dueDate: '2026-11-01' })
    const conflict = f.run({ type: 'undo', originalOperationId: second.operationId })
    assert.equal(conflict.outcome, 'conflict_skipped')
    assert.equal(f.item(id).description, 'User changed notes')
    validateImport(exportDataset(f.repo.store, f.now()), f.now())
    checked('apply', 'note rewrites reject stale context, round-trip JSON/SQLite, reject forged effects, and undo only their own unchanged notes')
  })

  await fixture(f => {
    const id = f.create('week'), original = f.item(id), operationId = randomUUID()
    const command = { type: 'applyAssistance', operationId, generation: f.generation, itemId: id, expectedVersion: original.version, expectedGuidanceRevision: 0, guidance: { kind: 'set', value: guidance('Write one example') } }
    const result = f.repo.execute(command), revision = f.repo.store.workspace().revision
    assert.deepEqual(f.repo.execute(command), result)
    assert.equal(f.repo.store.workspace().revision, revision)
    assert.throws(() => f.repo.execute({ ...command, guidance: { kind: 'set', value: guidance('Different payload') } }))
    assert.equal(f.repo.store.operation(operationId)?.effectsVersion, 2)
    const after = f.item(id)
    for (const field of ['title', 'description', 'dueDate', 'status', 'flowColor'] as const) assert.equal(after[field], original[field])
    assert.equal(f.repo.snapshot().items.find(item => item.id === id)?.guidance?.nextAction, 'Write one example')
    assert.throws(() => f.run({ type: 'discardEmpty', itemId: id, expectedVersion: after.version }))
    checked('apply', 'guidance-only ownership, bounded board signal, empty-title guard and idempotent v2 receipt')
    const before = exportDataset(f.repo.store, f.now())
    assert.throws(() => f.apply(id, guidance('Must roll back'), { move: { horizon: 'day', startDate: '2026-10-01', previewPeriodId: currentPeriod(f.repo.store.workspace().calendar!, 'day', f.now()).id, expectedPlacementVersion: 999, confirmedLater: false } }))
    assert.deepEqual(exportDataset(f.repo.store, f.now()), before)
    f.db.exec("CREATE TEMP TRIGGER fail_assistance_placement BEFORE UPDATE ON item_placements BEGIN SELECT RAISE(ABORT,'Synthetic placement failure'); END")
    assert.throws(() => f.apply(id, guidance('Actual second-step rollback'), { move: { horizon: 'day', startDate: '2026-10-01', previewPeriodId: currentPeriod(f.repo.store.workspace().calendar!, 'day', f.now()).id, expectedPlacementVersion: f.item(id).placement.version, confirmedLater: false } }))
    f.db.exec('DROP TRIGGER fail_assistance_placement')
    assert.deepEqual(exportDataset(f.repo.store, f.now()), before)
    checked('apply', 'the second step failing rolls back guidance, item, periods, events and receipt')
    const context = readAssistanceContext(f.repo.store, f.repo.execution, { type: 'assistanceContext', generation: f.generation, itemId: id }, f.now())
    f.create('later')
    f.apply(id, guidance('Unrelated task is harmless'), { guard: context.guard })
    const fresh = readAssistanceContext(f.repo.store, f.repo.execution, { type: 'assistanceContext', generation: f.generation, itemId: id }, f.now())
    f.time('2026-10-02T00:01:00Z')
    assert.throws(() => f.apply(id, guidance('Expired date'), { guard: fresh.guard }))
    f.status(id, 'done')
    assert.throws(() => f.apply(id, guidance('Cannot bypass done')))
    assert.equal(f.repo.store.guidance(id)?.value?.nextAction, 'Unrelated task is harmless')
    checked('apply', 'dependency guards ignore unrelated writes, reject changed dates and protect inactive tasks')
    for (const invalid of [ { kind: 'create_habit' }, { kind: 'proposal', explanation: 'Delete another task', guidance: null, moveSuggestion: null, command: 'delete' }, { kind: 'clarify', question: 'x'.repeat(201) } ]) assert.equal(assistanceOutputSchema.safeParse(invalid).success, false)
    const emoji = f.create('later')
    f.apply(emoji, guidance('🙂'.repeat(120)))
    const bounded = snapshotSchema.parse(f.repo.snapshot()).items.find(item => item.id === emoji)!.guidance!
    assert(bounded.nextAction.length <= 120 && !/[\uD800-\uDBFF]$/.test(bounded.nextAction))
    checked('apply', 'emoji guidance summaries obey UTF-16 bounds without splitting a surrogate pair')
    checked('apply', 'unsupported actions, extra commands and oversized clarification are rejected')
  })
}

async function undoCases() {
  await fixture(f => {
    const root = f.create('month', { flowColor: 0 }), id = f.create('week', { parentId: root, expectedParentVersion: f.item(root).version })
    const adopted = f.apply(id, guidance('Wait for a reviewed example', 'waiting_note'), { move: { horizon: 'later', startDate: null, previewPeriodId: null, expectedPlacementVersion: f.item(id).placement.version, confirmedLater: true } })
    assert.equal(f.item(id).placement.horizon, 'later')
    assert.equal(f.repo.relationViews(id).length, 0)
    f.run({ type: 'edit', itemId: id, expectedVersion: f.item(id).version, title: 'Later user title', description: 'Later user description', dueDate: '2026-10-15' })
    assert.equal(f.run({ type: 'undo', originalOperationId: adopted.operationId }).changed, true)
    assert.equal(f.item(id).placement.horizon, 'week')
    assert.equal(f.repo.relationViews(id).length, 1)
    assert.equal(f.item(id).title, 'Later user title')
    assert.equal(f.item(id).dueDate, '2026-10-15')
    assert.equal(f.repo.store.guidance(id)?.value, null)
    assert.equal(f.repo.store.guidance(id)?.revision, 2)
    validateImport(exportDataset(f.repo.store, f.now()), f.now())
    checked('undo', 'compound guidance/Later/parent unlink reverses atomically, preserves unrelated text/deadline and round-trips history')
    const a = f.apply(id, guidance('A')), b = f.apply(id, guidance('B'))
    assert.equal(f.run({ type: 'undo', originalOperationId: b.operationId }).changed, true)
    f.status(id, 'done')
    assert.equal(f.run({ type: 'undo', originalOperationId: a.operationId }).changed, true)
    assert.equal(f.item(id).status, 'done')
    checked('undo', 'sequential owned undo keeps increasing revisions and supports guidance undo after completion')
    f.status(id, 'todo')
    const one = f.apply(id, guidance('Same text'))
    f.apply(id, guidance('Different text')); f.apply(id, guidance('Same text'))
    const snapshot = exportDataset(f.repo.store, f.now())
    const conflict = f.run({ type: 'undo', originalOperationId: one.operationId })
    assert.equal(conflict.outcome, 'conflict_skipped')
    assert.deepEqual(exportDataset(f.repo.store, f.now()).items, snapshot.items)
    assert.deepEqual(exportDataset(f.repo.store, f.now()).guidance, snapshot.guidance)
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM undo_effects WHERE originalId=?').get(one.operationId)!.n, 0)
    checked('undo', 'ABA guidance changes conflict without business writes or original undo markers')
    const moving = f.apply(id, guidance('Composite owned guidance'), { move: { horizon: 'day', startDate: '2026-10-01', previewPeriodId: currentPeriod(f.repo.store.workspace().calendar!, 'day', f.now()).id, expectedPlacementVersion: f.item(id).placement.version, confirmedLater: false } })
    f.apply(id, guidance('Newer guidance'))
    const priorPlace = structuredClone(f.item(id).placement)
    assert.equal(f.run({ type: 'undo', originalOperationId: moving.operationId }).outcome, 'conflict_skipped')
    assert.deepEqual({ ...f.item(id).placement }, priorPlace)
    checked('undo', 'a guidance conflict rolls back the already-reversed position in compound undo')
    f.run({ type: 'delete', itemId: id, expectedVersion: f.item(id).version })
    assert.throws(() => f.apply(id, guidance('Cannot revive')))
    f.run({ type: 'restoreItem', itemId: id, expectedVersion: f.item(id).version })
    assert.equal(f.repo.store.guidance(id)?.value?.nextAction, 'Newer guidance')
    validateImport(exportDataset(f.repo.store, f.now()), f.now())
    checked('undo', 'delete/restore retains guidance and never lets adoption revive an item')
  })
}

async function statisticsCases() {
  await fixture(f => {
    const id = f.create(), sibling = f.create()
    f.move(id, 'day', '2026-10-02')
    assert.equal(f.summary(id).scheduleChanges.advanceReschedule.value?.total, 1)
    f.time('2026-10-07T12:00:00Z')
    const batch = reconcile(f.repo)!
    assert(batch)
    assert.equal(f.summary(id).carryovers.currentEpisode.value?.total, 1)
    assert.equal(f.summary(id).carryovers.currentEpisode.value?.bySource.system, 1)
    assert.equal(f.summary(id).pressure.level.value, 'carryover')
    assert.equal(f.summary(sibling).carryovers.currentEpisode.value?.total, 1)
    f.move(sibling, 'week')
    f.run({ type: 'undoBatch', originalOperationId: batch.operationId })
    assert.equal(f.summary(id).carryovers.currentEpisode.value?.total, 0)
    assert.equal(f.summary(sibling).carryovers.currentEpisode.value?.total, 1)
    checked('statistics', 'advance moves, one multi-day system carry and real batch partial undo use item/effect identities')
    const history = f.summary(sibling, '2026-10-07T12:00:00Z')
    assert.equal(history.carryovers.lifetime.value?.total, 0, 'The exact cutoff excludes operations at that boundary')
    f.time('2026-10-08T12:00:00Z')
    f.status(sibling, 'done')
    const ended = f.summary(sibling)
    f.time('2026-10-09T12:00:00Z')
    assert.deepEqual(f.summary(sibling).placementDurations, ended.placementDurations)
    f.status(sibling, 'todo')
    assert.equal(f.summary(sibling).carryovers.currentEpisode.value?.total, 0)
    assert.equal(f.summary(sibling).carryovers.lifetime.value?.total, 1)
    checked('statistics', 'inactive time stops, reopen starts a new episode, and historical cutoffs freeze later undo')
    const page = f.repo.execution.page({ type: 'activityPage', generation: f.generation, itemId: sibling, limit: 1 }, f.now())
    assert(page.cursor)
    const next = f.repo.execution.page({ type: 'activityPage', generation: f.generation, itemId: sibling, limit: 1, cursor: page.cursor }, f.now())
    assert.notEqual(next.entries[0]!.event.id, page.entries[0]!.event.id)
    f.apply(sibling, guidance('Continue here'))
    assert.throws(() => f.repo.execution.page({ type: 'activityPage', generation: f.generation, itemId: sibling, limit: 1, cursor: page.cursor! }, f.now()))
    const before = f.repo.store.workspace().revision
    const month = f.repo.execution.month({ type: 'activityMonth', generation: f.generation, itemId: sibling, month: '2026-10-01' }, f.now())
    assert(month.dates.find(row => row.date === '2026-10-07')!.total >= 2)
    assert.equal(f.repo.store.workspace().revision, before)
    checked('statistics', 'same-day multi-events, frozen pagination and stale cursor refresh never mutate the workspace')
  })
  await fixture(f => {
    const id = f.create('week', { period: { kind: 'date', startDate: '2026-10-12' } }), later = f.create('later')
    assert.equal(f.summary(id).placementDurations.week.value, 0)
    f.summary(id)
    const scans = f.repo.execution.scans, revision = f.repo.store.workspace().revision, version = f.item(id).version
    f.create('later')
    f.time('2026-10-12T02:00:00Z')
    assert.equal(f.summary(id).currentPlacement.value?.eligibleSince, '2026-10-12T00:00:00Z')
    assert.equal(f.summary(id).placementDurations.week.value, 7200)
    assert.equal(f.repo.execution.scans, scans)
    assert.equal(f.item(id).version, version)
    assert.equal(f.repo.store.workspace().revision, revision + 1)
    assert(Object.values(f.summary(later).placementDurations).every(row => row.value === 0))
    assert.equal(f.summary(id, '2026-10-02T00:00:00Z').placementDurations.week.value, 0)
    f.time('2026-10-01T10:00:00Z')
    assert.equal(f.summary(id).coverage.quality, 'anomalous')
    checked('statistics', 'clock-only cache projection activates future periods, excludes Later, isolates historical inputs and detects rollback')
  })
  await fixture(f => {
    const id = f.create()
    for (const day of ['02', '03', '04']) { f.time(`2026-10-${day}T12:00:00Z`); f.move(id, 'day') }
    assert.equal(f.summary(id).pressure.level.value, 'reconfirm')
    f.apply(id, guidance('Waiting for an answer', 'waiting_note'))
    assert.equal(f.summary(id).pressure.suppression.value?.reconfirmationSuppressed, true)
    assert.equal(f.summary(id).pressure.level.value, 'carryover')
    for (const horizon of ['week', 'month', 'week', 'day', 'week', 'month', 'week', 'day'] as ItemHorizon[]) f.move(id, horizon)
    assert(f.summary(id).evidence.every(row => row.category !== 'guidance'))
    assert.equal(f.summary(id).pressure.suppression.value?.reconfirmationSuppressed, true)
    f.time('2026-10-05T12:00:00Z'); f.move(id, 'day')
    assert.equal(f.summary(id).pressure.level.value, 'reconfirm')
    f.apply(id, null)
    assert.equal(f.summary(id).pressure.suppression.value?.guidanceBoundary, null)
    f.time('2026-11-01T12:00:00Z')
    assert.equal(f.summary(id).pressure.level.value, 'carryover')
    checked('statistics', 'deduplicated pressure windows, waiting suppression, new sources, clear and expiry use the complete summary')
  })
  await fixture(f => {
    const id = f.create('week')
    for (let index = 0; index < 5001; index++) f.apply(id, guidance(`Synthetic bounded note ${index}`))
    const start = performance.now(), facts = f.summary(id), elapsedMs = performance.now() - start
    assert.equal(facts.carryovers.lifetime.value, null)
    assert.equal(facts.pressure.level.value, null)
    assert.equal(facts.coverage.reasons.includes('event_budget'), true)
    const scans = f.repo.execution.scans
    f.time('2026-10-02T12:00:00Z'); f.summary(id)
    assert.equal(f.repo.execution.scans, scans)
    f.run({ type: 'edit', itemId: id, expectedVersion: f.item(id).version, title: f.item(id).title, description: '', dueDate: '2026-09-30' })
    assert.equal(f.summary(id).pressure.level.value, 'overdue')
    report.budget = { events: 5002, scanBudget: 5000, elapsedMs, evidence: facts.evidence.length, serializedBytes: Buffer.byteLength(JSON.stringify(facts)) }
    checked('statistics', '5,000-event budget degrades counts and pressure, preserves independent deadlines and reuses clock-only input')
  })
}

async function recoveryCases() {
  await fixture(async (f, directory) => {
    const id = f.create(), adopted = f.apply(id, guidance('Saved offline'))
    f.apply(id, null); f.run({ type: 'undo', originalOperationId: adopted.operationId })
    const data = exportDataset(f.repo.store, f.now()), roundTrip = validateImport(JSON.parse(JSON.stringify(data)), f.now())
    assert.equal(roundTrip.schemaVersion, 8)
    replaceDataset(f.repo.store, roundTrip, 'restore', f.now())
    assert.deepEqual(f.repo.store.guidance(id), data.guidance[0])
    assert.equal(f.repo.store.workspace().pausedAfterRestore, true)
    assert.throws(() => f.repo.execute({ type: 'applyAssistance', generation: f.generation, operationId: randomUUID(), itemId: id, expectedVersion: f.item(id).version, expectedGuidanceRevision: 3, guidance: { kind: 'clear' } }))
    for (const mutate of [
      (copy: typeof data) => { copy.guidance[0]!.itemId = 'orphan' },
      (copy: typeof data) => { copy.guidance[0]!.revision++ },
      (copy: typeof data) => { copy.operations.find(op => op.effectsVersion === 2)!.effectsVersion = 1 },
      (copy: typeof data) => { copy.guidance[0]!.value = guidance('Invented head') },
    ]) { const copy = structuredClone(data); mutate(copy); assert.throws(() => validateImport(copy, f.now())) }
    checked('recovery', 'v8 heads/tombstones/history round-trip; orphan, revision, effect-version and head mismatches are rejected')
    const copyPath = join(directory, 'backup.sqlite')
    const { consistentBackup } = await import('../../../src/main/storage/backup/snapshot')
    const backup = await consistentBackup(f.db, join(directory, 'backups'))
    const sqlite = await readSqliteDataset(backup, f.now(), 'backup')
    assert.deepEqual(sqlite.guidance, data.guidance)
    await writeFile(copyPath, await readFile(backup))
    checked('recovery', 'SQLite backup retains guidance and old-generation commands fail after replacement')
  })
  await fixture(async (f, directory) => {
    f.create('week')
    const data = exportDataset(f.repo.store, f.now())
    for (const version of [1, 2, 3, 4, 5, 6, 7] as const) {
      const legacy = { ...structuredClone(data), schemaVersion: version, guidance: [], policies: data.policies.filter(policy => version >= 7 || !['year', 'half'].includes(policy.horizon)) }
      assert.deepEqual(validateImport(legacy, f.now()).guidance, [])
    }
    f.db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE; DROP TABLE item_guidance; PRAGMA user_version=7')
    const path = join(directory, 'legacy.sqlite')
    await writeFile(path, await readFile(join(directory, 'workspace.sqlite')))
    const hash = async () => createHash('sha256').update(await readFile(path)).digest('hex')
    const original = await hash(), upgrade = new StartupUpgrade(path, join(directory, 'upgrade-backups'), f.now)
    assert.throws(() => probeSource(path), error => (error as { legacyVersion?: number }).legacyVersion === 7)
    const first = await upgrade.prepare()
    await upgrade.cancel()
    assert.equal(await hash(), original)
    assert.equal((await readSqliteDataset(first.backupPath, f.now(), 'backup')).schemaVersion, 7)
    const next = await upgrade.prepare()
    assert.equal(await hash(), original)
    await upgrade.commit(next.token)
    const upgraded = await readSqliteDataset(path, f.now(), 'backup')
    assert.equal(upgraded.schemaVersion, schemaVersion)
    assert.deepEqual(upgraded.items, data.items)
    assert.deepEqual(upgraded.events, data.events)
    assert.deepEqual(upgraded.operations, data.operations)
    assert.equal(upgraded.workspace.pausedAfterRestore, true)
    assert.notEqual(upgraded.workspace.generation, data.workspace.generation)
    checked('recovery', 'v1–v7 imports and explicit v7 startup prepare/cancel/commit preserve legacy data and verified copies')
  })
}

await mkdir(out, { recursive: true })
try {
  for (const group of groups) {
    if (group === 'apply') await applyCases()
    if (group === 'undo') await undoCases()
    if (group === 'recovery') await recoveryCases()
    if (group === 'statistics') await statisticsCases()
  }
  report.ok = true
} catch (error) { report.ok = false; report.error = error instanceof Error ? error.stack : String(error); throw error }
finally {
  const db = openDatabase(':memory:')
  report.runtime = { electron: process.versions.electron, node: process.versions.node, sqlite: db.prepare('SELECT sqlite_version() AS v').get()!.v }
  db.close(); report.groups = checks
  await writeFile(join(out, 'boundary-report.json'), JSON.stringify(report, null, 2))
}
