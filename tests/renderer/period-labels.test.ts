import { expect, it } from 'vitest'
import { cycleOptionLabel } from '../../src/renderer/features/board/period-labels'

it('跨年的三个月选项在结束日带两位年份，同一年不标年份', () => {
  expect(cycleOptionLabel({ startDate: '2026-12-23', endDate: '2027-03-23' })).toBe('12/23 – 27/3/22')
  expect(cycleOptionLabel({ startDate: '2026-09-23', endDate: '2026-12-23' })).toBe('9/23 – 12/22')
  expect(cycleOptionLabel({ startDate: '2027-03-23', endDate: '2027-06-23' })).toBe('3/23 – 6/22')
})
