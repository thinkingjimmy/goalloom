import { expect, it } from 'vitest'
import { activityMonthGrid } from '../../src/renderer/features/items/activity-insight'

it('builds a Monday-start month with the first weekday empty', () => {
  const september = activityMonthGrid('2026-09-01', 1)
  expect(september[0]).toBeNull()
  expect(september.filter(Boolean)).toHaveLength(30)
  expect(september[1]).toBe('2026-09-01')
  const october = activityMonthGrid('2026-10-01', 1)
  expect(october.slice(0, 3)).toEqual([null, null, null])
  expect(october[3]).toBe('2026-10-01')
})
