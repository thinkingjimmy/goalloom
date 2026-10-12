/**
 * [INPUT]: Chinese calendar phrases, explicit dates and rolling/natural configuration.
 * [OUTPUT]: Boundary regressions for actual phrase ranges and current/future/expired classification.
 * [POS]: Calendar phrase regression boundary for the Jev context and preview.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { expect, it } from 'vitest'
import { parseCalendarPhrases } from '../../src/domain/smart/calendar-phrases'
import type { Calendar } from '../../src/domain/calendar'

const config = (mode: 'rolling' | 'natural', anchor = '2026-01-01'): Calendar => ({ id: 'c', timezone: 'UTC', weekStart: 1, mode, cycleAnchor: anchor })
it.each([
  ['natural', '2026-06-30', '上半年完成', 'half', '2026-01-01', '2026-07-01'],
  ['natural', '2026-06-30', '下半年完成', 'future', '2026-07-01', '2027-01-01'],
  ['natural', '2026-07-01', '下半年完成', 'half', '2026-07-01', '2027-01-01'],
  ['natural', '2026-07-01', '上半年完成', 'unclear', '2026-01-01', '2026-07-01'],
  ['natural', '2026-12-31', '下半年完成', 'half', '2026-07-01', '2027-01-01'],
  ['natural', '2027-01-01', '上半年完成', 'half', '2027-01-01', '2027-07-01'],
  ['natural', '2026-10-02', '明年上半年完成', 'future', '2027-01-01', '2027-07-01'],
  ['natural', '2026-10-02', '下个半年完成', 'future', '2027-01-01', '2027-07-01'],
  ['rolling', '2026-06-30', '下半年完成', 'future', '2026-07-01', '2027-01-01'],
  ['rolling', '2026-07-01', '上半年完成', 'unclear', '2026-01-01', '2026-07-01'],
] as const)('resolves %s / %s / %s from the supplied calendar', (mode, today, text, horizon, startDate, endDate) => {
  expect(parseCalendarPhrases(text, config(mode), today)).toEqual([{ text, horizon, startDate, endDate }].map(value => ({ ...value, text: text.replace('完成', '') })))
})
it('maps a natural half to the containing rolling horizon and keeps current/future distinct', () => {
  const calendar = config('rolling', '2026-04-02')
  expect(parseCalendarPhrases('下半年完成', calendar, '2026-10-02')[0]).toMatchObject({ horizon: 'half', endDate: '2027-01-01' })
  expect(parseCalendarPhrases('下半年完成', config('rolling', '2026-03-01'), '2026-07-01')[0]).toMatchObject({ horizon: 'year' })
  expect(parseCalendarPhrases('今年推进；这半年推进；下个半年推进；明年推进', calendar, '2026-10-02').map(p => p.horizon)).toEqual(['year', 'half', 'future', 'future'])
  expect(parseCalendarPhrases('No Chinese time phrase', calendar, '2026-10-02')).toEqual([])
})
