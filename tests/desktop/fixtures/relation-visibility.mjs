/**
 * [INPUT]: Source or packaged Electron executable, isolated profile and relation evidence directory.
 * [OUTPUT]: Native hide/show cancellation, screenshots and visibility evidence without foreground emulation.
 * [POS]: Relation acceptance's native boundary; raw CDP preserves actual document visibility.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { finishSetup } from './setup.mjs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import electronPath from 'electron'
import { chromium } from 'playwright'

function endpoints(child) {
  return new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(Error(`Native relation launch timed out: ${output}`)), 15000)
    const fail = error => { clearTimeout(timeout); reject(error) }
    child.once('error', fail); child.once('exit', code => fail(Error(`Native relation process exited ${code}: ${output}`)))
    child.stderr.on('data', data => {
      output = (output + data.toString()).slice(-16000)
      const node = /Debugger listening on (ws:\/\/\S+)/.exec(output)?.[1], browser = /DevTools listening on (ws:\/\/\S+)/.exec(output)?.[1]
      if (node && browser) { clearTimeout(timeout); resolve({ node, browser }) }
    })
  })
}
async function inspector(url) {
  const socket = new WebSocket(url), pending = new Map(); let sequence = 0
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data), request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id); clearTimeout(request.timeout)
    if (message.error) request.reject(Error(message.error.message)); else request.resolve(message.result)
  })
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence, timeout = setTimeout(() => { pending.delete(id); reject(Error(`Inspector ${method} timed out`)) }, 5000)
    pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params }))
  })
  await send('Runtime.enable', {})
  return {
    async evaluate(expression) {
      const reply = await send('Runtime.evaluate', { expression, includeCommandLineAPI: true, awaitPromise: true, returnByValue: true })
      if (reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text)
      return reply.result.value
    },
    close() { socket.close() },
  }
}
export async function verifyRelationVisibility(packaged, env, evidence) {
  const profile = await mkdtemp(join(tmpdir(), 'goalloom-relation-visibility-'))
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  const child = spawn(packaged ? resolve(packaged) : electronPath, ['--inspect=0', '--remote-debugging-port=0', ...(!packaged ? ['.'] : []), `--user-data-dir=${profile}`], { env, stdio: ['ignore', 'ignore', 'pipe'] })
  const exited = new Promise(resolve => child.once('exit', resolve))
  let browser, node
  try {
    const urls = await endpoints(child); node = await inspector(urls.node)
    browser = await chromium.connectOverCDP(urls.browser, { noDefaults: true })
    const context = browser.contexts()[0], page = context.pages()[0] ?? await context.waitForEvent('page')
    page.setDefaultTimeout(12000)
    await node.evaluate('require("electron").BrowserWindow.getAllWindows()[0].setContentSize(1500, 900)')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await finishSetup(page)
    await page.locator('.board').waitFor(); await page.locator('#later-toggle').click()
    const source = await page.evaluate(async () => {
      const generation = (await window.goalloom.getSnapshot()).workspace.generation
      const reply = await window.goalloom.execute({ type: 'create', horizon: 'day', title: 'Native cancellation', generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw Error(reply.message); return reply.result.itemId
    })
    const row = page.locator(`#item-${source}`); await row.hover()
    const dot = await row.locator('.flow-dot-button').boundingBox()
    await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2); await page.mouse.down()
    await page.mouse.move(dot.x - 20, dot.y + dot.height / 2); await page.locator('.relation-drag').waitFor()
    const screenshots = [join(evidence, 'native-visible.png'), join(evidence, 'native-restored.png')]
    await page.screenshot({ path: screenshots[0] })
    assert.equal(await page.evaluate(() => document.visibilityState), 'visible')
    const started = Date.now()
    const nativeHidden = await node.evaluate('(() => { const w = require("electron").BrowserWindow.getAllWindows()[0]; w.hide(); return !w.isVisible(); })()')
    assert.equal(nativeHidden, true)
    await page.waitForFunction(() => document.visibilityState === 'hidden' && !document.querySelector('.relation-drag, [data-relation-source], [data-relation-target]'), null, { polling: 50 })
    const cleanupMs = Date.now() - started, hidden = await page.evaluate(() => document.visibilityState)
    await node.evaluate('require("electron").BrowserWindow.getAllWindows()[0].show()')
    await page.waitForFunction(() => document.visibilityState === 'visible', null, { polling: 50 }); await page.mouse.up()
    assert.equal(await page.locator('.relation-drag').count(), 0)
    assert.equal(await page.evaluate(async () => (await window.goalloom.getSnapshot()).relations.length), 0)
    await page.screenshot({ path: screenshots[1] })
    return { driver: 'Raw Electron + CDP noDefaults + Node inspector', nativeHidden, hidden, shown: 'visible', cleanupMs, noWrite: true, screenshots }
  } finally {
    if (node) await node.evaluate('require("electron").app.quit()').catch(() => undefined)
    node?.close(); if (browser) await browser.close().catch(() => undefined)
    const timer = setTimeout(() => child.kill('SIGTERM'), 5000)
    await exited; clearTimeout(timer); await rm(profile, { recursive: true, force: true })
  }
}
