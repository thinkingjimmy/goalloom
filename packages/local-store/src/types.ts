/**
 * [INPUT]: Planning horizons and the synchronous SQL shape shared with store-core.
 * [OUTPUT]: Driver, calendar, item and undo types for the offline workspace.
 * [POS]: Types only. No database and no React.
 */

export type SqlValue = null | string | number
export interface SqlStatement {
  run(...params: SqlValue[]): { changes: number }
  get(...params: SqlValue[]): Record<string, SqlValue> | undefined
  all(...params: SqlValue[]): Record<string, SqlValue>[]
}
export interface SqlDriver {
  exec(sql: string): void
  prepare(sql: string): SqlStatement
  transaction<T>(fn: () => T): T
}

export const periodHorizons = ['year', 'half', 'cycle', 'month', 'week', 'day'] as const
export const horizons = [...periodHorizons, 'later'] as const
export type PeriodHorizon = typeof periodHorizons[number]
export type Horizon = typeof horizons[number]
export type Status = 'todo' | 'done' | 'cancelled'
export type Theme = 'system' | 'light' | 'dark'
export type BoardStyle = 'paper' | 'minimal'
export type CheckStyle = 'outline' | 'paper' | 'tint'
export type PolicyMode = 'auto' | 'manual'

export interface CalendarConfig {
  id: string
  mode: 'rolling' | 'natural'
  timezone: string
  weekStart: number
  cycleAnchor: string
}

export interface Period {
  id: string
  horizon: PeriodHorizon
  startDate: string
  endDate: string
  startAt: string
  endAt: string
}

export interface NoteSignal {
  tasks: { done: number; total: number } | null
  next: string | null
  links: string[]
  linkCount: number
  excerpt: string
}

export interface ItemRow {
  id: string
  title: string
  description: string
  dueDate: string | null
  status: Status
  completedAt: string | null
  archivedAt: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  version: number
  flowColor: number | null
  horizon: Horizon
  periodId: string | null
  sortKey: number
  placementVersion: number
  nestingParentId: string | null
  note: NoteSignal | null
}

export interface RelationRow { id: string; parentId: string; childId: string }

export interface ActivityRow {
  type: string
  at: string
  fromPeriodId: string | null
  toPeriodId: string | null
}

export interface UndoToken {
  kind: 'status' | 'trash' | 'create' | 'placement'
  id: string
  status?: Status
  completedAt?: string | null
  horizon?: Horizon
  periodId?: string | null
  sortKey?: number
  nestingParentId?: string | null
  relationIds?: string[]
}
