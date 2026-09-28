/**
 * [INPUT]: Production Electron build and isolated history/rollover fixtures.
 * [OUTPUT]: Compact timeline and filter navigation, past rows/paging, backlog and restore assertions; repeatable screenshots and history.json.
 * [POS]: Focused desktop acceptance using the production bridge and database; setup only sizes the native window.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, tmpdir, version } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'
import { verifyPastEditing, verifyPastPaging } from './fixtures/past-period-editing.mjs'
import { verifyFilterNavigation } from './fixtures/filter-navigation.mjs'

await build({ configFile: false, build: { outDir: 'output/tests/build/history', emptyOutDir: false, lib: { entry: 'tests/desktop/fixtures/history-seed.ts', formats: ['cjs'], fileName: () => 'history-seed.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
const profile = await mkdtemp(join(tmpdir(), 'Goalloom 历史测试 '))
const seed = spawnSync(electronPath, ['output/tests/build/history/history-seed.cjs', profile], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
assert.equal(seed.status, 0, seed.stderr)
const fixture = JSON.parse(await readFile(join(profile, 'fixture.json'), 'utf8'))
// Assertions use Chinese copy; pin the device language instead of following the machine's system language.
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
await mkdir('output/tests/screenshots', { recursive: true })
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2]
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const app = await electron.launch({ ...options, env: environment })
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(12000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1880, 1000))
  await page.evaluate(() => document.addEventListener('pointermove', event => { window.historyPointer = { x: event.clientX, y: event.clientY, horizon: event.target.closest('[data-horizon]')?.dataset.horizon } }))
  const month = page.getByRole('region', { name: '本月列', exact: true })
  const day = page.getByRole('region', { name: '今天列', exact: true })
  const previous = column => column.locator('[data-previous-period]')
  const next = column => column.locator('[data-next-period]')
  const current = column => column.locator('[data-return-current]')
  const compactHeader = async column => {
    const geometry = await column.locator('.period-nav').evaluate(nav => {
      const left = nav.querySelector('[data-previous-period]').getBoundingClientRect()
      const heading = nav.querySelector('.period-heading').getBoundingClientRect()
      const content = (nav.querySelector('[data-review], [data-return-current]') ?? nav.querySelector('.period-heading')).getBoundingClientRect()
      const right = nav.querySelector('[data-next-period]').getBoundingClientRect()
      return { leftGap: heading.left - left.right, rightGap: right.left - content.right, width: nav.getBoundingClientRect().width }
    })
    assert(geometry.leftGap >= 0 && geometry.leftGap <= 8, 'Previous hugs the title')
    assert(geometry.rightGap >= 0 && geometry.rightGap <= 8, 'Next hugs the date or review entry')
    return geometry
  }
  const controlOpacity = column => column.locator('[data-previous-period], [data-next-period], [data-add-item]').evaluateAll(buttons => buttons.map(button => getComputedStyle(button).opacity))
  await month.getByRole('button', { name: '往期未完成 · 1' }).waitFor()
  const original = await page.evaluate(() => window.goalloom.getSnapshot())
  const monthId = await month.getAttribute('data-period-id')
  const dayId = await day.getAttribute('data-period-id')
  assert.equal(await page.locator('[data-history-entry], .history-summary, .period-menu').count(), 0)
  assert.equal(await page.locator('[data-horizon="later"] .period-nav').count(), 0)
  for (const column of [month, day]) {
    await column.locator('.column-header').scrollIntoViewIfNeeded()
    await page.mouse.move(1, 1)
    assert.deepEqual(await controlOpacity(column), ['0', '0', '0'], 'Navigation and quick add recede together outside the column')
    const idle = await compactHeader(column)
    await column.locator('.column-content').hover({ position: { x: 15, y: 40 } })
    assert.deepEqual(await controlOpacity(column), ['1', '1', '1'], 'Hovering the column body reveals header controls')
    assert.deepEqual(await compactHeader(column), idle, 'Hover does not move or resize the header')
  }
  await page.mouse.move(1, 1)
  await previous(day).focus()
  await page.keyboard.press('Tab')
  assert.equal(await next(day).evaluate(button => button === document.activeElement), true)
  assert.deepEqual(await controlOpacity(day), ['1', '1', '1'], 'Keyboard navigation reveals header controls without hover')
  await next(day).evaluate(button => button.blur())
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true)
  assert.deepEqual(await controlOpacity(day), ['1', '1', '1'], 'Touch controls remain visible without hover')
  assert.equal((await next(day).boundingBox()).width, 44)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await cdp.detach()
  await next(day).click()
  await day.locator('.period-title').filter({ hasText: '明天' }).waitFor()
  assert.equal(await current(day).innerText(), '回到今日')
  assert.equal(await day.locator('.period-heading .column-meta').count(), 1)
  assert.equal(await day.locator('.period-meta').count(), 0)
  await compactHeader(day)
  await previous(day).click()
  assert.equal(await day.getAttribute('data-period-id'), dayId)
  await previous(day).click()
  await day.locator('.period-title').filter({ hasText: '昨天' }).waitFor()
  await compactHeader(day)
  await day.locator('.pagination').waitFor()
  assert.match(await day.locator('.pagination').innerText(), /1–50\/55/)
  assert.equal(await day.locator('.past-period-row').filter({ hasText: 'Rolled day row' }).count(), 0, 'Rollover filtering happens before paging')
  assert.equal(await day.locator('.past-period-row').count(), 50)
  assert.equal(await day.locator('details, summary').count(), 0, 'History groups are always expanded')
  assert.equal(await day.locator('.past-period-row:visible').count(), 50)
  await day.locator('.pagination').getByRole('button', { name: '下页', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[data-horizon="day"] .pagination')?.textContent.includes('51–55/55'))
  assert.equal(await day.locator('.past-period-row').count(), 5)
  const paging = await verifyPastPaging(page, day)
  await next(day).click()
  assert.equal(await day.getAttribute('data-period-id'), dayId)
  await next(day).click()
  await current(day).click()
  assert.equal(await day.getAttribute('data-period-id'), dayId)
  await previous(month).click()
  await month.getByText('这个周期没有任务。').waitFor()
  assert.equal(await month.getAttribute('data-history'), 'true')
  assert.equal(await previous(month).isEnabled(), true)
  await previous(month).click()
  await month.getByRole('button', { name: '后来完成样本', exact: true }).waitFor()
  await page.waitForFunction(() => document.activeElement === document.querySelector('[data-horizon="month"] .period-title'))
  // Past task groups reflect their latest state, independently of immutable history projections.
  const laterDone = month.locator('.past-period-row').filter({ hasText: '后来完成样本' })
  assert.equal(await laterDone.getAttribute('data-outcome'), 'done')
  assert.equal(await laterDone.locator('.check').getAttribute('aria-label'), '重开 后来完成样本')
  await month.getByRole('button', { name: '当期完成样本', exact: true }).waitFor()
  assert.deepEqual(await month.locator('.past-period-row[data-outcome="done"] .check').evaluateAll(buttons => buttons.map(button => button.dataset.checked)), ['true', 'true'])
  assert.equal(await month.locator('.past-period-row[data-outcome="moved"], .past-period-row[data-outcome="cancelled"]').count(), 0)
  assert.equal(await month.locator('.past-period-row').filter({ hasText: '已经顺延样本' }).count(), 0)
  assert.equal(await month.locator('details, summary').count(), 0)
  assert.equal(await month.locator('.past-period-row').filter({ hasText: '当期删除样本' }).getAttribute('data-outcome'), 'deleted')
  assert.equal(await month.locator('.past-period-row').filter({ hasText: '后来删除样本' }).getAttribute('data-outcome'), 'deleted')
  assert.equal(await month.locator(`#item-${fixture.laterMovedId}, #item-${fixture.archivedId}`).count(), 0)
  assert.equal(await month.locator('.past-period-row').count(), 5)
  const groupSpacing = await month.locator('.past-period-group').evaluateAll(groups => groups.map(group => {
    const heading = group.querySelector('h3')
    const headingText = document.createRange()
    headingText.selectNodeContents(heading)
    const title = group.querySelector('.task-title > span').getBoundingClientRect()
    const label = headingText.getBoundingClientRect()
    const previous = group.previousElementSibling?.querySelector('.past-period-row:last-child .task-title > span')?.getBoundingClientRect()
    return { outcome: group.dataset.outcome, titleGap: title.top - label.bottom, previousGroupGap: previous ? label.top - previous.bottom : null }
  }))
  for (const group of groupSpacing) {
    assert(group.titleGap >= 8 && group.titleGap <= 20, `${group.outcome} label stays close to its first record`)
    if (group.previousGroupGap !== null) assert(group.previousGroupGap > group.titleGap, 'Group labels belong visually to the following records')
  }
  assert.equal(await previous(month).isDisabled(), true)
  assert.equal(await month.locator('.period-readonly').count(), 0)
  assert.equal(await month.getByRole('button', { name: '在本月新建' }).count(), 0)
  assert.equal(await month.locator('button.check').count(), 3)
  assert.equal(await month.locator('.drag-handle').count(), 0)
  await laterDone.locator('.task-title').click({ button: 'right' })
  assert.equal(await page.locator('.context-menu').count(), 0)
  assert((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.revision > original.workspace.revision, 'Paging mutations and undo committed through the real bridge')
  await mkdir('output/tests/screenshots', { recursive: true })
  await page.screenshot({ path: 'output/tests/screenshots/history-column.png' })
  await month.screenshot({ path: 'output/tests/screenshots/history-groups.png' })
  const editing = await verifyPastEditing(page, month, fixture)
  await current(month).focus()
  await page.keyboard.press('ControlOrMeta+n')
  await page.getByRole('textbox', { name: '写下想法', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  // 在设置里浏览已完成后关闭，看板历史状态不丢失。
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await page.getByRole('dialog', { name: '设置与数据' }).getByRole('button', { name: '已完成', exact: true }).click()
  await page.getByRole('dialog', { name: '设置与数据' }).getByRole('button', { name: '关闭', exact: true }).click()
  await month.getByRole('button', { name: '后来完成样本', exact: true }).waitFor()
  await month.getByRole('button', { name: '后来完成样本', exact: true }).focus()
  await page.keyboard.press('Escape')
  await month.getByRole('button', { name: '往期未完成 · 1' }).waitFor()
  assert.equal(await month.getAttribute('data-history'), 'false')
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '查看本月上一期', 'Leaving the past keeps focus on the same navigation')
  assert.equal(await month.getAttribute('data-period-id'), monthId)
  await month.getByRole('button', { name: '往期未完成 · 1' }).click()
  await page.getByRole('checkbox', { name: '选择 往期待办样本' }).check()
  await page.getByRole('button', { name: '安排到当前本月' }).click()
  await page.getByRole('button', { name: '暂不处理' }).click()
  await month.getByRole('button', { name: '往期待办样本', exact: true }).waitFor()
  assert.equal(await page.locator('.toast').count(), 0, 'Arranging backlog stays quiet')
  await page.keyboard.press('ControlOrMeta+z')
  await month.getByRole('button', { name: '往期未完成 · 1' }).waitFor()
  await page.locator('.toast [role="status"]').filter({ hasText: '已撤销' }).waitFor()
  const item = await page.evaluate(id => window.goalloom.getItem(id), fixture.waitingId)
  assert(item.item.placement.holdPeriodId)
  assert.equal(item.item.placement.periodId.split(':').at(-1), fixture.sourceDate)
  const restoredHistory = await page.evaluate(async startDate => window.goalloom.getPastPeriod({ type: 'pastPeriod', generation: (await window.goalloom.getSnapshot()).workspace.generation, horizon: 'month', startDate, offset: 0, limit: 50 }), fixture.sourceDate)
  assert(restoredHistory.items.some(item => item.id === fixture.waitingId), 'Undo back to the old period restores its unfinished row')
  // Restore a completed past-period item through the real trash UI without changing its placement or state.
  if (await page.locator('.toast').count()) await page.getByRole('button', { name: '关闭操作提示', exact: true }).click()
  const deleted = await page.evaluate(async id => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const current = (await window.goalloom.getItem(id)).item
    const reply = await window.goalloom.execute({ type: 'delete', itemId: id, expectedVersion: current.version, generation, operationId: crypto.randomUUID() })
    return { reply, title: current.title, periodId: current.placement.periodId, status: current.status }
  }, fixture.completedId)
  assert.equal(deleted.reply.ok, true)
  assert.equal(deleted.status, 'done')
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置与数据', exact: true })
  await settings.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '回收站', exact: true }).click()
  await settings.locator('.items-row').filter({ hasText: deleted.title }).getByRole('button', { name: '还原', exact: true }).click()
  await page.locator('.toast-detail').filter({ hasText: '往期' }).waitFor()
  const destination = await page.locator('.toast-detail').innerText()
  assert.match(destination, /本月/)
  assert.match(destination, /往期/)
  assert.match(destination, /已完成/)
  await pollPage(page, async id => !(await window.goalloom.getItem(id)).item.deletedAt, fixture.completedId)
  const restored = (await page.evaluate(id => window.goalloom.getItem(id), fixture.completedId)).item
  assert.equal(restored.placement.periodId, deleted.periodId)
  assert.equal(restored.status, deleted.status)
  await mkdir('output/tests/screenshots', { recursive: true })
  const screenshot = 'output/tests/screenshots/feedback-past-restore.png'
  await page.screenshot({ path: screenshot })
  await settings.getByRole('button', { name: '关闭', exact: true }).click()
  if (await page.locator('.toast').count()) await page.getByRole('button', { name: '关闭操作提示', exact: true }).click()
  const filterNavigation = await verifyFilterNavigation(page)
  // 恢复一个仍含任务的工作区必须销毁旧代次的历史页和新建请求。
  await previous(month).click()
  await month.getByText('这个周期没有任务。').waitFor()
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '备份与恢复', exact: true }).click()
  await page.getByRole('button', { name: '立即备份', exact: true }).click()
  const manual = page.locator('.backup-record').filter({ hasText: '手动' }).first()
  await manual.getByRole('button', { name: '用它恢复', exact: true }).click()
  await page.getByRole('button', { name: '创建保护备份并继续', exact: true }).click()
  await page.getByRole('checkbox', { name: '我已了解旧数据只能从保护备份恢复' }).check()
  await page.getByRole('button', { name: '确认恢复工作区', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await month.getByRole('button', { name: '在本月新建', exact: true }).isEnabled(), true)
  assert.equal(await page.locator('.past-period-rows').count(), 0)
  assert.equal(await page.locator('.quick-add').count(), 0)
  const runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const report = {
    passed: true, packaged: Boolean(packaged), runtime,
    environment: { platform: platform(), release: release(), version: version(), arch: arch(), cpu: cpus()[0]?.model, machineScope: process.env.GOALLOOM_TEST_MACHINE_SCOPE ?? 'Host OS reported; physical/VM status not independently verified' },
    historyScreenshot: 'output/tests/screenshots/history-column.png',
    historyGroups: { spacing: groupSpacing, screenshot: 'output/tests/screenshots/history-groups.png' },
    editing, paging, filterNavigation,
    pastRestore: { destination, screenshot, periodId: restored.placement.periodId, status: restored.status },
    rendererErrors: errors,
    checks: ['compact hover/keyboard/touch navigation without layout shift; Later has no timeline', 'continuous future/current/past navigation', 'always-expanded live groups with compact spacing and 55-row pagination', 'empty-period traversal and earliest-record stop', 'latest unfinished/completed/deleted states exclude every moved or archived task', 'live editing, completion, reopening, deletion, restoration and move/undo preserve original history', 'last-page removal and undo keep an effective offset', 'stale versions, stale generations, current-period and unknown query fields are rejected', 'Escape returns with focus kept', 'session retains past period', 'backlog batch', 'undo returns old period with hold and restores membership', 'past completed restore confirms original month and status', 'workspace restore clears old periods and pending create'],
  }
  assert.deepEqual(errors, [])
  await writeFile('output/tests/history.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} catch (error) {
  const page = await app.firstWindow().catch(() => null)
  await mkdir('output/tests/screenshots', { recursive: true })
  await page?.screenshot({ path: 'output/tests/screenshots/history-failure.png' }).catch(() => undefined)
  const interaction = {
    windows: await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getBounds(), contentBounds: window.getContentBounds() }))).catch(() => null),
    page: await page?.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML, pointer: window.historyPointer, hovered: [...document.querySelectorAll('[data-horizon]:hover')].map(column => column.dataset.horizon), viewport: { width: innerWidth, height: innerHeight }, columns: [...document.querySelectorAll('[data-horizon]')].map(column => ({ horizon: column.dataset.horizon, x: column.getBoundingClientRect().x, content: column.querySelector('.column-content').getBoundingClientRect().toJSON() })) })).catch(() => null),
  }
  await writeFile('output/tests/history-interaction.json', JSON.stringify(interaction, null, 2))
  await writeFile('output/tests/history-failure.txt', `${String(error)}\n${await page?.locator('body').ariaSnapshot().catch(() => 'Unavailable')}`)
  throw error
} finally { await app.close(); await rm(profile, { recursive: true, force: true }) }
