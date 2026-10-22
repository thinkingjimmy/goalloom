/**
 * [INPUT]: Current production sources and the built storage worker.
 * [OUTPUT]: Deterministic preference-race evidence under output/tests/parent-placement.
 * [POS]: Headless production-path acceptance, independent of the foreground native journey.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electron from 'electron'

await build({ configFile: false, build: {
  target: 'node24', minify: false, outDir: 'output/tests/build/parent-preferences', emptyOutDir: false,
  lib: { entry: 'tests/fixtures/parent-preferences.ts', formats: ['cjs'], fileName: () => 'probe.cjs' },
  rollupOptions: { external: [/^node:/, 'electron'] },
} })
const result = spawnSync(electron, ['output/tests/build/parent-preferences/probe.cjs'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 60_000,
})
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
assert.equal(result.status, 0, result.error?.message ?? 'Inspect parent-placement/preferences-report.json')
