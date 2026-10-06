/**
 * [INPUT]: Production Electron build, native pointer input and isolated production Repository fixtures.
 * [OUTPUT]: Drag linking, flow-valid picking, root promotion/adoption/undo, receipt recovery, ordering and locale evidence in output/tests/relation-drag.
 * [POS]: Relation feature acceptance; no renderer bridge replacement or real user data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { finishSetup } from './fixtures/setup.mjs'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'
import { stepPeriod } from './fixtures/period-step.mjs'
import { verifyRelationVisibility } from './fixtures/relation-visibility.mjs'

const evidence = resolve('output/tests/relation-drag'), checks = [], screenshots = [], errors = []
await mkdir(evidence, { recursive: true })
await build({ configFile: false, build: { outDir: 'output/tests/build/relation-drag', emptyOutDir: false,
  lib: { entry: 'tests/desktop/fixtures/relation-drag-data.ts', formats: ['cjs'], fileName: () => 'data.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
const data = spawnSync(electronPath, ['output/tests/build/relation-drag/data.cjs', join(evidence, 'transactions.json')], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
assert.equal(data.status, 0, `${data.stdout}\n${data.stderr}`)
const profile = await mkdtemp(join(tmpdir(), 'goalloom-relation-drag-'))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2]
const application = await electron.launch({ ...(packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }), env })
const report = { passed: false, packaged: !!packaged, checks, screenshots,
  environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, machineScope: 'Host OS reported; physical/VM status not independently verified' },
  scope: 'Source Electron with production IPC and isolated SQLite. Does not establish packaged or Windows acceptance.' }
try {
  const page = await application.firstWindow()
  page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message))
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1500, 900))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await finishSetup(page)
  await page.locator('.board').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  report.flowPolicy = { rejected: [] }
  const ids = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const run = async action => { const r = await window.goalloom.execute({ generation, operationId: crypto.randomUUID(), ...action }); if (!r.ok) throw Error(r.message); return r.result }
    const item = async id => (await window.goalloom.getItem(id)).item
    const create = async (title, horizon, extra = {}) => (await run({ type: 'create', title, horizon, ...extra })).itemId
    const p = await create('Parent flow', 'cycle', { flowColor: 0 })
    const m = await create('Month parent', 'month', { parentId: p, expectedParentVersion: (await item(p)).version })
    const w = await create('Week parent', 'week', { parentId: m, expectedParentVersion: (await item(m)).version })
    const w2 = await create('Second parent', 'week'), day = await create('Drag source', 'day')
    const root = await create('Merge root', 'month', { flowColor: 1 })
    const leaf = await create('Root child', 'week', { parentId: root, expectedParentVersion: (await item(root)).version })
    const keyboard = await create('Keyboard root', 'day', { flowColor: 2 })
    const isolated = await create('Independent upper goal', 'cycle')
    const legacyParent = await create('Legacy uncolored parent', 'month')
    const legacyChild = await create('Legacy uncolored child', 'day', { parentId: legacyParent, expectedParentVersion: (await item(legacyParent)).version })
    const done = await create('Completed parent', 'week', { parentId: m, expectedParentVersion: (await item(m)).version })
    await run({ type: 'status', itemId: done, expectedVersion: 1, status: 'done' })
    const later = await create('Later target', 'later'), peer = await create('Day peer', 'day')
    return { p, m, w, w2, day, root, leaf, keyboard, isolated, legacyParent, legacyChild, done, later, peer }
  })
  const row = id => page.locator(`#item-${id}`), dot = id => row(id).locator('.flow-dot-button')
  const column = horizon => page.locator(`.board-column[data-horizon="${horizon}"]`)
  const snapshot = () => page.evaluate(() => window.goalloom.getSnapshot())
  const item = id => page.evaluate(id => window.goalloom.getItem(id), id)
  const settled = () => page.waitForFunction(() => !document.querySelector('.fab').disabled)
  const shot = async name => { const path = join(evidence, `${name}.png`); await page.screenshot({ path }); screenshots.push(path) }
  const linked = (parent, child) => pollPage(page, async ({ parent, child }) => (await window.goalloom.getSnapshot()).relations.some(e => e.parentId === parent && e.childId === child), { parent, child })
  const start = async id => {
    await settled(); await row(id).scrollIntoViewIfNeeded(); await row(id).hover()
    const rect = await dot(id).boundingBox(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 10, y)
    await page.locator('.relation-drag').waitFor(); return { x, y }
  }
  const aim = async id => {
    const r = await row(id).boundingBox()
    await page.mouse.move(r.x + Math.min(90, r.width / 2), r.y + 16, { steps: 10 })
  }
  const drag = async (child, parent) => { await start(child); await aim(parent); await row(parent).locator(':scope[data-relation-target="true"]').waitFor(); await page.mouse.up(); await linked(parent, child); await settled() }
  const undo = async () => { await page.keyboard.press('ControlOrMeta+z'); await settled() }
  await page.locator('#later-toggle').click()
  await row(ids.day).hover(); await dot(ids.day).click(); await page.locator('.flow-choose').waitFor(); await page.keyboard.press('Escape')
  await dot(ids.day).focus(); await page.keyboard.press('Enter'); await page.locator('.flow-choose').waitFor(); await page.keyboard.press('Escape')
  const press = await dot(ids.day).boundingBox()
  await page.mouse.move(press.x + 9, press.y + 9); await page.mouse.down(); await page.mouse.move(press.x + 5, press.y + 9)
  assert.equal(await page.locator('.relation-drag').count(), 0); await page.mouse.up(); await page.locator('.flow-choose').waitFor(); await page.keyboard.press('Escape')
  await row(ids.peer).hover(); await dot(ids.peer).click()
  await page.locator('.flow-choose').getByRole('menuitem', { name: /关联到上级/ }).click()
  const picker = page.locator('.relation-picker')
  assert.equal(await picker.getByRole('menuitemcheckbox', { name: /Independent upper goal/ }).count(), 0)
  await picker.getByRole('menuitemcheckbox', { name: /Month parent/ }).waitFor()
  await picker.locator('input').fill('Month parent')
  await picker.getByRole('menuitemcheckbox', { name: /Parent flow/ }).waitFor({ state: 'detached' })
  await picker.getByRole('menuitemcheckbox', { name: /Month parent/ }).waitFor()
  await picker.locator('input').fill('Independent upper goal')
  await picker.getByRole('menuitemcheckbox', { name: /Month parent/ }).waitFor({ state: 'detached' })
  assert.equal(await picker.getByRole('menuitemcheckbox').count(), 0)
  await shot('uncolored-parent-filtered'); await page.keyboard.press('Escape')
  await row(ids.peer).getByRole('button', { name: 'Day peer', exact: true }).click()
  const detail = page.getByRole('dialog', { name: '当前条目', exact: true })
  await detail.getByRole('button', { name: '加入流程', exact: true }).click()
  await page.getByRole('menuitem', { name: /^关联到上级/ }).click()
  await page.locator('.relation-picker').getByRole('menuitemcheckbox', { name: /Month parent/ }).waitFor()
  assert.equal(await page.locator('.relation-picker').getByRole('menuitemcheckbox', { name: /Independent upper goal/ }).count(), 0)
  await page.keyboard.press('Escape'); await detail.getByRole('button', { name: '关闭', exact: true }).click()
  const beforeColorless = await snapshot()
  await start(ids.peer); await aim(ids.isolated)
  assert.equal(await row(ids.isolated).getAttribute('data-relation-target'), null)
  assert.equal(await row(ids.isolated).getAttribute('data-relation-eligible'), null)
  await page.mouse.up()
  assert.deepEqual((await snapshot()).relations, beforeColorless.relations)
  assert.equal((await snapshot()).workspace.revision, beforeColorless.workspace.revision)
  const noFlowMessages = {"zh":"两个无流程的条目不能关联，请先设置流程起点","en":"Two items without a flow cannot be linked. Set a flow root first","ja":"フローのない項目同士は関連付けできません。先にフローの起点を設定してください","es":"No se pueden vincular dos elementos sin flujo. Define primero un origen de flujo","fr":"Deux éléments sans flux ne peuvent pas être liés. Définissez d’abord une origine de flux"}
  for (const [locale, message] of Object.entries(noFlowMessages)) {
    await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
    const rejected = await page.evaluate(async ({ parentId, childId }) => {
      const before = await window.goalloom.getSnapshot(), p = await window.goalloom.getItem(parentId), c = await window.goalloom.getItem(childId)
      const reply = await window.goalloom.execute({ type: 'link', parentId, childId, expectedParentVersion: p.item.version, expectedChildVersion: c.item.version,
        generation: before.workspace.generation, operationId: crypto.randomUUID() })
      const after = await window.goalloom.getSnapshot()
      return { reply, unchanged: before.workspace.revision === after.workspace.revision && JSON.stringify(before.relations) === JSON.stringify(after.relations) }
    }, { parentId: ids.isolated, childId: ids.peer })
    assert.equal(rejected.reply.ok, false); assert.equal(rejected.reply.code, 'conflict'); assert.equal(rejected.reply.message, message); assert.equal(rejected.unchanged, true)
    report.flowPolicy.rejected.push({ locale, message, unchanged: true })
  }
  await page.evaluate(() => window.goalloom.setLanguage('zh'))
  await row(ids.legacyChild).hover(); await dot(ids.legacyChild).click()
  const legacyChoice = page.locator('.relation-picker').getByRole('menuitemcheckbox', { name: /Legacy uncolored parent/ })
  await legacyChoice.waitFor(); assert.equal(await legacyChoice.getAttribute('aria-checked'), 'true')
  await legacyChoice.click(); await settled(); await page.keyboard.press('Escape')
  assert(!(await snapshot()).relations.some(edge => edge.parentId === ids.legacyParent && edge.childId === ids.legacyChild))
  await undo(); await linked(ids.legacyParent, ids.legacyChild)
  if (await page.locator('.toast').count()) await page.locator('.toast').getByRole('button', { name: '关闭操作提示', exact: true }).click()
  checks.push('Both selectors and parent search exclude colorless pairs; inherited-color parents stay selectable; invalid dragging makes no writes; existing colorless edges unlink and undo')
  const placement = (await item(ids.day)).item.placement
  await start(ids.day); await aim(ids.w); await row(ids.w).locator(':scope[data-relation-target="true"]').waitFor(); await shot('valid-drop')
  assert.equal(await page.locator('.drag-overlay').count(), 0)
  await page.mouse.up(); await linked(ids.w, ids.day); await settled()
  assert.deepEqual((await item(ids.day)).item.placement, placement)
  assert.equal(await page.locator('.popover-floating, dialog[open], .toast').count(), 0)
  await drag(ids.day, ids.w2); await drag(ids.day, ids.p)
  assert.equal((await snapshot()).relations.filter(e => e.childId === ids.day).length, 3)
  checks.push('Click and keyboard menu preserved; week/skip-level/multiple-parent drops neither move tasks nor open menus/details')
  const beforeInvalid = (await snapshot()).relations.length
  for (const target of [ids.w, ids.day, ids.peer]) {
    await start(ids.day); await aim(target); assert.equal(await row(target).getAttribute('data-relation-target'), null); await page.mouse.up()
  }
  await start(ids.w2); await aim(ids.peer); assert.equal(await row(ids.peer).getAttribute('data-relation-target'), null); await page.mouse.up()
  await page.locator('#later-toggle').click(); await start(ids.day); await aim(ids.later)
  assert.equal(await row(ids.later).getAttribute('data-relation-target'), null); await page.mouse.up(); await page.locator('#later-toggle').click()
  await start(ids.day); await page.mouse.move(10, 10); await page.mouse.up()
  await start(ids.day); await aim(ids.m); await page.keyboard.press('Escape'); await page.mouse.up()
  assert.equal((await snapshot()).relations.length, beforeInvalid)
  assert.equal(await page.locator('.relation-drag, [data-relation-target], [data-relation-source]').count(), 0)
  checks.push('Duplicate, self, peer, empty drop and Escape make no writes and remove transient state')

  await page.getByRole('button', { name: '只看 Merge root', exact: true }).click()
  await start(ids.root); await aim(ids.p); await page.locator('.relation-drag-adopt').waitFor(); await shot('root-adoption')
  await page.mouse.up(); await linked(ids.p, ids.root); await settled()
  assert.equal((await item(ids.root)).item.flowColor, null)
  await page.getByRole('button', { name: '全部', exact: true }).locator(':scope[aria-pressed="true"]').waitFor()
  assert((await snapshot()).relations.some(e => e.parentId === ids.root && e.childId === ids.leaf))
  const ring = id => row(id).locator('.flow-dot').evaluate(node => node.style.getPropertyValue('--flow-ring'))
  assert.equal(await ring(ids.leaf), await ring(ids.p), 'The existing descendant inherits the new parent flow')
  await undo(); await pollPage(page, async id => (await window.goalloom.getItem(id)).item.flowColor === 1, ids.root)
  assert(!(await snapshot()).relations.some(e => e.parentId === ids.p && e.childId === ids.root))
  assert.equal(await ring(ids.leaf), await ring(ids.root), 'One undo restores the descendant flow with its root')
  if (await page.locator('.toast').count()) await page.locator('.toast').getByRole('button', { name: '关闭操作提示', exact: true }).click()
  await page.getByRole('button', { name: '只看 Merge root', exact: true }).click()
  const originalRoot = (await item(ids.root)).item, originalParent = (await item(ids.isolated)).item
  await start(ids.root); await aim(ids.isolated)
  await row(ids.isolated).locator(':scope[data-relation-target="true"]').waitFor()
  const promotion = await page.locator('.relation-drag-adopt > span').evaluateAll(nodes => nodes.map(node => ({ empty: node.dataset.empty, color: getComputedStyle(node).backgroundColor })))
  assert.equal(promotion.length, 2); assert.equal(promotion[1].empty, undefined); assert.equal(promotion[0].color, promotion[1].color)
  await shot('flow-root-promotion-preview')
  await page.mouse.up(); await linked(ids.isolated, ids.root); await settled()
  assert.equal((await item(ids.isolated)).item.flowColor, 1)
  assert.equal((await item(ids.root)).item.flowColor, null)
  assert.deepEqual((await item(ids.root)).item.placement, originalRoot.placement)
  assert.deepEqual((await item(ids.isolated)).item.placement, originalParent.placement)
  await page.getByRole('button', { name: '只看 Independent upper goal', exact: true, pressed: true }).waitFor()
  assert.equal(await ring(ids.leaf), await ring(ids.isolated))
  await shot('flow-root-promoted')
  await undo(); await pollPage(page, async id => (await window.goalloom.getItem(id)).item.flowColor === 1, ids.root)
  assert.equal((await item(ids.isolated)).item.flowColor, null)
  await page.getByRole('button', { name: '只看 Merge root', exact: true, pressed: true }).waitFor()
  assert.equal(await ring(ids.leaf), await ring(ids.root))
  await shot('flow-root-promotion-undone')
  if (await page.locator('.toast').count()) await page.locator('.toast').getByRole('button', { name: '关闭操作提示', exact: true }).click()
  await page.getByRole('button', { name: '全部', exact: true }).click()
  checks.push('Independent uncolored parent receives the original root color atomically; preview, descendants, placements and selected flow survive promotion and one undo')
  await row(ids.keyboard).hover(); await dot(ids.keyboard).focus(); await page.keyboard.press('Enter')
  await page.locator('.popover-floating').getByRole('menuitem', { name: /关联到上级/ }).focus(); await page.keyboard.press('Enter')
  await page.locator('.relation-picker input').fill('Second parent')
  const parentChoice = page.locator('.relation-picker').getByRole('menuitemcheckbox', { name: /Second parent/ })
  await parentChoice.focus(); await page.keyboard.press('Enter'); await linked(ids.w2, ids.keyboard); await settled(); await page.keyboard.press('Escape')
  assert.equal((await item(ids.keyboard)).item.flowColor, null)
  checks.push('Root adoption colour chip, descendants, invalid filter fallback, atomic keyboard undo and keyboard adoption into an uncolored parent')

  await column('week').locator('summary').click(); await drag(ids.peer, ids.done)
  await page.evaluate(() => { localStorage.setItem('goalloom.relationLines', 'false') }); await page.reload(); await page.locator('.board').waitFor()
  await start(ids.peer); await aim(ids.m); await shot('lines-disabled'); await page.mouse.up(); await linked(ids.m, ids.peer); await settled()
  checks.push('Expanded completed targets and drag preview with decorative relation lines disabled')
  for (const locale of ['zh', 'en', 'ja', 'es', 'fr']) {
    await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
    await start(ids.peer); await aim(ids.p)
    await row(ids.p).locator(':scope[data-relation-target="true"]').waitFor()
    await shot(`locale-${locale}`); await page.keyboard.press('Escape'); await page.mouse.up()
  }
  await page.evaluate(() => window.goalloom.setLanguage('zh'))
  await page.evaluate(async () => {
    const s = await window.goalloom.getSnapshot()
    await window.goalloom.execute({ type: 'preferences', theme: 'dark', generation: s.workspace.generation, operationId: crypto.randomUUID() })
  })
  await start(ids.peer); await aim(ids.p); await shot('dark'); await page.keyboard.press('Escape'); await page.mouse.up()
  checks.push('Copy-free drag preview across five locales and dark theme')
  await start(ids.peer); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.locator('.relation-drag').waitFor({ state: 'detached' }); await page.mouse.up()
  await start(ids.peer); await dot(ids.peer).dispatchEvent('pointercancel', { pointerId: 1 }); await page.locator('.relation-drag').waitFor({ state: 'detached' }); await page.mouse.up()
  await start(ids.peer); await column('day').locator('[data-period-switch]').focus(); await page.keyboard.press('ArrowRight')
  await page.locator('.relation-drag').waitFor({ state: 'detached' }); await page.mouse.up()
  await column('day').locator('[data-return-current]').click()
  checks.push('Explicit blur, pointer cancellation and period switch clear the gesture')

  await page.evaluate(async ({ parentId, childId }) => {
    const s = await window.goalloom.getSnapshot(), parent = await window.goalloom.getItem(parentId), child = await window.goalloom.getItem(childId)
    const r = await window.goalloom.execute({ type: 'link', parentId, childId, expectedParentVersion: parent.item.version, expectedChildVersion: child.item.version,
      generation: s.workspace.generation, operationId: crypto.randomUUID() })
    if (!r.ok) throw Error(r.message)
  }, { parentId: ids.m, childId: ids.w2 })
  await linked(ids.m, ids.w2); await settled()
  const future = await page.evaluate(async () => {
    const s = await window.goalloom.getSnapshot(), current = s.periods.find(p => p.horizon === 'day')
    const date = new Date(current.startDate); date.setUTCDate(date.getUTCDate() + 1)
    const r = await window.goalloom.execute({ type: 'create', title: 'Future source', horizon: 'day', period: { kind: 'date', startDate: date.toISOString().slice(0, 10) }, generation: s.workspace.generation, operationId: crypto.randomUUID() })
    if (!r.ok) throw Error(r.message); return r.result.itemId
  })
  await stepPeriod(column('day'), 'next'); await row(future).waitFor(); await drag(future, ids.w2)
  await column('day').locator('[data-return-current]').click()
  checks.push('Selected future-period rows use the same authoritative linking path')

  const recoveryRoot = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const r = await window.goalloom.execute({ type: 'create', title: 'Receipt root', horizon: 'week', flowColor: 3, generation, operationId: crypto.randomUUID() })
    if (!r.ok) throw Error(r.message); return r.result.itemId
  })
  await application.evaluate(({ ipcMain }, childId) => {
    const command = ipcMain._invokeHandlers.get('goalloom:command'), query = ipcMain._invokeHandlers.get('goalloom:query')
    globalThis.relationFault = { mode: 'reject', commands: [], receipts: [] }
    ipcMain.removeHandler('goalloom:command'); ipcMain.removeHandler('goalloom:query')
    ipcMain.handle('goalloom:command', async (event, input) => {
      if (input.type !== 'link' || input.childId !== childId) return command(event, input)
      const fault = globalThis.relationFault; fault.commands.push(input.operationId)
      if (fault.mode === 'reject') return { ok: false, code: 'conflict', message: 'Injected relation failure' }
      const result = await command(event, input)
      if (fault.mode === 'unknown') { fault.mode = 'receipt'; throw Error('Injected lost relation response') }
      return result
    })
    ipcMain.handle('goalloom:query', (event, input) => {
      const fault = globalThis.relationFault
      if (input.type === 'receipt') {
        fault.receipts.push(input.operationId)
        if (fault.mode === 'receipt') { fault.mode = 'none'; throw Error('Injected unavailable relation receipt') }
      }
      return query(event, input)
    })
    globalThis.restoreRelationHandlers = () => {
      ipcMain.removeHandler('goalloom:command'); ipcMain.removeHandler('goalloom:query')
      ipcMain.handle('goalloom:command', command); ipcMain.handle('goalloom:query', query)
    }
  }, recoveryRoot)
  await start(recoveryRoot); await aim(ids.m); await page.mouse.up()
  await page.getByRole('alert').filter({ hasText: 'Injected relation failure' }).waitFor(); await settled()
  assert.equal((await item(recoveryRoot)).item.flowColor, 3)
  assert.equal((await snapshot()).relations.filter(e => e.childId === recoveryRoot).length, 0)
  await application.evaluate(() => { globalThis.relationFault = { mode: 'unknown', commands: [], receipts: [] } })
  await start(recoveryRoot); await aim(ids.m); await page.mouse.up()
  await page.getByRole('alert').filter({ hasText: '尚未确认保存结果' }).waitFor()
  assert.equal(await dot(ids.peer).isDisabled(), true, 'Unknown writes block another gesture')
  assert.equal(await page.locator('.relation-drag').count(), 0)
  assert.equal((await item(recoveryRoot)).item.flowColor, null)
  await page.getByRole('button', { name: '重试核对', exact: true }).click(); await settled()
  const recovered = await application.evaluate(() => globalThis.relationFault)
  assert.equal(recovered.commands.length, 1); assert.deepEqual(recovered.receipts, [recovered.commands[0], recovered.commands[0]])
  assert.equal((await snapshot()).relations.filter(e => e.childId === recoveryRoot).length, 1)
  await shot('receipt-recovered'); await undo()
  await pollPage(page, async id => (await window.goalloom.getItem(id)).item.flowColor === 3, recoveryRoot)
  assert.equal((await snapshot()).relations.filter(e => e.childId === recoveryRoot).length, 0)
  report.receiptRecovery = { commandCount: recovered.commands.length, receiptCount: recovered.receipts.length, recoveredUndo: true }
  await application.evaluate(() => { globalThis.restoreRelationHandlers(); delete globalThis.restoreRelationHandlers })
  checks.push('Definitive failure preserves the root; lost-response recovery queries the original receipt, blocks new gestures and preserves one atomic undo')

  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置与数据', exact: true })
  await settings.getByRole('navigation').getByRole('button', { name: '看板', exact: true }).click()
  await settings.getByRole('switch', { name: '按上级自动排序', exact: true }).click(); await page.keyboard.press('Escape')
  const ordered = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation, ids = []
    for (const title of ['Ordered later', 'Ordered earlier']) {
      const r = await window.goalloom.execute({ type: 'create', title, horizon: 'day', generation, operationId: crypto.randomUUID() })
      if (!r.ok) throw Error(r.message); ids.push(r.result.itemId)
    }
    return ids
  })
  const originalOrder = await Promise.all(ordered.map(async id => (await item(id)).item.placement))
  await drag(ordered[0], ids.w2); await drag(ordered[1], ids.w)
  const displayed = await column('day').locator('.task-row').evaluateAll(rows => rows.map(row => row.dataset.itemId))
  assert(displayed.indexOf(ordered[1]) < displayed.indexOf(ordered[0]), 'The new parent immediately controls the projected order')
  assert.deepEqual(await Promise.all(ordered.map(async id => (await item(id)).item.placement)), originalOrder)
  await shot('automatic-order'); checks.push('Drag linking immediately updates automatic parent order without moving the saved placement')
  const last = await page.evaluate(async () => {
    const s = await window.goalloom.getSnapshot(); let last
    for (let i = 0; i < 85; i++) for (const horizon of ['week', 'day']) {
      const r = await window.goalloom.execute({ type: 'create', title: `Scroll ${horizon} ${i}`, horizon, generation: s.workspace.generation, operationId: crypto.randomUUID() })
      if (!r.ok) throw Error(r.message); if (horizon === 'week') last = r.result.itemId
    }
    return last
  })
  await start(ids.peer)
  const scroller = column('week').locator('.column-content'), bounds = await scroller.boundingBox()
  await page.mouse.move(bounds.x + 80, bounds.y + bounds.height - 8, { steps: 12 })
  await page.waitForFunction(() => document.querySelector('[data-horizon="week"] .column-content').scrollTop > 100)
  await column('day').locator('.column-content').evaluate(node => { node.scrollTop = node.scrollHeight })
  assert.equal(await dot(ids.peer).count(), 1, 'The drag source stays mounted outside the virtual viewport')
  await scroller.evaluate(node => { node.scrollTop = node.scrollHeight }); await row(last).waitFor(); await aim(last)
  await row(last).locator(':scope[data-relation-target="true"]').waitFor(); await shot('virtual-autoscroll')
  await page.mouse.up(); await linked(last, ids.peer); await settled()
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 760))
  await start(ids.peer)
  const timeline = await page.locator('.board-timeline').boundingBox()
  const initialLeft = await page.locator('.board-timeline').evaluate(node => node.scrollLeft)
  await page.mouse.move(timeline.x + 5, timeline.y + 180, { steps: 12 })
  await page.waitForFunction(before => document.querySelector('.board-timeline').scrollLeft < before - 100, initialLeft)
  await shot('horizontal-autoscroll'); await page.keyboard.press('Escape'); await page.mouse.up()
  checks.push('Vertical and horizontal edge scrolling, clipped targets and source retention in virtual lists')
  await start(ids.peer)
  const maintenance = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const preview = await window.goalloom.data({ type: 'previewReset', generation })
    if (preview.type !== 'preview') throw Error('Missing reset preview')
    await window.goalloom.data({ type: 'prepare', generation, token: preview.preview.token })
    return { generation, token: preview.preview.token }
  })
  // Direct transfer fixtures use the production reconciliation notification, without native refocusing.
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('focus'))
  await page.locator('.relation-drag').waitFor({ state: 'detached' }); await page.mouse.up()
  await page.evaluate(input => window.goalloom.data({ type: 'cancel', ...input }), maintenance)
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('focus'))
  assert.equal((await snapshot()).maintenance, false)
  checks.push('Protective-backup maintenance cancels linking; cancellation preserves the workspace')
  assert.deepEqual(errors, [])
  report.transactions = JSON.parse(await readFile(join(evidence, 'transactions.json'), 'utf8')).checks
  await application.close()
  report.nativeVisibility = await verifyRelationVisibility(packaged, env, evidence)
  screenshots.push(...report.nativeVisibility.screenshots)
  checks.push('Native hide/show without foreground emulation clears the gesture and makes no write')
  report.passed = true
} catch (error) {
  report.error = String(error); report.errors = errors
  const page = application.windows()[0]
  if (page && !page.isClosed()) {
    report.native = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => ({ focused: w.isFocused(), visible: w.isVisible(), bounds: w.getContentBounds() })))
    report.renderer = await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML.slice(0, 500), text: document.body.innerText.slice(-2500) }))
    await page.screenshot({ path: join(evidence, 'failure.png') }).catch(() => undefined)
  }
  throw error
} finally {
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2))
  await application.close().catch(() => undefined); await rm(profile, { recursive: true, force: true })
}
console.log(`Relation drag: ${checks.length} checks; ${join(evidence, 'report.json')}`)
