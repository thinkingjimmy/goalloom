/**
 * [INPUT]: An open Goalloom board in a configured workspace.
 * [OUTPUT]: Proof that a double-clicked card edits its title in a field that wraps like the title, that Enter changes only the title, and that Escape, a blank field, and a single click keep the existing detail behavior.
 * [POS]: Board acceptance inside test:ui. No production test seam.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pollPage } from './poll.mjs'

const sentence = '看板双击后输入框要跟卡片一样把整句折成多行。'
const title = sentence.repeat(3)
const description = '说明正文保持不变\n第二行也不改'

const metrics = node => {
  const style = getComputedStyle(node)
  const line = parseFloat(style.lineHeight)
  const pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  const box = node.getBoundingClientRect()
  const span = node.querySelector('span')
  let lines
  if (node.tagName === 'TEXTAREA') lines = Math.round((node.scrollHeight - pad) / line)
  else {
    const range = document.createRange()
    range.selectNodeContents(span)
    lines = [...range.getClientRects()].filter(rect => rect.width > 0).length
  }
  return { lines, width: box.width, height: box.height, fontSize: style.fontSize, lineHeight: style.lineHeight, scroll: node.scrollHeight, client: node.clientHeight }
}

export async function verifyInlineTitle(page) {
  let id = null
  const execute = action => page.evaluate(async action => {
    const { workspace } = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ ...action, operationId: crypto.randomUUID(), generation: workspace.generation })
    if (!reply.ok) throw Error(reply.message)
    return reply.result
  }, action)
  const stored = () => page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
  try {
    id = (await execute({ type: 'create', title, description, horizon: 'month' })).itemId
    const row = page.locator(`#item-${id}`)
    const button = row.locator('.task-title')
    const field = row.locator('.task-title-input')
    const dialog = page.locator('dialog.detail')
    await button.waitFor()
    await button.scrollIntoViewIfNeeded()
    const before = await button.evaluate(metrics)
    assert(before.lines >= 2, '夹具标题在列宽里至少折成两行')
    await button.dblclick()
    await field.waitFor()
    await page.waitForTimeout(500)
    assert.equal(await dialog.count(), 0, '双击编辑时不打开详情')
    const after = await field.evaluate(metrics)
    assert.equal(after.fontSize, '14px')
    assert.equal(after.lineHeight, '22px')
    assert.equal(after.lines, before.lines, '输入框行数与双击前的标题一致')
    assert(Math.abs(after.width - before.width) <= 1, '输入框宽度与标题一致')
    assert(Math.abs(after.height - before.height) <= 2, '输入框高度与标题一致')
    assert(after.scroll <= after.client + 1, '全文都在输入框内，不靠内部滚动')
    assert.equal(await field.inputValue(), title)
    await mkdir('output/tests/inline-title', { recursive: true })
    await row.screenshot({ path: 'output/tests/inline-title/editing.png' })

    await field.fill('第一行\n第二行')
    await pollPage(page, id => document.querySelector(`#item-${id} .task-title-input`)?.value === '第一行 第二行', id, { label: 'pasted line break becomes a space' })
    await field.press('Escape')
    await button.waitFor()
    assert.equal((await stored()).title, title)
    assert.equal((await stored()).description, description)

    const renamed = '改成一行标题'
    await button.dblclick()
    await field.fill(renamed)
    await field.press('Enter')
    await pollPage(page, async ({ id, title }) => (await window.goalloom.getItem(id)).item.title === title, { id, title: renamed }, { label: 'renamed title saved' })
    assert.equal((await stored()).description, description, '就地改标题不改写说明')
    await button.waitFor()

    await button.dblclick()
    await field.fill('不会留下')
    await field.press('Escape')
    await button.waitFor()
    assert.equal((await stored()).title, renamed)

    await button.dblclick()
    await field.fill('   ')
    await field.press('Enter')
    await button.waitFor()
    assert.equal((await stored()).title, renamed, '空白标题不保存，也不删除任务')

    await button.click()
    await page.waitForTimeout(150)
    assert.equal(await dialog.count(), 0, '单击先等待，不立刻打开详情')
    await dialog.waitFor()
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })

    await button.press('Enter')
    await dialog.waitFor()
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
  } finally {
    if (!id) return
    await page.keyboard.press('Escape').catch(() => {})
    const version = await page.evaluate(async id => (await window.goalloom.getItem(id).catch(() => null))?.item.version ?? null, id)
    if (version) await execute({ type: 'delete', itemId: id, expectedVersion: version }).catch(() => {})
  }
}
