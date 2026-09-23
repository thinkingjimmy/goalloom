import { describe, expect, it } from 'vitest'
import { currentPeriod } from '../../src/domain/calendar'
import { canRollover, isBacklog, undoHold, type Candidate, type RolloverContext } from '../../src/domain/rollover'

const calendar = { id: 'cal', timezone: 'Asia/Shanghai', weekStart: 1 }
const september = currentPeriod(calendar, 'month', '2026-09-20T00:00:00Z')
const october = currentPeriod(calendar, 'month', '2026-10-20T00:00:00Z')
const now = '2026-11-20T00:00:00Z'
const current = currentPeriod(calendar, 'month', now)
const item: Candidate = { status: 'todo', archivedAt: null, deletedAt: null, period: september, holdPeriodId: null }
const context: RolloverContext = { clock: { now: () => now }, current, mode: 'auto', effectiveFrom: september, setupConfirmed: true, maintenance: false, pausedAfterRestore: false }

describe('往期候选与 hold', () => {
  it('长时间退出直接从9月至当前，不制造中间周期', () => expect(canRollover(item, context)).toBe(true))
  it('开启 auto 不清理生效前积压，但往期入口仍可见', () => {
    expect(canRollover(item, { ...context, effectiveFrom: october })).toBe(false)
    expect(isBacklog(item, now)).toBe(true)
  })
  it.each([{ mode: 'manual' }, { setupConfirmed: false }, { maintenance: true }, { pausedAfterRestore: true }] as const)('拒绝自动处理 %j', override => {
    expect(canRollover(item, { ...context, ...override })).toBe(false)
    expect(isBacklog(item, now)).toBe(true)
  })
  it.each([{ status: 'done' }, { status: 'cancelled' }, { archivedAt: now }, { deletedAt: now }, { period: null }] as const)('排除 %j', override => {
    expect(canRollover({ ...item, ...override }, context)).toBe(false)
    expect(isBacklog({ ...item, ...override }, now)).toBe(false)
  })
  it('撤销 hold 不依赖 auto，当前周期保留，下一周期失效', () => {
    const held = { ...item, holdPeriodId: undoHold(item, current, now) }
    expect(held.holdPeriodId).toBe(current.id)
    expect(canRollover(held, context)).toBe(false)
    expect(isBacklog(held, now)).toBe(true)
    const nextNow = '2026-12-01T00:00:00Z'
    expect(canRollover(held, { ...context, clock: { now: () => nextNow }, current: currentPeriod(calendar, 'month', nextNow) })).toBe(true)
  })
  it('当前和 Later 不需要 hold，时钟回拨不向错误目标移动', () => {
    expect(undoHold({ ...item, period: current }, current, now)).toBeNull()
    expect(undoHold({ ...item, period: null }, current, now)).toBeNull()
    expect(canRollover(item, { ...context, clock: { now: () => '2026-10-01T00:00:00Z' } })).toBe(false)
  })
})
