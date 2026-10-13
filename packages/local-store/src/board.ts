/**
 * [INPUT]: Pointer samples, row boxes and flow membership.
 * [OUTPUT]: Column paging, a rejected row-swipe, long-press drag, nest/reorder drops, outline rows, breakpoint flags, sheet-dismiss decisions and capture drafts.
 * [POS]: Gesture and board projection rules with no React Native.
 */
import type { Horizon, PeriodHorizon } from './types'
import { periodHorizons } from './types'

export const BOARD_COLUMNS = ['year', 'half', 'cycle', 'month', 'week', 'day', 'later'] as const
export type BoardColumn = typeof BOARD_COLUMNS[number]
export const OPEN_COLUMN: BoardColumn = 'day'
export const OPEN_INDEX = BOARD_COLUMNS.indexOf(OPEN_COLUMN)
/** Bottom bar. There is no Today tab; today is the column the board opens on. */
export const APP_TABS = ['board', 'flow', 'settings'] as const
export type AppTab = typeof APP_TABS[number]
export const LONG_PRESS_MS = 450
export const GESTURE_SLOP = 8
export const NEST_INDENT = 24
/** The flow page is one column. Rows do not indent. */
export const FLOW_INDENT = 0

/** Checklist fraction, matching the desktop note signal. Folds show a count. Other surfaces show nothing. */
export function completionLabel(where: 'note' | 'fold' | 'header', done: number, total: number): string | null {
  if (where === 'note' && total > 0) return `${done}/${total}`
  if (where === 'fold') return String(done)
  return null
}

export function rowSwipeAction(): null { return null }

/** Hit height of the sheet grabber, measured from the top of the sheet. */
export const SHEET_GRABBER = 44
/** Downward speed, in px/ms, that closes the sheet even when the drag is short. */
export const SHEET_DISMISS_VELOCITY = 0.75

/** Pull down on the grabber, or on the body only while its content is at the top. */
export function shouldDragSheet(dy: number, dx: number, scrollY: number, startOffsetY: number): boolean {
  if (dy <= GESTURE_SLOP || dy < Math.abs(dx)) return false
  if (startOffsetY <= SHEET_GRABBER) return true
  return scrollY <= 1
}

/** Close once the drag passes the distance threshold or the flick is fast enough; otherwise spring back. */
export function sheetRelease(distance: number, velocity: number, height: number): boolean {
  const span = Math.max(height, 1)
  return distance > Math.min(140, span * 0.28) || velocity > SHEET_DISMISS_VELOCITY
}

export function pageFromOffset(x: number, pageWidth: number, count = BOARD_COLUMNS.length): number {
  if (pageWidth <= 0) return OPEN_INDEX
  return Math.max(0, Math.min(count - 1, Math.round(x / pageWidth)))
}

export type PointerPhase = 'pending' | 'scroll' | 'paging' | 'drag'

export function classifyPointer(dx: number, dy: number, elapsed: number, slop = GESTURE_SLOP): PointerPhase {
  const moved = Math.abs(dx) > slop || Math.abs(dy) > slop
  if (!moved) return elapsed >= LONG_PRESS_MS ? 'drag' : 'pending'
  if (elapsed >= LONG_PRESS_MS) return 'drag'
  return Math.abs(dx) > Math.abs(dy) ? 'paging' : 'scroll'
}

export interface RowBox { id: string; y: number; height: number; canNest: boolean }

export type DropTarget = { kind: 'nest'; parentId: string } | { kind: 'reorder'; index: number }

export function dropOnRows(rows: readonly RowBox[], y: number): DropTarget {
  if (!rows.length) return { kind: 'reorder', index: 0 }
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!
    const bottom = row.y + row.height
    if (y < row.y) return { kind: 'reorder', index }
    if (y <= bottom) {
      const local = y - row.y
      const edge = Math.min(8, row.height / 3)
      if (local > edge && local < row.height - edge && row.canNest) return { kind: 'nest', parentId: row.id }
      return { kind: 'reorder', index: local < row.height / 2 ? index : index + 1 }
    }
  }
  return { kind: 'reorder', index: rows.length }
}

const horizonRank: Record<Horizon, number> = { year: 0, half: 1, cycle: 2, month: 3, week: 4, day: 5, later: 6 }

export function mayLink(parent: Horizon, child: Horizon): boolean {
  return parent !== 'later' && child !== 'later' && horizonRank[parent] < horizonRank[child]
}

