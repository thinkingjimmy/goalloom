/**
 * [INPUT]: Built Electron, real production IPC and a fresh synthetic workspace; --baseline/--style-baseline preserve initial failures, --menu narrows development checks.
 * [OUTPUT]: Repeatable column-menu/period-panel appearance, state, geometry, focus, persistence and locale evidence under output/tests/column-visibility.
 * [POS]: Owning desktop E2E; no personal workspace, external service or unrelated screen capture.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir, arch, cpus, release, version } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { finishSetup } from './fixtures/setup.mjs'
import { pollPage } from './fixtures/poll.mjs'

const evidence = resolve('output/tests/column-visibility'), baseline = process.argv.includes('--baseline'), styleBaseline = process.argv.includes('--style-baseline'), menuOnly = process.argv.includes('--menu')
const reportName = styleBaseline ? 'style-baseline' : baseline ? 'baseline' : menuOnly ? 'menu' : ''
const profile = await mkdtemp(join(tmpdir(), 'goalloom-columns-'))
await mkdir(evidence, { recursive: true })
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const options = { args: ['.', `--user-data-dir=${profile}`], env }
const horizons = ['year', 'half', 'cycle', 'month', 'week', 'day']
const report = { passed: false, scope: menuOnly ? 'menu' : 'all', checks: [], screenshots: [], geometry: [], environment: { os: version(), release: release(), arch: arch(), cpu: cpus()[0]?.model, machineScope: process.env.GOALLOOM_TEST_MACHINE_SCOPE ?? 'Host OS reported; physical/VM status not independently verified', packaged: false } }
let app, page
async function run() {
  app = await electron.launch(options); page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 840))
  await finishSetup(page)
  Object.assign(report.environment, await page.evaluate(() => window.goalloom.getRuntime()))
  const check = text => { report.checks.push(text); console.log(text) }
  const shot = async name => { const path = join(evidence, `${name}.png`); await page.screenshot({ path }); report.screenshots.push(path) }
  const toggle = () => page.locator('#column-toggle'), menu = () => page.locator('#column-visibility-menu')
  const column = horizon => page.locator(`.board-timeline > .board-column[data-horizon="${horizon}"]`)
  const choice = horizon => menu().locator(`[data-column-choice="${horizon}"]`)
  const shown = () => page.locator('.board-timeline > .board-column:visible').evaluateAll(nodes => nodes.map(node => node.dataset.horizon))
  const open = async () => { if (await toggle().getAttribute('aria-expanded') !== 'true') await toggle().click(); await menu().waitFor() }
  const visible = async (horizon, wanted) => {
    await open()
    if ((await choice(horizon).getAttribute('aria-checked') === 'true') !== wanted) await choice(horizon).click()
    await page.waitForFunction(({ horizon, wanted }) => !document.querySelector(`.board-timeline > [data-horizon="${horizon}"]`).hidden === wanted, { horizon, wanted })
  }
  const execute = action => page.evaluate(async action => {
    const { workspace } = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ ...action, generation: workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return reply.result
  }, action)
  const create = async (title, horizon, extra = {}) => (await execute({ type: 'create', title, horizon, ...extra })).itemId
  const closeMenu = async () => { await page.keyboard.press('Escape'); await menu().waitFor({ state: 'detached' }) }
  const search = async title => {
    await page.getByRole('button', { name: 'Search & commands', exact: true }).click()
    await page.getByRole('textbox', { name: 'Search items', exact: true }).fill(title)
    await page.locator('.command-results .menu-item').first().click()
    await page.locator('.modal.detail').waitFor()
  }

  assert.equal(await toggle().count(), 1, 'The column button must exist between Search and Settings')
  const order = await page.locator('.titlebar button.icon-button').evaluateAll(nodes => nodes.map(node => node.id || node.getAttribute('aria-label')))
  assert.deepEqual(order.slice(-3), ['Search & commands', 'column-toggle', 'Settings & data'])
  assert.deepEqual(await shown(), horizons)
  await open()
  assert.equal(await menu().getByRole('menuitemcheckbox').count(), 6)
  assert.deepEqual(await menu().getByRole('menuitemcheckbox').evaluateAll(nodes => nodes.map(node => node.dataset.columnChoice)), horizons)
  assert.equal(await menu().getByText('Later', { exact: true }).count(), 0)
  const appearance = locator => locator.evaluate(node => {
    const style = getComputedStyle(node)
    return Object.fromEntries(['width', 'minHeight', 'padding', 'borderRadius', 'borderWidth', 'backgroundColor', 'color', 'boxShadow', 'fontSize', 'fontWeight'].map(key => [key, style[key]]))
  })
  await closeMenu()
  await column('year').locator('[data-period-switch]').click()
  const periodPanel = page.locator('.period-picker')
  await periodPanel.waitFor()
  const panelAppearance = await appearance(periodPanel), rowAppearance = await appearance(periodPanel.locator('.period-picker-row[data-selected="true"]'))
  await shot('period-title-reference')
  await page.keyboard.press('Escape'); await periodPanel.waitFor({ state: 'detached' })
  await open()
  const menuStyle = await appearance(menu()), choiceStyle = await appearance(choice('year'))
  assert.notEqual(menuStyle.width, panelAppearance.width, 'The column menu sizes to its labels instead of the period panel width')
  assert.notEqual(choiceStyle.backgroundColor, rowAppearance.backgroundColor, 'Checked column choices stay light')
  const checkEdges = await menu().locator('.column-visibility-check').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().right)))
  assert.equal(new Set(checkEdges).size, 1, 'Checks share one right edge')
  check('Content-sized menu, light rows and one check column')
  await shot('default-menu')
  const revision = await page.evaluate(async () => (await window.goalloom.getSnapshot()).workspace.revision)
  await visible('year', false); await visible('half', false)
  assert.deepEqual(await shown(), ['cycle', 'month', 'week', 'day'])
  assert.equal(await menu().isVisible(), true)
  await page.keyboard.press('Home')
  assert.equal(await choice('year').evaluate(node => node === document.activeElement), true)
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Space')
  assert.equal(await choice('half').getAttribute('aria-checked'), 'true')
  await page.keyboard.press('End'); await page.keyboard.press('Enter')
  assert.equal(await choice('day').getAttribute('aria-checked'), 'false')
  await page.keyboard.press('Space')
  await closeMenu()
  assert.equal(await toggle().evaluate(node => node === document.activeElement), true)
  await toggle().press('ArrowUp')
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-column-choice') === 'day')
  assert.equal(await choice('day').evaluate(node => node === document.activeElement), true)
  await page.keyboard.press('Tab')
  await menu().waitFor({ state: 'detached' })
  assert.equal(await page.locator('.settings-toggle').evaluate(node => node === document.activeElement), true)
  await open(); await page.keyboard.press('Shift+Tab')
  await menu().waitFor({ state: 'detached' })
  assert.equal(await page.getByRole('button', { name: 'Search & commands', exact: true }).evaluate(node => node === document.activeElement), true)
  await open(); await page.locator('.flow-filter .chip').first().click()
  assert.equal(await menu().count(), 0)
  check('Toolbar order, canonical six choices, immediate multi-select, keyboard navigation, Escape/Tab focus and outside dismissal')

  for (const horizon of horizons.filter(horizon => horizon !== 'day')) await visible(horizon, false)
  assert.deepEqual(await shown(), ['day'])
  assert.equal(await choice('day').getAttribute('aria-disabled'), 'true')
  assert.equal(await menu().getByRole('tooltip').isVisible(), false)
  const last = await choice('day').boundingBox()
  await choice('day').hover()
  assert.equal(await menu().getByRole('tooltip').isVisible(), true)
  await page.mouse.click(last.x + last.width / 2, last.y + last.height / 2); await choice('day').press('Space')
  assert.deepEqual(await shown(), ['day'])
  assert.equal(await menu().getByText('Keep at least one column visible', { exact: true }).isVisible(), true)
  const saved = await page.evaluate(() => localStorage.getItem('goalloom.visiblePlanningColumns'))
  await page.locator('#later-toggle').click()
  assert.equal(await page.evaluate(() => localStorage.getItem('goalloom.visiblePlanningColumns')), saved)
  await visible('week', true)
  assert.equal(await page.locator('#later-toggle').getAttribute('aria-expanded'), 'false')
  assert.equal((await page.evaluate(async () => (await window.goalloom.getSnapshot()).workspace.revision)), revision)
  await shot('minimum-selection')
  await closeMenu()
  await app.close(); app = await electron.launch(options); page = await app.firstWindow(); await page.locator('.board').waitFor()
  assert.deepEqual(await shown(), ['week', 'day'])
  assert.equal(await page.locator('#later-toggle').getAttribute('aria-expanded'), 'false')
  for (const value of ['[]', 'null', '{"week":true}', '["later"]', '["week","unknown"]', 'invalid']) {
    await page.evaluate(value => localStorage.setItem('goalloom.visiblePlanningColumns', value), value)
    await page.reload(); await page.locator('.board').waitFor()
    assert.deepEqual(await shown(), horizons)
  }
  check('Last-column guard, no workspace writes, independent Later persistence, restart and invalid preference recovery')
  if (menuOnly) return

  const weekly = []
  for (let index = 0; index < 65; index++) weekly.push(await create(`Weekly row ${String(index).padStart(2, '0')}`, 'week'))
  const completed = await create('Completed weekly row', 'week')
  await execute({ type: 'status', itemId: completed, expectedVersion: 1, status: 'done' })
  await column('week').locator('[data-add-item]').click()
  await column('week').locator('.quick-add-title').fill('Keep the weekly draft')
  await column('week').locator('summary').click()
  await column('week').locator('.column-content').evaluate(node => { node.scrollTop = 600 })
  await page.evaluate(() => { window.columnVisibilityNode = document.querySelector('.board-column[data-horizon="week"]'); window.columnVisibilityInput = window.columnVisibilityNode.querySelector('.quick-add-title') })
  const scrollTop = await column('week').locator('.column-content').evaluate(node => node.scrollTop)
  await visible('week', false)
  assert.equal(await column('week').getAttribute('inert'), '')
  assert.equal(await column('week').isVisible(), false)
  assert.equal(await column('week').evaluate(node => node === window.columnVisibilityNode), true)
  await visible('week', true); await closeMenu()
  assert.equal(await column('week').locator('.quick-add-title').inputValue(), 'Keep the weekly draft')
  assert.equal(await column('week').locator('.quick-add-title').evaluate(node => node === window.columnVisibilityInput), true)
  assert.equal(await column('week').locator('.column-content').evaluate(node => node.scrollTop), scrollTop)
  assert.equal(await column('week').locator('details').getAttribute('open'), '')
  await column('week').locator('.quick-add-title').press('Escape')
  await column('week').locator('[data-period-switch]').focus(); await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => document.querySelector('[data-horizon="week"]').dataset.periodMode === 'future' && document.querySelector('[data-horizon="week"]').getAttribute('aria-busy') !== 'true')
  const periodId = await column('week').getAttribute('data-period-id'), startDate = periodId.split(':').at(-1)
  const future = await create('Future weekly row', 'week', { period: { kind: 'date', startDate } })
  await page.locator(`#item-${future}`).waitFor()
  await column('week').locator('[data-add-item]').click()
  await column('week').locator('.quick-add-title').fill('Keep the future draft')
  await visible('week', false)
  const secondFuture = await create('Hidden future refresh', 'week', { period: { kind: 'date', startDate } })
  await page.waitForFunction(id => !!document.getElementById(`item-${id}`), secondFuture)
  await visible('week', true); await closeMenu()
  assert.equal(await column('week').getAttribute('data-period-id'), periodId)
  assert.equal(await column('week').locator('.quick-add-title').inputValue(), 'Keep the future draft')
  assert.equal(await page.locator(`#item-${future}`).count(), 1)
  assert.equal(await page.locator(`#item-${secondFuture}`).count(), 1)
  await column('week').locator('.quick-add-title').press('Escape')
  await visible('week', false); await closeMenu()
  await page.locator(`#item-${future} .task-title`).evaluate(node => node.focus())
  assert.equal(await page.locator(`#item-${future} .task-title`).evaluate(node => node === document.activeElement), false)
  await search('Weekly row 60')
  await page.locator('.modal.detail').getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('.modal.detail').waitFor({ state: 'detached' })
  assert.equal(await column('week').isVisible(), false)
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[inert]')), false)
  check('Mounted identity, draft/fold/scroll retention, hidden future refresh and search details without revealing or focusing hidden columns')

  const parent = await create('Explicit annual parent', 'year', { flowColor: 0 })
  await visible('half', false); await closeMenu()
  await search('Explicit annual parent')
  await page.locator('.modal.detail').getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator(`#item-${parent} .task-title`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Next step', exact: true }).click()
  const seeded = page.locator('dialog.seeded-composer')
  await seeded.waitFor()
  assert.equal(await column('half').isVisible(), true, 'Opening a targeted draft reveals its actual horizon')
  await seeded.locator('textarea.composer-input').fill('Explicit half-year child')
  await seeded.locator('.composer-primary').click()
  await seeded.waitFor({ state: 'detached' })
  assert.equal(await column('half').isVisible(), true)
  await pollPage(page, async parent => {
    const snapshot = await window.goalloom.getSnapshot(), child = snapshot.items.find(item => item.title === 'Explicit half-year child')
    return child?.placement.horizon === 'half' && snapshot.relations.some(edge => edge.parentId === parent && edge.childId === child.id)
  }, parent)
  const childId = await page.evaluate(async () => (await window.goalloom.getSnapshot()).items.find(item => item.title === 'Explicit half-year child').id)
  await page.locator(`#item-${childId} .flow-dot-button`).click()
  await page.locator('.popover-floating .flow-dot-relations').waitFor()
  // Keyboard opening does not send an outside pointer press to the existing row popover.
  await toggle().focus(); await toggle().press('ArrowDown')
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-column-choice') === 'year')
  await choice('half').press('Space')
  await column('half').waitFor({ state: 'hidden' })
  await page.locator('.popover-floating .flow-dot-relations').waitFor({ state: 'detached', timeout: 2000 })
  assert.equal(await choice('half').evaluate(node => node === document.activeElement), true)
  await visible('half', true); await closeMenu()
  await page.locator('.flow-filter .chip').nth(1).click()
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge').length > 0)
  await visible('half', false)
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge').length === 0)
  await visible('half', true); await closeMenu()
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge').length > 0)
  await page.locator('.flow-filter .chip').first().click()
  const dragged = await create('Visible keyboard destination', 'later')
  if (await page.locator('#later-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('#later-toggle').click()
  for (const horizon of ['year', 'half', 'cycle', 'month']) await visible(horizon, false)
  await visible('week', true); await closeMenu()
  await page.locator(`#item-${dragged} .drag-handle`).focus(); await page.keyboard.press('Space')
  await page.waitForFunction(() => document.documentElement.dataset.dragging === 'true')
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space')
  await pollPage(page, async id => (await window.goalloom.getItem(id)).item.placement.horizon === 'week', dragged)
  await page.waitForFunction(() => !document.documentElement.dataset.dragging && !document.querySelector('.fab').disabled)
  check('Explicit creation reveals its actual horizon and preserves the parent; hiding closes row portals, hidden endpoints have no lines, and keyboard drag skips hidden columns')

  for (const horizon of ['week', 'day']) await visible(horizon, true)
  await closeMenu()
  for (const width of [1880, 720]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 840), width)
    await page.waitForFunction(width => innerWidth === width, width)
    const geometry = await page.evaluate(() => ({
      width: innerWidth, sheet: document.querySelector('.board-later > .board-column').getBoundingClientRect().width,
      columns: [...document.querySelectorAll('.board-timeline > .board-column:not([hidden])')].map(node => ({ horizon: node.dataset.horizon, width: node.getBoundingClientRect().width, border: getComputedStyle(node).borderLeftWidth })),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }))
    report.geometry.push(geometry)
    assert(geometry.columns.every(column => column.width >= 320))
    assert(Math.abs(geometry.sheet - geometry.columns[0].width) <= 1)
    assert.equal(geometry.columns[0].border, '0px')
    assert.equal(geometry.overflow, false)
    await open()
    const bounds = await menu().boundingBox()
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width)
    await shot(`layout-${width}`); await closeMenu()
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 840))
  for (const style of ['paper', 'minimal']) for (const theme of ['light', 'dark']) {
    await execute({ type: 'preferences', style, theme }); await open(); await shot(`${style}-${theme}`); await closeMenu()
  }
  const labels = { zh: ['显示的列', '至少显示一列'], en: ['Visible columns', 'Keep at least one column visible'], ja: ['表示する列', '少なくとも1列を表示してください'], es: ['Columnas visibles', 'Mantén al menos una columna visible'], fr: ['Colonnes visibles', 'Gardez au moins une colonne visible'] }
  for (const [locale, [label, hint]] of Object.entries(labels)) {
    await page.evaluate(locale => window.goalloom.setLanguage(locale), locale); await page.reload(); await page.locator('.board').waitFor()
    assert.equal(await toggle().getAttribute('aria-label'), label)
    await visible('week', false)
    await menu().locator('[aria-disabled="true"]').hover()
    assert.equal(await menu().getByText(hint, { exact: true }).isVisible(), true)
    await shot(`locale-${locale}`)
    await visible('week', true); await closeMenu()
  }
  await page.evaluate(() => window.goalloom.setLanguage('en')); await page.reload(); await page.locator('.board').waitFor()
  await open()
  await page.evaluate(() => { window.columnStorageSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key === 'goalloom.visiblePlanningColumns') throw new DOMException('Synthetic preference denial', 'QuotaExceededError'); return window.columnStorageSetItem.call(this, key, value) } })
  try { await visible('week', false); assert.deepEqual(await shown(), ['day']) }
  finally { await page.evaluate(() => { Storage.prototype.setItem = window.columnStorageSetItem; delete window.columnStorageSetItem }) }
  await visible('week', true); await closeMenu()
  check('Equal-width reflow, first-visible separator, narrow viewport, four appearances, five locales and session use when preference storage fails')
  await app.close(); app = null
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
  // A second isolated workspace verifies natural-calendar labels without replacing the first workspace.
  const natural = await mkdtemp(join(tmpdir(), 'goalloom-columns-natural-'))
  try {
    await writeFile(join(natural, 'preferences.json'), JSON.stringify({ language: 'en' }))
    app = await electron.launch({ ...options, args: ['.', `--user-data-dir=${natural}`] }); page = await app.firstWindow()
    await finishSetup(page, { mode: 'natural' }); await open()
    assert.equal(await choice('year').innerText(), 'This year')
    assert.equal(await choice('cycle').innerText(), 'This quarter')
    await shot('natural-calendar')
  } finally { if (app) await app.close(); app = null; await rm(natural, { recursive: true, force: true }) }
  check('Natural-calendar year and quarter names')
}
try {
  await run(); report.passed = true
} catch (error) {
  report.error = String(error.stack ?? error)
  if (page && app) {
    await page.screenshot({ path: join(evidence, reportName ? `${reportName}-failure.png` : 'failure.png') }).catch(() => {})
    report.diagnostics = await page.evaluate(() => ({ documentFocus: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML?.slice(0, 1000), text: document.body.innerText.slice(0, 4000) })).catch(() => null)
    report.nativeWindow = await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; return window ? { focused: window.isFocused(), visible: window.isVisible(), bounds: window.getBounds() } : null }).catch(() => null)
  }
  throw error
} finally {
  await writeFile(join(evidence, reportName ? `${reportName}-report.json` : 'report.json'), JSON.stringify(report, null, 2))
  if (app) await app.close().catch(() => {})
  await rm(profile, { recursive: true, force: true })
}
