/**
 * [INPUT]: One indexed item, event/operation/undo metadata, calendar and injected observation time.
 * [OUTPUT]: Cached shared facts and exact half-open local date activity pages with revision-bound frozen upper sequences.
 * [POS]: Worker read adapter; reads are bounded and never create periods, writes or network requests.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHash } from 'node:crypto'
import { prepareExecutionFacts, projectExecutionFacts, classifyExecutionEvent, type ExecutionInput, type ExecutionProjection } from '../../domain/execution-facts'
import { compareInstants, parseDate, workspaceDate } from '../../domain/calendar'
import { indexExecutionHistory, replayExecutionGuidance } from '../../domain/execution-history'
import { DomainError } from '../../shared/contracts/commands'
import type { Query } from '../../shared/contracts/queries'
import type { ActivityEntries, ActivityMonth, ExecutionFacts } from '../../shared/contracts/execution'
import type { Operation } from '../../shared/contracts/effects'
import type { Store } from '../storage/store'
import { serverText } from '../../shared/i18n/server'

export const executionEventBudget = 5000, executionEffectBudget = 20_000
interface CachedInput { input: ExecutionInput | null; projection: ExecutionProjection; baselineCutoff: string; highWater: string; bytes: number }
export class ExecutionQueries {
  private cache = new Map<string, CachedInput>()
  scans = 0
  constructor(private readonly store: Store) {
    // SQLite julianday rounds sub-millisecond instants across local date and cutoff boundaries.
    store.db.function('execution_instant_order', { deterministic: true }, (a, b) => compareInstants(String(a), String(b)))
  }
  clear(): void { this.cache.clear() }
  revision(itemId: string, generation: string, cutoff?: string): string {
    const workspace = this.store.workspace()
    if (workspace.generation !== generation) throw new DomainError('generation', serverText().errors.workspaceReplaced)
    if (cutoff) {
      const row = this.store.prepare('SELECT seq FROM item_events WHERE itemId=? AND execution_instant_order(at,?)<0 ORDER BY seq DESC LIMIT 1').get(itemId, cutoff)
      return createHash('sha256').update(JSON.stringify([generation, workspace.calendar, this.store.item(itemId).createdAt, cutoff, row?.seq ?? null])).digest('hex')
    }
    const item = this.store.item(itemId), guidance = this.store.guidance(itemId)
    const tail = this.store.prepare('SELECT seq FROM item_events WHERE itemId=? ORDER BY seq DESC LIMIT 1').get(itemId)?.seq ?? 0
    return createHash('sha256').update(JSON.stringify([generation, workspace.calendar, workspace.clockAnomaly, item.status, item.archivedAt, item.deletedAt,
      item.dueDate, item.createdAt, item.placement, guidance?.revision ?? 0, tail])).digest('hex')
  }
  summary(query: Extract<Query, { type: 'executionSummary' }>, now: string): ExecutionFacts {
    const revision = this.revision(query.itemId, query.generation, query.cutoff)
    const cutoff = query.cutoff ?? now, historical = query.cutoff !== undefined
    if (compareInstants(cutoff, now) > 0) throw new DomainError('invalid', serverText().errors.invalidPlanningPeriod)
    const key = `${query.generation}:${query.itemId}:${historical ? cutoff : 'current'}`
    let cached = this.cache.get(key)
    const rolledBack = !historical && !!cached && compareInstants(cutoff, cached.highWater) < 0
    if (rolledBack || !cached || cached.projection.facts.sourceRevision !== revision || cached.projection.facts.coverage.quality === 'anomalous' || compareInstants(cutoff, cached.baselineCutoff) < 0) {
      const input = this.read(query.itemId, query.generation, revision, historical ? cutoff : undefined)
      if (!historical) input.clockAnomaly = rolledBack || this.store.workspace().clockAnomaly
      const highWater = cached && !historical && cached.projection.facts.sourceRevision === revision && compareInstants(cached.highWater, cutoff) > 0 ? cached.highWater : cutoff
      const projection = prepareExecutionFacts(input, cutoff, historical)
      cached = { input: historical ? input : null, projection, baselineCutoff: cutoff, highWater, bytes: Buffer.byteLength(JSON.stringify(historical ? [input, projection] : projection)) }
      this.cache.delete(key)
      while (this.cache.size && (this.cache.size >= 16 || [...this.cache.values()].reduce((sum, row) => sum + row.bytes, 0) + cached.bytes > 32 * 1024 * 1024)) this.cache.delete(this.cache.keys().next().value!)
      this.cache.set(key, cached)
    }
    if (!historical && compareInstants(cutoff, cached.highWater) > 0) cached.highWater = cutoff
    return projectExecutionFacts(cached.projection, cutoff)
  }
  insightContext(query: Extract<Query, { type: 'insightTaskContext' }>, now: string) {
    const facts = this.summary({ ...query, type: 'executionSummary' }, now)
    if (!query.cutoff) return { itemId: query.itemId, cutoff: null, executionFacts: facts, guidance: { value: this.store.guidance(query.itemId)?.value ?? null, quality: 'complete' as const, reason: null } }
    const cached = this.cache.get(`${query.generation}:${query.itemId}:${query.cutoff}`)!
    const { value, known } = replayExecutionGuidance(cached.input!.events, indexExecutionHistory(cached.input!))
    return { itemId: query.itemId, cutoff: query.cutoff, executionFacts: facts, guidance: { value: known ? value : null, quality: known ? 'complete' as const : 'unknown' as const, reason: known ? null : 'incomplete_guidance_history' } }
  }
  private read(itemId: string, generation: string, sourceRevision: string, cutoff?: string): ExecutionInput {
    this.scans++
    const item = this.store.item(itemId), workspace = this.store.workspace()
    if (!workspace.calendar) throw new DomainError('setup', serverText().errors.setupRequired)
    const rows = this.store.prepare(`SELECT * FROM item_events WHERE itemId=? ${cutoff ? 'AND execution_instant_order(at,?)<0' : ''} ORDER BY seq DESC LIMIT ?`)
      .all(itemId, ...(cutoff ? [cutoff] : []), executionEventBudget + 1)
    const scanLimited = rows.length > executionEventBudget
    const events = this.store.eventRows(rows.slice(0, executionEventBudget).reverse()).filter(event => !cutoff || compareInstants(event.at, cutoff) < 0)
    const metadata = this.metadata(events.flatMap(event => event.undoOf ? [event.operationId, event.undoOf] : [event.operationId]), events.flatMap(event => [event.before?.periodId ?? null, event.after.periodId]))
    return { item, generation, sourceRevision, calendar: workspace.calendar, guidance: this.store.guidance(itemId),
      events, ...metadata, scanLimited }
  }
  private metadata(operationIds: string[], periodIds: (string | null)[]) {
    const operations: Operation[] = [], undo: ExecutionInput['undo'] = []
    let effects = 0, bytes = 0, effectsLimited = false
    for (const id of new Set(operationIds)) {
      const row = this.store.prepare('SELECT length(effects) AS bytes FROM operations WHERE id=?').get(id)
      bytes += Number(row?.bytes ?? 0)
      if (bytes > 4 * 1024 * 1024) { effectsLimited = true; continue }
      const operation = this.store.operation(id)
      if (!operation) continue
      effects += operation.effects.length
      if (effects > executionEffectBudget) { effectsLimited = true; continue }
      operations.push(operation)
      const markers = this.store.prepare(`SELECT u.*,o.at,(SELECT min(e.seq) FROM item_events e WHERE e.operationId=u.undoId) AS seq
        FROM undo_effects u JOIN operations o ON o.id=u.undoId WHERE u.originalId=?`).all(id)
      for (const marker of markers) undo.push({ originalId: id, effectIndex: Number(marker.effectIndex), undoId: String(marker.undoId), at: String(marker.at), seq: Number(marker.seq) })
    }
    const periods = [...new Set(periodIds.filter((id): id is string => !!id))].flatMap(id => {
      try { return [this.store.period(id)] } catch { return [] }
    })
    return { operations, periods, undo, effectsLimited }
  }
  month(query: Extract<Query, { type: 'activityMonth' }>, now: string): ActivityMonth {
    const sourceRevision = this.revision(query.itemId, query.generation), calendar = this.store.workspace().calendar!
    const start = parseDate(query.month)
    if (start.day !== 1) throw new DomainError('invalid', serverText().errors.invalidPlanningPeriod)
    const end = start.add({ months: 1 })
    const startAt = start.toZonedDateTime(calendar.timezone).toInstant().toString(), endAt = end.toZonedDateTime(calendar.timezone).toInstant().toString()
    // Group on the indexed item's operation instants in SQL; no full history crosses IPC.
    const rows = this.store.prepare(`SELECT at,type FROM item_events WHERE itemId=? AND execution_instant_order(at,?)>=0 AND execution_instant_order(at,?)<0 AND execution_instant_order(at,?)<=0 ORDER BY seq LIMIT ?`)
      .all(query.itemId, startAt, endAt, now, executionEventBudget + 1)
    if (rows.length > executionEventBudget) throw new DomainError('read', serverText().errors.fileTooLarge)
    const dates = new Map<string, ActivityMonth['dates'][number]>()
    for (const row of rows) {
      const date = workspaceDate(calendar.timezone, String(row.at)), entry = dates.get(date) ?? { date, total: 0, categories: [] }
      const category = row.type === 'guidance_changed' ? 'guidance' : ['moved', 'rolled_over'].includes(String(row.type)) ? 'placement_change' : 'state'
      entry.total++; if (!entry.categories.includes(category)) entry.categories.push(category)
      dates.set(date, entry)
    }
    return { generation: query.generation, itemId: query.itemId, sourceRevision, asOf: now, month: query.month, dates: [...dates.values()].sort((a, b) => a.date.localeCompare(b.date)) }
  }
  page(query: Extract<Query, { type: 'activityDay' | 'activityPage' }>, now: string): ActivityEntries {
    const sourceRevision = this.revision(query.itemId, query.generation), selection = query.type === 'activityDay' ? query.date : 'all'
    const cursor = query.cursor
    if (cursor && (cursor.generation !== query.generation || cursor.itemId !== query.itemId || cursor.sourceRevision !== sourceRevision || cursor.selection !== selection)) throw new DomainError('stale', serverText().errors.itemChanged)
    const asOf = cursor?.asOf ?? now, upperSeq = cursor?.upperSeq ?? Number(this.store.prepare('SELECT max(seq) AS seq FROM item_events WHERE itemId=?').get(query.itemId)?.seq ?? 0)
    const calendar = this.store.workspace().calendar!
    const start = query.type === 'activityDay' ? parseDate(query.date) : null
    const startAt = start?.toZonedDateTime(calendar.timezone).toInstant().toString(), endAt = start?.add({ days: 1 }).toZonedDateTime(calendar.timezone).toInstant().toString()
    const rows = this.store.prepare(`SELECT * FROM item_events WHERE itemId=? AND seq<=? AND seq<? AND execution_instant_order(at,?)<=0 ${start ? 'AND execution_instant_order(at,?)>=0 AND execution_instant_order(at,?)<0' : ''} ORDER BY seq DESC LIMIT ?`)
      .all(query.itemId, upperSeq, cursor?.beforeSeq ?? Number.MAX_SAFE_INTEGER, asOf, ...(start ? [startAt!, endAt!] : []), query.limit + 1)
    const events = this.store.eventRows(rows.slice(0, query.limit))
    const metadata = this.metadata(events.map(event => event.operationId), events.flatMap(event => [event.before?.periodId ?? null, event.after.periodId]))
    const history = indexExecutionHistory(metadata)
    return { generation: query.generation, itemId: query.itemId, sourceRevision, asOf, selection,
      entries: events.map(event => ({ event: event as ActivityEntries['entries'][number]['event'], evidence: classifyExecutionEvent(event, metadata, asOf, history) })),
      cursor: rows.length > query.limit ? { generation: query.generation, itemId: query.itemId, sourceRevision, asOf, upperSeq, beforeSeq: events.at(-1)!.seq, selection } : null }
  }
}
