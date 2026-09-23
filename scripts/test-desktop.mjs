import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

// 独立自动化进程通过标准调试协议测试；正式应用没有测试 IPC/时钟/数据入口。
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2]
const options = packaged ? { executablePath: resolve(packaged), args: [] } : { args: ['.'] }
const application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
try {
  const page = await application.firstWindow()
  await page.getByRole('status').filter({ hasText: '桌面存储引擎已就绪' }).waitFor()
  console.log(await page.locator('body').ariaSnapshot())
  assert.deepEqual(await page.evaluate(() => Object.keys(window.goalloom)), ['getRuntime'])
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined')
  const runtime = await page.evaluate(() => window.goalloom.getRuntime())
  assert.match(runtime.sqlite, /^3\./)
  assert.equal(runtime.electron, '44.4.4')
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
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
  await page.getByRole('button', { name: '浅色主题', exact: true }).click()
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light')
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
