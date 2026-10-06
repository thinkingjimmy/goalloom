import { expect, it } from 'vitest'
import { activityInsight, activityMonthGrid, type ActivityEvent } from '../../src/renderer/features/items/activity-insight'
import type { ItemHorizon } from '../../src/shared/contracts/entities'

function state(horizon: ItemHorizon, status: 'todo' | 'done' = 'todo') {
  return { status, completedAt: null, cancelledAt: null, archivedAt: null, deletedAt: null, deletedBy: null, version: 1, horizon, periodId: null, sortKey: 0, holdPeriodId: null }
}

function event(seq: number, type: ActivityEvent['type'], at: string, horizon: ItemHorizon, before: ItemHorizon | null = null, status: 'todo' | 'done' = 'todo', operationId = `op${seq}`): ActivityEvent {
  return {
    seq, id: `e${seq}`, operationId, eventIndex: 0, itemId: 'item', at, type, undoOf: null,
    before: before ? state(before, type === 'status_changed' && status === 'todo' ? 'done' : 'todo') : null,
    after: state(horizon, status),
  }
}

const story: ActivityEvent[] = [
  event(1, 'created', '2026-09-02T10:24:00.000Z', 'month'),
  event(2, 'moved', '2026-09-07T16:11:00.000Z', 'week', 'month'),
  event(3, 'rolled_over', '2026-09-14T08:02:00.000Z', 'week', 'week'),
  event(4, 'rolled_over', '2026-09-21T09:02:00.000Z', 'week', 'week'),
  event(5, 'moved', '2026-09-23T19:30:00.000Z', 'day', 'week'),
  event(6, 'status_changed', '2026-09-23T21:05:00.000Z', 'day', 'day', 'done'),
  event(7, 'status_changed', '2026-09-24T09:40:00.000Z', 'day', 'day'),
  event(8, 'moved', '2026-09-28T11:20:00.000Z', 'week', 'day'),
  event(9, 'moved', '2026-10-02T14:08:00.000Z', 'day', 'week'),
  event(10, 'moved', '2026-10-04T23:26:00.000Z', 'week', 'day'),
  event(11, 'rolled_over', '2026-10-05T15:06:00.000Z', 'week', 'week'),
  event(12, 'moved', '2026-10-06T11:44:00.000Z', 'day', 'week'),
]

it('folds the sample story into rollovers, the longest stay, and week marks', () => {
  const insight = activityInsight(story, 'UTC', '2026-10-06')
  expect(insight.counted).toBe(12)
  expect(insight.rollovers).toBe(3)
  expect(insight.stay).toEqual({ horizon: 'week', days: 22 })
  expect(insight.openDays).toBe(34)
  expect(insight.reopened).toEqual({ doneOn: '2026-09-23', againOn: '2026-09-24' })
  expect(insight.marks).toEqual({
    '2026-09-07': 'move',
    '2026-09-14': 'rollover',
    '2026-09-21': 'rollover',
    '2026-09-28': 'move',
    '2026-10-04': 'move',
    '2026-10-05': 'rollover',
  })
  expect(insight.firstMonth).toBe('2026-09-01')
  expect(insight.lastMonth).toBe('2026-10-01')
})

it('drops an undone rollover from the count and the calendar', () => {
  const undone = event(3, 'rolled_over', '2026-09-14T08:02:00.000Z', 'week', 'week', 'todo', 'rollover-op')
  const undo: ActivityEvent = { ...event(4, 'undo', '2026-09-14T09:00:00.000Z', 'week', 'week'), undoOf: 'rollover-op', operationId: 'undo-op' }
  const insight = activityInsight([story[0]!, story[1]!, undone, undo], 'UTC', '2026-09-14')
  expect(insight.rollovers).toBe(0)
  expect(insight.marks['2026-09-14']).toBeUndefined()
  expect(insight.counted).toBe(2)
})

it('builds a Monday-start month with the first weekday empty', () => {
  const september = activityMonthGrid('2026-09-01', 1)
  expect(september[0]).toBeNull()
  expect(september.filter(Boolean)).toHaveLength(30)
  expect(september[1]).toBe('2026-09-01')
  const october = activityMonthGrid('2026-10-01', 1)
  expect(october.slice(0, 3)).toEqual([null, null, null])
  expect(october[3]).toBe('2026-10-01')
})
