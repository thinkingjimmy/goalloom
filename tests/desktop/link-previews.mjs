/**
 * [INPUT]: Real Electron, a fresh profile, a seeded production preview cache and authoritative IPC fixtures.
 * [OUTPUT]: Repeatable link rendering, carousel, offline, lifecycle and locale evidence under output/tests/link-previews.
 * [POS]: Focused desktop acceptance. Only transport and external-browser boundaries are disabled in the test process.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, tmpdir, version } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'
import { seedPreviewCache, titles, urls } from './fixtures/link-preview-cache.mjs'

const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2], output = 'output/tests/link-previews'
const profile = await mkdtemp(join(tmpdir(), 'goalloom-link-previews-'))
await mkdir(output, { recursive: true })
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const cache = await seedPreviewCache(profile)
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const checks = [], errors = [], screenshots = []
const report = {
  packaged: Boolean(packaged), runtime: null, result: 'running',
  environment: { platform: platform(), release: release(), version: version(), arch: arch(), cpu: cpus()[0]?.model, machineScope: process.env.GOALLOOM_TEST_MACHINE_SCOPE ?? 'Host OS reported; physical/VM status not independently verified' },
  fixture: { entries: cache.entries, imageSize: cache.imageSize }, checks, errors, screenshots,
  scope: 'Production Electron renderer, preload, main, SQLite and cache. Synthetic public-URL cache entries; Node DNS/HTTP(S) and the isolated provider session fetch are denied in the test process. shell.openExternal recorded, not launched. Live providers, packaged builds when no executable is supplied, and Windows acceptance are outside this run.',
}
let application, page, ids, saved

async function launch() {
  application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
  await application.evaluate(async ({ shell, session, app }) => {
    await app.whenReady()
    globalThis.linkPreviewProbe = { external: [], requests: [], lookups: [], providerFetches: [] }
    shell.openExternal = async url => { globalThis.linkPreviewProbe.external.push(url) }
    for (const protocol of ['http', 'https']) {
      const transport = process.getBuiltinModule(protocol)
      transport.request = (...arguments_) => {
        globalThis.linkPreviewProbe.requests.push({ protocol, target: String(arguments_[0]?.href ?? arguments_[0]?.hostname ?? arguments_[0]) })
        throw new Error('Network disabled by the desktop acceptance probe')
      }
    }
    process.getBuiltinModule('dns/promises').lookup = async hostname => {
      globalThis.linkPreviewProbe.lookups.push(hostname)
      throw new Error('DNS disabled by the desktop acceptance probe')
    }
    session.fromPartition('goalloom-link-preview', { cache: false }).fetch = async url => {
      globalThis.linkPreviewProbe.providerFetches.push(String(url))
      throw new Error('Provider network disabled by the desktop acceptance probe')
    }
    process.getBuiltinModule('module').syncBuiltinESMExports()
  })
  page = await application.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  // Native wheel hit testing uses the real window bounds, not only CDP's emulated viewport.
  await application.evaluate(({ BrowserWindow, app }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.setContentSize(1880, 1000); window.show(); window.focus(); app.focus({ steal: true })
  })
  await page.setViewportSize({ width: 1880, height: 1000 })
  await page.bringToFront()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const session = await page.context().newCDPSession(page)
  await session.send('Page.setBypassCSP', { enabled: false })
}

const row = id => page.locator(`#item-${id}`)
const detail = () => page.getByRole('dialog', { name: '当前条目', exact: true })
const storedItem = id => page.evaluate(async value => (await window.goalloom.getItem(value)).item, id)
const probe = () => application.evaluate(() => globalThis.linkPreviewProbe)
const shot = async name => { const path = `${output}/${name}.png`; await page.screenshot({ path }); screenshots.push(path) }
const closeDetail = () => detail().getByRole('button', { name: '关闭', exact: true }).click()
const waitReady = async (container, count, visible = count) => {
  await container.locator('.link-preview[data-status="ready"]').nth(visible - 1).waitFor()
  assert.equal(await container.locator('.link-preview').count(), count)
}

async function openStored(title, archived = false) {
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置与数据', exact: true })
  await settings.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '已完成', exact: true }).click()
  if (archived) await settings.getByRole('radio', { name: /^归档/ }).click()
  await settings.getByRole('button', { name: title, exact: true }).press('Enter')
  await detail().locator('.title-input').waitFor()
  return settings
}

try {
  await launch()
  await page.getByRole('button', { name: '先跳过', exact: true }).click()
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())

  // One new item follows the visible composer path; other records use the authoritative write boundary.
  await page.getByRole('button', { name: '在3个月新建', exact: true }).click()
  const input = page.getByRole('textbox', { name: '新建到3个月', exact: true })
  await input.fill(titles.mixed)
  assert.equal(await input.inputValue(), titles.mixed)
  await input.press('Enter'); await input.press('Escape')
  await pollPage(page, async title => (await window.goalloom.getSnapshot()).items.some(item => item.title === title), titles.mixed)
  ids = await page.evaluate(async source => {
    const snapshot = await window.goalloom.getSnapshot(), generation = snapshot.workspace.generation
    const execute = async action => {
      const reply = await window.goalloom.execute({ ...action, generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw new Error(reply.message)
      return reply.result
    }
    const output = { mixed: snapshot.items.find(item => item.title === source.mixed).id }
    for (const [name, horizon] of [['multiple', 'week'], ['repeated', 'month'], ['completed', 'later'], ['archived', 'later']]) {
      const result = await execute({ type: 'create', title: source[name], horizon }); output[name] = result.itemId
      if (name === 'completed' || name === 'archived') {
        let item = (await window.goalloom.getItem(result.itemId)).item
        await execute({ type: 'status', itemId: item.id, expectedVersion: item.version, status: 'done' })
        if (name === 'archived') {
          item = (await window.goalloom.getItem(item.id)).item
          await execute({ type: 'archive', itemId: item.id, expectedVersion: item.version, archived: true })
        }
      }
    }
    return output
  }, titles)
  saved = Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([key, id]) => [key, await storedItem(id)])))
  await waitReady(row(ids.mixed), 1)
  const mixedText = await row(ids.mixed).locator('.link-rich-text').innerText()
  assert.match(mixedText, /用这个 x 帖子/); assert.match(mixedText, /作为小红书或者公众号分享/)
  assert.equal(mixedText.includes('/status/'), false, 'Bare URLs use a compact label after saving')
  assert.equal(await row(ids.mixed).locator('.link-inline').getAttribute('href'), urls.x)
  assert.equal(await row(ids.mixed).locator('button a').count(), 0, 'Inline anchors are never nested in a button')
  await waitReady(row(ids.repeated), 1)
  assert.deepEqual(await row(ids.repeated).locator('.link-inline').allTextContents(), ['这篇帖子', '原帖'])
  await waitReady(row(ids.multiple), 3, 1)
  assert.equal(await row(ids.multiple).locator('.link-preview').nth(2).getAttribute('data-status'), 'pending', 'An offscreen third card is not fetched eagerly')
  assert.equal(await row(ids.multiple).locator('.link-inline').first().innerText(), '这支动画')
  assert.equal(await row(ids.multiple).locator('.link-inline').first().getAttribute('href'), urls.youtube)
  await pollPage(page, id => document.querySelector(`#item-${id} .link-preview img`)?.naturalWidth === 96, ids.mixed)
  const imageEvidence = await row(ids.mixed).locator('.link-preview img').evaluate(image => ({ complete: image.complete, naturalWidth: image.naturalWidth, source: image.src.split(',')[0] }))
  assert.deepEqual(imageEvidence, { complete: true, naturalWidth: 96, source: 'data:image/png;base64' })
  assert.equal((await probe()).requests.length, 0, 'Fresh cached previews need no network')
  assert.equal((await probe()).lookups.length, 0, 'Fresh cached previews need no DNS')
  assert.equal((await probe()).providerFetches.length, 0, 'Fresh cached previews need no provider fetch')
  report.image = imageEvidence
  checks.push('New input preserves raw source; saved mixed prose uses a compact URL label, custom labels survive, duplicate references share a preview, cached PNG decodes under the production CSP')

  const carousel = row(ids.multiple), track = carousel.locator('.link-carousel-track'), counter = carousel.locator('.link-carousel-count')
  const next = carousel.locator('.link-carousel-next'), previous = carousel.locator('.link-carousel-previous')
  assert.equal((await counter.innerText()).trim(), '1 / 3')
  assert.equal(await previous.isDisabled(), true)
  const geometry = await track.evaluate(element => {
    const slides = [...element.querySelectorAll('.link-carousel-slide')], bounds = element.getBoundingClientRect(), second = slides[1].getBoundingClientRect()
    return { width: bounds.width, heights: slides.map(slide => slide.getBoundingClientRect().height), nextPeek: bounds.right - second.left }
  })
  assert(geometry.nextPeek > 0 && geometry.nextPeek < 64, 'The next card visibly peeks into the strip')
  assert(Math.max(...geometry.heights) - Math.min(...geometry.heights) <= 1, 'Image and image-free cards keep the same height')
  await next.click(); await pollPage(page, id => document.querySelector(`#item-${id} .link-carousel-count`)?.textContent.trim() === '2 / 3', ids.multiple)
  await track.focus(); await page.keyboard.press('ArrowRight')
  await pollPage(page, id => document.querySelector(`#item-${id} .link-carousel-count`)?.textContent.trim() === '3 / 3', ids.multiple)
  await waitReady(carousel, 3)
  assert.equal(await next.isDisabled(), true)
  await page.keyboard.press('ArrowLeft')
  await pollPage(page, id => document.querySelector(`#item-${id} .link-carousel-count`)?.textContent.trim() === '2 / 3', ids.multiple)
  await previous.click()
  await pollPage(page, id => document.querySelector(`#item-${id} .link-carousel-count`)?.textContent.trim() === '1 / 3', ids.multiple)
  await track.hover()
  await page.evaluate(() => {
    window.linkPreviewWheelEvents = []
    document.addEventListener('wheel', event => {
      const entry = { target: event.target.className, deltaX: event.deltaX, deltaY: event.deltaY, defaultPrevented: event.defaultPrevented }
      window.linkPreviewWheelEvents.push(entry)
      queueMicrotask(() => { entry.defaultPrevented = event.defaultPrevented })
    }, { capture: true, passive: true })
  })
  const wheelState = () => track.evaluate(element => {
    const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return { rect: rect.toJSON(), scrollLeft: element.scrollLeft, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, documentFocus: document.hasFocus(), hit: hit?.className, boardScrollLeft: document.querySelector('.board')?.scrollLeft, events: window.linkPreviewWheelEvents }
  })
  report.wheel = { before: await wheelState(), native: await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), bounds: window.getBounds(), contentBounds: window.getContentBounds() }))) }
  await page.mouse.wheel(360, 0)
  try { await pollPage(page, id => document.querySelector(`#item-${id} .link-carousel-track`).scrollLeft > 100, ids.multiple, { timeout: 5000 }) }
  finally { report.wheel.after = await wheelState() }
  await page.waitForTimeout(200)
  const stripBounds = await track.boundingBox()
  await page.mouse.move(stripBounds.x + stripBounds.width / 2, stripBounds.y + 1)
  await page.mouse.down()
  await page.mouse.move(stripBounds.x + stripBounds.width / 2 - 70, stripBounds.y + 1, { steps: 8 })
  assert.equal(await page.locator('html[data-dragging="true"]').count(), 0)
  await page.mouse.up()
  assert.deepEqual((await storedItem(ids.multiple)).placement, saved.multiple.placement)
  assert.equal((await probe()).external.length, 0, 'Carousel navigation never opens a browser')
  assert.equal(await carousel.getByText('查看全部', { exact: true }).count(), 0)
  report.carousel = geometry
  await shot('carousel-and-mixed-links')
  checks.push('Carousel next/previous, arrow keys and horizontal wheel work with a visible next card, stable heights, accurate bounds and no task move, external opening or View all entry')

  await row(ids.mixed).locator('.link-inline').click()
  await pollPage(page, () => document.querySelector('main') !== null)
  await row(ids.mixed).locator('.link-preview').click()
  await row(ids.multiple).locator('.link-inline').first().click()
  for (let attempt = 0; attempt < 100 && (await probe()).external.length < 3; attempt++) await page.waitForTimeout(20)
  assert.deepEqual((await probe()).external, [urls.x, urls.x, urls.youtube])
  assert.equal(await detail().count(), 0, 'Inline/card clicks do not accidentally open task details')
  checks.push('Inline and preview clicks open exact URLs, including query and fragment, through production IPC while the external shell is safely recorded')

  const invalidBefore = await probe()
  const rejected = await page.evaluate(async () => {
    const inputs = ['javascript:alert(1)', 'file:///tmp/private.txt', 'https://127.0.0.1/private', 'http://10.0.0.1/private', 'http://[::1]/private', 'https://localhost/private']
    const output = []
    for (const url of inputs) {
      try { output.push({ url, result: await window.goalloom.getLinkPreview(url) }) }
      catch { output.push({ url, rejected: true }) }
    }
    for (const url of ['javascript:alert(1)', 'file:///tmp/private.txt']) {
      try { await window.goalloom.openExternal(url); output.push({ external: url, rejected: false }) }
      catch { output.push({ external: url, rejected: true }) }
    }
    return output
  })
  assert(rejected.filter(value => value.url).every(value => value.rejected || value.result.status === 'unavailable'))
  assert.equal((await probe()).requests.length, invalidBefore.requests.length, 'Unsafe/private preview URLs are rejected before transport')
  assert.equal((await probe()).lookups.length, invalidBefore.lookups.length, 'Unsafe/private preview URLs are rejected before DNS')
  assert.equal((await probe()).providerFetches.length, invalidBefore.providerFetches.length, 'Unsafe/private preview URLs never enter a provider session')
  assert.equal((await probe()).external.length, 3, 'Unsafe schemes never reach the shell')
  report.rejected = rejected
  checks.push('Unsafe schemes and private-network preview URLs fail before transport; unsafe external URLs never reach Electron shell')

  const failureId = await page.evaluate(async title => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const result = await window.goalloom.execute({ type: 'create', title, horizon: 'day', generation, operationId: crypto.randomUUID() })
    if (!result.ok) throw new Error(result.message)
    return result.result.itemId
  }, titles.failure)
  await row(failureId).locator('.link-preview[data-status="unavailable"]').waitFor()
  assert.equal(await row(failureId).locator('.link-preview').getAttribute('href'), urls.unavailable)
  await row(failureId).locator('.link-preview').click()
  for (let attempt = 0; attempt < 100 && (await probe()).external.length < 4; attempt++) await page.waitForTimeout(20)
  assert.equal((await probe()).external.at(-1), urls.unavailable)
  await shot('offline-fallback')
  await page.evaluate(async id => {
    const snapshot = await window.goalloom.getSnapshot(), item = (await window.goalloom.getItem(id)).item
    const reply = await window.goalloom.execute({ type: 'archive', itemId: id, expectedVersion: item.version, archived: true, generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw new Error(reply.message)
  }, failureId)
  checks.push('A real uncached lookup denied by the offline transport produces a usable HTTP(S) fallback')

  for (const [key, id] of Object.entries(ids)) assert.deepEqual(await storedItem(id), saved[key], `${key}: preview reads must not change any item fields`)
  await row(ids.mixed).locator('.task-title').press('Enter')
  assert.equal(await detail().locator('.title-input').inputValue(), titles.mixed)
  await waitReady(detail(), 1)
  const edited = `${titles.mixed}，保留原链接。`
  await detail().locator('.title-input').fill(edited)
  await detail().getByRole('button', { name: /^保存/ }).click()
  await pollPage(page, async ({ id, title }) => (await window.goalloom.getItem(id)).item.title === title, { id: ids.mixed, title: edited })
  await closeDetail()
  assert.equal((await storedItem(ids.mixed)).title, edited)
  saved.mixed = await storedItem(ids.mixed)
  checks.push('Preview reads leave all item fields unchanged; detail editing reveals original raw links and saves the exact new text')

  for (const [key, archived] of [['completed', false], ['archived', true]]) {
    const settings = await openStored(titles[key], archived)
    assert.equal(await detail().locator('.title-input').inputValue(), titles[key])
    await waitReady(detail(), 1)
    assert.deepEqual(await storedItem(ids[key]), saved[key])
    await shot(`legacy-${key}`)
    await closeDetail(); await settings.getByRole('button', { name: '关闭', exact: true }).click()
  }
  checks.push('Completed and archived records render their cached links without changing raw title, version, timestamps or lifecycle state')

  const localeEvidence = {}
  for (const locale of ['zh', 'en', 'ja', 'es', 'fr']) {
    await page.evaluate(value => window.goalloom.setLanguage(value), locale)
    await page.reload()
    await row(ids.multiple).locator('.link-carousel-next').waitFor()
    const controls = await carousel.locator('.link-carousel-previous, .link-carousel-next').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))
    assert(controls.every(Boolean), `${locale}: carousel controls need accessible names`)
    assert(controls.every(label => !label.includes('undefined')), `${locale}: missing preview copy`)
    if (['en', 'es', 'fr'].includes(locale)) assert(controls.every(label => !/[一-鿿]/.test(label)), `${locale}: untranslated Chinese carousel copy`)
    assert.equal(await row(ids.mixed).locator('.link-inline').getAttribute('href'), urls.x)
    localeEvidence[locale] = { controls, documentLanguage: await page.evaluate(() => document.documentElement.lang) }
    await shot(`locale-${locale}`)
  }
  assert.equal(new Set(Object.values(localeEvidence).map(value => value.controls.join('|'))).size, 5, 'Every supported locale supplies its own controls')
  report.locales = localeEvidence
  await page.evaluate(() => window.goalloom.setLanguage('zh'))
  checks.push('All five locales provide accessible translated preview controls without changing link destinations')
  report.firstLaunch = await probe()
  await application.close(); application = null

  // The second launch has no renderer memory cache. Existing records and on-disk metadata are the only inputs.
  await launch()
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  await waitReady(row(ids.mixed), 1)
  await waitReady(row(ids.multiple), 3, 1)
  await pollPage(page, id => document.querySelector(`#item-${id} .link-preview img`)?.naturalWidth === 96, ids.mixed)
  assert.equal(await row(ids.mixed).locator('.link-preview img').evaluate(image => image.complete && image.naturalWidth === 96), true)
  for (const [key, id] of Object.entries(ids)) assert.deepEqual(await storedItem(id), saved[key], `${key}: restart must not migrate or rewrite link text`)
  const cacheFiles = await Promise.all([urls.x, urls.youtube, urls.article].map(async url => {
    const canonical = new URL(url); canonical.hash = ''
    const { createHash } = await import('node:crypto')
    const file = join(cache.directory, `${createHash('sha256').update(canonical.href).digest('hex')}.json`)
    const data = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(data.preview.status, 'ready')
    return { url, status: data.preview.status, hasImage: !!data.preview.image }
  }))
  report.restart = { cacheFiles, probe: await probe() }
  assert.equal(report.restart.probe.external.length, 0)
  assert.deepEqual(report.restart.probe.requests, [], 'Fresh cache avoids transport after restart')
  assert.deepEqual(report.restart.probe.lookups, [], 'Fresh cache avoids DNS after restart')
  assert.deepEqual(report.restart.probe.providerFetches, [], 'Fresh cache avoids provider fetch after restart')
  await shot('offline-restart')
  checks.push('A cold renderer restart renders existing raw-link records and disk-cached images with HTTP(S) transport disabled, without an item migration or write')
  assert.deepEqual(errors, [])
  report.result = 'passed'
} catch (error) {
  report.result = 'failed'; report.failure = error.stack ?? String(error)
  if (page && !page.isClosed()) await shot('failure').catch(() => {})
  throw error
} finally {
  if (application) await application.close().catch(() => {})
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  await rm(profile, { recursive: true, force: true })
  console.log(JSON.stringify({ result: report.result, checks: checks.length, report: `${output}/report.json`, screenshots }))
}
