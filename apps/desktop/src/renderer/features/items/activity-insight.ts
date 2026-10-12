/**
 * [INPUT]: Displayed month and workspace week start.
 * [OUTPUT]: Calendar grid cells only; authoritative execution facts live in domain/workspace.
 * [POS]: Detail calendar presentation without a second statistics algorithm.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { addDays, weekday } from '../../lib/dates'

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
