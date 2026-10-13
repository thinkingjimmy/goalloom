import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { currentPeriod as desktopPeriod, workspaceDate as desktopToday } from '../../../apps/desktop/src/domain/calendar'
import { buildParentOrder as desktopOrder } from '../../../apps/desktop/src/domain/parent-order'
import { noteSignal as desktopNote } from '../../../apps/desktop/src/shared/notes'
import {
  APP_TABS, DEMO_NOW, FLOW_INDENT, LONG_PRESS_MS, OPEN_COLUMN, buildParentOrder, canNest, classifyPointer, columnIndex, columnOutline, columnSections, completionLabel, currentPeriod, daysLeft, dropOnRows,
  flowColors, flowConnectors, flowLeftLinks, flowSections, installSchema, nearbyPeriods, neighborsAfterRemoval, noteSignal, pageFromOffset, parseCapture,
  actionNotice, calendarAnchorVisible, filterTimeZones, friendlyZoneName, periodFromId, periodMeta, pinCurrentZone, readTimeZones, rowSwipeAction, sheetRelease, shouldDragSheet, showBreakpoint, syncPasswordReady, userVersion, withCaptureColumn, workspaceDate, type Glance, type ItemRow, type OrderNode, type SqlDriver, type UndoToken,
} from '../src/index'
import { catalogs } from '../../../apps/mobile/src/copy'
import { LocalWorkspace } from '../src/store'

function memory(): SqlDriver {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  return {
    exec(sql) { db.exec(sql) },
    prepare(sql) {
      const statement = db.prepare(sql)
      return {
        run(...params) { return { changes: Number(statement.run(...params).changes) } },
        get(...params) { return statement.get(...params) as Record<string, null | string | number> | undefined },
        all(...params) { return statement.all(...params) as Record<string, null | string | number>[] },
      }
    },
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE')
      try { const result = fn(); db.exec('COMMIT'); return result } catch (error) { db.exec('ROLLBACK'); throw error }
    },
  }
}

function workspace() {
  const driver = memory()
  installSchema(driver, 'device-1', DEMO_NOW)
  let n = 0
  const store = new LocalWorkspace(driver, () => `id-${++n}`)
  store.confirm(DEMO_NOW, { mode: 'natural', timezone: 'Asia/Shanghai', weekStart: 1 })
  return { driver, store }
}

describe('schema v10', () => {
  it('installs nesting and the sync shadow', () => {
    const driver = memory()
    installSchema(driver, 'device-1', DEMO_NOW)
    expect(userVersion(driver)).toBe(10)
    const columns = driver.prepare('PRAGMA table_info(item_placements)').all().map(row => row.name)
    expect(columns).toContain('nestingParentId')
    expect(driver.prepare("SELECT name FROM sqlite_master WHERE name='base_items'").get()?.name).toBe('base_items')
    expect(driver.prepare("SELECT name FROM sqlite_master WHERE name='sync_state'").get()?.name).toBe('sync_state')
  })
})

