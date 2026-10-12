/**
 * [INPUT]: The open workspace database and a period key from a SyncOp.
 * [OUTPUT]: The same period id the desktop calendar would assign.
 * [POS]: ApplyHost for sync replay. It reads the calendar the op just wrote, including base_ during a merge.
 */
import type { DatabaseSync } from 'node:sqlite'
import { Temporal } from '../../domain/temporal'
import { makePeriod, type Horizon } from '../../domain/calendar'
import type { ApplyHost } from '@goalloom/store-core'
import { SyncApplyError } from '@goalloom/store-core'

const months: Partial<Record<Horizon, number>> = { year: 12, half: 6, cycle: 3 }

export function syncHost(db: DatabaseSync): ApplyHost {
  return { materializePeriod(horizon, startDate) {
    const raw = db.prepare('SELECT calendar FROM base_workspace WHERE id=1 AND calendar IS NOT NULL').get()?.calendar
      ?? db.prepare('SELECT calendar FROM workspace WHERE id=1 AND calendar IS NOT NULL').get()?.calendar
    if (!raw) throw new SyncApplyError('period_scale_mismatch')
    const calendar = JSON.parse(String(raw))
    const start = Temporal.PlainDate.from(startDate)
    const span = months[horizon as Horizon]
    const end = span ? start.add({ months: span }) : horizon === 'week' ? start.add({ days: 7 }) : horizon === 'month' ? start.add({ months: 1 }) : start.add({ days: 1 })
    const period = makePeriod(calendar, horizon as Horizon, start, end)
    return { id: period.id, horizon: period.horizon, startDate: period.startDate, endDate: period.endDate, startAt: period.startAt, endAt: period.endAt }
  } }
}
