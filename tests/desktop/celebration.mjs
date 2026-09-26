/**
 * [INPUT]: A source or packaged Electron executable, production IPC fixtures and real UI actions.
 * [OUTPUT]: Completion feedback, per-column preferences and canvas lifecycle acceptance with screenshots and JSON evidence.
 * [POS]: Isolated desktop acceptance; no mocked receipts, synthetic completion events or real workspace data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, tmpdir, version } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { verifyNativeCelebrationVisibility } from './fixtures/celebration-visibility.mjs'

const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2], profile = await mkdtemp(join(tmpdir(), 'goalloom-celebration-'))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const shots = 'output/tests/screenshots'
await mkdir(shots, { recursive: true })
const defaults = { later: false, cycle: true, month: true, week: true, day: false }
const labels = { later: 'Later', cycle: '3个月', month: '本月', week: '本周', day: '今天' }
const checks = [], errors = []
const report = {
  packaged: Boolean(packaged), runtime: null,
  environment: { platform: platform(), release: release(), version: version(), arch: arch(), cpu: cpus()[0]?.model, machineScope: process.env.GOALLOOM_TEST_MACHINE_SCOPE ?? 'Host OS reported; physical/VM status not independently verified' },
  checks, screenshots: [], pixels: {},
}
let application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
let applicationClosed = false
let page, ids
const canvas = () => page.locator('canvas.completion-celebration')
const openCanvas = () => page.locator('canvas.completion-celebration:popover-open')
const settings = () => page.getByRole('dialog', { name: '设置与数据', exact: true })
const detail = () => page.getByRole('dialog', { name: '当前条目', exact: true })
const setting = horizon => settings().getByRole('switch', { name: `${labels[horizon]} · 完成撒花`, exact: true })
const state = id => page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)

async function connectPage() {
  page = await application.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1880, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
}
async function observe() {
  await page.evaluate(() => {
    window.celebrationEvidence = { opened: 0, closed: 0 }
    document.addEventListener('toggle', event => {
      if (event.target instanceof HTMLCanvasElement && event.target.matches('.completion-celebration')) {
        window.celebrationEvidence[event.newState === 'open' ? 'opened' : 'closed']++
      }
    }, true)
  })
}
async function openSettings() {
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await settings().getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '外观', exact: true }).click()
  await settings().getByRole('heading', { name: '完成撒花', exact: true }).waitFor()
}
async function closeSettings() {
  await settings().getByRole('button', { name: '关闭', exact: true }).click()
  await settings().waitFor({ state: 'hidden' })
}
async function dismissFeedback() {
  const close = page.getByRole('button', { name: '关闭操作提示', exact: true })
  if (await close.count()) await close.click()
  assert.equal(await page.locator('.toast').count(), 0)
}
async function assertSettings(expected) {
  for (const [horizon, enabled] of Object.entries(expected)) assert.equal(await setting(horizon).getAttribute('aria-checked'), String(enabled), `${horizon} setting`)
}
async function setSettings(expected) {
  for (const [horizon, enabled] of Object.entries(expected)) {
    if ((await setting(horizon).getAttribute('aria-checked')) !== String(enabled)) await setting(horizon).click()
    assert.equal(await setting(horizon).getAttribute('aria-checked'), String(enabled))
  }
}
async function shot(name) {
  const path = `${shots}/${name}.png`
  await page.screenshot({ path })
  report.screenshots.push(path)
}
async function assertSilentCompletion(title, enabled, fromDetail = false) {
  await dismissFeedback()
  const before = await page.evaluate(() => window.celebrationEvidence.opened)
  const button = fromDetail ? detail().getByRole('button', { name: '标记完成', exact: true }) : page.getByRole('button', { name: `完成 ${title}`, exact: true })
  await button.click()
  await page.waitForFunction(async id => (await window.goalloom.getItem(id)).item.status === 'done', ids[title])
  if (enabled) await openCanvas().waitFor({ state: 'visible', timeout: 3000 })
  else {
    // The snapshot may precede the accepted receipt by one render; observe through that boundary.
    await page.waitForTimeout(250)
    assert.equal(await page.evaluate(() => window.celebrationEvidence.opened), before, `${title} should not celebrate`)
    assert.equal(await openCanvas().count(), 0)
  }
  assert.equal(await page.locator('.toast').count(), 0, `${title} completion should not show a toast`)
}
async function waitForCleanup(timeout = 4000) {
  // Reduced-motion CSS can hide pixels before the media-query effect closes the popover and releases its buffer.
  // Fixed polling also works when a native hidden window suspends requestAnimationFrame.
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas.completion-celebration')
    return !canvas || (!canvas.matches(':popover-open') && canvas.width === 1 && canvas.height === 1 && !canvas.hasAttribute('data-operation-id'))
  }, null, { polling: 100, timeout })
}
async function pixelEvidence() {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas.completion-celebration:popover-open')
    if (!canvas) return false
    const context = canvas.getContext('2d'), pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data
    if (!pixels) return false
    let left = 0, right = 0
    for (let index = 3; index < pixels.length; index += 16) if (pixels[index]) {
      if (Math.floor(index / 4) % canvas.width < canvas.width / 2) left++
      else right++
    }
    return left > 10 && right > 10
  }, null, { timeout: 1500 })
  return canvas().evaluate(node => {
    const pixels = node.getContext('2d').getImageData(0, 0, node.width, node.height).data
    let left = 0, right = 0
    for (let index = 3; index < pixels.length; index += 16) if (pixels[index]) {
      if (Math.floor(index / 4) % node.width < node.width / 2) left++
      else right++
    }
    return { left, right, width: node.width, height: node.height, pointerEvents: getComputedStyle(node).pointerEvents, popover: node.popover }
  })
}

try {
  await connectPage()
  await page.getByRole('button', { name: '先跳过', exact: true }).click()
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())

  const fixtures = [
    ...Object.keys(defaults).map(horizon => [`Default ${horizon}`, horizon]),
    ...Object.keys(defaults).map(horizon => [`Override ${horizon}`, horizon]),
    ['Move to week', 'day'], ['Move to day', 'week'], ['Drag move', 'day'],
    ['Detail completion', 'week'], ['Consecutive one', 'week'], ['Consecutive two', 'week'],
    ['Reduced motion', 'week'], ['Reduce during animation', 'week'],
    ['Archived completion', 'week'], ['Replace during animation', 'week'],
  ]
  ids = await page.evaluate(async fixtures => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const result = {}
    for (const [title, horizon] of fixtures) {
      const reply = await window.goalloom.execute({ type: 'create', title, horizon, generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw new Error(reply.message)
      result[title] = reply.result.itemId
    }
    const reply = await window.goalloom.execute({ type: 'archive', itemId: result['Archived completion'], expectedVersion: 1, archived: true, generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw new Error(reply.message)
    return result
  }, fixtures)
  await page.reload()
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  await observe()
  assert.equal(await openCanvas().count(), 0, 'Initial and external fixture snapshots never celebrate')

  await openSettings()
  await assertSettings(defaults)
  await setting('day').scrollIntoViewIfNeeded()
  await shot('settings-completion-celebration')
  await closeSettings()
  for (const [horizon, enabled] of Object.entries(defaults)) {
    await assertSilentCompletion(`Default ${horizon}`, enabled)
    if (enabled) {
      if (horizon === 'week') {
        await page.waitForTimeout(850)
        report.pixels.board = await pixelEvidence()
        assert.equal(report.pixels.board.pointerEvents, 'none')
        assert.equal(report.pixels.board.popover, 'manual')
        await shot('completion-celebration-corners')
      }
      await waitForCleanup()
    }
  }
  checks.push('Five default settings and real board completions; both canvas halves render; no success toast')

  // Completing again after undo gets a fresh receipt and celebrates again.
  await page.getByRole('button', { name: '设置与数据', exact: true }).focus()
  await page.keyboard.press('ControlOrMeta+z')
  await page.getByRole('button', { name: '完成 Default day', exact: true }).waitFor()
  await page.locator('.toast [role="status"]').filter({ hasText: '已撤销' }).waitFor()
  assert.equal(await openCanvas().count(), 0)
  await dismissFeedback()
  await page.keyboard.press('ControlOrMeta+z')
  await page.getByRole('button', { name: '完成 Default week', exact: true }).waitFor()
  await page.locator('.toast [role="status"]').filter({ hasText: '已撤销' }).waitFor()
  assert.equal(await openCanvas().count(), 0)
  await assertSilentCompletion('Default week', true)
  await waitForCleanup()
  checks.push('Keyboard undo retains visible feedback without celebration; completing again celebrates')

  // Both move entry points stay quiet, remain undoable and use the destination preference.
  for (const [title, horizon, enabled] of [['Move to week', 'week', true], ['Move to day', 'day', false]]) {
    await page.getByRole('button', { name: title, exact: true }).click()
    await detail().getByRole('button', { name: /^移动到：/ }).click()
    await page.getByRole('menuitemradio', { name: labels[horizon], exact: true }).click()
    await page.waitForFunction(async ({ id, horizon }) => (await window.goalloom.getItem(id)).item.placement.horizon === horizon, { id: ids[title], horizon })
    assert.equal(await page.locator('.toast').count(), 0)
    await detail().getByRole('button', { name: '关闭', exact: true }).click()
    await assertSilentCompletion(title, enabled)
    if (enabled) await waitForCleanup()
  }
  const source = await page.getByRole('button', { name: 'Drag move', exact: true }).boundingBox()
  const destination = await page.getByRole('region', { name: '本周列', exact: true }).boundingBox()
  assert(source && destination)
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(destination.x + destination.width / 2, destination.y + 135, { steps: 15 })
  await page.mouse.up()
  await page.getByRole('region', { name: '本周列', exact: true }).getByRole('button', { name: 'Drag move', exact: true }).waitFor()
  assert.equal(await page.locator('.toast').count(), 0)
  await page.keyboard.press('ControlOrMeta+z')
  await page.getByRole('region', { name: '今天列', exact: true }).getByRole('button', { name: 'Drag move', exact: true }).waitFor()
  await page.locator('.toast [role="status"]').filter({ hasText: '已撤销' }).waitFor()
  await dismissFeedback()
  checks.push('Detail and drag moves have no toast; drag keyboard undo works; destination column controls celebration')

  await page.getByRole('button', { name: 'Detail completion', exact: true }).click()
  await assertSilentCompletion('Detail completion', true, true)
  await page.waitForTimeout(850)
  report.pixels.detail = await pixelEvidence()
  assert.equal(await canvas().evaluate(node => document.activeElement === node), false)
  assert.equal(await detail().evaluate(node => node.contains(document.activeElement)), true, 'Detail retains focus')
  const hit = await detail().getByRole('button', { name: '关闭', exact: true }).evaluate(node => {
    const rect = node.getBoundingClientRect()
    return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
  })
  assert.equal(hit, true, 'Confetti passes pointer hit testing through to the native modal')
  await shot('completion-celebration-detail')
  await detail().getByRole('button', { name: '关闭', exact: true }).click()
  await detail().waitFor({ state: 'hidden' })
  await waitForCleanup()
  checks.push('Native detail completion renders both corners above the modal, retains focus and allows closing through particles')

  await assertSilentCompletion('Consecutive one', true)
  await page.waitForTimeout(1300)
  const restartedAt = Date.now()
  await assertSilentCompletion('Consecutive two', true)
  const secondOperationId = await canvas().getAttribute('data-operation-id')
  assert(secondOperationId)
  assert.equal(await canvas().count(), 1)
  await page.waitForTimeout(1400)
  assert.equal(await openCanvas().count(), 1, 'Second completion restarts the duration')
  await waitForCleanup()
  report.restartDurationMs = Date.now() - restartedAt
  assert(report.restartDurationMs >= 2300 && report.restartDurationMs < 4000)
  checks.push('Consecutive completion restarts one canvas and clears about 2.5 seconds after the last completion')
  const receipts = await page.evaluate(async ({ itemId, operationId }) => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const replay = await window.goalloom.execute({ type: 'status', itemId, status: 'done', expectedVersion: 1, generation, operationId })
    const item = (await window.goalloom.getItem(itemId)).item
    const noop = await window.goalloom.execute({ type: 'status', itemId, status: 'done', expectedVersion: item.version, generation, operationId: crypto.randomUUID() })
    const stale = await window.goalloom.execute({ type: 'status', itemId, status: 'done', expectedVersion: 999999, generation, operationId: crypto.randomUUID() })
    return { replay, noop, stale }
  }, { itemId: ids['Consecutive two'], operationId: secondOperationId })
  assert.equal(receipts.replay.ok, true)
  assert.equal(receipts.replay.result.operationId, secondOperationId)
  assert.equal(receipts.noop.ok, true)
  assert.equal(receipts.noop.result.changed, false)
  assert.equal(receipts.stale.ok, false)
  await page.waitForTimeout(250)
  assert.equal(await openCanvas().count(), 0)
  assert.equal(await page.locator('.toast').count(), 0)
  checks.push('Authoritative receipt replay, no-op completion and stale rejection do not start another effect')
  await page.getByRole('button', { name: '搜索与命令', exact: true }).click()
  await page.getByRole('dialog', { name: '搜索与命令', exact: true }).getByRole('button', { name: /^撤销上一步/ }).click()
  await page.getByRole('button', { name: '完成 Consecutive two', exact: true }).waitFor()
  await page.locator('.toast [role="status"]').filter({ hasText: '已撤销' }).waitFor()
  assert.equal(await openCanvas().count(), 0)
  await dismissFeedback()
  checks.push('Command palette undo remains available after a silent completion and gives visible feedback')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openSettings()
  await settings().getByRole('status').filter({ hasText: '系统已开启「减少动态效果」，撒花暂不播放。' }).waitFor()
  await assertSettings(defaults)
  await closeSettings()
  await assertSilentCompletion('Reduced motion', false)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await assertSilentCompletion('Reduce during animation', true)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await waitForCleanup(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  assert.equal(await openCanvas().count(), 0, 'Turning reduced motion off does not replay a completion')
  checks.push('Reduced motion suppresses new effects, clears a running effect and is explained without changing settings')

  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).items.some(item => item.id === ids['Archived completion']), false)
  await openSettings()
  await settings().getByRole('button', { name: '已完成', exact: true }).click()
  await settings().getByRole('radio', { name: /^归档/ }).click()
  await settings().getByRole('button', { name: /Archived completion/ }).click()
  await assertSilentCompletion('Archived completion', true, true)
  assert((await state(ids['Archived completion'])).archivedAt, 'Completion does not unarchive the item')
  await detail().getByRole('button', { name: '关闭', exact: true }).click()
  await closeSettings()
  await waitForCleanup()
  checks.push('Archived detail outside the current snapshot uses its actual horizon and stays archived')

  // Every preference remains available when its column is hidden and changes no workspace revision.
  await page.getByRole('button', { name: '显示的列', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Later', exact: true }).click()
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('region', { name: 'Later列', exact: true }).count(), 0)
  const revision = (await page.evaluate(() => window.goalloom.getSnapshot())).workspace.revision
  await openSettings()
  const inverted = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, !value]))
  await setSettings(inverted)
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('goalloom.celebration'))), inverted)
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.revision, revision)
  await closeSettings()
  await application.close()
  application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
  await connectPage()
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  await observe()
  await openSettings()
  await assertSettings(inverted)
  await closeSettings()
  await page.getByRole('button', { name: '显示的列', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Later', exact: true }).click()
  await page.keyboard.press('Escape')
  for (const [horizon, enabled] of Object.entries(inverted)) {
    await assertSilentCompletion(`Override ${horizon}`, enabled)
    if (enabled) await waitForCleanup()
  }
  checks.push('Five independent overrides survive process restart, affect their own column, remain configurable when hidden and do not mutate workspace history')

  // Corrupted device state must not prevent startup or enable accidental effects.
  for (const invalid of ['{broken', '{"week":"yes"}', 'null', '[]']) {
    await page.evaluate(value => localStorage.setItem('goalloom.celebration', value), invalid)
    await page.reload()
    await page.getByRole('main', { name: '时间看板' }).waitFor()
    await openSettings()
    await assertSettings(defaults)
    await closeSettings()
  }
  await observe()
  checks.push('Malformed JSON and invalid preference shapes recover all defaults')

  // A real protected reset changes the generation while the last UI completion is still animating.
  await assertSilentCompletion('Replace during animation', true)
  const replaced = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const preview = await window.goalloom.data({ type: 'previewReset', generation })
    if (preview.type !== 'preview') throw new Error('Expected reset preview')
    const prepared = await window.goalloom.data({ type: 'prepare', generation, token: preview.preview.token })
    if (prepared.type !== 'preview' || !prepared.preview.backup) throw new Error('Expected a verified protective backup')
    const activeBeforeCommit = !!document.querySelector('canvas.completion-celebration:popover-open')
    const result = await window.goalloom.data({ type: 'commit', generation, token: prepared.preview.token, acknowledged: true })
    return { before: generation, activeBeforeCommit, ...result }
  })
  assert.equal(replaced.type, 'replaced')
  assert.equal(replaced.activeBeforeCommit, true, 'Reset commits while the effect is active')
  assert.notEqual(replaced.before, replaced.generation)
  await page.getByRole('textbox', { name: '三个月的方向', exact: true }).waitFor()
  await waitForCleanup(1000)
  checks.push('Verified protective workspace reset clears the old-generation animation')

  assert.deepEqual(errors, [])
  report.rendererErrors = errors
  await application.close()
  applicationClosed = true
  report.nativeVisibility = await verifyNativeCelebrationVisibility(packaged, environment)
  checks.push('Raw native window hide clears animation within one second and showing it does not replay')
  await writeFile('output/tests/celebration.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  if (!applicationClosed) await application.close()
  await rm(profile, { recursive: true, force: true })
}
