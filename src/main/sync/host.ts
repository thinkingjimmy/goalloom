/**
 * [INPUT]: The open workspace database and a period key from a SyncOp.
 * [OUTPUT]: The same period id the desktop calendar would assign.
 * [POS]: ApplyHost for sync replay. It reads the calendar the op just wrote, including base_ during a merge.
 */
import type { DatabaseSync } from 'node:sqlite'
import { Temporal } from '../../domain/temporal'
import { alignImportedStart, boundedPeriodEnd, currentPeriod, makePeriod, parseDate, type Calendar, type Horizon } from '../../domain/calendar'
import { isAnchoredHorizon } from '../../shared/contracts/values'
import type { ApplyHost } from '@goalloom/store-core'
import { SyncApplyError } from '@goalloom/store-core'

function readCalendar(db: DatabaseSync): Calendar {
  const raw = db.prepare('SELECT calendar FROM base_workspace WHERE id=1 AND calendar IS NOT NULL').get()?.calendar
    ?? db.prepare('SELECT calendar FROM workspace WHERE id=1 AND calendar IS NOT NULL').get()?.calendar
  if (!raw) throw new SyncApplyError('period_scale_mismatch')
  return JSON.parse(String(raw)) as Calendar
}

function snapStart(calendar: Calendar, horizon: Horizon, start: ReturnType<typeof parseDate>) {
  try {
    const instant = start.toZonedDateTime(calendar.timezone).toInstant().toString()
    return parseDate(currentPeriod(calendar, horizon, instant).startDate)
  } catch {
    return isAnchoredHorizon(horizon) && calendar.cycleAnchor ? parseDate(calendar.cycleAnchor) : start
  }
}

export function syncHost(db: DatabaseSync): ApplyHost {
  return {
    materializePeriod(horizon, startDate) {
      const calendar = readCalendar(db)
      const name = horizon as Horizon
      const start = snapStart(calendar, name, Temporal.PlainDate.from(startDate))
      const end = boundedPeriodEnd(calendar, name, start)
      const period = makePeriod(calendar, name, start, end)
      return { id: period.id, horizon: period.horizon, startDate: period.startDate, endDate: period.endDate, startAt: period.startAt, endAt: period.endAt }
    },
    alignImportedPeriod(localCalendarJson, horizon, startDate, at) {
      return alignImportedStart(JSON.parse(localCalendarJson) as Calendar, readCalendar(db), horizon as Horizon, startDate, at)
    },
  }
}
