/**
 * [INPUT]: Built Electron main/preload, development or built renderer, isolated profiles and synthetic provider responses.
 * [OUTPUT]: Repeatable generation regression reports and screenshots in output/tests/insight/generation/.
 * [POS]: Desktop acceptance of batch drafting, Settings trials and review lifecycle through the real IPC and storage paths; provider transport is controlled.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, release, tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { pollPage } from './fixtures/poll.mjs'

const out = resolve('output/tests/insight/generation')
await mkdir(out, { recursive: true })
const modes = process.argv.includes('--development') ? ['development'] : ['development', 'production']
for (const mode of modes) await run(mode)

async function run(mode) {
  const profile = await mkdtemp(join(tmpdir(), 'Goalloom generation regression '))
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  let server, application, page
  const report = { mode, ok: false, scope: 'Source Electron, real preload/main/SQLite, synthetic provider transport, isolated profile; no packaged or Windows acceptance', host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model }, checks: [] }
  const check = label => { report.checks.push(label); console.log(`✓ ${mode}: ${label}`) }
  try {
    if (mode === 'development') {
      server = await createServer({ root: resolve('src/renderer'), configFile: false, cacheDir: resolve('node_modules/.vite-insight'), plugins: [react(), tailwind()],
        server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve('.')] } } })
      await server.listen()
      env.ELECTRON_RENDERER_URL = server.resolvedUrls.local[0]
    }
    application = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
    page = await application.firstWindow()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width: 1440, height: 900 })
    await application.evaluate(({ ipcMain }) => {
      globalThis.generationFixture = { mode: 'ready', sequence: 0, calls: [], bridgeErrors: [] }
      const original = ipcMain._invokeHandlers.get('goalloom:smart')
      ipcMain.removeHandler('goalloom:smart')
      ipcMain.handle('goalloom:smart', async (...args) => {
        if (globalThis.generationFixture.mode === 'bridge-failure' && ['draft', 'review'].includes(args[1].type)) throw Error('Synthetic bridge failure')
        try { return await original(...args) }
        catch (error) { globalThis.generationFixture.bridgeErrors.push({ type: args[1].type, message: error.message }); throw error }
      })
      globalThis.fetch = async (url, init) => {
        if (url === 'https://openrouter.ai/api/v1/systemone') return Response.json({ model: 'typesafe/jev-1.13', answers: {
          horizon: { type: 'choice', choice: 'day', probabilities: { day: 0.97, week: 0.02, later: 0.01 } }, task: { type: 'noul', noul: 0.99 },
        }, usage: { input_tokens: 120, output_tokens: 3 } })
        if (url !== 'https://openrouter.ai/api/v1/chat/completions') throw Error('Unexpected network request')
        const fixture = globalThis.generationFixture, body = JSON.parse(init.body), input = JSON.parse(body.messages[1].content)
        const sequence = ++fixture.sequence, responseMode = fixture.mode
        fixture.calls.push({ sequence, kind: input.tasks ? 'draft' : 'review', count: input.tasks?.length ?? 0, reasoning: body.reasoning, format: body.response_format })
        await new Promise(resolve => setTimeout(resolve, 700))
        if (responseMode === 'unavailable') return Response.json({ error: { code: 503 } }, { status: 503 })
        const value = input.tasks ? { items: input.tasks.map((task, index) => ({ id: task.id, title: `Draft ${sequence} step ${index + 1}`, why: 'Synthetic next step' })) }
          : { headline: 'Synthetic review summary', advice: 'Review one open plan', flags: [] }
        return Response.json({ choices: [{ message: { content: responseMode === 'malformed' ? 'Invalid JSON' : JSON.stringify(value) } }] })
      }
    })
    await page.getByRole('button', { name: '先跳过', exact: true }).click()
    await page.getByRole('button', { name: '确认并开始', exact: true }).click()
    await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
    const board = page.getByRole('main', { name: '时间看板' })
    await board.waitFor()
    report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
    await page.evaluate(async () => {
      const generation = (await window.goalloom.getSnapshot()).workspace.generation
      const connected = await window.goalloom.smart({ type: 'connect', generation, provider: 'openrouter', apiKey: 'synthetic-key-only', consent: true })
      if (connected.type !== 'status' || !connected.test?.ok) throw Error('Synthetic provider connection failed')
      for (let index = 1; index <= 7; index++) {
        const reply = await window.goalloom.execute({ type: 'create', title: `Synthetic plan ${index}`, horizon: 'month', generation, operationId: crypto.randomUUID() })
        if (!reply.ok) throw Error(reply.message)
      }
    })
    await page.reload()
    await board.waitFor()
    const setMode = value => application.evaluate((_, value) => { globalThis.generationFixture.mode = value }, value)
    const calls = () => application.evaluate(() => globalThis.generationFixture.calls)
    const revision = () => page.evaluate(async () => (await window.goalloom.getSnapshot()).workspace.revision)
    const beforeTrial = await revision()
    await page.keyboard.press('ControlOrMeta+,')
    const settings = page.locator('dialog.settings-modal')
    await settings.getByRole('button', { name: '洞察', exact: true }).click()
    const trial = settings.locator('.insight-trial'), generate = settings.getByRole('button', { name: '生成', exact: true })
    await generate.click()
    await trial.getByText('Review one open plan', { exact: true }).waitFor()
    assert.equal(await trial.locator('[role="alert"]').count(), 0)
    assert.equal(await revision(), beforeTrial)
    assert.deepEqual((await calls()).map(call => call.kind).sort(), ['draft', 'review'])
    await page.screenshot({ path: `${out}/${mode}-settings.png` })
    check('Settings generates both results once without workspace writes')
    await setMode('unavailable')
    await generate.click()
    await trial.getByRole('alert').waitFor()
    await generate.waitFor({ state: 'visible' })
    await setMode('ready')
    await generate.click()
    await trial.getByText('Review one open plan', { exact: true }).waitFor()
    assert.equal(await trial.locator('[role="alert"]').count(), 0)
    assert.equal(await revision(), beforeTrial)
    check('Settings leaves loading on failure and succeeds on retry')
    await page.keyboard.press('Escape')
    await settings.waitFor({ state: 'detached' })

    const draftButton = board.locator('[data-horizon="week"]').getByRole('button', { name: '为 7 项各起一步', exact: true })
    const dialog = page.getByRole('dialog', { name: '新建', exact: true })
    const settled = () => pollPage(page, () => document.querySelectorAll('.seed-title').length === 7 && ![...document.querySelectorAll('.seed-title')].some(input => input.placeholder === '正在起草…'), undefined, { timeout: 5000, label: 'batch leaves loading' })
    let before = (await calls()).length
    await draftButton.click()
    await dialog.locator('.seed-title').first().fill('User edited step')
    await dialog.locator('.seed-row').nth(6).getByRole('checkbox').uncheck()
    await settled()
    assert.equal((await calls()).length - before, 1, 'one model request across effect replay')
    assert.equal(await dialog.locator('.seed-title').first().inputValue(), 'User edited step')
    assert.equal(await dialog.locator('.seed-row').nth(6).getByRole('checkbox').isChecked(), false)
    assert.equal(await dialog.locator('.seed-title').evaluateAll(inputs => inputs.filter(input => input.value.trim()).length), 7)
    assert.equal(await dialog.getByRole('button', { name: /创建 6 项/ }).isEnabled(), true)
    await page.screenshot({ path: `${out}/${mode}-batch.png` })
    check('seven drafts settle once, preserve typed text and unchecked rows, and enable creation')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })

    for (const fault of ['unavailable', 'malformed', 'bridge-failure']) {
      await setMode(fault)
      await draftButton.click()
      await settled()
      await dialog.getByRole('alert').waitFor()
      await dialog.locator('.seed-title').first().fill('Manual fallback step')
      assert.equal(await dialog.getByRole('button', { name: /创建 1 项/ }).isEnabled(), true)
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
    }
    check('provider, malformed-response and bridge failures show feedback and allow manual entry')
    await setMode('ready')
    await draftButton.click()
    await dialog.locator('.seed-title').first().waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    before = (await calls()).length
    await draftButton.click()
    await settled()
    const newCalls = (await calls()).slice(before)
    assert.equal(newCalls.length, 1)
    assert.equal(await dialog.locator('.seed-title').first().inputValue(), `Draft ${newCalls[0].sequence} step 1`)
    await dialog.getByRole('button', { name: /创建 7 项/ }).click()
    await dialog.waitFor({ state: 'detached' })
    const written = await page.evaluate(async () => {
      const state = await window.goalloom.getSnapshot()
      return { items: state.items.filter(item => item.placement.horizon === 'week').length, relations: state.relations.length }
    })
    assert.deepEqual(written, { items: 7, relations: 7 })
    check('reopened composer ignores old results and commits seven linked steps')

    const entry = board.locator('[data-review]')
    report.reviewAvailable = await entry.count() > 0
    if (report.reviewAvailable) {
      before = (await calls()).length
      await entry.click()
      const drawer = page.locator('.review-drawer')
      await drawer.locator('.review-headline').getByText('Synthetic review summary', { exact: true }).waitFor()
      assert.equal((await calls()).length - before, 1)
      await drawer.getByRole('button', { name: /下一步/ }).click()
      await drawer.getByRole('button', { name: /下一步/ }).click()
      await drawer.getByRole('button', { name: /下一步|排入/ }).click()
      await drawer.getByText('复盘完成', { exact: true }).waitFor()
      await page.screenshot({ path: `${out}/${mode}-review.png` })
      check('review summary settles once and the drawer advances through completion')
    }
    assert.deepEqual(errors, [])
    report.calls = await calls()
    assert.deepEqual(await application.evaluate(() => globalThis.generationFixture.bridgeErrors), [])
    for (const call of report.calls) {
      assert.deepEqual(call.reasoning, { enabled: false })
      assert.deepEqual(call.format, { type: 'json_object' })
    }
    report.ok = true
  } catch (error) {
    report.error = error.message
    if (page && !page.isClosed()) await page.screenshot({ path: `${out}/${mode}-failure.png` }).catch(() => {})
    throw error
  } finally {
    await writeFile(`${out}/${mode}-report.json`, JSON.stringify(report, null, 2))
    await application?.close()
    await server?.close()
    await rm(profile, { recursive: true, force: true })
  }
}
