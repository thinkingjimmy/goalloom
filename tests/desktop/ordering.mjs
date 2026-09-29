/**
 * [INPUT]: Production Electron build and an isolated Repository/SQLite ordering fixture.
 * [OUTPUT]: Repeatable ordering/motion assertions with row-endpoint alignment, a video, screenshots and runtime/transaction JSON.
 * [POS]: Focused desktop acceptance; observes real animation and IPC, with native sizing only during setup.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { stepPeriod } from './fixtures/period-step.mjs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir, cpus, release, version, arch } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'

const evidence = resolve('output/tests/ordering')
await mkdir(evidence, { recursive: true })
await build({ configFile: false, build: { outDir: 'output/tests/build/ordering', emptyOutDir: false, lib: { entry: 'tests/desktop/fixtures/ordering-seed.ts', formats: ['cjs'], fileName: () => 'ordering-seed.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
const profile = await mkdtemp(join(tmpdir(), 'goalloom-ordering-'))
const report = { passed: false, packaged: Boolean(process.argv[2]), checks: [], screenshots: [], videos: [], motion: [], errors: [], environment: { version: version(), release: release(), arch: arch(), cpu: cpus()[0]?.model, machineScope: process.env.GOALLOOM_TEST_MACHINE_SCOPE ?? 'Host OS reported; physical/VM status not independently verified' } }
let application, page
try {
  const seed = spawnSync(electronPath, ['output/tests/build/ordering/ordering-seed.cjs', profile, join(evidence, 'transactions.json')], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
  assert.equal(seed.status, 0, seed.stderr)
  const fixture = JSON.parse(await readFile(join(profile, 'ordering-fixture.json'), 'utf8'))
  const { ids } = fixture
  report.runtime = fixture.report.runtime
  report.checks.push(...fixture.report.checks)
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
  const options = process.argv[2] ? { executablePath: resolve(process.argv[2]), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
  const launch = () => electron.launch({ ...options, env: environment, recordVideo: { dir: join(evidence, 'video'), size: { width: 1880, height: 1000 } } })
  const connect = async () => {
    page = await application.firstWindow(); page.setDefaultTimeout(12000)
    if (page.video()) report.videos.push(await page.video().path())
    page.on('pageerror', error => report.errors.push(error.message))
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1880, 1000))
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.locator('.board').waitFor()
    await page.evaluate(() => {
      window.motionRuns = []; window.motionFrames = []; window.motionUntil = 0
      const animate = Element.prototype.animate
      Element.prototype.animate = function (...args) {
        const animation = animate.apply(this, args)
        if (this.hasAttribute('data-virtual-id')) window.motionRuns.push({ id: this.dataset.virtualId, at: performance.now(), frames: animation.effect.getKeyframes(), duration: animation.effect.getTiming().duration })
        return animation
      }
      window.sampleOrder = ids => {
        window.motionFrames = []; window.motionUntil = performance.now() + 650
        const record = () => {
          const board = document.querySelector('.board'), origin = board.getBoundingClientRect()
          const rows = Object.fromEntries(ids.map(id => [id, document.getElementById(`item-${id}`)?.getBoundingClientRect().top ?? null]))
          const lines = [...document.querySelectorAll('.relation-edge')].filter(path => getComputedStyle(path).visibility !== 'hidden').map(path => ({ id: path.dataset.edgeId, start: path.getPointAtLength(0), end: path.getPointAtLength(path.getTotalLength()) }))
          const spots = [...document.querySelectorAll('.breakpoint')].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden').map(node => {
            const row = document.getElementById(`item-${node.dataset.spotKey.slice(node.dataset.spotKey.indexOf(':') + 1)}`)?.getBoundingClientRect(), point = node.getBoundingClientRect()
            return { key: node.dataset.spotKey, error: row ? Math.max(Math.abs(point.right - (row.right - 6)), Math.abs(point.top + point.height / 2 - row.top - 16)) : null }
          })
          window.motionFrames.push({ at: performance.now(), rows, spots, lines: lines.map(line => ({ id: line.id, startY: line.start.y + origin.top, endY: line.end.y + origin.top })) })
        }
        // Read after all animation-frame callbacks, matching the geometry the browser paints.
        // Reading in our earlier RAF callback would compare this frame's cards to the prior frame's paths.
        const frame = () => { setTimeout(record, 0); if (performance.now() < window.motionUntil) requestAnimationFrame(frame) }
        requestAnimationFrame(frame)
      }
    })
  }
  const column = horizon => page.locator(`.board-column[data-horizon="${horizon}"]`)
  const titles = horizon => column(horizon).locator('.task-row[data-done="false"] .task-title').allTextContents()
  const ordered = async (horizon, expected) => {
    await page.waitForFunction(({ horizon, expected }) => JSON.stringify([...document.querySelectorAll(`.board-column[data-horizon="${horizon}"] .task-row[data-done="false"] .task-title`)].map(node => node.textContent)) === JSON.stringify(expected), { horizon, expected })
    assert.deepEqual(await titles(horizon), expected)
  }
  const settings = () => page.getByRole('dialog', { name: '设置与数据', exact: true })
  const toggle = () => settings().getByRole('switch', { name: '按上级自动排序', exact: true })
  const open = async () => {
    await page.getByRole('button', { name: '设置与数据', exact: true }).click()
    await settings().getByRole('navigation').getByRole('button', { name: '看板', exact: true }).click()
    await toggle().waitFor()
  }
  const close = async () => { await page.keyboard.press('Escape'); await settings().waitFor({ state: 'hidden' }) }
  const shot = async name => { const path = join(evidence, `${name}.png`); await page.screenshot({ path }); report.screenshots.push(path) }
  const raw = horizon => page.evaluate(async horizon => (await window.goalloom.getSnapshot()).items.filter(item => item.placement.horizon === horizon && item.status === 'todo').map(item => item.title), horizon)
  const execute = action => page.evaluate(async action => {
    const snapshot = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ ...action, generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw new Error(reply.message)
    return reply.result
  }, action)
  const move = async (id, beforeId, extra = {}) => {
    const item = await page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
    return execute({ type: 'move', itemId: id, horizon: item.placement.horizon, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, beforeId, ...extra })
  }
  const dragKeys = async (id, keys) => {
    const handle = page.locator(`#item-${id} .drag-handle`)
    await handle.focus(); await handle.press('Space')
    await page.waitForFunction(() => document.documentElement.dataset.dragging === 'true')
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    for (const key of keys) await page.keyboard.press(key)
    await page.keyboard.press('Space')
    await page.waitForFunction(() => !document.documentElement.dataset.dragging && !document.querySelector('.fab').disabled)
  }
  const sample = async () => page.evaluate(ids => window.sampleOrder(ids), [ids.A1, ids.B1, ids.C1, ids.Aw, ids.Bw, ids.Cw])
  const collect = async label => {
    await page.waitForFunction(() => performance.now() >= window.motionUntil)
    const frames = await page.evaluate(() => window.motionFrames)
    report.motion.push({ label, frames })
    return frames
  }
  application = await launch(); await connect()
  await ordered('month', ['A1', 'C1', 'B1', 'A2', 'Unlinked'])
  await open(); assert.equal(await toggle().getAttribute('aria-checked'), 'false')
  assert.equal(await settings().getByRole('group', { name: '在这些列完成时撒花' }).getByRole('button').count(), 5)
  await sample(); await toggle().click()
  await ordered('month', ['A1', 'A2', 'B1', 'C1', 'Unlinked'])
  await ordered('week', ['Aw', 'Bw', 'Cw']); await ordered('day', ['Ad', 'Bd', 'Cd'])
  const enabledFrames = await collect('Enable ordering')
  assert(new Set(enabledFrames.map(frame => Math.round(frame.rows[ids.C1] ?? 0))).size > 2, 'Cards travel through real intermediate positions')
  assert.deepEqual(await raw('month'), ['A1', 'C1', 'B1', 'A2', 'Unlinked'])
  await shot('board-settings'); await close()
  report.checks.push('Local default-off switch, migrated five-column confetti, A/C/B example and transitive week/day order without writes')

  const pickerTitles = () => page.locator('.relation-picker .menu-text').allTextContents()
  await page.locator(`#item-${ids.Aw} .flow-dot-button`).click()
  assert.deepEqual(await pickerTitles(), ['A1', 'A2', 'B1', 'C1', 'Unlinked', 'A', 'B', 'C'])
  await shot('parent-picker-ordered')
  await page.locator('.relation-picker input').fill('1')
  await page.waitForFunction(() => document.querySelectorAll('.relation-picker .menu-text').length === 3)
  assert.deepEqual(await pickerTitles(), ['A1', 'B1', 'C1'])
  await page.keyboard.press('Escape')
  await page.locator(`#item-${ids.Aw} .task-title`).click()
  await page.getByRole('dialog', { name: '当前条目', exact: true }).locator('.detail-props .detail-chip', { hasText: '上级' }).click()
  if (await page.getByRole('menuitem', { name: '关联到…', exact: true }).count()) await page.getByRole('menuitem', { name: '关联到…', exact: true }).click()
  assert.deepEqual(await pickerTitles(), ['A1', 'A2', 'B1', 'C1', 'Unlinked', 'A', 'B', 'C'])
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  report.checks.push('Board and detail relation pickers, including searched board candidates, follow automatic order while keeping linked and nearest-horizon priorities')

  await dragKeys(ids.A2, ['ArrowUp'])
  await ordered('month', ['A2', 'A1', 'B1', 'C1', 'Unlinked'])
  await dragKeys(ids.A2, ['ArrowUp'])
  await ordered('month', ['A2', 'A1', 'B1', 'C1', 'Unlinked'])
  await page.getByRole('button', { name: '只看 A', exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('.relation-edge')].some(path => getComputedStyle(path).visibility !== 'hidden'))
  await page.evaluate(() => { window.rowIdentities = new Map([...document.querySelectorAll('.task-row')].map(row => [row.id, row])) })
  await sample()
  const source = await page.locator(`#item-${ids.C} .task-title`).boundingBox(), target = await page.locator(`#item-${ids.A} .task-title`).boundingBox()
  await page.mouse.move(source.x + 50, source.y + 10); await page.mouse.down(); await page.mouse.move(target.x + 50, target.y + 8, { steps: 12 }); await page.mouse.up()
  await ordered('month', ['C1', 'A2', 'A1', 'B1', 'Unlinked'])
  await ordered('week', ['Cw', 'Aw', 'Bw']); await ordered('day', ['Cd', 'Ad', 'Bd'])
  const dragFrames = await collect('Pointer parent reorder')
  assert(new Set(dragFrames.map(frame => Math.round(frame.rows[ids.A1] ?? 0))).size > 2)
  assert.equal(await page.evaluate(() => [...window.rowIdentities].every(([id, row]) => document.getElementById(id) === row)), true)
  const relations = await page.evaluate(async () => (await window.goalloom.getSnapshot()).relations)
  let maxError = 0
  for (const frame of dragFrames) for (const line of frame.lines) {
    const edge = relations.find(edge => edge.id === line.id)
    if (edge && frame.rows[edge.childId] !== undefined && frame.rows[edge.childId] !== null) maxError = Math.max(maxError, Math.abs(line.endY - (frame.rows[edge.childId] + 16)))
  }
  assert(maxError < 12, `Relation endpoints stay with moving rows (max ${maxError}px)`)
  report.lineMaxError = maxError
  const spotErrors = dragFrames.flatMap(frame => frame.spots).map(spot => spot.error).filter(error => error !== null)
  assert(spotErrors.length > 0, 'Moving breakpoints were observed')
  report.breakpointMaxError = Math.max(...spotErrors)
  assert(report.breakpointMaxError < 2, `Breakpoint buttons stay anchored (max ${report.breakpointMaxError}px)`)
  await shot('ordered-board')
  report.checks.push('Pointer cascade and group-bounded keyboard ordering retain row DOM; live relation endpoints follow movement')

  await sample(); await move(ids.C, null); await page.waitForTimeout(70); await move(ids.C, ids.A)
  await ordered('month', ['C1', 'A2', 'A1', 'B1', 'Unlinked'])
  const interrupted = await collect('Interrupted parent reorder')
  for (let index = 1; index < interrupted.length; index++) {
    const previous = interrupted[index - 1], frame = interrupted[index]
    if (frame.at - previous.at > 25) continue
    for (const id of [ids.A1, ids.C1, ids.Aw, ids.Cw]) assert(Math.abs(frame.rows[id] - previous.rows[id]) < 45, 'Interrupted motion never jumps back to a distant endpoint')
  }
  assert.equal(await page.locator('.virtual-rows').evaluateAll(nodes => nodes.flatMap(node => node.getAnimations({ subtree: true })).filter(animation => animation.playState === 'running').length), 0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const animationsBefore = await page.evaluate(() => window.motionRuns.length)
  await move(ids.C, null); await ordered('month', ['A2', 'A1', 'B1', 'C1', 'Unlinked'])
  assert.equal(await page.evaluate(() => window.motionRuns.length), animationsBefore)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  report.checks.push('Interrupted motion settles without leftover animations; reduced motion produces no row animations')

  await stepPeriod(column('month'), 'next')
  await ordered('month', ['Future A', 'Future C'])
  await move(ids.C, ids.A); await ordered('month', ['Future C', 'Future A'])
  const beforeMaterialize = await raw('month')
  await open(); await toggle().click()
  await page.waitForFunction(() => localStorage.getItem('goalloom.parent-order') === 'false')
  await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="按上级自动排序"]')?.getAttribute('aria-checked') === 'false')
  await ordered('month', ['Future C', 'Future A'])
  assert.deepEqual(await raw('month'), ['C1', 'A2', 'A1', 'B1', 'Unlinked'])
  await close()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await pollPage(page, async expected => JSON.stringify((await window.goalloom.getSnapshot()).items.filter(item => item.placement.horizon === 'month').map(item => item.title)) === JSON.stringify(expected), beforeMaterialize)
  assert.equal(await page.evaluate(() => localStorage.getItem('goalloom.parent-order')), 'false')
  await open(); await toggle().click(); await toggle().click()
  await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="按上级自动排序"]')?.getAttribute('aria-checked') === 'false')
  await close(); await move(ids.C, null)
  await ordered('month', ['Future C', 'Future A'])
  await stepPeriod(column('month'), 'previous')
  await ordered('month', ['C1', 'A2', 'A1', 'B1', 'Unlinked'])
  report.checks.push('Future ordering follows current ancestors; disabling materializes all periods without a jump; one undo restores saved manual order and keeps the local switch off')

  await application.close(); application = await launch(); await connect()
  await open(); assert.equal(await toggle().getAttribute('aria-checked'), 'false')
  await toggle().click(); await close()
  await application.close(); application = await launch(); await connect()
  await ordered('month', ['A2', 'A1', 'B1', 'C1', 'Unlinked'])
  await open(); assert.equal(await toggle().getAttribute('aria-checked'), 'true'); await close()
  report.checks.push('Both enabled and disabled device preferences survive a real Electron restart')

  await move(ids.C, ids.A); await ordered('month', ['C1', 'A2', 'A1', 'B1', 'Unlinked'])
  await dragKeys(ids.A2, ['ArrowRight'])
  await ordered('week', ['Cw', 'Aw', 'Bw', 'A2'])
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await ordered('month', ['C1', 'A2', 'A1', 'B1', 'Unlinked'])
  report.checks.push('Parent moves determine child order; keyboard cross-column move regroups at its new nearest parent and undo restores it')

  const itemAction = async (id, action) => {
    const item = await page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
    return execute({ ...action, itemId: id, expectedVersion: item.version })
  }
  await itemAction(ids.C, { type: 'status', status: 'done' })
  await ordered('month', ['C1', 'A2', 'A1', 'B1', 'Unlinked'])
  await itemAction(ids.C, { type: 'archive', archived: true })
  await ordered('month', ['C1', 'A2', 'A1', 'B1', 'Unlinked'])
  const deleted = await itemAction(ids.C, { type: 'delete' })
  await ordered('month', ['A2', 'A1', 'B1', 'C1', 'Unlinked'])
  await itemAction(ids.C, { type: 'restoreItem', deletionSource: deleted.operationId })
  await ordered('month', ['C1', 'A2', 'A1', 'B1', 'Unlinked'])
  await itemAction(ids.C, { type: 'archive', archived: false })
  await itemAction(ids.C, { type: 'status', status: 'todo' })
  const unlink = await page.evaluate(async ({ parentId, childId }) => {
    const snapshot = await window.goalloom.getSnapshot(), parent = (await window.goalloom.getItem(parentId)).item, child = (await window.goalloom.getItem(childId)).item
    return { relationId: snapshot.relations.find(edge => edge.parentId === parentId && edge.childId === childId).id, expectedParentVersion: parent.version, expectedChildVersion: child.version }
  }, { parentId: ids.C, childId: ids.C1 })
  const unlinked = await execute({ type: 'unlink', ...unlink })
  await ordered('month', ['A2', 'A1', 'B1', 'C1', 'Unlinked'])
  await execute({ type: 'undo', originalOperationId: unlinked.operationId })
  await ordered('month', ['C1', 'A2', 'A1', 'B1', 'Unlinked'])
  await itemAction(ids.B1, { type: 'status', status: 'done' })
  await itemAction(ids.C1, { type: 'status', status: 'done' })
  await column('month').locator('summary').click()
  await page.waitForFunction(() => document.querySelectorAll('[data-horizon="month"] .task-row[data-done="true"]').length === 2)
  assert.deepEqual(await column('month').locator('.task-row[data-done="true"] .task-title').allTextContents(), ['C1', 'B1'])
  await ordered('month', ['A2', 'A1', 'Unlinked'])
  await itemAction(ids.B1, { type: 'status', status: 'todo' }); await itemAction(ids.C1, { type: 'status', status: 'todo' })
  await ordered('month', ['C1', 'A2', 'A1', 'B1', 'Unlinked'])
  report.checks.push('Completed and archived ancestors retain priority; deletion, restore, unlink and undo recalculate, with TODO and completed rows ordered separately')

  const longRows = await page.evaluate(async parents => {
    const snapshot = await window.goalloom.getSnapshot(), ids = []
    for (let index = 0; index < 126; index++) {
      const parentId = parents[index % parents.length], parent = (await window.goalloom.getItem(parentId)).item
      const reply = await window.goalloom.execute({ type: 'create', operationId: crypto.randomUUID(), generation: snapshot.workspace.generation,
        title: `Ordered row ${String(index).padStart(3, '0')}`, horizon: 'day', parentId, expectedParentVersion: parent.version })
      if (!reply.ok) throw new Error(reply.message)
      ids.push(reply.result.itemId)
    }
    return ids
  }, [ids.Aw, ids.Bw, ids.Cw])
  await page.waitForFunction(() => document.querySelector('[data-horizon="day"] [aria-setsize="129"]'))
  const scroller = column('day').locator('.column-content')
  await scroller.evaluate(node => { node.scrollTop = 800 })
  await page.waitForTimeout(300)
  const focus = await scroller.evaluate(node => {
    const bounds = node.getBoundingClientRect()
    const button = [...node.querySelectorAll('.task-title')].find(button => { const rect = button.getBoundingClientRect(); return rect.top > bounds.top + 60 && rect.bottom < bounds.bottom - 60 })
    button.focus({ preventScroll: true }); window.orderFocus = button
    return { id: button.closest('.task-row').dataset.itemId, scrollTop: node.scrollTop }
  })
  await page.evaluate(ids => window.sampleOrder(ids), longRows)
  await move(ids.C, null)
  await collect('Virtualized cascade with pinned focus')
  assert.equal(await page.evaluate(() => document.activeElement === window.orderFocus), true)
  assert(Math.abs(await scroller.evaluate(node => node.scrollTop) - focus.scrollTop) < 2, 'Reordering preserves the scroll position')
  assert(await column('day').locator('.task-row').count() < 65, 'The old window is released after motion')
  await column('day').locator('[data-add-item]').click()
  const draft = column('day').locator('.quick-add input')
  await draft.fill('Unsubmitted ordering draft')
  await move(ids.C, ids.A)
  await ordered('month', ['C1', 'A2', 'A1', 'B1', 'Unlinked'])
  assert.equal(await draft.inputValue(), 'Unsubmitted ordering draft')
  assert.equal(await draft.evaluate(node => document.activeElement === node), true)
  await shot('virtual-list-draft'); await draft.press('Escape')
  report.checks.push('129-row virtualized cascade retains focus, drafts and scroll, and releases the prior window after motion')

  const beforeFailure = await raw('month')
  await application.evaluate(({ ipcMain }) => {
    const command = ipcMain._invokeHandlers.get('goalloom:command'), query = ipcMain._invokeHandlers.get('goalloom:query')
    globalThis.orderingFault = { mode: 'reject', commands: [], receiptFailed: false }
    ipcMain.removeHandler('goalloom:command'); ipcMain.removeHandler('goalloom:query')
    ipcMain.handle('goalloom:command', async (event, input) => {
      const fault = globalThis.orderingFault
      if (input.type !== 'materializeParentOrder') return command(event, input)
      fault.commands.push(input.operationId)
      if (fault.mode === 'reject') { fault.mode = 'none'; return { ok: false, code: 'invalid', message: 'Injected ordering save failure' } }
      const result = await command(event, input)
      if (fault.mode === 'unknown') { fault.mode = 'receipt'; throw new Error('Injected lost ordering response') }
      return result
    })
    ipcMain.handle('goalloom:query', (event, input) => {
      const fault = globalThis.orderingFault
      if (input.type === 'receipt' && fault.mode === 'receipt') { fault.mode = 'none'; fault.receiptFailed = true; throw new Error('Injected temporarily unavailable receipt') }
      return query(event, input)
    })
  })
  await open(); await toggle().click()
  await page.getByRole('alert').filter({ hasText: 'Injected ordering save failure' }).waitFor()
  assert.equal(await toggle().getAttribute('aria-checked'), 'true')
  assert.equal(await page.evaluate(() => localStorage.getItem('goalloom.parent-order')), 'true')
  assert.deepEqual(await raw('month'), beforeFailure)
  await application.evaluate(() => { globalThis.orderingFault.mode = 'unknown'; globalThis.orderingFault.commands = [] })
  await toggle().click()
  await page.getByRole('alert').filter({ hasText: '尚未确认保存结果' }).waitFor()
  assert.equal(await toggle().getAttribute('aria-checked'), 'true')
  assert.equal(await toggle().isDisabled(), true)
  assert.equal(await page.evaluate(() => localStorage.getItem('goalloom.parent-order')), 'true')
  await close(); await page.getByRole('button', { name: '重试核对', exact: true }).click()
  await page.waitForFunction(() => localStorage.getItem('goalloom.parent-order') === 'false')
  await ordered('month', ['C1', 'A2', 'A1', 'B1', 'Unlinked'])
  const fault = await application.evaluate(() => globalThis.orderingFault)
  assert.equal(fault.receiptFailed, true); assert.equal(fault.commands.length, 2); assert.equal(fault.commands[0], fault.commands[1])
  await open(); assert.equal(await toggle().getAttribute('aria-checked'), 'false'); await close()
  report.checks.push('Rejected saving leaves auto order enabled; a lost committed response and unavailable receipt keep writes locked until the same operation is recovered without duplicate writes')

  await open(); await toggle().click(); await close()
  await move(ids.C, null)
  await stepPeriod(column('month'), 'next')
  await ordered('month', ['Future A', 'Future C'])
  await application.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('goalloom:query')
    globalThis.orderingReads = []
    ipcMain.removeHandler('goalloom:query')
    ipcMain.handle('goalloom:query', async (event, input) => {
      const result = await original(event, input)
      if (input.type === 'boardPeriods') await new Promise(resolve => globalThis.orderingReads.push(resolve))
      return result
    })
  })
  await open(); await toggle().click()
  await page.waitForFunction(() => localStorage.getItem('goalloom.parent-order') === 'false')
  assert.equal(await toggle().getAttribute('aria-checked'), 'true', 'Projection remains enabled until the future read settles')
  assert.equal(await toggle().isDisabled(), true)
  const oldGeneration = (await page.evaluate(() => window.goalloom.getSnapshot())).workspace.generation
  await settings().getByRole('navigation').getByRole('button', { name: '备份与恢复', exact: true }).click()
  await settings().getByRole('button', { name: '重置', exact: true }).click()
  await settings().getByRole('button', { name: '创建保护备份并继续', exact: true }).click()
  await settings().getByText('已创建并校验', { exact: true }).waitFor()
  await settings().getByRole('checkbox').check()
  await settings().getByRole('button', { name: '重置并重新配置', exact: true }).click()
  await page.getByRole('textbox', { name: '三个月的方向', exact: true }).waitFor()
  assert.notEqual((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.generation, oldGeneration)
  const released = await application.evaluate(() => { const reads = globalThis.orderingReads.splice(0); reads.forEach(resolve => resolve()); return reads.length })
  assert(released > 0)
  await open()
  await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="按上级自动排序"]')?.getAttribute('aria-checked') === 'false')
  assert.equal(await toggle().isDisabled(), false)
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).items.length, 0)
  assert.equal(await page.locator('.task-row').count(), 0)
  await shot('generation-isolation')
  report.checks.push('A verified protective workspace replacement clears pending materialization and ignores the delayed old-generation future response')
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) {
  report.failure = error.stack ?? String(error)
  if (page && !page.isClosed()) await page.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {})
  throw error
} finally {
  if (application) await application.close().catch(() => {})
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2))
  await rm(profile, { recursive: true, force: true })
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, evidence }, null, 2))
