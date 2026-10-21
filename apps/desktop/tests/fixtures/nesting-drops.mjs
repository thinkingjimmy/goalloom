/**
 * [INPUT]: Native Electron page, production IPC and isolated subtask evidence.
 * [OUTPUT]: Whole-group geometry, atomic root-edge detachment, ordered flattening, checkbox-aligned insertion, guarded receipts and clipped virtual-list evidence.
 * [POS]: Subtask drag journey; all tasks and injected transport failures are synthetic.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pollPage } from './poll.mjs'
import { stepPeriod } from './period-step.mjs'
import { setCompletedLayout } from './completed-layout.mjs'

export async function nestingDrops({ page, application, report, evidence }) {
  const created = []
  // PointerSensor keeps its click capture for 50ms after release; use a held native click for immediate feedback actions.
  const feedbackClick = { delay: 60 }
  const execute = action => page.evaluate(async action => {
    const snapshot = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ ...action, generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return reply.result
  }, action)
  const create = async (title, horizon = 'week', extra = {}) => {
    const id = (await execute({ type: 'create', title, horizon, ...extra })).itemId
    created.push(id); return id
  }
  const item = id => page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
  const nest = async (id, parentId) => {
    const source = await item(id), parent = await item(parentId)
    return execute({ type: 'nest', itemId: id, parentId, expectedVersion: source.version, expectedParentVersion: parent.version,
      expectedPlacementVersion: source.placement.version, expectedParentPlacementVersion: parent.placement.version })
  }
  const row = id => page.locator(`#item-${id}`)
  const settled = () => page.waitForFunction(() => !document.documentElement.dataset.dragging && !document.querySelector('.fab').disabled)
  const order = async (parentId, expected) => {
    await pollPage(page, async ({ parentId, expected }) => {
      const snapshot = await window.goalloom.getSnapshot()
      return JSON.stringify(snapshot.items.filter(item => item.placement.nestingParentId === parentId).map(item => item.id)) === JSON.stringify(expected)
    }, { parentId, expected })
    await page.waitForFunction(expected => {
      const ids = [...document.querySelectorAll('.task-row')].map(node => node.dataset.itemId).filter(id => expected.includes(id))
      return JSON.stringify(ids) === JSON.stringify(expected)
    }, expected)
    await settled()
  }
  const begin = async (sourceId, targetId, position = 'middle', fraction = .5) => {
    await row(sourceId).scrollIntoViewIfNeeded(); await row(targetId).scrollIntoViewIfNeeded()
    await row(sourceId).locator('.task-title').focus()
    const source = await row(sourceId).boundingBox()
    await page.mouse.move(source.x + 100, source.y + 12); await page.mouse.down()
    await page.mouse.move(source.x + 112, source.y + 12)
    await page.locator('.drag-overlay').waitFor()
    const target = await row(targetId).boundingBox()
    await page.mouse.move(target.x + 100, position === 'before' ? target.y + 3 : position === 'after' ? target.y + target.height - 3 : target.y + target.height * fraction, { steps: 12 })
    return target
  }
  const clean = async () => {
    assert.equal(await page.locator('[data-sort-position], [data-nesting-target], .nesting-drop-preview').count(), 0)
  }
  const undo = async () => {
    await page.keyboard.press('ControlOrMeta+z'); await settled()
    await page.locator('.toast').filter({ hasText: '已撤销' }).waitFor()
    await page.locator('.toast button').last().click(feedbackClick)
  }
  const shot = async name => {
    const path = join(evidence, `group-${name}.png`)
    await page.screenshot({ path }); report.screenshots.push(path)
  }
  const insertionLine = async (id, side) => {
    const geometry = await row(id).evaluate((node, side) => {
      const bounds = node.getBoundingClientRect(), rowStyle = getComputedStyle(node)
      const line = getComputedStyle(node, side === 'before' ? '::before' : '::after')
      return { horizon: node.closest('[data-horizon]').dataset.horizon, side, nested: node.dataset.sortNested,
        row: bounds.toJSON(), checkbox: node.querySelector('.check').getBoundingClientRect().toJSON(), inset: line.left,
        line: { x: bounds.left + parseFloat(rowStyle.borderLeftWidth) + parseFloat(line.left),
          y: side === 'before' ? bounds.top + parseFloat(rowStyle.borderTopWidth) + parseFloat(line.top)
            : bounds.bottom - parseFloat(rowStyle.borderBottomWidth) - parseFloat(line.bottom) - parseFloat(line.height) } }
    }, side)
    report.insertionLines.push(geometry)
    return geometry
  }
  const childInsertion = async (id, side) => {
    await row(id).locator(`:scope[data-sort-position="${side}"][data-sort-nested="true"]`).waitFor()
    const geometry = await insertionLine(id, side)
    await shot(`${geometry.horizon}-${report.insertionLines.length}-insertion-preview`)
    assert(Math.abs(geometry.line.x - geometry.checkbox.x) < 1, 'A child insertion line starts at the child checkbox, including the column flow gutter')
    return geometry
  }
  report.groupDrops = []
  report.insertionLines = []
  const todayGoal = await create('Today outline goal', 'week', { flowColor: 1 })
  const todayParent = await create('Today container', 'day', { parentId: todayGoal, expectedParentVersion: (await item(todayGoal)).version })
  const todayChild = await create('Today child to make independent', 'day', { description: 'Keep these notes', dueDate: '2030-01-01' })
  const todaySibling = await create('Today remaining child', 'day')
  const todayOther = await create('Today other root', 'day')
  await nest(todayChild, todayParent); await nest(todaySibling, todayParent)
  const todayOrder = async expected => {
    await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('[data-horizon="day"] .task-row')]
      .map(node => node.dataset.itemId).filter(id => expected.includes(id))) === JSON.stringify(expected), expected)
    await settled()
  }
  const originalToday = [todayParent, todayChild, todaySibling, todayOther]
  await todayOrder(originalToday)
  for (const test of [
    { name: 'head', target: todayParent, side: 'before', expected: [todayChild, todayParent, todaySibling, todayOther] },
    { name: 'middle', target: todayParent, side: 'after', expected: [todayParent, todaySibling, todayChild, todayOther] },
    { name: 'tail', target: todayOther, side: 'after', expected: [todayParent, todaySibling, todayOther, todayChild] },
  ]) {
    const before = await item(todayChild)
    await begin(todayChild, test.target, test.side)
    const marker = page.locator('[data-sort-position][data-sort-nested="false"]')
    await marker.waitFor()
    const geometry = await insertionLine(await marker.getAttribute('data-item-id'), await marker.getAttribute('data-sort-position'))
    assert.equal(geometry.line.x, geometry.row.x)
    await shot(`today-independent-${test.name}-preview`)
    await page.mouse.up(); await todayOrder(test.expected); await clean()
    const independent = await item(todayChild)
    assert.equal(independent.placement.nestingParentId, null)
    assert.equal(await page.locator('.toast').count(), 0, 'Root-edge detachment stays quiet like other placement drags')
    assert.deepEqual([independent.title, independent.description, independent.dueDate, independent.status, independent.placement.periodId],
      [before.title, before.description, before.dueDate, before.status, before.placement.periodId])
    const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
    assert(snapshot.relations.some(edge => edge.parentId === todayGoal && edge.childId === todayChild && !edge.inheritedFrom))
    assert.equal((await item(todaySibling)).placement.nestingParentId, todayParent)
    await shot(`today-independent-${test.name}`)
    await undo(); await todayOrder(originalToday)
    report.groupDrops.push({ kind: `today-independent-${test.name}`, expected: test.expected, geometry })
  }
  const unchangedToday = await item(todayChild)
  await begin(todayChild, todayOther, 'after'); await page.keyboard.press('Escape'); await page.mouse.up(); await settled(); await clean()
  assert.deepEqual(await item(todayChild), unchangedToday)
  await begin(todayChild, todayOther, 'after'); await page.mouse.up()
  await todayOrder([todayParent, todaySibling, todayOther, todayChild])
  await page.reload(); await page.locator('.board').waitFor()
  await todayOrder([todayParent, todaySibling, todayOther, todayChild])
  assert.equal((await item(todayChild)).placement.nestingParentId, null)
  report.checks.push('Today child root-edge drops detach at head/middle/tail with full-width markers, inherited goals, unchanged content and one-step undo')
  for (const id of created.splice(0).reverse()) {
    const value = await item(id)
    await execute({ type: 'delete', itemId: id, expectedVersion: value.version })
  }
  await settled()
  const parent = await create('Container A'), first = await create('Child A1'), second = await create('Child A2')
  const source = await create('Independent B', 'day'), other = await create('Container C'), cousin = await create('Child C1')
  await nest(first, parent); await nest(second, parent); await nest(cousin, other)
  await order(parent, [first, second])

  for (const [targetId, fraction] of [[first, .35], [second, .65]]) {
    await begin(source, targetId, 'middle', fraction)
    const preview = page.locator(`.nesting-drop-preview[data-nesting-group="${parent}"]`)
    await preview.waitFor()
    const bounds = await preview.boundingBox(), root = await row(parent).boundingBox(), last = await row(second).boundingBox()
    assert(Math.abs(bounds.x - root.x) < 1 && Math.abs(bounds.width - root.width) < 1)
    assert(Math.abs(bounds.y - root.y) < 1 && Math.abs(bounds.y + bounds.height - last.y - last.height) < 1)
    assert.equal(await page.locator('[data-sort-position]').count(), 0)
    report.groupDrops.push({ kind: 'middle', targetId, fraction, bounds, root, last })
    await shot(targetId === first ? 'child-middle-preview' : 'second-child-middle-preview')
    await page.mouse.up(); await order(parent, [first, second, source]); await clean()
    assert.equal((await item(source)).placement.horizon, 'week')
    assert.equal(await page.locator('.toast').count(), 0)
    await undo(); await order(parent, [first, second])
    assert.equal((await item(source)).placement.horizon, 'day')
  }

  const cases = [
    { name: 'first', target: first, position: 'before', marker: first, side: 'before', expected: [source, first, second] },
    { name: 'middle-from-above', target: first, position: 'after', marker: second, side: 'before', expected: [first, source, second] },
    { name: 'middle-from-below', target: second, position: 'before', marker: second, side: 'before', expected: [first, source, second] },
    { name: 'last', target: second, position: 'after', marker: second, side: 'after', expected: [first, second, source] },
  ]
  for (const test of cases) {
    await begin(source, test.target, test.position)
    const geometry = await childInsertion(test.marker, test.side)
    assert.equal(await page.locator('.nesting-drop-preview, [data-nesting-target]').count(), 0)
    const inset = geometry.inset, lineY = geometry.line.y, overlay = await page.locator('.drag-overlay').boundingBox()
    assert(overlay.y > lineY + 1 || overlay.y + overlay.height < lineY - 1, 'The pointer overlay must not cover the insertion line')
    if (test.name === 'middle-from-above') await shot('insertion-preview')
    await page.mouse.up(); await order(parent, test.expected); await clean()
    assert.equal((await item(source)).placement.nestingParentId, parent)
    report.groupDrops.push({ kind: test.name, expected: test.expected, inset, lineY, overlay })
    await undo(); await order(parent, [first, second])
  }

  await begin(second, first, 'before'); await page.mouse.up(); await order(parent, [second, first])
  await undo(); await order(parent, [first, second])
  const unchanged = await item(second)
  await begin(second, first); await page.mouse.up(); await settled()
  assert.deepEqual(await item(second), unchanged); await clean()
  await begin(second, first, 'after'); await page.mouse.up(); await settled()
  assert.deepEqual(await item(second), unchanged); await clean()

  await begin(cousin, second, 'before'); await page.mouse.up(); await order(parent, [first, cousin, second])
  await undo(); await order(parent, [first, second]); await order(other, [cousin])
  await begin(source, parent, 'after')
  await row(other).locator(':scope[data-sort-position="before"][data-sort-nested="false"]').waitFor()
  const rootLine = await insertionLine(other, 'before')
  assert.equal(rootLine.line.x, rootLine.row.x, 'Root insertion keeps the full row width')
  assert(Math.abs((await row(other).boundingBox()).y - ((await row(second).boundingBox()).y + (await row(second).boundingBox()).height)) < 1)
  await page.mouse.up(); await settled()
  assert.equal((await item(source)).placement.nestingParentId ?? null, null)
  await undo()

  for (const cancel of ['escape', 'blur']) {
    const before = await item(source)
    await begin(source, first); await page.locator('.nesting-drop-preview').waitFor()
    if (cancel === 'escape') await page.keyboard.press('Escape')
    else await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await page.mouse.up(); await settled(); await clean()
    assert.deepEqual(await item(source), before)
  }
  await begin(other, first); await page.mouse.up(); await settled(); await clean()
  await order(parent, [first, second, other, cousin])
  assert.equal((await item(other)).placement.nestingParentId, parent)
  assert.equal((await item(cousin)).placement.nestingParentId, parent)
  await undo(); await order(parent, [first, second]); await order(other, [cousin])

  await application.evaluate(({ ipcMain }) => {
    const command = ipcMain._invokeHandlers.get('goalloom:command'), query = ipcMain._invokeHandlers.get('goalloom:query')
    globalThis.groupDropProbe = { command, query, mode: 'reject', writes: [], receipts: [] }
    ipcMain.removeHandler('goalloom:command')
    ipcMain.handle('goalloom:command', async (event, input) => {
      const probe = globalThis.groupDropProbe
      if (input.type === 'nest' && probe.mode === 'reject') return { ok: false, code: 'conflict', message: 'Synthetic drop conflict' }
      const reply = await command(event, input)
      if (input.type === 'nest') { probe.writes.push(input.operationId); if (probe.mode === 'unknown') throw Error('Synthetic lost ordered-nest receipt') }
      return reply
    })
    ipcMain.removeHandler('goalloom:query')
    ipcMain.handle('goalloom:query', async (event, input) => {
      const probe = globalThis.groupDropProbe
      if (input.type === 'receipt') {
        probe.receipts.push({ operationId: input.operationId, mode: probe.mode })
        if (probe.mode === 'unknown') throw Error('Synthetic unavailable ordered-nest receipt')
      }
      const result = await query(event, input)
      if (input.type === 'receipt') probe.receipts.at(-1).found = result !== null
      return result
    })
  })
  try {
    const before = await item(source)
    await begin(source, second, 'before'); await page.mouse.up(); await page.locator('.error-banner').waitFor()
    await settled(); await clean(); assert.deepEqual(await item(source), before)
    await shot('rejected-insertion')
    await page.locator('.error-banner button').last().click(feedbackClick)
    await page.locator('.error-banner').waitFor({ state: 'detached' })
    await application.evaluate(() => { globalThis.groupDropProbe.mode = 'unknown' })
    await begin(source, second, 'before'); await page.mouse.up()
    await pollPage(page, async id => (await window.goalloom.getItem(id)).item.placement.nestingParentId !== null, source)
    await page.locator('.error-banner').waitFor(); await clean()
    await application.evaluate(() => { globalThis.groupDropProbe.mode = 'ok' })
    await page.locator('.error-banner').getByRole('button', { name: '重试核对', exact: true }).click(feedbackClick)
    await page.locator('.error-banner').waitFor({ state: 'detached' }); await order(parent, [first, source, second])
    assert.equal(await application.evaluate(() => globalThis.groupDropProbe.writes.length), 1)
    assert.equal(await page.locator('.toast').count(), 0)
    await undo(); await order(parent, [first, second])
  } finally {
    report.groupReceipts = await application.evaluate(() => ({ writes: globalThis.groupDropProbe.writes, receipts: globalThis.groupDropProbe.receipts }))
    await application.evaluate(({ ipcMain }) => {
      const probe = globalThis.groupDropProbe
      ipcMain.removeHandler('goalloom:command'); ipcMain.handle('goalloom:command', probe.command)
      ipcMain.removeHandler('goalloom:query'); ipcMain.handle('goalloom:query', probe.query)
      delete globalThis.groupDropProbe
    })
  }

  await row(parent).locator('.check').click(feedbackClick)
  await pollPage(page, async id => (await window.goalloom.getItem(id)).item.status === 'done', parent)
  await order(parent, [first, second])
  await begin(source, first); await page.locator('.nesting-drop-preview').waitFor(); await shot('mixed-completion-preview')
  await page.keyboard.press('Escape'); await page.mouse.up(); await settled()
  await row(parent).locator('.check').click(feedbackClick)
  await pollPage(page, async id => (await window.goalloom.getItem(id)).item.status === 'todo', parent)
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await setCompletedLayout(page, false)
  await begin(source, second, 'before'); await page.mouse.up(); await order(parent, [first, source, second])
  await page.reload(); await page.locator('.board').waitFor(); await order(parent, [first, source, second])
  await shot('persisted-insertion')
  const sourceItem = await item(source)
  await execute({ type: 'unnest', itemId: source, expectedVersion: sourceItem.version, expectedPlacementVersion: sourceItem.placement.version })
  const independent = await item(source)
  await execute({ type: 'move', itemId: source, horizon: 'day', expectedVersion: independent.version, expectedPlacementVersion: independent.placement.version })
  await settled()
  await page.emulateMedia({ reducedMotion: 'reduce' }); await setCompletedLayout(page, true)

  const week = page.locator('[data-horizon="week"]')
  await stepPeriod(week, 'next'); await week.locator(':scope[data-period-mode="future"]').waitFor()
  const startDate = await page.evaluate(async () => {
    const snapshot = await window.goalloom.getSnapshot()
    return snapshot.periods.find(period => period.horizon === 'week').endDate
  })
  const futureParent = await create('Future group', 'week', { period: { kind: 'date', startDate } })
  const futureChild = await create('Future child', 'day'); await nest(futureChild, futureParent)
  await row(futureChild).waitFor(); await begin(source, futureChild, 'before')
  await childInsertion(futureChild, 'before'); await page.mouse.up()
  await pollPage(page, async ({ source, futureParent }) => {
    const item = (await window.goalloom.getItem(source)).item
    return item.placement.nestingParentId === futureParent
  }, { source, futureParent })
  await settled(); await clean(); await undo()
  await stepPeriod(week, 'previous'); await week.locator(':scope[data-period-mode="current"]').waitFor()

  const laterParent = await create('Virtual container with a long title '.repeat(6), 'later')
  const children = []
  for (let index = 0; index < 75; index++) {
    const id = await create(`Virtual group child ${String(index).padStart(2, '0')}`, 'later')
    children.push(id); await nest(id, laterParent)
  }
  const later = page.locator('[data-horizon="later"]'), scroll = later.locator('.column-content')
  await scroll.evaluate(node => { node.scrollTop = 32 * 42 })
  await row(children[42]).waitFor()
  await row(laterParent).waitFor({ state: 'detached' })
  const mounted = await later.locator('.task-row').count()
  assert(mounted < 45)
  await begin(source, children[42]); await page.locator(`.nesting-drop-preview[data-nesting-group="${laterParent}"]`).waitFor()
  assert.equal(await row(laterParent).count(), 0)
  assert(await later.locator('.task-row').count() < 45)
  const geometry = await page.locator('.nesting-drop-preview').evaluate(node => {
    const group = node.getBoundingClientRect(), viewport = node.closest('.column-content').getBoundingClientRect()
    return { group: group.toJSON(), viewport: viewport.toJSON(), pointerEvents: getComputedStyle(node).pointerEvents }
  })
  assert(geometry.group.top < geometry.viewport.top && geometry.group.bottom > geometry.viewport.bottom)
  assert.equal(geometry.pointerEvents, 'none')
  report.groupDrops.push({ kind: 'unmounted-root', mounted, geometry })
  await shot('virtual-clipped-preview')
  await page.mouse.up(); await settled(); await clean()
  assert.equal((await item(source)).placement.nestingParentId, laterParent)
  await undo(); assert.equal((await item(source)).placement.nestingParentId ?? null, null)
  for (const { index, side, slot } of [{ index: 42, side: 'before', slot: 42 }, { index: 74, side: 'after', slot: 75 }]) {
    await scroll.evaluate((node, index) => { node.scrollTop = index === 74 ? node.scrollHeight : 32 * index }, index)
    await row(children[index]).waitFor()
    await begin(source, children[index], side)
    await childInsertion(children[index], side)
    assert.equal(await row(laterParent).count(), 0)
    await page.mouse.up(); await settled(); await clean()
    const expected = [...children]
    expected.splice(slot, 0, source)
    await pollPage(page, async ({ parentId, expected }) => {
      const snapshot = await window.goalloom.getSnapshot()
      return JSON.stringify(snapshot.items.filter(item => item.placement.nestingParentId === parentId).map(item => item.id)) === JSON.stringify(expected)
    }, { parentId: laterParent, expected })
    report.groupDrops.push({ kind: `later-${side}`, expected })
    await undo()
  }
  await scroll.evaluate(node => { node.scrollTop = 0 })
  await row(laterParent).waitFor()
  await begin(source, children[0]); await page.locator('.nesting-drop-preview').waitFor()
  await shot('long-title-preview'); await page.keyboard.press('Escape'); await page.mouse.up(); await settled(); await clean()

  for (const id of created.reverse()) {
    const value = await item(id)
    await execute({ type: 'delete', itemId: id, expectedVersion: value.version })
  }
  await settled(); await scroll.evaluate(node => { node.scrollTop = 0 })
  report.checks.push('Child middles outline the whole group; checkbox-aligned first/middle/last insertion in current/future/Later columns, full-width root insertion, cross-group placement, same-group no-ops, cancellation, guarded receipts, persistence and unmounted-root clipping')
}
