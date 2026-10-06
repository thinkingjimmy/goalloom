/**
 * [INPUT]: Built Electron in a native 1440 × 900 window, isolated workspace data and the actual workspace calendar.
 * [OUTPUT]: Flow-insight acceptance, horizon-specific empty-card copy/equal-height hit targets, five-locale minimum-width layout, previews, endpoint alignment, reviews and settings; --empty-card selects card creation/layout only.
 * [POS]: Desktop acceptance of empty columns, breakpoints, reviews and local insight preferences without a live model.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { finishSetup } from './fixtures/setup.mjs'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'
import { verifyPreviewBreakpoints } from './fixtures/preview-breakpoints.mjs'

// 流程洞察（无模型路径）：空列卡 → 批量起草 / 自己写；单流程筛选的断点 ＋ 与首次引导（只一次，重载后不再出现）；
// Breakpoint clicks without a model open the seeded composer; previews offer local next steps, while All stays clear at rest.
// Artifacts: output/tests/insight/report.json and output/tests/insight/*.png.
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
const args = process.argv.slice(2), emptyOnly = args.includes('--empty-card')
const packaged = args.find(value => !value.startsWith('--')), profile = await mkdtemp(join(tmpdir(), 'Goalloom 洞察 '))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const out = emptyOnly ? 'output/tests/empty-card/native' : 'output/tests/insight'
await mkdir(out, { recursive: true })
const application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
const checks = []
const check = label => { checks.push(label); console.log(`✓ ${label}`) }
try {
  const page = await application.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900))
  const weekStart = await page.evaluate(() => (new Date().getDay() + 1) % 7 + 1)
  await finishSetup(page, { weekStart })
  const board = page.getByRole('main', { name: '时间看板' })
  await board.waitFor()
  const shot = name => page.screenshot({ path: `${out}/${name}.png` })
  const snapshot = () => page.evaluate(() => window.goalloom.getSnapshot())
  const emptyActions = []
  const verifyEmptyActions = async (column, label) => {
    const card = column.locator('.insight-empty')
    assert.equal(await card.locator('button.primary').innerText(), label)
    const metrics = await card.locator('button').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
      return { text: node.textContent, height: rect.height, top: rect.top, fontSize: style.fontSize, lineHeight: style.lineHeight,
        overflow: node.scrollWidth > node.clientWidth, hit: node.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) }
    }))
    assert.equal(metrics.length, 2)
    assert(metrics.every(button => button.height === 32 && button.fontSize === '13px' && !button.overflow && button.hit))
    assert.equal(metrics[0].top, metrics[1].top)
    emptyActions.push({ label, buttons: metrics })
    await card.screenshot({ path: `${out}/empty-card-${column === weekColumn ? 'week' : 'day'}.png` })
  }
  // Creates rows in order; `parent` names an earlier key or an existing id. Returns key → item id.
  const seedRows = (specs, known = {}) => page.evaluate(async ([specs, known]) => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const ids = { ...known }
    for (const spec of specs) {
      const parentId = spec.parent ? ids[spec.parent] : null
      const expectedParentVersion = parentId ? (await window.goalloom.getSnapshot()).items.find(item => item.id === parentId).version : null
      const reply = await window.goalloom.execute({ type: 'create', title: spec.title, horizon: spec.horizon, flowColor: spec.color ?? null, parentId, expectedParentVersion, generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw new Error(reply.message)
      ids[spec.key] = reply.result.itemId
    }
    return ids
  }, [specs, known])

  // Two flows with month plans only: 本周 and 今天 start empty.
  const ids = await seedRows([
    { key: 'fans', title: '全网粉丝达到 5w+', horizon: 'cycle', color: 0 }, { key: 'side', title: '副业收入提升到 $5k', horizon: 'cycle', color: 1 },
    { key: 'video', title: '发布小米 Fold 18 评测视频', horizon: 'month', parent: 'fans' }, { key: 'wechat', title: '发 2 篇公众号（X 长文）', horizon: 'month', parent: 'fans' },
    { key: 'bottega', title: 'Bottega 正式对外，同时开启商业化', horizon: 'month', parent: 'side' }, { key: 'todo', title: '开发一款自用 Todo 工具', horizon: 'month', parent: 'side' },
  ])

  // --- 空列：本周整列为空、本月有 4 项 → 卡片；今天的上一列也空 → 仍是普通空状态。 ---
  const weekColumn = board.locator('[data-horizon="week"]'), dayColumn = board.locator('[data-horizon="day"]')
  await weekColumn.getByText('本周还是空的').waitFor()
  assert.equal(await dayColumn.locator('.insight-empty').count(), 0, '今天的上一列（本周）为空，不出卡片')
  assert.equal(await board.locator('.breakpoint').count(), 0, '「全部」不出断点 ＋')
  await weekColumn.scrollIntoViewIfNeeded()
  await verifyEmptyActions(weekColumn, '起草本周待办')
  await shot('1-empty-week')
  check('empty week column shows the insight card; 全部 shows no breakpoint ＋')

  await weekColumn.getByRole('button', { name: '起草本周待办', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新建' })
  await dialog.waitFor()
  assert.equal(await dialog.locator('.seed-heading').innerText(), '起草本周待办')
  const rows = dialog.locator('.seed-row')
  assert.equal(await rows.count(), 4)
  // Without a model the titles stay empty for the user to write; unchecked rows are skipped.
  const titles = { [ids.bottega]: '给 Bottega 的 Artifact 功能增加此能力', [ids.todo]: '列出 Todo 工具的核心功能' }
  for (let index = 0; index < 4; index++) {
    const label = await rows.nth(index).locator('.seed-parent').innerText()
    const parent = Object.entries({ [ids.bottega]: 'Bottega', [ids.todo]: 'Todo' }).find(([, text]) => label.includes(text))?.[0]
    if (parent) await rows.nth(index).locator('.seed-title').fill(titles[parent])
    else await rows.nth(index).getByRole('checkbox').uncheck()
  }
  await shot('2-batch-composer')
  await dialog.getByRole('button', { name: /创建 2 项/ }).click()
  await dialog.waitFor({ state: 'hidden' })
  let state = await snapshot()
  const week = state.periods.find(period => period.horizon === 'week')
  for (const [parent, title] of Object.entries(titles)) {
    const item = state.items.find(row => row.title === title)
    assert.equal(item?.placement.horizon, 'week'); assert.equal(item.placement.periodId, week.id)
    assert(state.relations.some(edge => edge.parentId === parent && edge.childId === item.id), `${title} 挂在上级下`)
  }
  check('batch card creates only the checked, titled rows in 本周 under their parents (createPlan)')

  let preview
  if (!emptyOnly) {
  preview = await verifyPreviewBreakpoints(page, out, {
    week: state.items.find(item => item.title === titles[ids.bottega]).id, sibling: state.items.find(item => item.title === titles[ids.todo]).id,
    weekTitle: titles[ids.bottega], month: ids.bottega, root: ids.side, otherMonth: ids.video, otherSiblingMonth: ids.wechat, otherRoot: ids.fans,
  })
  check('dot previews expose every highlighted chain gap, exclude faded branches and deduplicate multi-flow leaves; ancestor previews, empty targets, keyboard use, creation and undo preserve the correct parent and period')
  }

  // 今天 is now empty under a non-empty 本周: its card offers the free composer with the period prefilled.
  await dayColumn.scrollIntoViewIfNeeded()
  await dayColumn.getByText('今天还是空的').waitFor()
  await verifyEmptyActions(dayColumn, '起草今天待办')
  const manualEntry = dayColumn.getByRole('button', { name: '自己写' })
  const emptyCardTarget = await manualEntry.evaluate(node => {
    const rect = node.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
    return { viewport: { width: innerWidth, height: innerHeight }, target: { x, y, width: rect.width, height: rect.height }, hit: document.elementFromPoint(x, y)?.outerHTML }
  })
  await writeFile(`${out}/empty-card-target.json`, JSON.stringify(emptyCardTarget, null, 2))
  await manualEntry.click()
  await dialog.waitFor()
  await dialog.getByRole('textbox').fill('随手记一件事')
  await dialog.getByRole('textbox').press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  state = await snapshot()
  assert.equal(state.items.find(row => row.title === '随手记一件事')?.placement.horizon, 'day')
  assert.equal(state.items.find(row => row.title === '随手记一件事')?.placement.periodId, state.periods.find(period => period.horizon === 'day').id)
  check('「自己写」opens the composer with only the period prefilled and creates in 今天')

  if (emptyOnly) {
    assert.deepEqual(errors, [])
    await writeFile(`${out}/report.json`, JSON.stringify({ ok: true, group: 'empty-card', checks, emptyActions,
      runtime: await page.evaluate(() => window.goalloom.getRuntime()), platform: `${process.platform}-${process.arch}`,
      scope: 'Native Electron/IPC/SQLite with isolated synthetic data; weekly/daily copy, equal-height hit targets, linked batch and manual period creation only.' }, null, 2))
  } else {

  // --- 断点：筛选「全网粉丝」→ 两个本月计划都没有本周下级，各一个 ＋；首次引导只出现一次。 ---
  await page.getByRole('button', { name: '只看 全网粉丝达到 5w+', exact: true }).click()
  await board.locator('[data-horizon="month"]').scrollIntoViewIfNeeded()
  await board.locator('.breakpoint').first().waitFor()
  assert.equal(await board.locator('.breakpoint').count(), 2)
  assert.equal(await board.locator('.breakpoint-guide').count(), 0, 'The guide dismissed during preview stays dismissed when filtering')
  await shot('3-breakpoints')
  const place = await page.evaluate(id => {
    const row = document.getElementById(`item-${id}`).getBoundingClientRect(), node = document.querySelector(`.breakpoint[aria-label*="发布小米"]`).getBoundingClientRect()
    return { gap: Math.round(row.right - node.right), mid: Math.abs(node.top + node.height / 2 - (row.top + Math.min(row.height, 32) / 2)) < 2 }
  }, ids.video)
  assert.deepEqual(place, { gap: 6, mid: true }, 'The entry sits 6px inside the row edge on the first title line, clear of the column rule')
  await page.reload()
  await board.waitFor()
  await page.getByRole('button', { name: '只看 全网粉丝达到 5w+', exact: true }).click()
  await board.locator('[data-horizon="month"]').scrollIntoViewIfNeeded()
  await board.locator('.breakpoint').first().waitFor()
  assert.equal(await board.locator('.breakpoint-guide').count(), 0, '引导状态存本机，重载后不再出现')
  check('filtered flow shows one ＋ per gap at the outgoing row endpoint; the guide shows once and stays dismissed after reload')

  // No model connected: a click opens the prefilled composer (parent + target period), ↵ creates the child.
  await board.getByRole('button', { name: '给「发布小米 Fold 18 评测视频」拆下一步' }).click()
  await dialog.waitFor()
  assert(await dialog.locator('.seed-chip').filter({ hasText: '↳ 发布小米 Fold 18 评测视频' }).count())
  const target = await page.evaluate(async () => {
    const s = await window.goalloom.getSnapshot(), current = s.periods.find(period => period.horizon === 'week')
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: s.workspace.calendar.timezone }).format(new Date(s.observedAt))
    const last = new Date(`${current.endDate}T00:00:00Z`); last.setUTCDate(last.getUTCDate() - 1)
    return { lastDay: last.toISOString().slice(0, 10) === today, current: current.id }
  })
  await shot('4-seeded-next')
  await dialog.getByRole('textbox').fill('写评测脚本')
  await dialog.getByRole('textbox').press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  state = await snapshot()
  const edge = state.relations.find(row => row.parentId === ids.video)
  assert(edge, '新步骤挂在「发布小米」下')
  if (target.lastDay) {
    await board.locator('.breakpoint-away').filter({ hasText: '写评测脚本' }).waitFor()
    check('last day of the week: the step goes to next week and the ＋ becomes a destination pill')
  } else {
    assert.equal(state.items.find(row => row.id === edge.childId)?.placement.periodId, target.current)
    // The new week step may itself need a day step; only the original parent's gap must disappear.
    await board.getByRole('button', { name: '给「发布小米 Fold 18 评测视频」拆下一步', exact: true }).waitFor({ state: 'detached' })
    check('mid-week: the step lands in 本周 and its ＋ disappears')
  }
  await shot('5-after-create')

  // A month with an existing week child and direct day children has no missing-child action.
  const direct = await seedRows([{ key: 'a', title: 'Bottega 远端控制功能完成验收', horizon: 'day', parent: 'bottega' }, { key: 'b', title: '完成 Bottega 09-24 开发任务', horizon: 'day', parent: 'bottega' }], { bottega: ids.bottega })
  await page.getByRole('button', { name: '只看 副业收入提升到 $5k', exact: true }).click()
  await board.locator('[data-horizon="month"]').scrollIntoViewIfNeeded()
  await page.locator(`#item-${ids.bottega} .task-title`).hover()
  assert.equal(await board.locator(`.breakpoint[data-spot-key$=":${ids.bottega}"]`).count(), 0)
  assert.equal(await board.locator('.breakpoint[data-kind="skip"]').count(), 0)
  state = await snapshot()
  assert([direct.a, direct.b].every(child => state.relations.some(edge => edge.parentId === ids.bottega && edge.childId === child)))
  await shot('6-existing-children')
  check('existing week and direct day children suppress the parent action and keep their original relationships')

  // --- 复盘：本周最后一天（或下周第一天）列头出现入口；回顾 → 收尾 → 排下周 → 完成；完成后入口消失且重载后不再出现。 ---
  const entry = board.locator('[data-review]')
  const reviewDay = await entry.count() > 0
  if (reviewDay) {
    const scope = await entry.getAttribute('data-review')
    const entryLabel = await entry.getAttribute('title')
    assert(entryLabel?.includes('复盘'), 'The entry names the reviewed period')
    await board.locator(`[data-horizon="${scope}"]`).screenshot({ path: `${out}/8-review-entry.png` })
    await entry.click()
    const drawer = page.locator('dialog.review-drawer[open]')
    await drawer.locator('.review-body[aria-busy="false"]').waitFor()
    await shot('8-review-lookback')
    let open = 0, rowsToPlan = 0
    for (let step = 0; step < 5 && await drawer.count(); step++) {
      const closeRows = drawer.locator('.review-close-row')
      if (await closeRows.count()) {
        open = await closeRows.count()
        if (open >= 2) {
          await closeRows.nth(1).getByRole('combobox').click()
          await drawer.getByRole('option', { name: '归档', exact: true }).click()
        }
        await shot('9-review-close')
      }
      const plan = drawer.locator('.review-plan-row')
      rowsToPlan += await plan.count()
      if (await plan.count()) await plan.first().locator('.seed-title').fill(`Review next step ${step}`)
      await shot(`10-review-step-${step}`)
      const previousStep = await drawer.locator('.review-steps [aria-current=step]').textContent()
      await drawer.locator('.review-foot .primary').click()
      await page.waitForFunction(previous => {
        const dialog = document.querySelector('dialog.review-drawer[open]')
        return !dialog || dialog.querySelector('[aria-current=step]')?.textContent !== previous
      }, previousStep)
    }
    await drawer.waitFor({ state: 'detached' })
    await shot('11-review-done')
    await entry.waitFor({ state: 'detached' })
    await page.reload(); await board.waitFor()
    assert.equal(await board.locator('[data-review]').count(), 0, '复盘状态存本机，重载后入口不再出现')
    check(`review (${scope}): completion (${open} unfinished items; ${rowsToPlan} planning candidate${rowsToPlan === 1 ? '' : 's'});  the entry stays gone after reload`)
  } else check('not a review day (neither the last nor the first day of a week/month): review checks skipped')

  // Settings: breakpoint visibility and device-only preferences survive reload.
  const openInsight = async () => {
    await page.keyboard.press('ControlOrMeta+,')
    const dialogSettings = page.locator('dialog.settings-modal')
    await dialogSettings.getByRole('button', { name: '洞察' }).click()
    return dialogSettings
  }
  let pane = await openInsight()
  await pane.getByText('需要一个能运行 DeepSeek 的服务：OpenRouter 或 Vercel AI Gateway。').waitFor()
  assert.equal(await pane.getByRole('radio', { name: /^OpenRouter/ }).isDisabled(), true, '未连接的服务不可选')
  await pane.locator('.settings-group').first().screenshot({ path: `${out}/12-settings-hints.png` })
  assert.equal(await pane.getByRole('tab', { name: '拆解' }).getAttribute('aria-selected'), 'true', '个性化默认打开拆解')
  await pane.getByRole('radio', { name: '最小一步' }).click()
  await pane.getByRole('tab', { name: '关于我' }).click()
  await pane.getByRole('textbox', { name: '你是谁、在做什么' }).fill('独立开发者兼内容创作者')
  await pane.getByRole('tab', { name: '关于我' }).press('ArrowRight')
  assert.equal(await pane.getByRole('tab', { name: '拆解' }).getAttribute('aria-selected'), 'true', '方向键切换标签')
  await pane.getByRole('tab', { name: '完整提示词' }).click()
  assert.match(await pane.locator('.insight-prompt pre[data-user]').innerText(), /独立开发者兼内容创作者[\s\S]*十几分钟/)
  await shot('12-settings-insight')
  await pane.getByRole('switch', { name: '断点 ＋' }).click()
  await page.keyboard.press('Escape'); await pane.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '只看 全网粉丝达到 5w+', exact: true }).click()
  await page.waitForTimeout(300)
  assert.equal(await board.locator('.breakpoint').count(), 0, '关闭断点后筛选不出 ＋')
  await page.reload(); await board.waitFor()
  pane = await openInsight()
  await pane.getByRole('tab', { name: '关于我' }).click()
  assert.equal(await pane.getByRole('textbox', { name: '你是谁、在做什么' }).inputValue(), '独立开发者兼内容创作者', '关于我重载后保留')
  assert.equal(await pane.getByRole('switch', { name: '断点 ＋' }).getAttribute('aria-checked'), 'false')
  await pane.getByRole('switch', { name: '断点 ＋' }).click()
  await page.keyboard.press('Escape'); await pane.waitFor({ state: 'detached' })
  check('settings › 洞察: breakpoints switch, personalization tabs (arrow keys), about-me persisted on the device, prompt tab carries preferences')

  assert.deepEqual(errors, [])
  await writeFile(`${out}/report.json`, JSON.stringify({ ok: true, lastDayOfWeek: target.lastDay, reviewDay, checks, preview, breakpointGeometry: { gap: place }, runtime: await page.evaluate(() => window.goalloom.getRuntime()), platform: `${process.platform}-${process.arch}` }, null, 2))
  }
} catch (error) {
  const page = await application.firstWindow()
  const nativeWindows = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getContentBounds() }))).catch(() => null)
  const document = await page.evaluate(() => ({ focused: globalThis.document.hasFocus(), visibility: globalThis.document.visibilityState, active: globalThis.document.activeElement?.outerHTML,
    viewport: { width: innerWidth, height: innerHeight }, timeline: [...globalThis.document.querySelectorAll('.board-timeline')].map(node => ({ left: node.scrollLeft, width: node.clientWidth, contentWidth: node.scrollWidth })) })).catch(() => null)
  await writeFile(`${out}/failure.json`, JSON.stringify({ error: error.message, nativeWindows, document }, null, 2))
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {})
  throw error
} finally {
  await application.close()
  await rm(profile, { recursive: true, force: true })
}
await import('./empty-card-layout.mjs')
if (!emptyOnly) await import('./weekly-review.mjs')
