import { describe, expect, it } from 'vitest'
import { currentPeriod, validateCalendar, workspaceDate } from '../../src/domain/calendar'

const calendar = { id: 'calendar-1', timezone: 'Asia/Shanghai', weekStart: 1 }
describe('固定工作区日历', () => {
  it('日界时刻属于下一天，结束日不包含', () => {
    const previous = currentPeriod(calendar, 'day', '2026-09-22T15:59:59Z')
    const current = currentPeriod(calendar, 'day', '2026-09-22T16:00:00Z')
    expect(previous.endAt).toBe(current.startAt)
    expect(current.startDate).toBe('2026-09-23')
    expect(workspaceDate(calendar.timezone, current.startAt)).toBe('2026-09-23')
  })
  it('跨年周按起始日期标识，可修改周起始日', () => {
    expect(currentPeriod(calendar, 'week', '2027-01-01T12:00:00Z').startDate).toBe('2026-12-28')
    expect(currentPeriod({ ...calendar, weekStart: 7 }, 'week', '2027-01-01T12:00:00Z').startDate).toBe('2026-12-27')
  })
  it.each(['2024-02-29', '2026-02-28'])('闰年/月末 %s 按自然月结束', date => {
    expect(currentPeriod(calendar, 'month', `${date}T12:00:00Z`).endDate).toBe(`${date.slice(0, 4)}-03-01`)
  })
  it.each([['2026-03-08', 23], ['2026-11-01', 25]] as const)('DST 的 %s 有 %i 小时', (date, hours) => {
    const period = currentPeriod({ ...calendar, timezone: 'America/New_York' }, 'day', `${date}T12:00:00Z`)
    expect((Date.parse(period.endAt) - Date.parse(period.startAt)) / 3600000).toBe(hours)
  })
  it('调用不依赖系统时区或全局时钟', () => {
    const original = process.env.TZ
    try {
      process.env.TZ = 'Asia/Karachi'
      const west = currentPeriod(calendar, 'day', '2026-09-22T17:00:00Z')
      process.env.TZ = 'Pacific/Noumea'
      expect(currentPeriod(calendar, 'day', '2026-09-22T17:00:00Z')).toEqual(west)
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
  })
  it('拒绝无效周起始日和固定偏移冒充 IANA 时区', () => {
    expect(() => validateCalendar({ ...calendar, weekStart: 0 })).toThrow()
    expect(() => validateCalendar({ ...calendar, timezone: '+08:00' })).toThrow()
    expect(() => validateCalendar({ ...calendar, timezone: 'Missing/Zone' })).toThrow()
  })
})
