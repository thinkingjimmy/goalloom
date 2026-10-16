/**
 * [INPUT]: Storage E2E fixture and bundled Electron Node/SQLite.
 * [OUTPUT]: Reproducible grouped-capture report in output/tests/auto-link/storage.json.
 * [POS]: Focus-free acceptance of production transactions and transfer validation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electron from 'electron'
await mkdir('output/tests/auto-link', { recursive: true })
await build({ configFile: false, build: { outDir: 'output/tests/build/auto-link', emptyOutDir: true, target: 'node24', minify: false,
  lib: { entry: 'tests/fixtures/auto-link-storage.ts', formats: ['es'], fileName: () => 'storage.mjs' }, rollupOptions: { external: [/^node:/] } } })
const result = spawnSync(electron, ['output/tests/build/auto-link/storage.mjs', 'output/tests/auto-link/storage.json'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 60000 })
process.stdout.write(result.stdout ?? '')
process.stderr.write(result.stderr ?? '')
assert.equal(result.status, 0, result.error?.message ?? 'Capture storage E2E failed')
