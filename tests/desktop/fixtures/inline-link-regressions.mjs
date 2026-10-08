/**
 * [INPUT]: Real Electron/main/renderer, isolated cache files and controlled official-provider responses.
 * [OUTPUT]: Legacy-icon enrichment, offline fallback, full-title wrapping and unchanged-source evidence.
 * [POS]: Link-feature desktop regression fixture; no external requests or user workspace reads.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pollPage } from './poll.mjs'

const legacyUrl = 'https://x.com/fixture/status/9999900000000000001'
const missingUrl = 'https://x.com/fixture/status/9999900000000000002'
const videoUrl = 'https://www.youtube.com/watch?v=FixtureIcon'
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJ0lEQVR4nGPwLltKEmKgr4b/OMBg0ECRHwaJBpL9QDMNJCcNmmgAAMFFwK+jqNbxAAAAAElFTkSuQmCC'
const title = '整理了十二种图像创作方法，包含构图、光线、文字排版与日常练习，希望能给下一次创作带来启发。'.repeat(2)
const filename = (directory, url) => join(directory, `${createHash('sha256').update(url).digest('hex')}.json`)

async function installProvider(app) {
  await app.evaluate(({ session }, png) => {
    const provider = session.fromPartition('goalloom-link-preview', { cache: false }), original = provider.fetch
    const bytes = Buffer.from(png.split(',')[1], 'base64')
    const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header[6] = 16; header[7] = 16; header.writeUInt32LE(bytes.length, 14); header.writeUInt32LE(22, 18)
    const ico = Buffer.concat([header, bytes])
    const probe = { requests: [], mode: 'valid', restore() { provider.fetch = original } }
    globalThis.inlineIconProbe = probe
    provider.fetch = async (url, options) => {
      probe.requests.push({ url, credentials: options.credentials, redirect: options.redirect, cache: options.cache, bypass: options.bypassCustomProtocolHandlers })
      if (url.startsWith('https://www.youtube.com/oembed?')) return new Response(JSON.stringify({ title: 'Controlled video', author_name: 'Fixture' }), { headers: { 'content-type': 'application/json' } })
      if (!['https://x.com/favicon.ico', 'https://www.youtube.com/favicon.ico'].includes(url)) throw Error('Unexpected provider request')
      if (probe.mode === 'offline') throw Error('Controlled offline response')
      if (probe.mode === 'svg') return new Response('<svg onload="alert(1)"></svg>', { headers: { 'content-type': 'image/svg+xml' } })
      if (probe.mode === 'large') return new Response(bytes, { headers: { 'content-type': 'image/png', 'content-length': '400000' } })
      return new Response(url.includes('youtube.com') ? ico : bytes, { headers: { 'content-type': 'image/x-icon' } })
    }
  }, png)
}

export async function verifyInlineRegressions(app, page, directory, output) {
  const fetchedAt = Date.now() - 60_000
  const seed = async (url, favicon) => {
    const preview = { url, status: 'ready', title, description: 'Controlled cached metadata.', siteName: 'Fixture', image: png, ...(favicon === undefined ? {} : { favicon }) }
    await writeFile(filename(directory, url), JSON.stringify({ version: 1, fetchedAt, preview }))
    return preview
  }
  const legacy = await seed(legacyUrl)
  await seed(missingUrl, null)
  await installProvider(app)
  const evidence = { screenshots: [], scope: 'Real desktop rendering, IPC and disk cache; synthetic provider responses, no live network.' }
  try {
    // Observe both reported symptoms before asserting so a red run captures usable visual evidence.
    const itemId = await page.evaluate(async url => {
      const snapshot = await window.goalloom.getSnapshot()
      const result = await window.goalloom.execute({ type: 'create', title: `参考这篇文章 ${url}`, description: `接下来阅读 ${url}\n\n继续比较 [这份关于视觉表达、信息层级与阅读体验的详细说明，保留作者自定义的链接文字](${url})`, horizon: 'later', generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
      if (!result.ok) throw Error(result.message)
      return result.result.itemId
    }, legacyUrl)
    const before = await page.evaluate(async id => (await window.goalloom.getItem(id)).item, itemId)
    const row = page.locator(`#item-${itemId}`), link = row.locator('.link-inline').first()
    await link.scrollIntoViewIfNeeded()
    await row.locator('.link-inline[data-status="ready"]').waitFor()
    const duplicate = await page.evaluate(url => Promise.all(Array.from({ length: 8 }, () => window.goalloom.getLinkPreview(url))), legacyUrl)
    const geometry = await row.locator('.link-rich-text').evaluate(element => {
      const anchor = element.querySelector('.link-inline'), label = anchor.querySelector('.link-domain-label')
      const prefix = document.createRange(); prefix.selectNodeContents(element.firstChild)
      const words = document.createRange(); words.selectNodeContents(label)
      return { prefix: prefix.getBoundingClientRect().toJSON(), words: [...words.getClientRects()].map(rect => rect.toJSON()), fragments: [...anchor.getClientRects()].map(rect => rect.toJSON()), checkbox: element.closest('.task-row').querySelector('.check').getBoundingClientRect().toJSON(), bounds: element.getBoundingClientRect().toJSON(), display: getComputedStyle(anchor).display }
    })
    const shot = `${output}/inline-title-wrapping.png`
    await row.screenshot({ path: shot }); evidence.screenshots.push(shot)
    evidence.geometry = geometry
    await writeFile(`${output}/inline-observation.json`, JSON.stringify({ geometry, hasFavicon: !!duplicate[0].favicon }, null, 2))
    assert(duplicate.every(value => value.favicon?.startsWith('data:image/png;base64,')), 'A legacy cached X title/cover gains its official favicon on the first visible request')
    await pollPage(page, id => document.querySelector(`#item-${id} .link-favicon img`)?.naturalWidth === 16, itemId)
    assert.equal(geometry.display, 'inline', 'Fetched titles are part of the sentence, not an atomic flex box')
    assert(Math.abs(geometry.words[0].top - geometry.prefix.top) <= 3, 'The link starts in the remaining first-line space')
    assert(geometry.words.length > 1, 'A long fetched title wraps instead of truncating inside a chip')
    assert(geometry.bounds.height > 44.5, 'Board link titles grow beyond two lines')
    assert(Math.abs(geometry.prefix.left - geometry.checkbox.right - 7.2) < 0.5, 'The first title line starts after the checkbox')
    assert(geometry.fragments.slice(1).every(rect => Math.abs(rect.left - geometry.checkbox.left) < 1.5), 'Continuation lines reclaim the checkbox space')
    assert(geometry.words.every(rect => rect.right <= geometry.bounds.right + 1 && rect.left >= geometry.bounds.left - 1 && rect.bottom <= geometry.bounds.bottom + 1), 'Every wrapped link fragment remains fully visible within the title')
    const persisted = JSON.parse(await readFile(filename(directory, legacyUrl), 'utf8'))
    assert.equal(persisted.fetchedAt, fetchedAt, 'Icon enrichment never resets metadata freshness')
    assert(persisted.faviconCheckedAt >= fetchedAt)
    assert.deepEqual({ ...persisted.preview, favicon: undefined }, { ...legacy, favicon: undefined })
    assert.equal((await app.evaluate(() => globalThis.inlineIconProbe.requests)).length, 1, 'Inline/card/duplicate requests share one icon fetch without refetching metadata or covers')

    const previousFailure = await page.evaluate(url => window.goalloom.getLinkPreview(url), missingUrl)
    assert.equal(previousFailure.favicon, png, 'Previously null icons without a check timestamp are retried')
    const video = await page.evaluate(url => window.goalloom.getLinkPreview(url), videoUrl)
    assert.equal(video.status, 'ready'); assert.equal(video.title, 'Controlled video')
    assert.match(video.favicon, /^data:image\/x-icon;base64,/)

    evidence.failures = []
    for (const [index, mode] of ['offline', 'svg', 'large'].entries()) {
      const url = `https://x.com/fixture/status/999990000000000001${index}`
      await seed(url)
      await app.evaluate((_, mode) => { globalThis.inlineIconProbe.mode = mode }, mode)
      const value = await page.evaluate(url => window.goalloom.getLinkPreview(url), url)
      assert.equal(value.favicon, null); assert.equal(value.title, title); assert.equal(value.image, png)
      const requests = (await app.evaluate(() => globalThis.inlineIconProbe.requests)).length
      await page.evaluate(url => Promise.all(Array.from({ length: 8 }, () => window.goalloom.getLinkPreview(url))), url)
      assert.equal((await app.evaluate(() => globalThis.inlineIconProbe.requests)).length, requests, 'Missing icons must not cause a request loop')
      const record = JSON.parse(await readFile(filename(directory, url), 'utf8'))
      assert(record.faviconCheckedAt > fetchedAt)
      evidence.failures.push({ mode, status: value.status, titleKept: true, coverKept: true, repeatedRequests: 0 })
    }
    evidence.requests = await app.evaluate(() => globalThis.inlineIconProbe.requests)
    assert(evidence.requests.every(request => request.credentials === 'omit' && request.redirect === 'error' && request.cache === 'no-store' && request.bypass === true))
    assert(evidence.requests.every(request => request.url.startsWith('https://www.youtube.com/oembed?') || ['https://x.com/favicon.ico', 'https://www.youtube.com/favicon.ico'].includes(request.url)))

    await row.locator('.task-title').press('Enter')
    const dialog = page.locator('dialog.detail')
    await dialog.locator('.description-content .link-inline[data-status="ready"]').first().waitFor()
    const description = await dialog.locator('.description-content').evaluate(element => [...element.querySelectorAll('.link-inline')].map(anchor => {
      const range = document.createRange(); range.selectNodeContents(anchor.querySelector('.link-domain-label'))
      return { text: anchor.textContent, display: getComputedStyle(anchor).display, fragments: range.getClientRects().length, href: anchor.getAttribute('href'), favicon: anchor.querySelector('img')?.naturalWidth }
    }))
    assert(description.every(link => link.display === 'inline' && link.favicon === 16 && link.href === legacyUrl))
    assert(description.some(link => link.fragments > 1), 'Description links also wrap naturally')
    assert(description[1].text.startsWith('这份关于'), 'Named links keep their authored text')
    assert.equal(await dialog.locator('.save-bar').count(), 0)
    assert.deepEqual(await page.evaluate(async id => (await window.goalloom.getItem(id)).item, itemId), before)
    const detailShot = `${output}/inline-description-wrapping.png`
    await dialog.screenshot({ path: detailShot }); evidence.screenshots.push(detailShot)
    await dialog.locator('.modal-header').getByRole('button', { name: '关闭', exact: true }).click()
    evidence.itemId = itemId; evidence.description = description
    return evidence
  } finally { await app.evaluate(() => globalThis.inlineIconProbe.restore()) }
}

export async function verifyInlineRestart(page, itemId) {
  await page.locator(`#item-${itemId} .link-inline`).first().scrollIntoViewIfNeeded()
  await pollPage(page, id => document.querySelector(`#item-${id} .link-favicon img`)?.naturalWidth === 16, itemId)
  const value = await page.evaluate(url => window.goalloom.getLinkPreview(url), legacyUrl)
  assert.equal(value.favicon, png); assert.equal(value.title, title)
  return { iconDecoded: true, titleKept: true, url: legacyUrl }
}
