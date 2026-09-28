/**
 * [INPUT]: Native Electron, production cache/IPC and isolated synthetic item data.
 * [OUTPUT]: Complete rich-title, raw editing, keyboard, saved-only metadata and read-only evidence.
 * [POS]: Link-feature desktop acceptance; composes with the existing offline preview runner.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { urls } from './link-preview-cache.mjs'
import { pollPage } from './poll.mjs'

export async function verifyDetailTitles(app, page, directory, output) {
  const url = 'https://example.com/complete-detail-title'
  const title = '图像创作参考：从构图、光线、色彩到文字排版，整理可以立即尝试的十二种练习方法，让每次创作都有清晰的起点，也保留探索和调整的空间。完整标题的最后一句也应该可见。'
  const original = `参考这篇文章 ${url}`
  const cacheFile = url => join(directory, `${createHash('sha256').update(url).digest('hex')}.json`)
  const icon = JSON.parse(await readFile(cacheFile(urls.x), 'utf8')).preview.favicon
  await writeFile(cacheFile(url), JSON.stringify({ version: 1, fetchedAt: Date.now(), faviconCheckedAt: Date.now(), preview: { url, title, status: 'ready', siteName: 'Fixture', description: '', image: null, favicon: icon } }))
  const execute = action => page.evaluate(async action => {
    const { workspace } = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ ...action, operationId: crypto.randomUUID(), generation: workspace.generation })
    if (!reply.ok) throw Error(reply.message)
    return reply.result
  }, action)
  const stored = id => page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
  const created = await execute({ type: 'create', title: original, horizon: 'cycle' }), id = created.itemId
  const before = await stored(id), row = page.locator(`#item-${id}`)
  await row.locator('.task-title').press('Enter')
  const dialog = page.locator('dialog.detail'), display = dialog.locator('.detail-title-display'), field = dialog.locator('.title-input')
  const edit = () => dialog.getByRole('button', { name: '编辑标题', exact: true })
  await display.locator('.link-inline[data-status="ready"]').waitFor()
  await pollPage(page, () => document.querySelector('.detail-title-display .link-favicon img')?.naturalWidth > 0)
  assert.equal(await display.locator('.link-domain-label').innerText(), title)
  assert.equal(await field.count(), 0, 'Details initially present rich text, not a raw title field')
  assert.equal(await display.locator('button a').count(), 0)
  const bounds = await display.evaluate(element => {
    const rich = element.querySelector('.link-rich-text'), label = element.querySelector('.link-domain-label'), range = document.createRange()
    range.selectNodeContents(label)
    return { height: rich.clientHeight, scrollHeight: rich.scrollHeight, fontSize: getComputedStyle(element).fontSize, rect: rich.getBoundingClientRect().toJSON(), lines: [...range.getClientRects()].map(rect => rect.toJSON()), check: document.querySelector('.detail-title .check').getBoundingClientRect().toJSON() }
  })
  assert(bounds.height >= 84, 'The fixture exercises more than two lines of rich title')
  assert.equal(bounds.height, bounds.scrollHeight)
  assert.equal(bounds.fontSize, '20px')
  assert(bounds.lines.every(line => line.bottom <= bounds.rect.bottom + 1 && line.right <= bounds.rect.right + 1))
  assert(Math.abs(bounds.check.top - bounds.rect.top) <= 5, 'Completion stays aligned with the first line')
  assert.deepEqual(await stored(id), before, 'Reading a fetched title must not rewrite the task')
  const shots = [], shot = async name => { const path = `${output}/${name}.png`; await dialog.screenshot({ path }); shots.push(path) }
  await shot('detail-title-complete')
  const externalBefore = (await app.evaluate(() => globalThis.linkPreviewProbe.external)).length
  await display.getByRole('link').click()
  assert.equal((await app.evaluate(() => globalThis.linkPreviewProbe.external)).at(-1), url)
  assert.equal((await app.evaluate(() => globalThis.linkPreviewProbe.external)).length, externalBefore + 1)
  assert.equal(await field.count(), 0, 'Opening a title link does not enter editing')
  await edit().press('Enter')
  assert.equal(await field.inputValue(), original)
  const long = '用一段完整的任务标题验证编辑时的自动换行与阅读体验。'.repeat(10)
  await field.fill(long)
  const editor = await field.evaluate(element => ({ tag: element.tagName, height: element.clientHeight, scrollHeight: element.scrollHeight, maxLength: element.maxLength }))
  assert.equal(editor.tag, 'TEXTAREA'); assert(editor.height > 56); assert(editor.scrollHeight <= editor.height + 1); assert.equal(editor.maxLength, 500)
  await shot('detail-title-editing')
  await field.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true, cancelable: true })))
  assert.equal(await field.count(), 1); assert.equal((await stored(id)).title, original)
  await field.press('Escape')
  assert.equal(await dialog.count(), 1); assert.equal(await field.count(), 0)
  assert.equal(await display.locator('.link-rich-text').innerText(), long)
  assert(await edit().evaluate(element => document.activeElement === element))
  await dialog.getByRole('button', { name: '放弃', exact: true }).click()
  await display.locator('.link-inline[data-status="ready"]').waitFor()
  assert.equal(await dialog.locator('.save-bar').count(), 0)

  const networkBefore = await app.evaluate(() => ({ lookups: globalThis.linkPreviewProbe.lookups.length, requests: globalThis.linkPreviewProbe.requests.length, providers: globalThis.linkPreviewProbe.providerFetches.length }))
  await edit().click(); await field.fill('稍后阅读 https://unsaved-title.example.com/reference')
  await field.press('Tab')
  await display.waitFor()
  assert.equal(await display.getByRole('link').innerText(), 'unsaved-title.example.com')
  assert.deepEqual(await app.evaluate(() => ({ lookups: globalThis.linkPreviewProbe.lookups.length, requests: globalThis.linkPreviewProbe.requests.length, providers: globalThis.linkPreviewProbe.providerFetches.length })), networkBefore)
  await dialog.getByRole('button', { name: '放弃', exact: true }).click()

  const edited = `完整参考 [保留自定义文字](${url}) ${urls.x}`
  await edit().click(); await field.fill(edited)
  await dialog.getByRole('button', { name: /^保存/ }).click()
  await pollPage(page, async ({ id, edited }) => (await window.goalloom.getItem(id)).item.title === edited, { id, edited })
  await display.locator('.link-inline[data-status="ready"]').nth(1).waitFor()
  assert.equal(await display.getByRole('link').first().innerText(), '保留自定义文字')
  assert.equal(await display.getByRole('link').nth(1).innerText(), 'Fixture X post')
  await edit().click(); assert.equal(await field.inputValue(), edited)
  await field.fill(url); await field.press('Enter')
  await pollPage(page, async ({ id, url }) => (await window.goalloom.getItem(id)).item.title === url, { id, url })
  assert(await edit().evaluate(element => document.activeElement === element), 'URL-only titles retain a keyboard-accessible edit action')
  await edit().click(); assert.equal(await field.inputValue(), url); await field.press('Escape')

  await execute({ type: 'preferences', theme: 'dark', style: 'minimal' })
  await pollPage(page, () => document.documentElement.dataset.theme === 'dark' && document.documentElement.dataset.style === 'minimal')
  await shot('detail-title-dark-minimal')
  await execute({ type: 'preferences', theme: 'light', style: 'paper' })
  const current = await stored(id)
  await execute({ type: 'delete', itemId: id, expectedVersion: current.version })
  await pollPage(page, () => document.querySelector('dialog.detail')?.getAttribute('aria-label') === '回收站条目')
  assert.equal(await edit().count(), 0); assert.equal(await field.count(), 0)
  assert.equal(await display.getByRole('link').innerText(), title)
  await dialog.locator('.modal-header').getByRole('button', { name: '关闭', exact: true }).click()
  return { bounds, editor, screenshots: shots, checks: ['Complete rich-title display and first-line controls', 'Links and raw title editing have independent pointer/keyboard actions', 'Growing editor, composition, Escape, Enter, Save and Discard preserve source', 'Draft URLs make no network requests', 'Custom/URL-only titles, dark/minimal theme and read-only deleted items'] }
}
