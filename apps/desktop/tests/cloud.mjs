/**
 * [INPUT]: Current source and built isolated retrieval/storage workers.
 * [OUTPUT]: Repeatable Electron SQLite/HTTP/crypto acceptance report.
 * [POS]: D2 feature runner. No native foreground, real account/provider or model.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electron from 'electron'
const evidence = resolve(`../../output/tests/billing/desktop/d2-client/runs/${Date.now()}`)
await mkdir(evidence, { recursive: true })
const files = []
for (const directory of ['src', '../../packages/contracts/src', '../../packages/crypto/src', '../../packages/sync/src', '../../packages/schema/src', '../../packages/store-core/src', 'out', 'tests/sync-cost', 'tests/sync-join']) {
  for (const name of await readdir(directory, { recursive: true })) if (/\.(?:ts|tsx|js|cjs|css|html)$/.test(name)) files.push(resolve(directory, name))
}
files.push(resolve('tests/cloud/acceptance.ts'), resolve('tests/cloud/provenance.ts'), resolve('tests/cloud/business-provenance.ts'), resolve('tests/cloud.mjs'))
async function hashes() { return Object.fromEntries(await Promise.all(files.sort().map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')]))) }
const initial = await hashes()
await writeFile(join(evidence, 'source-build.json'), JSON.stringify({ recordedBeforeExecution: true, files: initial }, null, 2))
await build({ configFile: false, build: { target: 'node24', outDir: 'output/tests/build/cloud', emptyOutDir: true,
  lib: { entry: 'tests/cloud/acceptance.ts', formats: ['cjs'], fileName: () => 'probe.cjs' }, rollupOptions: { external: [/^node:/, 'electron'] } } })
const result = spawnSync(electron, ['output/tests/build/cloud/probe.cjs'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', GOALLOOM_D2_EVIDENCE_ROOT: evidence }, encoding: 'utf8', timeout: 120_000 })
process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '')
const unchanged = JSON.stringify(initial) === JSON.stringify(await hashes())
await writeFile(join(evidence, 'source-stability.json'), JSON.stringify({ unchanged }, null, 2))
assert(unchanged, 'Source/build changed during acceptance')
assert.equal(result.status, 0, result.error?.message ?? 'Inspect output/tests/billing/desktop/d2-client/report.json')
