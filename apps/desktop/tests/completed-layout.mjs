/**
 * [INPUT]: Production Electron, native controls, isolated data and synthetic remote preference events.
 * [OUTPUT]: Default-inline/folded completion, persistence, sync projection, ordering, outline and locale/theme evidence.
 * [POS]: Completed-task layout acceptance; task writes and settings validation use the production bridge.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, release, tmpdir, version } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { finishSetup } from './fixtures/setup.mjs'
import { completedLayoutCopy, setCompletedLayout } from './fixtures/completed-layout.mjs'
import { stepPeriod } from './fixtures/period-step.mjs'
import { pollPage } from './fixtures/poll.mjs'

const evidence = resolve('output/tests/completed-layout')
const profile = await mkdtemp(join(tmpdir(), 'goalloom-completed-layout-'))
await mkdir(evidence, { recursive: true })
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const report = { passed: false, checks: [], screenshots: [], geometry: [], ordering: [], errors: [], environment: { os: version(), release: release(), arch: arch(), cpu: cpus()[0]?.model, machineScope: 'Physical/VM status not independently verified' }, scope: 'Source Electron and production SQLite/IPC; remote events are synthetic. No live sync, packaged or Windows acceptance.' }
let app, page
const launch = async () => {
  app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
  page = await app.firstWindow(); page.setDefaultTimeout(12000)
  page.on('pageerror', error => report.errors.push(error.message))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000))
  await page.emulateMedia({ reducedMotion: 'reduce' })
}
const column = horizon => page.locator(`.board-column[data-horizon="${horizon}"]`)
const row = id => page.locator(`#item-${id}`)
const item = id => page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
const execute = action => page.evaluate(async action => {
  const { workspace } = await window.goalloom.getSnapshot()
  const reply = await window.goalloom.execute({ ...action, generation: workspace.generation, operationId: crypto.randomUUID() })
  if (!reply.ok) throw new Error(reply.message)
  return reply.result
}, action)
const business = () => page.evaluate(async () => (await window.goalloom.getSnapshot()).items.map(({ id, title, status, version, placement }) => ({ id, title, status, version, placement })).sort((a, b) => a.id.localeCompare(b.id)))
const shot = async name => { const path = join(evidence, `${name}.png`); await page.screenshot({ path }); report.screenshots.push(path) }
const dismiss = async () => { const toast = page.locator('.toast'); if (await toast.count()) await toast.getByRole('button', { name: 'Dismiss notification', exact: true }).click() }
const idsIn = horizon => column(horizon).locator('.task-row').evaluateAll(nodes => nodes.map(node => node.dataset.itemId))
const openBoard = async () => {
  const locale = await page.evaluate(() => document.documentElement.lang.split('-')[0]), copy = completedLayoutCopy[locale]
  await page.getByRole('button', { name: copy.settings, exact: true }).click()
  const dialog = page.locator('dialog.settings-modal')
  await dialog.getByRole('navigation').getByRole('button', { name: copy.board, exact: true }).click()
  return { dialog, copy, control: dialog.getByRole('switch', { name: copy.label, exact: true }) }
}
const status = async (id, value) => {
  const current = await item(id)
  await execute({ type: 'status', itemId: id, expectedVersion: current.version, status: value })
  await pollPage(page, async ({ id, value }) => (await window.goalloom.getItem(id)).item.status === value, { id, value })
}
const dragKeys = async (id, keys) => {
  const handle = row(id).locator('.drag-handle')
  await handle.scrollIntoViewIfNeeded(); await handle.focus(); await handle.press('Space')
  await page.waitForFunction(() => document.documentElement.dataset.dragging === 'true')
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  for (const key of keys) await page.keyboard.press(key)
  await page.keyboard.press('Space')
  await page.waitForFunction(() => !document.documentElement.dataset.dragging && !document.querySelector('.fab').disabled)
  await page.waitForFunction(id => document.activeElement?.matches('.drag-handle') && document.activeElement.closest('.task-row')?.dataset.itemId === id, id)
}
try {
  await launch(); await finishSetup(page)
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  assert.equal(await page.evaluate(() => localStorage.getItem('goalloom.collapse-completed')), null)
  const initial = await openBoard()
  assert.equal(await initial.control.getAttribute('aria-checked'), 'false')
  await initial.dialog.getByRole('button', { name: initial.copy.close, exact: true }).click()
  report.checks.push('Missing preferences default to inline for a fresh or upgraded profile')

  const ids = {}
  for (const horizon of ['later', 'year', 'half', 'cycle', 'month', 'week', 'day']) {
    ids[horizon] = []
    for (const suffix of ['first', 'middle', 'last']) ids[horizon].push((await execute({ type: 'create', title: `${horizon} ${suffix}`, horizon })).itemId)
    const middle = ids[horizon][1]
    await row(middle).scrollIntoViewIfNeeded()
    const before = await item(middle), top = (await row(middle).boundingBox()).y
    await row(middle).evaluate(node => { window.completedRow = node })
    await row(middle).locator('.check').click()
    await page.waitForFunction(id => document.getElementById(`item-${id}`)?.dataset.done === 'true', middle)
    const completedOrder = await idsIn(horizon), completedTop = (await row(middle).boundingBox()).y
    assert.deepEqual(completedOrder, ids[horizon])
    assert.equal(await row(middle).evaluate(node => node === window.completedRow), true)
    assert(Math.abs(completedTop - top) <= 1)
    assert.match(await row(middle).locator('.task-title').evaluate(node => getComputedStyle(node).textDecorationLine), /line-through/)
    assert.deepEqual((await item(middle)).placement, before.placement)
    await row(middle).locator('.check').click()
    await page.waitForFunction(id => document.getElementById(`item-${id}`)?.dataset.done === 'false', middle)
    const reopenedOrder = await idsIn(horizon)
    assert.deepEqual(reopenedOrder, ids[horizon])
    await page.keyboard.press('ControlOrMeta+z')
    await page.locator('.toast').filter({ hasText: 'Undone' }).waitFor()
    assert.equal((await item(middle)).status, 'done')
    assert.deepEqual((await item(middle)).placement, before.placement)
    assert.equal(await row(middle).evaluate(node => node === window.completedRow), true)
    const undoOrder = await idsIn(horizon)
    assert.deepEqual(undoOrder, ids[horizon])
    report.ordering.push({ horizon, expected: ids[horizon], completed: completedOrder, reopened: reopenedOrder, undone: undoOrder,
      completedItem: middle, beforeTop: top, completedTop, displacement: completedTop - top })
    await dismiss()
  }
  assert.equal(await page.locator('.completed-fold').count(), 0)
  await shot('inline-seven-columns')
  report.checks.push('Completion, reopening and keyboard undo keep all seven columns in place, with stable row identity, checked state and strike-through')

  const unchanged = await business()
  await setCompletedLayout(page, true)
  assert.equal(await page.locator('.completed-fold').count(), 7)
  assert.equal(await page.locator('.task-row[data-done="true"]').count(), 0)
  assert.deepEqual(await business(), unchanged)
  await shot('collapsed-seven-columns')
  await app.close(); await launch(); await page.locator('.board').waitFor()
  assert.equal(await page.locator('.completed-fold').count(), 7)
  await setCompletedLayout(page, false)
  assert.deepEqual(await business(), unchanged)
  await app.close(); await launch(); await page.locator('.board').waitFor()
  assert.equal(await page.locator('.completed-fold').count(), 0)
  for (const horizon of Object.keys(ids)) assert.deepEqual(await idsIn(horizon), ids[horizon])
  report.checks.push('Both modes persist through native restart; switching changes no task versions, states or placement keys')

  await page.waitForFunction(async () => (await window.goalloom.pullDevicePrefs()).some(entry => entry.key === 'collapseCompleted' && entry.value === false))
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    const handler = ipcMain._invokeHandlers.get('goalloom:device-prefs')
    globalThis.completedPrefReports = []
    ipcMain.removeHandler('goalloom:device-prefs')
    ipcMain.handle('goalloom:device-prefs', (event, ...args) => {
      if (args.length) globalThis.completedPrefReports.push(args[0])
      return handler(event, ...args)
    })
    BrowserWindow.getAllWindows()[0].webContents.send('goalloom:device-prefs', [{ key: 'collapseCompleted', value: true }])
  })
  await page.waitForFunction(() => document.querySelectorAll('.completed-fold').length === 7)
  assert.equal(await page.evaluate(() => localStorage.getItem('goalloom.collapse-completed')), 'true')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('goalloom:device-prefs', [{ key: 'collapseCompleted', value: false }]))
  await page.waitForFunction(() => !document.querySelector('.completed-fold'))
  // Observe the full 250 ms report debounce; remote application must never echo a local write.
  await page.waitForTimeout(350)
  assert.deepEqual(await app.evaluate(() => globalThis.completedPrefReports), [])
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('goalloom:device-prefs', [{ key: 'collapseCompleted', value: 'true' }]))
  assert.equal(await page.evaluate(() => localStorage.getItem('goalloom.collapse-completed')), 'false')
  await row(ids.later[1]).locator('.task-title').dblclick()
  const draft = row(ids.later[1]).locator('.task-title-input')
  await draft.fill('A draft held during remote folding')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('goalloom:device-prefs', [{ key: 'collapseCompleted', value: true }]))
  assert.equal(await draft.inputValue(), 'A draft held during remote folding')
  assert.equal(await page.locator('.completed-fold').count(), 0)
  await draft.press('Escape')
  await page.waitForFunction(() => document.querySelectorAll('.completed-fold').length === 7)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('goalloom:device-prefs', [{ key: 'collapseCompleted', value: false }]))
  await row(ids.later[1]).waitFor()
  await row(ids.later[1]).locator('.drag-handle').focus()
  await page.keyboard.press('Space')
  await page.waitForFunction(() => document.documentElement.dataset.dragging === 'true')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('goalloom:device-prefs', [{ key: 'collapseCompleted', value: true }]))
  assert.equal(await page.locator('.completed-fold').count(), 0)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.documentElement.dataset.dragging && document.querySelectorAll('.completed-fold').length === 7)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('goalloom:device-prefs', [{ key: 'collapseCompleted', value: false }]))
  await row(ids.later[1]).waitFor()
  assert.equal(await page.evaluate(async () => { try { await window.goalloom.reportDevicePrefs([{ key: 'collapseCompleted', value: 'true' }], 'change'); return false } catch { return true } }), true)
  assert.deepEqual(await business(), unchanged)
  await page.evaluate(() => localStorage.setItem('goalloom.collapse-completed', 'invalid'))
  await page.reload(); await page.locator('.board').waitFor()
  assert.equal(await page.locator('.completed-fold').count(), 0)
  report.checks.push('Production preference events apply without echo or draft loss; active edits and drags defer layout changes, and malformed values are rejected or fall back to inline')

  const manager = await openBoard()
  await manager.dialog.getByRole('navigation').getByRole('button', { name: 'Done', exact: true }).click()
  await manager.dialog.locator('.items-row').filter({ hasText: 'later middle' }).waitFor()
  await manager.dialog.getByRole('button', { name: manager.copy.close, exact: true }).click()
  await setCompletedLayout(page, true)
  const foldedManager = await openBoard()
  await foldedManager.dialog.getByRole('navigation').getByRole('button', { name: 'Done', exact: true }).click()
  await foldedManager.dialog.locator('.items-row').filter({ hasText: 'later middle' }).waitFor()
  await foldedManager.dialog.getByRole('button', { name: foldedManager.copy.close, exact: true }).click()
  await setCompletedLayout(page, false)
  report.checks.push('The Done management page retains its existing classification in both board modes')

  await dragKeys(ids.later[2], ['ArrowUp'])
  const keyboardOrder = await idsIn('later')
  assert.deepEqual(keyboardOrder, [ids.later[0], ids.later[2], ids.later[1]])
  await page.keyboard.press('ControlOrMeta+z'); await page.locator('.toast').filter({ hasText: 'Undone' }).waitFor(); await dismiss()
  assert.deepEqual(await idsIn('later'), ids.later)
  const source = await row(ids.later[2]).locator('.task-title').boundingBox()
  await page.mouse.move(source.x + 70, source.y + 12); await page.mouse.down(); await page.mouse.move(source.x + 80, source.y + 12)
  await page.locator('.drag-overlay').waitFor()
  const target = await row(ids.later[1]).boundingBox()
  await page.mouse.move(target.x + 80, target.y + 3, { steps: 8 }); await page.mouse.up()
  await page.waitForFunction(() => !document.documentElement.dataset.dragging && !document.querySelector('.fab').disabled)
  const pointerOrder = await idsIn('later')
  assert.deepEqual(pointerOrder, [ids.later[0], ids.later[2], ids.later[1]])
  report.ordering.push({ horizon: 'later', before: ids.later, keyboard: keyboardOrder, pointer: pointerOrder })
  await page.keyboard.press('ControlOrMeta+z'); await page.locator('.toast').filter({ hasText: 'Undone' }).waitFor(); await dismiss()
  assert.deepEqual(await idsIn('later'), ids.later)
  const flows = []
  for (let index = 0; index < 3; index++) flows.push((await execute({ type: 'create', title: `Layout flow ${index + 1}`, horizon: 'cycle', flowColor: index })).itemId)
  const firstFlow = await item(flows[0])
  await status(flows[0], 'done')
  const labels = () => page.locator('.flow-filter button[aria-label]').allTextContents()
  assert.deepEqual(await labels(), ['Layout flow 1', 'Layout flow 2', 'Layout flow 3'])
  await page.keyboard.press('ControlOrMeta+3')
  assert.equal(await page.locator('.flow-filter button[aria-label]').first().getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('ControlOrMeta+2')
  await setCompletedLayout(page, true)
  assert.deepEqual(await labels(), ['Layout flow 2', 'Layout flow 3', 'Layout flow 1'])
  await setCompletedLayout(page, false)
  assert.deepEqual((await item(flows[0])).placement, firstFlow.placement)

  const ordered = []
  for (const suffix of ['first', 'second']) ordered.push((await execute({ type: 'create', title: `Ordered ${suffix}`, horizon: 'week', parentId: flows[1], expectedParentVersion: (await item(flows[1])).version })).itemId)
  await status(ordered[0], 'done')
  const settings = await openBoard()
  await settings.dialog.getByRole('switch', { name: 'Sort by parent', exact: true }).click()
  await settings.dialog.getByRole('button', { name: settings.copy.close, exact: true }).click()
  await dragKeys(ordered[1], ['ArrowUp'])
  assert((await idsIn('week')).indexOf(ordered[1]) < (await idsIn('week')).indexOf(ordered[0]))
  const other = (await execute({ type: 'create', title: 'Other parent group', horizon: 'week', parentId: flows[2], expectedParentVersion: (await item(flows[2])).version })).itemId
  const guarded = await item(ordered[1])
  const rejected = await page.evaluate(async ({ id, beforeId, version, placementVersion }) => window.goalloom.execute({ type: 'move', itemId: id, horizon: 'week', beforeId, expectedVersion: version, expectedPlacementVersion: placementVersion, parentOrder: true, generation: (await window.goalloom.getSnapshot()).workspace.generation, operationId: crypto.randomUUID() }), { id: guarded.id, beforeId: other, version: guarded.version, placementVersion: guarded.placement.version })
  assert.equal(rejected.ok, false)
  assert.deepEqual(await item(ordered[1]), guarded)
  report.checks.push('Mixed-status pointer/keyboard reordering retains keyboard focus and follows visible flow shortcut order; automatic parent ordering accepts mixed statuses but still rejects another parent group')

  const parent = (await execute({ type: 'create', title: 'Outline parent', horizon: 'week' })).itemId, children = []
  for (const title of ['Outline child one', 'Outline child two']) {
    const child = (await execute({ type: 'create', title, horizon: 'day' })).itemId
    const source = await item(child), root = await item(parent)
    await execute({ type: 'nest', itemId: child, parentId: parent, expectedVersion: source.version, expectedParentVersion: root.version, expectedPlacementVersion: source.placement.version, expectedParentPlacementVersion: root.placement.version })
    children.push(child)
  }
  await status(children[0], 'done'); await status(parent, 'done')
  for (const id of [parent, ...children]) assert.equal(await row(id).count(), 1)
  await setCompletedLayout(page, true)
  for (const id of [parent, ...children]) assert.equal(await row(id).count(), 1)
  await status(children[1], 'done')
  await row(parent).waitFor({ state: 'detached' })
  const completed = column('week').locator('.completed-fold')
  await completed.locator('summary').click()
  await row(parent).waitFor()
  for (const id of [parent, ...children]) assert.equal(await row(id).locator('xpath=ancestor::details').count(), 1)
  await setCompletedLayout(page, false)
  const outline = await idsIn('week'), offset = outline.indexOf(parent)
  assert.deepEqual(outline.slice(offset, offset + 3), [parent, ...children])
  report.checks.push('Parent/subtask outlines stay together; only a fully completed group moves into the fold, and switching back restores its complete outline')

  const futureStart = await page.evaluate(async () => (await window.goalloom.getSnapshot()).periods.find(period => period.horizon === 'month').endDate)
  const future = (await execute({ type: 'create', title: 'Future completed task', horizon: 'month', period: { kind: 'date', startDate: futureStart } })).itemId
  await status(future, 'done')
  await column('month').locator('.column-header').scrollIntoViewIfNeeded(); await stepPeriod(column('month'), 'next')
  await row(future).waitFor()
  assert.equal(await column('month').locator('.completed-fold').count(), 0)
  assert.equal(await column('month').locator('[data-column-add]').count(), 0, 'A completed-only column does not gain a todo-tail action')
  await setCompletedLayout(page, true)
  await column('month').locator('.completed-fold').waitFor()
  await setCompletedLayout(page, false)
  await row(future).waitFor()
  await stepPeriod(column('month'), 'previous')
  report.checks.push('Future periods use the same preference and completed-only columns retain the existing add-entry rules')

  const virtual = []
  for (let index = 0; index < 80; index++) {
    const id = (await execute({ type: 'create', title: `Mixed row ${String(index).padStart(2, '0')}`, horizon: 'later' })).itemId
    if (index % 2) await status(id, 'done')
    virtual.push(id)
  }
  await column('later').locator('.column-content').evaluate(node => { node.scrollTop = 0 })
  await row(ids.later[0]).locator('.task-title').focus(); await page.keyboard.press('End')
  await page.waitForFunction(id => document.activeElement?.closest('.task-row')?.dataset.itemId === id, virtual.at(-1))
  assert.equal(await row(virtual.at(-1)).getAttribute('data-done'), 'true')
  await page.waitForFunction(() => document.querySelectorAll('[data-horizon="later"] .task-row').length < 60)
  assert(await column('later').locator('.task-row').count() < 60)
  const lastPlacement = (await item(virtual.at(-1))).placement
  await row(virtual.at(-1)).locator('.check').click()
  await page.waitForFunction(id => document.getElementById(`item-${id}`)?.dataset.done === 'false', virtual.at(-1))
  assert.deepEqual((await item(virtual.at(-1))).placement, lastPlacement)
  await shot('virtual-inline-focus')
  report.checks.push('Mixed-status virtual lists keep bounded DOM, logical End traversal and in-place reopening at the viewport end')

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(720, 900))
  for (const locale of Object.keys(completedLayoutCopy)) {
    await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
    await page.reload(); await page.locator('.board').waitFor()
    const localized = await openBoard()
    assert.equal(await localized.control.getAttribute('aria-checked'), 'false')
    const geometry = await localized.control.evaluate(node => {
      const card = node.closest('.settings-row'), label = card.querySelector('.settings-row-text'), bounds = card.getBoundingClientRect(), control = node.getBoundingClientRect()
      return { labelFits: label.scrollWidth <= label.clientWidth + 1, controlFits: control.left >= bounds.left && control.right <= bounds.right, width: bounds.width }
    })
    assert.equal(geometry.labelFits, true); assert.equal(geometry.controlFits, true)
    report.geometry.push({ locale, ...geometry })
    await shot(`settings-${locale}`)
    await localized.dialog.getByRole('button', { name: localized.copy.close, exact: true }).click()
  }
  await page.evaluate(() => window.goalloom.setLanguage('en')); await page.reload(); await page.locator('.board').waitFor()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000))
  for (const style of ['paper', 'minimal']) for (const theme of ['light', 'dark']) {
    await execute({ type: 'preferences', style, theme })
    await page.waitForFunction(({ style, theme }) => document.documentElement.dataset.style === style && document.documentElement.dataset.theme === theme, { style, theme })
    await column('week').locator('.column-header').scrollIntoViewIfNeeded()
    await row(parent).scrollIntoViewIfNeeded()
    assert.match(await row(parent).locator('.task-title').evaluate(node => getComputedStyle(node).textDecorationLine), /line-through/)
    await shot(`${style}-${theme}-inline`)
    const themed = await openBoard()
    assert.equal(await themed.control.getAttribute('aria-checked'), 'false')
    await shot(`${style}-${theme}-settings`)
    await themed.dialog.getByRole('button', { name: themed.copy.close, exact: true }).click()
    await setCompletedLayout(page, true); await shot(`${style}-${theme}-collapsed`)
    await setCompletedLayout(page, false)
  }
  report.checks.push('Five translated settings fit a 720 px native window; checked/strike-through rows and folded groups remain readable in all four appearances')
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) {
  report.failure = error.stack
  if (page && !page.isClosed()) {
    report.localState = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus(), activeElement: document.activeElement?.outerHTML.slice(0, 1000), dragging: document.documentElement.dataset.dragging, collapseCompleted: localStorage.getItem('goalloom.collapse-completed') })).catch(() => null)
    report.nativeWindow = await app.evaluate(({ BrowserWindow }) => ({ focused: BrowserWindow.getAllWindows()[0]?.isFocused(), visible: BrowserWindow.getAllWindows()[0]?.isVisible() })).catch(() => null)
    await shot('failure').catch(() => {})
  }
  throw error
} finally {
  if (app) await app.close().catch(() => {})
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2))
  await rm(profile, { recursive: true, force: true })
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, evidence }))
