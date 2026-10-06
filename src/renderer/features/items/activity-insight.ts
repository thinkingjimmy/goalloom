/**
 * [INPUT]: An item's activity events, workspace timezone and today.
 * [OUTPUT]: Rollover count, longest column stay, days since the first event, a completed-then-reopened pair, and calendar marks. Undo events and the operations they reverse are left out.
 * [POS]: Read-only summary for the detail rail. It does not decide what gets stored.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { workspaceDate } from '../../../domain/calendar'
import type { ItemHorizon } from '../../../shared/contracts/entities'
import type { Activity } from '../../../shared/contracts/history'
import { addDays, weekday } from '../../lib/dates'

export type ActivityEvent = Activity['events'][number]
export type ActivityMark = 'rollover' | 'move'
export type ActivityStay = { horizon: ItemHorizon; days: number }
export type ActivityInsight = {
  counted: number
  rollovers: number
  stay: ActivityStay | null
  openDays: number
  reopened: { doneOn: string; againOn: string } | null
  marks: Record<string, ActivityMark>
  firstMonth: string
  lastMonth: string
}

const minimum = 3
export const activityInsightMinimum = minimum

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function countedActivity(events: ActivityEvent[]) {
  const undone = new Set(events.flatMap(event => event.type === 'undo' && event.undoOf ? [event.undoOf] : []))
  return events.filter(event => event.type !== 'undo' && !undone.has(event.operationId)).sort((a, b) => a.seq - b.seq)
}

export function activityMonthGrid(month: string, weekStart: number) {
  const offset = (weekday(month) - weekStart + 7) % 7
  const start = addDays(month, -offset)
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index)
    return date.startsWith(month.slice(0, 7)) ? date : null
  })
  while (cells.length >= 7 && cells.slice(0, 7).every(day => day === null)) cells.splice(0, 7)
  while (cells.length >= 7 && cells.slice(-7).every(day => day === null)) cells.splice(cells.length - 7, 7)
  return cells
}

export function activityInsight(events: ActivityEvent[], timezone: string, today: string): ActivityInsight {
  const counted = countedActivity(events)
  const lastMonth = `${today.slice(0, 7)}-01`
  const dates = counted.map(event => workspaceDate(timezone, event.at))
  const earliest = dates.reduce((min, date) => date < min ? date : min, today)
  const firstCandidate = `${earliest.slice(0, 7)}-01`
  const firstMonth = firstCandidate > lastMonth ? lastMonth : firstCandidate
  const stays: { horizon: ItemHorizon; start: string; days: number; rollovers: number }[] = []
  let open: { horizon: ItemHorizon; start: string; rollovers: number } | null = null
  const close = (end: string) => {
    if (!open) return
    stays.push({ horizon: open.horizon, start: open.start, days: Math.max(0, daysBetween(open.start, end)), rollovers: open.rollovers })
    open = null
  }
  let doneOn: string | null = null
  let reopened: ActivityInsight['reopened'] = null
  for (const event of counted) {
    const date = workspaceDate(timezone, event.at)
    if (event.type === 'status_changed') {
      if (event.after.status === 'done' && event.before?.status !== 'done') doneOn = date
      else if (event.after.status === 'todo' && event.before?.status === 'done' && doneOn) { reopened = { doneOn, againOn: date }; doneOn = null }
    }
    if (!open) { open = { horizon: event.after.horizon, start: date, rollovers: event.type === 'rolled_over' ? 1 : 0 }; continue }
    if (event.type === 'rolled_over') {
      if (event.after.horizon === open.horizon) open.rollovers += 1
      else { close(date); open = { horizon: event.after.horizon, start: date, rollovers: 1 } }
      continue
    }
    if (event.type === 'moved' && event.before && event.before.horizon !== event.after.horizon) {
      close(date)
      open = { horizon: event.after.horizon, start: date, rollovers: 0 }
    }
  }
  if (open) stays.push({ ...open, days: Math.max(0, daysBetween(open.start, today)) })
  const totals = new Map<ItemHorizon, { days: number; rollovers: number }>()
  for (const item of stays) {
    const row = totals.get(item.horizon) ?? { days: 0, rollovers: 0 }
    row.days += item.days
    row.rollovers += item.rollovers
    totals.set(item.horizon, row)
  }
  const stay = [...totals].reduce<ActivityStay & { rollovers: number } | null>((best, [horizon, row]) => {
    if (row.days <= 0) return best
    if (!best || row.days > best.days || (row.days === best.days && row.rollovers > best.rollovers)) return { horizon, days: row.days, rollovers: row.rollovers }
    return best
  }, null)
  const focus = stay?.horizon ?? null
  const marks: Record<string, ActivityMark> = {}
  let rollovers = 0
  for (const event of counted) {
    const date = workspaceDate(timezone, event.at)
    if (event.type === 'rolled_over') { rollovers += 1; marks[date] = 'rollover' }
    else if (event.type === 'moved' && event.before && event.before.horizon !== event.after.horizon && (!focus || event.after.horizon === focus) && marks[date] !== 'rollover') marks[date] = 'move'
  }
  const openedOn = dates.reduce((min, date) => date < min ? date : min, today)
  return { counted: counted.length, rollovers, stay: stay && { horizon: stay.horizon, days: stay.days }, openDays: counted.length ? Math.max(0, daysBetween(openedOn, today)) : 0, reopened, marks, firstMonth, lastMonth }
}
