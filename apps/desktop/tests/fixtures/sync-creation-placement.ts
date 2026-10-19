/**
 * [INPUT]: Two isolated production repositories, pending rebuild and encrypted exchange callbacks.
 * [OUTPUT]: Ready/late creation, explicit/disabled/future placement and ordered-plan convergence evidence.
 * [POS]: Sync replay acceptance for committed creation anchors; no native UI, live provider or user data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { SyncOp } from '@goalloom/contracts'
import type { Repository } from '../../src/main/workspace/repository'
import type { CommandInput, CommandResult } from '../../src/shared/contracts/commands'
import type { CreationSelection } from '../../src/shared/contracts/capture'
import type { ItemHorizon } from '../../src/shared/contracts/entities'
import { Temporal } from '../../src/domain/temporal'

type LocalCommand<T> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never
export interface PlacementObservation { name: string; phase: string; expected: string[]; actual: string[] }
interface Options {
  first: Repository; second: Repository; rebuild: () => void; sync: () => Promise<void>
  checks: string[]; observations: PlacementObservation[]
}

export async function syncCreationPlacement({ first, second, rebuild, sync, checks, observations }: Options): Promise<void> {
  const run = (command: LocalCommand<CommandInput>, selection?: CreationSelection) => first.execute({
    ...command, operationId: randomUUID(), generation: first.store.workspace().generation,
  }, selection)
  const create = (title: string, horizon: ItemHorizon = 'day', parentId: string | null = null, extra: Record<string, unknown> = {}) => run({
    type: 'create', title, horizon, parentId,
    expectedParentVersion: parentId ? first.store.item(parentId).version : null, ...extra,
  }).itemId!
  const period = first.snapshot().periods.find(value => value.horizon === 'day')!
  const parent = create('Release placement outcome', 'month')
  const sibling = create('Existing release placement sibling', 'day', parent)
  const tail = create('Independent release placement tail')
  await sync()
  const rows = (repo: Repository, horizon = 'day', periodId = period.id) => repo.store.items(
    'i.deletedAt IS NULL AND p.horizon=? AND p.periodId IS ? AND p.nestingParentId IS NULL', [horizon, periodId],
  ).map(item => item.id)
  const observe = (name: string, phase: string, expected: string[], repo: Repository, horizon = 'day', periodId = period.id) => {
    const actual = rows(repo, horizon, periodId)
    observations.push({ name, phase, expected, actual })
    assert.deepEqual(actual, expected, `${name}: ${phase} preserves committed creation order`)
  }
  const verify = async (name: string, expected: string[], horizon = 'day', periodId = period.id) => {
    observe(name, 'local', expected, first, horizon, periodId)
    rebuild()
    observe(name, 'pending replay', expected, first, horizon, periodId)
    await sync()
    observe(name, 'canonical writer', expected, first, horizon, periodId)
    observe(name, 'canonical peer', expected, second, horizon, periodId)
    await sync()
    observe(name, 'repeated exchange', expected, first, horizon, periodId)
  }
  const selection = (periodId = period.id): CreationSelection => ({ horizon: 'day', previewPeriodId: periodId,
    parents: [{ itemId: parent, title: first.store.item(parent).title, horizon: 'month', periodId: first.store.item(parent).placement.periodId, parentIds: [] }] })
  const capture = (title: string, ready: boolean, autoPlace: boolean, startDate = period.startDate, periodId = period.id) => {
    const request = { requestId: randomUUID(), draftSessionId: randomUUID(), inputRevision: 1, manualRevision: 0,
      generation: first.store.workspace().generation, providerRevision: 1, contextRevision: first.store.workspace().revision,
      referenceTime: first.snapshot().observedAt, text: title, parentHints: [], target: { horizon: 'day' as const, startDate } }
    return run({ type: 'create', title, horizon: 'day', period: { kind: 'date', startDate }, autoPlace,
      smartCapture: { request, allowPlacement: false, allowParents: true } }, ready ? selection(periodId) : undefined)
  }
  const complete = (receipt: CommandResult) => first.execute({ type: 'completeCreation', operationId: randomUUID(), generation: first.store.workspace().generation, creationOperationId: receipt.operationId,
    requestId: receipt.capture!.requestId, itemId: receipt.itemId!, expectedVersion: receipt.capture!.itemVersion,
    expectedPlacementVersion: receipt.capture!.placementVersion, selection: selection() })
  const addAfter = (before: string[], id: string, anchor = sibling) => {
    const result = [...before]
    result.splice(result.indexOf(anchor) + 1, 0, id)
    return result
  }
  const linkedOnBoth = (id: string) => {
    for (const repo of [first, second]) assert(repo.store.relations().some(edge => edge.childId === id && edge.parentId === parent))
  }
  const undoRestore = async (receipt: CommandResult, expected: string[]) => {
    const undone = run({ type: 'undo', originalOperationId: receipt.operationId })
    assert.equal(undone.outcome, 'committed')
    await sync()
    for (const repo of [first, second]) {
      assert(repo.store.item(receipt.itemId!).deletedAt)
      assert(!repo.store.relations().some(edge => edge.childId === receipt.itemId))
    }
    run({ type: 'restoreItem', itemId: receipt.itemId!, expectedVersion: first.store.item(receipt.itemId!).version, deletionSource: undone.operationId })
    await sync()
    linkedOnBoth(receipt.itemId!)
    for (const repo of [first, second]) observe('creation restore', 'canonical restore', expected, repo)
  }

  const beforeReady = rows(first)
  const ready = capture('Ready bilingual release interaction 中文', true, true)
  const readyOrder = addAfter(beforeReady, ready.itemId!)
  await verify('ready automatic parent', readyOrder)
  linkedOnBoth(ready.itemId!)
  await undoRestore(ready, readyOrder)
  checks.push('Ready Jev creation preserves parent placement through pending rebuild, canonical echo, repeated exchange and one undo/restore on both peers')

  const beforeLate = rows(first)
  const late = capture('Late release interaction https://example.test/drag', false, true)
  await sync()
  assert(complete(late).changed)
  const lateOrder = addAfter(beforeLate, late.itemId!, ready.itemId!)
  await verify('late automatic parent', lateOrder)
  linkedOnBoth(late.itemId!)
  await undoRestore(late, lateOrder)
  checks.push('Late parent completion keeps the final position after encrypted replay and grouped creation undo/restore')

  const beforeOff = rows(first)
  const off = capture('Ready parent with automatic placement disabled', true, false)
  await verify('disabled automatic placement', [...beforeOff, off.itemId!])
  linkedOnBoth(off.itemId!)
  checks.push('Disabled automatic placement remains at the tail after matching and encrypted replay')

  for (const [name, beforeId] of [['explicit head', rows(first)[0]!], ['explicit middle', tail], ['explicit tail', null]] as const) {
    const before = rows(first)
    const id = create(name, 'day', parent, { beforeId, autoPlace: true })
    const expected = [...before]
    expected.splice(beforeId === null ? expected.length : expected.indexOf(beforeId), 0, id)
    await verify(name, expected)
  }
  checks.push('Explicit head/middle/tail creation positions survive pending rebuild and both canonical projections')

  const outline = create('Placement anchor root')
  const root = first.store.item(outline)
  create('Nested rows cannot anchor root creation', 'day', null, { nesting: { parentId: outline, expectedParentVersion: root.version, expectedParentPlacementVersion: root.placement.version } })
  const deleted = create('Deleted rows cannot anchor creation')
  run({ type: 'delete', itemId: deleted, expectedVersion: first.store.item(deleted).version })
  await sync()
  const activeBefore = rows(first)
  const active = run({ type: 'create', title: 'Append after the last live root', horizon: 'day' })
  const activePayload = JSON.parse(String(first.db.prepare('SELECT payload FROM sync_ops WHERE opId=?').get(active.operationId)!.payload)) as SyncOp
  const activeCreate = activePayload.actions.find(action => action.t === 'item.create')!
  assert.equal(activeCreate.sortHint.afterId, activeBefore.at(-1))
  assert.equal(activeCreate.sortHint.beforeId, null)
  await verify('active root anchors', [...activeBefore, active.itemId!])
  checks.push('Root creation anchors exclude nested children and deleted rows')

  const futureStart = Temporal.PlainDate.from(period.startDate).add({ days: 3 }).toString()
  const futureSibling = create('Future release sibling', 'day', parent, { period: { kind: 'date', startDate: futureStart } })
  create('Future independent tail', 'day', null, { period: { kind: 'date', startDate: futureStart } })
  await sync()
  const futurePeriodId = first.store.item(futureSibling).placement.periodId!
  const currentBefore = rows(first)
  const futureBefore = rows(first, 'day', futurePeriodId)
  const future = capture('Future ready release placement', true, true, futureStart, futurePeriodId)
  await verify('future automatic parent', addAfter(futureBefore, future.itemId!, futureSibling), 'day', futurePeriodId)
  assert.deepEqual(rows(first), currentBefore)
  checks.push('Future-period automatic placement converges without changing the current period')

  const goals = ['A', 'B', 'C'].map(name => create(`Plan placement ${name}`, 'year'))
  const planTail = create('Plan independent tail', 'half')
  await sync()
  const half = first.snapshot().periods.find(value => value.horizon === 'half')!
  const planBefore = rows(first, 'half', half.id)
  const plan = run({ type: 'createPlan', autoPlace: true, items: [1, 0, 2].map(index => ({ draftId: `p${index}`, title: `Plan entry ${index}`,
    horizon: 'half', previewPeriodId: half.id, parentRefs: [{ kind: 'existing', itemId: goals[index]!, expectedVersion: first.store.item(goals[index]!).version }] })) })
  const byTitle = (index: number) => first.store.items('i.title=?', [`Plan entry ${index}`])[0]!.id
  const planExpected = [...planBefore]
  planExpected.splice(planExpected.indexOf(planTail), 0, ...[0, 1, 2].map(byTitle))
  const payload = JSON.parse(String(first.db.prepare('SELECT payload FROM sync_ops WHERE opId=?').get(plan.operationId)!.payload)) as SyncOp
  const unavailable = new Set(plan.itemIds)
  for (const action of payload.actions) if (action.t === 'item.create') {
    unavailable.delete(action.id)
    assert(!action.sortHint.afterId || !unavailable.has(action.sortHint.afterId), 'A creation cannot anchor to a later create action')
    assert(!action.sortHint.beforeId || !unavailable.has(action.sortHint.beforeId), 'A creation cannot anchor to a later create action')
  }
  await verify('topological plan placement', planExpected, 'half', half.id)
  checks.push('A plan emitted in B/A/C order replays its committed A/B/C positions using only available anchors')
}
