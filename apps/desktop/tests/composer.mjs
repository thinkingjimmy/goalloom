/**
 * [INPUT]: Built Electron, isolated profiles and an optional packaged executable or --column-add selector.
 * [OUTPUT]: Composer/setup/column creation acceptance, measured input growth/shrink and keyboard paths, and repeatable private evidence.
 * [POS]: Desktop smart-input entry; includes the isolated column-add fixture after the base composer journey.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { chooseSetupCalendar, settleSetupStep } from './fixtures/setup.mjs'
import { verifyAiOnboarding } from './fixtures/onboarding-ai.mjs'
import { runColumnAdd } from './fixtures/column-add.mjs'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'

// 真实窗口：可跳过 Onboarding、全局 composer 普通模式、会话草稿、列头＋键盘路径与拆解入口；不调用任何云服务。
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv.slice(2).find(arg => arg !== '--column-add')
if (process.argv.includes('--column-add')) { await runColumnAdd(packaged); process.exit(0) }
const profile = await mkdtemp(join(tmpdir(), 'Goalloom 输入测试 '))
// Assertions use Chinese copy; pin the device language instead of following the machine's system language.
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
const tabSteps = {}
const composerLayout = {}
try {
  const page = await application.firstWindow()
  page.on('pageerror', error => console.error(error.message))
  // Calendar selection precedes direction; Enter only focuses explicit confirmation.
  await chooseSetupCalendar(page)
  const direction = page.getByRole('textbox', { name: '这一年的方向', exact: true })
  await direction.fill('上线 2.0 版本')
  await direction.press('Enter')
  assert.equal(await page.getByRole('button', { name: '确认并开始', exact: true }).evaluate(node => node === document.activeElement), true)
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).items.length, 0)
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.setupConfirmedAt, null)
  await page.screenshot({ path: 'output/tests/screenshots/onboarding-calendar.png' })
  const previewWorld = await page.locator('.setup-world').elementHandle()
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  await verifyAiOnboarding(page, previewWorld, application)
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  await page.getByRole('button', { name: '上线 2.0 版本', exact: true }).waitFor()
  const first = await page.evaluate(() => window.goalloom.getSnapshot())
  assert.equal(first.items.length, 1)
  assert.deepEqual([first.items[0].title, first.items[0].placement.horizon, first.items[0].flowColor], ['上线 2.0 版本', 'year', 0])
  assert(first.workspace.setupConfirmedAt)
  // --- 列头＋键盘路径：记录 Tab 从顶栏设置按钮到「在今天新建」的实际步数，随前方任务控件增长。 ---
  const measure = async label => {
    await page.getByRole('button', { name: '设置与数据', exact: true }).focus()
    for (let step = 1; step <= 2000; step++) {
      await page.keyboard.press('Tab')
      if (await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === '在今天新建')) { tabSteps[label] = step; return }
    }
    throw new Error('Tab 无法到达今天列＋')
  }
  await measure('direction only')
  // --- 设置 → 智能输入：已有用户入口；未启用。 ---
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '智能输入', exact: true }).click()
  await page.getByText('未启用 · 全局＋保存为 Later').waitFor()
  await page.getByText('需要一个能运行 Jev 的服务：OpenRouter 或 Vercel AI Gateway。').waitFor()
  await page.getByRole('dialog', { name: '设置与数据' }).getByRole('button', { name: '添加服务', exact: true }).click()
  await page.getByRole('dialog', { name: '设置与数据' }).getByRole('heading', { name: 'AI 服务', exact: true }).waitFor()
  await page.screenshot({ path: 'output/tests/screenshots/settings-ai-services-empty.png' })
  await page.getByRole('dialog', { name: '设置与数据' }).getByRole('button', { name: '关闭', exact: true }).click()
  // --- 全局 composer 会话草稿：关闭保留，重新打开恢复，清空放弃。 ---
  await page.getByRole('button', { name: '新建', exact: true }).click()
  const composer = page.getByRole('textbox', { name: '写下想法', exact: true })
  const measureComposer = async state => {
    const layout = await page.locator('.composer-modal').evaluate(dialog => {
      const header = dialog.querySelector('.modal-header'), input = dialog.querySelector('textarea')
      const bounds = dialog.getBoundingClientRect(), headerBounds = header.getBoundingClientRect()
      return {
        height: bounds.height,
        inputHeight: input.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(input).lineHeight),
        spaceBelowHeader: bounds.bottom - headerBounds.bottom,
        dividerWidth: Number.parseFloat(getComputedStyle(header).borderBottomWidth),
      }
    })
    composerLayout[state] = layout
    await page.screenshot({ path: `output/tests/screenshots/composer-${state}.png` })
    return layout
  }
  const empty = await measureComposer('empty')
  assert.equal(empty.inputHeight, empty.lineHeight, 'An empty composer starts with one input line')
  assert(empty.spaceBelowHeader <= 1, 'An empty composer reserves no space below the input row')
  assert.equal(empty.dividerWidth, 0, 'An empty composer has no divider')
  await composer.fill('An idea')
  await page.locator('.composer-cand').waitFor()
  const singleLine = await measureComposer('single-line')
  assert.equal(singleLine.inputHeight, empty.inputHeight)
  assert(singleLine.height > empty.height, 'Typing reveals the candidate strip and expands the dialog')
  assert(singleLine.dividerWidth > 0, 'A candidate strip keeps the input divider')
  await composer.fill('First idea\nSecond idea\nThird idea')
  const multiline = await measureComposer('multiline')
  assert(multiline.inputHeight >= 3 * multiline.lineHeight, 'Multiline text expands the input')
  assert(multiline.height > singleLine.height, 'The dialog grows with the input')
  await composer.fill('An idea')
  const shortened = await measureComposer('shortened')
  assert.equal(shortened.inputHeight, singleLine.inputHeight, 'Shortening text shrinks the input')
  assert.equal(shortened.height, singleLine.height)
  await composer.fill('')
  await page.locator('.composer-cand').waitFor({ state: 'hidden' })
  const cleared = await measureComposer('cleared')
  assert.deepEqual(cleared, empty, 'Clearing text returns to the compact empty layout')
  await composer.fill('本月发布内测版；本周完成登录功能；今天写文案')
  assert.equal(await page.locator('.composer-tip').count(), 0, 'The composer does not show entry guidance')
  await page.screenshot({ path: 'output/tests/screenshots/composer-without-entry-tip.png' })
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: '新建' }).waitFor({ state: 'hidden' })
  await page.keyboard.press('ControlOrMeta+n')
  assert.equal(await composer.inputValue(), '本月发布内测版；本周完成登录功能；今天写文案')
  await page.getByRole('button', { name: '清空草稿', exact: true }).click()
  await page.getByRole('dialog', { name: '新建' }).waitFor({ state: 'hidden' })
  await page.getByRole('region', { name: 'Later列', exact: true }).scrollIntoViewIfNeeded()
  await page.keyboard.press('ControlOrMeta+n')
  assert.equal(await composer.inputValue(), '')
  await composer.fill('一段想法')
  await page.getByRole('button', { name: /保存到 Later/ }).click()
  await page.getByRole('dialog', { name: '新建' }).waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '一段想法', exact: true }).waitFor()
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.toast').count(), 0, 'Visible single composer creation stays quiet')
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).items.filter(item => item.placement.horizon === 'later').length, 1)
  const seed = count => page.evaluate(async count => {
    const snapshot = await window.goalloom.getSnapshot()
    for (let index = 0; index < count; index++) {
      const reply = await window.goalloom.execute({ type: 'create', title: `前方任务 ${index}`, horizon: ['later', 'cycle', 'month', 'week'][index % 4], generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw new Error(reply.message)
    }
  }, count)
  await measure('1 task (Later)')
  await seed(11); await page.getByRole('button', { name: '前方任务 10', exact: true }).waitFor(); await measure('12 tasks')
  await seed(48); await page.getByRole('button', { name: '前方任务 47', exact: true }).waitFor(); await measure('60 tasks')
  assert(tabSteps['60 tasks'] > tabSteps['12 tasks'] && tabSteps['12 tasks'] > tabSteps['1 task (Later)'] && tabSteps['1 task (Later)'] >= tabSteps['direction only'])
  // Enter 与 Space 都启动今天列 QuickAdd，保留列名与连续输入；全局 Cmd/Ctrl+N 仍是 composer。
  await page.keyboard.press('Enter')
  const today = page.getByRole('textbox', { name: '新建到今天', exact: true })
  await today.waitFor()
  await today.fill('列内连续一'); await today.press('Enter')
  await page.getByRole('button', { name: '列内连续一', exact: true }).waitFor()
  await today.fill('列内连续二'); await today.press('Enter')
  await page.getByRole('button', { name: '列内连续二', exact: true }).waitFor()
  await today.press('Escape')
  await page.getByRole('button', { name: '在今天新建', exact: true }).focus()
  await page.keyboard.press('Space')
  await today.waitFor()
  await today.press('Escape')
  const created = (await page.evaluate(() => window.goalloom.getSnapshot())).items.filter(item => item.title.startsWith('列内连续'))
  assert(created.every(item => item.placement.horizon === 'day'))
  await page.getByRole('button', { name: '在今天新建', exact: true }).focus()
  await page.keyboard.press('ControlOrMeta+n')
  await composer.waitFor()
  await page.keyboard.press('Escape')
  // Day has no shorter horizon; the board context menu keeps explicit parent-scoped creation for longer horizons.
  await page.getByRole('button', { name: '列内连续一', exact: true }).click()
  await page.getByRole('dialog', { name: '当前条目' }).waitFor()
  assert.equal(await page.getByRole('button', { name: /拆解下一步/ }).count(), 0)
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('region', { name: '本周列', exact: true }).getByRole('button', { name: '前方任务 3', exact: true }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: '拆下一步', exact: true }).click()
  const split = page.locator('.seeded-composer .composer-input')
  await split.waitFor()
  await split.fill('拆解出的下一步'); await split.press('Enter')
  await page.getByRole('button', { name: '拆解出的下一步', exact: true }).waitFor()
  const final = await page.evaluate(() => window.goalloom.getSnapshot())
  const child = final.items.find(item => item.title === '拆解出的下一步'), edge = final.relations.find(row => row.childId === child.id)
  const parent = final.items.find(item => item.id === edge?.parentId)
  assert.deepEqual([parent?.title, parent?.placement.horizon, child.placement.horizon], ['前方任务 3', 'week', 'day'])
  await page.locator('.seeded-composer').waitFor({ state: 'hidden' })
  const runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const record = { packaged: Boolean(packaged), runtime, composerLayout, tabStepsToTodayAdd: tabSteps, checks: ['direction draft not written before confirm', 'direction becomes annual flow root', 'onboarding two choices', 'form only after connect', 'consent unchecked', 'skip keeps calendar', 'settings entry', 'compact empty composer', 'composer grows and shrinks with text', 'composer without entry guidance', 'composer session draft', 'plain single Later', 'column + Enter/Space', 'continuous column entry', 'Cmd+N stays composer', 'split keeps parent'] }
  await mkdir('output/tests', { recursive: true })
  await writeFile('output/tests/composer.json', JSON.stringify(record, null, 2))
  console.log(JSON.stringify(record))
} finally { await application.close(); await rm(profile, { recursive: true, force: true }) }
await runColumnAdd(packaged)
if (!packaged) {
  await import('./auto-link-storage.mjs')
  await import('./auto-link.mjs')
}