export function nextHorizon(horizon: Horizon): PeriodHorizon | null {
  if (horizon === 'later' || horizon === 'day') return null
  const index = periodHorizons.indexOf(horizon)
  return periodHorizons[index + 1] ?? null
}

export interface FlowNode { id: string; flowColor: number | null; nestingParentId: string | null; horizon: Horizon; status: string }
export interface FlowEdge { parentId: string; childId: string }

export function flowColors(itemId: string, nodes: ReadonlyMap<string, FlowNode>, edges: readonly FlowEdge[]): number[] {
  if (!nodes.has(itemId)) return []
  const roots = new Set<string>()
  for (const entry of nodes.values()) if (entry.flowColor !== null) roots.add(entry.id)
  const parents = new Map<string, string[]>()
  const addParent = (childId: string, parentId: string) => {
    const list = parents.get(childId) ?? []
    list.push(parentId)
    parents.set(childId, list)
  }
  for (const edge of edges) addParent(edge.childId, edge.parentId)
  for (const entry of nodes.values()) if (entry.nestingParentId) addParent(entry.id, entry.nestingParentId)
  const memo = new Map<string, string[]>()
  for (const id of roots) memo.set(id, [id])
  const resolve = (id: string): string[] => {
    const cached = memo.get(id)
    if (cached) return cached
    if (!parents.has(id)) { memo.set(id, []); return [] }
    const stack = [{ id, next: 0 }]
    while (stack.length) {
      const frame = stack.at(-1)!
      if (memo.has(frame.id)) { stack.pop(); continue }
      const ancestors = parents.get(frame.id) ?? []
      const parent = ancestors[frame.next++]
      if (parent !== undefined) { if (!memo.has(parent)) stack.push({ id: parent, next: 0 }); continue }
      memo.set(frame.id, [...new Set(ancestors.flatMap(parentId => memo.get(parentId) ?? []))])
      stack.pop()
    }
    return memo.get(id) ?? []
  }
  const colors: number[] = []
  for (const rootId of resolve(itemId)) {
    const color = nodes.get(rootId)?.flowColor
    if (color !== null && color !== undefined && !colors.includes(color)) colors.push(color)
  }
  return colors
}

export function canNest(childId: string, parentId: string, nodes: ReadonlyMap<string, FlowNode>, edges: readonly FlowEdge[]): boolean {
  if (childId === parentId) return false
  const parent = nodes.get(parentId), child = nodes.get(childId)
  if (!parent || !child || parent.nestingParentId || child.flowColor !== null) return false
  if (child.horizon === 'later' || parent.horizon === 'later' || child.horizon !== parent.horizon) return false
  for (const entry of nodes.values()) if (entry.nestingParentId === childId) return false
  if (edges.some(edge => edge.childId === childId)) return false
  const children = new Map<string, string[]>()
  for (const edge of edges) {
    const list = children.get(edge.parentId) ?? []
    list.push(edge.childId)
    children.set(edge.parentId, list)
  }
  const pending = [childId], seen = new Set<string>()
  while (pending.length) {
    const id = pending.pop()!
    if (id === parentId) return false
    if (seen.has(id)) continue
    seen.add(id)
    pending.push(...(children.get(id) ?? []))
  }
  return true
}

export function showBreakpoint(itemId: string, nodes: ReadonlyMap<string, FlowNode>, edges: readonly FlowEdge[]): boolean {
  const item = nodes.get(itemId)
  if (!item || item.status !== 'todo' || item.horizon === 'later' || item.horizon === 'day') return false
  if (!flowColors(itemId, nodes, edges).length) return false
  const next = nextHorizon(item.horizon)
  if (!next) return false
  const children = new Map<string, string[]>()
  for (const edge of edges) {
    const list = children.get(edge.parentId) ?? []
    list.push(edge.childId)
    children.set(edge.parentId, list)
  }
  for (const entry of nodes.values()) if (entry.nestingParentId) {
    const list = children.get(entry.nestingParentId) ?? []
    list.push(entry.id)
    children.set(entry.nestingParentId, list)
  }
  const pending = [itemId], seen = new Set<string>()
  while (pending.length) {
    const id = pending.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const child of children.get(id) ?? []) {
      const node = nodes.get(child)
      if (node && node.horizon === next && node.status !== 'cancelled') return false
      pending.push(child)
    }
  }
  return true
}

export interface OutlineItem { id: string; status: string; sortKey: number; nestingParentId: string | null }

