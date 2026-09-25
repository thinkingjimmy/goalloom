/** Isolated production-path benchmark. Reuse only this suite's synthetic seed; never a user profile. */
import assert from 'node:assert/strict'
import { cp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { build } from 'vite'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const label = process.env.GOALLOOM_BENCH_LABEL ?? 'latest'
assert(/^[a-z0-9-]+$/.test(label))
const directory = resolve('output/tests/performance'), seed = join(directory, 'synthetic-seed')
const samples = Number(process.env.GOALLOOM_BENCH_SAMPLES ?? 3)
const execute = promisify(execFile)
await mkdir(directory, { recursive: true })
await build({ configFile: false, build: { outDir: 'output/tests/build/performance', emptyOutDir: false, lib: { entry: 'tests/desktop/fixtures/performance.ts', formats: ['cjs'], fileName: () => 'performance.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
async function fixture(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(electronPath, ['output/tests/build/performance/performance.cjs', ...args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' })
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`fixture failed: ${code}`)))
  })
}
if (!process.env.GOALLOOM_BENCH_REUSE || !await stat(join(seed, 'performance.json')).catch(() => null)) {
  await rm(seed, { recursive: true, force: true }); await mkdir(seed, { recursive: true }); await fixture([seed])
}
const report = { label, fixture: JSON.parse(await readFile(join(seed, 'performance.json'), 'utf8')), startup: [], snapshot: [], search: [], memory: [], transfers: [], panels: [] }
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2]
const launch = profile => electron.launch(packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`], env: environment } : { args: [process.env.GOALLOOM_BENCH_ENTRY ?? '.', `--user-data-dir=${profile}`], env: environment })
const nextFrame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
async function memory(app, page, stage) {
  const processes = await app.evaluate(({ app }) => app.getAppMetrics().map(({ pid, type, memory }) => ({ pid, type, workingSetKB: memory.workingSetSize })))
  const session = await page.context().newCDPSession(page)
  const heap = await session.send('Runtime.getHeapUsage'); await session.detach()
  const main = await app.evaluate(() => { const { heapUsed, external, arrayBuffers } = process.memoryUsage(); return { heapUsed, external, arrayBuffers } })
  report.memory.push({ stage, processes, renderer: heap, main })
}
let app, page, activeProfile
try {
  for (const paused of [false, true]) for (const daily of [false, true]) for (let sample = 0; sample < samples; sample++) {
    activeProfile = join(directory, `run-${paused}-${daily}-${sample}`)
    await rm(activeProfile, { recursive: true, force: true }); await mkdir(activeProfile, { recursive: true })
    await cp(join(seed, 'workspace.sqlite'), join(activeProfile, 'workspace.sqlite'))
    await writeFile(join(activeProfile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
    await fixture([activeProfile, 'prepare', String(paused), String(daily)])
    const start = performance.now(); app = await launch(activeProfile); page = await app.firstWindow()
    await page.locator('.board').waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.task-row').length > 0)
    await nextFrame(page)
    const visibleMs = performance.now() - start
    const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
    assert.equal(snapshot.items.length, 1000)
    report.startup.push({ paused, daily, sample, visibleMs, readConfirmedMs: performance.now() - start, mountedRows: await page.locator('.task-row').count() })
    await memory(app, page, `startup:${paused}:${daily}:${sample}`)
    if (!(paused && daily && sample === samples - 1)) { await app.close(); app = null; await rm(activeProfile, { recursive: true, force: true }) }
  }
  for (let i = 0; i < 12; i++) report.snapshot.push(await page.evaluate(async () => { const start = performance.now(); const data = await window.goalloom.getSnapshot(); return { ms: performance.now() - start, bytes: new TextEncoder().encode(JSON.stringify(data)).byteLength, count: data.items.length } }))
  await memory(app, page, 'idle')
  await page.getByRole('button', { name: '搜索与命令', exact: true }).click()
  for (const query of ['中', '中文', 'Alpha', '%', '_', '不存在', '中', '中文', 'Alpha', '%', '_', '不存在']) {
    const start = performance.now()
    await page.getByRole('textbox', { name: '搜索条目', exact: true }).fill(query)
    await page.waitForTimeout(250)
    // The fixed wait outlasts the 180 ms debounce, so the request for this query is already in flight.
    await page.waitForFunction(count => document.querySelectorAll('.command-results .menu-item').length === count, query === '不存在' ? 0 : 20)
    await nextFrame(page); report.search.push({ query: query === '不存在' ? 'absent' : 'present', automationMs: performance.now() - start })
  }
  await memory(app, page, 'search'); await page.keyboard.press('Escape')
  const first = report.fixture.firstId
  for (let i = 0; i < 110; i++) {
    // Search reaches an arbitrary logical row even when the board virtualizes it.
    await page.getByRole('button', { name: '搜索与命令', exact: true }).click()
    await page.getByRole('textbox', { name: '搜索条目', exact: true }).fill('活跃计划 200 ')
    await page.locator('.command-results .menu-item').first().click()
    await page.locator('.modal.detail').waitFor()
    await page.keyboard.press('Escape'); await nextFrame(page)
    if (i === 9 || i === 59 || i === 109) {
      const session = await page.context().newCDPSession(page)
      await session.send('HeapProfiler.collectGarbage'); const heap = await session.send('Runtime.getHeapUsage'); const dom = await session.send('Memory.getDOMCounters'); await session.detach()
      report.panels.push({ cycles: i + 1, heap, dom }); await memory(app, page, `panels:${i + 1}`)
    }
  }
  for (let i = 0; i < 20; i++) {
    await page.evaluate(async ({ id, i }) => {
      const [snapshot, detail] = await Promise.all([window.goalloom.getSnapshot(), window.goalloom.getItem(id)])
      const reply = await window.goalloom.execute({ type: 'edit', operationId: crypto.randomUUID(), generation: snapshot.workspace.generation, itemId: id, expectedVersion: detail.item.version, title: `Edited synthetic item ${i}`, description: detail.item.description, dueDate: detail.item.dueDate })
      if (!reply.ok) throw Error(reply.code)
    }, { id: first, i })
  }
  await memory(app, page, 'continuous-edit')
  for (let sample = 0; sample < samples; sample++) {
    const exportPath = join(activeProfile, `export-${sample}.json`)
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, exportPath)
    for (const stage of ['export', 'preview-cancel', 'preview-commit']) {
      let peakRssKB = 0, polling = false
      const timer = setInterval(async () => { if (polling) return; polling = true; try { const { stdout } = await execute('ps', ['-o', 'rss=', '-p', String(app.process().pid)]); peakRssKB = Math.max(peakRssKB, Number(stdout.trim())) } finally { polling = false } }, 25)
      const start = performance.now()
      try {
        await page.evaluate(async stage => {
          if (stage === 'export') { await window.goalloom.exportWorkspace(); return }
          const snapshot = await window.goalloom.getSnapshot(), generation = snapshot.workspace.generation
          const preview = await window.goalloom.data({ type: 'chooseImport', generation })
          if (preview.type !== 'preview') throw Error('Preview missing')
          if (stage === 'preview-cancel') { await window.goalloom.data({ type: 'cancel', generation, token: preview.preview.token }); return }
          const prepared = await window.goalloom.data({ type: 'prepare', generation, token: preview.preview.token })
          if (prepared.type !== 'preview') throw Error('Preparation missing')
          await window.goalloom.data({ type: 'commit', generation, token: prepared.preview.token, acknowledged: true })
        }, stage)
      } finally { clearInterval(timer) }
      report.transfers.push({ sample, stage, ms: performance.now() - start, peakMainRssKB: peakRssKB })
      await memory(app, page, `${stage}:${sample}`)
    }
  }
  await page.screenshot({ path: join(directory, `${label}.png`) })
  report.packaged = Boolean(packaged)
  const quantiles = values => { const sorted = values.toSorted((a, b) => a - b); return { p50: sorted[Math.floor((sorted.length - 1) * .5)], p95: sorted[Math.ceil((sorted.length - 1) * .95)] } }
  report.summary = { snapshotMs: quantiles(report.snapshot.map(row => row.ms)), automationSearchMs: quantiles(report.search.map(row => row.automationMs)), visibleStartupMs: quantiles(report.startup.map(row => row.visibleMs)) }
  await writeFile(join(directory, `${label}.json`), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.summary))
} finally { if (app) await app.close(); if (activeProfile) await rm(activeProfile, { recursive: true, force: true }) }
