/**
 * [INPUT]: Production Electron entry or packaged executable, isolated synthetic profiles and benchmark options.
 * [OUTPUT]: Repeated visible-startup/idle memory measurements, lazy-panel checks, JSON and screenshots.
 * [POS]: Optional desktop performance evidence; never reads user workspaces or configures cloud services.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, tmpdir, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron } from 'playwright'

const label = process.env.GOALLOOM_STARTUP_LABEL ?? 'latest'
const samples = Number(process.env.GOALLOOM_STARTUP_SAMPLES ?? 3)
const idleMs = Number(process.env.GOALLOOM_STARTUP_IDLE_MS ?? 2000)
const counts = process.env.GOALLOOM_STARTUP_ITEMS ? [Number(process.env.GOALLOOM_STARTUP_ITEMS)] : [0, 100]
const collectScripts = process.env.GOALLOOM_STARTUP_SCRIPTS !== '0'
assert(/^[a-z0-9-]+$/.test(label), 'Use a lowercase alphanumeric benchmark label')
assert(Number.isInteger(samples) && samples >= 1 && samples <= 20, 'Use 1–20 samples')
assert(Number.isInteger(idleMs) && idleMs >= 1000 && idleMs <= 30_000, 'Use an idle interval of 1000–30000 ms')
assert(counts.every(count => count === 0 || count === 100), 'Use an empty or 100-item board')
const packaged = process.argv[2] ? resolve(process.argv[2]) : null
const entry = resolve(process.env.GOALLOOM_STARTUP_ENTRY ?? '.')
const directory = resolve('output/tests/performance/startup')
const temporary = await mkdtemp(join(tmpdir(), 'Goalloom startup synthetic '))
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
delete environment.ELECTRON_RENDERER_URL
const execute = promisify(execFile)
const hypervisor = platform() === 'darwin'
  ? (await execute('sysctl', ['-n', 'kern.hv_vmm_present']).catch(() => ({ stdout: 'unknown' }))).stdout.trim()
  : 'unknown'
const report = {
  label, createdAt: new Date().toISOString(), packaged: Boolean(packaged), entry: packaged ?? entry,
  environment: {
    os: `${platform()} ${release()}`, arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length,
    memoryBytes: totalmem(), runnerNode: process.versions.node,
    machineScope: hypervisor === '1' ? 'VM (hypervisor reported)' : hypervisor === '0' ? 'Physical host (no hypervisor reported)' : 'Physical/VM status not detected',
  },
  method: {
    samples, idleMs, counts, collectScripts, clock: 'Runner performance.now; launch through visible native window, populated board and two animation frames',
    panels: 'Browser input event to observed open dialog and two animation frames; runner automation time is separate because locator polling can overshoot a Suspense reveal.',
    profile: 'Fresh app caches on each launch; only a closed, configured synthetic SQLite database is copied. OS filesystem caches are not flushed.',
    backup: 'Default daily backups enabled; each measured profile starts without backups',
    memory: 'Electron per-process workingSetSize in KiB; summed working sets can double-count shared pages. Main process includes storage worker threads.',
    heap: 'CDP Runtime.getHeapUsage in bytes; startup and idle are natural GC state. Forced GC is recorded only after panel checks.',
    scripts: 'Custom-protocol ResourceTiming is unavailable. CDP parsed-script URLs and UTF-8 source sizes are captured after the memory sample; these are source bytes, not network transfer bytes.',
  },
  runtime: null, fixtures: [], launches: [], panels: [], errors: [],
}
await mkdir(directory, { recursive: true })
let app, page
const launch = profile => electron.launch({
  ...(packaged ? { executablePath: packaged, args: [`--user-data-dir=${profile}`] } : { args: [entry, `--user-data-dir=${profile}`] }),
  env: environment, timeout: 30_000,
})
const nextFrame = target => target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
async function connect(profile) {
  app = await launch(profile)
  page = await app.firstWindow()
  page.on('pageerror', error => report.errors.push(error.message))
}
async function close() {
  if (!app) return
  await app.close()
  app = null
  page = null
}
async function profileAt(name) {
  const profile = join(temporary, name)
  await mkdir(profile, { recursive: true })
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  await writeFile(join(profile, 'window.json'), JSON.stringify({ x: 0, y: 0, width: 1280, height: 840, maximized: false }))
  return profile
}
async function memory() {
  const processes = await app.evaluate(({ app }) => app.getAppMetrics().map(({ pid, type, name, memory }) => ({
    pid, type, name, workingSetKB: memory.workingSetSize, peakWorkingSetKB: memory.peakWorkingSetSize, privateBytesKB: memory.privateBytes,
  })))
  const session = await page.context().newCDPSession(page)
  try {
    const renderer = await session.send('Runtime.getHeapUsage')
    const dom = await session.send('Memory.getDOMCounters')
    const main = await app.evaluate(() => {
      const { heapUsed, heapTotal, external, arrayBuffers } = process.memoryUsage()
      return { heapUsed, heapTotal, external, arrayBuffers }
    })
    return { processes, totalWorkingSetKB: processes.reduce((sum, process) => sum + process.workingSetKB, 0), renderer, dom, main }
  } finally { await session.detach() }
}
async function resources() {
  if (!collectScripts) return { scripts: null, reason: 'Script inspection disabled to isolate instrumentation effects' }
  const session = await page.context().newCDPSession(page), parsed = new Map()
  session.on('Debugger.scriptParsed', script => {
    if (script.url.startsWith('goalloom://app/') && /\.m?js(?:[?#]|$)/.test(script.url)) parsed.set(script.url, script)
  })
  try {
    await session.send('Debugger.enable')
    const scripts = []
    for (const script of parsed.values()) {
      const { scriptSource } = await session.send('Debugger.getScriptSource', { scriptId: script.scriptId })
      scripts.push({ url: script.url, sourceBytes: Buffer.byteLength(scriptSource, 'utf8') })
    }
    assert(scripts.length > 0, 'At least one production renderer script must be loaded')
    return {
      viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio })),
      scripts: scripts.sort((a, b) => a.url.localeCompare(b.url)),
    }
  } finally {
    try { await session.send('Debugger.disable') } finally { await session.detach() }
  }
}
async function seed(profile, count) {
  await connect(profile)
  await page.getByRole('button', { name: '先跳过', exact: true }).click()
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  if (count) await page.evaluate(async () => {
    const snapshot = await window.goalloom.getSnapshot(), roots = []
    for (const horizon of ['cycle', 'later', 'month', 'week', 'day']) for (let index = 0; index < 20; index++) {
      const parentId = !['cycle', 'later'].includes(horizon) && index < 12 ? roots[index % roots.length] : null
      const parent = parentId ? await window.goalloom.getItem(parentId) : null
      const reply = await window.goalloom.execute({
        type: 'create', operationId: crypto.randomUUID(), generation: snapshot.workspace.generation,
        title: `Startup fixture ${horizon} ${String(index + 1).padStart(2, '0')}`,
        description: 'Synthetic local benchmark task. No personal content or credentials.', horizon,
        parentId, expectedParentVersion: parent?.item.version ?? null,
        flowColor: horizon === 'cycle' && index < 4 ? index : null,
      })
      if (!reply.ok) throw new Error(reply.message)
      if (horizon === 'cycle' && index < 4) roots.push(reply.result.itemId)
    }
  })
  const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
  assert.equal(snapshot.items.length, count)
  assert(snapshot.workspace.setupConfirmedAt)
  report.fixtures.push({ count, relations: snapshot.relations.length, flows: snapshot.flows.length, timezone: snapshot.workspace.calendar.timezone })
  report.runtime ??= await page.evaluate(() => window.goalloom.getRuntime())
  await close()
}
async function panelCheck(count) {
  const checks = []
  async function open(name, title, action, locator) {
    await page.evaluate(title => {
      window.__startupPanelTiming = new Promise(resolve => {
        let inputAt = null, detected = false
        const record = event => {
          if (event.type === 'keydown' && ['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return
          inputAt ??= performance.now()
        }
        const cleanup = () => {
          observer.disconnect(); clearTimeout(timeout)
          document.removeEventListener('keydown', record, true)
          document.removeEventListener('click', record, true)
        }
        const observer = new MutationObserver(() => {
          const dialog = [...document.querySelectorAll('dialog[open]')].find(element => element.getAttribute('aria-label') === title)
          if (detected || inputAt === null || !dialog || !dialog.getBoundingClientRect().width) return
          detected = true
          const openAt = performance.now()
          cleanup()
          requestAnimationFrame(() => requestAnimationFrame(() => resolve({ inputToOpenMs: openAt - inputAt, inputToPaintMs: performance.now() - inputAt })))
        })
        const timeout = setTimeout(() => { cleanup(); resolve({ timedOut: true }) }, 10_000)
        document.addEventListener('keydown', record, true)
        document.addEventListener('click', record, true)
        observer.observe(document.body, { attributes: true, attributeFilter: ['open'], childList: true, subtree: true })
      })
    }, title)
    const start = performance.now()
    await action()
    await locator.waitFor()
    await nextFrame(page)
    const automationMs = performance.now() - start
    const timing = await page.evaluate(async () => { const timing = await window.__startupPanelTiming; delete window.__startupPanelTiming; return timing })
    assert.equal(timing.timedOut, undefined, 'The native dialog must open following the input event')
    checks.push({ name, ...timing, automationMs })
  }
  const settings = page.getByRole('dialog', { name: '设置与数据', exact: true })
  await open('settings', '设置与数据', () => page.keyboard.press('ControlOrMeta+Comma'), settings)
  await settings.getByRole('navigation', { name: '设置分类' }).waitFor()
  await settings.getByRole('button', { name: '关闭', exact: true }).click()
  await settings.waitFor({ state: 'hidden' })
  const palette = page.getByRole('dialog', { name: '搜索与命令', exact: true })
  await open('search', '搜索与命令', () => page.keyboard.press('ControlOrMeta+k'), palette)
  await palette.getByRole('textbox', { name: '搜索条目', exact: true }).fill('Startup fixture cycle 01')
  if (count) await page.locator('.command-results .menu-item').first().waitFor()
  await page.keyboard.press('Escape')
  await palette.waitFor({ state: 'hidden' })
  const composer = page.getByRole('dialog', { name: '新建', exact: true })
  await open('composer', '新建', () => page.keyboard.press('ControlOrMeta+n'), composer)
  const input = composer.getByRole('textbox', { name: '写下想法', exact: true })
  await input.fill('Synthetic unsaved draft retained after closing')
  await page.keyboard.press('Escape')
  await composer.waitFor({ state: 'hidden' })
  await page.keyboard.press('ControlOrMeta+n')
  assert.equal(await input.inputValue(), 'Synthetic unsaved draft retained after closing')
  await composer.screenshot({ path: join(directory, `${label}-${count}-composer.png`) })
  await composer.getByRole('button', { name: '清空草稿', exact: true }).click()
  await composer.waitFor({ state: 'hidden' })
  if (count) {
    const detail = page.getByRole('dialog', { name: '当前条目', exact: true })
    await open('detail', '当前条目', () => page.getByRole('button', { name: 'Startup fixture cycle 01', exact: true }).click(), detail)
    assert.equal(await detail.getByLabel('说明', { exact: true }).inputValue(), 'Synthetic local benchmark task. No personal content or credentials.')
    await detail.getByRole('button', { name: '关闭', exact: true }).click()
    await detail.waitFor({ state: 'hidden' })
  }
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).items.length, count)
  const natural = await memory()
  const session = await page.context().newCDPSession(page)
  try { await session.send('HeapProfiler.collectGarbage') } finally { await session.detach() }
  report.panels.push({ count, checks, composerDraftRetained: true, natural, afterRendererGC: await memory(), resources: await resources() })
}
try {
  for (const count of counts) {
    const source = await profileAt(`seed-${count}`)
    await seed(source, count)
    for (let sample = 1; sample <= samples; sample++) {
      const profile = await profileAt(`run-${count}-${sample}`)
      await cp(join(source, 'workspace.sqlite'), join(profile, 'workspace.sqlite'))
      const start = performance.now()
      await connect(profile)
      await page.getByRole('main', { name: '时间看板' }).waitFor()
      if (count) await page.getByRole('button', { name: 'Startup fixture cycle 01', exact: true }).waitFor()
      assert(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()), 'Native window must be visible')
      await nextFrame(page)
      const visibleMs = performance.now() - start
      const startupMemory = await memory()
      await page.waitForTimeout(idleMs)
      const idleMemory = await memory()
      const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
      assert.equal(snapshot.items.length, count)
      assert.equal(snapshot.relations.length, count ? 36 : 0)
      assert.equal(snapshot.flows.length, count ? 4 : 0)
      assert.equal(snapshot.maintenance, false)
      assert.equal(snapshot.backupError, null)
      const row = {
        count, sample, visibleMs, idleAfterVisibleMs: performance.now() - start - visibleMs,
        resources: await resources(), mountedRows: await page.locator('.task-row').count(), startupMemory, idleMemory,
        backups: await page.evaluate(() => window.goalloom.getBackupSummary()),
      }
      report.launches.push(row)
      await page.screenshot({ path: join(directory, `${label}-${count}-${sample}.png`) })
      if (sample === samples && process.env.GOALLOOM_STARTUP_PANELS !== '0') await panelCheck(count)
      await close()
      console.log(JSON.stringify({ count, sample, visibleMs: Math.round(visibleMs), idleWorkingSetMiB: Math.round(idleMemory.totalWorkingSetKB / 1024), rendererHeapMiB: +(idleMemory.renderer.usedSize / 2 ** 20).toFixed(2) }))
    }
  }
  assert.deepEqual(report.errors, [], 'Renderer must not raise uncaught errors')
  const quantiles = values => {
    const sorted = values.toSorted((a, b) => a - b)
    return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) }
  }
  report.summary = counts.map(count => {
    const rows = report.launches.filter(row => row.count === count)
    return {
      count, visibleMs: quantiles(rows.map(row => row.visibleMs)),
      startupWorkingSetKB: quantiles(rows.map(row => row.startupMemory.totalWorkingSetKB)),
      idleWorkingSetKB: quantiles(rows.map(row => row.idleMemory.totalWorkingSetKB)),
      idleRendererHeapBytes: quantiles(rows.map(row => row.idleMemory.renderer.usedSize)),
    }
  })
  console.log(JSON.stringify(report.summary, null, 2))
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error)
  if (page) await page.screenshot({ path: join(directory, `${label}-failure.png`) }).catch(() => undefined)
  throw error
} finally {
  await writeFile(join(directory, `${label}.json`), JSON.stringify(report, null, 2))
  await close()
  await rm(temporary, { recursive: true, force: true })
}