export function outlineRows<T extends OutlineItem>(items: readonly T[], compare?: (a: string, b: string) => number): T[] {
  const byId = new Map(items.map(item => [item.id, item]))
  const children = new Map<string, T[]>()
  const roots: T[] = []
  for (const item of items) {
    const parent = item.nestingParentId ? byId.get(item.nestingParentId) : undefined
    if (parent) {
      const list = children.get(parent.id) ?? []
      list.push(item)
      children.set(parent.id, list)
    } else roots.push(item)
  }
  const manual = (a: T, b: T) => a.sortKey - b.sortKey || a.id.localeCompare(b.id, 'en')
  const ordered = [...roots].sort(compare ? (a, b) => compare(a.id, b.id) : manual)
  return ordered.flatMap(root => [root, ...(children.get(root.id) ?? []).sort(manual)])
}

/** Open groups stay above groups whose members are all done, in outline order rather than insertion order. */
export function columnSections<T extends OutlineItem>(items: readonly T[], compare?: (a: string, b: string) => number): { todo: T[]; done: T[] } {
  const ordered = outlineRows(items, compare)
  const present = new Set(ordered.map(item => item.id))
  const groups = new Map<string, T[]>()
  for (const item of ordered) {
    const root = item.nestingParentId && present.has(item.nestingParentId) ? item.nestingParentId : item.id
    const group = groups.get(root) ?? []
    group.push(item)
    groups.set(root, group)
  }
  const todo: T[] = [], done: T[] = []
  for (const members of groups.values()) (members.some(item => item.status === 'todo') ? todo : done).push(...members)
  return { todo, done }
}

/** Drop index from a list that still contains the dragged row. A downward move shifts once the row is gone. */
export function neighborsAfterRemoval(ids: readonly string[], draggedId: string, index: number): { beforeId: string | null; afterId: string | null } {
  const from = ids.indexOf(draggedId)
  const target = from >= 0 && from < index ? index - 1 : index
  const rest = ids.filter(id => id !== draggedId)
  return { beforeId: rest[target - 1] ?? null, afterId: rest[target] ?? null }
}

/** Index of a horizon in the visible column list. A hidden requested column falls back to today, then the first page. */
export function columnIndex(columns: readonly string[], horizon: string): number {
  const index = columns.indexOf(horizon)
  if (index >= 0) return index
  const day = columns.indexOf(OPEN_COLUMN)
  return day >= 0 ? day : 0
}

export function columnOutline<T extends OutlineItem>(items: readonly T[], compare?: (a: string, b: string) => number): T[] {
  const { todo, done } = columnSections(items, compare)
  return [...todo, ...done]
}

export interface FlowListItem { id: string; horizon: PeriodHorizon; done: boolean }

export function flowSections(items: readonly FlowListItem[]): { horizon: PeriodHorizon; ids: string[] }[] {
  const buckets = new Map<PeriodHorizon, string[]>()
  for (const item of items) {
    const list = buckets.get(item.horizon) ?? []
    list.push(item.id)
    buckets.set(item.horizon, list)
  }
  return periodHorizons.filter(horizon => buckets.has(horizon)).map(horizon => ({ horizon, ids: buckets.get(horizon)! }))
}

export interface FlowRailItem { id: string; horizon: PeriodHorizon; done: boolean; color: number | null }

/** Parent→child rails for the single-column flow page. Unrelated neighbours are not connected. */
export function flowLeftLinks(items: readonly FlowRailItem[], edges: readonly FlowEdge[]): { from: string; to: string; skip: boolean; dim: boolean; color: number | null }[] {
  const placed = new Map(items.map((item, index) => [item.id, { item, index }]))
  const rank = (horizon: PeriodHorizon) => periodHorizons.indexOf(horizon)
  const seen = new Set<string>()
  const links: { from: string; to: string; skip: boolean; dim: boolean; color: number | null }[] = []
  for (const edge of edges) {
    const parent = placed.get(edge.parentId)
    const child = placed.get(edge.childId)
    if (!parent || !child || parent.index === child.index) continue
    const upper = parent.index < child.index ? parent : child
    const lower = parent.index < child.index ? child : parent
    const key = `${upper.item.id}>${lower.item.id}`
    if (seen.has(key)) continue
    seen.add(key)
    links.push({
      from: upper.item.id,
      to: lower.item.id,
      skip: Math.abs(rank(parent.item.horizon) - rank(child.item.horizon)) > 1,
      dim: child.item.done,
      color: parent.item.color ?? child.item.color,
    })
  }
  return links
}

