/**
 * [INPUT]: An isolated Electron profile and monthly, cache or first/last-day weekly fixture mode.
 * [OUTPUT]: Real event history spanning previous/current periods, including weekly move/keep/archive and saved-link records.
 * [POS]: Injected-clock desktop setup; production has no test clock or renderer bridge replacement.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Temporal } from '../../../src/domain/temporal'
import { currentPeriod, precedingPeriod } from '../../../src/domain/calendar'
import { openDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'

const profile = process.argv[2]!, mode = process.argv[3]
const scoped = mode === 'scope-month' || mode === 'scope-combined', combined = mode === 'combined' || mode === 'scope-combined'
const today = Temporal.Now.zonedDateTimeISO('Asia/Shanghai')
const db = openDatabase(join(profile, 'workspace.sqlite')); migrate(db)
let now = today.subtract({ months: 2 }).with({ day: 10 }).toInstant().toString()
const repo = new Repository(db, { now: () => now }), generation = repo.store.workspace().generation
const run = (action: object) => repo.execute({ ...action, generation, operationId: randomUUID() })
if (mode === 'week-first' || mode === 'week-last') {
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: mode === 'week-first' ? today.dayOfWeek : today.dayOfWeek % 7 + 1,
    mode: 'rolling', anchor: { kind: 'date', date: today.with({ day: 1 }).subtract({ months: 2 }).toPlainDate().toString() }, confirmed: true })
  const earlier = run({ type: 'create', title: 'Earlier weekly backlog', horizon: 'week' }).itemId!
  const calendar = repo.store.workspace().calendar!
  const current = currentPeriod(calendar, 'week', today.toInstant().toString())
  const period = mode === 'week-first' ? precedingPeriod(calendar, current)! : current
  now = period.startAt
  const unfinished = run({ type: 'create', title: 'Weekly unfinished review item https://example.com/link-preview-article', horizon: 'week' }).itemId!
  const defaultMove = run({ type: 'create', title: 'Default weekly move https://x.com/trq212/status/2103576349499855160', horizon: 'week' }).itemId!
  now = today.toInstant().toString()
  const parent = run({ type: 'create', title: 'Current monthly direction https://example.com/link-preview-article', horizon: 'month', flowColor: 0 }).itemId!
  const extraParent = run({ type: 'create', title: 'Additional monthly direction', horizon: 'month', flowColor: 1 }).itemId!
  const month = currentPeriod(calendar, 'month', now)
  const monthKeys = [month, precedingPeriod(calendar, month)!].map(value => `month:${value.startDate}`)
  writeFileSync(join(profile, 'review-fixture.json'), JSON.stringify({ mode, earlier, unfinished, defaultMove, parent, extraParent, period, current, monthKeys }))
} else if (mode === 'cache') {
  const calendar = repo.store.workspace().calendar!
  const week = precedingPeriod(calendar, currentPeriod(calendar, 'week', today.toInstant().toString()))!
  const month = precedingPeriod(calendar, currentPeriod(calendar, 'month', today.toInstant().toString()))!
  // Current month takes priority at the monthly boundary. Give both possible review scopes a real record.
  for (const period of [month, week].sort((a, b) => a.startAt.localeCompare(b.startAt))) {
    now = period.startAt
    run({ type: 'create', title: `Historical ${period.horizon} review record`, horizon: period.horizon })
  }
  now = today.toInstant().toString()
  run({ type: 'preferences', style: repo.store.workspace().style })
} else {
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: mode === 'scope-combined' ? today.with({ day: 1 }).dayOfWeek : combined ? today.dayOfWeek : (today.dayOfWeek + 1) % 7 + 1,
    mode: 'rolling', anchor: { kind: 'date', date: today.with({ day: 1 }).subtract({ months: 2 }).toPlainDate().toString() }, confirmed: true })
  const earlier = run({ type: 'create', title: 'Earlier unfinished item', horizon: 'month' }).itemId!
  now = today.subtract({ months: 1 }).with({ day: 10 }).toInstant().toString()
  const roots = ['Publish consistently', 'Grow the side project', 'Build a steady routine'].map((title, flowColor) => run({ type: 'create', title, horizon: 'cycle', flowColor }).itemId!)
  const create = (title: string, parent: number) => run({ type: 'create', title, horizon: 'month', parentId: roots[parent], expectedParentVersion: repo.store.item(roots[parent]!).version }).itemId!
  const done = create(scoped ? 'September finished work https://example.com/link-preview-article' : 'September finished work', 0)
  run({ type: 'status', itemId: done, expectedVersion: 1, status: 'done' })
  const move = create('Continue this work', 1), keep = create('Keep this for later', 0), archive = create('Stop this experiment', 2)
  const rolled = create('Already in the new month', 0), laterDone = create('Completed after the boundary', 0)
  const period = repo.snapshot().periods.find(value => value.horizon === 'month')!
  let weekly: string | null = null
  if (combined) {
    now = (mode === 'scope-combined' ? today.with({ day: 1 }).subtract({ days: 1 }) : today.subtract({ days: 1 })).toInstant().toString()
    weekly = run({ type: 'create', title: 'Finish the weekly draft', horizon: 'week', parentId: move, expectedParentVersion: repo.store.item(move).version }).itemId!
  }
  now = today.toInstant().toString()
  run({ type: 'move', itemId: rolled, expectedVersion: 1, expectedPlacementVersion: 1, horizon: 'month' })
  run({ type: 'status', itemId: laterDone, expectedVersion: 1, status: 'done' })
  const existing = create('Only in the current month', 0)
  run({ type: 'create', title: scoped ? 'A new cycle goal after the boundary https://example.com/link-preview-article' : 'A new cycle goal after the boundary', horizon: 'cycle', flowColor: 4 })
  writeFileSync(join(profile, 'review-fixture.json'), JSON.stringify({ roots, done, move, keep, archive, rolled, laterDone, earlier, existing, period, weekly }))
}
db.close()
