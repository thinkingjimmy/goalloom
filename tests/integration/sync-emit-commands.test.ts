import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { parseSyncOp, type Action } from '@goalloom/contracts'
import { copyProjectionToBase } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { reconcile } from '../../src/main/workspace/reconcile'
import type { CommandInput } from '../../src/shared/contracts/commands'

type WithoutEnvelope<T> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never

function harness(start = '2026-09-23T02:00:00.000Z') {
  let now = start
  const db = openDatabase(':memory:')
  migrate(db)
  const repo = new Repository(db, { now: () => now })
  const run = (command: WithoutEnvelope<CommandInput>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation } as CommandInput)
  const actionsSince = (before: number): Action[] => db.prepare('SELECT payload FROM sync_ops WHERE localOrder>? ORDER BY localOrder').all(before)
    .flatMap(row => parseSyncOp(JSON.parse(String(row.payload))).actions)
  return { db, repo, run, actionsSince, setNow: (value: string) => { now = value } }
}

it('createPlan emits one op with item.create and the parent rel.link', () => {
  const { db, repo, run, actionsSince } = harness()
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-21' }, confirmed: true })
  const parent = run({ type: 'create', title: '上级', horizon: 'cycle', flowColor: 1 })
  const week = repo.snapshot().periods.find(period => period.horizon === 'week')!
  const before = Number(db.prepare('SELECT count(*) AS n FROM sync_ops').get()!.n)
  run({
    type: 'createPlan',
    items: [
      { draftId: 'later-a', title: '稍后甲', description: '', dueDate: null, horizon: 'later', previewPeriodId: null, parentRefs: [], flowColor: null },
      { draftId: 'week-b', title: '本周乙', description: '', dueDate: null, horizon: 'week', previewPeriodId: week.id, parentRefs: [{ kind: 'existing', itemId: parent.itemId!, expectedVersion: repo.store.item(parent.itemId!).version }], flowColor: null },
    ],
  })
  const rows = db.prepare('SELECT payload FROM sync_ops ORDER BY localOrder').all().slice(before)
  expect(rows).toHaveLength(1)
  const actions = parseSyncOp(JSON.parse(String(rows[0]!.payload))).actions
  expect(actions.filter(action => action.t === 'item.create').map(action => action.t === 'item.create' ? action.title : '')).toEqual(['稍后甲', '本周乙'])
  expect(actions.some(action => action.t === 'rel.link' && action.parentId === parent.itemId)).toBe(true)
  expect(actionsSince(before).filter(action => action.t === 'item.create')).toHaveLength(2)
  db.close()
})

it('applyAssistance emits guidance.set at the expected revision', () => {
  const { db, repo, run } = harness()
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-21' }, confirmed: true })
  const created = run({ type: 'create', title: '协助', horizon: 'later' })
  const id = created.itemId!
  run({
    type: 'applyAssistance', itemId: id, expectedVersion: repo.store.item(id).version, expectedGuidanceRevision: 0,
    guidance: { kind: 'set', value: { formatVersion: 1, kind: 'next_step', nextAction: '下一步', contextNote: null, scopeNote: null, authorship: 'user' } },
  })
  const guidance = db.prepare("SELECT payload FROM sync_ops WHERE json_extract(payload,'$.actions[0].t')='guidance.set'").get()
  expect(parseSyncOp(JSON.parse(String(guidance!.payload))).actions).toEqual([{
    t: 'guidance.set', itemId: id, baseRevision: 0,
    value: { formatVersion: 1, kind: 'next_step', nextAction: '下一步', contextNote: null, scopeNote: null, authorship: 'user' },
  }])
  db.close()
})

it('arrangeBacklog emits item.place reason arrange', () => {
  const { db, repo, run, setNow } = harness('2026-09-23T02:00:00.000Z')
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-01' }, confirmed: true })
  const created = [run({ type: 'create', title: '甲', horizon: 'month' }), run({ type: 'create', title: '乙', horizon: 'month' })]
  setNow('2026-10-05T02:00:00.000Z')
  const items = created.map(result => {
    const item = repo.store.item(result.itemId!)
    return { itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version }
  })
  const before = Number(db.prepare('SELECT COALESCE(MAX(localOrder),0) AS n FROM sync_ops').get()!.n)
  run({ type: 'arrangeBacklog', horizon: 'later', items })
  const actions = db.prepare('SELECT payload FROM sync_ops WHERE localOrder>? ORDER BY localOrder').all(before)
    .flatMap(row => parseSyncOp(JSON.parse(String(row.payload))).actions)
  expect(actions).toHaveLength(2)
  expect(actions.every(action => action.t === 'item.place' && action.reason === 'arrange' && action.horizon === 'later')).toBe(true)
  db.close()
})