describe('calendar parity', () => {
  const calendar = { id: 'cal', mode: 'natural' as const, timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-01-01' }
  const rolling = { ...calendar, mode: 'rolling' as const, cycleAnchor: '2026-03-31', timezone: 'America/New_York' }
  for (const observed of ['2026-10-12T01:00:00.000Z', '2026-01-31T12:00:00.000Z', '2026-03-31T04:00:00.000Z']) {
    it(`matches desktop periods at ${observed}`, () => {
      expect(workspaceDate(calendar.timezone, observed)).toBe(desktopToday(calendar.timezone, observed))
      for (const horizon of ['year', 'half', 'cycle', 'month', 'week', 'day'] as const) {
        const ours = currentPeriod(calendar, horizon, observed)
        const theirs = desktopPeriod(calendar, horizon, observed)
        expect(ours.startDate).toBe(theirs.startDate)
        expect(ours.endDate).toBe(theirs.endDate)
        expect(ours.startAt).toBe(theirs.startAt)
        expect(ours.endAt).toBe(theirs.endAt)
      }
      expect(workspaceDate(rolling.timezone, '2026-10-12T01:00:00.000Z')).toBe(desktopToday(rolling.timezone, '2026-10-12T01:00:00.000Z'))
      const oursYear = currentPeriod(rolling, 'year', '2026-10-12T01:00:00.000Z')
      const theirsYear = desktopPeriod(rolling, 'year', '2026-10-12T01:00:00.000Z')
      expect(oursYear).toMatchObject({ startDate: theirsYear.startDate, endDate: theirsYear.endDate, startAt: theirsYear.startAt, endAt: theirsYear.endAt })
    })
  }

  it('keeps the Santiago spring-forward day', () => {
    const santiago = { id: 'scl', mode: 'natural' as const, timezone: 'America/Santiago', weekStart: 1, cycleAnchor: '2026-01-01' }
    for (const observed of ['2026-09-05T15:00:00Z', '2026-09-06T15:00:00Z', '2026-09-07T15:00:00Z', '2026-04-04T15:00:00Z', '2026-04-05T15:00:00Z', '2026-04-06T15:00:00Z']) {
      for (const horizon of ['day', 'week'] as const) {
        const ours = currentPeriod(santiago, horizon, observed)
        const theirs = desktopPeriod(santiago, horizon, observed)
        expect(ours.startDate).toBe(theirs.startDate)
        expect(ours.endDate).toBe(theirs.endDate)
        expect(ours.startAt).toBe(theirs.startAt)
        expect(ours.endAt).toBe(theirs.endAt)
      }
    }
    const around = nearbyPeriods(santiago, 'day', '2026-09-05T15:00:00Z', 3)
    expect(around.map(period => period.startDate)).toContain('2026-09-06')
  })

  it('labels the mockup day the way the desktop countdown does', () => {
    const day = currentPeriod(calendar, 'day', DEMO_NOW)
    const week = currentPeriod(calendar, 'week', DEMO_NOW)
    const month = currentPeriod(calendar, 'month', DEMO_NOW)
    expect(periodMeta('day', day, '2026-10-12').meta).toBe('10月12日 周一')
    expect(periodMeta('week', week, '2026-10-12').meta).toBe('10/12–10/18')
    expect(periodMeta('week', week, '2026-10-12').meta).not.toMatch(/2026/)
    expect(periodMeta('day', day, '2026-10-12').meta).not.toMatch(/2026/)
    expect(daysLeft(month, '2026-10-12')).toBe(20)
    expect(daysLeft(week, '2026-10-12')).toBe(7)
  })

  it('writes a year on a range only when the range crosses a year', () => {
    const same = { id: 'w', horizon: 'week' as const, startDate: '2026-10-12', endDate: '2026-10-19', startAt: '', endAt: '' }
    const cross = { id: 'x', horizon: 'week' as const, startDate: '2026-12-28', endDate: '2027-01-04', startAt: '', endAt: '' }
    const half = { id: 'h', horizon: 'half' as const, startDate: '2026-10-01', endDate: '2027-04-01', startAt: '', endAt: '' }
    expect(periodMeta('week', same, '2026-10-12').meta).toBe('10/12–10/18')
    expect(periodMeta('week', cross, '2026-12-30').meta).toBe('2026/12/28–2027/1/3')
    expect(periodMeta('half', half, '2026-12-30').meta).toBe('2026年10月–2027年3月')
  })
})

describe('notes and order', () => {
  it('matches the desktop note signal', () => {
    const samples = ['', '  ', '优先岚山附近', '- [ ] 对照\n- [x] 手势\nhttps://example.com/a', '```\n- [ ] hidden\n```\n可见']
    for (const sample of samples) expect(noteSignal(sample)).toEqual(desktopNote(sample))
  })

  it('matches desktop parent order', () => {
    const nodes: OrderNode[] = [
      { id: 'root', horizon: 'year', periodId: 'y', sortKey: 0, nestingParentId: null, periodStart: '2026-01-01', periodEnd: '2027-01-01T00:00:00Z' },
      { id: 'a', horizon: 'day', periodId: 'd', sortKey: 2, nestingParentId: null, periodStart: '2026-10-12', periodEnd: '2026-10-13T00:00:00Z' },
      { id: 'b', horizon: 'day', periodId: 'd', sortKey: 1, nestingParentId: null, periodStart: '2026-10-12', periodEnd: '2026-10-13T00:00:00Z' },
    ]
    const edges = [{ parentId: 'root', childId: 'b' }]
    const now = DEMO_NOW
    expect(buildParentOrder(nodes, edges, now).sort(nodes).map(node => node.id)).toEqual(desktopOrder(nodes, edges, now).sort(nodes).map(node => node.id))
  })
})

describe('gestures', () => {
  it('never assigns a horizontal action to a row', () => {
    expect(rowSwipeAction()).toBeNull()
    expect(LONG_PRESS_MS).toBe(450)
  })

  it('pages between columns and opens on today', () => {
    expect(pageFromOffset(0, 377)).toBe(0)
    expect(pageFromOffset(377 * 5, 377)).toBe(5)
    expect(pageFromOffset(377 * 5 + 200, 377)).toBe(6)
    expect(pageFromOffset(9000, 377)).toBe(6)
  })

  it('keeps a flick as paging and a held finger as drag', () => {
    expect(classifyPointer(0, 0, 100)).toBe('pending')
    expect(classifyPointer(40, 4, 100)).toBe('paging')
    expect(classifyPointer(2, 30, 80)).toBe('scroll')
    expect(classifyPointer(0, 0, 450)).toBe('drag')
    expect(classifyPointer(20, 40, 500)).toBe('drag')
  })

  it('lists the current period between earlier and later ones', () => {
    const calendar = { id: 'cal', mode: 'natural' as const, timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-01-01' }
    const periods = nearbyPeriods(calendar, 'day', DEMO_NOW, 2)
    expect(periods.map(period => period.startDate)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'])
  })

  it('orders column groups by sort key and parent order', () => {
    const items = [
      { id: 'third', status: 'todo', sortKey: 3, nestingParentId: null },
      { id: 'first', status: 'todo', sortKey: 1, nestingParentId: null },
      { id: 'second', status: 'todo', sortKey: 2, nestingParentId: null },
      { id: 'child', status: 'done', sortKey: 0, nestingParentId: 'third' },
    ]
    expect(columnSections(items).todo.map(item => item.id)).toEqual(['first', 'second', 'third', 'child'])
    const parentFirst = (a: string, b: string) => a === 'third' ? -1 : b === 'third' ? 1 : a < b ? -1 : 1
    expect(columnSections(items, parentFirst).todo.map(item => item.id)).toEqual(['third', 'child', 'first', 'second'])
  })

  it('colors a goal child of a nested subtask', () => {
    const nodes = new Map([
      ['root', { id: 'root', flowColor: 2, nestingParentId: null, horizon: 'year' as const, status: 'todo' }],
      ['box', { id: 'box', flowColor: null, nestingParentId: null, horizon: 'month' as const, status: 'todo' }],
      ['step', { id: 'step', flowColor: null, nestingParentId: 'box', horizon: 'month' as const, status: 'todo' }],
      ['note', { id: 'note', flowColor: null, nestingParentId: null, horizon: 'day' as const, status: 'todo' }],
    ])
    const edges = [{ parentId: 'root', childId: 'box' }, { parentId: 'step', childId: 'note' }]
    expect(flowColors('note', nodes, edges)).toEqual([2])
    expect(flowColors('step', nodes, edges)).toEqual([2])
  })

  it('drops a downward drag before the following row', () => {
    expect(neighborsAfterRemoval(['a', 'b', 'c'], 'a', 2)).toEqual({ beforeId: 'b', afterId: 'c' })
    expect(neighborsAfterRemoval(['a', 'b', 'c'], 'c', 0)).toEqual({ beforeId: null, afterId: 'a' })
    expect(neighborsAfterRemoval(['a', 'b', 'c'], 'c', 3)).toEqual({ beforeId: 'b', afterId: null })
  })

  it('opens the day column among the visible columns', () => {
    expect(columnIndex(['month', 'week', 'day', 'later'], 'day')).toBe(2)
    expect(columnIndex(['later'], 'day')).toBe(0)
  })

  it('nests in the middle of a row and reorders at the edge', () => {
    const rows = [{ id: 'a', y: 0, height: 44, canNest: true }, { id: 'b', y: 44, height: 44, canNest: false }]
    expect(dropOnRows(rows, 22)).toEqual({ kind: 'nest', parentId: 'a' })
    expect(dropOnRows(rows, 2)).toEqual({ kind: 'reorder', index: 0 })
    expect(dropOnRows(rows, 50)).toEqual({ kind: 'reorder', index: 1 })
    expect(dropOnRows(rows, 84)).toEqual({ kind: 'reorder', index: 2 })
    expect(dropOnRows(rows, 100)).toEqual({ kind: 'reorder', index: 2 })
  })
})

describe('capture', () => {
  it('splits the mockup sentence into editable drafts', () => {
    const parents = [
      { id: 'kyoto', title: '带爸妈去一次京都', horizon: 'year' as const },
      { id: 'books', title: '读完 24 本书', horizon: 'year' as const },
    ]
    const drafts = parseCapture('周五前订京都酒店，然后每天读 30 页 #学习', '2026-10-12', parents)
    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({ title: '订京都酒店', horizon: 'week', dueDate: '2026-10-16', parentId: 'kyoto' })
    expect(drafts[1]).toMatchObject({ title: '读 30 页', horizon: 'day', parentId: 'books' })
    const placed = withCaptureColumn(drafts, 'month')
    expect(placed[0]?.horizon).toBe('week')
    expect(placed[1]?.horizon).toBe('day')
    expect(withCaptureColumn([{ title: '记一下', horizon: 'later', dueDate: null, parentId: null }], 'week')[0]?.horizon).toBe('week')
  })
})

describe('workspace', () => {
  it('refuses item writes before calendar confirmation', () => {
    const driver = memory()
    installSchema(driver, 'device-1', DEMO_NOW)
    const store = new LocalWorkspace(driver, () => 'x')
    expect(() => store.create(DEMO_NOW, { title: '早了', horizon: 'day' })).toThrow(/setup/)
  })

  it('locks the calendar, nests one level, and restores a later move', () => {
    const { store, driver } = workspace()
    expect(() => store.confirm(DEMO_NOW, { mode: 'rolling', timezone: 'Asia/Shanghai', weekStart: 1 })).toThrow(/calendar-locked/)
    const root = store.create(DEMO_NOW, { title: '一年目标', horizon: 'year', flowColor: 1 }).id
    const child = store.create(DEMO_NOW, { title: '今天的一步', horizon: 'day', parentId: root }).id
    expect(flowColors(child, nodes(store), store.load(DEMO_NOW).relations)).toEqual([1])
    const nested = store.create(DEMO_NOW, { title: '子条目', horizon: 'day', nestingParentId: child }).id
    expect(() => store.create(DEMO_NOW, { title: '太深', horizon: 'day', nestingParentId: nested })).toThrow(/two outline/)
    expect(columnOutline(store.load(DEMO_NOW).items.filter(item => item.horizon === 'day')).map(item => item.title)).toEqual(['今天的一步', '子条目'])
    store.setStatus(DEMO_NOW, nested, 'done')
    const openParent = columnSections(store.load(DEMO_NOW).items.filter(item => item.horizon === 'day'))
    expect(openParent.todo.map(item => item.title)).toEqual(['今天的一步', '子条目'])
    expect(openParent.done).toEqual([])
    store.setStatus(DEMO_NOW, child, 'done')
    const finished = columnSections(store.load(DEMO_NOW).items.filter(item => item.horizon === 'day'))
    expect(finished.todo).toEqual([])
    expect(finished.done.map(item => item.title)).toEqual(['今天的一步', '子条目'])
    const undo = store.move(DEMO_NOW, child, 'later', null)
    const moved = store.load(DEMO_NOW)
    expect(moved.relations.some(edge => edge.childId === child)).toBe(false)
    expect(moved.items.find(item => item.id === child)?.horizon).toBe('later')
    store.undo(DEMO_NOW, undo)
    const restored = store.load(DEMO_NOW)
    expect(restored.items.find(item => item.id === child)?.horizon).toBe('day')
    expect(restored.relations.some(edge => edge.parentId === root && edge.childId === child)).toBe(true)
    expect(driver.prepare('SELECT COUNT(*) AS n FROM base_items').get()?.n).toBe(driver.prepare('SELECT COUNT(*) AS n FROM items').get()?.n)
  })

  it('rejects a same-horizon link and a cycle, and undoes trash', () => {
    const { store } = workspace()
    const a = store.create(DEMO_NOW, { title: '甲', horizon: 'day' }).id
    const b = store.create(DEMO_NOW, { title: '乙', horizon: 'day' }).id
    expect(() => store.link(DEMO_NOW, a, b)).toThrow(/horizon/)
    const year = store.create(DEMO_NOW, { title: '年', horizon: 'year', flowColor: 0 }).id
    store.link(DEMO_NOW, year, a)
    expect(() => store.link(DEMO_NOW, a, year)).toThrow(/cycle|horizon/)
    const undo = store.trash(DEMO_NOW, b)
    expect(store.load(DEMO_NOW).items.some(item => item.id === b)).toBe(false)
    store.undo(DEMO_NOW, undo)
    expect(store.load(DEMO_NOW).trash.some(item => item.id === b)).toBe(false)
    expect(store.load(DEMO_NOW).items.some(item => item.id === b)).toBe(true)
    const deletedAt = '2026-10-13T01:00:00.000Z'
    store.trash(deletedAt, b)
    const restore = store.restore(DEMO_NOW, b)
    expect(store.load(DEMO_NOW).items.some(item => item.id === b)).toBe(true)
    store.undo(DEMO_NOW, restore)
    const again = store.load(DEMO_NOW).trash.find(item => item.id === b)
    expect(again?.deletedAt).toBe(deletedAt)
    expect(store.load(DEMO_NOW).items.some(item => item.id === b)).toBe(false)
  })

  it('rolls an automatic column forward and keeps a manual backlog', () => {
    const { store } = workspace()
    const snap = store.load(DEMO_NOW)
    const past = { id: `${snap.calendar!.id}:day:2026-10-11`, horizon: 'day' as const, startDate: '2026-10-11', endDate: '2026-10-12', startAt: '2026-10-10T16:00:00Z', endAt: snap.periods.day!.startAt }
    store.savePeriod(past)
    store.create(DEMO_NOW, { title: '会自动过来', horizon: 'day', periodId: past.id })
    expect(store.load(DEMO_NOW).items.find(item => item.title === '会自动过来')?.periodId).toBe(snap.periods.day!.id)
    store.setPolicy('day', 'manual')
    store.create(DEMO_NOW, { title: '留在往期', horizon: 'day', periodId: past.id })
    const next = store.load(DEMO_NOW)
    expect(next.backlog.map(item => item.title)).toContain('留在往期')
    expect(next.items.find(item => item.title === '留在往期')?.periodId).toBe(past.id)
  })

  it('deletes a parent that still has a goal and a subtask', () => {
    const { store } = workspace()
    const root = store.create(DEMO_NOW, { title: '年', horizon: 'year', flowColor: 1 }).id
    const parent = store.create(DEMO_NOW, { title: '父', horizon: 'week', parentId: root }).id
    const child = store.create(DEMO_NOW, { title: '子', horizon: 'week', nestingParentId: parent }).id
    const undo = store.trash(DEMO_NOW, parent)
    const trashed = store.load(DEMO_NOW)
    expect(trashed.items.some(item => item.id === parent)).toBe(false)
    expect(trashed.trash.some(item => item.id === parent)).toBe(true)
    expect(trashed.items.find(item => item.id === child)?.nestingParentId).toBeNull()
    expect(trashed.relations.some(edge => edge.parentId === root && edge.childId === child)).toBe(true)
    store.undo(DEMO_NOW, undo)
    const restored = store.load(DEMO_NOW)
    expect(restored.trash.some(item => item.id === parent)).toBe(false)
    expect(restored.items.find(item => item.id === child)?.nestingParentId).toBe(parent)
    expect(restored.relations.some(edge => edge.parentId === root && edge.childId === parent)).toBe(true)
    expect(restored.relations.some(edge => edge.parentId === root && edge.childId === child)).toBe(false)
  })

  it('moves nested subtasks with their parent', () => {
    const { store } = workspace()
    const parent = store.create(DEMO_NOW, { title: '父', horizon: 'week' }).id
    const child = store.create(DEMO_NOW, { title: '子', horizon: 'week', nestingParentId: parent }).id
    store.move(DEMO_NOW, parent, 'day', null)
    const snap = store.load(DEMO_NOW)
    const parentRow = snap.items.find(item => item.id === parent)
    const childRow = snap.items.find(item => item.id === child)
    expect(parentRow?.horizon).toBe('day')
    expect(childRow?.horizon).toBe('day')
    expect(childRow?.periodId).toBe(parentRow?.periodId)
    expect(childRow?.nestingParentId).toBe(parent)
  })

  it('copies the container goal when a subtask leaves', () => {
    const { store } = workspace()
    const root = store.create(DEMO_NOW, { title: '一年', horizon: 'year', flowColor: 4 }).id
    const parent = store.create(DEMO_NOW, { title: '本周容器', horizon: 'week', parentId: root }).id
    const child = store.create(DEMO_NOW, { title: '子步骤', horizon: 'week', nestingParentId: parent }).id
    store.move(DEMO_NOW, child, 'day', null)
    const snap = store.load(DEMO_NOW)
    expect(snap.items.find(item => item.id === child)?.nestingParentId).toBeNull()
    expect(snap.relations.some(edge => edge.parentId === root && edge.childId === child)).toBe(true)
    expect(flowColors(child, nodes(store), snap.relations)).toContain(4)
  })

  it('refuses to undo a move after the item was nested', () => {
    const { store } = workspace()
    const parent = store.create(DEMO_NOW, { title: '容器', horizon: 'day' }).id
    const task = store.create(DEMO_NOW, { title: '一步', horizon: 'week' }).id
    const undo = store.move(DEMO_NOW, task, 'day', null)
    store.nest(DEMO_NOW, task, parent)
    expect(() => store.undo(DEMO_NOW, undo)).toThrow(/conflict/)
    const row = store.load(DEMO_NOW).items.find(item => item.id === task)
    expect(row?.nestingParentId).toBe(parent)
    expect(row?.horizon).toBe('day')
  })

  it('holds an undone todo in an expired period', () => {
    const { store } = workspace()
    const periodId = store.load(DEMO_NOW).periods.day!.id
    const id = store.create(DEMO_NOW, { title: '过期', horizon: 'day' }).id
    const undo = store.setStatus(DEMO_NOW, id, 'done')
    const later = '2026-10-20T01:00:00.000Z'
    store.undo(later, undo)
    const row = store.load(later).items.find(item => item.id === id)
    expect(row?.status).toBe('todo')
    expect(row?.periodId).toBe(periodId)
    expect(row?.holdPeriodId).toBe(store.load(later).periods.day!.id)
  })

  it('persists a future period before create', () => {
    const { store } = workspace()
    const calendar = store.load(DEMO_NOW).calendar!
    const future = nearbyPeriods(calendar, 'week', DEMO_NOW, 4).find(period => period.startDate > '2026-10-18')
    expect(future).toBeTruthy()
    expect(() => store.create(DEMO_NOW, { title: '下周', horizon: 'week', periodId: future!.id })).toThrow(/period/)
    store.savePeriod(future!)
    const id = store.create(DEMO_NOW, { title: '下周', horizon: 'week', periodId: future!.id }).id
    expect(store.load(DEMO_NOW).items.find(item => item.id === id)?.periodId).toBe(future!.id)
  })

  it('shows a breakpoint only when the next column has no child', () => {
    const { store } = workspace()
    const root = store.create(DEMO_NOW, { title: '读书', horizon: 'year', flowColor: 2 }).id
    const month = store.create(DEMO_NOW, { title: '设计心理学', horizon: 'month', parentId: root }).id
    const map = nodes(store)
    expect(showBreakpoint(month, map, store.load(DEMO_NOW).relations)).toBe(true)
    store.create(DEMO_NOW, { title: '笔记', horizon: 'week', parentId: month })
    expect(showBreakpoint(month, nodes(store), store.load(DEMO_NOW).relations)).toBe(false)
    expect(canNest(month, root, nodes(store), store.load(DEMO_NOW).relations)).toBe(false)
  })

  it('groups a flow without indent and dashes a skipped column', () => {
    const rows = [
      { id: 'y', horizon: 'year' as const, done: false },
      { id: 'd', horizon: 'day' as const, done: true },
    ]
    expect(flowSections(rows).map(section => section.horizon)).toEqual(['year', 'day'])
    expect(flowConnectors(rows)).toEqual([{ from: 'y', to: 'd', skip: true, dim: true }])
    const rail = [
      { id: 'y', horizon: 'year' as const, done: false, color: 1 },
      { id: 'h', horizon: 'half' as const, done: false, color: null },
      { id: 'd', horizon: 'day' as const, done: true, color: null },
    ]
    expect(FLOW_INDENT).toBe(0)
    expect(flowLeftLinks(rail, [])).toEqual([])
    expect(flowLeftLinks(rail, [{ parentId: 'y', childId: 'd' }])).toEqual([{ from: 'y', to: 'd', skip: true, dim: true, color: 1 }])
    expect(flowLeftLinks(rail, [{ parentId: 'y', childId: 'h' }])).toEqual([{ from: 'y', to: 'h', skip: false, dim: false, color: 1 }])
  })

  it('opens on today, has no Today tab, and shows 1/5 only on a note', () => {
    expect(OPEN_COLUMN).toBe('day')
    expect(APP_TABS).toEqual(['board', 'flow', 'settings'])
    expect(APP_TABS).not.toContain('today')
    expect(completionLabel('note', 1, 5)).toBe('1/5')
    expect(completionLabel('fold', 1, 5)).toBe('1')
    expect(completionLabel('header', 1, 5)).toBeNull()
    expect(completionLabel('note', 0, 0)).toBeNull()
  })

  it('closes a sheet on a far or fast pull and springs back otherwise', () => {
    expect(shouldDragSheet(12, 2, 80, 10)).toBe(true)
    expect(shouldDragSheet(12, 2, 80, 90)).toBe(false)
    expect(shouldDragSheet(12, 2, 0, 90)).toBe(true)
    expect(shouldDragSheet(12, 2, 1, 90)).toBe(true)
    expect(shouldDragSheet(12, 2, 2, 90)).toBe(false)
    expect(shouldDragSheet(-12, 2, 0, 90)).toBe(false)
    expect(shouldDragSheet(4, 1, 0, 10)).toBe(false)
    expect(shouldDragSheet(10, 24, 0, 90)).toBe(false)
    expect(sheetRelease(20, 0.2, 500)).toBe(false)
    expect(sheetRelease(150, 0.2, 500)).toBe(true)
    expect(sheetRelease(20, 0.9, 500)).toBe(true)
    expect(sheetRelease(50, 0, 200)).toBe(false)
    expect(sheetRelease(60, 0, 200)).toBe(true)
  })

  it('hides the rolling start date for a natural year and checks a new sync password', () => {
    expect(calendarAnchorVisible('rolling')).toBe(true)
    expect(calendarAnchorVisible('natural')).toBe(false)
    expect(syncPasswordReady('short', 'short')).toBe(false)
    expect(syncPasswordReady('long-enough', 'different')).toBe(false)
    expect(syncPasswordReady('  long-enough ', 'long-enough')).toBe(true)
    expect(syncPasswordReady('x'.repeat(129), 'x'.repeat(129))).toBe(false)
  })

  it('matches desktop toasts: create, move and complete stay quiet', () => {
    const copy = catalogs.zh
    const board = { today: '2026-10-12', calendar: { mode: 'rolling' as const }, periods: { day: samplePeriod } }
    const here: Glance = { tab: 'board', horizon: 'day', periodId: samplePeriod.id, columns: ['year', 'half', 'cycle', 'month', 'week', 'day'], doneOpen: false }
    const undo: UndoToken = { kind: 'trash', id: '1' }
    for (const action of ['create', 'move', 'reorder', 'edit', 'flow', 'link', 'unlink', 'policy', 'appearance', 'backup', 'complete'] as const) {
      expect(actionNotice(copy, action, sampleItem(), undo, here, board)).toBeNull()
    }
    expect(actionNotice(copy, 'delete', sampleItem(), null, here, board)).toBeNull()
    const deleted = actionNotice(copy, 'delete', sampleItem(), undo, here, board)
    expect(deleted).toMatchObject({ text: '已删除「甲」', detail: null, durationMs: 6000, label: '删除' })
    expect(deleted?.undo).toBe(undo)
    expect(actionNotice(copy, 'nest', sampleItem(), { kind: 'placement', id: '1' }, here, board)?.text).toBe('已设为二级 todo「甲」')
    expect(actionNotice(copy, 'reopen', sampleItem({ status: 'done' }), { kind: 'status', id: '1', status: 'done' }, here, board)).toBeNull()
    const away = actionNotice(copy, 'reopen', sampleItem({ status: 'done' }), { kind: 'status', id: '1', status: 'done' }, { ...here, tab: 'flow' }, board)
    expect(away?.text).toBe('已重开「甲」')
    expect(away?.detail).toBe('位置：今天 · 列已隐藏')
    expect(away?.undo).toBeTruthy()
    const past = actionNotice(copy, 'reopen', sampleItem({ status: 'done', periodId: 'cal:day:2026-10-11' }), { kind: 'status', id: '1', status: 'done' }, here, board)
    expect(past?.detail).toContain('往期')
    expect(past?.detail).toContain('当前视图未显示')
    expect(past?.detail).not.toContain('已完成')
    const restored = actionNotice(copy, 'restore', sampleItem(), { kind: 'restore', id: '1', deletedAt: DEMO_NOW }, here, board)
    expect(restored?.text).toBe('已还原「甲」')
    expect(restored?.detail).toBe('位置：今天')
    expect(catalogs.en.applied(catalogs.en.actionDelete, '甲')).toBe('Move to trash · “甲”')
    expect(catalogs.en.undone(catalogs.en.actionDelete, '甲')).toBe('Undone · Move to trash “甲”')
    expect(periodFromId('day', 'cal:day:2026-10-11')?.startDate).toBe('2026-10-11')
  })

  it('does not use the word 继承 in any locale', () => {
    for (const copy of Object.values(catalogs)) {
      const text = Object.values(copy).map(value => typeof value === 'function' ? value.toString() : String(value)).join('\n')
      expect(text).not.toContain('继承')
    }
  })
})

const samplePeriod = { id: 'cal:day:2026-10-12', horizon: 'day' as const, startDate: '2026-10-12', endDate: '2026-10-13', startAt: '', endAt: '' }

describe('time zone search', () => {
  const zones = ['Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'America/New_York', 'Europe/Paris', 'UTC']
  const names: Record<string, readonly string[]> = {
    'Asia/Singapore': ['新加坡'],
    'Asia/Shanghai': ['上海'],
    'Asia/Tokyo': ['东京', 'Tokyo'],
    'America/New_York': ['纽约'],
    'Europe/Paris': ['巴黎'],
  }
  const search = (query: string) => filterTimeZones(zones, query, id => names[id] ?? [])

  it('matches the zone id, the city, and localized names', () => {
    expect(search('Asia/')).toEqual(['Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo'])
    expect(search('ASIA/tokyo')).toEqual(['Asia/Tokyo'])
    expect(search('tokyo')).toEqual(['Asia/Tokyo'])
    expect(search('Tokyo')).toEqual(['Asia/Tokyo'])
    expect(search('new york')).toEqual(['America/New_York'])
    expect(search('新加坡')).toEqual(['Asia/Singapore'])
    expect(search('上海')).toEqual(['Asia/Shanghai'])
    expect(search('  ')).toEqual(zones)
    expect(search('Europe/')).toEqual(['Europe/Paris'])
    expect(pinCurrentZone(search('Asia/'), 'Asia/Singapore')).toEqual(['Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo'])
    expect(pinCurrentZone(search('Europe/'), 'Asia/Singapore')).toEqual(['Europe/Paris'])
  })

  it('uses the bundled IANA list when the runtime cannot list time zones', () => {
    const bundled = readTimeZones(() => { throw new Error('unsupported') })
    expect(bundled.length).toBeGreaterThan(400)
    expect(bundled).toContain('Asia/Shanghai')
    expect(bundled).toContain('Asia/Singapore')
    expect(readTimeZones(() => ['Asia/Singapore'])).toContain('Europe/Paris')
    const custom = Array.from({ length: 100 }, (_, index) => `Zone/${index}`)
    expect(readTimeZones(() => custom)).toEqual(custom)
    expect(friendlyZoneName('Asia/Shanghai', 'zh')).toBe('上海')
    expect(friendlyZoneName('Asia/Singapore', 'zh')).toBe('新加坡')
    expect(friendlyZoneName('Asia/Tokyo', 'en')).toBe('Tokyo')
    expect(friendlyZoneName('America/New_York', 'en')).toBe('New York')
    const localize = (id: string) => [friendlyZoneName(id, 'zh')]
    expect(filterTimeZones(bundled, '上海', localize)).toContain('Asia/Shanghai')
    expect(filterTimeZones(bundled, '新加坡', localize)).toContain('Asia/Singapore')
    expect(filterTimeZones(bundled, 'Asia/', localize).every(id => id.startsWith('Asia/'))).toBe(true)
  })
})

function sampleItem(patch: Partial<ItemRow> = {}): ItemRow {
  return {
    id: '1', title: '甲', description: '', dueDate: null, status: 'todo', completedAt: null, archivedAt: null, deletedAt: null,
    createdAt: DEMO_NOW, updatedAt: DEMO_NOW, version: 1, flowColor: null, horizon: 'day', periodId: samplePeriod.id, sortKey: 1,
    placementVersion: 1, nestingParentId: null, holdPeriodId: null, note: null, ...patch,
  }
}

function nodes(store: LocalWorkspace) {
  const snap = store.load(DEMO_NOW)
  return new Map(snap.items.map(item => [item.id, { id: item.id, flowColor: item.flowColor, nestingParentId: item.nestingParentId, horizon: item.horizon, status: item.status }]))
}
