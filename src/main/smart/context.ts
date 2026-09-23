/**
 * [INPUT]: StorageClient 的短只读查询（snapshot/item/list 搜索）、原文、用户选的上级提示与 referenceTime。
 * [OUTPUT]: storageReader：当前 generation 与 SmartContext（工作区日期、当前周期范围、≤8 个已有候选：显式点名/引号搜索/用户提示/流程根，含位置状态与预览版本）。
 * [POS]: 智能服务读取工作区的唯一通道；每次查询取得快照即释放存储队列，HTTP 等待期间不持有任何 SQLite 资源；不发送说明、历史、回收站或整库。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { workspaceDate } from '../../domain/calendar'
import type { SmartContext } from '../../domain/smart/questions'
import type { Item } from '../../shared/contracts/entities'
import type { ItemDetail, ItemPage, Snapshot } from '../../shared/contracts/queries'
import type { Candidate } from '../../shared/contracts/smart-input'
import type { StorageClient } from '../storage/client'
import type { WorkspaceReader } from './service'

export const candidateLimit = 8
const weekdayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
const quoted = /[「『“"【]([^」』”"】]{1,80})[」』”"】]/g

export function storageReader(storage: () => StorageClient): WorkspaceReader {
  const snapshot = () => storage().call<Snapshot>('query', { type: 'snapshot' })
  return {
    generation: async () => (await snapshot()).workspace.generation,
    async context(text, hints, referenceTime) {
      const current = await snapshot()
      const calendar = current.workspace.calendar
      if (!calendar || !current.workspace.setupConfirmedAt) return null
      const phrases = [...text.matchAll(quoted)].map(match => match[1]!.trim()).filter(Boolean)
      const searched = (await Promise.all(phrases.map(query => storage().call<ItemPage>('query', { type: 'list', view: 'search', query, offset: 0, limit: 5 }).catch(() => ({ items: [], total: 0 }))))).flatMap(page => page.items)
      const named = (item: Item) => phrases.some(phrase => phrase === item.title) || (item.title.trim().length >= 2 && text.includes(item.title.trim()))
      // --- Priority: explicitly named, then user-picked parents, then flow roots; never the whole library. ---
      const ordered = new Map<string, Item>()
      for (const item of [...searched, ...current.items].filter(named)) ordered.set(item.id, item)
      for (const id of [...hints, ...current.flows.map(flow => flow.id)]) {
        if (ordered.size >= candidateLimit || ordered.has(id)) continue
        const detail = await storage().call<ItemDetail>('query', { type: 'item', itemId: id }).catch(() => null)
        if (detail) ordered.set(id, detail.item)
      }
      const candidates: Candidate[] = [...ordered.values()].filter(item => item.deletedAt === null).slice(0, candidateLimit).map((item, index) => ({
        ref: `g${index + 1}`, itemId: item.id, title: item.title, status: item.status, horizon: item.placement.horizon,
        archived: item.archivedAt !== null, flowColor: item.flowColor, version: item.version, named: named(item),
      }))
      const referenceDate = workspaceDate(calendar.timezone, referenceTime)
      const dayOfWeek = new Date(`${referenceDate}T00:00:00Z`).getUTCDay() || 7
      const periods = Object.fromEntries(current.periods.map(period => [period.horizon, { id: period.id, startDate: period.startDate, endDate: period.endDate }])) as SmartContext['periods']
      return { text, referenceDate, weekdayName: weekdayNames[dayOfWeek]!, timezone: calendar.timezone, weekStart: calendar.weekStart, periods, candidates }
    },
  }
}
