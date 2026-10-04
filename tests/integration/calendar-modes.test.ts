/**
 * [INPUT]: Production Repository, in-memory SQLite and injected observation time.
 * [OUTPUT]: Transactional setup, hold, review, ordering, smart contract and dataset regressions.
 * [POS]: Integration boundary between calendar contracts, authoritative writes and shared consumers.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { readBoardPeriods } from '../../src/main/workspace/periods'
import { readReviewContext } from '../../src/main/workspace/review'
import { exportDataset, replaceDataset } from '../../src/main/workspace/transfer/dataset'
import { validateDataset } from '../../src/domain/import-validation'
import { reconcile } from '../../src/main/workspace/reconcile'
import { currentPeriod } from '../../src/domain/calendar'
import { boardDigest, emptyColumns } from '../../src/renderer/features/insight/signals'
import { reviewDigest } from '../../src/renderer/features/insight/review'
import { insightBoardSchema, smartPreviewSchema, smartReplySchema } from '../../src/shared/contracts/smart-input'
import { buildPreview } from '../../src/domain/smart/preview'
import { planQuestions, type QuestionPlan, type SmartContext } from '../../src/domain/smart/questions'
import type { ItemHorizon } from '../../src/shared/contracts/entities'
import type { Flows } from '../../src/renderer/state/flows'

let repo: Repository
let now: string
const horizons = ['year', 'half', 'cycle', 'month', 'week', 'day'] as const
const run = (command: Record<string, unknown>) => repo.execute({ ...command, generation: repo.store.workspace().generation, operationId: randomUUID() })
const setup = (mode = 'rolling', anchor: unknown = { kind: 'date', date: '2025-01-31' }) => run({ type: 'confirmSetup', mode, anchor, timezone: 'UTC', weekStart: 1, confirmed: true })
const create = (horizon: ItemHorizon, title: string = horizon, flowColor: number | null = null) => run({ type: 'create', title, horizon, flowColor }).itemId!
function flows(): Flows {
  const all = repo.snapshot().flows
  return { all, visible: all, of: () => all, colorsOf: () => all.map(f => f.flowColor), owner: color => all.find(f => f.flowColor === color), isRoot: id => all.some(f => f.id === id) }
}
beforeEach(() => { now = '2026-10-01T12:00:00Z'; const db = openDatabase(':memory:'); migrate(db); repo = new Repository(db, { now: () => now }) })
afterEach(() => repo.db.close())

describe('Authoritative calendar transactions and shared consumers', () => {
  it.each([
    ['rolling', 'today', '2026-09-30'], ['rolling', 'monthStart', '2026-09-01'], ['natural', 'today', '2025-01-01'],
  ])('BUG-12: rejects stale %s/%s previews without any write', (mode, kind, expected) => {
    const before = repo.store.workspace()
    expect(() => setup(mode, { kind, expected })).toThrow(expect.objectContaining({ code: 'stale_preview' }))
    expect(repo.store.workspace()).toEqual(before)
    expect(repo.db.prepare('SELECT count(*) AS n FROM planning_periods').get()!.n).toBe(0)
    expect(repo.db.prepare('SELECT count(*) AS n FROM operations').get()!.n).toBe(0)
  })
  it('resolves presets within the confirmation transaction and locks mode/anchor', () => {
    setup('natural', { kind: 'today', expected: '2026-01-01' })
    expect(repo.store.workspace().calendar).toMatchObject({ mode: 'natural', cycleAnchor: '2026-01-01' })
    expect(repo.snapshot().periods.map(p => p.horizon)).toEqual(horizons)
    expect(repo.store.policies()).toHaveLength(4)
    expect(repo.db.prepare('SELECT count(*) AS n FROM planning_periods').get()!.n).toBe(4)
    expect(() => setup()).toThrow()
    for (const h of ['year', 'half']) expect(() => run({ type: 'policy', horizon: h, mode: 'auto', expectedVersion: 1 })).toThrow()
  })
  it('creates, advances, searches and selects all six future columns together', () => {
    setup()
    for (const horizon of horizons) {
      const id = create(horizon), item = repo.store.item(id)
      run({ type: 'move', itemId: id, horizon, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, period: { kind: 'next' } })
      const period = repo.detail(id).period!
      expect(period.startDate).toBe(repo.snapshot().periods.find(p => p.horizon === horizon)!.endDate)
      expect(repo.list({ type: 'list', view: 'search', query: horizon, offset: 0, limit: 50 }).periods).toContainEqual(period)
    }
    const selected = repo.store.items('1').map(item => repo.store.period(item.placement.periodId!))
    expect(readBoardPeriods(repo.store, { type: 'boardPeriods', generation: repo.store.workspace().generation, periods: selected.map(({ horizon, startDate }) => ({ horizon, startDate })) }, now).items).toHaveLength(6)
  })
  it.each(['year', 'half'] as const)('never rolls %s automatically, and undo into an expired period creates a hold', horizon => {
    setup(); const id = create(horizon), source = repo.detail(id).period!
    now = source.endAt
    reconcile(repo)
    expect(repo.store.item(id).placement.periodId).toBe(source.id)
    const item = repo.store.item(id)
    const moved = run({ type: 'move', itemId: id, horizon, expectedVersion: item.version, expectedPlacementVersion: item.placement.version })
    run({ type: 'undo', originalOperationId: moved.operationId })
    expect(repo.store.item(id).placement).toMatchObject({ periodId: source.id, holdPeriodId: currentPeriod(repo.store.workspace().calendar!, horizon, now).id })
  })
  it('BUG-11: previous-month reviews before the shared anchor omit all three anchored horizons', () => {
    setup('rolling', { kind: 'today', expected: '2026-10-01' })
    const review = readReviewContext(repo, { type: 'reviewContext', generation: repo.store.workspace().generation, periods: [{ horizon: 'month', startDate: '2026-09-01' }] })
    expect(review.board.periods.map(p => p.horizon)).toEqual(['month', 'week', 'day'])
  })
  it('BUG-01/07: six-period smart/insight payloads validate and skipped levels do not create empty cards', () => {
    setup(); const root = run({ type: 'create', horizon: 'year', title: 'Annual direction', flowColor: 0 }).itemId!
    const snapshot = repo.snapshot(), index = flows()
    expect(emptyColumns(snapshot, [...horizons], () => 'current').get('half')?.map(i => i.id)).toEqual([root])
    for (const digest of [boardDigest(snapshot, index), reviewDigest(snapshot, index)]) {
      expect(insightBoardSchema.safeParse(digest).success).toBe(true)
      expect(JSON.stringify(digest)).not.toContain('undefined')
    }
    const context: SmartContext = { text: '这一年完成方向', referenceDate: '2026-10-01', weekdayName: '周四', timezone: 'UTC', weekStart: 1,
      calendar: snapshot.workspace.calendar!, periods: Object.fromEntries(snapshot.periods.map(p => [p.horizon, { id: p.id, startDate: p.startDate, endDate: p.endDate }])) as SmartContext['periods'], candidates: [] }
    const plan = planQuestions(context) as QuestionPlan
    const answers = Object.fromEntries(Object.entries(plan.questions).map(([id, q]) => [id, q.type === 'boolean' ? { type: 'boolean', probability: 0.02 } : {
      type: 'choice', choice: id.startsWith('role') ? 'task' : id.startsWith('horizon') ? 'year' : Object.keys(q.criteria)[0],
      probabilities: Object.fromEntries(Object.keys(q.criteria).map(key => [key, key === (id.startsWith('role') ? 'task' : id.startsWith('horizon') ? 'year' : Object.keys(q.criteria)[0]) ? 1 : 0])),
    }]))
    const preview = buildPreview(context, plan, { answers, precision: { decimals: 2, source: 'adapter' } }, null)
    expect(smartPreviewSchema.safeParse(preview).success).toBe(true)
    expect(smartReplySchema.safeParse({ type: 'analysis', reply: { status: 'ready', echo: { requestId: randomUUID(), draftSessionId: randomUUID(), inputRevision: 1, manualRevision: 0, generation: snapshot.workspace.generation, providerRevision: 1, contextRevision: snapshot.workspace.revision, referenceTime: now }, preview, diagnostics: [] } }).success).toBe(true)
    run({ type: 'create', title: 'Skip half', horizon: 'cycle', parentId: root, expectedParentVersion: repo.store.item(root).version })
    expect(emptyColumns(repo.snapshot(), [...horizons], () => 'current').has('half')).toBe(false)
  })
  it('BUG-10: materializes half/cycle order atomically and undo restores manual order', () => {
    setup(); const a = create('year', 'A', 0), b = create('year', 'B', 1)
    const pairs = horizons.slice(1, 3).map(horizon => {
      const second = create(horizon, 'Second'), first = create(horizon, 'First')
      for (const [parentId, childId] of [[b, second], [a, first]]) run({ type: 'link', parentId, childId, expectedParentVersion: repo.store.item(parentId!).version, expectedChildVersion: repo.store.item(childId!).version })
      return [horizon, first, second] as const
    })
    const result = run({ type: 'materializeParentOrder' })
    const order = (horizon: string) => repo.store.items('p.horizon=?', [horizon]).map(i => i.id)
    for (const [horizon, first, second] of pairs) expect(order(horizon)).toEqual([first, second])
    const restarted = new Repository(repo.db, { now: () => now })
    for (const [horizon, first, second] of pairs) expect(restarted.store.items('p.horizon=?', [horizon]).map(i => i.id)).toEqual([first, second])
    run({ type: 'undo', originalOperationId: result.operationId })
    for (const [horizon, first, second] of pairs) expect(order(horizon)).toEqual([second, first])
  })
  it.each(['rolling', 'natural'])('round-trips %s datasets without changing periods, events, relations or receipts', mode => {
    setup(mode, mode === 'natural' ? { kind: 'today', expected: '2026-01-01' } : undefined)
    for (const h of horizons) create(h)
    const data = exportDataset(repo.store, now)
    expect(data.schemaVersion).toBe(6)
    replaceDataset(repo.store, validateDataset(data, now), 'restore', now)
    const after = exportDataset(repo.store, now)
    for (const key of ['items', 'placements', 'periods', 'relations', 'policies', 'events', 'operations', 'undoEffects'] as const) expect(after[key]).toEqual(data[key])
    expect(after.workspace.calendar).toEqual(data.workspace.calendar)
  })
})
