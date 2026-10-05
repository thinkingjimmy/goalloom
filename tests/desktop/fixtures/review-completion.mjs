/**
 * [INPUT]: An isolated native weekly review, its period fixture, an explicit create/skip variant and production IPC/storage.
 * [OUTPUT]: Automatic close, persistent entry suppression, failed/unknown writes and actual confetti/motion/preference evidence.
 * [POS]: Completion-only group of weekly-review; faults wrap main IPC while retaining actual transactions and receipts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'

export async function verifyReviewCompletion({ page, app, fixture, mode, variant, out, scenario, check }) {
  const reducedMotion = mode === 'week-last' && variant === 'create', disabled = mode === 'week-last' && variant === 'skip'
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
  if (disabled) {
    await page.evaluate(() => localStorage.setItem('goalloom.celebration', JSON.stringify({ week: false })))
    await page.reload(); await page.locator('.board').waitFor()
  }
  await page.evaluate(() => {
    window.reviewBursts = {}
    const original = CanvasRenderingContext2D.prototype.translate
    CanvasRenderingContext2D.prototype.translate = function (x, y) {
      const id = this.canvas.dataset.operationId
      if (id?.startsWith('review:')) {
        const burst = window.reviewBursts[id] ??= { origins: [], viewport: { width: innerWidth, height: innerHeight } }
        if (burst.origins.length < 2) burst.origins.push({ x, y })
      }
      return original.call(this, x, y)
    }
  })
  const entry = page.locator('[data-review]')
  await entry.click()
  const drawer = page.locator('.review-drawer[open]')
  await drawer.locator('.review-body[aria-busy=false]').waitFor()
  await drawer.locator('.review-head .icon-button').click()
  await drawer.waitFor({ state: 'hidden' })
  assert.equal(await entry.innerText(), '继续复盘')
  await entry.click()
  for (let step = 0; step < 3; step++) {
    await drawer.locator('.review-body[aria-busy=false]').waitFor()
    if (await drawer.locator('.review-plan-list').count()) { await drawer.locator('.review-plan-row').first().waitFor(); break }
    const previous = await drawer.locator('.review-steps [aria-current=step]').textContent()
    await drawer.locator('.review-foot .primary:not(:disabled)').click()
    await page.waitForFunction(previous => document.querySelector('.review-drawer[open] [aria-current=step]')?.textContent !== previous, previous)
  }
  const rows = drawer.locator('.review-plan-row'), title = `Confirmed review step ${mode} ${variant}`
  const key = `week:${fixture.period.startDate}`
  const reviewed = () => page.evaluate(key => JSON.parse(localStorage.getItem('goalloom.insight')).reviewed.includes(key), key)
  const revision = () => page.evaluate(() => window.goalloom.getSnapshot().then(snapshot => snapshot.workspace.revision))
  assert.equal(await rows.count(), 2)
  await rows.first().locator('.seed-title').fill(title)
  await rows.nth(1).getByRole('combobox').click()
  await drawer.getByRole('option', { name: '不排入', exact: true }).click()
  const before = await revision()
  assert.equal(await reviewed(), false)
  if (variant === 'create') {
    await app.evaluate(({ ipcMain }, mode) => {
      const command = ipcMain._invokeHandlers.get('goalloom:command'), query = ipcMain._invokeHandlers.get('goalloom:query')
      globalThis.completionFault = { first: true, blockReceipt: false }
      ipcMain.removeHandler('goalloom:command')
      ipcMain.handle('goalloom:command', async (event, input) => {
        const fault = globalThis.completionFault
        if (input.type === 'createPlan' && fault.first) {
          fault.first = false
          if (mode === 'week-first') return { ok: false, code: 'stale', message: 'Synthetic review plan rejection' }
          const result = await command(event, input)
          if (result.ok) { fault.blockReceipt = true; throw Error('Synthetic lost review receipt') }
          return result
        }
        return command(event, input)
      })
      ipcMain.removeHandler('goalloom:query')
      ipcMain.handle('goalloom:query', (event, input) => {
        if (input.type === 'receipt' && globalThis.completionFault.blockReceipt) throw Error('Synthetic receipt check unavailable')
        return query(event, input)
      })
    }, mode)
    await drawer.locator('.review-foot .primary').click()
    await drawer.getByRole('alert').waitFor()
    assert.equal(await page.locator('canvas.completion-celebration:popover-open').count(), 0, 'Unconfirmed review never celebrates')
    assert.equal(await reviewed(), false, 'A failed or unknown write must not mark completion')
    assert.equal(await entry.innerText(), '继续复盘')
    assert.equal(await rows.first().locator('.seed-title').inputValue(), title)
    if (mode === 'week-first') assert.equal(await revision(), before)
    else assert.equal(await drawer.getByRole('button', { name: '不排入', exact: true }).isDisabled(), true, 'Unknown plan receipt blocks skipping')
    await drawer.screenshot({ path: `${out}/${mode}-${variant}-unconfirmed.png` })
    await app.evaluate(() => { globalThis.completionFault.blockReceipt = false })
    await drawer.locator('.review-foot .primary').click()
  } else await drawer.getByRole('button', { name: '不排入', exact: true }).click()
  await drawer.waitFor({ state: 'detached' })
  assert.equal(await page.locator('[data-review]').count(), 0, 'Completion removes the entry immediately without reload')
  assert.equal(await page.getByRole('heading', { name: '复盘完成', exact: true }).count(), 0)
  assert.equal(await reviewed(), true)
  const canvas = page.locator('canvas.completion-celebration')
  if (!reducedMotion && !disabled) {
    await page.locator('canvas.completion-celebration:popover-open').waitFor()
    const bursts = await page.evaluate(() => window.reviewBursts)
    assert.equal(Object.keys(bursts).length, 1, 'Review completion plays exactly one burst')
    const burst = Object.values(bursts)[0]
    assert.deepEqual(burst.origins, [{ x: 0, y: burst.viewport.height }, { x: burst.viewport.width, y: burst.viewport.height }])
    scenario.confetti = { played: true, bursts }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas.completion-celebration')
      return canvas.width === 1 && canvas.height === 1 && !canvas.matches(':popover-open') && !canvas.hasAttribute('data-operation-id')
    })
    assert.equal(await canvas.getAttribute('width'), '1')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    assert.equal(await page.locator('canvas.completion-celebration:popover-open').count(), 0, 'Turning motion back on does not replay')
  } else {
    assert.equal(await page.locator('canvas.completion-celebration:popover-open').count(), 0)
    assert.deepEqual(await page.evaluate(() => window.reviewBursts), {})
    scenario.confetti = { played: false, reducedMotion, disabled }
  }
  const result = await page.evaluate(async ({ fixture, title }) => {
    const snapshot = await window.goalloom.getSnapshot()
    const context = await window.goalloom.getReviewContext({ type: 'reviewContext', generation: snapshot.workspace.generation,
      periods: [{ horizon: 'week', startDate: fixture.period.startDate }] })
    return { items: context.planning.items.filter(item => item.title === title), relations: context.planning.relations }
  }, { fixture, title })
  assert.equal(result.items.length, variant === 'create' ? 1 : 0)
  if (variant === 'create') assert(result.relations.some(edge => edge.parentId === fixture.parent && edge.childId === result.items[0].id))
  else assert.equal(await revision(), before, 'Explicit skip creates no tasks')
  scenario.completion = { variant, key, created: result.items.map(item => ({ id: item.id, period: item.placement.periodId })) }
  await page.screenshot({ path: `${out}/${mode}-${variant}-board.png` })
  await page.reload()
  await page.locator('.board').waitFor()
  assert.equal(await page.locator('canvas.completion-celebration:popover-open').count(), 0)
  assert.equal(await page.locator('[data-review]').count(), 0)
  assert.equal(await reviewed(), true)
  check('Final confirmed plan/skip closes review, removes its entry immediately and persists completion without duplicate tasks')
}
