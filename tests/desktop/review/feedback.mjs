/** Page-clock persisted status feedback on the 1000-active-item fixture; no optimistic success. */
import assert from 'node:assert/strict'
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const label = process.env.GOALLOOM_BENCH_LABEL ?? 'final'
assert.match(label, /^[a-z0-9-]+$/)
const profile = await mkdtemp(join(tmpdir(), 'goalloom-feedback-'))
await copyFile('output/tests/performance/synthetic-seed/workspace.sqlite', join(profile, 'workspace.sqlite'))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const prepare = spawnSync(electronPath, ['output/tests/build/performance/performance.cjs', profile, 'prepare', 'true', 'true'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' })
assert.equal(prepare.status, 0)
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: [process.env.GOALLOOM_BENCH_ENTRY ?? '.', `--user-data-dir=${profile}`], env })
try {
  const page = await app.firstWindow()
  await page.getByRole('button', { name: '搜索与命令', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索条目', exact: true }).fill('活跃计划 200 ')
  await page.locator('.command-results .menu-item').first().click()
  await page.locator('.detail .check').waitFor()
  const samples = []
  for (let i = 0; i < 20; i++) samples.push(await page.evaluate(() => new Promise((resolve, reject) => {
    const button = document.querySelector('.detail .check'), before = button.dataset.checked, start = performance.now()
    const timer = setTimeout(() => { observer.disconnect(); reject(Error('Status feedback timed out')) }, 10_000)
    const observer = new MutationObserver(() => {
      if (button.dataset.checked === before || button.disabled) return
      observer.disconnect(); clearTimeout(timer)
      requestAnimationFrame(() => resolve(performance.now() - start))
    })
    observer.observe(button, { attributes: true }); button.click()
  })))
  const ordered = samples.toSorted((a, b) => a - b)
  const report = { label, scope: 'Persisted detail status toggle to next animation frame; 1000 active; daily backup already exists; synthetic profile', samples, p50: ordered[9], p95: ordered[18], runtime: await page.evaluate(() => window.goalloom.getRuntime()) }
  await writeFile(resolve(`output/tests/performance/${label}-feedback.json`), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally { await app.close(); await rm(profile, { recursive: true, force: true }) }
