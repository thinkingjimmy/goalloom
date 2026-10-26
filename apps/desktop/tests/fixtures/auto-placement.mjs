/**
 * [INPUT]: Native Electron page, production IPC, isolated ordering fixture and evidence directory.
 * [OUTPUT]: Free pointer/keyboard sorting, shared header/tail placement, scoped sort/undo/recovery, usable nesting and five-locale evidence.
 * [POS]: Native acceptance for automatic placement; all tasks are synthetic.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'

export async function autoPlacement({ page, application, ids, report, evidence }) {
  const own = [ids.A1, ids.B1, ids.A2, ids.loose]
  const row = id => page.locator(`#item-${id}`)
  const column = page.locator('[data-horizon="month"]')
  const snapshot = () => page.evaluate(() => window.goalloom.getSnapshot())
  const saved = async () => (await snapshot()).items.filter(item => own.includes(item.id)).map(item => item.id)
  const settled = () => page.waitForFunction(() => !document.documentElement.dataset.dragging && !document.querySelector('.fab').disabled && [...document.querySelectorAll('.virtual-rows')].every(node => node.getAnimations({ subtree: true }).every(animation => animation.playState !== 'running')))
  const order = async expected => {
    await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('[data-horizon="month"] .task-row')].map(node => node.dataset.itemId).filter(id => expected.includes(id))) === JSON.stringify(expected), expected)
    await settled(); assert.deepEqual(await saved(), expected)
  }
  const shot = async name => { const path = join(evidence, `${name}.png`); await page.screenshot({ path }); report.screenshots.push(path) }
  const settings = async () => {
    await page.getByRole('button', { name: '设置与数据', exact: true }).click()
    const dialog = page.locator('dialog.settings-modal')
    await dialog.getByRole('button', { name: '看板', exact: true }).click()
    return dialog
  }
  const original = [...own], beforeToggle = await snapshot()
  const dialog = await settings()
  await dialog.getByRole('switch', { name: '按上级自动放置', exact: true }).click()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await order(original)
  assert.equal((await snapshot()).workspace.revision, beforeToggle.workspace.revision, 'A preference change must not reorder or write tasks')
  const begin = async (sourceId, targetId, fraction) => {
    await row(sourceId).scrollIntoViewIfNeeded(); await row(targetId).scrollIntoViewIfNeeded()
    await row(sourceId).locator('.task-title').focus()
    const source = await row(sourceId).locator('.task-title').boundingBox()
    await page.mouse.move(source.x + 12, source.y + 10); await page.mouse.down(); await page.mouse.move(source.x + 24, source.y + 10)
    await page.locator('.drag-overlay').waitFor()
    const target = await row(targetId).boundingBox()
    await page.mouse.move(target.x + 100, target.y + target.height * fraction, { steps: 12 })
  }
  await begin(ids.A1, ids.B1, 0.92)
  await page.locator('[data-sort-position]').waitFor()
  assert.equal(await page.locator('[data-nesting-target], .task-row[data-sort-blocked]').count(), 0)
  assert.equal(await page.locator('[data-sort-position]').count(), 1)
  await shot('cross-parent-insertion'); await page.mouse.up()
  const manual = [ids.B1, ids.A1, ids.A2, ids.loose]
  await order(manual)
  const links = (await snapshot()).relations
  await page.reload(); await page.locator('.board').waitFor(); await order(manual)
  assert.deepEqual((await snapshot()).relations, links)
  const handle = row(ids.A1).locator('.drag-handle')
  await handle.focus(); await handle.press('Space'); await page.locator('.drag-overlay').waitFor()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('Space'); await order(original)
  await page.keyboard.press('ControlOrMeta+z'); await order(manual)
  await column.locator('[data-add-item]').click()
  const entry = column.locator('.quick-add')
  await entry.locator('button[aria-haspopup="listbox"]').click()
  await entry.getByRole('option').filter({ hasText: 'Flow B' }).click()
  await entry.locator('textarea').fill('New B task'); await entry.locator('textarea').press('Enter')
  await page.waitForFunction(() => [...document.querySelectorAll('[data-horizon="month"] .task-title')].some(node => node.textContent === 'New B task'))
  await entry.locator('textarea').press('Escape'); await settled()
  const created = (await snapshot()).items.find(item => item.title === 'New B task')
  const allIds = (await snapshot()).items.filter(item => item.placement.horizon === 'month').map(item => item.id)
  assert.deepEqual(allIds, [ids.B1, created.id, ids.A1, ids.A2, ids.loose])
  assert.deepEqual(await saved(), manual, 'Creating a task preserves every older task relative position')
  await shot('new-task-placed'); await page.keyboard.press('ControlOrMeta+z'); await order(manual)
  await column.locator('[data-column-add]').click()
  await entry.locator('textarea').fill('Bottom B task'); await entry.locator('textarea').press('Enter')
  await page.waitForFunction(() => [...document.querySelectorAll('[data-horizon="month"] .task-title')].some(node => node.textContent === 'Bottom B task'))
  await entry.locator('textarea').press('Escape'); await settled()
  const bottom = (await snapshot()).items.find(item => item.title === 'Bottom B task')
  assert.deepEqual((await snapshot()).items.filter(item => item.placement.horizon === 'month').map(item => item.id), [ids.B1, bottom.id, ids.A1, ids.A2, ids.loose], 'The bottom entry uses the same parent placement policy as the column header')
  await shot('bottom-task-placed'); await page.keyboard.press('ControlOrMeta+z'); await order(manual)
  await row(ids.loose).locator('.flow-dot-button').focus(); await row(ids.loose).locator('.flow-dot-button').press('Enter')
  await page.getByRole('menuitem', { name: '关联到上级', exact: true }).click()
  const picker = page.locator('.relation-picker')
  await picker.locator('input').fill('Flow B')
  await picker.locator('.menu-item').filter({ hasText: 'Flow B' }).click()
  await page.keyboard.press('Escape'); await order([ids.B1, ids.loose, ids.A1, ids.A2])
  assert((await snapshot()).relations.some(edge => edge.childId === ids.loose && edge.parentId === ids.B))
  await shot('linked-task-placed'); await page.keyboard.press('ControlOrMeta+z'); await order(manual)
  assert(!(await snapshot()).relations.some(edge => edge.childId === ids.loose))
  const arrange = async () => {
    await column.locator('[data-column-actions]').click()
    await page.getByRole('menuitem', { name: '按上级整理', exact: true }).click()
  }
  const otherBefore = (await snapshot()).items.filter(item => item.placement.horizon !== 'month')
  await page.evaluate(ids => { window.orderingNodes = ids.map(id => document.getElementById(`item-${id}`)) }, own)
  await arrange(); await order([ids.A1, ids.A2, ids.B1, ids.loose])
  assert.equal(await page.evaluate(ids => ids.every((id, index) => window.orderingNodes[index] === document.getElementById(`item-${id}`)), own), true)
  await page.waitForFunction(() => document.activeElement === document.querySelector('[data-horizon="month"] [data-column-actions]'))
  assert.deepEqual((await snapshot()).items.filter(item => item.placement.horizon !== 'month'), otherBefore)
  assert.equal(await page.evaluate(() => localStorage.getItem('goalloom.parent-order')), 'true')
  await shot('column-sorted-once'); await page.keyboard.press('ControlOrMeta+z'); await order(manual)
  await application.evaluate(({ ipcMain }) => {
    const handler = ipcMain._invokeHandlers.get('goalloom:command')
    globalThis.orderingWrites = []
    ipcMain.removeHandler('goalloom:command')
    ipcMain.handle('goalloom:command', async (event, input) => {
      const result = await handler(event, input)
      if (input.type === 'materializeParentOrder') { globalThis.orderingWrites.push(input.operationId); throw Error('Synthetic lost ordering reply') }
      return result
    })
  })
  await arrange(); await order([ids.A1, ids.A2, ids.B1, ids.loose])
  assert.equal(await application.evaluate(() => globalThis.orderingWrites.length), 1)
  await page.keyboard.press('ControlOrMeta+z'); await order(manual)
  for (const fraction of [0.35, 0.65]) {
    await begin(ids.A1, ids.B1, fraction)
    assert.equal(await row(ids.B1).getAttribute('data-nesting-target'), 'true')
    assert.equal(await page.locator('[data-sort-position]').count(), 0)
    await shot(`nesting-${fraction}`)
    if (fraction === 0.35) { await page.keyboard.press('Escape'); await page.mouse.up(); await order(manual) }
    else {
      await page.mouse.up(); await row(ids.A1).locator(':scope[data-nested="true"]').waitFor(); await settled()
      assert.equal((await snapshot()).items.find(item => item.id === ids.A1).placement.nestingParentId, ids.B1)
      await page.waitForFunction(id => document.activeElement?.closest('.task-row')?.dataset.itemId === id, ids.A1)
      await page.keyboard.press('ControlOrMeta+z'); await order(manual)
    }
  }
  const copies = {
    zh: ['按上级自动放置', '按上级整理', '看板'],
    en: ['Place by parent automatically', 'Arrange by parent', 'Board'],
    ja: ['親に合わせて自動配置', '親順に整理', 'ボード'],
    es: ['Colocar automáticamente por superior', 'Organizar por superior', 'Tablero'],
    fr: ['Placer automatiquement selon le parent', 'Organiser selon les parents', 'Tableau'],
  }
  report.locales = []
  for (const [locale, [setting, action, board]] of Object.entries(copies)) {
    await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
    await page.reload(); await page.locator('.board').waitFor(); await order(manual)
    await column.locator('[data-column-actions]').focus(); await column.locator('[data-column-actions]').press('Enter')
    const control = page.getByRole('menuitem', { name: action, exact: true })
    await control.waitFor(); assert.equal(await control.evaluate(node => node === document.activeElement), true)
    await shot(`column-action-${locale}`); await page.keyboard.press('Escape')
    await page.keyboard.press('ControlOrMeta+,')
    const settingsDialog = page.locator('dialog.settings-modal')
    await settingsDialog.getByRole('button', { name: board, exact: true }).click()
    await settingsDialog.getByRole('switch', { name: setting, exact: true }).waitFor()
    assert.equal(await settingsDialog.getByRole('switch', { name: setting, exact: true }).getAttribute('aria-checked'), 'true')
    await shot(`placement-setting-${locale}`); await page.keyboard.press('Escape')
    report.locales.push({ locale, setting, action })
  }
  await page.evaluate(() => window.goalloom.setLanguage('zh')); await page.reload(); await page.locator('.board').waitFor(); await order(manual)
  const off = await settings(); await off.getByRole('switch', { name: copies.zh[0], exact: true }).click(); await page.keyboard.press('Escape'); await order(manual)
  assert.equal(await page.evaluate(() => localStorage.getItem('goalloom.parent-order')), 'false')
  report.checks.push('Native cross-parent pointer/keyboard order, reload, local create/link placement and undo, scoped one-shot sort, lost-reply receipt recovery, usable nesting, five locales and preference-only toggles')
}
