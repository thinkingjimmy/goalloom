/**
 * [INPUT]: Current production source and the installed local Electron/Vite toolchain.
 * [OUTPUT]: Headless Electron/SQLite end-to-end report and source/runtime evidence under ignored output/tests.
 * [POS]: Repeatable core acceptance runner; no network, native window or external data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electron from 'electron'

const focused = process.argv.includes('--join-empty')
const guidance = process.argv.includes('--guidance-touch')
const epoch = process.argv.includes('--binding-epoch')
const entry = epoch ? 'packages/tests/sync/binding-epoch-acceptance.ts' : guidance ? 'packages/tests/sync/guidance-touch-acceptance.ts' : 'packages/tests/sync/exact-seed-acceptance.ts'
const evidence = resolve('output/tests/billing/desktop/d2-exact-baseline', epoch ? 'binding-epoch' : guidance ? 'guidance-touch' : focused ? 'empty-join' : '.')
const outDir = resolve(evidence, 'build')
await mkdir(evidence, { recursive: true })
for (const name of ['report.json', 'run.log', 'sources.json']) {
  try { await writeFile(resolve(evidence, `previous-${Date.now()}-${name}`), await readFile(resolve(evidence, name))) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
const paths = ['packages/contracts/src/seed.ts', 'packages/contracts/src/sync-op.ts', 'packages/schema/src/sync-baseline.ts',
  'packages/store-core/src/seed-types.ts', 'packages/store-core/src/seed-records.ts', 'packages/store-core/src/seed.ts',
  'packages/store-core/src/binding-epoch.ts', 'packages/store-core/src/rebuild.ts', 'packages/store-core/src/apply.ts', 'packages/store-core/src/retired.ts',
  'packages/sync/src/seed.ts', 'packages/sync/src/board.ts', 'packages/sync/src/join.ts', entry, 'packages/tests/sync/exact-seed-acceptance.mjs']
await writeFile(resolve(evidence, 'sources.json'), JSON.stringify(Object.fromEntries(await Promise.all(paths.map(async path =>
  [path, createHash('sha256').update(await readFile(resolve(path))).digest('hex')]))), null, 2))
await build({ configFile: false, build: { outDir, emptyOutDir: true, target: 'node24', minify: false,
  lib: { entry: resolve(entry), formats: ['cjs'], fileName: () => 'probe.cjs' },
  rollupOptions: { external: [/^node:/] },
} })
const result = spawnSync(electron, [resolve(outDir, 'probe.cjs'), evidence, ...(focused ? ['--join-empty'] : [])], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 120000,
})
await writeFile(resolve(evidence, 'run.log'), `${result.stdout ?? ''}${result.stderr ?? ''}`)
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
assert.equal(result.status, 0, result.error?.message ?? `Inspect ${resolve(evidence, 'report.json')}`)
assert.equal(JSON.parse(await readFile(resolve(evidence, 'report.json'), 'utf8')).passed, true)
