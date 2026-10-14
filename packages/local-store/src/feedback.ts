/**
 * [INPUT]: A mobile action, the item it touched, and whether that row is on the open column.
 * [OUTPUT]: The desktop success toast (text, location line, undo, duration) or nothing.
 * [POS]: Same gate as apps/desktop/src/renderer/state/feedback.ts for the actions the phone can perform.
 */
import type { Horizon, ItemRow, Period, PeriodHorizon, UndoToken } from './types'
import { periodFromId, periodMeta } from './periods'

export const ACTION_TOAST_MS = 6000
export const UNDO_TOAST_MS = 2500

export type ItemVisibility = 'visible' | 'hidden-column' | 'outside-view'

/** The single column on screen. A closed done fold hides completed rows. */
export interface Glance {
  tab: 'board' | 'flow' | 'settings'
  horizon: Horizon | null
  periodId: string | null
  columns: readonly Horizon[]
  doneOpen: boolean
}

export interface Notice {
  text: string
  detail: string | null
  undo: UndoToken | null
  label: string
  title: string | null
  durationMs: number
}

export type NoticeAction =
  | 'create' | 'move' | 'reorder' | 'edit' | 'flow' | 'link' | 'unlink'
  | 'policy' | 'appearance' | 'backup' | 'complete' | 'reopen' | 'delete' | 'restore' | 'nest'

export interface NoticeBoard {
  today: string
  calendar: { mode: 'rolling' | 'natural' } | null
  periods: Partial<Record<PeriodHorizon, Period>>
}

/** Labels and sentence shapes copied from the desktop catalogs. */
export interface ToastCopy {
  applied: (label: string, title: string | null) => string
  destination: (place: string) => string
  future: string
  past: string
  hiddenColumn: string
  outsideView: string
  archived: string
  statusDone: string
  statusCancelled: string
  naturalYear: string
  naturalCycle: string
  place: { year: string; half: string; cycle: string; month: string; week: string; day: string; later: string }
  actionDelete: string
  actionRestore: string
  actionReopen: string
  actionNest: string
}

export function boardVisibility(item: Pick<ItemRow, 'horizon' | 'periodId' | 'status'>, glance: Glance): ItemVisibility {
  if (glance.tab !== 'board' || glance.horizon !== item.horizon || !glance.columns.includes(item.horizon)) return 'hidden-column'
  if (item.horizon !== 'later' && item.periodId && glance.periodId !== item.periodId) return 'outside-view'
  if (item.status === 'done' && !glance.doneOpen) return 'outside-view'
  return 'visible'
}

/** Desktop `feedbackKind`: silent writes stay silent; a toast exists only when the write can be undone. */
export function actionNotice(copy: ToastCopy, action: NoticeAction, item: ItemRow | null, undo: UndoToken | null, glance: Glance, board: NoticeBoard): Notice | null {
  if (!undo || !item) return null
  if (action === 'reopen') {
    const next: ItemRow = { ...item, status: 'todo', completedAt: null }
    const visibility = boardVisibility(next, glance)
    if (visibility === 'visible') return null
    return located(copy, copy.actionReopen, next, undo, visibility, board)
  }
  if (action === 'restore') return located(copy, copy.actionRestore, item, undo, boardVisibility(item, glance), board)
  if (action === 'delete') return plain(copy, copy.actionDelete, item, undo)
  if (action === 'nest') return plain(copy, copy.actionNest, item, undo)
  return null
}

function plain(copy: ToastCopy, label: string, item: ItemRow, undo: UndoToken): Notice {
  return { text: copy.applied(label, item.title), detail: null, undo, label, title: item.title, durationMs: ACTION_TOAST_MS }
}

function located(copy: ToastCopy, label: string, item: ItemRow, undo: UndoToken, visibility: ItemVisibility, board: NoticeBoard): Notice {
  const horizon = item.horizon === 'year' && board.calendar?.mode === 'natural' ? copy.naturalYear
    : item.horizon === 'cycle' && board.calendar?.mode === 'natural' ? copy.naturalCycle
      : copy.place[item.horizon]
  const location = [horizon]
  const current = item.horizon === 'later' ? undefined : board.periods[item.horizon]
  if (item.periodId && current && current.id !== item.periodId) {
    const start = item.periodId.split(':').at(-1) ?? ''
    location.push(start > current.startDate ? copy.future : copy.past)
    const period = item.horizon === 'later' ? null : periodFromId(item.horizon, item.periodId)
    if (period) location.push(periodMeta(item.horizon, period, board.today).meta)
  }
  if (item.archivedAt) location.push(copy.archived)
  if (item.status === 'done') location.push(copy.statusDone)
  else if (item.status === 'cancelled') location.push(copy.statusCancelled)
  if (visibility === 'hidden-column') location.push(copy.hiddenColumn)
  else if (visibility === 'outside-view') location.push(copy.outsideView)
  return { text: copy.applied(label, item.title), detail: copy.destination(location.join(' · ')), undo, label, title: item.title, durationMs: ACTION_TOAST_MS }
}
