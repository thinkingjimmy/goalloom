/**
 * [INPUT]: An isolated profile and the current UTC date; production Repository/SQLite with an earlier injected clock.
 * [OUTPUT]: Previous/current/future task groups and immutable original destination orders for native placement acceptance.
 * [POS]: Seed for parent-placement.mjs; automatic rollover remains pending until the production app starts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Temporal } from '../../src/domain/temporal'
import { currentPeriod, precedingPeriod } from '../../src/domain/calendar'
import { openDatabase, verifyDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import type { ItemHorizon, PlanningPeriod } from '../../src/shared/contracts/entities'

const profile = process.argv[2]!
const today = Temporal.Now.zonedDateTimeISO('UTC').toPlainDate()
const observation = `${today}T00:00:00Z`
const seededAt = `${today.subtract({ days: 14 })}T00:00:00Z`
const db = openDatabase(join(profile, 'workspace.sqlite'))
migrate(db)
const repo = new Repository(db, { now: () => seededAt })
const run = (action: Record<string, unknown>) => repo.execute({ generation: repo.store.workspace().generation, operationId: randomUUID(), ...action })
run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: `${seededAt.slice(0, 4)}-01-01` }, confirmed: true })
const calendar = repo.store.workspace().calendar!
const day = currentPeriod(calendar, 'day', observation), week = currentPeriod(calendar, 'week', observation)
const month = currentPeriod(calendar, 'month', observation)
const yesterday = precedingPeriod(calendar, day)!, previousWeek = precedingPeriod(calendar, week)!
const tomorrow = currentPeriod(calendar, 'day', day.endAt)
const ids: Record<string, string> = {}
function create(key: string, title: string, horizon: ItemHorizon, period: PlanningPeriod, parentId?: string, nestingParentId?: string): string {
  const owner = nestingParentId ? repo.store.item(nestingParentId) : null
  const result = run({ type: 'create', title, description: 'Synthetic placement acceptance', horizon,
    period: { kind: 'date', startDate: period.startDate }, autoPlace: false,
    ...(parentId ? { parentId, expectedParentVersion: repo.store.item(parentId).version } : {}),
    ...(owner ? { nesting: { parentId: owner.id, expectedParentVersion: owner.version, expectedParentPlacementVersion: owner.placement.version } } : {}),
  })
  assert(result.itemId)
  return ids[key] = result.itemId
}
const a = create('goalA', 'Goal A', 'month', month), b = create('goalB', 'Goal B', 'month', month)
create('todayA', 'Today A', 'day', day, a)
create('todayB', 'Today B', 'day', day, b)
create('todayLoose', 'Today loose', 'day', day)
const manualOn = create('manualOn', 'Manual enabled', 'day', day, b)
create('manualChild', 'Manual group child', 'day', day, undefined, manualOn)
create('manualOff', 'Manual disabled', 'day', day, b)
create('tomorrowA', 'Tomorrow A', 'day', tomorrow, a)
create('tomorrowB', 'Tomorrow B', 'day', tomorrow, b)
create('tomorrowLoose', 'Tomorrow loose', 'day', tomorrow)
const automatic = create('automatic', 'Automatic incoming', 'day', yesterday, a)
create('automaticChild', 'Automatic group child', 'day', yesterday, undefined, automatic)
create('weekA', 'Week A', 'week', week, a)
create('weekB', 'Week B', 'week', week, b)
create('weekLoose', 'Week loose', 'week', week)
const backlogOn = create('backlogOn', 'Backlog enabled', 'week', previousWeek, a)
create('backlogChild', 'Backlog group child', 'week', previousWeek, undefined, backlogOn)
create('backlogOff', 'Backlog disabled', 'week', previousWeek, a)
const order = (period: PlanningPeriod) => repo.store.items('i.deletedAt IS NULL AND p.periodId=? AND p.nestingParentId IS NULL', [period.id]).map(item => item.id)
const fixture = { ids, observation, seededAt, day, tomorrow, week, yesterday, previousWeek,
  original: { day: order(day), tomorrow: order(tomorrow), week: order(week) },
  runtime: { electron: process.versions.electron, node: process.versions.node, sqlite: db.prepare('SELECT sqlite_version() AS version').get()!.version },
}
verifyDatabase(db)
db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
db.close()
writeFileSync(join(profile, 'parent-placement-fixture.json'), JSON.stringify(fixture, null, 2))
