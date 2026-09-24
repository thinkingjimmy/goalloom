/** Comparable packaged startup: fresh copies of the suite's closed synthetic database, no existing daily backup. */
import assert from 'node:assert/strict'
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const labels = process.argv.slice(2).length ? process.argv.slice(2) : ['baseline', 'locales', 'minify', 'normal']
const rows = [], env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
for (let sample = 0; sample < 3; sample++) for (const label of labels) {
  assert.match(label, /^[a-z0-9-]+$/)
  const profile = await mkdtemp(join(tmpdir(), 'goalloom-package-startup-'))
  await copyFile('output/tests/performance/synthetic-seed/workspace.sqlite', join(profile, 'workspace.sqlite'))
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  const start = performance.now()
  const app = await electron.launch({ executablePath: resolve(`output/tests/packages/${label}-mac/mac-arm64/Goalloom.app/Contents/MacOS/Goalloom`), args: [`--user-data-dir=${profile}`], env })
  try {
    const page = await app.firstWindow()
    await page.locator('.board').waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.task-row').length > 0)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const visibleMs = performance.now() - start
    const outcome = await page.evaluate(async () => {
      const snapshot = await window.goalloom.getSnapshot()
      if (snapshot.items.length !== 1000) throw Error('Wrong synthetic fixture')
      return window.goalloom.execute({ type: 'preferences', theme: snapshot.workspace.theme, generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
    })
    assert.equal(outcome.ok, true)
    rows.push({ label, sample, visibleMs, acceptedWriteMs: performance.now() - start, mountedRows: await page.locator('.task-row').count() })
    if (sample === 0 && label === labels.at(-1)) await page.screenshot({ path: 'output/tests/packages/packaged-board.png' })
  } finally { await app.close(); await rm(profile, { recursive: true, force: true }) }
}
await writeFile('output/tests/packages/startup.json', JSON.stringify({ scope: 'macOS arm64; 1000 active; restored/paused; no existing daily; three independent profiles per package; OS caches not cleared; first launch and repeats retained separately', rows }, null, 2))
console.log(JSON.stringify(rows))
