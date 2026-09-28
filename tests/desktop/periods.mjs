/**
 * [INPUT]: Production Electron build and an isolated Repository/SQLite planning fixture.
 * [OUTPUT]: Repeatable UI assertions, screenshots and environment/boundary JSON in output/tests/periods.
 * [POS]: Focused desktop acceptance; fixture refresh emits a main-process notification without native activation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir, cpus, release, version, arch } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'
import { verifyPeriodNavigation } from './fixtures/period-navigation.mjs'

const evidence = resolve('output/tests/periods')
const navigationOnly = process.argv.includes('--navigation')
const packaged = process.argv.slice(2).find(argument => !argument.startsWith('--'))
const reportName = navigationOnly ? 'navigation-report.json' : 'report.json'
await mkdir(evidence, { recursive: true })
await build({ configFile: false, build: { outDir: 'output/tests/build/periods', emptyOutDir: false, lib: { entry: 'tests/desktop/fixtures/periods-seed.ts', formats: ['cjs'], fileName: () => 'periods-seed.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
const profile = await mkdtemp(join(tmpdir(), 'goalloom-periods-'))
const checks = [], screenshots = [], errors = []
const report = { packaged: Boolean(packaged), navigationOnly, checks, screenshots, os: { version: version(), release: release(), arch: arch(), cpu: cpus()[0]?.model, machineScope: 'Host OS reported; physical/VM status not independently verified' }, scope: 'Production bridge and isolated database; packaged/Windows acceptance only when explicitly run there. Calendar boundaries use the Repository fixture clock.', passed: false }
let application
try {
  const seed = spawnSync(electronPath, ['output/tests/build/periods/periods-seed.cjs', profile, join(evidence, 'boundaries.json')], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
  assert.equal(seed.status, 0, seed.stderr)
  const fixture = JSON.parse(await readFile(join(profile, 'fixture.json'), 'utf8'))
  const { ids, current, next } = fixture
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
  const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
  const launch = () => electron.launch({ ...options, env: environment })
  application = await launch()
  let page = await application.firstWindow()
  page.setDefaultTimeout(12000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  page.on('pageerror', error => errors.push(error.message))
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1880, 1000))
  await page.locator('.board').waitFor()
  await application.evaluate(({ shell }) => {
    globalThis.periodExternalCalls = []
    shell.openExternal = async url => { globalThis.periodExternalCalls.push(url) }
  })
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  report.boundaries = fixture.report.checks
  const row = id => page.locator(`#item-${id}`)
  const column = horizon => page.locator(`.board-column[data-horizon="${horizon}"]`)
  const item = id => page.evaluate(id => window.goalloom.getItem(id), id)
  const shot = async name => { const path = join(evidence, `${name}.png`); await page.screenshot({ path }); screenshots.push(path) }
  const settled = async horizon => page.waitForFunction(horizon => !document.querySelector('.fab').disabled && document.querySelector(`.board-column[data-horizon="${horizon}"]`)?.getAttribute('aria-busy') !== 'true', horizon)
  const dragReady = async () => {
    await page.waitForFunction(() => document.documentElement.dataset.dragging === 'true')
    // dnd-kit attaches keyboard listeners after activation and measures targets on the next frame.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
  const moveNext = async horizon => { await column(horizon).locator('[data-next-period]').click(); await settled(horizon) }
  const dismissToast = async () => { if (await page.locator('.toast').count()) await page.locator('.toast').getByRole('button', { name: '关闭操作提示', exact: true }).click() }
  const rightClick = async id => { await row(id).locator('.task-title').click({ button: 'right' }); await page.locator('.context-menu').waitFor() }
  const advance = async (id, expectedLabel, screenshot) => {
    const before = await item(id)
    await rightClick(id)
    // The first item of the grouped menu advances one period; the rest (move to…, next step, link, complete, delete) belong to flow insight.
    const action = page.locator('.context-menu [role="menuitem"]').first()
    if (expectedLabel) assert.match(await action.innerText(), new RegExp(expectedLabel))
    if (screenshot) await shot(screenshot)
    await action.click()
    await pollPage(page, async ({ id, period }) => (await window.goalloom.getItem(id)).item.placement.periodId !== period, { id, period: before.item.placement.periodId })
    await row(id).waitFor({ state: 'detached' })
    await page.locator('.toast').filter({ hasText: '已移到' }).waitFor()
    assert(!/往期/.test(await page.locator('.toast').innerText()))
    return before
  }

  report.navigation = await verifyPeriodNavigation(page, column, evidence)
  checks.push('Inline dates, contextual return buttons, directional content motion, rapid reversal, keyboard and reduced-motion behavior')

  if (!navigationOnly) {
  await row(ids.later).locator('.task-title').click({ button: 'right' })
  assert.equal(await page.locator('.context-menu').count(), 0)
  await column('week').locator('summary').click()
  await row(ids.done).locator('.task-title').click({ button: 'right' })
  assert.equal(await page.locator('.context-menu').count(), 0)
  await row(ids.week).locator('.task-title').focus()
  await page.keyboard.press('Shift+F10')
  await page.locator('.context-menu').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('.context-menu').waitFor({ state: 'detached' })
  assert.equal(await row(ids.week).locator('.task-title').evaluate(node => node === document.activeElement), true)
  assert.equal(await column('week').getAttribute('data-period-mode'), 'current')
  await page.keyboard.press('ContextMenu'); await page.locator('.context-menu').waitFor()
  await page.keyboard.press('Escape')
  const untouched = await item(ids.week)
  await row(ids.week).locator('.check').click({ button: 'right' })
  await page.locator('.context-menu').waitFor(); await page.keyboard.press('Escape')
  assert.deepEqual(await item(ids.week), untouched)
  await row(ids.link).locator('a.link-inline').click({ button: 'right' })
  await page.locator('.context-menu').waitFor(); await page.keyboard.press('Escape')
  assert.deepEqual(await application.evaluate(() => globalThis.periodExternalCalls), [])
  assert.equal(await page.locator('dialog.detail').count(), 0)
  assert.notEqual(await page.evaluate(() => document.documentElement.dataset.dragging), 'true')
  checks.push('Later/done exclusions, both keyboard menu keys, Escape/focus and no checkbox/link/drag side effects')

  const labels = { day: '移到明天', week: '移到下周', month: '移到下月', cycle: '移到下个周期' }
  for (const horizon of ['day', 'week', 'month', 'cycle']) {
    const before = await advance(ids[horizon], labels[horizon], horizon === 'week' ? 'context-menu-week' : null)
    const after = await item(ids[horizon])
    assert.equal(after.period.id, next.find(period => period.horizon === horizon).id)
    for (const field of ['title', 'description', 'dueDate', 'status']) assert.equal(after.item[field], before.item[field])
    assert.deepEqual(after.relations.map(edge => edge.id), before.relations.map(edge => edge.id))
    if (horizon === 'week') await page.waitForFunction(id => document.activeElement?.closest('[data-item-id]')?.getAttribute('data-item-id') === id, ids.sibling)
    if (horizon === 'cycle') await page.waitForFunction(() => document.activeElement === document.querySelector('.board-column[data-horizon="cycle"] [data-add-item]'))
    await dismissToast()
  }
  checks.push('All four horizons move exactly one period, preserve content/due date/state/edges and restore adjacent-row focus')
  await moveNext('week')
  await row(ids.week).waitFor()
  await row(ids.week).locator('.task-title').focus()
  await page.keyboard.press('Shift+F10'); await page.locator('.context-menu').waitFor()
  assert(!/移到下周/.test(await page.locator('.context-menu').innerText()))
  await page.keyboard.press('Escape')
  await page.waitForFunction(id => document.activeElement === document.querySelector(`#item-${id} .task-title`), ids.week)
  assert.equal(await column('week').getAttribute('data-period-mode'), 'future', 'Escape only closes the menu')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.querySelector('.board-column[data-horizon="week"]')?.getAttribute('data-period-mode') === 'current')
  await moveNext('week')

  const add = async title => {
    if (!(await column('week').locator('.quick-add input').count())) await column('week').locator('[data-add-item]').click()
    await column('week').locator('.quick-add input').fill(title)
    await column('week').locator('.quick-add input').press('Enter')
    await pollPage(page, async title => (await window.goalloom.listItems({ type: 'list', view: 'search', query: title })).items.some(item => item.title === title), title)
    const found = (await page.evaluate(title => window.goalloom.listItems({ type: 'list', view: 'search', query: title }), title)).items.find(item => item.title === title)
    await row(found.id).waitFor()
    assert.equal(found.placement.periodId, next.find(period => period.horizon === 'week').id)
    return found.id
  }
  const alpha = await add('Future alpha'), beta = await add('Future beta')
  await column('week').locator('.quick-add input').fill('Future draft kept')
  await moveNext('week')
  await column('week').getByRole('button', { name: '查看本周上一期', exact: true }).click(); await settled('week')
  await column('week').locator('[data-add-item]').click()
  assert.equal(await column('week').locator('.quick-add input').inputValue(), 'Future draft kept')
  await page.keyboard.press('Escape')
  await column('week').locator('[data-return-current]').click()
  await column('week').locator('[data-previous-period]').click()
  await page.waitForFunction(() => document.querySelector('[data-horizon="week"]')?.getAttribute('aria-busy') === 'false')
  assert.equal(await column('week').getAttribute('data-period-mode'), 'history')
  await column('week').locator('[data-next-period]').click()
  assert.equal(await column('week').getAttribute('data-period-mode'), 'current')
  await moveNext('week')
  await column('week').locator('[data-add-item]').click()
  assert.equal(await column('week').locator('.quick-add input').inputValue(), 'Future draft kept')
  await page.keyboard.press('Escape')
  checks.push('Future inline creation targets the displayed period; a draft survives leaving and returning')

  await row(beta).locator('.drag-handle').focus(); await page.keyboard.press('Space')
  await dragReady()
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('Space'); await settled('week')
  await pollPage(page, async ({ alpha, beta }) => (await window.goalloom.getItem(beta)).item.placement.sortKey < (await window.goalloom.getItem(alpha)).item.placement.sortKey, { alpha, beta })
  assert.equal((await item(beta)).period.id, next.find(period => period.horizon === 'week').id)
  await settled('week')
  await row(beta).locator('.drag-handle').focus(); await page.keyboard.press('Space')
  await dragReady()
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space')
  await pollPage(page, async ({ id, period }) => (await window.goalloom.getItem(id)).item.placement.periodId === period, { id: beta, period: current.find(period => period.horizon === 'day').id })
  await row(beta).waitFor()
  await row(alpha).locator('.check').click()
  await pollPage(page, async id => (await window.goalloom.getItem(id)).item.status === 'done', alpha)
  await page.keyboard.press('ControlOrMeta+z')
  await pollPage(page, async id => (await window.goalloom.getItem(id)).item.status === 'todo', alpha)
  await row(alpha).waitFor(); await dismissToast()
  checks.push('Future keyboard sorting stays in its period; cross-column keyboard drag uses the displayed destination; completion and undo refresh future rows')

  for (const horizon of ['cycle', 'month', 'day']) { await moveNext(horizon); await row(ids[horizon]).waitFor() }
  await page.getByRole('button', { name: '只看 Cycle task', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge').length === 3)
  await shot('future-relations')
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await row(alpha).locator('.task-title').hover()
  const from = await row(alpha).locator('.task-title').boundingBox(), to = await column('day').boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2)
  await dragReady()
  const width = await page.evaluate(() => innerWidth)
  await page.mouse.move(Math.min(to.x + to.width / 2, width - 40), to.y + 280, { steps: 18 })
  await page.waitForFunction(() => document.querySelector('.board-column[data-horizon="day"]').classList.contains('drop-target'))
  await page.mouse.up()
  await pollPage(page, async ({ id, period }) => (await window.goalloom.getItem(id)).item.placement.periodId === period, { id: alpha, period: next.find(period => period.horizon === 'day').id })
  await column('day').locator(`#item-${alpha}`).waitFor()
  await page.keyboard.press('ControlOrMeta+z'); await column('week').locator(`#item-${alpha}`).waitFor()
  await dismissToast()
  await row(alpha).locator('.drag-handle').focus(); await page.keyboard.press('Space')
  await dragReady()
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space')
  await column('day').locator(`#item-${alpha}`).waitFor()
  await page.waitForFunction(id => document.activeElement === document.querySelector(`#item-${id} .drag-handle`), alpha)
  assert.equal((await item(alpha)).period.id, next.find(period => period.horizon === 'day').id)
  await page.keyboard.press('ControlOrMeta+z'); await column('week').locator(`#item-${alpha}`).waitFor()
  await dismissToast()
  checks.push('Future flow lines, pointer/keyboard drops into the displayed future day, focus after refresh and undo back to the future week')

  await advance(ids.week, null, 'context-menu-further-period')
  const further = (await item(ids.week)).period
  await page.locator('.toast').getByRole('button', { name: /撤销/ }).click()
  await row(ids.week).waitFor()
  assert.equal((await item(ids.week)).period.id, next.find(period => period.horizon === 'week').id)
  await dismissToast()
  await advance(ids.week)
  await moveNext('week'); await row(ids.week).waitFor()
  assert.equal((await item(ids.week)).period.id, further.id)
  await row(ids.week).locator('.task-title').click()
  await page.locator('dialog.detail .title-input').fill('Edited future task')
  await page.locator('dialog.detail').getByRole('button', { name: /^保存/ }).click()
  await pollPage(page, async id => (await window.goalloom.getItem(id)).item.title === 'Edited future task', ids.week)
  assert.match(await page.locator('dialog.detail .placement-chip').innerText(), new RegExp(further.startDate.slice(0, 4)))
  await page.locator('dialog.detail .placement-chip').click()
  const thisWeek = page.locator('dialog.detail').getByRole('menuitemradio', { name: '本周', exact: true })
  assert.equal(await thisWeek.getAttribute('aria-checked'), 'false')
  await thisWeek.click()
  await pollPage(page, async ({ id, period }) => (await window.goalloom.getItem(id)).item.placement.periodId === period, { id: ids.week, period: current.find(period => period.horizon === 'week').id })
  await page.locator('dialog.detail').getByRole('button', { name: '关闭', exact: true }).click()
  await column('week').getByRole('button', { name: '回到本周', exact: true }).click()
  await row(ids.week).waitFor()
  await page.keyboard.press('ControlOrMeta+z')
  await pollPage(page, async ({ id, period }) => (await window.goalloom.getItem(id)).item.placement.periodId === period, { id: ids.week, period: further.id })
  assert.equal((await item(ids.week)).item.title, 'Edited future task')
  await dismissToast()
  await page.keyboard.press('ControlOrMeta+k')
  await page.locator('.palette-search input').fill('Edited future task')
  await page.locator('.command-results .menu-item').filter({ hasText: 'Edited future task' }).waitFor()
  assert(!/本周/.test(await page.locator('.command-results').innerText()))
  await page.locator('.command-results .menu-item').filter({ hasText: 'Edited future task' }).click()
  await page.locator('dialog.detail').getByRole('button', { name: '更多操作', exact: true }).click()
  await page.locator('dialog.detail').getByRole('menuitem', { name: '定位到看板', exact: true }).click()
  await row(ids.week).waitFor()
  assert.equal(await column('week').getAttribute('data-period-id'), further.id)
  await shot('future-board')
  checks.push('Continuous postponement, Toast undo, future editing, move back to this week, effect-scoped undo and search/detail locate')

  const virtualIds = await page.evaluate(async startDate => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const ids = []
    for (let index = 0; index < 90; index++) {
      const reply = await window.goalloom.execute({ type: 'create', horizon: 'week', title: `Future virtual row ${index}`, period: { kind: 'date', startDate }, generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw new Error(reply.message)
      ids.push(reply.result.itemId)
    }
    return ids
  }, further.startDate)
  await settled('week')
  assert(await column('week').locator('.task-row').count() < 40, 'Long future columns retain bounded DOM')
  await rightClick(virtualIds[0])
  await page.locator('.board-column[data-horizon="week"] .column-content').evaluate(node => { node.scrollTop = 10000 })
  await page.waitForFunction(id => document.getElementById(`item-${id}`)?.getBoundingClientRect().bottom < 0, virtualIds[0])
  assert.equal(await page.locator('.context-menu').count(), 1)
  await page.keyboard.press('Escape')
  await page.waitForFunction(id => document.activeElement === document.querySelector(`#item-${id} .task-title`), virtualIds[0])
  await row(ids.week).locator('.task-title').scrollIntoViewIfNeeded()
  await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    await window.goalloom.execute({ type: 'preferences', theme: 'dark', operationId: crypto.randomUUID(), generation })
  })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await rightClick(ids.week); await shot('context-menu-dark'); await page.keyboard.press('Escape')
  const languages = { en: 'English', ja: '日本語', es: 'Español', fr: 'Français', zh: '简体中文' }
  for (const locale of ['en', 'ja', 'es', 'fr', 'zh']) {
    await page.keyboard.press('ControlOrMeta+,')
    const settings = page.locator('dialog.settings-modal')
    await settings.locator('.settings-select').click()
    await page.getByRole('option', { name: languages[locale], exact: true }).click()
    await page.waitForFunction(locale => document.documentElement.lang.startsWith(locale), locale)
    await page.keyboard.press('Escape'); await settings.waitFor({ state: 'detached' })
    await rightClick(ids.week)
    const text = await page.locator('.context-menu').innerText()
    if (['en', 'es', 'fr'].includes(locale)) assert(!/[一-鿿]/.test(text), `${locale} context menu must be translated`)
    await shot(`context-menu-${locale}`); await page.keyboard.press('Escape')
    for (const horizon of ['cycle', 'month', 'week', 'day']) {
      const header = column(horizon).locator('.column-header')
      assert.equal(await header.locator('[data-previous-period]').count(), 1)
      assert.equal(await header.locator('[data-next-period]').count(), 1)
      assert(await header.locator('[data-previous-period]').getAttribute('aria-label'))
      const navigation = await header.locator('.period-nav').boundingBox()
      const previousButton = await header.locator('[data-previous-period]').boundingBox()
      const nextButton = await header.locator('[data-next-period]').boundingBox()
      const heading = await header.locator('.period-heading').boundingBox()
      const action = header.locator('[data-review], [data-return-current]')
      const content = await action.count() ? await action.boundingBox() : heading
      assert(previousButton.x >= navigation.x && nextButton.x + nextButton.width <= navigation.x + navigation.width + 1, `${locale} period controls fit their column`)
      assert(heading.x - previousButton.x - previousButton.width <= 8 && nextButton.x - content.x - content.width <= 8, `${locale} arrows hug the header content`)
      const add = await header.locator('.column-add-slot').boundingBox()
      assert(nextButton.x + nextButton.width <= add.x, `${locale} navigation leaves room for quick add`)
      assert.equal(await header.locator('.period-heading .column-meta').count(), horizon === 'week' || horizon === 'cycle' ? 0 : 1, `${locale} distant dates and non-current cycles are the heading`)
      assert(!/\b20\d{2}\b/.test(await header.locator('.period-heading').innerText()), `${locale} header dates omit years`)
      const currentLabels = { en: ['Back to current period', 'Back to this month', 'Back to this week', 'Back to today'], ja: ['今期に戻る', '今月に戻る', '今週に戻る', '今日に戻る'], es: ['Volver al período actual', 'Volver a este mes', 'Volver a esta semana', 'Volver a hoy'], fr: ['Revenir à la période actuelle', 'Revenir à ce mois', 'Revenir à cette semaine', 'Revenir à aujourd’hui'], zh: ['回到当期', '回到本月', '回到本周', '回到今日'] }
      if (await header.locator('[data-return-current]').count()) assert.equal(await header.locator('[data-return-current]').innerText(), currentLabels[locale][['cycle', 'month', 'week', 'day'].indexOf(horizon)])
      if (['en', 'es', 'fr'].includes(locale)) assert(!/[一-鿿]/.test(await header.innerText()), `${locale} period header must be translated`)
    }
    await shot(`timeline-${locale}`)
  }
  checks.push('Five translated menus, dark theme and context-menu row pinning in a 91-item virtual future column')
  assert.deepEqual(errors, [])
  await application.close(); application = await launch(); page = await application.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('.board').waitFor()
  assert.equal(await column('week').getAttribute('data-period-mode'), 'current')
  assert.equal((await item(ids.week)).period.id, further.id)
  await moveNext('week'); await moveNext('week'); await row(ids.week).waitFor()
  await shot('future-after-restart')
  checks.push('Restart defaults to the current board and retains future task placement/content')
  await column('week').locator('[data-add-item]').click()
  await column('week').locator('.quick-add input').fill('Draft before replacement')
  const beforeReplacement = await item(ids.week)
  const generation = (await page.evaluate(() => window.goalloom.getSnapshot())).workspace.generation
  const data = async action => {
    const reply = await page.evaluate(action => window.goalloom.data(action), { ...action, generation })
    // Raw transfer IPC bypasses Settings refresh; notify the production handler without activating the window.
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('focus'))
    return reply
  }
  const backup = await data({ type: 'createBackup' })
  const backupId = backup.status.records.find(record => record.kind === 'manual').id
  const prepareRestore = async () => {
    const preview = await data({ type: 'previewBackup', backupId })
    const prepared = await data({ type: 'prepare', token: preview.preview.token })
    assert(prepared.preview.backup, 'Restore requires a verified protective backup')
    return preview.preview.token
  }
  const token = await prepareRestore()
  await page.waitForFunction(() => document.querySelector('.fab').disabled)
  assert.equal(await column('week').locator('[data-add-item]').isDisabled(), true)
  const staleMove = { type: 'move', itemId: ids.week, expectedVersion: beforeReplacement.item.version, expectedPlacementVersion: beforeReplacement.item.placement.version, horizon: 'week', period: { kind: 'next' }, generation, operationId: crypto.randomUUID() }
  const blocked = await page.evaluate(command => window.goalloom.execute(command), staleMove)
  assert.equal(blocked.ok, false); assert.equal(blocked.code, 'maintenance')
  assert.deepEqual(await item(ids.week), beforeReplacement)
  await data({ type: 'cancel', token })
  await page.waitForFunction(() => !document.querySelector('.fab').disabled)
  assert.equal(await column('week').locator('.quick-add input').inputValue(), 'Draft before replacement')
  const restored = await data({ type: 'commit', token: await prepareRestore(), acknowledged: true })
  assert.notEqual(restored.generation, generation)
  await page.waitForFunction(() => document.querySelector('.board-column[data-horizon="week"]')?.getAttribute('data-period-mode') === 'current')
  assert.equal(await page.locator('.quick-add, .context-menu, .toast').count(), 0)
  const replaced = await page.evaluate(command => window.goalloom.execute(command), staleMove)
  assert.equal(replaced.ok, false); assert.equal(replaced.code, 'generation')
  await moveNext('week'); await moveNext('week'); await row(ids.week).waitFor()
  assert.equal((await item(ids.week)).period.id, further.id)
  await shot('future-after-restore')
  checks.push('Maintenance blocks repeated writes, cancellation preserves the draft, workspace restore clears period selections/drafts/feedback and rejects the old generation')
  }
  assert.deepEqual(errors, [])
  report.rendererErrors = errors; report.passed = true
  await writeFile(join(evidence, reportName), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} catch (error) {
  report.error = String(error)
  if (application) {
    const page = await application.firstWindow().catch(() => null)
    await page?.screenshot({ path: join(evidence, 'failure.png') }).catch(() => undefined)
    if (page) await writeFile(join(evidence, 'failure.txt'), await page.locator('body').ariaSnapshot().catch(() => 'Unavailable'))
  }
  await writeFile(join(evidence, reportName), JSON.stringify(report, null, 2))
  throw error
} finally {
  await application?.close()
  await rm(profile, { recursive: true, force: true })
}
