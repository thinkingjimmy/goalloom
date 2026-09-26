/**
 * [INPUT]: Source or packaged Electron executable and an isolated device profile.
 * [OUTPUT]: Native hide/show evidence without Playwright's Electron focus and background overrides.
 * [POS]: Completion acceptance helper; CDP drives the real UI and Node inspector controls only its native window.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import electronPath from 'electron'
import { chromium } from 'playwright'

function endpoints(process) {
  return new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`Native visibility launch timed out: ${output}`)), 15000)
    const fail = error => { clearTimeout(timeout); reject(error) }
    process.once('error', fail)
    process.once('exit', code => fail(new Error(`Native visibility process exited with ${code}: ${output}`)))
    process.stderr.on('data', data => {
      output = (output + data.toString()).slice(-16000)
      const node = /Debugger listening on (ws:\/\/\S+)/.exec(output)?.[1]
      const browser = /DevTools listening on (ws:\/\/\S+)/.exec(output)?.[1]
      if (node && browser) { clearTimeout(timeout); resolve({ node, browser }) }
    })
  })
}

async function inspector(url) {
  const socket = new WebSocket(url), pending = new Map()
  let sequence = 0
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data), request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id); clearTimeout(request.timeout)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Inspector ${method} timed out`)) }, 5000)
    pending.set(id, { resolve, reject, timeout })
    socket.send(JSON.stringify({ id, method, params }))
  })
  await send('Runtime.enable', {})
  return {
    async evaluate(expression) {
      const reply = await send('Runtime.evaluate', { expression, includeCommandLineAPI: true, awaitPromise: true, returnByValue: true })
      if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text)
      return reply.result.value
    },
    close() { socket.close() },
  }
}

export async function verifyNativeCelebrationVisibility(packaged, environment) {
  const profile = await mkdtemp(join(tmpdir(), 'goalloom-native-celebration-'))
  await mkdir(profile, { recursive: true })
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  const args = ['--inspect=0', '--remote-debugging-port=0', ...(!packaged ? ['.'] : []), `--user-data-dir=${profile}`]
  const process = spawn(packaged ? resolve(packaged) : electronPath, args, { env: environment, stdio: ['ignore', 'ignore', 'pipe'] })
  const exited = new Promise(resolve => process.once('exit', resolve))
  let browser, node
  try {
    const urls = await endpoints(process)
    node = await inspector(urls.node)
    // The regular Electron driver installs focus emulation and disables background handling. Neither belongs in this check.
    browser = await chromium.connectOverCDP(urls.browser, { noDefaults: true })
    const context = browser.contexts()[0]
    const page = context.pages()[0] ?? await context.waitForEvent('page')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.getByRole('button', { name: '先跳过', exact: true }).click()
    await page.getByRole('button', { name: '确认并开始', exact: true }).click()
    await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
    await page.getByRole('main', { name: '时间看板' }).waitFor()
    await page.getByRole('button', { name: '在本周新建', exact: true }).click()
    const input = page.getByRole('textbox', { name: '新建到本周', exact: true })
    await input.fill('Native window celebration')
    await input.press('Enter')
    await input.press('Escape')
    await page.getByRole('button', { name: '完成 Native window celebration', exact: true }).click()
    await page.locator('canvas.completion-celebration:popover-open').waitFor()
    const visible = await page.evaluate(() => document.visibilityState)
    assert.equal(visible, 'visible')
    const started = Date.now()
    const nativeHidden = await node.evaluate('(() => { const window = require("electron").BrowserWindow.getAllWindows()[0]; window.hide(); return !window.isVisible(); })()')
    assert.equal(nativeHidden, true)
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas.completion-celebration')
      return document.visibilityState === 'hidden' && !!canvas && !canvas.matches(':popover-open') && canvas.width === 1 && canvas.height === 1 && !canvas.hasAttribute('data-operation-id')
    }, null, { polling: 50, timeout: 1000 })
    const hidden = await page.evaluate(() => document.visibilityState)
    const cleanupMs = Date.now() - started
    await node.evaluate('(() => { const window = require("electron").BrowserWindow.getAllWindows()[0]; window.show(); window.focus(); })()')
    await page.waitForFunction(() => document.visibilityState === 'visible', null, { polling: 50, timeout: 1000 })
    assert.equal(await page.locator('canvas.completion-celebration:popover-open').count(), 0)
    return { driver: 'Raw Electron + CDP noDefaults + Node inspector', runtime: await page.evaluate(() => window.goalloom.getRuntime()), nativeHidden, visible, hidden, shown: 'visible', cleanupMs, replayed: false }
  } finally {
    if (node) await node.evaluate('require("electron").app.quit()').catch(() => undefined)
    node?.close()
    if (browser) await browser.close().catch(() => undefined)
    const timer = setTimeout(() => process.kill('SIGTERM'), 5000)
    await exited
    clearTimeout(timer)
    await rm(profile, { recursive: true, force: true })
  }
}
