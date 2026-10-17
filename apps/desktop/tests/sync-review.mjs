/**
 * [INPUT]: Current storage build and production sync-review E2E fixture.
 * [OUTPUT]: Encrypted peer/SQLite evidence in output/tests/sync-review/cases.json.
 * [POS]: Feature runner; the native UI runner is separate.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electron from 'electron'
await build({ configFile: false, build: { target: 'node24', minify: false, outDir: 'output/tests/build/sync-review', emptyOutDir: true,
  lib: { entry: 'tests/sync-review/cases.ts', formats: ['cjs'], fileName: () => 'probe.cjs' }, rollupOptions: { external: [/^node:/, 'electron'] } } })
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
delete env.GOALLOOM_SUPABASE_URL; delete env.GOALLOOM_SUPABASE_ANON_KEY
const result = spawnSync(electron, ['output/tests/build/sync-review/probe.cjs'], { env, encoding: 'utf8', timeout: 120000 })
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
assert.equal(result.status, 0, result.error?.message ?? 'Inspect output/tests/sync-review/cases.json')
