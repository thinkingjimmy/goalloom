/**
 * [INPUT]: Isolated native description harness and the actual renderer selection/toolbar geometry.
 * [OUTPUT]: Repeatable non-overlap, scroll/resize, formatting and link-form anchor evidence.
 * [POS]: Description-feature regression for floating selection tools; no mocked positioning code.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { pollPage } from './poll.mjs'

export async function verifyDescriptionSelection({ app, page, create, open, close, stored, detail, note, shot }) {
  const checks = [], toolbar = () => detail().getByRole('toolbar', { name: 'Format selection', exact: true })
  const source = '首行文字应该保持可见，选中开头不应被工具栏遮挡。\n\n第二段仍然保留原文，不需要为了格式操作改动布局。'
  const id = await create('Selection toolbar fixture', source), before = await stored(id)
  const select = async (paragraph = 0, start = 0, end = 4) => {
    await note().evaluate((element, { paragraph, start, end }) => {
      element.focus({ preventScroll: true })
      const target = element.querySelectorAll('p')[paragraph]
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
      const text = walker.nextNode(), range = document.createRange()
      range.setStart(text, start); range.setEnd(text, Math.min(end, text.textContent.length))
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range)
    }, { paragraph, start, end })
    await toolbar().waitFor()
  }
  const geometry = () => page.evaluate(() => {
    const panel = document.querySelector('.description-tools'), body = document.querySelector('dialog.detail .detail-body')
    const selection = window.getSelection()
    const anchor = window.descriptionSelectionAnchor ?? (selection?.rangeCount && selection.getRangeAt(0))
    if (!panel || !body || !anchor) return null
    const box = rect => ({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height })
    return { panel: box(panel.getBoundingClientRect()), body: box(body.getBoundingClientRect()), range: box(anchor.getBoundingClientRect()), rects: [...anchor.getClientRects()].map(box), visible: getComputedStyle(panel).visibility !== 'hidden' }
  })
  const clear = async (side = null) => {
    await pollPage(page, () => {
      const panel = document.querySelector('.description-tools'), selection = window.getSelection()
      const anchor = window.descriptionSelectionAnchor ?? (selection?.rangeCount && selection.getRangeAt(0))
      if (!panel || !anchor || getComputedStyle(panel).visibility === 'hidden') return false
      const bounds = panel.getBoundingClientRect()
      const range = anchor.getBoundingClientRect()
      const followsAnchor = Math.abs(bounds.bottom - (range.top - 8)) <= 1 || Math.abs(bounds.top - (range.bottom + 8)) <= 1
      return followsAnchor && [...anchor.getClientRects()].every(rect => rect.width < 1 || rect.height < 1 || bounds.right <= rect.left || bounds.left >= rect.right || bounds.bottom <= rect.top - 4 || bounds.top >= rect.bottom + 4)
    })
    const bounds = await geometry()
    assert(bounds?.visible)
    assert(bounds.panel.left >= bounds.body.left && bounds.panel.right <= bounds.body.right)
    assert(bounds.panel.top >= bounds.body.top && bounds.panel.bottom <= bounds.body.bottom)
    if (side === 'above') assert(bounds.panel.bottom <= bounds.range.top - 4)
    if (side === 'below') assert(bounds.panel.top >= bounds.range.bottom + 4)
  }
  await open(id); await select(); await clear('above'); await shot('selection-first-line')
  assert.equal(await detail().locator('.save-bar').count(), 0)
  assert.deepEqual(await stored(id), before)
  await toolbar().getByRole('button', { name: 'Bold', exact: true }).click()
  assert.equal(await note().locator('.description-bold').innerText(), '首行文字')
  await note().press('ControlOrMeta+z')
  await pollPage(page, () => !document.querySelector('.save-bar'))
  await select()
  await page.evaluate(() => { window.descriptionSelectionAnchor = window.getSelection().getRangeAt(0).cloneRange() })
  await toolbar().getByRole('button', { name: 'Edit link', exact: true }).click()
  await detail().getByLabel('Link address', { exact: true }).waitFor()
  await clear()
  await detail().getByLabel('Link address', { exact: true }).fill('https://example.com/new-draft')
  assert.equal(await detail().locator('.save-bar').count(), 0)
  await shot('selection-link-form')
  await detail().getByLabel('Link address', { exact: true }).press('Escape')
  await detail().locator('.description-link-form').waitFor({ state: 'hidden' })
  assert.equal(await detail().count(), 1)
  assert.deepEqual(await stored(id), before)
  await page.evaluate(() => { delete window.descriptionSelectionAnchor })
  await close()
  checks.push('First-line selection stays readable; measured link-form expansion preserves its anchor; Bold/undo and Escape do not change unrelated text or saved source')

  const longSource = Array.from({ length: 32 }, (_, index) => `Paragraph ${index + 1}: select words near the visible boundary without covering the text being edited.`).join('\n\n')
  const longId = await create('Scrolled selection fixture', longSource)
  await open(longId); await select(0, 0, 200); await clear('above')
  assert(new Set((await geometry()).rects.filter(rect => rect.width > 0).map(rect => rect.top)).size > 1)
  await shot('selection-multiline')
  await note().evaluate(element => {
    const text = document.createTreeWalker(element.querySelector('p'), NodeFilter.SHOW_TEXT).nextNode()
    const range = document.createRange()
    let lineTop = null, end = 0
    for (let offset = 0; offset < text.textContent.length; offset++) {
      range.setStart(text, offset); range.setEnd(text, offset + 1)
      const top = range.getBoundingClientRect().top
      if (lineTop !== null && top > lineTop + 1) break
      lineTop = top; end = offset + 1
    }
    range.setStart(text, Math.max(0, end - 4)); range.setEnd(text, end)
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range)
  })
  await clear('above')
  const rightEdge = await geometry()
  assert(rightEdge.panel.left < rightEdge.range.left)
  await shot('selection-right-edge')
  await select()
  await detail().locator('.detail-body').evaluate(body => { const first = body.querySelector('.description-content p'); body.scrollTop += first.getBoundingClientRect().top - body.getBoundingClientRect().top - 12 })
  await clear('below'); await shot('selection-top-edge-flips-below')
  const prior = (await geometry()).panel.top
  await detail().locator('.detail-body').evaluate(body => { body.scrollTop -= 16 })
  await pollPage(page, value => Math.abs(document.querySelector('.description-tools').getBoundingClientRect().top - value) >= 12, prior)
  await clear('below')
  await detail().locator('.detail-body').evaluate(body => { body.scrollTop += 160 })
  await toolbar().waitFor({ state: 'hidden' })

  await detail().locator('.detail-body').evaluate(body => { const target = body.querySelectorAll('.description-content p')[10]; body.scrollTop += target.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 12 })
  await select(10, 0, 10); await clear('above'); await shot('selection-bottom-edge-stays-above')
  await detail().locator('.detail-body').evaluate(body => { const target = body.querySelectorAll('.description-content p')[10]; body.scrollTop += target.getBoundingClientRect().top - (body.getBoundingClientRect().top + body.clientHeight / 2) })
  await clear()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1080, 720))
  await clear(); await shot('selection-resized-window')
  assert.equal(await detail().locator('.save-bar').count(), 0)
  assert.equal((await stored(longId)).description, longSource)
  await close()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 920))
  checks.push('Multiline/right-edge selection stays readable; toolbar flips below the scroll viewport top, tracks scroll/resize, hides with an off-screen selection and fits above the bottom boundary without dirtying Markdown')
  return checks
}
