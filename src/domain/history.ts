/**
 * [INPUT]: 某一条目的有序真实事件、固定周期边界。
 * [OUTPUT]: 成员身份、期末状态与后来事件；回拨或缺失历史明确 unknown。
 * [POS]: 无存储依赖的历史投影库，不从当前状态推测过去。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { compareInstants, type Period } from './calendar'
import type { BusinessState, ItemEvent } from '../shared/contracts/effects'

export function projectHistory(events: ItemEvent[], period: Period): { member: boolean; endState: BusinessState | null; later: ItemEvent[]; anomalous: boolean } {
  const ordered = [...events].sort((a, b) => a.seq - b.seq)
  const member = ordered.some(event => event.before?.periodId === period.id || event.after.periodId === period.id)
  const anomalous = ordered.some((event, index) => index > 0 && compareInstants(event.at, ordered[index - 1]!.at) < 0)
  const beforeEnd = ordered.filter(event => compareInstants(event.at, period.endAt) < 0)
  return { member, endState: anomalous ? null : beforeEnd.at(-1)?.after ?? null,
    later: ordered.filter(event => compareInstants(event.at, period.endAt) >= 0), anomalous }
}
