/**
 * Failure cases recorded before implementation: advance moves counted as carryovers, system
 * spans expanded into daily failures, undo removing real time, baseline filled as creation,
 * inactive/future/Later durations, DST, guidance suppression, incomplete scans, stale clock
 * projections, and historical cutoffs applying later undo or today's deadline.
 */
import { expect, it } from 'vitest'
import { calculateExecutionFacts, type ExecutionInput } from '../../src/domain/execution-facts'
import { currentPeriod } from '../../src/domain/calendar'
import type { Item } from '../../src/shared/contracts/entities'
import { businessState, type ItemEvent, type Operation } from '../../src/shared/contracts/effects'

const calendar = { id: 'calendar', mode: 'rolling' as const, timezone: 'UTC', weekStart: 1, cycleAnchor: '2026-01-01' }
function fixture(horizon: Item['placement']['horizon'] = 'day', at = '2026-10-01T12:00:00Z'): ExecutionInput {
  const period = horizon === 'later' ? null : currentPeriod(calendar, horizon, at)
  const item: Item = { id: 'item', title: 'Synthetic task', description: '', dueDate: null, status: 'todo', completedAt: null, cancelledAt: null, archivedAt: null, deletedAt: null, deletedBy: null, createdAt: at, updatedAt: at, version: 1, flowColor: null, placement: { itemId: 'item', horizon, periodId: period?.id ?? null, sortKey: 1024, version: 1, holdPeriodId: null } }
  const event: ItemEvent = { seq: 1, id: 'event1', operationId: 'op1', eventIndex: 0, itemId: item.id, at, type: 'created', before: null, after: businessState(item), undoOf: null }
  const operation: Operation = { id: 'op1', generation: 'generation', requestHash: '0'.repeat(64), kind: 'create', source: 'user', at, effectsVersion: 1, effects: [{ kind: 'create', itemId: item.id, status: { status: 'todo', completedAt: null, cancelledAt: null }, horizon, periodId: period?.id ?? null, initialRelations: [] }], result: { operationId: 'op1', generation: 'generation', changed: true, undoable: true, outcome: 'committed', itemId: item.id, label: 'Create', warnings: [], restoreSource: null, originalOperationId: null } }
  return { item, calendar, generation: 'generation', sourceRevision: 'revision', events: [event], operations: [operation], periods: period ? [period] : [], undo: [], guidance: null, scanLimited: false, effectsLimited: false }
}
function move(input: ExecutionInput, at: string, targetAt: string, source: 'user' | 'system' = 'user') {
  const before = structuredClone(input.item), horizon = before.placement.horizon
  if (horizon === 'later') throw Error('Fixture needs a planned item')
  const target = currentPeriod(input.calendar, horizon, targetAt)
  input.periods.push(target)
  input.item.placement.periodId = target.id
  input.item.version++
  const seq = input.events.length + 1, id = `op${seq}`
  input.events.push({ seq, id: `event${seq}`, operationId: id, eventIndex: 0, itemId: input.item.id, at, type: 'rolled_over', before: businessState(before), after: businessState(input.item), undoOf: null })
  input.operations.push({ ...input.operations[0]!, id, at, kind: 'move', source, effects: [{ kind: 'position', itemId: input.item.id, before: { horizon, periodId: before.placement.periodId, previousId: null, nextId: null }, after: { horizon, periodId: target.id, previousId: null, nextId: null } }] })
}

it('classifies moves from the actual ended source period and separates system source', () => {
  const input = fixture()
  move(input, '2026-10-01T13:00:00Z', '2026-10-02T12:00:00Z')
  move(input, '2026-10-07T12:00:00Z', '2026-10-07T12:00:00Z', 'system')
  const facts = calculateExecutionFacts(input, '2026-10-07T13:00:00Z')
  expect(facts.carryovers.currentEpisode.value?.total).toBe(1)
  expect(facts.carryovers.lifetime.value?.bySource.system).toBe(1)
  expect(facts.scheduleChanges.advanceReschedule.value?.total).toBe(1)
  expect(facts.pressure.level.value).toBe('carryover')
})

it('uses source periods and different operation dates, independent of six evidence samples', () => {
  const input = fixture()
  for (let day = 2; day <= 8; day++) move(input, `2026-10-0${day}T12:00:00Z`, `2026-10-0${day}T12:00:00Z`)
  const facts = calculateExecutionFacts(input, '2026-10-08T13:00:00Z')
  expect(facts.evidence.length).toBeLessThanOrEqual(6)
  expect(facts.pressure.windows.day.value?.distinctSourcePeriods).toBe(7)
  expect(facts.pressure.level.value).toBe('reconfirm')
  expect(calculateExecutionFacts(input, '2026-11-08T13:00:00Z').pressure.level.value).toBe('carryover')
})

it('activates a future placement on its boundary without changing source revision', () => {
  const input = fixture('week', '2026-10-12T00:00:00Z')
  input.item.createdAt = '2026-10-07T12:00:00Z'
  input.events[0]!.at = input.item.createdAt
  input.operations[0]!.at = input.item.createdAt
  const waiting = calculateExecutionFacts(input, '2026-10-11T23:00:00Z')
  const active = calculateExecutionFacts(input, '2026-10-12T02:00:00Z')
  expect(waiting.currentPlacement.value?.eligibleSince).toBeNull()
  expect(waiting.placementDurations.week.value).toBe(0)
  expect(active.currentPlacement.value?.eligibleSince).toBe('2026-10-12T00:00:00Z')
  expect(active.placementDurations.week.value).toBe(7200)
  expect(active.sourceRevision).toBe(waiting.sourceRevision)
})

it('keeps baseline and scan-limited history unknown while independently confirming overdue risk', () => {
  const input = fixture()
  input.events[0]!.type = 'baseline'
  input.item.createdAt = '2026-09-01T12:00:00Z'
  input.item.dueDate = '2026-10-01'
  const facts = calculateExecutionFacts(input, '2026-10-07T12:00:00Z')
  expect(facts.createdAgeDays.value).toBe(36)
  expect(facts.currentEpisode.quality).toBe('unknown')
  expect(facts.pressure.level).toMatchObject({ value: 'overdue', quality: 'complete' })
  input.scanLimited = true
  input.item.dueDate = null
  expect(calculateExecutionFacts(input, '2026-10-07T12:00:00Z').carryovers.lifetime.value).toBeNull()
  expect(calculateExecutionFacts(input, '2026-10-07T12:00:00Z').pressure.level.value).toBeNull()
})

it('excludes Later duration and does not use current deadlines in historical facts', () => {
  const input = fixture('later')
  input.item.dueDate = '2026-10-01'
  const facts = calculateExecutionFacts(input, '2026-10-07T12:00:00Z')
  expect(Object.values(facts.placementDurations).every(fact => fact.value === 0)).toBe(true)
  expect(facts.pressure.level.value).toBe('overdue')
  expect(calculateExecutionFacts(input, '2026-10-02T12:00:00Z', true).deadlineNow.quality).toBe('unknown')
})
