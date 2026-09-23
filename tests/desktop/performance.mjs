import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { build } from 'vite'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

await build({ configFile: false, build: { outDir: 'output/tests/build/performance', emptyOutDir: false, lib: { entry: 'tests/desktop/fixtures/performance.ts', formats: ['cjs'], fileName: () => 'performance.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
const profile = await mkdtemp(join(tmpdir(), 'Goalloom 性能验收 '))
let app
try {
  await new Promise((resolve, reject) => {
    const child = spawn(electronPath, ['output/tests/build/performance/performance.cjs', profile], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' })
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`fixture failed: ${code}`)))
  })
  const report = JSON.parse(await readFile(join(profile, 'performance.json'), 'utf8'))
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
  const packaged = process.argv[2], launchedAt = performance.now()
  app = await electron.launch(packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`], env: environment } : { args: ['.', `--user-data-dir=${profile}`], env: environment })
  const page = await app.firstWindow()
  await page.waitForFunction(() => document.querySelectorAll('.task-row').length === 1000)
  report.launchTo1000CardsMs = Math.round(performance.now() - launchedAt)
  report.packaged = Boolean(packaged)
  report.uiSnapshotMs = await page.evaluate(async () => { const start = performance.now(); await window.goalloom.getSnapshot(); return Math.round(performance.now() - start) })
  const searchAt = performance.now()
  await page.getByRole('button', { name: '搜索与命令', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索条目', exact: true }).fill('中文')
  await page.waitForFunction(() => document.querySelectorAll('.command-results .menu-item').length === 20)
  report.searchUiMs = Math.round(performance.now() - searchAt)
  report.memory = await app.evaluate(async ({ app }) => app.getAppMetrics().map(metric => ({ type: metric.type, workingSetKB: metric.memory.workingSetSize, peakWorkingSetKB: metric.memory.peakWorkingSetSize })))
  assert.equal(await page.locator('.command-results .menu-item').count(), 20)
  await mkdir('output/tests/performance', { recursive: true })
  await writeFile('output/tests/performance/latest.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally { if (app) await app.close(); await rm(profile, { recursive: true, force: true }) }
