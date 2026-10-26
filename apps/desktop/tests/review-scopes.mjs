/**
 * [INPUT]: Built main/preload, a test-only native renderer, real or fixed workspace clock, month/combined fixtures and actual IPC/storage.
 * [OUTPUT]: Task markers, outline/title/choice evidence and monthly/weekly plans; fixed runs require both branches without date skips.
 * [POS]: Native component acceptance outside App entry eligibility; the renderer bridge and production clock controls stay unchanged.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir, cpus, release } from 'node:os'
import { spawnSync } from 'node:child_process'
import { build, createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { seedPreviewCache } from './fixtures/link-preview-cache.mjs'
import { verifyReviewOutline } from './fixtures/review-outline.mjs'
import { fixedReviewClock } from './fixtures/review-clock/build.mjs'

let fixed, server
const outlineOnly = process.argv.includes('--outline'), requestedFixed = process.argv.some(value => value.startsWith('--fixed-at'))
const evidenceRoot = resolve(outlineOnly ? 'output/tests/review-outline/month' : 'output/tests/review-scopes')
const out = requestedFixed ? join(evidenceRoot, 'runs', `fixed-${Date.now()}`) : evidenceRoot
await mkdir(out, { recursive: true })
const report = { ok: false, artifactRoot: out, scope: 'Native component harness: actual ReviewDrawer/Overview and production preload/main/SQLite; explicit review-period props bypass calendar entry only. No packaged/natural-date App entry acceptance.',
  clockScope: requestedFixed ? 'Test-only fixed workspace clock with actual observedAt' : 'Production real clock',
  host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model, machine: 'Physical/VM status unverified' }, scenarios: [] }
try {
  fixed = await fixedReviewClock(process.argv); report.fixedClock = fixed?.manifest
  await build({ configFile: false, build: { outDir: 'output/tests/build/review', emptyOutDir: false,
    lib: { entry: 'tests/fixtures/review-seed.ts', formats: ['cjs'], fileName: () => 'review-seed.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
  server = await createServer({ root: resolve('tests/fixtures/review-scopes'), configFile: false,
    plugins: [react(), tailwind()], server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve('.')] } } })
  await server.listen()
  for (const scope of outlineOnly ? ['month'] : process.argv.includes('--combined') ? ['both'] : ['month', 'both']) for (const skipMonth of scope === 'both' ? [false, true] : [false]) await run(scope, skipMonth)
  report.ok = true
} catch (error) { report.error = String(error); throw error }
finally {
  let cleanupError
  try { await server?.close() } catch (error) { cleanupError = error; report.serverCloseError = String(error) }
  try {
    if (fixed) { report.stability = await fixed.finish(); if (!report.stability.sourceStable) cleanupError ??= Error('Production source/build changed during fixed review acceptance') }
  } catch (error) { cleanupError ??= error; report.cleanupError = String(error) }
  if (cleanupError) report.ok = false
  try { await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)) } catch (error) { cleanupError ??= error; report.reportWriteError = String(error) }
  if (cleanupError && !report.error) throw cleanupError
}

async function run(scope, skipMonth) {
  const name = `${scope}${skipMonth ? '-skip-month' : ''}`, profile = await mkdtemp(join(tmpdir(), fixed ? 'goalloom-review-fixed-' : 'goalloom-review-scopes-'))
  let app, page
  const scenario = { scope, skipMonth, ok: false, checks: [] }; report.scenarios.push(scenario)
  const check = value => { scenario.checks.push(value); console.log(`✓ ${name}: ${value}`) }
  try {
    const seed = spawnSync(electronPath, ['output/tests/build/review/review-seed.cjs', profile, scope === 'both' ? 'scope-combined' : 'scope-month', ...(outlineOnly ? ['--outline'] : []), ...(fixed?.seedArguments ?? [])],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
    assert.equal(seed.status, 0, seed.stderr)
    await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
    await seedPreviewCache(profile)
    const fixture = JSON.parse(await readFile(join(profile, 'review-fixture.json'), 'utf8'))
    const env = { ...process.env, ELECTRON_RENDERER_URL: `${server.resolvedUrls.local[0]}?scope=${scope}` }; delete env.ELECTRON_RUN_AS_NODE
    const launch = () => electron.launch({ args: [fixed?.mainPath ?? '.', `--user-data-dir=${profile}`], env })
    app = await launch()
    page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow, shell }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)
      globalThis.scopeLinks = []; shell.openExternal = async url => { globalThis.scopeLinks.push(url) }
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    scenario.runtime = await page.evaluate(() => window.goalloom.getRuntime())
    if (fixed) {
      scenario.clock = { initial: await fixed.verify(app, page, fixture), expiredWrite: await fixed.expiredWrite(app, page, fixture) }
      await app.close(); app = await launch(); page = await app.firstWindow()
      page.on('pageerror', error => errors.push(error.message)); await page.getByRole('button', { name: 'Open review', exact: true }).waitFor()
      await page.emulateMedia({ reducedMotion: 'reduce' })
      scenario.clock.reopened = await fixed.verify(app, page, fixture)
      assert.equal(scenario.clock.reopened.generation, scenario.clock.initial.generation)
      check('Fixed main/worker/observedAt survives normal Electron quit/relaunch; real expired-period planning rejects without row or revision changes')
    }
    const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
    if (scope === 'both' && snapshot.periods.find(period => period.horizon === 'week').startAt !== snapshot.periods.find(period => period.horizon === 'month').startAt) {
      assert.equal(!!fixed, false, 'Fixed combined review must execute without a date skip')
      scenario.skipped = true
      scenario.reason = 'The month-start week has expired. Production planning rejects its destination; no clock or guard is replaced.'
      scenario.observedAt = snapshot.observedAt
      console.log(`Skipped ${name}: ${scenario.reason}`)
      return
    }
    await page.getByRole('button', { name: 'Open review', exact: true }).click()
    const drawer = page.locator('.review-drawer[open]')
    await drawer.locator('.review-body[aria-busy=false]').waitFor()
    if (outlineOnly) {
      await verifyReviewOutline({ page, fixture, out, scenario, check, month: true })
      assert.deepEqual(errors, [])
      scenario.ok = true
      return
    }
    await drawer.locator('.review-goal-records summary').first().click()
    const record = drawer.locator('.review-records li').filter({ hasText: 'September finished work' })
    await record.locator('.link-inline[data-status=ready]').waitFor()
    const geometry = await drawer.locator('.review-records li:visible').evaluateAll(rows => rows.map(row => {
      const marker = row.querySelector('.review-todo-check'), title = row.querySelector('.review-item-title'), box = marker.getBoundingClientRect(), text = title.getBoundingClientRect()
      return { checked: marker.dataset.checked, size: box.width, expected: parseFloat(getComputedStyle(marker).getPropertyValue('--check-size')), hidden: marker.getAttribute('aria-hidden'), tabIndex: marker.tabIndex,
        offset: box.top + box.height / 2 - (text.top + parseFloat(getComputedStyle(title).lineHeight) / 2), ring: marker.style.getPropertyValue('--flow-ring') }
    }))
    assert(geometry.every(row => row.size === row.expected && row.hidden === 'true' && row.tabIndex === -1 && Math.abs(row.offset) < 1))
    assert(geometry.some(row => row.checked === 'true') && geometry.some(row => row.checked === 'false' && row.ring))
    assert.equal(await record.locator('button').count(), 0)
    await record.locator('.review-item-title').click({ position: { x: 2, y: 4 } })
    assert.equal(await page.locator('dialog.detail').count(), 0)
    assert.equal(await drawer.locator('.review-record-check').count(), 0)
    scenario.recordGeometry = geometry
    await drawer.screenshot({ path: `${out}/${name}-records.png` })
    check('Monthly records use original checked/unchecked flow markers, align to text and render readonly saved URL titles')
    await drawer.locator('.review-foot .primary').click()
    const closing = drawer.locator('.review-close-row')
    await closing.first().waitFor()
    assert.equal(await closing.locator('small').count(), 0)
    assert.equal(await drawer.locator('.review-bulk').count(), 0)
    assert.equal(await closing.locator('.check').count(), await closing.count())
    assert((await closing.getByRole('combobox').allTextContents()).every(value => /^移入\S/.test(value)))
    assert((await closing.getByRole('combobox').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))).every(value => value === 30))
    // Keep the backlog outside the new month so all uncovered-goal candidates remain available.
    for (let row = 0; row < await closing.count(); row++) {
      await closing.nth(row).getByRole('combobox').click()
      await drawer.getByRole('option', { name: '留在原处', exact: true }).click()
    }
    await drawer.locator('.review-foot .primary').click()
    const plans = drawer.locator('.review-plan-row')
    await plans.first().waitFor()
    assert.equal(await drawer.locator('.review-existing').count(), 0)
    assert((await plans.getByRole('combobox').allTextContents()).every(value => value === '排入本月'))
    const monthTitle = `Scoped monthly step ${name}`
    await plans.first().locator('.seed-title').fill(monthTitle)
    assert.equal(await plans.first().locator('.seed-title').evaluate(input => getComputedStyle(input).outlineStyle), 'none')
    await drawer.locator('.review-head .icon-button').click()
    await page.getByRole('button', { name: 'Open review', exact: true }).click()
    await drawer.locator('.review-body[aria-busy=false]').waitFor()
    assert.equal(await plans.first().locator('.seed-title').inputValue(), monthTitle)
    await drawer.screenshot({ path: `${out}/${name}-month-plan.png` })
    const revision = () => page.evaluate(() => window.goalloom.getSnapshot().then(snapshot => snapshot.workspace.revision))
    const before = await revision()
    await drawer.getByRole('button', { name: skipMonth ? '不排入' : /^排入 1 项/, exact: !skipMonth }).click()
    if (scope === 'both') {
      await drawer.getByRole('heading', { name: '安排本周', exact: true }).waitFor()
      assert.equal(await page.locator('[data-component-harness]').getAttribute('data-completed'), '0')
      if (skipMonth) assert.equal(await revision(), before)
      const weeklyTitle = `Scoped weekly step ${name}`
      await plans.first().locator('.seed-title').fill(weeklyTitle)
      await drawer.screenshot({ path: `${out}/${name}-week-plan.png` })
      await drawer.locator('.review-foot .primary').click()
      scenario.weeklyTitle = weeklyTitle
    }
    await drawer.waitFor({ state: 'detached' })
    assert.equal(await page.locator('[data-component-harness]').getAttribute('data-completed'), '1')
    const final = await page.evaluate(() => window.goalloom.getSnapshot())
    assert.equal(final.items.filter(item => item.title === monthTitle).length, skipMonth ? 0 : 1)
    if (scope === 'both') assert.equal(final.items.filter(item => item.title === scenario.weeklyTitle).length, 1)
    assert.deepEqual(errors, [])
    check('Closing defaults/compact custom choices, borderless month drafts and manual resume share weekly rules; combined month continues into week and completion fires once')
    scenario.ok = true
  } catch (error) {
    scenario.error = String(error)
    if (page && !page.isClosed()) await page.screenshot({ path: `${out}/${name}-failure.png` }).catch(() => {})
    throw error
  } finally {
    let cleanupError
    try { await app?.close() } catch (error) { cleanupError = error; scenario.closeError = String(error) }
    try { await rm(profile, { recursive: true, force: true }) } catch (error) { cleanupError ??= error; scenario.cleanupError = String(error) }
    if (cleanupError) { scenario.ok = false; if (!scenario.error) throw cleanupError }
  }
}
