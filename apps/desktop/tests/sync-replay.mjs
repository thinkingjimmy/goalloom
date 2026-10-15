/**
 * [INPUT]: Production sync/repository modules, Electron SQLite and isolated synthetic peers.
 * [OUTPUT]: Encrypted two-peer replay evidence and runtime/platform details in output/tests/sync-replay.
 * [POS]: Sync replay E2E entry; failure cases are in docs/sync/protocol-v1.md.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electron from 'electron'

const evidence = resolve('output/tests/sync-replay')
await mkdir(evidence, { recursive: true })
await build({
  configFile: false,
  build: {
    outDir: 'output/tests/build/sync-replay', emptyOutDir: true, target: 'node24', minify: false,
    lib: { entry: 'tests/fixtures/sync-replay.ts', formats: ['cjs'], fileName: () => 'probe.cjs' },
    rollupOptions: { external: [/^node:/] },
  },
})
const result = spawnSync(electron, ['output/tests/build/sync-replay/probe.cjs', evidence], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 60000,
})
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
assert.equal(result.status, 0, result.error?.message ?? 'Sync replay failed; inspect output/tests/sync-replay/report.json')
assert.equal(JSON.parse(await readFile(resolve(evidence, 'report.json'), 'utf8')).passed, true)
