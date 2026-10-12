/**
 * [INPUT]: 注入的时钟、已经校验的当前/来源周期、状态、策略与暂停标记。
 * [OUTPUT]: 往期可发现性、自动候选和撤销 hold；纯判断，不执行调期。
 * [POS]: M1 领域契约；权威事务后续必须重读状态并再次调用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { compareInstants, type Clock, type Period } from './calendar'

export interface Candidate {
  status: 'todo' | 'done' | 'cancelled'
  archivedAt: string | null
  deletedAt: string | null
  period: Period | null
  holdPeriodId: string | null
}
export interface RolloverContext {
  clock: Clock
  current: Period
  mode: 'auto' | 'manual'
  effectiveFrom: Period
  setupConfirmed: boolean
  maintenance: boolean
  pausedAfterRestore: boolean
}

export function isBacklog(item: Candidate, observedAt: string): boolean {
  return item.status === 'todo' && item.archivedAt === null && item.deletedAt === null && item.period !== null && compareInstants(item.period.endAt, observedAt) <= 0
}

export function canRollover(item: Candidate, context: RolloverContext): boolean {
  const observedAt = context.clock.now()
  return context.setupConfirmed && !context.maintenance && !context.pausedAfterRestore && context.mode === 'auto'
    && isBacklog(item, observedAt) && item.period?.horizon === context.current.horizon
    && context.effectiveFrom.horizon === context.current.horizon
    && compareInstants(context.current.startAt, observedAt) <= 0 && compareInstants(observedAt, context.current.endAt) < 0
    && compareInstants(item.period.startAt, context.effectiveFrom.startAt) >= 0
    && item.holdPeriodId !== context.current.id
}

export function undoHold(item: Candidate, current: Period, observedAt: string): string | null {
  // --- hold 与策略、归档和删除无关，只由撤销后的状态/位置派生。 ---
  const expiredTodo = item.status === 'todo' && item.period !== null && compareInstants(item.period.endAt, observedAt) <= 0
  return expiredTodo && item.period?.horizon === current.horizon ? current.id : null
}
