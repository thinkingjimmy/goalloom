/**
 * [INPUT]: An isolated Electron profile and monthly, cache or first/last-day weekly fixture mode.
 * [OUTPUT]: Real review history, optional fixed target instant and overlapping outline sort keys, move/keep/archive and saved-link records.
 * [POS]: Injected-clock desktop setup; production has no test clock or renderer bridge replacement.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Temporal } from '../../src/domain/temporal'
import { currentPeriod, precedingPeriod } from '../../src/domain/calendar'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'

const profile = process.argv[2]!, mode = process.argv[3]
const scoped = mode === 'scope-month' || mode === 'scope-combined', combined = mode === 'combined' || mode === 'scope-combined'
const fixedArgument = process.argv.find(value => value.startsWith('--fixed-at='))
const clockAt = fixedArgument?.slice('--fixed-at='.length)
if (clockAt && new Date(clockAt).toISOString() !== clockAt) throw Error('Invalid fixed review instant')
const today = clockAt ? Temporal.Instant.from(clockAt).toZonedDateTimeISO('Asia/Shanghai') : Temporal.Now.zonedDateTimeISO('Asia/Shanghai')
const db = openDatabase(join(profile, 'workspace.sqlite')); migrate(db)
let now = today.subtract({ months: 2 }).with({ day: 10 }).toInstant().toString()
const repo = new Repository(db, { now: () => now }), generation = repo.store.workspace().generation
const run = (action: object) => repo.execute({ ...action, generation, operationId: randomUUID() })
const seedOutline = (horizon: 'week' | 'month') => {
  if (!process.argv.includes('--outline')) return undefined
  const create = (title: string, parentId?: string) => {
    const parent = parentId ? repo.store.item(parentId) : null
    return run({ type: 'create', title: `Outline ${title}`, horizon, ...(parent ? { nesting: { parentId,
      expectedParentVersion: parent.version, expectedParentPlacementVersion: parent.placement.version } } : {}) }).itemId!
  }
  const first = create('first parent'), second = create('completed parent'), solo = create('standalone')
  const secondChild = create('child of completed parent', second)
  const firstChild = create('first child with a long title that wraps onto another line in the review drawer', first)
  const lastChild = create('last child', first)
  run({ type: 'status', itemId: second, expectedVersion: repo.store.item(second).version, status: 'done' })
  const savedNow = now, calendar = repo.store.workspace().calendar!, source = currentPeriod(calendar, horizon, now)
  now = precedingPeriod(calendar, source)!.startAt
  const remoteParent = create('older independently scheduled parent')
  const local = create('older local child', remoteParent), remote = create('separately scheduled child', remoteParent)
  const child = repo.store.item(remote)
  run({ type: 'move', itemId: remote, expectedVersion: child.version, expectedPlacementVersion: child.placement.version,
    horizon, period: { kind: 'date', startDate: source.startDate } })
  now = savedNow
  return { all: [first, firstChild, lastChild, second, secondChild, solo], closing: [first, firstChild, lastChild, secondChild, solo],
    nested: [firstChild, lastChild, secondChild], parent: first, child: firstChild, remote: { parent: remoteParent, local, child: remote } }
}
if (mode === 'week-first' || mode === 'week-last') {
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: mode === 'week-first' ? today.dayOfWeek : today.dayOfWeek % 7 + 1,
    mode: 'rolling', anchor: { kind: 'date', date: today.with({ day: 1 }).subtract({ months: 2 }).toPlainDate().toString() }, confirmed: true })
  const earlier = run({ type: 'create', title: 'Earlier weekly backlog', horizon: 'week' }).itemId!
  const calendar = repo.store.workspace().calendar!
  const current = currentPeriod(calendar, 'week', today.toInstant().toString())
  const period = precedingPeriod(calendar, current)!
  now = period.startAt
  run({ type: 'create', title: 'Historical direction https://example.com/link-preview-article', horizon: 'year', flowColor: 2 })
  const unfinished = run({ type: 'create', title: 'Weekly unfinished review item https://example.com/link-preview-article', horizon: 'week' }).itemId!
  const defaultMove = run({ type: 'create', title: 'Default weekly move https://x.com/trq212/status/2103576349499855160', horizon: 'week' }).itemId!
  const outline = seedOutline('week')
  now = current.startAt
  const parent = run({ type: 'create', title: 'Current monthly direction https://example.com/link-preview-article', horizon: 'month', flowColor: 0 }).itemId!
  const extraParent = run({ type: 'create', title: 'Additional monthly direction', horizon: 'month', flowColor: 1 }).itemId!
  const planningMonth = currentPeriod(calendar, 'month', now)
  now = today.toInstant().toString()
  const month = currentPeriod(calendar, 'month', now)
  const invitationParent = month.id === planningMonth.id ? parent
    : run({ type: 'create', title: 'New monthly invitation source', horizon: 'month', flowColor: 3 }).itemId!
  const monthKeys = [month, precedingPeriod(calendar, month)!].map(value => `month:${value.startDate}`)
  const boardOutline = seedOutline('week')
  writeFileSync(join(profile, 'review-fixture.json'), JSON.stringify({ mode, earlier, unfinished, defaultMove, parent, extraParent, invitationParent, period, current, monthKeys, outline, boardOutline }))
} else if (mode === 'cache' || mode === 'language') {
  const calendar = repo.store.workspace().calendar!
  const week = precedingPeriod(calendar, currentPeriod(calendar, 'week', today.toInstant().toString()))!
  const month = precedingPeriod(calendar, currentPeriod(calendar, 'month', today.toInstant().toString()))!
  // Weekly and monthly reminders can coexist. Give both scopes a real record.
  for (const period of [month, week].sort((a, b) => a.startAt.localeCompare(b.startAt))) {
    now = period.startAt
    run({ type: 'create', title: `Historical ${period.horizon} review record`, horizon: period.horizon })
  }
  now = today.toInstant().toString()
  if (mode === 'language') run({ type: 'create', title: 'Current monthly language record', horizon: 'month' })
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
  const outline = seedOutline('month')
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
  writeFileSync(join(profile, 'review-fixture.json'), JSON.stringify({ roots, done, move, keep, archive, rolled, laterDone, earlier, existing, period, weekly, outline }))
}
if (clockAt) {
  const file = join(profile, 'review-fixture.json'), fixture = JSON.parse(readFileSync(file, 'utf8'))
  const calendar = repo.store.workspace().calendar!
  writeFileSync(file, JSON.stringify({ ...fixture, clockAt, expiredWeek: precedingPeriod(calendar, currentPeriod(calendar, 'week', clockAt)) }))
}
db.close()
