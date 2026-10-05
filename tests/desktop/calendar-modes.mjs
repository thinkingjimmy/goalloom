/**
 * [INPUT]: Current Electron build, isolated profiles and calendar storage fixtures.
 * [OUTPUT]: Two-mode/short-year/six-future-column and six-policy acceptance, locale/theme captures and legacy import evidence.
 * [POS]: Cross-feature calendar regression journey; all task data is synthetic.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, release, tmpdir } from 'node:os'
import { finishSetup, chooseSetupCalendar } from './fixtures/setup.mjs'

const out = resolve('output/tests/calendar-modes')
await mkdir(out, { recursive: true })
for (const version of [5, 6]) for (const suffix of ['', '-wal', '-shm']) await rm(join(out, `legacy-v${version}.sqlite${suffix}`), { force: true })
await build({ entryPoints: ['tests/desktop/fixtures/calendar-seed.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(out, 'calendar-seed.mjs') })
await build({ entryPoints: ['tests/desktop/fixtures/calendar-history.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(out, 'calendar-history.mjs') })
await build({ entryPoints: ['tests/desktop/fixtures/rollover-policies.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(out, 'rollover-policies.mjs') })
const policies = spawnSync(electronPath, [join(out, 'rollover-policies.mjs'), out], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
assert.equal(policies.status, 0, policies.stderr)
const seed = spawnSync(electronPath, [join(out, 'calendar-seed.mjs'), out], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
assert.equal(seed.status, 0, seed.stderr)
const report = { checks: [], runtime: null, os: release(), arch: process.arch, cpu: cpus()[0]?.model, machineScope: 'Host macOS; physical/VM status not independently verified', scope: 'Source-built Electron, real preload/worker/SQLite, synthetic isolated data', passed: false }
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
let application, page, profile
const column = horizon => page.locator(`.board-column[data-horizon="${horizon}"]`)
const shoot = name => page.screenshot({ path: join(out, `${name}.png`) })
async function launch(history = false, reuse = false) {
  if (!reuse) profile = await mkdtemp(join(tmpdir(), 'Goalloom calendar '))
  if (history) {
    const seeded = spawnSync(electronPath, [join(out, 'calendar-history.mjs'), profile], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
    assert.equal(seeded.status, 0, seeded.stderr)
  }
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  application = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env: environment })
  page = await application.firstWindow()
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 840))
  page.on('pageerror', error => { throw error })
}
async function close() { await application?.close(); application = null; await rm(profile, { recursive: true, force: true }) }
async function verifySettings(mode) {
  await page.keyboard.press('ControlOrMeta+,')
  const settings = page.locator('dialog.settings-modal')
  await settings.getByRole('button', { name: '日历与顺延', exact: true }).click()
  assert.match(await settings.locator('.calendar-summary').innerText(), new RegExp(`${mode === 'natural' ? '自然年' : '365 天'}[\\s\\S]*已锁定`))
  assert.equal(await settings.locator('.policy-row').count(), 6)
  assert.deepEqual(await settings.locator('.policy-row').evaluateAll(rows => rows.map(row => row.dataset.policyHorizon)), ['year', 'half', 'cycle', 'month', 'week', 'day'])
  for (const horizon of ['year', 'half', 'cycle', 'month', 'week', 'day']) {
    const row = settings.locator(`[data-policy-horizon="${horizon}"]`)
    assert.equal(await row.getByRole('radio').count(), 2)
    assert.equal(await row.getByRole('radio', { name: horizon === 'day' ? '自动顺延' : '手动', exact: true }).getAttribute('aria-checked'), 'true')
  }
  for (const horizon of ['year', 'half', 'cycle']) {
    const row = settings.locator(`[data-policy-horizon="${horizon}"]`)
    await row.getByRole('radio', { name: '自动顺延', exact: true }).click()
    await page.waitForFunction(horizon => document.querySelector(`[data-policy-horizon="${horizon}"] [role="radio"]:last-child`)?.getAttribute('aria-checked') === 'true' && !document.querySelector('.fab').disabled, horizon)
    assert.match(await row.locator('.policy-note').innerText(), /自动移入/)
  }
  const saved = await page.evaluate(() => window.goalloom.getSnapshot())
  for (const horizon of ['year', 'half', 'cycle']) assert.equal(saved.policies.find(policy => policy.horizon === horizon).mode, 'auto')
  await settings.getByText('下一年度开始', { exact: true }).waitFor()
  await settings.getByText('下个半年开始', { exact: true }).waitFor()
  // The upcoming starts shown are the ends of the authoritative current periods.
  const expected = await page.evaluate(async () => {
    const { periods } = await window.goalloom.getSnapshot()
    const format = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
    return ['year', 'half', 'cycle'].map(horizon => format.format(new Date(`${periods.find(period => period.horizon === horizon).endDate}T00:00:00Z`)))
  })
  assert.deepEqual(await settings.locator('.calendar-facts dd').allInnerTexts(), expected)
  await shoot(`${mode}-calendar-settings`)
  // Changing the calendar leads to the reset entry in Backup & restore, focused and marked.
  await settings.getByRole('button', { name: /^更换日历/ }).click()
  await settings.getByRole('heading', { name: '备份与恢复', exact: true }).waitFor()
  await settings.locator('.settings-group[data-reveal]').getByText('重置工作区', { exact: true }).waitFor()
  assert.equal(await settings.getByRole('button', { name: '重置', exact: true }).evaluate(node => node === document.activeElement), true)
  await settings.getByRole('button', { name: '日历与顺延', exact: true }).click()
  await settings.getByRole('button', { name: '备份与恢复', exact: true }).click()
  assert.equal(await settings.locator('.settings-group[data-reveal]').count(), 0, 'Ordinary navigation does not re-mark the reset entry')
  await page.keyboard.press('Escape')
  await settings.waitFor({ state: 'detached' })
  // A real process restart must retain all three independently saved choices.
  await application.close(); application = null
  await launch(false, true); await page.locator('.board').waitFor()
  const restarted = await page.evaluate(() => window.goalloom.getSnapshot())
  assert.deepEqual(restarted.policies, saved.policies)
  await page.keyboard.press('ControlOrMeta+,')
  const reopened = page.locator('dialog.settings-modal')
  await reopened.getByRole('button', { name: '日历与顺延', exact: true }).click()
  for (const horizon of ['year', 'half', 'cycle']) {
    const row = reopened.locator(`[data-policy-horizon="${horizon}"]`)
    assert.equal(await row.getByRole('radio', { name: '自动顺延', exact: true }).getAttribute('aria-checked'), 'true')
    await row.getByRole('radio', { name: '手动', exact: true }).click()
    await page.waitForFunction(horizon => document.querySelector(`[data-policy-horizon="${horizon}"] [role="radio"]:first-child`)?.getAttribute('aria-checked') === 'true' && !document.querySelector('.fab').disabled, horizon)
  }
  await shoot(`${mode}-calendar-settings-manual`)
  await page.keyboard.press('Escape'); await reopened.waitFor({ state: 'detached' })
  report.checks.push(`${mode}: six ordered editable policies, manual long-horizon defaults, auto/manual saves and process restart persistence`)
}
try {
  await launch()
  const anchor = await page.evaluate(() => {
    const today = Temporal.Now.zonedDateTimeISO('UTC').toPlainDate()
    return today.add({ days: 7 }).subtract({ months: 12 }).toString()
  })
  await chooseSetupCalendar(page, { timezone: 'UTC', anchor })
  await page.locator('.direction-input').fill('Calendar annual direction')
  await page.locator('.direction-input').press('Enter')
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.setupConfirmedAt, null)
  assert.match(await page.locator('.onboarding-hint').last().innerText(), /方向会放进/)
  await shoot('short-year-preview')
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
  await page.locator('.board').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  await page.waitForFunction(() => document.querySelector('[data-horizon="year"]')?.dataset.periodMode === 'future')
  const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
  const direction = snapshot.flows.find(item => item.title === 'Calendar annual direction')
  const detail = await page.evaluate(id => window.goalloom.getItem(id), direction.id)
  assert.equal(detail.item.placement.horizon, 'year')
  assert.equal(await column('year').getAttribute('data-period-id'), detail.period.id)
  assert.match(await column('year').locator('.column-header').innerText(), /下一年/)
  assert.equal((await column('half').getAttribute('data-period-id')).split(':').at(-1), detail.period.startDate)
  await column('half').locator('.insight-empty').waitFor()
  await shoot('short-year-board')
  // The free empty-column action must retain the displayed future half, even without an AI provider.
  await column('half').getByRole('button', { name: '自己写', exact: true }).click()
  await page.locator('.seeded-composer textarea').fill('Future half phase')
  await page.locator('.seeded-composer .composer-primary').click()
  await column('half').getByRole('button', { name: 'Future half phase', exact: true }).waitFor()
  const phaseId = await column('half').locator('.task-row').filter({ has: page.getByRole('button', { name: 'Future half phase', exact: true }) }).getAttribute('data-item-id')
  const phase = (await page.evaluate(id => window.goalloom.getItem(id), phaseId)).item
  assert.equal(phase.placement.periodId, await column('half').getAttribute('data-period-id'))
  await column('year').getByRole('button', { name: 'Calendar annual direction', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '拆下一步', exact: true }).click()
  await page.locator('.seeded-composer textarea').fill('Future linked phase')
  await page.locator('.seeded-composer .composer-primary').click()
  await column('half').getByRole('button', { name: 'Future linked phase', exact: true }).waitFor()
  const linkedId = await column('half').locator('.task-row').filter({ has: page.getByRole('button', { name: 'Future linked phase', exact: true }) }).getAttribute('data-item-id')
  const linked = (await page.evaluate(id => window.goalloom.getItem(id), linkedId)).item
  assert.equal(linked.placement.periodId, phase.placement.periodId)
  await verifySettings('rolling')
  report.checks.push('short rolling year defaults to next year; year/half locate, empty-card and decomposition keep future destination')
  await close()

  await launch()
  await finishSetup(page, { mode: 'natural', timezone: 'UTC', direction: 'Natural annual direction' })
  const natural = await page.evaluate(() => window.goalloom.getSnapshot())
  assert.equal(natural.workspace.calendar.mode, 'natural')
  assert.equal(natural.workspace.calendar.cycleAnchor, `${natural.observedAt.slice(0, 4)}-01-01`)
  assert.equal(await page.locator('.board-column').count(), 7)
  assert.equal(await column('year').locator('.period-label').count(), 0)
  await verifySettings('natural')
  const rootId = natural.flows.find(flow => flow.title === 'Natural annual direction').id
  await page.getByRole('button', { name: '只看 Natural annual direction', exact: true }).click()
  await page.getByRole('button', { name: '全部', exact: true }).hover()
  await page.waitForFunction(id => getComputedStyle(document.querySelector(`#item-${id} .flow-dot-button`)).opacity === '0', rootId)
  await shoot('year-filtered-dot')
  await page.getByRole('button', { name: '全部', exact: true }).click()
  const sourceId = await page.evaluate(async () => {
    const s = await window.goalloom.getSnapshot()
    const r = await window.goalloom.execute({ type: 'create', title: 'Cycle relation source', horizon: 'cycle', generation: s.workspace.generation, operationId: crypto.randomUUID() })
    if (!r.ok) throw Error(r.message)
    return r.result.itemId
  })
  const row = id => page.locator(`#item-${id}`)
  await row(sourceId).scrollIntoViewIfNeeded(); await row(sourceId).hover()
  const sourceDot = await row(sourceId).locator('.flow-dot-button').boundingBox()
  const targetRow = await row(rootId).boundingBox()
  await page.mouse.move(sourceDot.x + sourceDot.width / 2, sourceDot.y + sourceDot.height / 2)
  await page.mouse.down(); await page.mouse.move(sourceDot.x - 10, sourceDot.y + sourceDot.height / 2)
  await page.locator('.relation-drag').waitFor()
  await page.mouse.move(targetRow.x + 90, targetRow.y + 16, { steps: 12 })
  await row(rootId).locator(':scope[data-relation-target="true"]').waitFor()
  await page.mouse.up()
  await page.waitForFunction(() => !document.querySelector('.fab').disabled)
  const afterLink = await page.evaluate(() => window.goalloom.getSnapshot())
  assert(afterLink.relations.some(edge => edge.parentId === rootId && edge.childId === sourceId))
  assert.equal(await column('half').locator('.insight-empty').count(), 0, 'A skip-level child covers the annual source')
  await row(rootId).hover()
  const yearDot = await row(rootId).locator('.flow-dot-button').boundingBox()
  await page.mouse.move(yearDot.x + yearDot.width / 2, yearDot.y + yearDot.height / 2)
  await page.mouse.down(); await page.mouse.move(yearDot.x - 10, yearDot.y + yearDot.height / 2)
  assert.equal(await page.locator('.relation-drag').count(), 0)
  await page.mouse.up(); await page.keyboard.press('Escape')
  report.checks.push('BUG-05/07/08: cycle can link to year; year cannot start a relation drag; filtered year dot hides; skip-level children suppress empty half cards')
  for (const horizon of ['year', 'half', 'cycle']) {
    await column(horizon).scrollIntoViewIfNeeded()
    await column(horizon).locator('[data-period-switch]').click()
    const rows = page.locator('.period-picker-row')
    assert.equal(await rows.count(), 6, `${horizon} uses period rows`)
    const labels = await rows.locator('span').allTextContents()
    assert.equal(new Set(labels).size, 6, `${horizon} list rows are unambiguous`)
    await page.keyboard.press('Escape')
  }
  for (const horizon of ['year', 'half', 'cycle', 'month', 'week', 'day']) {
    await column(horizon).scrollIntoViewIfNeeded()
    await column(horizon).locator('[data-period-switch]').press('ArrowRight')
  }
  await page.waitForFunction(() => [...document.querySelectorAll('.board-column:not([data-horizon="later"])')].every(node => node.dataset.periodMode === 'future' && node.getAttribute('aria-busy') === 'false'))
  assert.equal(await page.getByText('规划加载失败', { exact: false }).count(), 0)
  await shoot('six-future-columns')
  report.checks.push('natural Jan 1 lock; year/half/cycle six-row lists; six future columns load together')
  for (const horizon of ['year', 'half', 'cycle', 'month', 'week', 'day']) {
    await column(horizon).scrollIntoViewIfNeeded()
    await column(horizon).locator('[data-period-switch]').press('ArrowLeft')
  }
  for (const locale of ['zh', 'en', 'ja', 'es', 'fr']) {
    await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
    await page.reload(); await page.locator('.board').waitFor()
    await page.waitForFunction(locale => document.documentElement.lang.startsWith(locale), locale)
    for (const [theme, style] of [['light', 'paper'], ['dark', 'paper'], ['light', 'minimal'], ['dark', 'minimal']]) {
      const reply = await page.evaluate(async ([theme, style]) => {
        const s = await window.goalloom.getSnapshot()
        return window.goalloom.execute({ type: 'preferences', generation: s.workspace.generation, operationId: crypto.randomUUID(), theme, style })
      }, [theme, style])
      assert(reply.ok)
      await page.waitForFunction(({ theme, style }) => document.documentElement.dataset.theme === theme && document.documentElement.dataset.style === style, { theme, style })
      await column('year').scrollIntoViewIfNeeded()
      await shoot(`${locale}-${theme}-${style}`)
      await page.keyboard.press('ControlOrMeta+,')
      const settings = page.locator('dialog.settings-modal')
      await settings.getByRole('button', { name: { zh: '日历与顺延', en: 'Calendar & roll-over', ja: 'カレンダーと繰り越し', es: 'Calendario y traspaso', fr: 'Calendrier et report' }[locale], exact: true }).click()
      assert.equal(await settings.locator('.policy-row [role="radio"]').count(), 12)
      assert.equal(await settings.locator('.policy-row').last().getAttribute('data-policy-horizon'), 'day')
      await settings.locator('.settings-group').filter({ has: page.locator('.policy-row') }).screenshot({ path: join(out, `${locale}-${theme}-${style}-policies.png`) })
      await page.keyboard.press('Escape'); await settings.waitFor({ state: 'detached' })
    }
  }
  report.checks.push('five locales and light/paper, dark/minimal captures')
  await close()
  await launch(true)
  await page.locator('.board').waitFor()
  for (const horizon of ['year', 'half', 'cycle']) {
    await column(horizon).scrollIntoViewIfNeeded()
    await column(horizon).locator('[data-period-switch]').click()
    const past = page.locator('.period-picker-row[data-past="true"]')
    assert.equal(await past.count(), 2)
    await page.waitForFunction(() => document.querySelector('.period-picker-row[data-past="true"] small')?.textContent === '1/1')
    assert.equal(await past.first().isEnabled(), true)
    await past.first().click()
    await column(horizon).locator('.past-period-rows').waitFor()
    await shoot(`${horizon}-recorded-history`)
    await column(horizon).locator('[data-return-current]').click()
  }
  const order = async expected => {
    for (const horizon of ['half', 'cycle']) await page.waitForFunction(({ horizon, expected }) => {
      const titles = [...document.querySelectorAll(`[data-horizon="${horizon}"] .task-row[data-done="false"] .task-title`)].map(node => node.textContent)
      return JSON.stringify(titles) === JSON.stringify(expected.map(letter => `${horizon} ${letter}`))
    }, { horizon, expected })
  }
  const toggleOrder = async () => {
    await page.keyboard.press('ControlOrMeta+,')
    const settings = page.locator('dialog.settings-modal')
    await settings.getByRole('button', { name: '看板', exact: true }).click()
    const control = settings.getByRole('switch', { name: '按上级自动排序', exact: true })
    const previous = await control.getAttribute('aria-checked')
    await control.click()
    await page.waitForFunction(previous => document.querySelector('dialog.settings-modal [role="switch"]')?.getAttribute('aria-checked') !== previous && !document.querySelector('.fab').disabled, previous)
    await page.keyboard.press('Escape'); await settings.waitFor({ state: 'detached' })
  }
  await order(['B', 'A']); await toggleOrder(); await order(['A', 'B'])
  await toggleOrder(); await order(['A', 'B'])
  await page.keyboard.press('ControlOrMeta+z'); await order(['B', 'A'])
  await toggleOrder(); await toggleOrder(); await order(['A', 'B'])
  await shoot('half-cycle-materialized-order')
  await application.close(); application = null
  await launch(false, true); await page.locator('.board').waitFor(); await order(['A', 'B'])
  report.checks.push('BUG-03: year/half/cycle completed counts and two-period history navigation; BUG-10: half/cycle order holds on disable, undo and real process restart')
  report.passed = true
} catch (error) {
  report.error = String(error)
  if (page) { await shoot('failure').catch(() => {}); report.state = await page.evaluate(() => ({ active: document.activeElement?.outerHTML, focused: document.hasFocus(), visibility: document.visibilityState, text: document.body.innerText.slice(0, 5000) })).catch(() => null) }
  throw error
} finally {
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2))
  if (application) await close()
}
console.log(JSON.stringify(report))
