/**
 * [INPUT]: Current desktop build and isolated security E2E sources.
 * [OUTPUT]: Reproducible service/SQLite security report; native UI is a separate entry.
 * [POS]: Targeted feature runner, with no production credentials.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electron from 'electron'
await build({ configFile: false, build: { target: 'node24', minify: false, outDir: 'output/tests/build/sync-security', emptyOutDir: true,
  lib: { entry: 'tests/sync-security/cases.ts', formats: ['cjs'], fileName: () => 'probe.cjs' }, rollupOptions: { external: [/^node:/, 'electron'] } } })
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
delete env.GOALLOOM_SUPABASE_URL; delete env.GOALLOOM_SUPABASE_ANON_KEY
const result = spawnSync(electron, ['output/tests/build/sync-security/probe.cjs'], { env, encoding: 'utf8', timeout: 120_000 })
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
assert.equal(result.status, 0, result.error?.message ?? 'Inspect output/tests/sync-security/cases.json')