export function flowConnectors(items: readonly FlowListItem[]): { from: string; to: string; skip: boolean; dim: boolean }[] {
  const rank = (horizon: PeriodHorizon) => periodHorizons.indexOf(horizon)
  const links: { from: string; to: string; skip: boolean; dim: boolean }[] = []
  for (let index = 0; index < items.length - 1; index++) {
    const current = items[index]!, next = items[index + 1]!
    links.push({ from: current.id, to: next.id, skip: rank(next.horizon) - rank(current.horizon) > 1, dim: next.done })
  }
  return links
}

export interface CaptureParent { id: string; title: string; horizon: Horizon }
export interface CaptureDraft {
  title: string
  horizon: Horizon
  dueDate: string | null
  parentId: string | null
  nestingParentId?: string | null
}

/** A chosen column replaces a parsed Later item that has no date. Dated and named horizons stay. */
export function withCaptureColumn(rows: readonly CaptureDraft[], column: Horizon): CaptureDraft[] {
  if (column === 'later') return rows.map(row => ({ ...row }))
  return rows.map(row => row.horizon === 'later' && row.dueDate === null ? { ...row, horizon: column } : { ...row })
}

export function parseCapture(text: string, today: string, parents: readonly CaptureParent[]): CaptureDraft[] {
  const chunks = text.split(/\n+|然后|[。；;]/).map(chunk => chunk.replace(/#[^\s#]+/g, '').trim()).filter(Boolean)
  return chunks.map(chunk => {
    const dated = dueIn(chunk, today)
    const ranked = parents.filter(entry => entry.horizon !== 'later').map(entry => ({ entry, score: parentScore(chunk, entry.title) })).filter(item => item.score > 0)
    ranked.sort((a, b) => b.score - a.score || b.entry.title.length - a.entry.title.length)
    const parent = ranked[0]?.entry
    let horizon: Horizon = 'later'
    if (/每天/.test(chunk)) horizon = 'day'
    else if (dated) horizon = dated.horizon
    else if (/本周|这周/.test(chunk)) horizon = 'week'
    else if (/本月|这个月/.test(chunk)) horizon = 'month'
    return { title: cleanTitle(chunk), horizon, dueDate: dated?.date ?? null, parentId: parent?.id ?? null }
  }).filter(draft => draft.title.length > 0)
}

function parentScore(chunk: string, title: string): number {
  let best = 0
  for (let start = 0; start < title.length; start++) {
    for (let end = start + 2; end <= title.length; end++) {
      const piece = title.slice(start, end)
      if (!chunk.includes(piece)) break
      best = Math.max(best, piece.length)
    }
  }
  if (best >= 2) return best
  if (/读/.test(chunk) && /书|读/.test(title)) return 1
  return 0
}

function cleanTitle(text: string): string {
  return text.replace(/周[一二三四五六日天]前?/g, '').replace(/\d{1,2}月\d{1,2}日/g, '').replace(/\d{1,2}\/\d{1,2}/g, '').replace(/明天|今天|每天|本周|这周|本月/g, '').replace(/[，,、。；;]/g, '').replace(/\s+/g, ' ').trim()
}

function dueIn(text: string, today: string): { date: string; horizon: Horizon } | null {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  const base = new Date(Date.UTC(y!, m! - 1, d))
  const slash = /(\d{1,2})\/(\d{1,2})/.exec(text)
  const written = /(\d{1,2})月(\d{1,2})日/.exec(text)
  const month = slash ? Number(slash[1]) : written ? Number(written[1]) : null
  const day = slash ? Number(slash[2]) : written ? Number(written[2]) : null
  if (month && day) {
    const date = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return { date, horizon: date === today ? 'day' : 'week' }
  }
  if (text.includes('明天')) return { date: shift(base, 1), horizon: 'day' }
  if (text.includes('今天')) return { date: today, horizon: 'day' }
  const names = ['日', '一', '二', '三', '四', '五', '六']
  const named = /周([一二三四五六日天])/.exec(text)
  if (!named) return null
  const want = named[1] === '天' ? 0 : names.indexOf(named[1]!)
  const current = base.getUTCDay()
  let delta = (want - current + 7) % 7
  if (delta === 0) delta = 7
  return { date: shift(base, delta), horizon: 'week' }
}

function shift(date: Date, days: number): string {
  const next = new Date(date.getTime() + days * 86400000)
  return next.toISOString().slice(0, 10)
}
