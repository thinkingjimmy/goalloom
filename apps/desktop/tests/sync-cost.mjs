/**
 * [INPUT]: Sync-owned scenario selection and production sources, built storage worker.
 * [OUTPUT]: Repeatable Electron acceptance evidence under output/tests/sync-cost.
 * [POS]: Targeted runner; no unrelated product suites or production data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { build } from 'vite'
import electron from 'electron'
import { resolve, relative } from 'node:path'

const group = process.argv[2] ?? 'baseline'
assert(['baseline', 'scheduling', 'batching', 'protection'].includes(group), 'Unknown sync cost group')
const baselineRef = '7b2f91148673637fa32b1dd68faf25f6a80a6084'
const root = resolve('../..')
await build({ configFile: false, plugins: group === 'baseline' ? [{ name: 'frozen-sync-baseline', load(id) {
  const file = relative(root, id).replaceAll('\\', '/')
  if (!file.startsWith('packages/sync/src/') && !file.startsWith('apps/desktop/src/main/sync/')) return null
  return execFileSync('git', ['show', `${baselineRef}:${file}`], { cwd: root, encoding: 'utf8' })
} }] : [], build: {
  target: 'node24', minify: false, outDir: `output/tests/build/sync-cost-${group}`, emptyOutDir: true,
  lib: { entry: `tests/sync-cost/${group}.ts`, formats: ['cjs'], fileName: () => 'probe.cjs' },
  rollupOptions: { external: [/^node:/, 'electron'] },
} })
const result = spawnSync(electron, [`output/tests/build/sync-cost-${group}/probe.cjs`], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', GOALLOOM_BASELINE_REF: baselineRef }, encoding: 'utf8', timeout: 60_000,
})
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
assert.equal(result.status, 0, result.error?.message ?? 'Inspect sync-cost evidence')
assert.equal(JSON.parse(await readFile(`output/tests/sync-cost/${group}.json`, 'utf8')).ok, true)
