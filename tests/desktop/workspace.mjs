import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'

// 独立自动化进程通过标准调试协议测试；正式应用没有测试 IPC/时钟/数据入口。
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2]
const profile = await mkdtemp(join(tmpdir(), 'Goalloom 窗口测试 '))
// Assertions use Chinese copy; pin the device language instead of following the machine's system language.
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
try {
  const page = await application.firstWindow()
  page.on('pageerror', error => console.error(error.message))
  await page.getByRole('textbox', { name: '三个月的方向', exact: true }).waitFor()
  console.log(await page.locator('body').ariaSnapshot())
  assert.deepEqual((await page.evaluate(() => Object.keys(window.goalloom))).sort(), ['data', 'execute', 'exportWorkspace', 'getActivity', 'getActivitySummary', 'getBackupSummary', 'getBatchItems', 'getBatches', 'getCounts', 'getHistory', 'getItem', 'getLanguage', 'getReceipt', 'getRuntime', 'getSnapshot', 'listItems', 'onChanged', 'setLanguage', 'smart'])
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined')
  const runtime = await page.evaluate(() => window.goalloom.getRuntime())
  assert.match(runtime.sqlite, /^3\./)
  assert.equal(runtime.electron, JSON.parse(await readFile('node_modules/electron/package.json', 'utf8')).version)
  // 不写方向也能继续：跳过后进入日历确认，看板保持为空。
  await page.getByRole('button', { name: '先跳过', exact: true }).click()
  await page.getByRole('button', { name: '工作区时区' }).click()
  await page.getByRole('combobox', { name: '搜索城市或时区' }).fill('Asia/Shanghai')
  await page.keyboard.press('Enter')
  assert.match(await page.getByRole('button', { name: '工作区时区' }).innerText(), /Asia\/Shanghai/)
  await page.getByRole('combobox', { name: '三个月周期的起点', exact: true }).click()
  await page.getByRole('option', { name: '自选日期…', exact: true }).click()
  await page.getByLabel('自选起点日期', { exact: true }).fill('2026-01-31')
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  // 可选 Jev 步骤：两个同样可见的按钮，跳过后直接进入看板，不生成任何任务。
  await page.getByRole('button', { name: '连接 Jev', exact: true }).waitFor()
  await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).items.length, 0)
  const later = page.getByRole('textbox', { name: '新建到Later', exact: true })
  // Goals and the flow root live in 3个月; tasks go one horizon shorter, because a parent must sit in a longer horizon.
  const cycle = page.getByRole('textbox', { name: '新建到3个月', exact: true }), month = page.getByRole('textbox', { name: '新建到本月', exact: true })
  await page.getByRole('button', { name: '在3个月新建', exact: true }).click()
  for (const title of ['测试上级 A', '测试上级 B']) {
    await cycle.fill(title)
    await cycle.press('Enter')
    await page.getByRole('button', { name: title, exact: true }).waitFor()
  }
  // 复选框选择新流程：颜色归流程根所有。
  await page.getByRole('button', { name: '选择流程：不加入流程', exact: true }).click()
  await page.getByRole('option', { name: '新流程：蓝', exact: true }).click()
  await cycle.fill('测试流程')
  await cycle.press('Enter')
  await page.getByRole('button', { name: '测试流程', exact: true }).waitFor()
  await cycle.press('Escape')
  await page.getByRole('button', { name: '在本月新建', exact: true }).click()
  await month.fill('测试行动')
  await month.press('Enter')
  await page.getByRole('button', { name: '测试行动', exact: true }).waitFor()
  // 较短的列才能加入流程；之后的录入沿用该流程。
  await page.getByRole('button', { name: '选择流程：不加入流程', exact: true }).click()
  await page.getByRole('option', { name: '测试流程', exact: true }).click()
  await page.getByRole('button', { name: '选择流程：加入「测试流程」', exact: true }).waitFor()
  await month.fill('流程子任务')
  await month.press('Enter')
  await page.getByRole('button', { name: '流程子任务', exact: true }).waitFor()
  await month.press('Escape')
  const flowSnapshot = await page.evaluate(() => window.goalloom.getSnapshot())
  assert.deepEqual(flowSnapshot.flows.map(flow => [flow.title, flow.flowColor]), [['测试流程', 1]])
  assert.equal(flowSnapshot.relations.length, 1)
  await page.getByRole('button', { name: '只看 测试流程', exact: true }).click()
  assert.equal(await page.locator('[data-dimmed="true"]').count(), 3)
  await page.getByRole('button', { name: '全部', exact: true }).click()
  // 筛选快捷键按顶栏位置：⌘1 为全部，⌘2 起依次为流程；没有流程的位置不响应。
  const onlyFlow = page.getByRole('button', { name: '只看 测试流程', exact: true })
  await page.keyboard.press('ControlOrMeta+2')
  await page.getByRole('button', { name: '只看 测试流程', exact: true, pressed: true }).waitFor()
  assert.equal(await page.locator('[data-dimmed="true"]').count(), 3)
  await page.keyboard.press('ControlOrMeta+3')
  assert.equal(await onlyFlow.getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('ControlOrMeta+1')
  await page.getByRole('button', { name: '全部', exact: true, pressed: true }).waitFor()
  assert.equal(await page.locator('[data-dimmed="true"]').count(), 0)
  // 快捷键设置：录制改键、冲突警告、Esc 只取消录制，改键后全局生效，恢复默认。
  await page.keyboard.press('ControlOrMeta+Comma')
  const shortcutSettings = page.getByRole('dialog', { name: '设置与数据' })
  await shortcutSettings.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '快捷键', exact: true }).click()
  // 流程筛选只有一个开关：关闭后 ⌘2 不再切换，打开后恢复；示意图不显示真实流程名。
  const filterSwitch = shortcutSettings.getByRole('switch', { name: /\+ 数字切换顶栏筛选$/ })
  assert.equal(await filterSwitch.getAttribute('aria-checked'), 'true')
  assert.equal(await shortcutSettings.getByRole('figure', { name: '示意：顶栏位置与快捷键的对应关系' }).getByText('测试流程').count(), 0)
  await filterSwitch.click()
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('goalloom.shortcuts'))), { filters: false })
  await shortcutSettings.getByRole('button', { name: '关闭', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+2')
  assert.equal(await onlyFlow.getAttribute('aria-pressed'), 'false', '关闭流程筛选快捷键后 ⌘2 不响应')
  await page.keyboard.press('ControlOrMeta+Comma')
  await shortcutSettings.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '快捷键', exact: true }).click()
  await filterSwitch.click()
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('goalloom.shortcuts'))), {})
  const editPalette = shortcutSettings.getByRole('button', { name: '修改快捷键：打开搜索与命令', exact: true })
  await editPalette.click()
  await page.keyboard.press('j')
  await shortcutSettings.getByText('需要包含 ⌘/Ctrl 或 ⌥/Alt', { exact: true }).waitFor()
  await page.keyboard.press('ControlOrMeta+c')
  await shortcutSettings.getByText('该组合键由系统占用', { exact: true }).waitFor()
  await page.keyboard.press('ControlOrMeta+n')
  await shortcutSettings.getByRole('img', { name: '与「新建」使用相同按键', exact: true }).waitFor()
  await shortcutSettings.getByRole('img', { name: '与「打开搜索与命令」使用相同按键', exact: true }).waitFor()
  await mkdir('output/tests/screenshots', { recursive: true })
  await shortcutSettings.screenshot({ path: 'output/tests/screenshots/settings-shortcuts.png' })
  await editPalette.click()
  await page.keyboard.press('ControlOrMeta+j')
  assert.equal(await shortcutSettings.getByRole('img', { name: /使用相同按键/ }).count(), 0)
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('goalloom.shortcuts'))), { palette: 'Mod+J' })
  await shortcutSettings.getByRole('button', { name: '修改快捷键：新建', exact: true }).click()
  await page.keyboard.press('Escape')
  assert.equal(await shortcutSettings.getByRole('button', { name: '修改快捷键：新建', exact: true }).getAttribute('aria-pressed'), 'false')
  await shortcutSettings.getByRole('button', { name: '关闭', exact: true }).click()
  await shortcutSettings.waitFor({ state: 'hidden' })
  await page.keyboard.press('ControlOrMeta+k')
  assert.equal(await page.getByRole('dialog', { name: '搜索与命令' }).count(), 0)
  await page.keyboard.press('ControlOrMeta+j')
  await page.getByRole('dialog', { name: '搜索与命令' }).getByRole('button', { name: /^快捷键/ }).click()
  await shortcutSettings.getByRole('button', { name: '恢复默认', exact: true }).click()
  assert.equal(await shortcutSettings.getByRole('button', { name: '恢复默认', exact: true }).isDisabled(), true)
  await shortcutSettings.getByRole('button', { name: '关闭', exact: true }).click()
  await shortcutSettings.waitFor({ state: 'hidden' })
  // 详情里的流程色点紧贴复选框：点开 4×2 命名色板，选色即生效并收起。
  await page.getByRole('button', { name: '测试流程', exact: true }).click()
  const detail = page.getByRole('dialog', { name: '当前条目' })
  await detail.getByRole('button', { name: '流程颜色：蓝', exact: true }).click()
  await page.getByRole('radio', { name: '蓝', checked: true }).waitFor()
  await mkdir('output/tests/screenshots', { recursive: true })
  await page.getByRole('dialog', { name: '当前条目' }).screenshot({ path: 'output/tests/screenshots/item-detail-flow-color.png' })
  await page.getByRole('radio', { name: '青', exact: true }).click()
  await detail.getByRole('button', { name: '流程颜色：青', exact: true }).waitFor()
  assert.deepEqual((await page.evaluate(() => window.goalloom.getSnapshot())).flows.map(flow => flow.flowColor), [5])
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '流程子任务', exact: true }).click()
  await page.getByRole('img', { name: '流程：测试流程（跟随上级）', exact: true }).waitFor()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '测试行动', exact: true }).click()
  await page.getByLabel('说明', { exact: true }).fill('重启仍保留的说明')
  // 原生消息框的实际点击留给人工验收；只替换回答，窗口/退出/存储均是真实进程。
  // The beforeunload event can reach Playwright after the quit attempt returns. It stays handled for the rest of the
  // run: an unhandled one is auto-closed by Playwright after Electron already closed it, which crashes the runner.
  const interceptBeforeUnload = dialog => { if (dialog.type() === 'beforeunload') void dialog.dismiss().catch(() => undefined) }
  page.on('dialog', interceptBeforeUnload)
  const prompted = await application.evaluate(async ({ app, dialog }) => {
    const original = dialog.showMessageBoxSync
    let prompted = false
    dialog.showMessageBoxSync = () => { prompted = true; return 0 }
    try {
      app.quit()
      for (let attempt = 0; attempt < 50 && !prompted; attempt++) await new Promise(resolve => setTimeout(resolve, 10))
      return prompted
    } finally { dialog.showMessageBoxSync = original }
  })
  assert.equal(prompted, true)
  assert.equal(await page.getByLabel('说明', { exact: true }).inputValue(), '重启仍保留的说明')
  // 取消退出之后仍须能够提交，而不只是窗口尚在。
  await page.getByRole('button', { name: /^保存/ }).click()
  await page.getByRole('button', { name: /^保存/ }).waitFor({ state: 'hidden' })
  for (const title of ['测试上级 A', '测试上级 B']) {
    await page.getByRole('button', { name: '关联到…', exact: true }).click()
    await page.getByLabel('搜索上级条目', { exact: true }).fill(title)
    const option = page.locator('.relation-picker').getByRole('menuitemcheckbox', { name: title })
    await option.click()
    await page.locator('.relation-picker').getByRole('menuitemcheckbox', { name: title, checked: true }).waitFor()
    await page.getByRole('button', { name: '关联到…', exact: true }).click()
    await page.getByLabel('搜索上级条目', { exact: true }).waitFor({ state: 'hidden' })
  }
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  // 整行可拖动：从标题处按下拖到 3个月列。
  const handle = await page.getByRole('button', { name: '测试行动', exact: true }).boundingBox()
  const destination = await page.getByRole('region', { name: '3个月列', exact: true }).boundingBox()
  assert(handle && destination)
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(destination.x + destination.width / 2, destination.y + 140, { steps: 15 })
  await page.mouse.up()
  await page.getByRole('region', { name: '3个月列', exact: true }).getByRole('button', { name: '测试行动', exact: true }).waitFor()
  // dnd-kit swallows clicks for 50ms after a drop so the release never opens a row.
  await page.waitForTimeout(100)
  await page.getByRole('button', { name: '测试行动', exact: true }).click()
  // 移动入口是页眉的位置标签，点开即选列。
  await page.getByRole('button', { name: /^移动到：/ }).click()
  await page.getByRole('menuitemradio', { name: '今天', exact: true }).click()
  await page.getByRole('dialog', { name: '当前条目' }).getByText('今天', { exact: false }).first().waitFor()
  // 详情默认无底栏、活动折叠；截图供人工核对布局与滚动条位置。
  assert.equal(await page.getByRole('dialog', { name: '当前条目' }).locator('.modal-footer').count(), 0)
  await mkdir('output/tests/screenshots', { recursive: true })
  await page.getByRole('dialog', { name: '当前条目' }).screenshot({ path: 'output/tests/screenshots/item-detail.png' })
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '设置与数据', exact: true }).focus()
  // 全局 Cmd/Ctrl+N 打开 composer；未配置 Jev 时确认后只保存 1 条 Later，不拆分、不因“今天”换列。
  await page.keyboard.press('ControlOrMeta+n')
  const composer = page.getByRole('textbox', { name: '写下想法', exact: true })
  await composer.fill('今天写文案\n第二行说明')
  await page.getByRole('button', { name: /保存到 Later/ }).waitFor()
  await composer.press('Enter')
  await page.getByRole('dialog', { name: '新建' }).waitFor({ state: 'hidden' })
  const plain = (await page.evaluate(() => window.goalloom.getSnapshot())).items.find(item => item.title === '今天写文案')
  assert.equal(plain.placement.horizon, 'later')
  assert.equal((await page.evaluate(id => window.goalloom.getItem(id), plain.id)).item.description, '今天写文案\n第二行说明')
  const saved = await page.evaluate(() => window.goalloom.getSnapshot())
  assert.equal(saved.relations.length, 3)
  assert.equal((await page.evaluate(id => window.goalloom.getItem(id), saved.items.find(item => item.title === '测试行动').id)).item.description, '重启仍保留的说明')
  // --- 生命周期/会话撤销必须通过真实控件，验证当前列、列表和文本边界。 ---
  await page.getByRole('button', { name: '在Later新建', exact: true }).click()
  await later.fill('撤销内容保留')
  await later.press('Enter')
  await page.getByRole('button', { name: '撤销内容保留', exact: true }).waitFor()
  await later.press('Escape')
  await page.getByRole('button', { name: '撤销内容保留', exact: true }).click()
  await page.getByLabel('说明', { exact: true }).fill('撤销创建后必须保留的文本')
  await page.getByRole('button', { name: /^保存/ }).click()
  await page.locator('.sr-only[role="status"]', { hasText: '已连接本地工作区' }).waitFor({ state: 'attached' })
  assert.equal(await page.evaluate(async () => { const item = (await window.goalloom.listItems({ type: 'list', view: 'search', query: '撤销内容保留', offset: 0, limit: 50 })).items[0]; return (await window.goalloom.getItem(item.id)).item.description }), '撤销创建后必须保留的文本')
  await page.getByRole('button', { name: '关闭', exact: true }).focus()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '设置与数据', exact: true }).focus()
  await page.keyboard.press('ControlOrMeta+z')
  await page.locator('.toast').getByText('已撤销：创建「撤销内容保留」', { exact: true }).waitFor()
  await page.locator('.toast').getByRole('button', { name: '还原', exact: true }).click()
  await page.getByRole('button', { name: '撤销内容保留', exact: true }).waitFor()
  await page.getByRole('button', { name: '完成 撤销内容保留', exact: true }).click()
  await page.locator('.sr-only[role="status"]', { hasText: '已连接本地工作区' }).waitFor({ state: 'attached' })
  // 已完成/已取消/回收站都在设置的「条目」分类里；详情叠在设置之上，关闭后回到原列表。
  const settingsDialog = page.getByRole('dialog', { name: '设置与数据' })
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await settingsDialog.getByRole('button', { name: '已完成', exact: true }).click()
  await settingsDialog.getByRole('button', { name: '撤销内容保留 Later', exact: true }).click()
  await detail.waitFor()
  try { assert.equal(await detail.getByLabel('说明', { exact: true }).inputValue({ timeout: 5000 }), '撤销创建后必须保留的文本') } catch (error) { console.error(await page.locator('body').ariaSnapshot()); throw error }
  // 取消事项是低频操作，收在 ⋯ 菜单。
  await detail.getByRole('button', { name: '更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '取消事项', exact: true }).click()
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  await settingsDialog.getByRole('radio', { name: '取消', exact: true }).click()
  await settingsDialog.getByRole('button', { name: '撤销内容保留 Later', exact: true }).click()
  page.once('dialog', dialog => dialog.accept())
  await detail.getByRole('button', { name: '更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '移到回收站', exact: true }).click()
  await detail.waitFor({ state: 'hidden' })
  await settingsDialog.getByRole('button', { name: '回收站', exact: true }).click()
  await settingsDialog.getByRole('button', { name: '撤销内容保留 Later · 已取消', exact: true }).click()
  const trashed = page.getByRole('dialog', { name: '回收站条目' })
  try { assert.equal(await trashed.getByLabel('说明', { exact: true }).inputValue({ timeout: 5000 }), '撤销创建后必须保留的文本') } catch (error) { console.error(await page.locator('body').ariaSnapshot()); throw error }
  await trashed.getByRole('button', { name: '关闭', exact: true }).click()
  await settingsDialog.getByRole('button', { name: '关闭', exact: true }).click()
  await settingsDialog.waitFor({ state: 'hidden' })
  // 列显示只影响本机显示：隐藏 Later 后看板少一列，至少保留一列，全部显示恢复。
  await page.getByRole('button', { name: '显示的列', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Later', exact: true }).click()
  assert.equal(await page.getByRole('region', { name: 'Later列', exact: true }).count(), 0)
  for (const column of ['3个月', '本月', '本周']) await page.getByRole('menuitemcheckbox', { name: column, exact: true }).click()
  assert.equal(await page.getByRole('menuitemcheckbox', { name: '今天', exact: true }).isDisabled(), true, '最后一列不可隐藏')
  await page.getByRole('menuitem', { name: '全部显示', exact: true }).click()
  assert.equal(await page.locator('.board-column').count(), 5)
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => {
    const script = document.createElement('script')
    script.textContent = 'window.__unsafeInline = true'
    document.head.append(script)
    return window.__unsafeInline === undefined
  }), true, 'CSP 必须阻断内联脚本')
  // CDP 默认允许测试表达式绕过 unsafe-eval，必须显式关闭才验证真实 CSP。
  const cdp = await page.context().newCDPSession(page)
  const evalProbe = await cdp.send('Runtime.evaluate', {
    expression: "(() => { try { new Function('return 1')(); return false } catch { return true } })()",
    allowUnsafeEvalBlockedByCSP: false, returnByValue: true,
  })
  assert.equal(evalProbe.result.value, true, 'CSP 必须阻断 eval')
  await cdp.detach()
  assert.equal(await page.evaluate(async () => {
    try { await fetch('https://example.invalid/goalloom-csp-check'); return false } catch { return true }
  }), true, 'CSP 必须阻断远程连接')
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await page.getByRole('radio', { name: '深色', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.getByRole('radio', { name: '浅色', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.style), 'paper', '新工作区默认纸感风格')
  await mkdir('output/tests/screenshots', { recursive: true })
  await page.screenshot({ path: 'output/tests/screenshots/appearance-paper.png' })
  // 复选框样式默认透明描边；三种样式只换底色，流程色始终在描边上。
  const flowCheck = page.getByRole('button', { name: '完成 测试流程', exact: true })
  const checkFill = () => flowCheck.evaluate(element => { const style = getComputedStyle(element); return `${style.backgroundColor} ${style.backgroundImage}` })
  assert.equal(await page.evaluate(() => document.documentElement.dataset.check), 'outline', '新工作区默认透明描边')
  assert.equal(await checkFill(), 'rgba(0, 0, 0, 0) none')
  await page.getByRole('radio', { name: /^纸白底/ }).click()
  await page.waitForFunction(() => document.documentElement.dataset.check === 'paper')
  assert.equal(await checkFill(), 'rgb(255, 253, 250) none')
  await page.getByRole('radio', { name: /^同色淡底/ }).click()
  await page.waitForFunction(() => document.documentElement.dataset.check === 'tint')
  assert.match(await checkFill(), /rgb\(226, 240, 239\)/, '同色淡底使用流程自己的浅色')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'output/tests/screenshots/appearance-check-tint.png' })
  await page.getByRole('radio', { name: /^简约/ }).click()
  await page.waitForFunction(() => document.documentElement.dataset.style === 'minimal')
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)', '简约浅色使用纯白底')
  await page.waitForTimeout(300) // let the selection ring transition settle before capturing
  await page.screenshot({ path: 'output/tests/screenshots/appearance-minimal.png' })
  await page.getByRole('dialog', { name: '设置与数据' }).getByRole('button', { name: '关闭', exact: true }).click()
  await page.screenshot({ path: 'output/tests/screenshots/board-minimal-light.png' })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(9, 9, 11)', '简约深色使用 zinc-950 底')
  await page.screenshot({ path: 'output/tests/screenshots/board-minimal-dark.png' })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
  await page.setViewportSize({ width: 720, height: 600 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await page.evaluate(() => { location.hash = 'main' })
  assert.equal((await page.evaluate(() => window.goalloom.getRuntime())).sqlite, runtime.sqlite)
  const preferences = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences())
  for (const name of ['contextIsolation', 'sandbox', 'webSecurity']) assert.equal(preferences[name], true)
  assert.equal(preferences.nodeIntegration, false)
  if (packaged) {
    assert.equal(await application.evaluate(({ app }) => app.isPackaged), true)
    const canOpenDevTools = await application.evaluate(async ({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents
      contents.openDevTools({ mode: 'detach' })
      await new Promise(resolve => setTimeout(resolve, 100))
      return contents.isDevToolsOpened()
    })
    assert.equal(canOpenDevTools, false, '正式包不能打开 DevTools')
  }
  const appPath = await application.evaluate(({ app }) => app.getAppPath())
  const rejectsOtherWindow = await application.evaluate(async ({ BrowserWindow }, preload) => {
    const other = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } })
    try {
      await other.loadURL('goalloom://app/index.html')
      return await other.webContents.executeJavaScript('window.goalloom.getRuntime().then(() => false, () => true)')
    } finally { other.destroy() }
  }, join(appPath, 'out/preload/index.cjs'))
  assert.equal(rejectsOtherWindow, true, 'IPC 必须拒绝非主窗口的请求，即使 URL 与 preload 相同')
  await mkdir('output/tests/screenshots', { recursive: true })
  await page.screenshot({ path: 'output/tests/screenshots/electron-foundation.png', fullPage: true })
  console.log(JSON.stringify({ packaged: Boolean(packaged), runtime, checks: ['cancel unsaved quit keeps storage available (native answer stub)', 'preload', 'worker SQLite', 'CSP inline/eval/connect', 'theme', 'style', '720px layout', 'sandbox', 'hash navigation IPC', 'reject untrusted IPC sender'] }))
} finally {
  await application.close()
}
try {
  const reopened = await electron.launch({ ...options, env: environment, timeout: 30_000 })
  try {
    const page = await reopened.firstWindow()
    await page.getByRole('main', { name: '时间看板' }).waitFor()
    const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
    assert.equal(snapshot.items.length, 6)
    assert.equal(snapshot.relations.length, 3)
    assert.deepEqual(snapshot.flows.map(flow => flow.title), ['测试流程'])
    assert.equal(snapshot.items.find(item => item.title === '测试行动').placement.horizon, 'day')
    assert.equal(snapshot.workspace.style, 'minimal')
    assert.equal(snapshot.workspace.checkStyle, 'tint')
    await page.waitForFunction(() => document.documentElement.dataset.style === 'minimal')
    console.log('真实进程重启：6 个条目、3 条关联、流程颜色、唯一位置和界面风格均保留。')
  } finally { await reopened.close() }
} finally { await rm(profile, { recursive: true, force: true }) }
