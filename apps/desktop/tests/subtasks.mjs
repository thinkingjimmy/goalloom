/**
 * [INPUT]: Current production build, native Electron input and isolated transaction fixtures, with explicit completed-layout controls.
 * [OUTPUT]: Title-edit keyboard nesting, details without redundant ownership properties, leaf/group drag and menu checks, atomic flatten/undo evidence, native screenshots and runtime/platform evidence in output/tests/subtasks.
 * [POS]: Subtask E2E entry; --data selects transactions, --drops selects group drops, --ownership selects cross-period ownership and --title-editing selects existing-title keys.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { setCompletedLayout } from './fixtures/completed-layout.mjs'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir, platform, release, arch, cpus } from 'node:os'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { finishSetup } from './fixtures/setup.mjs'
import { pollPage } from './fixtures/poll.mjs'
import { nestingDrops } from './fixtures/nesting-drops.mjs'
import { subtaskOwnershipUI } from './fixtures/subtask-ownership-ui.mjs'
import { titleNesting } from './fixtures/title-nesting.mjs'

const evidence = resolve('output/tests/subtasks'), checks = [], screenshots = []
await mkdir(evidence, { recursive: true })
await build({ configFile: false, build: { outDir: 'output/tests/build/subtasks', emptyOutDir: false, lib: { entry: 'tests/fixtures/subtasks-data.ts', formats: ['cjs'], fileName: () => 'data.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
const data = spawnSync(electronPath, ['output/tests/build/subtasks/data.cjs', join(evidence, 'transactions.json')], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
assert.equal(data.status, 0, `${data.stdout}\n${data.stderr}`)
if (process.argv.includes('--data')) { process.stdout.write(await readFile(join(evidence, 'transactions.json'), 'utf8')); process.exit(0) }
const profile = await mkdtemp(join(tmpdir(), 'goalloom-subtasks-'))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const application = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
const report = { passed: false, checks, screenshots, environment: { platform: platform(), release: release(), macOS: platform() === 'darwin' ? spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim() : null, arch: arch(), cpu: cpus()[0]?.model, machineScope: 'Physical/VM status not independently verified' }, scope: 'Source Electron, isolated SQLite and production IPC; no packaged/Windows acceptance.' }
try {
  const page = await application.firstWindow(); page.setDefaultTimeout(12000)
  const errors = []; report.pageErrors = errors; page.on('pageerror', error => errors.push(error.message))
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1450, 900))
  await page.emulateMedia({ reducedMotion: 'reduce' }); await finishSetup(page); await page.locator('.board').waitFor()
  await setCompletedLayout(page, true)
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  const boardSettings = page.locator('dialog.settings-modal')
  await boardSettings.getByRole('button', { name: '看板', exact: true }).click()
  await boardSettings.getByRole('switch', { name: '按上级自动放置', exact: true }).click()
  await boardSettings.getByRole('button', { name: '关闭', exact: true }).click()
  if (process.argv.includes('--title-editing')) await titleNesting({ page, application, report, evidence })
  else if (process.argv.includes('--ownership')) await subtaskOwnershipUI({ page, report, evidence })
  else {
  await nestingDrops({ page, application, report, evidence })
  if (!process.argv.includes('--drops')) {
  await titleNesting({ page, application, report, evidence })
  const ids = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const run = async action => { const reply = await window.goalloom.execute({ generation, operationId: crypto.randomUUID(), ...action }); if (!reply.ok) throw Error(reply.message); return reply.result }
    const goal = (await run({ type: 'create', title: 'Subtask flow', horizon: 'cycle', flowColor: 0 })).itemId
    const parent = (await run({ type: 'create', title: 'Parent task', horizon: 'week', parentId: goal, expectedParentVersion: (await window.goalloom.getItem(goal)).item.version })).itemId
    const child = (await run({ type: 'create', title: 'Independent task with a complete detail', horizon: 'day', description: 'Saved child notes', dueDate: '2030-01-01' })).itemId
    const second = (await run({ type: 'create', title: 'Keyboard subtask', horizon: 'day' })).itemId
    return { parent, child, second, goal }
  })
  const row = id => page.locator(`#item-${id}`)
  const beginNesting = async () => {
    await row(ids.child).waitFor(); await row(ids.parent).waitFor()
    await row(ids.child).scrollIntoViewIfNeeded(); await row(ids.parent).scrollIntoViewIfNeeded()
    const source = await row(ids.child).boundingBox(); let target = await row(ids.parent).boundingBox()
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    assert(source.x >= 0 && source.x + 105 < viewport.width && target.x >= 0 && target.x + 100 < viewport.width, 'Both drag endpoints must be inside the native viewport')
    await page.mouse.move(source.x + 95, source.y + 15); await page.mouse.down(); await page.mouse.move(source.x + 105, source.y + 15)
    await page.locator('.drag-overlay').waitFor()
    target = await row(ids.parent).boundingBox(); report.drag = { source, target, viewport }
    await page.mouse.move(target.x + 100, target.y + target.height / 2, { steps: 12 })
    await page.locator('[data-nesting-target="true"]').waitFor()
  }
  await beginNesting()
  await page.keyboard.press('Escape'); await page.mouse.up()
  await page.locator('.drag-overlay').waitFor({ state: 'detached' })
  assert.equal((await page.evaluate(id => window.goalloom.getItem(id), ids.child)).item.placement.nestingParentId, null)
  assert.equal(await page.locator('[data-nesting-target="true"]').count(), 0)
  checks.push('Cancelled middle-row drag changes no placement and clears the preview')
  await row(ids.child).locator('.task-title').focus()
  await beginNesting()
  const preview = join(evidence, 'nest-preview.png'); await page.screenshot({ path: preview }); screenshots.push(preview)
  await page.mouse.up()
  await pollPage(page, async ids => (await window.goalloom.getItem(ids.child)).item.placement.nestingParentId === ids.parent, ids)
  assert.equal(await row(ids.child).getAttribute('data-nested'), 'true')
  await page.waitForFunction(id => document.activeElement?.closest('.task-row')?.dataset.itemId === id, ids.child)
  const indentation = await page.evaluate(ids => {
    const check = id => document.querySelector(`#item-${id} .check`).getBoundingClientRect().left
    return check(ids.child) - check(ids.parent)
  }, ids)
  assert.equal(indentation, 24); checks.push('Native middle-row nesting bypasses parent-order group restrictions, retains focus and indents by 24px')
  await page.waitForFunction(() => !document.querySelector('.fab').disabled)
  assert.equal(await page.locator('.toast').count(), 0, 'Drag nesting succeeds without a Toast')
  checks.push('Drag nesting is quiet after the committed placement is visible')
  const nested = join(evidence, 'nested-task.png'); await page.screenshot({ path: nested }); screenshots.push(nested)
  await row(ids.child).locator('.task-title').focus(); await page.keyboard.press('Enter')
  const detail = page.getByRole('dialog', { name: '当前条目', exact: true })
  await detail.waitFor()
  await detail.locator('.detail-props').waitFor()
  assert.equal(await detail.locator('.nesting-parent-chip, .nesting-parent-menu').count(), 0)
  assert.equal((await detail.locator('.detail-props').innerText()).includes('Parent task'), false)
  assert.equal((await detail.locator('.description-editor').innerText()).trim(), 'Saved child notes')
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  await application.evaluate(({ ipcMain }) => {
    const command = ipcMain._invokeHandlers.get('goalloom:command'), query = ipcMain._invokeHandlers.get('goalloom:query')
    const probe = globalThis.nestingProbe = { unknown: true, writes: [] }
    ipcMain.removeHandler('goalloom:command')
    ipcMain.handle('goalloom:command', async (event, input) => {
      const reply = await command(event, input)
      if (input.type === 'nest') { probe.writes.push(input.operationId); if (probe.unknown) throw Error('Synthetic lost nesting receipt') }
      return reply
    })
    ipcMain.removeHandler('goalloom:query')
    ipcMain.handle('goalloom:query', (event, input) => {
      if (input.type === 'receipt' && probe.unknown) throw Error('Synthetic temporarily unavailable receipt')
      return query(event, input)
    })
  })
  await row(ids.second).focus(); await row(ids.second).locator('.task-title').focus(); await page.keyboard.press('Shift+F10')
  await page.getByRole('menuitem', { name: '设为二级 todo', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '选择所属任务', exact: true })
  await picker.getByRole('button', { name: /Parent task/ }).click()
  await pollPage(page, async ids => (await window.goalloom.getItem(ids.second)).item.placement.nestingParentId === ids.parent, ids)
  await page.locator('.error-banner').waitFor()
  await picker.getByRole('button', { name: '关闭', exact: true }).click()
  await application.evaluate(() => { globalThis.nestingProbe.unknown = false })
  await page.locator('.error-banner').getByRole('button', { name: '重试核对', exact: true }).click()
  await page.locator('.error-banner').waitFor({ state: 'detached' })
  await page.waitForFunction(() => !document.querySelector('.fab').disabled)
  assert.equal(await page.locator('.toast').count(), 0, 'Recovering a nesting receipt stays quiet')
  assert.equal(await application.evaluate(() => globalThis.nestingProbe.writes.length), 1)
  checks.push('An unknown nesting outcome retains its receipt and retry recovers it without a duplicate write')
  checks.push('Complete ordinary detail and keyboard-equivalent nesting')
  await row(ids.parent).locator('.check').click()
  await pollPage(page, async ids => (await window.goalloom.getItem(ids.parent)).item.status === 'done', ids)
  assert.equal(await row(ids.child).count(), 1); assert.equal(await row(ids.parent).locator('xpath=ancestor::details').count(), 0)
  const mixed = join(evidence, 'mixed-status-group.png'); await page.screenshot({ path: mixed }); screenshots.push(mixed)
  checks.push('Completed parent stays beside unfinished children without changing their states')
  await row(ids.second).locator('.check').click()
  await row(ids.child).locator('.check').click()
  const completed = page.locator('[data-horizon="week"] details')
  await completed.waitFor(); await completed.locator('summary').click()
  await row(ids.child).waitFor()
  assert.equal(await row(ids.parent).locator('xpath=ancestor::details').count(), 1)
  assert.equal(await row(ids.child).getAttribute('data-nested'), 'true')
  const doneGroup = join(evidence, 'completed-group.png'); await page.screenshot({ path: doneGroup }); screenshots.push(doneGroup)
  await row(ids.child).locator('.check').click()
  await pollPage(page, async ids => (await window.goalloom.getItem(ids.child)).item.status === 'todo', ids)
  // The storage receipt can precede the renderer snapshot that relocates the group.
  await page.waitForFunction(id => { const row = document.getElementById(`item-${id}`); return !!row && !row.closest('details') }, ids.parent)
  checks.push('All completed visible members enter the completed section together; reopening one member returns the complete group')
  await row(ids.parent).locator('.task-title').focus(); await page.keyboard.press('Enter')
  await detail.locator('.detail-title-display').click()
  await detail.locator('.title-input').fill(`Parent task ${'with a lengthy project context that stays readable. '.repeat(8)}`)
  await detail.getByRole('button', { name: '归档', exact: true }).click()
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  await row(ids.parent).locator(':scope[data-context="true"]').waitFor()
  assert((await row(ids.parent).boundingBox()).height <= 64, 'The hidden parent keeps a brief two-line context')
  assert.equal((await row(ids.parent).locator('small').innerText()).trim(), '· 已归档')
  assert.equal(await row(ids.child).count(), 1); assert.equal(await row(ids.second).count(), 1)
  checks.push('Archiving the parent preserves both visible, independently editable subtasks')
  const localized = {
    zh: { independent: '恢复为一级', note: '请在所属任务中修改上级和颜色。', close: '关闭' },
    en: { independent: 'Make independent', note: 'Change these goals and this color on the parent task.', close: 'Close' },
    ja: { independent: '独立したタスクにする', note: '目標と色は親タスクで変更してください。', close: '閉じる' },
    es: { independent: 'Hacer independiente', note: 'Cambia estos objetivos y este color en la tarea principal.', close: 'Cerrar' },
    fr: { independent: 'Rendre indépendante', note: 'Modifiez ces objectifs et cette couleur dans la tâche parente.', close: 'Fermer' },
  }
  const settingsLabels = { zh: '设置与数据', en: 'Settings & data', ja: '設定とデータ', es: 'Ajustes y datos', fr: 'Réglages et données' }
  const languageNames = { zh: '简体中文', en: 'English', ja: '日本語', es: 'Español', fr: 'Français' }
  let currentLocale = 'zh'
  const changeLanguage = async locale => {
    if (locale === currentLocale) return
    await page.getByRole('button', { name: settingsLabels[currentLocale], exact: true }).click()
    const settings = page.locator('dialog.settings-modal')
    await settings.locator('.settings-nav button').first().click()
    await settings.locator('.settings-select').click()
    await page.getByRole('option', { name: languageNames[locale], exact: true }).click()
    await page.waitForFunction(locale => document.documentElement.lang.startsWith(locale), locale)
    await settings.getByRole('button', { name: localized[locale].close, exact: true }).click()
    currentLocale = locale
  }
  for (const [locale, copy] of Object.entries(localized)) {
    await changeLanguage(locale)
    await row(ids.second).locator('.task-title').focus(); await page.keyboard.press('Enter')
    const dialog = page.locator('dialog.detail')
    await dialog.locator('.detail-props').waitFor()
    assert.equal(await dialog.locator('.nesting-parent-chip, .nesting-parent-menu').count(), 0)
    assert.equal(await dialog.getByRole('button', { name: copy.independent, exact: true }).count(), 0)
    assert.equal((await dialog.locator('.detail-props').innerText()).includes('Parent task'), false)
    assert.equal((await page.evaluate(id => window.goalloom.getItem(id), ids.second)).item.placement.nestingParentId, ids.parent)
    const propertiesPath = join(evidence, `detail-properties-${locale}.png`); await page.screenshot({ path: propertiesPath }); screenshots.push(propertiesPath)
    await dialog.locator('.detail-chip[data-empty]').click()
    await page.getByText(copy.note, { exact: true }).waitFor()
    assert.equal(await page.getByText(copy.note, { exact: true }).evaluate(node => !!node.closest('.menu') && getComputedStyle(node.closest('.menu')).backgroundColor !== 'rgba(0, 0, 0, 0)'), true)
    const path = join(evidence, `inherited-detail-${locale}.png`); await page.screenshot({ path }); screenshots.push(path)
    await page.keyboard.press('Escape'); await dialog.getByRole('button', { name: copy.close, exact: true }).click()
  }
  await changeLanguage('zh')
  checks.push('Five-language details omit parent-task metadata and detach controls while preserving ownership and inherited goals/color')
  await row(ids.child).locator('.task-title').focus(); await page.keyboard.press('Shift+F10')
  await page.getByRole('menuitem', { name: '恢复为一级', exact: true }).click()
  await pollPage(page, async ids => !(await window.goalloom.getItem(ids.child)).item.placement.nestingParentId, ids)
  await page.reload(); await completed.locator('summary').click()
  await row(ids.second).waitFor(); assert.equal(await row(ids.second).getAttribute('data-nested'), 'true')
  checks.push('The board context menu still makes tasks independent with inherited goal parents; reload preserves the remaining outline')
  const virtual = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation, roots = []
    const run = async action => { const reply = await window.goalloom.execute({ generation, operationId: crypto.randomUUID(), ...action }); if (!reply.ok) throw Error(reply.message); return reply.result }
    for (let index = 0; index < 70; index++) roots.push((await run({ type: 'create', title: `Virtual outline ${String(index).padStart(2, '0')}`, horizon: 'later' })).itemId)
    const child = (await run({ type: 'create', title: 'Virtual nested task', horizon: 'later' })).itemId
    const source = (await window.goalloom.getItem(child)).item, parent = (await window.goalloom.getItem(roots.at(-1))).item
    await run({ type: 'nest', itemId: child, parentId: parent.id, expectedVersion: source.version, expectedParentVersion: parent.version,
      expectedPlacementVersion: source.placement.version, expectedParentPlacementVersion: parent.placement.version })
    return { roots, child }
  })
  const later = page.locator('[data-horizon="later"]'), scroller = later.locator('.column-content')
  await row(virtual.roots[0]).waitFor(); assert(await later.locator('.task-row').count() < 45)
  await scroller.evaluate(node => { node.scrollTop = node.scrollHeight })
  await row(virtual.child).waitFor(); assert.equal(await row(virtual.child).getAttribute('data-nested'), 'true')
  await row(virtual.child).locator('.task-title').focus(); await page.keyboard.press('Home')
  await page.waitForFunction(id => document.activeElement?.closest('.task-row')?.dataset.itemId === id, virtual.roots[0])
  await page.keyboard.press('End')
  await page.waitForFunction(id => document.activeElement?.closest('.task-row')?.dataset.itemId === id, virtual.child)
  await page.keyboard.press('Enter'); await detail.locator('.detail-title-display').click(); await detail.locator('.title-input').fill('')
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  await detail.getByRole('alert').waitFor()
  assert.equal((await page.evaluate(id => window.goalloom.getItem(id), virtual.child)).item.deletedAt, null)
  await detail.locator('.detail-title-display').click(); await detail.locator('.title-input').fill('Virtual nested task'); await detail.getByRole('button', { name: '关闭', exact: true }).click()
  await detail.waitFor({ state: 'detached' })
  const virtualShot = join(evidence, 'virtual-outline.png'); await page.screenshot({ path: virtualShot }); screenshots.push(virtualShot)
  checks.push('Virtual outlines keep bounded mounted rows, logical keyboard traversal and dependency-safe full detail dismissal')
  const future = await page.evaluate(async sourceId => {
    const snapshot = await window.goalloom.getSnapshot(), current = snapshot.periods.find(period => period.horizon === 'week')
    const placement = (await window.goalloom.getItem(sourceId)).item.placement
    const reply = await window.goalloom.execute({ type: 'create', title: 'Future search container', horizon: 'week', period: { kind: 'date', startDate: current.endDate }, generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return { parent: reply.result.itemId, source: sourceId, placement }
  }, ids.child)
  await row(future.source).locator('.task-title').focus(); await page.keyboard.press('Shift+F10')
  await page.getByRole('menuitem', { name: '设为二级 todo', exact: true }).click()
  await picker.getByRole('textbox', { name: '搜索任务', exact: true }).fill('Future search container')
  await picker.getByRole('button', { name: /Future search container/ }).click()
  await picker.waitFor({ state: 'detached' })
  await pollPage(page, async future => (await window.goalloom.getItem(future.source)).item.placement.nestingParentId === future.parent, future)
  await page.waitForFunction(() => !document.querySelector('.fab').disabled)
  assert.equal(await page.locator('.toast').count(), 0, 'Menu nesting succeeds without a Toast')
  checks.push('Keyboard search can choose a future container outside the displayed periods')
  await page.keyboard.press('ControlOrMeta+z')
  await page.locator('.toast').filter({ hasText: '已撤销' }).waitFor()
  await pollPage(page, async value => ((await window.goalloom.getItem(value.source)).item.placement.nestingParentId ?? null) === (value.placement.nestingParentId ?? null), future)
  const restored = (await page.evaluate(id => window.goalloom.getItem(id), future.source)).item.placement
  assert.deepEqual([restored.horizon, restored.periodId], [future.placement.horizon, future.placement.periodId])
  const undo = join(evidence, 'nest-keyboard-undo.png'); await page.screenshot({ path: undo }); screenshots.push(undo)
  checks.push('Menu nesting is quiet; keyboard undo restores the original period and confirms the reversal')
  const group = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const run = async action => { const reply = await window.goalloom.execute({ generation, operationId: crypto.randomUUID(), ...action }); if (!reply.ok) throw Error(reply.message); return reply.result }
    const target = (await run({ type: 'create', title: 'A group destination', horizon: 'week' })).itemId
    const source = (await run({ type: 'create', title: 'B source group', horizon: 'day' })).itemId
    const children = []
    for (const title of ['C first child', 'D second child']) {
      const child = (await run({ type: 'create', title, horizon: 'day', description: `${title} notes` })).itemId
      const item = (await window.goalloom.getItem(child)).item, parent = (await window.goalloom.getItem(source)).item
      await run({ type: 'nest', itemId: child, parentId: source, expectedVersion: item.version, expectedPlacementVersion: item.placement.version,
        expectedParentVersion: parent.version, expectedParentPlacementVersion: parent.placement.version })
      children.push(child)
    }
    return { source, target, children }
  })
  await row(group.source).waitFor(); await row(group.target).waitFor()
  await row(group.source).scrollIntoViewIfNeeded(); await row(group.target).scrollIntoViewIfNeeded()
  await row(group.source).locator('.task-title').focus()
  const sourceBox = await row(group.source).boundingBox()
  await page.mouse.move(sourceBox.x + 95, sourceBox.y + sourceBox.height / 2); await page.mouse.down()
  await page.mouse.move(sourceBox.x + 105, sourceBox.y + sourceBox.height / 2)
  await page.locator('.drag-overlay').waitFor()
  const targetBox = await row(group.target).boundingBox()
  await page.mouse.move(targetBox.x + 100, targetBox.y + targetBox.height / 2, { steps: 12 })
  await row(group.target).locator(':scope[data-nesting-target="true"]').waitFor()
  await page.mouse.up()
  const flattened = async () => {
    await pollPage(page, async group => {
      const items = await Promise.all([group.source, ...group.children].map(id => window.goalloom.getItem(id)))
      return items.every(({ item }) => item.placement.nestingParentId === group.target && item.placement.horizon === 'week')
    }, group)
    const members = [group.source, ...group.children]
    assert.deepEqual(await page.locator(`[data-nesting-parent="${group.target}"]`).evaluateAll(nodes => nodes.map(node => node.dataset.itemId)), members)
    for (const id of members) assert.equal(await row(id).getAttribute('aria-level'), '2')
  }
  await flattened()
  await page.waitForFunction(id => document.activeElement?.closest('.task-row')?.dataset.itemId === id, group.source)
  const groupShot = join(evidence, 'flattened-group.png'); await page.screenshot({ path: groupShot }); screenshots.push(groupShot)
  const restoreGroup = async () => {
    await page.keyboard.press('ControlOrMeta+z')
    await pollPage(page, async group => {
      const root = (await window.goalloom.getItem(group.source)).item
      const children = await Promise.all(group.children.map(id => window.goalloom.getItem(id)))
      return root.placement.nestingParentId === null && root.placement.horizon === 'day'
        && children.every(({ item }) => item.placement.nestingParentId === group.source && item.placement.horizon === 'day')
    }, group)
    await page.locator('.toast').filter({ hasText: '已撤销' }).waitFor()
  }
  await restoreGroup()
  await row(group.source).locator('.task-title').focus(); await page.keyboard.press('Shift+F10')
  await page.getByRole('menuitem', { name: '设为二级 todo', exact: true }).click()
  await picker.getByRole('button', { name: /A group destination/ }).click()
  await picker.waitFor({ state: 'detached' }); await flattened(); await restoreGroup()
  checks.push('Native group drag and keyboard menu flatten B/C/D directly under A in source order, retain drag focus and restore B with C/D in one undo')
  await subtaskOwnershipUI({ page, report, evidence })
  }
  }
  assert.deepEqual(errors, []); report.passed = true
} catch (error) {
  report.error = error.stack
  try { const page = await application.firstWindow(); report.localState = await page.evaluate(() => ({ activeElement: document.activeElement?.outerHTML.slice(0, 1000), visibility: document.visibilityState, drag: document.documentElement.dataset.dragging, nesting: document.documentElement.dataset.nestingDrag, scrollLeft: document.querySelector('.board-timeline')?.scrollLeft, dialogs: [...document.querySelectorAll('dialog')].map(node => ({ open: node.open, label: node.getAttribute('aria-label') })) })); report.nativeWindow = await application.evaluate(({ BrowserWindow }) => ({ focused: BrowserWindow.getAllWindows()[0]?.isFocused(), visible: BrowserWindow.getAllWindows()[0]?.isVisible() })); await page.screenshot({ path: join(evidence, 'failure.png') }) } catch {}
  throw error
} finally {
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2)); await application.close(); await rm(profile, { recursive: true, force: true })
}