it('materializeParentOrder emits item.place reason arrange when the order changes', () => {
  const { db, repo, run } = harness('2026-10-01T12:00:00.000Z')
  run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2025-01-31' }, confirmed: true })
  const a = run({ type: 'create', title: 'A', horizon: 'year', flowColor: 0 }).itemId!
  const b = run({ type: 'create', title: 'B', horizon: 'year', flowColor: 1 }).itemId!
  const second = run({ type: 'create', title: 'Second', horizon: 'half' }).itemId!
  const first = run({ type: 'create', title: 'First', horizon: 'half' }).itemId!
  run({ type: 'link', parentId: b, childId: second, expectedParentVersion: repo.store.item(b).version, expectedChildVersion: repo.store.item(second).version })
  run({ type: 'link', parentId: a, childId: first, expectedParentVersion: repo.store.item(a).version, expectedChildVersion: repo.store.item(first).version })
  const before = Number(db.prepare('SELECT COALESCE(MAX(localOrder),0) AS n FROM sync_ops').get()!.n)
  const result = run({ type: 'materializeParentOrder' })
  expect(result.changed).toBe(true)
  const actions = db.prepare('SELECT payload FROM sync_ops WHERE localOrder>? ORDER BY localOrder').all(before)
    .flatMap(row => parseSyncOp(JSON.parse(String(row.payload))).actions)
  expect(actions.length).toBeGreaterThan(0)
  expect(actions.every(action => action.t === 'item.place' && action.reason === 'arrange')).toBe(true)
  expect(repo.store.items('p.horizon=?', ['half']).map(item => item.id)).toEqual([first, second])
  db.close()
})

it('discardEmpty emits item.discardIfEmpty and confirmRollover writes no sync op', () => {
  const { db, repo, run } = harness()
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-21' }, confirmed: true })
  const created = run({ type: 'create', title: '空卡', description: '', dueDate: null, horizon: 'later' })
  const id = created.itemId!
  run({ type: 'discardEmpty', itemId: id, expectedVersion: repo.store.item(id).version })
  const discarded = db.prepare("SELECT payload FROM sync_ops WHERE json_extract(payload,'$.actions[0].t')='item.discardIfEmpty'").get()
  expect(parseSyncOp(JSON.parse(String(discarded!.payload))).actions[0]).toMatchObject({ t: 'item.discardIfEmpty', id })
  db.prepare('UPDATE workspace SET pausedAfterRestore=1').run()
  const before = Number(db.prepare('SELECT count(*) AS n FROM sync_ops').get()!.n)
  const confirmed = run({ type: 'confirmRollover', confirmed: true })
  expect(confirmed.changed).toBe(true)
  expect(Number(db.prepare('SELECT count(*) AS n FROM sync_ops').get()!.n)).toBe(before)
  expect(repo.store.workspace().pausedAfterRestore).toBe(false)
  db.close()
})

it('undoBatch reverts only the undone system rollover ops', () => {
  const { db, repo, run, setNow } = harness('2026-09-10T02:00:00.000Z')
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-01-31' }, confirmed: true })
  const older = run({ type: 'create', title: '旧', horizon: 'day', dueDate: '2026-09-30' }).itemId!
  const nearer = run({ type: 'create', title: '近', horizon: 'day', dueDate: '2026-09-30' }).itemId!
  copyProjectionToBase(nodeSqlDriver(db))
  setNow('2026-11-03T02:00:00.000Z')
  const batch = reconcile(repo)!
  const rollovers = db.prepare("SELECT opId, state, json_extract(payload,'$.actions[0].id') AS itemId FROM sync_ops WHERE deviceId='system' ORDER BY localOrder").all()
  expect(rollovers.map(row => String(row.itemId)).sort()).toEqual([older, nearer].sort())
  const sent = String(rollovers[0]!.opId)
  db.prepare(`UPDATE sync_ops SET state='send_unknown' WHERE opId=?`).run(sent)
  run({ type: 'undoBatch', originalOperationId: batch.operationId })
  expect(String(db.prepare('SELECT state FROM sync_ops WHERE opId=?').get(sent)!.state)).toBe('send_unknown')
  const other = String(rollovers.find(row => String(row.opId) !== sent)!.opId)
  expect(String(db.prepare('SELECT state FROM sync_ops WHERE opId=?').get(other)!.state)).toBe('reverted_local')
  const reverts = db.prepare("SELECT payload FROM sync_ops WHERE json_extract(payload,'$.actions[0].t')='revert'").all()
    .flatMap(row => parseSyncOp(JSON.parse(String(row.payload))).actions)
  expect(reverts).toEqual([{ t: 'revert', targetOpId: sent, mode: 'all_or_nothing' }])
  db.close()
})
