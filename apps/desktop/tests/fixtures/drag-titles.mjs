/**
 * [INPUT]: Native Electron page, synthetic production writes and private evidence paths.
 * [OUTPUT]: Complete pointer/keyboard drag-title wrapping and no-write cancellation evidence.
 * [POS]: Shared ordering acceptance retained independently of placement policy.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'

export async function dragTitles({ page, report, evidence }) {
  const execute = action => page.evaluate(async action => {
    const snapshot = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ ...action, generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return reply.result
  }, action)
  const shot = async name => { const path = join(evidence, `${name}.png`); await page.screenshot({ path }); report.screenshots.push(path) }
  report.dragTitles = []
  const dragTitles = [
    { name: 'long-url', title: `Read this article https://example.invalid/posts/${'1234567890'.repeat(22)} and draft a tutorial`, keyboard: false },
    { name: 'unbroken-title', title: 'X'.repeat(500), keyboard: true },
  ]
  for (const { name, title, keyboard } of dragTitles) {
    const { itemId } = await execute({ type: 'create', title, horizon: 'later' })
    const row = page.locator(`#item-${itemId}`)
    await row.scrollIntoViewIfNeeded()
    const before = (await page.evaluate(id => window.goalloom.getItem(id), itemId)).item
    if (keyboard) {
      const handle = row.locator('.drag-handle')
      await handle.focus(); await handle.press('Space')
    } else {
      const source = await row.locator('.task-title').boundingBox()
      await page.mouse.move(source.x + 12, source.y + 10); await page.mouse.down(); await page.mouse.move(source.x + 24, source.y + 10)
    }
    const overlay = page.locator('.drag-overlay')
    await overlay.waitFor()
    const geometry = await overlay.evaluate(node => {
      const box = node.getBoundingClientRect(), css = getComputedStyle(node), range = document.createRange()
      range.selectNodeContents(node)
      return {
        text: node.textContent, width: box.width, height: box.height, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
        contentLeft: box.left + parseFloat(css.paddingLeft), contentRight: box.right - parseFloat(css.paddingRight),
        contentBottom: box.bottom - parseFloat(css.paddingBottom),
        lines: [...range.getClientRects()].map(line => ({ left: line.left, right: line.right, bottom: line.bottom })),
      }
    })
    report.dragTitles.push({ name, keyboard, ...geometry })
    await shot(`drag-title-${name}`)
    assert.equal(geometry.text, title, 'The drag card preserves the complete authored title')
    assert(geometry.width <= 321 && geometry.scrollWidth <= geometry.clientWidth + 1, 'The drag card stays within its width limit')
    assert(geometry.lines.length > 1, 'Long drag titles wrap onto multiple lines')
    assert(geometry.lines.every(line => line.left >= geometry.contentLeft - 1 && line.right <= geometry.contentRight + 1 && line.bottom <= geometry.contentBottom + 1), 'Every text line stays inside the drag card')
    await page.keyboard.press('Escape')
    if (!keyboard) await page.mouse.up()
    await overlay.waitFor({ state: 'detached' })
    assert.deepEqual((await page.evaluate(id => window.goalloom.getItem(id), itemId)).item, before, 'Cancelling a drag changes no task data')
  }
  report.checks.push('Pointer and keyboard drag cards wrap full raw URLs and 500-character tokens without overflow or cancelled-drag writes')
}
