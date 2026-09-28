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
  await page.setViewportSize({ width: 1600, height: 900 })
  const direction = page.getByRole('textbox', { name: '三个月的方向', exact: true })
  await direction.fill('全网粉丝达到 5w+'); await direction.press('Enter')
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  await page.getByRole('button', { name: '连接 Jev', exact: true }).click()
  await page.getByRole('radio', { name: 'OpenRouter', exact: true }).click()
  await page.getByLabel('OpenRouter API Key').fill(key)
  await page.getByRole('checkbox', { name: /我同意/ }).check()
  await page.getByRole('button', { name: '测试并启用', exact: true }).click()
  const board = page.getByRole('main', { name: '时间看板' })
  await board.waitFor({ timeout: 30_000 })
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
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

  // Settings must exercise both real generation actions without writing to the workspace.
  const beforeTrial = await page.evaluate(async () => (await window.goalloom.getSnapshot()).workspace.revision)
  await page.keyboard.press('ControlOrMeta+,')
  const settings = page.locator('dialog.settings-modal')
  await settings.getByRole('button', { name: '洞察', exact: true }).click()
  const trialStarted = Date.now()
  await settings.getByRole('button', { name: '生成', exact: true }).click()
  await settings.locator('.insight-trial').waitFor({ timeout: 30_000 })
  assert.equal(await settings.locator('.insight-trial [role="alert"]').count(), 0, await settings.locator('.insight-trial').innerText())
  assert.equal(await settings.locator('.insight-trial p').count(), 2)
  assert.equal(await page.evaluate(async () => (await window.goalloom.getSnapshot()).workspace.revision), beforeTrial)
  report.latencyMs.settings = Date.now() - trialStarted
  await page.screenshot({ path: `${out}/live-settings.png` })
  report.checks.push('Settings generated a draft and review through real OpenRouter without workspace writes')
  await page.keyboard.press('Escape')
  await settings.waitFor({ state: 'detached' })

  // --- Empty 本周: one call drafts a step for each month plan; rows fill in, ↵ creates them. ---
  const week = board.locator('[data-horizon="week"]')
  await week.getByRole('button', { name: '为 7 项各起一步' }).click()
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
