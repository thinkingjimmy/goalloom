/**
 * [INPUT]: Lightweight storage metadata, bounded candidate queries, source text and reference time.
 * [OUTPUT]: Current generation and SmartContext with at most eight versioned parent candidates.
 * [POS]: Only smart-service workspace reader; no descriptions, history or database ownership during HTTP waits.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { workspaceDate } from '../../domain/calendar'
import type { SmartContext } from '../../domain/smart/questions'
import type { ItemSummary } from '../../shared/contracts/entities'
import type { ItemPage, Snapshot, WorkspaceMetadata } from '../../shared/contracts/queries'
import type { Candidate } from '../../shared/contracts/smart-input'
import type { StorageClient } from '../storage/client'
import type { WorkspaceReader } from './service'

export const candidateLimit = 8
const weekdayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
const quoted = /[「『“"【]([^」』”"】]{1,80})[」』”"】]/g

export function storageReader(storage: () => StorageClient): WorkspaceReader {
  const snapshot = () => storage().call<Snapshot>('query', { type: 'snapshot' })
  return {
    generation: async () => (await storage().call<WorkspaceMetadata>('metadata')).workspace.generation,
    async context(text, hints, referenceTime) {
      const current = await snapshot()
      const calendar = current.workspace.calendar
      if (!calendar || !current.workspace.setupConfirmedAt) return null
      const phrases = [...text.matchAll(quoted)].map(match => match[1]!.trim()).filter(Boolean)
      const searched = (await Promise.all(phrases.map(query => storage().call<ItemPage>('query', { type: 'list', view: 'search', query, offset: 0, limit: 5 }).catch(() => ({ items: [], total: 0 }))))).flatMap(page => page.items)
      const named = (item: ItemSummary) => phrases.some(phrase => phrase === item.title) || (item.title.trim().length >= 2 && text.includes(item.title.trim()))
      // --- Priority: explicitly named, then user-picked parents, then flow roots; never the whole library. ---
      const ordered = new Map<string, ItemSummary>()
      for (const item of [...searched, ...current.items].filter(named)) ordered.set(item.id, item)
      for (const id of [...hints, ...current.flows.map(flow => flow.id)]) {
        if (ordered.size >= candidateLimit || ordered.has(id)) continue
        const item = await storage().call<ItemSummary | null>('candidate', id).catch(() => null)
        if (item) ordered.set(id, item)
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
