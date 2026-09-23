/**
 * [INPUT]: 已校验的状态时间组与调用者注入的真实时刻。
 * [OUTPUT]: 独立状态转换、状态效果匹配与保留其他字段的逆向差量。
 * [POS]: 领域库的状态原语；生命周期、回执和事务保护由命令层负责。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
export interface StatusGroup {
  status: 'todo' | 'done' | 'cancelled'
  completedAt: string | null
  cancelledAt: string | null
}

export function changeStatus(status: StatusGroup['status'], observedAt: string): StatusGroup {
  return { status, completedAt: status === 'done' ? observedAt : null, cancelledAt: status === 'cancelled' ? observedAt : null }
}

export function matchesStatus(current: StatusGroup, expected: StatusGroup): boolean {
  return current.status === expected.status && current.completedAt === expected.completedAt && current.cancelledAt === expected.cancelledAt
}

export function reverseStatus<T extends StatusGroup>(current: T, before: StatusGroup, after: StatusGroup): T | null {
  if (!matchesStatus(current, after)) return null
  return { ...current, status: before.status, completedAt: before.completedAt, cancelledAt: before.cancelledAt }
}
