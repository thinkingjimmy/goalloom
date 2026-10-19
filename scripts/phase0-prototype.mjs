/**
 * Hosted dual-client prototype. Two Electron SQLite clients, no OAuth.
 *
 *   export SUPABASE_URL=...
 *   export SUPABASE_ANON_KEY=...
 *   export SUPABASE_SERVICE_ROLE_KEY=...
 *   node scripts/phase0-prototype.mjs
 *
 * Creates p0-proto-<uuid>@goalloom.test through the admin API and deletes it afterwards.
 * The same six scenarios also run locally, without these variables, inside `pnpm test`.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
import { assertDevelopmentTarget } from './development-target.mjs'

assertDevelopmentTarget(process.env.SUPABASE_URL)

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const vitest = join(repoRoot, 'node_modules/vitest/vitest.mjs')
const child = spawn(electron, [vitest, 'run', 'packages/tests/sync/phase0-prototype.test.ts'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PHASE0_REQUIRE_HOSTED: '1' },
})
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
