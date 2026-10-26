/**
 * [INPUT]: Current desktop build and isolated billing acceptance selection.
 * [OUTPUT]: Repeatable controlled HTTP/filesystem/service evidence; native renderer has a separate entry.
 * [POS]: Billing feature runner. No provider credentials, user profile or model call.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electron from 'electron'

const group = process.argv[2] ?? 'boundary'
assert(['boundary', 'sync'].includes(group), 'Unknown billing scenario group')
await build({ configFile: false, build: { target: 'node24', minify: false, outDir: `output/tests/build/billing-${group}`, emptyOutDir: true,
  lib: { entry: `tests/billing/${group}.ts`, formats: ['cjs'], fileName: () => 'probe.cjs' }, rollupOptions: { external: [/^node:/, 'electron'] } } })
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
delete env.GOALLOOM_SUPABASE_URL; delete env.GOALLOOM_SUPABASE_ANON_KEY
const result = spawnSync(electron, [`output/tests/build/billing-${group}/probe.cjs`], { env, encoding: 'utf8', timeout: 120_000 })
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
assert.equal(result.status, 0, result.error?.message ?? `Inspect output/tests/billing/desktop/d1-client/${group}.json`)
