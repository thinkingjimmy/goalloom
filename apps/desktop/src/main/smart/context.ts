/**
 * [INPUT]: Workspace snapshot, bounded candidate queries, source text and reference time; calendar loads on use.
 * [OUTPUT]: Current/future goal and root-task summaries, placement guards and direct DAG context without a fixed candidate cutoff.
 * [POS]: Only smart-service workspace reader; no descriptions, history or database ownership during HTTP waits.
 */
import type { ItemSummary } from '../../shared/contracts/entities'
import type { BoardPeriods, ItemPage, Snapshot, WorkspaceMetadata } from '../../shared/contracts/queries'
import type { Candidate } from '../../shared/contracts/smart-input'
import type { StorageClient } from '../storage/client'
import { mapPeriodHorizons, periodHorizons } from '../../shared/contracts/values'
import { mayParent } from '../../domain/relations'
import type { WorkspaceReader } from './service'

const weekdayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
const quoted = /[「『“"【]([^」』”"】]{1,80})[」』”"】]/g

export function storageReader(storage: () => StorageClient): WorkspaceReader {
  const snapshot = () => storage().call<Snapshot>('query', { type: 'snapshot' })
  return {
    insightEvidence: (itemId, generation, cutoff) => storage().call('query', { type: 'insightTaskContext', itemId, generation, ...(cutoff ? { cutoff } : {}) }),
    assistance: (itemId, generation) => storage().call('query', { type: 'assistanceContext', itemId, generation }),
    generation: async () => (await storage().call<WorkspaceMetadata>('metadata')).workspace.generation,
    async context(text, hints, referenceTime, target) {
      const { currentPeriod, workspaceDate, parseDate } = await import('../../domain/calendar')
      const current = await snapshot()
      const calendar = current.workspace.calendar
      if (!calendar || !current.workspace.setupConfirmedAt) return null
      let future: BoardPeriods | null = null
      if (target && target.horizon !== 'later' && target.startDate && target.startDate > current.periods.find(period => period.horizon === target.horizon)!.startDate) {
        const at = parseDate(target.startDate).toZonedDateTime(calendar.timezone).toInstant().toString()
        const periods = periodHorizons.filter(horizon => horizon === target.horizon || mayParent(horizon, target.horizon))
          .map(horizon => ({ horizon, startDate: currentPeriod(calendar, horizon, at).startDate }))
        future = await storage().call<BoardPeriods>('query', { type: 'boardPeriods', generation: current.workspace.generation, periods })
      }
      const board = [...new Map([...current.items, ...(future?.items ?? [])].map(item => [item.id, item])).values()]
      const phrases = [...text.matchAll(quoted)].map(match => match[1]!.trim()).filter(Boolean)
      const searched = (await Promise.all(phrases.map(query => storage().call<ItemPage>('query', { type: 'list', view: 'search', query, offset: 0, limit: 5 }).catch(() => ({ items: [], total: 0 }))))).flatMap(page => page.items)
      const named = (item: ItemSummary) => phrases.some(phrase => phrase === item.title) || (item.title.trim().length >= 2 && text.includes(item.title.trim()))
      const ordered = new Map<string, ItemSummary>()
      for (const item of [...searched, ...board].filter(named)) ordered.set(item.id, item)
      for (const id of hints) {
        if (ordered.has(id)) continue
        const item = await storage().call<ItemSummary | null>('candidate', id).catch(() => null)
        if (item) ordered.set(id, item)
      }
      for (const item of board) if (item.placement.horizon !== 'later' && item.status === 'todo' && !item.archivedAt && !ordered.has(item.id)) ordered.set(item.id, item)
      const relations = [...current.relations, ...(current.nesting ?? [])]
      const labels = new Map([...board, ...ordered.values()].map(item => [item.id, { itemId: item.id, title: item.title }]))
      const missing = [...new Set(relations.flatMap(edge => [
        ...(ordered.has(edge.childId) && !labels.has(edge.parentId) ? [edge.parentId] : []),
        ...(ordered.has(edge.parentId) && !labels.has(edge.childId) ? [edge.childId] : []),
      ]))]
      for (let offset = 0; offset < missing.length; offset += 1000) {
        const rows = await storage().call<{ itemId: string; title: string }[]>('candidateLabels', missing.slice(offset, offset + 1000))
        for (const row of rows) labels.set(row.itemId, row)
      }
      const parents = new Map<string, { itemId: string; title: string }[]>(), children = new Map<string, { itemId: string; title: string }[]>()
      for (const edge of relations) {
        if (labels.has(edge.parentId)) { const rows = parents.get(edge.childId) ?? []; rows.push(labels.get(edge.parentId)!); parents.set(edge.childId, rows) }
        if (labels.has(edge.childId)) { const rows = children.get(edge.parentId) ?? []; rows.push(labels.get(edge.childId)!); children.set(edge.parentId, rows) }
      }
      const candidates: Candidate[] = [...ordered.values()].filter(item => item.deletedAt === null).map((item, index) => ({
        ref: `g${index + 1}`, itemId: item.id, title: item.title, status: item.status, horizon: item.placement.horizon,
        archived: item.archivedAt !== null, flowColor: item.flowColor, version: item.version, periodId: item.placement.periodId, named: named(item),
        placementVersion: item.placement.version, nestingParentId: item.placement.nestingParentId ?? null,
        parents: parents.get(item.id) ?? [], children: children.get(item.id) ?? [],
      }))
      const referenceDate = workspaceDate(calendar.timezone, referenceTime)
      const dayOfWeek = new Date(`${referenceDate}T00:00:00Z`).getUTCDay() || 7
      const periods = mapPeriodHorizons(horizon => { const period = currentPeriod(calendar, horizon, referenceTime); return { id: period.id, startDate: period.startDate, endDate: period.endDate } })
      const targetPeriod = future?.periods.find(period => period.horizon === target?.horizon)
      return { text, referenceDate, weekdayName: weekdayNames[dayOfWeek]!, timezone: calendar.timezone, weekStart: calendar.weekStart, calendar, periods, candidates, relations, ...(targetPeriod ? { targetPeriod } : {}) }
    },
  }
}
