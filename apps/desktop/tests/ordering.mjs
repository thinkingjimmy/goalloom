/**
 * [INPUT]: Current production Electron build, isolated SQLite ordering acceptance and native input, with explicit completed-layout controls.
 * [OUTPUT]: Repeatable placement/manual-sort/one-shot-sort evidence, plus source startup/rollover preference and projection-race evidence in the full run.
 * [POS]: Ordering E2E entry; --auto-placement and --edge-sorting stay narrow, while full source acceptance includes parent-placement.mjs and parent-preferences.mjs.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { setCompletedLayout } from './fixtures/completed-layout.mjs'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir, cpus, release, version, arch } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { edgeSorting } from './fixtures/edge-sorting.mjs'
import { autoPlacement } from './fixtures/auto-placement.mjs'
import { dragTitles } from './fixtures/drag-titles.mjs'

const edgeOnly = process.argv.includes('--edge-sorting'), placementOnly = process.argv.includes('--auto-placement')
const executable = process.argv.slice(2).find(argument => !argument.startsWith('--'))
const evidence = resolve('output/tests/ordering', edgeOnly ? 'edge-sorting' : placementOnly ? 'auto-placement' : '.')
await mkdir(evidence, { recursive: true })
await build({ configFile: false, build: { outDir: 'output/tests/build/ordering', emptyOutDir: false, lib: { entry: 'tests/fixtures/ordering-seed.ts', formats: ['cjs'], fileName: () => 'ordering-seed.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
const profile = await mkdtemp(join(tmpdir(), 'goalloom-ordering-'))
const report = { passed: false, packaged: Boolean(executable), checks: [], screenshots: [], videos: [], errors: [], scope: 'Source Electron, synthetic isolated SQLite and production IPC. No packaged or Windows acceptance.', environment: { version: version(), release: release(), arch: arch(), cpu: cpus()[0]?.model, machineScope: 'Host OS reported; physical/VM status not independently verified' } }
let application, page
try {
  const seed = spawnSync(electronPath, ['output/tests/build/ordering/ordering-seed.cjs', profile, join(evidence, 'transactions.json')], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
  assert.equal(seed.status, 0, seed.stderr)
  const { ids, report: data } = JSON.parse(await readFile(join(profile, 'ordering-fixture.json'), 'utf8'))
  report.runtime = data.runtime; report.checks.push(...data.checks)
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({ ...(executable ? { executablePath: resolve(executable), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }), env, recordVideo: { dir: join(evidence, 'video'), size: { width: 1880, height: 1000 } } })
  page = await application.firstWindow(); page.setDefaultTimeout(12000)
  if (page.video()) report.videos.push(await page.video().path())
  page.on('pageerror', error => report.errors.push(error.message))
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1880, 1000))
  await page.locator('.board').waitFor()
  await setCompletedLayout(page, true)
  if (!edgeOnly) await autoPlacement({ page, application, ids, report, evidence })
  if (!edgeOnly) await dragTitles({ page, report, evidence })
  if (!placementOnly) await edgeSorting({ page, report, evidence })
  assert.deepEqual(report.errors, [])
  if (!edgeOnly && !placementOnly && !executable) {
    await application.close(); application = null; page = null
    await import('./parent-placement.mjs')
    const path = resolve('output/tests/parent-placement/report.json')
    const placement = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(placement.passed, true)
    report.parentPlacement = { report: path, checks: placement.checks.length }
    report.checks.push('Full source ordering acceptance includes native startup, immediate preference, manual rollover and backlog placement')
    await import('./parent-preferences.mjs')
    const preferencePath = resolve('output/tests/parent-placement/preferences-report.json')
    const preferences = JSON.parse(await readFile(preferencePath, 'utf8'))
    assert.equal(preferences.passed, true)
    report.parentPreferences = { report: preferencePath, checks: preferences.checks.length }
    report.checks.push('Full source ordering acceptance includes preference projection, local acknowledgement and pull-before-reconcile races')
  }
  report.passed = true
} catch (error) {
  report.failure = error.stack ?? String(error)
  if (page && !page.isClosed()) {
    report.localState = await page.evaluate(async () => ({ visibility: document.visibilityState, focused: document.hasFocus(), activeElement: document.activeElement?.outerHTML.slice(0, 1000), dragging: document.documentElement.dataset.dragging, placements: (await window.goalloom.getSnapshot()).items.map(item => ({ id: item.id, title: item.title, placement: item.placement })) })).catch(() => null)
    report.nativeWindow = await application.evaluate(({ BrowserWindow }) => ({ focused: BrowserWindow.getAllWindows()[0]?.isFocused(), visible: BrowserWindow.getAllWindows()[0]?.isVisible() })).catch(() => null)
    await page.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {})
  }
  throw error
} finally {
  if (application) await application.close().catch(() => {})
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2)); await rm(profile, { recursive: true, force: true })
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, evidence }, null, 2))
