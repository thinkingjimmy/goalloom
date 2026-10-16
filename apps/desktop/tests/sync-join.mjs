/**
 * [INPUT]: Built storage worker and first-connection E2E sources.
 * [OUTPUT]: Repeatable source Electron sync-join reports.
 * [POS]: Targeted feature runner using isolated synthetic peers.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electron from 'electron'

await build({ configFile: false, build: { target: 'node24', minify: false, outDir: 'output/tests/build/sync-join', emptyOutDir: true,
  lib: { entry: 'tests/sync-join/cases.ts', formats: ['cjs'], fileName: () => 'probe.cjs' }, rollupOptions: { external: [/^node:/, 'electron'] } } })
const result = spawnSync(electron, ['output/tests/build/sync-join/probe.cjs'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 90_000 })
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
assert.equal(result.status, 0, result.error?.message ?? 'Inspect output/tests/sync-join/cases.json')
