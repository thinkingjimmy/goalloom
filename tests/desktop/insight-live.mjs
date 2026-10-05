/**
 * [INPUT]: Built Electron, an isolated synthetic profile and the authorized .env.local OpenRouter key.
 * [OUTPUT]: Real annual/half/cycle and weekly drafts, production IPC review/no-write checks, screenshots, timings and runtime evidence.
 * [POS]: Optional live-provider E2E; no credentials or user workspace data enter its reports.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { chooseSetupCalendar } from './fixtures/setup.mjs'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, release, tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'

// Live flow insight against real OpenRouter (deepseek flash via the saved key): needs OPENROUTER_API_KEY in the git-ignored .env.local; never printed or saved.
// Not part of verify. Artifacts: output/tests/insight/live-report.json and output/tests/insight/live-*.png.
const key = (await readFile('.env.local', 'utf8').catch(() => '')).match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1]?.trim()
if (!key) { console.error('OPENROUTER_API_KEY missing in .env.local'); process.exit(1) }
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2], profile = await mkdtemp(join(tmpdir(), 'Goalloom 洞察实测 '))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const out = 'output/tests/insight'
await mkdir(out, { recursive: true })
const application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
const report = { checks: [], titles: {}, latencyMs: {}, scope: packaged ? 'Packaged Electron, synthetic workspace, live OpenRouter' : 'Source Electron, synthetic workspace, live OpenRouter', host: { os: release(), platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model } }
try {
  const page = await application.firstWindow()
  page.on('pageerror', error => console.error(error.message))
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 900))
  await chooseSetupCalendar(page)
  const direction = page.locator('.direction-input')
  await direction.fill('全网粉丝达到 5w+'); await direction.press('Enter')
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  await page.getByRole('button', { name: '连接 AI 服务', exact: true }).click()
  await page.getByRole('radio', { name: /^OpenRouter/ }).click()
  await page.getByLabel('OpenRouter API Key').fill(key)
  await page.getByRole('checkbox', { name: /我同意/ }).check()
  await page.getByRole('button', { name: '测试并开启', exact: true }).click()
  await page.getByRole('button', { name: '进入看板', exact: true }).click()
  const board = page.getByRole('main', { name: '时间看板' })
  await board.waitFor({ timeout: 30_000 })
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  // Real annual → half → cycle drafting uses the displayed dates and new request keys.
  const annual = (await page.evaluate(() => window.goalloom.getSnapshot())).items.find(item => item.title === '全网粉丝达到 5w+')
  let parent = annual
  for (const horizon of ['half', 'cycle']) {
    const title = page.locator(`#item-${parent.id} .task-title`)
    await title.scrollIntoViewIfNeeded(); await title.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '拆下一步', exact: true }).click()
    const parentId = parent.id
    await pollPage(page, async id => (await window.goalloom.getSnapshot()).relations.some(edge => edge.parentId === id), parentId)
    const state = await page.evaluate(() => window.goalloom.getSnapshot())
    const edge = state.relations.find(edge => edge.parentId === parentId)
    parent = (await page.evaluate(id => window.goalloom.getItem(id), edge.childId)).item
    assert.equal(parent.placement.horizon, horizon)
    report.titles[horizon] = parent.title
  }
  report.checks.push('Live annual → half → cycle titles created through context-menu decomposition')
  const ids = await page.evaluate(async () => {
    const snapshot = await window.goalloom.getSnapshot(), generation = snapshot.workspace.generation
    const root = snapshot.items.find(item => item.title === '全网粉丝达到 5w+')
    const make = async (title, parent) => {
      const version = (await window.goalloom.getSnapshot()).items.find(item => item.id === parent).version
      const reply = await window.goalloom.execute({ type: 'create', title, horizon: 'month', parentId: parent, expectedParentVersion: version, generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw new Error(reply.message)
      return reply.result.itemId
    }
    const ids = { root: root.id, video: await make('发布小米 Fold 18 评测视频', root.id), wechat: await make('发 2 篇公众号（X 长文）', root.id), xhs: await make('发 3 篇小红书图文', root.id) }
    for (const title of ['上线个人作品集', '完成视频剪辑模板', '发布读书笔记合集', '完成一轮读者访谈']) await make(title, root.id)
    return ids
  })

  // The current Settings pane configures the feature; production IPC supports read-only model requests.
  const beforeTrial = await page.evaluate(async () => (await window.goalloom.getSnapshot()).workspace.revision)
  await page.keyboard.press('ControlOrMeta+,')
  const settings = page.locator('dialog.settings-modal')
  await settings.getByRole('button', { name: '洞察', exact: true }).click()
  await settings.getByText('已启用 · 由 OpenRouter 处理', { exact: true }).waitFor()
  const trialStarted = Date.now()
  const trial = await page.evaluate(async id => {
    const state = await window.goalloom.getSnapshot()
    const horizons = ['half', 'cycle', 'month', 'week', 'day']
    const periodNames = { year: '这一年', half: '这半年', cycle: '这3个月', month: '本月', week: '本周', day: '今天' }
    const period = state.periods.find(period => period.horizon === 'half')
    const root = state.items.find(item => item.id === id)
    const groups = Object.fromEntries(horizons.map(horizon => [horizon, state.items.filter(item => item.placement.horizon === horizon).map(item => item.title)]))
    const board = { today: new Intl.DateTimeFormat('en-CA', { timeZone: state.workspace.calendar.timezone }).format(new Date(state.observedAt)),
      periods: Object.fromEntries(state.periods.map(period => [period.horizon, `${periodNames[period.horizon]}（${period.startDate} 至 ${period.endDate}）`])),
      goals: [{ title: root.title, ...groups }], unlinked: Object.fromEntries(horizons.map(horizon => [horizon, []])) }
    const common = { generation: state.workspace.generation, board, prefs: { about: '', stepSize: 'hour', stepNotes: '', tone: 'direct', focus: ['gap', 'overload'] } }
    const draft = await window.goalloom.smart({ type: 'draft', request: { ...common, requestId: crypto.randomUUID(),
      tasks: [{ id: 'trial-half', parent: root.title, goal: root.title, target: board.periods.half, targetHorizon: 'half', siblings: groups.half }] } })
    const review = await window.goalloom.smart({ type: 'review', request: { ...common, requestId: crypto.randomUUID(), scope: 'week',
      signals: [{ kind: 'gap', goal: root.title, detail: `本周尚未安排「发布小米 Fold 18 评测视频」的下一步，半年阶段开始于 ${period.startDate}` }] } })
    return { draft, review }
  }, ids.root)
  assert.equal(trial.draft.type, 'draft'); assert.equal(trial.draft.reply.status, 'ready', JSON.stringify(trial.draft))
  assert.equal(trial.review.type, 'review'); assert.equal(trial.review.reply.status, 'ready', JSON.stringify(trial.review))
  report.titles.trialHalf = trial.draft.reply.value[0].title
  report.review = trial.review.reply.value
  assert.equal(await page.evaluate(async () => (await window.goalloom.getSnapshot()).workspace.revision), beforeTrial)
  report.latencyMs.settings = Date.now() - trialStarted
  await page.screenshot({ path: `${out}/live-settings.png` })
  report.checks.push('Settings feature enabled; real six-scale draft/review requests crossed production IPC without workspace writes')
  await page.keyboard.press('Escape')
  await settings.waitFor({ state: 'detached' })

  // --- Empty 本周: one call drafts a step for each month plan; rows fill in, ↵ creates them. ---
  const week = board.locator('[data-horizon="week"]')
  await week.scrollIntoViewIfNeeded()
  await week.getByRole('button', { name: '起草下一步', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新建' })
  let started = Date.now()
  await pollPage(page, () => { const inputs = [...document.querySelectorAll('.seed-title')]; return inputs.length === 7 && inputs.every(input => input.value.trim().length > 1) }, undefined, { timeout: 30_000, label: 'seven batch titles drafted' })
  report.latencyMs.batch = Date.now() - started
  report.titles.batch = await dialog.locator('.seed-title').evaluateAll(inputs => inputs.map(input => input.value))
  await page.screenshot({ path: `${out}/live-1-batch.png` })
  for (let index = 2; index < 7; index++) await dialog.locator('.seed-row').nth(index).getByRole('checkbox').uncheck()
  await dialog.getByRole('button', { name: /创建 2 项/ }).click()
  await dialog.waitFor({ state: 'hidden' })
  report.checks.push('batch drafts filled from the model and created the checked rows')

  // --- Breakpoint click: the model drafts and the step is created directly (no dialog). ---
  await page.getByRole('button', { name: '只看 全网粉丝达到 5w+', exact: true }).click()
  await board.locator('[data-horizon="month"]').scrollIntoViewIfNeeded()
  const node = board.getByRole('button', { name: '给「发 3 篇小红书图文」拆下一步' })
  await node.waitFor()
  const guide = board.getByRole('button', { name: '知道了' })
  if (await guide.count()) await guide.click()
  started = Date.now()
  await node.click()
  await pollPage(page, id => window.goalloom.getSnapshot().then(s => s.relations.some(edge => edge.parentId === id)), ids.xhs, { timeout: 30_000, label: 'step created under 小红书' })
  report.latencyMs.single = Date.now() - started
  const state = await page.evaluate(() => window.goalloom.getSnapshot())
  const childId = state.relations.find(edge => edge.parentId === ids.xhs)?.childId
  const child = state.items.find(item => item.id === childId)
  report.titles.single = child?.title ?? '(next period — not in current snapshot)'
  assert.equal(await dialog.count(), 0, '单击直接创建，不弹窗')
  report.checks.push('breakpoint click drafted and created a step without a dialog')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}/live-2-single.png` })
  // --- Review (only on a review day): the look-back summary is written by the model. ---
  const entry = board.locator('[data-review]')
  if (await entry.count()) {
    await page.getByRole('button', { name: '全部', exact: true }).click()
    await entry.click()
    const drawer = page.locator('.review-drawer')
    started = Date.now()
    await drawer.locator('.review-headline').waitFor({ timeout: 30_000 })
    report.latencyMs.review = Date.now() - started
    report.review = await drawer.locator('.review-summary').innerText()
    await page.screenshot({ path: `${out}/live-3-review.png` })
    report.checks.push('review look-back summary written by the model')
  }
  report.ok = true
} finally {
  await writeFile(`${out}/live-report.json`, JSON.stringify(report, null, 2))
  await application.close()
  await rm(profile, { recursive: true, force: true })
}
console.log(JSON.stringify(report, null, 2))
