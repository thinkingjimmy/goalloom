/**
 * [INPUT]: Built main/preload, production/development renderer and controlled worker reply delivery in isolated profiles.
 * [OUTPUT]: Repeatable preflight cancellation, session ownership and StrictMode UI evidence without model calls.
 * [POS]: Native IPC E2E; uses real storage and narrowly delays replies, with no production test hooks.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 * Failure cases: cancelled preflight rejects IPC; an older completion/error deletes its replacement;
 * cancellation during generation lookup returns a ticket; pending sessions escape the limit;
 * genuine read errors disappear; development StrictMode shows a false error or loses the current ticket.
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir, cpus, release } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { finishSetup } from '../fixtures/setup.mjs'

const out = resolve('output/tests/assistance')
await mkdir(out, { recursive: true })

async function run(mode) {
  const profile = await mkdtemp(join(tmpdir(), 'Goalloom preflight regression '))
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
  const report = { ok: false, mode, checks: [], scope: 'Source native Electron, real main/preload/SQLite, synthetic worker delivery and no provider calls; no packaged, Windows or physical IME acceptance',
    host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model, physicalOrVm: 'unverified' } }
  let server, application, page
  const stderr = [], rendererErrors = []
  const checked = text => { report.checks.push(text); console.log(`✓ preflight ${mode}: ${text}`) }
  try {
    if (mode === 'development') {
      server = await createServer({ root: resolve('src/renderer'), configFile: false, cacheDir: resolve('node_modules/.vite-assistance-preflight'), plugins: [react(), tailwind()],
        server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve('.')] } } })
      await server.listen(); env.ELECTRON_RENDERER_URL = server.resolvedUrls.local[0]
    }
    application = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
    application.process().stderr.on('data', bytes => stderr.push(bytes.toString()))
    page = await application.firstWindow()
    page.on('pageerror', error => rendererErrors.push(error.message))
    await finishSetup(page, { skipAi: true })
    report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
    await installDeliveryFixture(application)
    const identity = await page.evaluate(async () => {
      const { workspace } = await window.goalloom.getSnapshot()
      const created = await window.goalloom.execute({ type: 'create', generation: workspace.generation, operationId: crypto.randomUUID(), title: 'Synthetic preflight task', horizon: 'week' })
      if (!created.ok) throw Error(created.message)
      window.preflightReplies = {}
      return { itemId: created.result.itemId, generation: workspace.generation }
    })
    const detail = page.locator('dialog.detail'), panel = detail.locator('.assistance-panel')
    await page.locator(`#item-${identity.itemId} .task-title`).click(); await detail.locator('.activity-insight').waitFor()
    if (mode === 'development') {
      const completed = await completionCount(application)
      await arm(application, 'context', 2)
      await detail.locator('.execution-help button').first().click()
      await waitHeld(application, 2)
      await releaseOne(application)
      await waitCompleted(application, completed + 1)
      await releaseAll(application)
      await page.waitForFunction(() => document.querySelector('.assistance-panel')?.getAttribute('aria-busy') === 'false')
      assert.equal(await panel.getByRole('alert').count(), 0)
      await panel.getByText('Synthetic preflight task', { exact: true }).waitFor()
      await panel.screenshot({ path: `${out}/preflight-strict-mode.png` })
      await panel.getByRole('button', { name: 'Back to task', exact: true }).click()
      checked('StrictMode effect setup/cleanup preserves the replacement preflight without an alert')
    }
    const completed = await completionCount(application), deliveries = mode === 'development' ? 2 : 1
    await arm(application, 'context', deliveries)
    await detail.locator('.execution-help button').first().click(); await waitHeld(application, deliveries)
    await panel.getByRole('button', { name: 'Back to task', exact: true }).click()
    await panel.waitFor({ state: 'detached' })
    await releaseAll(application); await waitCompleted(application, completed + deliveries)
    checked('closing during the local read cancels normally and leaves no IPC failure')

    await arm(application, 'context', 1)
    const cancelled = await start(page, identity, 'cancelled')
    await waitHeld(application, 1); await cancel(page, cancelled.sessionId); await releaseAll(application)
    assert.equal((await reply(page, 'cancelled')).reply.type, 'cancelled')
    checked('explicit preflight cancellation is a valid preload reply')

    for (const failure of [false, true]) {
      await arm(application, 'context', 2)
      const old = await start(page, identity, `older-${failure}`)
      await waitHeld(application, 1)
      await start(page, identity, `newer-${failure}`, old.sessionId, 'fr')
      await waitHeld(application, 2)
      if (!failure) {
        await releaseOne(application); assert.equal((await reply(page, `older-${failure}`)).reply.type, 'cancelled')
        await releaseOne(application)
      } else {
        await releaseOne(application, 1)
        assert.equal((await reply(page, `newer-${failure}`)).reply.type, 'assistancePrepared')
        await releaseOne(application, 0, 'failed')
        assert.equal((await reply(page, `older-${failure}`)).reply.type, 'cancelled')
      }
      const ready = await reply(page, `newer-${failure}`)
      assert.equal(ready.reply.type, 'assistancePrepared'); assert.equal(ready.reply.prepared.locale, 'fr')
      await verifyTicket(page, ready.reply.prepared); await cancel(page, old.sessionId)
    }
    checked('older read completion and failure cannot remove a pending or ready replacement with the same session ID')

    await arm(application, 'generation', 1)
    const duringGeneration = await start(page, identity, 'during-generation')
    await waitHeld(application, 1); await cancel(page, duringGeneration.sessionId); await releaseAll(application)
    assert.equal((await reply(page, 'during-generation')).reply.type, 'cancelled')
    checked('cancellation during the final generation read cannot publish a ticket')

    await arm(application, 'generation', 1)
    const stale = await start(page, identity, 'stale-generation')
    await waitHeld(application, 1); await releaseOne(application, 0, 'generation')
    assert.equal((await reply(page, 'stale-generation')).reply.type, 'cancelled'); await cancel(page, stale.sessionId)
    checked('a changed workspace generation is discarded without rejecting IPC')

    await arm(application, 'context', 9)
    const sessions = []
    for (let index = 0; index < 9; index++) sessions.push(await start(page, identity, `bounded-${index}`))
    await waitHeld(application, 9); await releaseAll(application)
    assert.equal((await reply(page, 'bounded-0')).reply.type, 'cancelled')
    for (let index = 1; index < 9; index++) assert.equal((await reply(page, `bounded-${index}`)).reply.type, 'assistancePrepared')
    for (const session of sessions) await cancel(page, session.sessionId)
    checked('the eight-session limit applies while context reads are still pending')
    const cancellationFailures = await application.evaluate(() => globalThis.preflightDelivery.completed.filter(row => !row.ok))
    assert.deepEqual(cancellationFailures, [])
    assert.equal(stderr.join('').includes("Error occurred in handler for 'goalloom:smart'"), false)
    report.cancelledIpcErrors = 0

    await arm(application, 'context', 1)
    await start(page, identity, 'real-failure'); await waitHeld(application, 1); await releaseOne(application, 0, 'failed')
    assert.equal((await reply(page, 'real-failure')).ok, false)
    checked('a genuine uncancelled context read failure remains an error')
    report.providerCalls = await application.evaluate(() => globalThis.preflightDelivery.providerCalls)
    assert.equal(report.providerCalls, 0); assert.deepEqual(rendererErrors, [])
    report.ok = true
  } catch (error) {
    report.error = error.stack
    report.ipcErrors = stderr.join('').split('\n').filter(line => line.includes("Error occurred in handler for 'goalloom:smart'"))
    if (application) report.nativeWindows = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible() })))
    if (page) {
      report.document = await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState,
        active: { tag: document.activeElement?.tagName, id: document.activeElement?.id, role: document.activeElement?.getAttribute('role'), label: document.activeElement?.getAttribute('aria-label') } }))
      await page.screenshot({ path: `${out}/preflight-${mode}-failure.png` }).catch(() => undefined)
    }
    throw error
  } finally {
    if (application) await releaseAll(application).catch(() => undefined)
    await writeFile(`${out}/preflight-${mode}-report.json`, JSON.stringify(report, null, 2))
    await application?.close(); await server?.close(); await rm(profile, { recursive: true, force: true })
  }
}
async function start(page, identity, key, sessionId, locale = 'en') {
  const request = { ...identity, sessionId: sessionId ?? crypto.randomUUID(), locale }
  await page.evaluate(({ request, key }) => {
    window.goalloom.smart({ type: 'prepareAssistance', request }).then(value => { window.preflightReplies[key] = { ok: true, reply: value } }, error => { window.preflightReplies[key] = { ok: false, message: error.message } })
  }, { request, key })
  return request
}
async function reply(page, key) {
  await page.waitForFunction(key => Object.hasOwn(window.preflightReplies, key), key)
  const value = await page.evaluate(key => window.preflightReplies[key], key)
  if (!value.ok && key !== 'real-failure') throw Error(`Unexpected IPC rejection for ${key}: ${value.message}`)
  return value
}
async function verifyTicket(page, prepared) {
  const result = await page.evaluate(prepared => window.goalloom.smart({ type: 'assist', request: {
    requestId: crypto.randomUUID(), sessionId: prepared.sessionId, generation: prepared.generation, itemId: prepared.itemId, contextId: prepared.contextId,
    locale: prepared.locale, featureRevision: prepared.featureRevision, inputRevision: 0, manualRevision: 0, turn: 1, text: 'Synthetic explicit request', answer: null, adjustment: null,
  } }), prepared)
  assert.equal(result.type, 'assistance'); assert.equal(result.reply.status, 'failed'); assert.equal(result.reply.failure.kind, 'not_enabled')
}
const cancel = (page, sessionId) => page.evaluate(sessionId => window.goalloom.smart({ type: 'cancelAssistance', sessionId }), sessionId)
const completionCount = application => application.evaluate(() => globalThis.preflightDelivery.completed.length)
const arm = (application, stage, count) => application.evaluate((_, value) => { globalThis.preflightDelivery.arm = value }, { stage, count })
const waitHeld = (application, count) => application.evaluate((_, count) => globalThis.preflightDelivery.wait('held', count), count)
const waitCompleted = (application, count) => application.evaluate((_, count) => globalThis.preflightDelivery.wait('completed', count), count)
const releaseOne = (application, index = 0, mode = 'ready') => application.evaluate((_, value) => globalThis.preflightDelivery.release(value.index, value.mode), { index, mode })
const releaseAll = application => application.evaluate(() => { while (globalThis.preflightDelivery.held.length) globalThis.preflightDelivery.release(0, 'ready') })

async function installDeliveryFixture(application) {
  await application.evaluate(({ ipcMain }) => {
    const { Worker } = process.getBuiltinModule('worker_threads'), { AsyncLocalStorage } = process.getBuiltinModule('async_hooks')
    const scope = new AsyncLocalStorage(), gates = new Map(), waiting = []
    const fixture = { arm: null, held: [], completed: [], providerCalls: 0,
      wait(kind, count) {
        if (fixture[kind].length >= count) return Promise.resolve()
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error(`Controlled ${kind} delivery did not arrive`)), 5000)
          waiting.push({ kind, count, resolve: () => { clearTimeout(timer); resolve() } })
        })
      },
      release(index, mode) { fixture.held.splice(index, 1)[0].send(mode) },
    }
    globalThis.preflightDelivery = fixture
    const notify = () => { for (let index = waiting.length - 1; index >= 0; index--) if (fixture[waiting[index].kind].length >= waiting[index].count) waiting.splice(index, 1)[0].resolve() }
    const post = Worker.prototype.postMessage, emit = Worker.prototype.emit
    Worker.prototype.postMessage = function(message, ...args) {
      const tag = scope.getStore(), stage = message?.method === 'metadata' ? 'generation' : message?.method === 'query' && message.argument?.type === 'assistanceContext' ? 'context' : null
      if (tag?.type === 'prepareAssistance' && fixture.arm?.stage === stage && fixture.arm.count > 0) {
        fixture.arm.count--; gates.set(`${this.threadId}:${message.id}`, stage)
      }
      return post.call(this, message, ...args)
    }
    Worker.prototype.emit = function(event, message, ...args) {
      const key = `${this.threadId}:${message?.id}`
      if (event === 'message' && gates.has(key)) {
        gates.delete(key)
        fixture.held.push({ send: mode => {
          const result = mode === 'failed' ? { id: message.id, ok: false, code: 'read', message: 'Synthetic context read failure' }
            : mode === 'generation' ? { ...message, value: { ...message.value, workspace: { ...message.value.workspace, generation: 'synthetic-replaced-generation' } } } : message
          emit.call(this, event, result, ...args)
        } })
        notify(); return true
      }
      return emit.call(this, event, message, ...args)
    }
    const handler = ipcMain._invokeHandlers.get('goalloom:smart')
    ipcMain.removeHandler('goalloom:smart')
    ipcMain.handle('goalloom:smart', (event, action) => scope.run(action, async () => {
      try { const reply = await handler(event, action); if (action.type === 'prepareAssistance') { fixture.completed.push({ ok: true, type: reply.type }); notify() }; return reply }
      catch (error) { if (action.type === 'prepareAssistance') { fixture.completed.push({ ok: false }); notify() }; throw error }
    }))
    globalThis.fetch = async () => { fixture.providerCalls++; throw Error('Preflight must not use the network') }
  })
}

for (const mode of process.argv.includes('--development') ? ['development'] : ['development', 'production']) await run(mode)
