import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'

// 独立自动化进程通过标准调试协议测试；正式应用没有测试 IPC/时钟/数据入口。
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2]
const profile = await mkdtemp(join(tmpdir(), 'Goalloom 窗口测试 '))
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
try {
  const page = await application.firstWindow()
  page.on('pageerror', error => console.error(error.message))
  await page.getByRole('button', { name: '确认并开始', exact: true }).waitFor()
  console.log(await page.locator('body').ariaSnapshot())
  assert.deepEqual((await page.evaluate(() => Object.keys(window.goalloom))).sort(), ['execute', 'exportWorkspace', 'getActivity', 'getHistory', 'getItem', 'getReceipt', 'getRuntime', 'getSnapshot', 'listItems'])
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined')
  const runtime = await page.evaluate(() => window.goalloom.getRuntime())
  assert.match(runtime.sqlite, /^3\./)
  assert.equal(runtime.electron, '44.4.4')
  await page.getByLabel('工作区时区', { exact: true }).fill('Asia/Shanghai')
  await page.getByLabel('三个月周期的起点').fill('2026-01-31')
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  for (const title of ['测试上级 A', '测试上级 B', '测试行动']) {
    await page.getByRole('button', { name: '在Later新建', exact: true }).click()
    await page.getByRole('textbox', { name: '新建到Later', exact: true }).fill(title)
    await page.getByRole('button', { name: '添加到Later', exact: true }).click()
    await page.getByRole('button', { name: title, exact: true }).waitFor()
  }
  await page.getByRole('button', { name: '测试行动', exact: true }).click()
  await page.getByLabel('说明', { exact: true }).fill('重启仍保留的说明')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('button', { name: '保存', exact: true }).waitFor({ state: 'visible' })
  for (const title of ['测试上级 A', '测试上级 B']) {
    await page.getByRole('button', { name: '关联到…', exact: true }).click()
    await page.getByLabel('搜索上级条目', { exact: true }).fill(title)
    await page.locator('.relation-picker').getByRole('button', { name: title, exact: true }).click()
    await page.getByLabel('搜索上级条目', { exact: true }).waitFor({ state: 'hidden' })
  }
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  const handle = await page.getByRole('button', { name: '拖动 测试行动', exact: true }).boundingBox()
  const destination = await page.getByRole('region', { name: '3个月列', exact: true }).boundingBox()
  assert(handle && destination)
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(destination.x + destination.width / 2, destination.y + 140, { steps: 15 })
  await page.mouse.up()
  await page.getByRole('region', { name: '3个月列', exact: true }).getByRole('button', { name: '测试行动', exact: true }).waitFor()
  await page.getByRole('button', { name: '测试行动', exact: true }).click()
  await page.getByLabel('移动到', { exact: true }).selectOption('day')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  const saved = await page.evaluate(() => window.goalloom.getSnapshot())
  assert.equal(saved.relations.length, 2)
  assert.equal(saved.items.find(item => item.title === '测试行动').description, '重启仍保留的说明')
  // --- 生命周期/会话撤销必须通过真实控件，验证当前列、列表和文本边界。 ---
  await page.getByRole('button', { name: '在Later新建', exact: true }).click()
  await page.getByRole('textbox', { name: '新建到Later', exact: true }).fill('撤销内容保留')
  await page.getByRole('button', { name: '添加到Later', exact: true }).click()
  await page.getByRole('button', { name: '撤销内容保留', exact: true }).click()
  await page.getByLabel('说明', { exact: true }).fill('撤销创建后必须保留的文本')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForFunction(async () => (await window.goalloom.listItems({ type: 'list', view: 'search', query: '撤销内容保留', offset: 0, limit: 50 })).items[0]?.description === '撤销创建后必须保留的文本')
  await page.getByText('已连接本地工作区', { exact: true }).waitFor()
  await page.getByRole('button', { name: '关闭', exact: true }).focus()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '撤销上一步', exact: true }).click()
  await page.locator('.toast').getByText('已撤销：创建「撤销内容保留」', { exact: true }).waitFor()
  await page.locator('.toast').getByRole('button', { name: '还原', exact: true }).click()
  await page.getByRole('button', { name: '撤销内容保留', exact: true }).waitFor()
  await page.getByRole('button', { name: '完成 撤销内容保留', exact: true }).click()
  await page.getByText('已连接本地工作区', { exact: true }).waitFor()
  await page.getByRole('button', { name: '已完成', exact: true }).click()
  await page.getByRole('button', { name: '撤销内容保留 Later · 已完成', exact: true }).click()
  await page.getByRole('dialog', { name: '当前条目' }).waitFor()
  try { assert.equal(await page.getByLabel('说明', { exact: true }).inputValue({ timeout: 5000 }), '撤销创建后必须保留的文本') } catch (error) { console.error(await page.locator('body').ariaSnapshot()); throw error }
  await page.getByRole('button', { name: '取消事项', exact: true }).click()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '已取消', exact: true }).click()
  await page.getByRole('button', { name: '撤销内容保留 Later · 已取消', exact: true }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '移到回收站', exact: true }).click()
  await page.getByRole('button', { name: '回收站', exact: true }).click()
  await page.getByRole('button', { name: '撤销内容保留 Later · 已取消', exact: true }).click()
  try { assert.equal(await page.getByLabel('说明', { exact: true }).inputValue({ timeout: 5000 }), '撤销创建后必须保留的文本') } catch (error) { console.error(await page.locator('body').ariaSnapshot()); throw error }
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '时间看板', exact: true }).click()
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
  await page.getByRole('button', { name: '深色主题', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.getByRole('button', { name: '浅色主题', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  await page.setViewportSize({ width: 720, height: 600 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await page.getByRole('link', { name: 'Goalloom 首页', exact: true }).click()
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
  await mkdir('output/playwright', { recursive: true })
  await page.screenshot({ path: 'output/playwright/electron-foundation.png', fullPage: true })
  console.log(JSON.stringify({ packaged: Boolean(packaged), runtime, checks: ['preload', 'worker SQLite', 'CSP inline/eval/connect', 'theme', '720px layout', 'sandbox', 'hash navigation IPC', 'reject untrusted IPC sender'] }))
} finally {
  await application.close()
}
try {
  const reopened = await electron.launch({ ...options, env: environment, timeout: 30_000 })
  try {
    const page = await reopened.firstWindow()
    await page.getByRole('main', { name: '时间看板' }).waitFor()
    const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
    assert.equal(snapshot.items.length, 3)
    assert.equal(snapshot.relations.length, 2)
    assert.equal(snapshot.items.find(item => item.title === '测试行动').placement.horizon, 'day')
    console.log('真实进程重启：3 个条目、2 个上级关联和唯一位置均保留。')
  } finally { await reopened.close() }
} finally { await rm(profile, { recursive: true, force: true }) }
