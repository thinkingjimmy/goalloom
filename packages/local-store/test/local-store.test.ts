import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { currentPeriod as desktopPeriod, workspaceDate as desktopToday } from '../../../apps/desktop/src/domain/calendar'
import { buildParentOrder as desktopOrder } from '../../../apps/desktop/src/domain/parent-order'
import { noteSignal as desktopNote } from '../../../apps/desktop/src/shared/notes'
import {
  DEMO_NOW, LONG_PRESS_MS, buildParentOrder, canNest, classifyPointer, columnIndex, columnOutline, columnSections, currentPeriod, daysLeft, dropOnRows,
  flowColors, flowConnectors, flowSections, installSchema, nearbyPeriods, neighborsAfterRemoval, noteSignal, pageFromOffset, parseCapture,
  periodMeta, rowSwipeAction, showBreakpoint, userVersion, workspaceDate, type OrderNode, type SqlDriver,
} from '../src/index'
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
    expect(daysLeft(month, '2026-10-12')).toBe(20)
    expect(daysLeft(week, '2026-10-12')).toBe(7)
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
  })
})

function nodes(store: LocalWorkspace) {
  const snap = store.load(DEMO_NOW)
  return new Map(snap.items.map(item => [item.id, { id: item.id, flowColor: item.flowColor, nestingParentId: item.nestingParentId, horizon: item.horizon, status: item.status }]))
}
