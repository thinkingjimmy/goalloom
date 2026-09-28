/**
 * [INPUT]: Isolated Electron history page with current and closed periods.
 * [OUTPUT]: Filter navigation, identity, shortcut guards, scroll and future-draft evidence.
 * [POS]: History acceptance through native UI input and the production bridge.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'

export async function verifyFilterNavigation(page) {
  const created = await page.evaluate(async () => {
    const { generation } = (await window.goalloom.getSnapshot()).workspace
    const results = []
    for (const [horizon, flowColor, title] of [['month', 0, 'Filter month flow'], ['day', 1, 'Filter day flow']]) {
      results.push(await window.goalloom.execute({ type: 'create', horizon, flowColor, title, generation, operationId: crypto.randomUUID() }))
    }
    return results
  })
  assert(created.every(result => result.ok), JSON.stringify(created))
  const monthFlow = page.getByRole('button', { name: '只看 Filter month flow', exact: true })
  const dayFlow = page.getByRole('button', { name: '只看 Filter day flow', exact: true })
  const all = page.getByRole('button', { name: '全部', exact: true })
  await monthFlow.waitFor()
  await dayFlow.waitFor()
  const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
  const currentIds = Object.fromEntries(snapshot.periods.map(period => [period.horizon, period.id]))
  const column = horizon => page.locator(`.board-column[data-horizon="${horizon}"]`)
  const past = async horizon => {
    await column(horizon).locator('[data-previous-period]').click()
    await page.waitForFunction(horizon => {
      const root = document.querySelector(`.board-column[data-horizon="${horizon}"]`)
      return root?.dataset.periodMode === 'history' && root.getAttribute('aria-busy') === 'false'
    }, horizon)
  }
  const returned = async () => {
    await page.waitForFunction(ids => Object.entries(ids).every(([horizon, id]) => {
      const root = document.querySelector(`.board-column[data-horizon="${horizon}"]`)
      return root?.dataset.periodId === id && root.dataset.periodMode === 'current'
    }), currentIds)
    assert.equal(await page.locator('.past-period-rows').count(), 0)
  }
  const checks = []
  for (const horizon of ['cycle', 'month', 'week', 'day']) await past(horizon)
  await column('day').locator('.column-content').evaluate(node => { node.scrollTop = 500 })
  assert((await column('day').locator('.column-content').evaluate(node => node.scrollTop)) > 0)
  const selectedAtPress = await page.locator('.flow-filter .chip[aria-label]').first().getAttribute('aria-label')
  const beforeScreenshot = 'output/tests/screenshots/filter-from-history.png'
  await page.screenshot({ path: beforeScreenshot })
  await page.keyboard.press('ControlOrMeta+2')
  await returned()
  await page.getByRole('button', { name: selectedAtPress, exact: true, pressed: true }).waitFor()
  assert.equal(await column('day').locator('.column-content').evaluate(node => node.scrollTop), 0)
  const afterScreenshot = 'output/tests/screenshots/filter-return-current.png'
  await page.screenshot({ path: afterScreenshot })
  checks.push('Cmd/Ctrl+2 returns all four past columns to current and resets scroll')

  await all.click()
  await past('month')
  assert.equal(await page.locator('.flow-filter .chip[aria-label]').first().getAttribute('aria-label'), '只看 Filter day flow')
  await page.keyboard.press('ControlOrMeta+2')
  await returned()
  assert.equal(await dayFlow.getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('.flow-filter .chip[aria-label]').first().getAttribute('aria-label'), '只看 Filter month flow')
  checks.push('Shortcut chooses the flow at the original slot, retaining identity after current-period reordering')

  await past('week')
  await page.keyboard.press('ControlOrMeta+3')
  await returned()
  assert.equal(await dayFlow.getAttribute('aria-pressed'), 'true')
  checks.push('Repeated shortcut returns to current while keeping the selected flow')

  await past('day')
  await page.keyboard.press('ControlOrMeta+9')
  assert.equal(await column('day').getAttribute('data-period-mode'), 'history')
  const settings = page.getByRole('dialog', { name: '设置与数据', exact: true })
  const openShortcuts = async () => {
    await page.getByRole('button', { name: '设置与数据', exact: true }).click()
    await settings.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '快捷键', exact: true }).click()
  }
  await openShortcuts()
  await page.keyboard.press('ControlOrMeta+2')
  assert.equal(await column('day').getAttribute('data-period-mode'), 'history')
  await settings.getByRole('switch', { name: /\+ 数字切换顶栏筛选$/ }).click()
  await settings.getByRole('button', { name: '关闭', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+2')
  assert.equal(await column('day').getAttribute('data-period-mode'), 'history')
  assert.equal(await dayFlow.getAttribute('aria-pressed'), 'true')
  await openShortcuts()
  await settings.getByRole('switch', { name: /\+ 数字切换顶栏筛选$/ }).click()
  await settings.getByRole('button', { name: '关闭', exact: true }).click()
  checks.push('Missing slots, open dialogs and disabled filter shortcuts preserve history')

  await column('week').locator('[data-next-period]').click()
  await page.waitForFunction(() => document.querySelector('[data-horizon="week"]')?.getAttribute('aria-busy') === 'false')
  const futureId = await column('week').getAttribute('data-period-id')
  assert.notEqual(futureId, currentIds.week)
  await column('week').locator('[data-add-item]').click()
  const draft = column('week').getByRole('textbox')
  await draft.fill('Keep this future draft')
  await page.keyboard.press('ControlOrMeta+2')
  assert.equal(await column('day').getAttribute('data-period-mode'), 'history')
  assert.equal(await dayFlow.getAttribute('aria-pressed'), 'true')
  await monthFlow.click()
  await page.waitForFunction(id => document.querySelector('[data-horizon="day"]')?.dataset.periodId === id, currentIds.day)
  assert.equal(await monthFlow.getAttribute('aria-pressed'), 'true')
  assert.equal(await column('week').getAttribute('data-period-id'), futureId)
  assert.equal(await draft.inputValue(), 'Keep this future draft')
  checks.push('Input shortcut is ignored; top-bar selection returns history and preserves the future period and draft')
  await draft.focus()
  await page.keyboard.press('Escape')
  await column('week').locator('[data-return-current]').click()
  await returned()

  await past('day')
  await monthFlow.click()
  await returned()
  assert.equal(await all.getAttribute('aria-pressed'), 'true')
  await past('day')
  await all.click()
  await returned()
  await past('day')
  await page.keyboard.press('ControlOrMeta+1')
  await returned()
  assert.equal(await all.getAttribute('aria-pressed'), 'true')
  checks.push('Clicking the selected flow, All and repeated Cmd/Ctrl+1 each returns to current')
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.revision, snapshot.workspace.revision, 'Filter navigation does not write workspace data')
  return { checks, currentIds, selectedAtPress, futureId, beforeScreenshot, afterScreenshot }
}
