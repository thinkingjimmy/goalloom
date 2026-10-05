/**
 * [INPUT]: Built Electron and a fresh synthetic workspace through production IPC.
 * [OUTPUT]: Default planning columns, independent sidebar, parent unlinking on Later moves, scrolling, drag, motion, localization and restart evidence under output/tests/later-sidebar.
 * [POS]: Focused desktop E2E acceptance; never opens the owner's workspace or captures unrelated desktop content.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { finishSetup } from './fixtures/setup.mjs'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir, arch, cpus, release, version } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'

const evidence = resolve('output/tests/later-sidebar'), profile = await mkdtemp(join(tmpdir(), 'goalloom-later-'))
await mkdir(evidence, { recursive: true })
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const options = { args: ['.', `--user-data-dir=${profile}`], env }
const report = { passed: false, checks: [], motion: [], screenshots: [], environment: { os: version(), release: release(), arch: arch(), cpu: cpus()[0]?.model, machineScope: process.env.GOALLOOM_TEST_MACHINE_SCOPE ?? 'Host OS reported; physical/VM status not independently verified', packaged: false } }
let app, page
try {
  app = await electron.launch(options)
  page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 840))
  await finishSetup(page)
  Object.assign(report.environment, await page.evaluate(() => window.goalloom.getRuntime()))
  const check = message => { report.checks.push(message); console.log(message) }
  const shot = async name => { const path = join(evidence, `${name}.png`); await page.screenshot({ path }); report.screenshots.push(path) }
  const toggle = () => page.locator('#later-toggle'), later = () => page.locator('#later-sidebar')
  const settled = () => page.waitForFunction(() => [...document.querySelectorAll('.board-later, .board-timeline')].every(node => node.getAnimations().every(animation => animation.playState === 'finished')))
  const open = async wanted => {
    if ((await toggle().getAttribute('aria-expanded') === 'true') !== wanted) await toggle().click()
    await page.waitForFunction(wanted => document.getElementById('later-toggle').getAttribute('aria-expanded') === String(wanted), wanted)
    await settled()
  }
  const count = async value => {
    await page.waitForFunction(value => document.querySelector('.later-count')?.textContent === String(value), value)
    assert.equal(await page.locator('.later-count').isVisible(), value > 0)
  }
  const execute = action => page.evaluate(async action => {
    const { workspace } = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ ...action, generation: workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return reply.result
  }, action)
  const item = id => page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
  const create = async (title, horizon = 'later', extra = {}) => (await execute({ type: 'create', title, horizon, ...extra,
    ...(extra.parentId ? { expectedParentVersion: (await item(extra.parentId)).version } : {}) })).itemId
  const move = async (id, horizon) => {
    const value = await item(id)
    await execute({ type: 'move', itemId: id, horizon, expectedVersion: value.version, expectedPlacementVersion: value.placement.version })
  }
  const waitHorizon = (id, horizon) => pollPage(page, async ({ id, horizon }) => (await window.goalloom.getItem(id)).item.placement.horizon === horizon, { id, horizon })
  const undo = async () => { await page.keyboard.press('ControlOrMeta+z'); await page.waitForFunction(() => !document.querySelector('.fab').disabled) }
  const dragKeys = async (id, key) => {
    await page.locator(`#item-${id} .drag-handle`).scrollIntoViewIfNeeded()
    await page.locator(`#item-${id} .drag-handle`).focus()
    await page.keyboard.press('Space')
    await page.waitForFunction(() => document.documentElement.dataset.dragging === 'true')
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.keyboard.press(key); await page.keyboard.press('Space')
    await page.waitForFunction(() => !document.documentElement.dataset.dragging && !document.querySelector('.fab').disabled)
  }
  const dragPointer = async (id, horizon) => {
    const row = page.locator(`#item-${id} .task-title`), target = page.locator(`.board-column[data-horizon="${horizon}"]`)
    await target.scrollIntoViewIfNeeded(); await row.scrollIntoViewIfNeeded()
    const from = await row.boundingBox(), to = await target.boundingBox()
    const panel = await target.locator('..').boundingBox()
    const x = Math.max(to.x + 24, Math.min(to.x + to.width / 2, panel.x + panel.width - 40))
    await page.mouse.move(from.x + Math.min(60, from.width / 2), from.y + 16); await page.mouse.down()
    await page.mouse.move(from.x + 70, from.y + 16)
    await page.waitForFunction(() => document.documentElement.dataset.dragging === 'true')
    await page.mouse.move(x, to.y + 130, { steps: 16 })
    await page.waitForFunction(horizon => document.querySelector(`[data-horizon="${horizon}"]`)?.classList.contains('drop-target'), horizon)
    await page.mouse.up(); await waitHorizon(id, horizon)
    await page.waitForFunction(() => !document.querySelector('.fab').disabled)
  }

  assert.equal(await toggle().getAttribute('aria-expanded'), 'true')
  await count(0)
  // Later's sheet is exactly as wide as a time column.
  const widths = await page.evaluate(() => [document.querySelector('.board-later > .board-column'), document.querySelector('.board-timeline > .board-column')].map(node => node.getBoundingClientRect().width))
  assert(Math.abs(widths[0] - widths[1]) <= 1 && widths[1] >= 320, `Later ${widths[0]} vs column ${widths[1]}`)
  const first = await create('Later first'), second = await create('Later second'), done = await create('Later finished')
  await execute({ type: 'status', itemId: done, expectedVersion: 1, status: 'done' })
  const goal = await create('Sidebar flow', 'year', { flowColor: 0 })
  const child = await create('Existing linked item', 'month', { parentId: goal, expectedParentVersion: 1 })
  await create('Week flow item', 'week', { parentId: goal, expectedParentVersion: 1 })
  await move(child, 'later')
  const movedRelations = await page.evaluate(async () => (await window.goalloom.getSnapshot()).relations)
  assert.equal(movedRelations.some(edge => edge.childId === child), false, 'Moving into Later removes the incoming relationship')
  assert.equal(movedRelations.length, 1, 'Moving into Later preserves the sibling relationship')
  await count(3)
  await page.locator('.flow-filter .chip').nth(1).click()
  await count(3)
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge').length === 1)
  await page.waitForFunction(() => document.querySelector('.relation-lines').getAnimations({ subtree: true }).every(animation => animation.playState === 'finished'))
  await shot('expanded-flow')
  await page.locator('.flow-filter .chip').first().click()
  await page.locator(`#item-${first} .check`).click(); await count(2)
  await toggle().focus(); await undo(); await count(3)
  for (const [action, remaining] of [[{ type: 'status', status: 'cancelled' }, 2], [{ type: 'status', status: 'todo' }, 3],
    [{ type: 'archive', archived: true }, 2], [{ type: 'archive', archived: false }, 3], [{ type: 'delete' }, 2], [{ type: 'restoreItem' }, 3]]) {
    await execute({ ...action, itemId: second, expectedVersion: (await item(second)).version }); await count(remaining)
  }
  check('Default expansion, exact unfiltered TODO count, zero suppression, completion/undo, cancellation, archive and deletion/restore')

  assert.equal(await page.getByRole('button', { name: 'Visible columns', exact: true }).count(), 1)
  assert.deepEqual(await page.locator('.board-timeline .board-column').evaluateAll(nodes => nodes.map(node => node.dataset.horizon)), ['year', 'half', 'cycle', 'month', 'week', 'day'])
  await page.getByRole('button', { name: 'Add to Later', exact: true }).click()
  await later().locator('.quick-add input').fill('Keep this Later draft')
  await later().locator('summary').click()
  await page.locator('.flow-filter .chip').nth(1).click()
  await later().locator('.quick-add input').focus()
  const edges = await page.evaluate(async () => (await window.goalloom.getSnapshot()).relations)
  const snapshotMotion = async wanted => {
    const sample = await page.evaluate(({ wanted, edges }) => {
      document.getElementById('later-toggle').click()
      return new Promise(resolve => requestAnimationFrame(() => {
        const nodes = ['.board-later', '.board-timeline'].map(selector => document.querySelector(selector))
        for (const node of nodes) for (const animation of node.getAnimations()) { animation.pause(); animation.currentTime = Number(animation.effect.getTiming().duration) / 2 }
        requestAnimationFrame(() => {
          const origin = document.querySelector('.board').getBoundingClientRect()
          const anchors = [...document.querySelectorAll('.relation-edge')].filter(path => getComputedStyle(path).visibility !== 'hidden').map(path => {
            const edge = edges.find(edge => edge.id === path.dataset.edgeId)
            const parent = document.getElementById(`item-${edge.parentId}`).getBoundingClientRect(), child = document.getElementById(`item-${edge.childId}`).getBoundingClientRect()
            const start = path.getPointAtLength(0), end = path.getPointAtLength(path.getTotalLength())
            const x1 = child.right <= parent.left ? parent.left : parent.right - 9, x2 = parent.right <= child.left ? child.left + 6 : child.right - 9
            return { id: edge.id, startError: Math.hypot(start.x + origin.left - x1, start.y + origin.top - parent.top - 16), endError: Math.hypot(end.x + origin.left - x2, end.y + origin.top - child.top - 16) }
          })
          resolve({ wanted, anchors, sidebar: nodes[0].getBoundingClientRect().toJSON(), timeline: nodes[1].getBoundingClientRect().toJSON(), durations: nodes.flatMap(node => node.getAnimations().map(animation => animation.effect.getTiming().duration)) })
        })
      }))
    }, { wanted, edges })
    report.motion.push(sample)
    assert(sample.sidebar.x > -sample.sidebar.width && sample.sidebar.x < 0, `Sidebar has a real intermediate frame: ${JSON.stringify(sample.sidebar)}`)
    assert(sample.timeline.x > 0 && sample.timeline.x < sample.sidebar.width, `Timeline follows without scaling text: ${JSON.stringify(sample.timeline)}`)
    assert(sample.anchors.length > 0 && sample.anchors.every(anchor => anchor.startError < 1 && anchor.endError < 1), 'Relation lines follow moving panel endpoints')
    await shot(wanted ? 'opening-midpoint' : 'closing-midpoint')
    await page.evaluate(() => { for (const node of document.querySelectorAll('.board-later, .board-timeline')) for (const animation of node.getAnimations()) animation.play() })
    await settled()
  }
  await snapshotMotion(false)
  assert.equal(await later().getAttribute('inert'), '')
  assert.equal(await page.evaluate(() => document.activeElement.id), 'later-toggle')
  await snapshotMotion(true)
  assert.equal(await later().locator('.quick-add input').inputValue(), 'Keep this Later draft')
  assert.equal(await later().locator('details').getAttribute('open'), '')
  await page.evaluate(() => {
    document.getElementById('later-toggle').click()
    return new Promise(resolve => requestAnimationFrame(() => { document.getElementById('later-toggle').click(); resolve() }))
  })
  await settled()
  assert.equal(await toggle().getAttribute('aria-expanded'), 'true')
  await later().locator('.quick-add input').press('Escape')
  await later().locator('summary').click()
  await page.locator('.flow-filter .chip').first().click()
  check('Default planning columns, measured enter/exit motion, interruption, draft/fold preservation and focus')

  const beforeScroll = await later().boundingBox()
  await page.locator('.board-timeline').evaluate(node => { node.scrollLeft = node.scrollWidth })
  assert.deepEqual(await later().boundingBox(), beforeScroll)
  await dragPointer(first, 'day'); await count(2)
  await toggle().focus(); await undo(); await count(3); await waitHorizon(first, 'later')
  await dragPointer(first, 'day')
  await dragPointer(first, 'later'); await count(3)
  await page.locator('.board-timeline').evaluate(node => { node.scrollLeft = 0 })
  await dragKeys(second, 'ArrowRight'); await waitHorizon(second, 'year')
  await dragKeys(second, 'ArrowLeft'); await waitHorizon(second, 'later')
  await open(false); await dragKeys(goal, 'ArrowLeft'); await waitHorizon(goal, 'year'); await open(true)
  await page.locator('.board-timeline').evaluate(node => { node.scrollLeft = 0 })
  await page.locator(`#item-${first} .task-title`).hover()
  const from = await page.locator(`#item-${first} .task-title`).boundingBox()
  const edge = await page.locator('.board-timeline').boundingBox()
  await page.mouse.move(from.x + 30, from.y + 16); await page.mouse.down()
  await page.mouse.move(from.x + 40, from.y + 16)
  await page.waitForFunction(() => document.documentElement.dataset.dragging === 'true')
  await page.mouse.move(edge.x + edge.width - 8, edge.y + 140, { steps: 16 })
  await page.waitForFunction(() => document.querySelector('.board-timeline').scrollLeft > 100)
  assert.deepEqual(await later().boundingBox(), beforeScroll)
  await page.keyboard.press('Escape'); await page.mouse.up()
  await waitHorizon(first, 'later')
  check('Fixed Later under horizontal scroll; bidirectional pointer/keyboard drops, undo, hidden-target exclusion and edge autoscroll')

  for (let index = 0; index < 65; index++) await create(`Sidebar long row ${String(index).padStart(2, '0')}`)
  await count(68)
  await later().locator('.column-content').evaluate(node => { node.scrollTop = 600 })
  const scrollTop = await later().locator('.column-content').evaluate(node => node.scrollTop)
  assert(await later().locator('.task-row').count() < 50)
  await open(false); await open(true)
  assert.equal(await later().locator('.column-content').evaluate(node => node.scrollTop), scrollTop)
  await open(false)
  await page.getByRole('button', { name: 'Search & commands', exact: true }).click()
  await page.getByRole('textbox', { name: 'Search items', exact: true }).fill('Sidebar long row 60')
  await page.locator('.command-results .menu-item').first().click()
  await page.locator('.modal.detail').getByRole('button', { name: 'More actions', exact: true }).click()
  assert.equal(await page.getByRole('menuitem', { name: 'Show on board', exact: true }).count(), 0)
  await page.keyboard.press('Escape')
  await page.locator('.modal.detail').getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('.modal.detail').waitFor({ state: 'detached' })
  assert.equal(await toggle().getAttribute('aria-expanded'), 'false')
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[inert]')), false)
  await open(true)
  assert.equal(await later().locator('.column-content').evaluate(node => node.scrollTop), scrollTop)
  check('Virtual rows and retained scroll; search/details preserve collapsed Later and never focus hidden rows')

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(720, 640))
  await page.waitForFunction(() => innerWidth === 720)
  // At the minimum window the sheet keeps the 320px column minimum and the timeline takes the rest.
  assert.equal(Math.round((await page.locator('.board-later > .board-column').boundingBox()).width), 320)
  assert.equal(Math.round((await page.locator('.board-later').boundingBox()).width + (await page.locator('.board-timeline').boundingBox()).width), 720)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await shot('narrow-open')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(false); await open(true)
  assert.equal(await page.locator('.board-panels').evaluate(node => node.getAnimations({ subtree: true }).length), 0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 840))
  check('720px layout and reduced-motion path')

  for (const style of ['paper', 'minimal']) for (const theme of ['light', 'dark']) {
    await execute({ type: 'preferences', style, theme })
    await page.waitForFunction(({ style, theme }) => document.documentElement.dataset.style === style && document.documentElement.dataset.theme === theme, { style, theme })
    await shot(`${style}-${theme}`)
  }
  const labels = { zh: '收起 Later · 68 项待办', en: 'Collapse Later · 68 remaining', ja: 'Later を折りたたむ · 残り 68 件', es: 'Contraer Later · 68 pendientes', fr: 'Replier Later · 68 à faire' }
  for (const locale of Object.keys(labels)) {
    await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
    await page.reload(); await page.locator('.board').waitFor()
    assert.equal(await toggle().getAttribute('aria-label'), labels[locale])
    assert.equal(await page.locator('#column-toggle[aria-haspopup="menu"]').count(), 1)
    await shot(`locale-${locale}`)
  }
  check('Both styles, both themes and five localized toggle labels')

  await open(false)
  await app.close(); app = await electron.launch(options); page = await app.firstWindow()
  await page.locator('.board').waitFor()
  assert.equal(await toggle().getAttribute('aria-expanded'), 'false')
  await count(68)
  for (const hidden of [['year', 'half', 'cycle', 'month', 'week', 'day'], ['later', 'cycle', 'month', 'week']]) {
    await page.evaluate(hidden => localStorage.setItem('goalloom.hiddenColumns', JSON.stringify(hidden)), hidden)
    await page.reload(); await page.locator('.board').waitFor()
    assert.equal(await toggle().getAttribute('aria-expanded'), String(!hidden.includes('later')))
    assert.deepEqual(await page.locator('.board-timeline .board-column').evaluateAll(nodes => nodes.map(node => node.dataset.horizon)), ['year', 'half', 'cycle', 'month', 'week', 'day'])
  }
  await open(true)
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('goalloom.hiddenColumns'))), [])
  await open(false)
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('goalloom.hiddenColumns'))), ['later'])
  await shot('default-planning-columns')
  check('Six default planning columns and a visibility menu in all locales; legacy hidden columns are ignored while the independent Later preference persists')
  report.passed = true
} catch (error) {
  report.error = String(error.stack ?? error)
  if (page) {
    await page.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {})
    report.diagnostics = await page.evaluate(() => ({ nativeDocumentFocus: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML?.slice(0, 1000), text: document.body.innerText.slice(0, 4000) })).catch(() => null)
    report.nativeWindow = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      return window ? { focused: window.isFocused(), visible: window.isVisible(), bounds: window.getBounds() } : null
    }).catch(() => null)
  }
  throw error
} finally {
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2))
  if (app) await app.close().catch(() => {})
  await rm(profile, { recursive: true, force: true })
}
