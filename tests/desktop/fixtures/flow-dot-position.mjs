/**
 * [INPUT]: Real Electron, a configured isolated workspace and a screenshot directory.
 * [OUTPUT]: Measured bounds and screenshots for bottom-edge flow menus, content changes, scrolling and resizing.
 * [POS]: Relation acceptance fixture using production IPC and real board controls without replacing layout or renderer APIs.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'

export async function verifyFlowDotPosition(application, page, shots) {
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 760))
  const items = await page.evaluate(async () => {
    const { workspace } = await window.goalloom.getSnapshot()
    const create = async (title, horizon, parentId = null) => {
      const parent = parentId ? (await window.goalloom.getItem(parentId)).item : null
      const reply = await window.goalloom.execute({ type: 'create', title, horizon, parentId, expectedParentVersion: parent?.version ?? null,
        generation: workspace.generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw new Error(reply.message)
      return reply.result.itemId
    }
    const parents = []
    for (let index = 1; index <= 8; index++) parents.push(await create(`Popover parent ${index}`, 'month'))
    const rows = []
    for (let index = 0; index < 28; index++) rows.push(await create(`Popover task ${index}`, 'week', index === 17 ? parents[0] : null))
    return { loose: rows[16], child: rows[17] }
  })
  const result = { checkpoints: [], screenshots: [] }
  const panel = page.locator('.popover-floating')
  const parents = page.getByRole('dialog', { name: '关联到…', exact: true })
  const dot = id => page.locator(`#item-${id} .flow-dot-button`)
  const alignNearBottom = async id => {
    await page.locator('[data-horizon="week"] .column-content').evaluate(node => { node.scrollTop = node.scrollHeight })
    await page.locator(`#item-${id}`).scrollIntoViewIfNeeded()
    await dot(id).evaluate(node => {
      const content = node.closest('.column-content')
      content.scrollTop += node.getBoundingClientRect().bottom - (innerHeight - 170)
    })
    await page.locator(`#item-${id} .task-title`).hover()
  }
  const check = async (id, side, label) => {
    await page.waitForFunction(({ id, side }) => {
      const anchor = document.querySelector(`#item-${id} .flow-dot-button`), panel = document.querySelector('.popover-floating')
      if (!anchor || !panel) return false
      const a = anchor.getBoundingClientRect(), p = panel.getBoundingClientRect()
      const gap = side === 'top' ? a.top - p.bottom : p.top - a.bottom
      return Math.abs(gap - 6) < 1 && p.top >= 8 && p.bottom <= innerHeight - 8 && p.left >= 8 && p.right <= innerWidth - 8
    }, { id, side }, { timeout: 5000 })
    const geometry = await dot(id).evaluate(node => ({ anchor: node.getBoundingClientRect().toJSON(),
      panel: document.querySelector('.popover-floating').getBoundingClientRect().toJSON(), viewport: { width: innerWidth, height: innerHeight } }))
    result.checkpoints.push({ label, side, ...geometry })
  }
  const capture = async name => {
    const path = join(shots, `flow-dot-position-${name}.png`)
    await page.screenshot({ path })
    result.screenshots.push(path)
  }
  const close = async () => { await page.keyboard.press('Escape'); await panel.waitFor({ state: 'detached' }) }

  // A short menu fits below; its taller replacement must remeasure without a scroll or window resize.
  await alignNearBottom(items.loose)
  await dot(items.loose).click()
  await check(items.loose, 'bottom', 'Short choice menu fits below the dot')
  await capture('choose-below')
  await page.getByRole('menuitem', { name: /关联到上级/ }).click()
  await parents.waitFor()
  await check(items.loose, 'top', 'Switching to parent choices flips above the dot')
  await capture('parents-above')

  // Debounced results shrink the panel, then clearing the query restores its full height.
  const search = parents.getByRole('textbox', { name: '搜索上级条目', exact: true })
  await search.fill('Popover parent 1')
  await page.waitForFunction(() => document.querySelectorAll('.popover-floating [role="menuitemcheckbox"]').length === 1)
  await check(items.loose, 'bottom', 'A short search result fits below')
  assert.equal(await search.evaluate(node => node === document.activeElement), true, 'Repositioning preserves search focus')
  await search.fill('')
  await page.waitForFunction(() => document.querySelectorAll('.popover-floating [role="menuitemcheckbox"]').length === 8)
  await check(items.loose, 'top', 'Restored candidates flip back above')
  await capture('search-restored')

  await dot(items.loose).evaluate(node => { node.closest('.column-content').scrollTop += 48 })
  await check(items.loose, 'top', 'The open panel follows column scrolling')
  const height = await page.evaluate(() => innerHeight)
  await application.evaluate(({ BrowserWindow }, height) => BrowserWindow.getAllWindows()[0].setContentSize(1280, height - 60), height)
  await check(items.loose, 'top', 'The open panel stays inside a resized window')
  await capture('resized')
  await close()

  await alignNearBottom(items.child)
  await dot(items.child).click()
  await parents.waitFor()
  await check(items.child, 'top', 'A linked item opens its parent panel above immediately')
  await capture('direct-parents')
  await close()

  // The same dot can still open either menu after its previous panel has been removed.
  await alignNearBottom(items.loose)
  await dot(items.loose).click()
  await page.getByRole('menuitem', { name: /设为流程起点/ }).click()
  await panel.locator('.flow-menu').waitFor()
  await check(items.loose, 'top', 'The color palette is remeasured after switching modes')
  await capture('color')
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await panel.waitFor({ state: 'detached' })
  return result
}
