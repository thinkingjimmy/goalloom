/**
 * [INPUT]: Production Electron build, real local date and an injected-clock history fixture.
 * [OUTPUT]: Historical-period, unified-entry, resume, live write and duplicate-plan evidence in output/tests/insight/month-review.
 * [POS]: Focused desktop acceptance through the real renderer/preload/worker/database, isolated from user data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, release, tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const combined = process.argv.includes('--combined')
const out = resolve(`output/tests/insight/${combined ? 'combined-review' : 'month-review'}`)
await mkdir(out, { recursive: true })
await build({ configFile: false, build: { outDir: 'output/tests/build/review', emptyOutDir: false,
  lib: { entry: 'tests/desktop/fixtures/review-seed.ts', formats: ['cjs'], fileName: () => 'review-seed.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
const profile = await mkdtemp(join(tmpdir(), 'Goalloom monthly review '))
const seed = spawnSync(electronPath, ['output/tests/build/review/review-seed.cjs', profile, combined ? 'combined' : 'month'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
assert.equal(seed.status, 0, seed.stderr)
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const fixture = JSON.parse(await readFile(join(profile, 'review-fixture.json'), 'utf8'))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
const report = { ok: false, scope: 'Source Electron; real IPC and SQLite; synthetic isolated records; no packaged or Windows acceptance', profile, host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model }, checks: [] }
const check = value => { report.checks.push(value); console.log(`✓ ${value}`) }
try {
  const page = await app.firstWindow(), errors = []
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1480, 940))
  await page.locator('.board').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const fault = async (type, drop = false) => app.evaluate(({ ipcMain }, { type, drop }) => {
    const command = ipcMain._invokeHandlers.get('goalloom:command'), query = ipcMain._invokeHandlers.get('goalloom:query')
    let first = true, lostReceipt = drop
    ipcMain.removeHandler('goalloom:command'); ipcMain.removeHandler('goalloom:query')
    ipcMain.handle('goalloom:command', async (event, input) => {
      if (first && input.type === type) {
        first = false
        if (!drop) return { ok: false, code: 'stale', message: 'Synthetic write failure' }
        await command(event, input)
        throw Error('Synthetic lost commit reply')
      }
      return command(event, input)
    })
    ipcMain.handle('goalloom:query', (event, input) => {
      if (input.type === 'receipt' && lostReceipt) { lostReceipt = false; throw Error('Synthetic receipt interruption') }
      return query(event, input)
    })
  }, { type, drop })
  const context = await page.evaluate(async period => {
    const snapshot = await window.goalloom.getSnapshot()
    return window.goalloom.getReviewContext({ type: 'reviewContext', generation: snapshot.workspace.generation, periods: [{ horizon: 'month', startDate: period.startDate }] })
  }, fixture.period)
  const records = context.board.items.filter(item => item.placement.periodId === fixture.period.id)
  assert.equal(records.length, 6)
  assert.equal(context.unknown, 0, 'Items created after the boundary are not uncertain historical records')
  assert.equal(records.filter(item => item.status === 'done').length, 1)
  assert.equal(records.find(item => item.id === fixture.laterDone).status, 'todo')
  assert(!records.some(item => item.id === fixture.existing))
  assert.deepEqual(new Set(context.closing.map(item => item.id)), new Set([fixture.move, fixture.keep, fixture.archive, fixture.earlier]))
  assert(context.planning.items.some(item => item.id === fixture.rolled))
  check('Previous-month records and end states exclude current-month content; closing uses live placements and retains earlier backlog')
  assert.equal(await page.evaluate(async () => {
    try { await window.goalloom.getReviewContext({ type: 'reviewContext', generation: 'stale-generation', periods: [{ horizon: 'month', startDate: '2026-09-01' }] }); return true } catch { return false }
  }), false)
  check('A stale-generation review read is rejected')
  const month = page.locator('[data-horizon=month]'), guide = month.locator('.review-guide')
  const firstDay = await page.evaluate(async () => {
    const snapshot = await window.goalloom.getSnapshot()
    return snapshot.periods.find(period => period.horizon === 'day').startDate === snapshot.periods.find(period => period.horizon === 'month').startDate
  })
  if (firstDay && await guide.count()) {
    assert.equal(await month.locator('.backlog-entry, .insight-empty, .review-entry').count(), 0)
    assert.equal(await guide.getByRole('button').count(), 1)
    assert(!(await guide.innerText()).includes('回顾进展'))
    await page.screenshot({ path: `${out}/01-unified-guide.png` })
    await guide.getByRole('button').click()
    const drawer = page.locator('dialog.review-drawer[open]')
    await drawer.locator('.review-metrics').waitFor()
    assert.deepEqual(await drawer.locator('.review-metrics dd').allTextContents(), ['1', combined ? '6' : '5', '3'])
    await drawer.locator('.review-goal-records').first().locator('summary').click()
    assert(await drawer.getByText('September finished work', { exact: true }).isVisible())
    assert.equal(await drawer.getByText('Only in the current month', { exact: true }).count(), 0)
    await page.screenshot({ path: `${out}/02-period-progress.png` })
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); assert(await drawer.evaluate(node => node.contains(document.activeElement))) }
    check('The modal shows prior-period totals and records, and contains keyboard focus')
    await drawer.locator('.review-foot .primary').click()
    await drawer.locator('.review-close-row').first().waitFor()
    await drawer.locator('.review-close-row').filter({ hasText: 'Continue this work' }).getByRole('combobox').selectOption('defer')
    await drawer.locator('.review-close-row').filter({ hasText: 'Stop this experiment' }).getByRole('combobox').selectOption('archive')
    await drawer.locator('.review-head .icon-button').click()
    await guide.getByRole('button', { name: '继续复盘', exact: true }).click()
    assert.equal(await drawer.locator('.review-close-row').filter({ hasText: 'Continue this work' }).getByRole('combobox').inputValue(), 'defer')
    await page.screenshot({ path: `${out}/03-unfinished.png` })
    await fault('archive')
    await drawer.locator('.review-foot .primary').click()
    await drawer.getByRole('alert').waitFor()
    assert(await drawer.locator('.review-close-row').count(), 'A rejected write stays on unfinished items')
    await drawer.locator('.review-foot .primary').click()
    await drawer.locator('.review-plan-row').first().waitFor()
    check('A partial close failure preserves choices and retries without repeating successful writes')
    assert.equal(await drawer.locator('.review-plan-row').count(), 2, 'Existing and moved plans already cover two goals')
    assert.equal(await drawer.locator('.review-existing').getByText('Continue this work', { exact: true }).count(), 1)
    await drawer.locator('.seed-title').first().fill('A realistic first step')
    await drawer.locator('.review-head .icon-button').click()
    await guide.getByRole('button').click()
    assert.equal(await drawer.locator('.seed-title').first().inputValue(), 'A realistic first step')
    await page.screenshot({ path: `${out}/04-plan-and-resume.png` })
    await fault('createPlan', true)
    await drawer.locator('.review-foot .primary').click()
    await drawer.getByRole('alert').waitFor()
    await page.screenshot({ path: `${out}/05-receipt-retry.png` })
    await drawer.getByRole('button', { name: '重试核对', exact: true }).click()
    await drawer.getByRole('alert').waitFor({ state: 'hidden' })
    await drawer.locator('.review-foot .primary').click()
    check('A lost plan reply is resolved from its receipt without creating duplicate tasks')
    if (combined) {
      await drawer.getByRole('textbox', { name: 'A realistic first step', exact: true }).fill('Start the new monthly plan this week')
      await page.screenshot({ path: `${out}/05-combined-week-plan.png` })
      await drawer.locator('.review-foot .primary').click()
    }
    await drawer.getByRole('heading', { name: '复盘完成', exact: true }).waitFor()
    const final = await page.evaluate(async fixture => ({ snapshot: await window.goalloom.getSnapshot(),
      kept: await window.goalloom.getItem(fixture.keep), moved: await window.goalloom.getItem(fixture.move), archived: await window.goalloom.getItem(fixture.archive) }), fixture)
    assert.equal(final.kept.item.placement.periodId, fixture.period.id)
    assert.equal(final.moved.item.placement.periodId, final.snapshot.periods.find(period => period.horizon === 'month').id)
    assert(final.archived.item.archivedAt)
    assert.equal(final.snapshot.items.filter(item => item.title === 'A realistic first step').length, 1)
    if (combined) {
      const parent = final.snapshot.items.find(item => item.title === 'A realistic first step')
      const child = final.snapshot.items.find(item => item.title === 'Start the new monthly plan this week')
      assert.equal(child.placement.horizon, 'week')
      assert(final.snapshot.relations.some(edge => edge.parentId === parent.id && edge.childId === child.id))
      check('Combined review creates a weekly step under the month plan just committed')
    }
    await page.screenshot({ path: `${out}/05-complete.png` })
    await drawer.locator('.review-foot .primary').click()
    await page.reload(); await page.locator('.board').waitFor()
    assert.equal(await guide.count(), 0)
    assert.equal(await month.locator('.backlog-entry').count(), 1)
    check('Decisions and drafts survive close/reopen; explicit destination, archive, retain and one uncovered goal commit correctly')
    check('Completion suppresses the unified guide and preserves access to retained backlog after reload')
  } else check('Monthly UI is outside this first-day scenario; historical API assertions still executed')
  assert.deepEqual(errors, [])
  report.ok = true
} catch (error) { report.error = String(error); throw error }
finally { await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); await app.close() }
