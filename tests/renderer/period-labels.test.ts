import { expect, it } from 'vitest'
import { cycleOptionLabel } from '../../src/renderer/features/board/period-labels'

it('adds years only to endpoints outside the supplied workspace year', () => {
  expect(cycleOptionLabel({ startDate: '2026-12-23', endDate: '2027-03-23' }, '2026-10-02')).toBe('12/23 – 27/3/22')
  expect(cycleOptionLabel({ startDate: '2026-09-23', endDate: '2026-12-23' }, '2026-10-02')).toBe('9/23 – 12/22')
  expect(cycleOptionLabel({ startDate: '2027-03-23', endDate: '2027-06-23' }, '2026-10-02')).toBe('27/3/23 – 6/22')
})
