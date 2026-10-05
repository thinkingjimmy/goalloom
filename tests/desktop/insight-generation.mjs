/**
 * [INPUT]: Built Electron main/preload, development or built renderer, isolated profiles, an explicit week-start choice and synthetic provider responses.
 * [OUTPUT]: Repeatable generation reports and screenshots (onboarding connection, Settings › AI services, breakpoint loading/completion/fallback, drafting, reviews) in output/tests/insight/generation/.
 * [POS]: Desktop acceptance of the AI-service onboarding path, per-feature switches, drafting and review persistence/refresh/restart/replacement through real IPC/storage; provider transport is controlled.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { finishSetup } from './fixtures/setup.mjs'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, release, tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { createServer, build } from 'vite'
import { spawnSync } from 'node:child_process'
import electronPath from 'electron'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { pollPage } from './fixtures/poll.mjs'
import { verifyReviewDrafts } from './fixtures/review-drafts.mjs'

const out = resolve('output/tests/insight/generation')
await mkdir(out, { recursive: true })
await build({ configFile: false, build: { outDir: 'output/tests/build/review', emptyOutDir: false,
  lib: { entry: 'tests/desktop/fixtures/review-seed.ts', formats: ['cjs'], fileName: () => 'review-seed.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
const modes = process.argv.includes('--development') ? ['development'] : ['development', 'production']
for (const mode of modes) await run(mode)

async function run(mode) {
  const profile = await mkdtemp(join(tmpdir(), 'Goalloom generation regression '))
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  let server, application, page
  const report = { mode, ok: false, scope: 'Source Electron, real preload/main/SQLite, synthetic provider transport, isolated profile; no packaged or Windows acceptance', host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model }, checks: [] }
  const check = label => { report.checks.push(label); console.log(`✓ ${mode}: ${label}`) }
  try {
    if (mode === 'development') {
      server = await createServer({ root: resolve('src/renderer'), configFile: false, cacheDir: resolve('node_modules/.vite-insight'), plugins: [react(), tailwind()],
        server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve('.')] } } })
      await server.listen()
      env.ELECTRON_RENDERER_URL = server.resolvedUrls.local[0]
    }
    application = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
    page = await application.firstWindow()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900))
    await installFixture(application)
    const weekStart = await page.evaluate(() => new Date().getDay() || 7)
    await finishSetup(page, { weekStart, skipAi: false })
    // Onboarding step 3 through the real UI: one OpenRouter key is tested per capability and turns on both features.
    await page.getByRole('button', { name: '连接 AI 服务', exact: true }).click()
    await page.getByLabel('OpenRouter API Key').fill('synthetic-key-only')
    await page.getByRole('checkbox', { name: '我同意把智能输入和洞察需要的内容发送给 OpenRouter' }).check()
    await page.getByRole('button', { name: '测试并开启', exact: true }).click()
    await page.getByRole('heading', { name: '已连接 OpenRouter', exact: true }).waitFor()
    await page.getByText('智能输入已开启', { exact: true }).waitFor()
    await page.getByText('洞察已开启', { exact: true }).waitFor()
    await page.screenshot({ path: `${out}/${mode}-onboarding-connected.png` })
    check('onboarding tests one OpenRouter key per capability and turns on smart input and insight')
    await page.getByRole('button', { name: '进入看板', exact: true }).click()
    const board = page.getByRole('main', { name: '时间看板' })
    await board.waitFor()
    report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
    await page.evaluate(async () => {
      const generation = (await window.goalloom.getSnapshot()).workspace.generation
      for (let index = 1; index <= 7; index++) {
        const reply = await window.goalloom.execute({ type: 'create', title: `Synthetic plan ${index}`, horizon: 'month', generation, operationId: crypto.randomUUID() })
        if (!reply.ok) throw Error(reply.message)
      }
    })
    await page.reload()
    await board.waitFor()
    const setMode = value => application.evaluate((_, value) => { globalThis.generationFixture.mode = value }, value)
    const calls = () => application.evaluate(() => globalThis.generationFixture.calls)
    const revision = () => page.evaluate(async () => (await window.goalloom.getSnapshot()).workspace.revision)
    const beforeSettings = await revision()
    await page.keyboard.press('ControlOrMeta+,')
    const settings = page.locator('dialog.settings-modal')
    const nav = settings.getByRole('navigation', { name: '设置分类' })
    await nav.getByRole('button', { name: 'AI 服务', exact: true }).click()
    const openrouter = settings.locator('.smart-provider').filter({ hasText: 'OpenRouter' })
    await openrouter.getByText('✓ Jev', { exact: true }).waitFor()
    await openrouter.getByText('✓ DeepSeek', { exact: true }).waitFor()
    await openrouter.getByText(/智能输入、洞察正在使用/).waitFor()
    assert.match(await nav.getByRole('button', { name: 'AI 服务', exact: true }).innerText(), /1 个已连接/)
    await page.screenshot({ path: `${out}/${mode}-settings-ai.png` })
    await nav.getByRole('button', { name: '洞察', exact: true }).click()
    await settings.getByText('已启用 · 由 OpenRouter 处理', { exact: true }).waitFor()
    assert.equal(await settings.getByRole('radio', { name: /^OpenRouter/ }).getAttribute('aria-checked'), 'true')
    await page.screenshot({ path: `${out}/${mode}-settings.png` })
    const insightSwitch = settings.getByRole('switch', { name: '洞察', exact: true })
    await insightSwitch.click()
    await settings.getByText('未启用 · 断点和复盘照常显示，只是不起草文字', { exact: true }).waitFor()
    const features = () => page.evaluate(async () => {
      const reply = await window.goalloom.smart({ type: 'status', generation: (await window.goalloom.getSnapshot()).workspace.generation })
      return reply.type === 'status' ? { smart: reply.status.features.smart.enabled, insight: reply.status.features.insight.enabled } : null
    })
    assert.deepEqual(await features(), { smart: true, insight: false }, 'insight switches off without touching smart input')
    await insightSwitch.click()
    await settings.getByText('已启用 · 由 OpenRouter 处理', { exact: true }).waitFor()
    await nav.getByRole('button', { name: '智能输入', exact: true }).click()
    await settings.getByText('已启用 · 由 OpenRouter 处理', { exact: true }).waitFor()
    assert.deepEqual(await features(), { smart: true, insight: true })
    // Batch drafting needs the ordinary empty card; the unified review guide owns that space while reminders are enabled.
    await nav.getByRole('button', { name: '洞察', exact: true }).click()
    await settings.getByRole('switch', { name: '周复盘 · 月复盘', exact: true }).click()
    assert.equal(await revision(), beforeSettings)
    assert.equal((await calls()).length, 0, 'capability tests are not drafting calls')
    check('Settings › AI services shows the key per capability; insight switches off and on independently without workspace writes')
    await page.keyboard.press('Escape')
    await settings.waitFor({ state: 'detached' })

    const draftButton = board.locator('[data-horizon="week"]').getByRole('button', { name: '起草本周待办', exact: true })
    const dialog = page.getByRole('dialog', { name: '新建', exact: true })
    const settled = () => pollPage(page, () => document.querySelectorAll('.seed-title').length === 7 && ![...document.querySelectorAll('.seed-title')].some(input => input.placeholder === '正在起草…'), undefined, { timeout: 5000, label: 'batch leaves loading' })
    let before = (await calls()).length
    await draftButton.click()
    await dialog.locator('.seed-title').first().fill('User edited step')
    await dialog.locator('.seed-row').nth(6).getByRole('checkbox').uncheck()
    await settled()
    assert.equal((await calls()).length - before, 1, 'one model request across effect replay')
    assert.equal(await dialog.locator('.seed-title').first().inputValue(), 'User edited step')
    assert.equal(await dialog.locator('.seed-row').nth(6).getByRole('checkbox').isChecked(), false)
    assert.equal(await dialog.locator('.seed-title').evaluateAll(inputs => inputs.filter(input => input.value.trim()).length), 7)
    assert.equal(await dialog.getByRole('button', { name: /创建 6 项/ }).isEnabled(), true)
    await page.screenshot({ path: `${out}/${mode}-batch.png` })
    check('seven drafts settle once, preserve typed text and unchecked rows, and enable creation')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })

    for (const fault of ['unavailable', 'malformed', 'bridge-failure']) {
      await setMode(fault)
      await draftButton.click()
      await settled()
      await dialog.getByRole('alert').waitFor()
      await dialog.locator('.seed-title').first().fill('Manual fallback step')
      assert.equal(await dialog.getByRole('button', { name: /创建 1 项/ }).isEnabled(), true)
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
    }
    check('provider, malformed-response and bridge failures show feedback and allow manual entry')
    await setMode('payment')
    await draftButton.click()
    await settled()
    await dialog.getByRole('alert').waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    await setMode('ready')
    await page.keyboard.press('ControlOrMeta+,')
    const issueSettings = page.locator('dialog.settings-modal'), issueNav = issueSettings.getByRole('navigation', { name: '设置分类' })
    await issueNav.getByRole('button', { name: 'AI 服务', exact: true }).getByText('需处理', { exact: true }).waitFor()
    await issueNav.getByRole('button', { name: '洞察', exact: true }).click()
    await issueSettings.getByText('暂停发送 · OpenRouter 需要处理', { exact: true }).waitFor()
    await issueSettings.getByRole('button', { name: '去 AI 服务处理 →', exact: true }).click()
    const issueRow = issueSettings.locator('.smart-provider').filter({ hasText: 'OpenRouter' })
    await issueRow.getByText(/OpenRouter 要求在其官方页面处理付款方式/).waitFor()
    await page.screenshot({ path: `${out}/${mode}-settings-ai-issue.png` })
    await issueRow.getByRole('button', { name: '重新测试', exact: true }).click()
    await issueRow.getByText(/智能输入、洞察正在使用/).waitFor()
    assert.doesNotMatch(await issueNav.getByRole('button', { name: 'AI 服务', exact: true }).innerText(), /需处理/)
    check('an account-level failure shows on the provider and the feature header until a retest clears it')
    await page.keyboard.press('Escape')
    await issueSettings.waitFor({ state: 'detached' })
    await setMode('ready')
    await draftButton.click()
    await dialog.locator('.seed-title').first().waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    before = (await calls()).length
    await draftButton.click()
    await settled()
    const newCalls = (await calls()).slice(before)
    assert.equal(newCalls.length, 1)
    assert.equal(await dialog.locator('.seed-title').first().inputValue(), `Draft ${newCalls[0].sequence} step 1`)
    await dialog.getByRole('button', { name: /创建 7 项/ }).click()
    await dialog.waitFor({ state: 'detached' })
    const written = await page.evaluate(async () => {
      const state = await window.goalloom.getSnapshot()
      return { items: state.items.filter(item => item.placement.horizon === 'week').length, relations: state.relations.length }
    })
    assert.deepEqual(written, { items: 7, relations: 7 })
    check('reopened composer ignores old results and commits seven linked steps')

    report.loading = await verifyBreakpointLoading(page, application, mode, check)

    await page.keyboard.press('ControlOrMeta+,')
    await nav.getByRole('button', { name: '洞察', exact: true }).click()
    await settings.getByRole('switch', { name: '周复盘 · 月复盘', exact: true }).click()
    await page.keyboard.press('Escape')
    await settings.waitFor({ state: 'detached' })
    const beforeHistoryCalls = await calls()
    await application.close()
    const historySeed = spawnSync(electronPath, ['output/tests/build/review/review-seed.cjs', profile, 'cache'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
    assert.equal(historySeed.status, 0, historySeed.stderr)
    application = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
    page = await application.firstWindow()
    await installFixture(application, beforeHistoryCalls)
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('.board').waitFor()

    const reviewCount = async () => (await calls()).filter(call => call.kind === 'review').length
    const drawer = () => page.locator('.review-drawer[open]')
    const openReview = async () => {
      await page.locator('[data-review]').click()
      await drawer().locator('.review-summary[aria-busy="false"]').waitFor()
    }
    const closeReview = async () => {
      if (!await drawer().count()) return
      await drawer().locator('.review-head').getByRole('button', { name: '关闭', exact: true }).click()
      await drawer().waitFor({ state: 'hidden' })
    }
    const headline = () => drawer().locator('.review-headline').innerText()
    const refreshSummary = () => drawer().getByRole('button', { name: '重新生成', exact: true }).click()
    const cacheRevision = await revision()
    before = await reviewCount()
    assert.equal(await page.locator('[data-review]').count(), 1, 'calendar makes the review available on every test date')
    const reviewColumn = page.locator('.board-column').filter({ has: page.locator('[data-review]') })
    await reviewColumn.scrollIntoViewIfNeeded()
    await page.mouse.move(1, 1)
    const reviewGeometry = await reviewColumn.evaluate(column => {
      const box = node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, bottom: r.bottom } }
      const review = column.querySelector('[data-review]'), header = column.querySelector('.column-header'), guide = column.querySelector('.review-guide')
      return { header: box(header), guide: box(guide), review: box(review), competingHints: column.querySelectorAll('.review-entry, .backlog-entry, .insight-empty, .empty-column').length, opacity: getComputedStyle(review).opacity }
    })
    assert(reviewGeometry.guide.top >= reviewGeometry.header.bottom - 1, 'The unified review guide sits below the column header')
    assert(reviewGeometry.review.top >= reviewGeometry.guide.top && reviewGeometry.review.bottom <= reviewGeometry.guide.bottom, 'The review action stays inside its guide')
    assert.equal(reviewGeometry.competingHints, 0, 'The guide replaces separate review, backlog and empty hints')
    assert.equal(reviewGeometry.opacity, '1', 'Review remains visible when navigation recedes')
    await reviewColumn.screenshot({ path: `${out}/${mode}-review-guide-idle.png` })
    report.reviewHeader = reviewGeometry
    check('weekly and monthly reviews share one visible guide below the header without competing hints')
    await page.locator('[data-review]').click()
    await drawer().locator('.review-summary').waitFor()
    await closeReview()
    await openReview()
    assert.equal(await reviewCount(), before + 1, 'pending request survives close/reopen and effect replay')
    const initialSummary = await headline()
    await closeReview()
    await openReview()
    assert.equal(await headline(), initialSummary)
    assert.equal(await reviewCount(), before + 1)
    await drawer().getByRole('button', { name: /下一步/ }).click()
    await drawer().getByRole('button', { name: '上一步', exact: true }).click()
    await drawer().locator('.review-summary[aria-busy="false"]').waitFor()
    assert.equal(await headline(), initialSummary)
    assert.equal(await reviewCount(), before + 1)
    check('review pending work, reopening and step navigation share one result')

    await refreshSummary()
    assert.equal(await headline(), initialSummary, 'refresh keeps the previous result visible')
    await drawer().locator('.review-summary[aria-busy="false"]').waitFor()
    const refreshedSummary = await headline()
    assert.notEqual(refreshedSummary, initialSummary)
    assert.equal(await reviewCount(), before + 2)
    await setMode('unavailable')
    await refreshSummary()
    await drawer().getByRole('alert').waitFor()
    assert.equal(await headline(), refreshedSummary)
    await page.screenshot({ path: `${out}/${mode}-review-refresh-failure.png` })
    await closeReview()
    await openReview()
    assert.equal(await headline(), refreshedSummary)
    assert.equal(await drawer().getByRole('alert').count(), 0)
    assert.equal(await reviewCount(), before + 3, 'failed refresh preserves the persisted success and offline reopen makes no call')
    await setMode('ready')
    await closeReview()
    check('explicit refresh replaces on success and preserves the summary on failure or offline reopen')

    const previousCalls = await calls()
    await application.close()
    application = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
    page = await application.firstWindow()
    await installFixture(application, previousCalls)
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('main', { name: '时间看板' }).waitFor()
    await openReview()
    assert.equal(await headline(), refreshedSummary)
    assert.equal(await reviewCount(), before + 3, 'real process restart reuses the persisted summary')
    await closeReview()
    check('successful summary survives a full Electron process restart')

    const changePreference = async (name, tab) => {
      if (await drawer().count()) await closeReview()
      await page.keyboard.press('ControlOrMeta+,')
      const pane = page.locator('dialog.settings-modal')
      await pane.getByRole('button', { name: '洞察', exact: true }).click()
      await pane.getByRole('tab', { name: tab, exact: true }).click()
      await pane.getByRole('radio', { name, exact: true }).click()
      await page.keyboard.press('Escape')
      await pane.waitFor({ state: 'detached' })
    }
    await changePreference('半天', '拆解')
    await openReview()
    assert.equal(await headline(), refreshedSummary)
    assert.equal(await reviewCount(), before + 3, 'draft-only preferences do not invalidate a review')
    await changePreference('温和', '复盘')
    assert.equal(await reviewCount(), before + 3, 'editing preferences behind the drawer does not generate on each change')
    await closeReview()
    await openReview()
    assert.equal(await reviewCount(), before + 4)
    assert.notEqual(await headline(), refreshedSummary)
    assert.equal(await revision(), cacheRevision, 'summary cache and preferences never write workspace data')
    await closeReview()
    check('review preferences invalidate summaries; draft preferences do not, without workspace writes')

    const editPlan = async title => {
      await page.evaluate(async title => {
        const snapshot = await window.goalloom.getSnapshot()
        const records = await window.goalloom.listItems({ type: 'list', view: 'search', query: 'Historical', offset: 0, limit: 100 })
        const item = records.items.find(item => item.placement.horizon === (new Date().getDate() === 1 ? 'month' : 'week')) ?? records.items[0]
        const reply = await window.goalloom.execute({ type: 'edit', generation: snapshot.workspace.generation, operationId: crypto.randomUUID(), itemId: item.id,
          expectedVersion: item.version, title: `Historical ${title}`, description: '', dueDate: null })
        if (!reply.ok) throw Error(reply.message)
      }, title)
      await page.reload()
      await page.getByRole('main', { name: '时间看板' }).waitFor()
    }
    await editPlan('Updated summary context')
    await openReview()
    assert.equal(await reviewCount(), before + 5)
    await closeReview()
    await setMode('unavailable')
    await editPlan('Changed context with a failed first attempt')
    await openReview()
    assert.equal(await drawer().locator('.review-headline').count(), 0, 'old context is not shown as current')
    await drawer().getByRole('alert').waitFor()
    await closeReview()
    await setMode('ready')
    await openReview()
    assert.equal(await reviewCount(), before + 7, 'failed initial attempt is not cached')
    await closeReview()
    check('board changes invalidate old summaries and failed initial requests can be retried')

    await page.evaluate(() => localStorage.setItem('goalloom.review-summaries', 'invalid cache'))
    await page.reload()
    await page.getByRole('main', { name: '时间看板' }).waitFor()
    await openReview()
    assert.equal(await reviewCount(), before + 8)
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('goalloom.review-summaries')))
    assert.equal(stored.entries.length, 1)
    assert.deepEqual(Object.keys(stored.entries[0]).sort(), ['fingerprint', 'key', 'value'])
    assert.match(stored.entries[0].fingerprint, /^[a-f0-9]{64}$/)
    assert(!JSON.stringify(stored).includes('synthetic-key-only'))
    await page.screenshot({ path: `${out}/${mode}-review-cached.png` })
    check('corrupt storage recovers and persistence contains only period keys, prompt hashes and bounded results')

    const beforeRace = await reviewCount()
    await setMode('slow')
    await refreshSummary()
    await application.evaluate(async (_, expected) => {
      const deadline = Date.now() + 5000
      while (globalThis.generationFixture.calls.filter(call => call.kind === 'review').length < expected) {
        if (Date.now() > deadline) throw Error('Refresh did not start')
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    }, beforeRace + 1)
    await closeReview()
    await setMode('ready')
    await changePreference('直接', '复盘')
    await openReview()
    const latestSummary = await headline()
    await application.evaluate(async () => {
      while (globalThis.generationFixture.calls.some(call => !call.settled)) await new Promise(resolve => setTimeout(resolve, 20))
    })
    await closeReview()
    await openReview()
    assert.equal(await headline(), latestSummary)
    assert.equal(await reviewCount(), beforeRace + 2, 'late old response cannot overwrite the newer cached context')
    check('late requests for older preferences cannot replace the newer period summary')

    await page.evaluate(() => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key === 'goalloom.review-summaries') throw new DOMException('Synthetic full storage', 'QuotaExceededError')
        return original.call(this, key, value)
      }
      globalThis.restoreSummaryStorage = () => { Storage.prototype.setItem = original }
    })
    await refreshSummary()
    await drawer().locator('.review-summary[aria-busy="false"]').waitFor()
    const sessionSummary = await headline()
    assert.notEqual(sessionSummary, latestSummary)
    await closeReview()
    await openReview()
    assert.equal(await headline(), sessionSummary)
    assert.equal(await reviewCount(), beforeRace + 3)
    assert.equal(await drawer().getByRole('alert').count(), 0)
    await page.evaluate(() => globalThis.restoreSummaryStorage())
    check('full local storage keeps generation and session reuse working')

    await page.evaluate(async () => {
      const generation = (await window.goalloom.getSnapshot()).workspace.generation
      for (const horizon of ['cycle', 'month']) {
        const reply = await window.goalloom.execute({ type: 'create', title: `Pending planning source ${horizon}`, horizon, flowColor: horizon === 'cycle' ? 2 : 3, generation, operationId: crypto.randomUUID() })
        if (!reply.ok) throw Error(reply.message)
      }
    })
    await application.evaluate(() => { globalThis.generationFixture.hold = true })
    let pendingPlanChecked = false
    while (await drawer().count()) {
      if (await drawer().locator('.review-plan-list').count() && !pendingPlanChecked) {
        await drawer().locator('.seed-title[placeholder="正在起草…"]').first().waitFor()
        assert.equal(await drawer().getByRole('button', { name: '不排入', exact: true }).isEnabled(), true, 'Skip remains available while drafting')
        assert.equal(await drawer().locator('.review-foot .primary').isDisabled(), true)
        await drawer().screenshot({ path: `${out}/${mode}-planning-pending-skip.png` })
        report.reviewDrafts = await verifyReviewDrafts({ page, application, mode, out, calls, check, changePreference })
        pendingPlanChecked = true
        check('planning keeps the explicit skip available during a held draft and resumes normal confirmation after release')
      }
      const previousStep = await drawer().locator('.review-steps [aria-current=step]').textContent()
      await drawer().locator('.review-foot .primary').click()
      await page.waitForFunction(previous => (document.querySelector('dialog.review-drawer[open] [aria-current=step]')?.textContent ?? 'done') !== previous, previousStep)
    }
    assert(pendingPlanChecked, 'The calendar fixture exercises pending planning controls')
    await drawer().waitFor({ state: 'detached' })
    await page.screenshot({ path: `${out}/${mode}-review.png` })
    await closeReview()
    assert.equal(await page.locator('[data-review]').count(), 0)
    check('review finishes by closing the panel and immediately clearing its entry')

    await page.keyboard.press('ControlOrMeta+,')
    const recovery = page.locator('dialog.settings-modal')
    await recovery.getByRole('button', { name: '备份与恢复', exact: true }).click()
    await recovery.getByRole('button', { name: '重置', exact: true }).click()
    await recovery.getByRole('button', { name: '创建保护备份并继续', exact: true }).click()
    await recovery.getByText('已创建并校验', { exact: true }).waitFor()
    await recovery.getByRole('checkbox').check()
    await recovery.getByRole('button', { name: '重置并重新配置' }).click()
    await page.locator('.calendar-modes').waitFor()
    const afterReset = await page.evaluate(() => JSON.parse(localStorage.getItem('goalloom.review-summaries')))
    assert.notEqual(afterReset.generation, stored.generation)
    assert.deepEqual(afterReset.entries, [])
    const afterDraftReset = await page.evaluate(() => JSON.parse(localStorage.getItem('goalloom.review-drafts')))
    assert.notEqual(afterDraftReset.generation, report.reviewDrafts.storage.generation)
    assert.deepEqual(afterDraftReset.entries, [])
    check('verified workspace reset clears persisted summaries for the old generation')
    assert.deepEqual(errors, [])
    report.calls = await calls()
    assert.deepEqual(await application.evaluate(() => globalThis.generationFixture.bridgeErrors), [])
    for (const call of report.calls) {
      assert.deepEqual(call.reasoning, { enabled: false })
      assert.deepEqual(call.format, { type: 'json_object' })
    }
    report.ok = true
  } catch (error) {
    report.error = error.message
    report.nativeWindow = await application?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getContentBounds() }))).catch(() => null)
    report.document = await page?.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML, viewport: { width: innerWidth, height: innerHeight } })).catch(() => null)
    if (page && !page.isClosed()) await page.screenshot({ path: `${out}/${mode}-failure.png` }).catch(() => {})
    throw error
  } finally {
    await writeFile(`${out}/${mode}-report.json`, JSON.stringify(report, null, 2))
    await application?.close()
    await server?.close()
    await rm(profile, { recursive: true, force: true })
  }
}

async function verifyBreakpointLoading(page, application, mode, check) {
  const ids = await page.evaluate(async () => {
    const ids = {}, generation = (await window.goalloom.getSnapshot()).workspace.generation
    for (const [key, title, horizon, parent] of [
      ['root', 'Synthetic loading flow', 'cycle', null], ['month', 'Synthetic loading month', 'month', 'root'],
      ['week', 'Synthetic loading week', 'week', 'month'], ['otherWeek', 'Synthetic loading sibling week', 'week', 'month'],
      ['day', 'Synthetic direct day child', 'day', 'month'],
    ]) {
      const parentId = ids[parent] ?? null
      const expectedParentVersion = (await window.goalloom.getSnapshot()).items.find(item => item.id === parentId)?.version ?? null
      const reply = await window.goalloom.execute({ type: 'create', title, horizon, parentId, expectedParentVersion, flowColor: key === 'root' ? 0 : null, generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw Error(reply.message)
      ids[key] = reply.result.itemId
    }
    return ids
  })
  await page.reload()
  await page.getByRole('button', { name: '只看 Synthetic loading flow', exact: true }).click()
  await page.locator(`#item-${ids.week}`).scrollIntoViewIfNeeded()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const gap = page.locator(`.breakpoint[data-spot-key="gap:${ids.week}"]`)
  const otherGap = page.locator(`.breakpoint[data-spot-key="gap:${ids.otherWeek}"]`)
  const dialog = page.getByRole('dialog', { name: '新建', exact: true })
  const hold = responseMode => application.evaluate((_, responseMode) => {
    globalThis.generationFixture.mode = responseMode
    globalThis.generationFixture.hold = true
  }, responseMode)
  const release = () => application.evaluate(() => {
    const fixture = globalThis.generationFixture
    fixture.hold = false
    for (const resolve of fixture.waiters.splice(0)) resolve()
  })
  const appearance = button => button.evaluate(async node => {
    await Promise.all(node.getAnimations().filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime)).map(animation => animation.finished))
    const style = getComputedStyle(node)
    return { background: style.backgroundColor, color: style.color, icon: [...node.querySelectorAll('path')].map(path => path.getAttribute('d')) }
  })
  const pending = async button => {
    await button.locator('svg').waitFor()
    await page.waitForFunction(key => document.querySelector(`.breakpoint[data-spot-key="${key}"]`)?.getAttribute('aria-busy') === 'true', await button.getAttribute('data-spot-key'))
    await application.evaluate(async () => {
      const deadline = Date.now() + 5000
      while (!globalThis.generationFixture.waiters.length) {
        if (Date.now() > deadline) throw Error('Breakpoint request did not reach the held provider')
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    })
    return button.evaluate(async node => {
      const svg = node.querySelector('svg'), style = getComputedStyle(node)
      const before = getComputedStyle(svg).transform
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const animation = svg.getAnimations()[0]
      return { disabled: node.disabled, opacity: style.opacity, background: style.backgroundColor, color: style.color, expanded: node.dataset.expanded, icon: [...svg.querySelectorAll('path')].map(path => path.getAttribute('d')),
        animation: animation?.animationName, iterations: animation?.effect.getTiming().iterations === Infinity,
        from: before, to: getComputedStyle(svg).transform }
    })
  }
  await gap.hover()
  const idle = await appearance(gap)
  await hold('ready')
  await gap.click()
  const loading = await pending(gap)
  assert.equal(loading.disabled, true)
  assert.equal(loading.opacity, '1', 'The active action keeps its colour instead of inheriting disabled opacity')
  assert.equal(loading.background, idle.background)
  assert.equal(loading.color, idle.color)
  assert.equal(loading.expanded, 'true')
  assert.notDeepEqual(loading.icon, idle.icon)
  assert.equal(loading.animation, 'breakpoint-spin')
  assert.equal(loading.iterations, true)
  assert.notEqual(loading.from, loading.to, 'The loading glyph rotates across rendered frames')
  assert.equal(await otherGap.isDisabled(), true, 'Other actions cannot start during generation')
  await gap.evaluate(node => node.click())
  await page.mouse.move(10, 10)
  assert.equal(await gap.getAttribute('data-expanded'), 'true', 'Pending feedback survives a hover exit')
  await page.screenshot({ path: `${out}/${mode}-breakpoint-loading.png` })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await gap.locator('svg').evaluate(node => getComputedStyle(node).animationName), 'none')
  assert.equal(await gap.getAttribute('aria-busy'), 'true')
  assert.equal(await gap.locator('svg').isVisible(), true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await release()
  await gap.waitFor({ state: 'detached' })
  assert.equal(await page.locator(`.breakpoint[data-spot-key$=":${ids.month}"]`).count(), 0, 'A month with direct children has no intermediate-milestone action')
  const created = await page.evaluate(async parentId => {
    const state = await window.goalloom.getSnapshot()
    return state.relations.filter(edge => edge.parentId === parentId).map(edge => state.items.find(item => item.id === edge.childId))
  }, ids.week)
  assert.equal(created.length, 1, 'Repeated clicks create only one next step')
  assert.equal(created[0].placement.horizon, 'day')
  assert.equal(await page.locator('.breakpoint[aria-busy="true"]').count(), 0)
  await page.screenshot({ path: `${out}/${mode}-breakpoint-complete.png` })
  check('next-step loading rotates at full colour, remains visible after hover exit, respects reduced motion and creates once')

  await otherGap.hover()
  const fallbackIdle = await appearance(otherGap)
  await hold('unavailable')
  await otherGap.click()
  const fallback = await pending(otherGap)
  assert.equal(fallback.opacity, '1')
  assert.equal(fallback.background, fallbackIdle.background)
  assert.equal(fallback.color, fallbackIdle.color)
  assert.equal(fallback.animation, 'breakpoint-spin')
  assert.notEqual(fallback.from, fallback.to)
  await page.screenshot({ path: `${out}/${mode}-breakpoint-failure-loading.png` })
  await release()
  await dialog.getByRole('alert').waitFor()
  assert.equal(await otherGap.getAttribute('aria-busy'), 'false')
  assert.equal(await otherGap.isEnabled(), true)
  assert.deepEqual(await otherGap.locator('svg').evaluate(node => [...node.querySelectorAll('path')].map(path => path.getAttribute('d'))), idle.icon)
  assert.equal(await otherGap.locator('svg').evaluate(node => getComputedStyle(node).animationName), 'none')
  await page.screenshot({ path: `${out}/${mode}-breakpoint-fallback.png` })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  check('next-step loading clears when a provider failure opens manual entry')

  const before = await application.evaluate(() => globalThis.generationFixture.calls.length)
  await otherGap.click({ modifiers: ['Shift'] })
  await dialog.waitFor()
  assert.equal(await otherGap.getAttribute('aria-busy'), 'false')
  assert.equal(await page.locator('.breakpoint[aria-busy="true"]').count(), 0)
  assert.equal(await application.evaluate(() => globalThis.generationFixture.calls.length), before)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  const directPreserved = await page.evaluate(async ids => (await window.goalloom.getSnapshot()).relations.some(edge => edge.parentId === ids.month && edge.childId === ids.day), ids)
  assert.equal(directPreserved, true, 'Next-step generation never reparents an existing direct day child')
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await page.evaluate(async itemIds => {
    for (const itemId of itemIds.reverse()) {
      const state = await window.goalloom.getSnapshot(), item = state.items.find(item => item.id === itemId)
      const reply = await window.goalloom.execute({ type: 'delete', itemId, expectedVersion: item.version, generation: state.workspace.generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw Error(reply.message)
    }
  }, [...Object.values(ids), created[0].id])
  await application.evaluate(() => { globalThis.generationFixture.mode = 'ready' })
  await page.reload()
  await page.locator('.board').waitFor()
  check('Shift-click opens manual entry without a model request or lingering loading state')
  return { next: loading, fallback, created: created[0].id }
}

async function installFixture(application, previousCalls = []) {
  await application.evaluate(({ ipcMain }, previousCalls) => {
    globalThis.generationFixture = { mode: 'ready', sequence: previousCalls.length, calls: previousCalls, bridgeErrors: [], hold: false, waiters: [] }
    const original = ipcMain._invokeHandlers.get('goalloom:smart')
    ipcMain.removeHandler('goalloom:smart')
    ipcMain.handle('goalloom:smart', async (...args) => {
      if (globalThis.generationFixture.mode === 'bridge-failure' && ['draft', 'review'].includes(args[1].type)) throw Error('Synthetic bridge failure')
      try { return await original(...args) }
      catch (error) { globalThis.generationFixture.bridgeErrors.push({ type: args[1].type, message: error.message }); throw error }
    })
    globalThis.fetch = async (url, init) => {
      if (url === 'https://openrouter.ai/api/v1/systemone') return Response.json({ model: 'typesafe/jev-1.13', answers: {
        horizon: { type: 'choice', choice: 'day', probabilities: { day: 0.97, week: 0.02, later: 0.01 } }, task: { type: 'noul', noul: 0.99 },
      }, usage: { input_tokens: 120, output_tokens: 3 } })
      if (url !== 'https://openrouter.ai/api/v1/chat/completions') throw Error('Unexpected network request')
      const fixture = globalThis.generationFixture, body = JSON.parse(init.body), input = JSON.parse(body.messages[1].content)
      // The connection test's fixed capability sample is not a drafting call.
      if (input.check) return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] })
      const sequence = ++fixture.sequence, responseMode = fixture.mode
      const call = { sequence, kind: input.tasks ? 'draft' : 'review', count: input.tasks?.length ?? 0, reasoning: body.reasoning, format: body.response_format, settled: false }
      fixture.calls.push(call)
      if (fixture.hold) await new Promise(resolve => fixture.waiters.push(resolve))
      else await new Promise(resolve => setTimeout(resolve, responseMode === 'slow' ? 4000 : 700))
      call.settled = true
      if (responseMode === 'unavailable') return Response.json({ error: { code: 503 } }, { status: 503 })
      if (responseMode === 'payment') return Response.json({ error: { code: 402, message: 'Insufficient credits' } }, { status: 402 })
      const value = input.tasks ? { items: input.tasks.map((task, index) => ({ id: task.id, title: `Draft ${sequence} step ${index + 1}`, why: 'Synthetic next step' })) }
        : { headline: `Synthetic review summary ${sequence}`, advice: 'Review one open plan', flags: [] }
      return Response.json({ choices: [{ message: { content: responseMode === 'malformed' ? 'Invalid JSON' : JSON.stringify(value) } }] })
    }
  }, previousCalls)
}
