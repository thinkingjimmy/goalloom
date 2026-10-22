/**
 * [INPUT]: The current production Electron build, isolated profiles and an injected-clock Repository seed.
 * [OUTPUT]: Native legacy-preference/startup/manual/backlog placement evidence, screenshots, runtime details and app-local failure diagnostics.
 * [POS]: Focused parent-placement regression; verifies false/true migration, saved-value precedence, immediate toggles and unchanged older-task order.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { cpus, release, tmpdir, arch } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'
import { stepPeriod } from './fixtures/period-step.mjs'

const evidence = resolve('output/tests/parent-placement')
await mkdir(evidence, { recursive: true })
const fixturePath = join(evidence, 'parent-placement-seed.mjs')
await build({ entryPoints: ['tests/fixtures/parent-placement-seed.ts'], bundle: true, platform: 'node', format: 'esm', outfile: fixturePath })
const report = { passed: false, checks: [], cases: [], screenshots: [], errors: [],
  scope: 'Source Electron, production preload/main/worker/SQLite, isolated synthetic profiles. No packaged or Windows acceptance.',
  environment: { platform: process.platform, arch: arch(), release: release(), cpu: cpus()[0]?.model, machineScope: 'Host OS reported; physical/VM status not independently verified' },
}
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
let application, page, profile, scenario
const launch = async () => {
  application = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
  page = await application.firstWindow(); page.setDefaultTimeout(12000)
  page.on('pageerror', error => report.errors.push(error.message))
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1880, 1000))
  await page.waitForFunction(() => !!window.goalloom)
}
const close = async () => { await application?.close(); application = null; page = null }
const snapshot = () => page.evaluate(() => window.goalloom.getSnapshot())
const item = id => page.evaluate(id => window.goalloom.getItem(id), id)
const roots = period => page.evaluate(async period => {
  const snapshot = await window.goalloom.getSnapshot()
  const board = await window.goalloom.getBoardPeriods({ type: 'boardPeriods', generation: snapshot.workspace.generation, periods: [{ horizon: period.horizon, startDate: period.startDate }] })
  return board.items.filter(item => !item.placement.nestingParentId).map(item => item.id)
}, period)
const shot = async name => { const path = join(evidence, `${name}.png`); await page.screenshot({ path }); report.screenshots.push(path) }
const setting = async () => {
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  const dialog = page.locator('dialog.settings-modal')
  await dialog.getByRole('button', { name: '看板', exact: true }).click()
  return { dialog, toggle: dialog.getByRole('switch', { name: '按上级自动放置', exact: true }) }
}
const savedPreference = async () => JSON.parse(await readFile(join(profile, 'parent-order.json'), 'utf8')).enabled
const settled = () => page.waitForFunction(() => !document.querySelector('.fab')?.disabled && !document.querySelector('.board-column[aria-busy="true"]'))
async function toggle(enabled) {
  const revision = (await snapshot()).workspace.revision
  const { dialog, toggle } = await setting()
  if ((await toggle.getAttribute('aria-checked') === 'true') !== enabled) await toggle.click()
  assert.equal(await toggle.getAttribute('aria-checked'), String(enabled))
  // This request shares the immediate channel, so its reply drains the preceding UI preference write.
  assert.equal(await page.evaluate(value => window.goalloom.initializeParentOrder(value), !enabled), enabled)
  assert.equal(await savedPreference(), enabled)
  assert.equal((await snapshot()).workspace.revision, revision, 'Toggling placement must not mutate tasks')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
}
async function moveNext(id, target) {
  await page.locator(`#item-${id} .task-title`).click({ button: 'right' })
  const action = page.locator('.context-menu:not(.context-submenu) [role="menuitem"]').first()
  assert.match(await action.innerText(), /移到明天/)
  await action.click()
  await pollPage(page, async ({ id, target }) => (await window.goalloom.getItem(id)).item.placement.periodId === target, { id, target: target.id })
  await settled()
}
async function arrange(id, title, target) {
  const column = page.locator('.board-column[data-horizon="week"]')
  const review = column.locator('[data-dismiss-review]')
  if (await review.count()) await review.click()
  await column.locator('.backlog-entry').click()
  const dialog = page.locator('dialog.backlog-modal[open]')
  const clearsAll = await dialog.locator('.backlog-row').count() === 1
  await dialog.getByRole('checkbox', { name: `选择 ${title}`, exact: true }).check()
  await dialog.getByRole('button', { name: '安排到当前本周', exact: true }).click()
  await pollPage(page, async ({ id, target }) => (await window.goalloom.getItem(id)).item.placement.periodId === target, { id, target: target.id })
  if (clearsAll) await dialog.waitFor({ state: 'detached' })
  else await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await settled()
}
async function manualAcceptance(fixture) {
  const { ids, tomorrow, week, original } = fixture
  // Disable only the debounced cloud report. The real immediate preference channel and task IPC stay active.
  await application.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('goalloom:device-prefs')
    ipcMain.removeHandler('goalloom:device-prefs')
    ipcMain.handle('goalloom:device-prefs', (event, ...args) => {
      if (args[0]?.entries?.some(entry => entry.key === 'parentOrder')) return null
      return original(event, ...args)
    })
  })
  await toggle(true)
  await moveNext(ids.manualOn, tomorrow)
  assert.deepEqual(await roots(tomorrow), [ids.tomorrowA, ids.tomorrowB, ids.manualOn, ids.tomorrowLoose])
  assert.deepEqual((await roots(tomorrow)).filter(id => original.tomorrow.includes(id)), original.tomorrow)
  assert.equal((await item(ids.manualChild)).item.placement.periodId, tomorrow.id)
  assert.equal((await item(ids.manualChild)).item.placement.nestingParentId, ids.manualOn)
  const dayColumn = page.locator('.board-column[data-horizon="day"]')
  await stepPeriod(dayColumn, 'next'); await page.locator(`#item-${ids.manualChild}`).waitFor()
  await shot('manual-enabled-group'); await stepPeriod(dayColumn, 'previous'); await settled()
  await arrange(ids.backlogOn, 'Backlog enabled', week)
  assert.deepEqual(await roots(week), [ids.weekA, ids.backlogOn, ids.weekB, ids.weekLoose])
  assert.deepEqual((await roots(week)).filter(id => original.week.includes(id)), original.week)
  assert.equal((await item(ids.backlogChild)).item.placement.periodId, week.id)
  assert.equal((await item(ids.backlogChild)).item.placement.nestingParentId, ids.backlogOn)
  await shot('backlog-enabled-group')
  await toggle(false)
  const tomorrowBefore = await roots(tomorrow), weekBefore = await roots(week)
  await moveNext(ids.manualOff, tomorrow)
  assert.deepEqual(await roots(tomorrow), [...tomorrowBefore, ids.manualOff])
  await arrange(ids.backlogOff, 'Backlog disabled', week)
  assert.deepEqual(await roots(week), [...weekBefore, ids.backlogOff])
  await shot('backlog-disabled-tail')
  report.checks.push('Native next-period and backlog actions follow the switch, move local groups together and preserve every older root relative position')
  await close(); await launch(); await page.locator('.board').waitFor(); await settled()
  const { dialog, toggle: control } = await setting()
  assert.equal(await control.getAttribute('aria-checked'), 'false')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  assert.deepEqual(await roots(tomorrow), [...tomorrowBefore, ids.manualOff])
  assert.deepEqual(await roots(week), [...weekBefore, ids.backlogOff])
  assert.equal(await savedPreference(), false)
  report.checks.push('The immediate preference channel persists UI changes with the debounced preference bus disabled, and restart preserves the switch and task positions')
}

try {
  for (scenario of [
    { name: 'legacy-enabled', legacy: true, saved: null, expected: true },
    { name: 'legacy-disabled', legacy: false, saved: null, expected: false },
    { name: 'saved-enabled', legacy: false, saved: true, expected: true },
    { name: 'saved-disabled', legacy: true, saved: false, expected: false },
  ]) {
    profile = await mkdtemp(join(tmpdir(), `goalloom-${scenario.name}-`))
    await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
    await launch()
    await page.evaluate(async legacy => { await window.goalloom.getSnapshot(); localStorage.setItem('goalloom.parent-order', String(legacy)) }, scenario.legacy)
    await close()
    if (scenario.saved === null) await rm(join(profile, 'parent-order.json'), { force: true })
    else await writeFile(join(profile, 'parent-order.json'), JSON.stringify({ enabled: scenario.saved }))
    const seeded = spawnSync(electronPath, [fixturePath, profile], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
    assert.equal(seeded.status, 0, seeded.stderr)
    const fixture = JSON.parse(await readFile(join(profile, 'parent-placement-fixture.json'), 'utf8'))
    await writeFile(join(evidence, `${scenario.name}-fixture.json`), JSON.stringify(fixture, null, 2))
    await launch(); await page.locator('.board').waitFor()
    await pollPage(page, async ({ id, period }) => (await window.goalloom.getItem(id)).item.placement.periodId === period, { id: fixture.ids.automatic, period: fixture.day.id })
    await settled()
    const expected = [...fixture.original.day]
    expected.splice(scenario.expected ? 1 : expected.length, 0, fixture.ids.automatic)
    assert.deepEqual(await roots(fixture.day), expected, 'First startup rollover must use the initialized device preference')
    assert.deepEqual((await roots(fixture.day)).filter(id => fixture.original.day.includes(id)), fixture.original.day)
    assert.equal((await item(fixture.ids.automaticChild)).item.placement.periodId, fixture.day.id)
    assert.equal((await item(fixture.ids.automaticChild)).item.placement.nestingParentId, fixture.ids.automatic)
    assert.equal(await savedPreference(), scenario.expected)
    assert.equal(await page.evaluate(() => localStorage.getItem('goalloom.parent-order')), String(scenario.expected))
    report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
    report.cases.push({ ...scenario, expectedOrder: expected, actualOrder: await roots(fixture.day), runtime: fixture.runtime })
    await shot(`${scenario.name}-startup`)
    report.checks.push(`${scenario.name}: first startup rollover preserves existing order and moves the local group using the initialized switch`)
    if (scenario.name === 'legacy-enabled') await manualAcceptance(fixture)
    await close(); await rm(profile, { recursive: true, force: true }); profile = null
  }
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) {
  report.failure = error.stack ?? String(error); report.scenario = scenario
  if (page && !page.isClosed()) {
    report.localState = await page.evaluate(async () => ({ focused: document.hasFocus(), visibility: document.visibilityState,
      activeElement: document.activeElement?.outerHTML.slice(0, 1000), snapshot: await window.goalloom.getSnapshot() })).catch(() => null)
    report.nativeWindow = await application.evaluate(({ BrowserWindow }) => ({ focused: BrowserWindow.getAllWindows()[0]?.isFocused(), visible: BrowserWindow.getAllWindows()[0]?.isVisible() })).catch(() => null)
    await page.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {})
  }
  throw error
} finally {
  await close().catch(() => {})
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2))
  if (profile) await rm(profile, { recursive: true, force: true })
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, evidence }, null, 2))
