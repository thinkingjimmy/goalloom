/**
 * Print the Node/Electron parity digest, or compare it with a Hermes digest.
 *
 *   node scripts/parity-digest.mjs
 *   node scripts/parity-digest.mjs <64 hex chars>
 *   node scripts/parity-digest.mjs --file hermes.txt
 *
 * The file may contain `digest <hex>` or the hex alone. Exit 0 when they match.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const vitest = join(repoRoot, 'node_modules/vitest/vitest.mjs')
const outDir = mkdtempSync(join(tmpdir(), 'goalloom-parity-'))
const outFile = join(outDir, 'digest.txt')
const child = spawnSync(electron, [vitest, 'run', 'packages/crypto/test/parity.test.ts'], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PARITY_DIGEST_OUT: outFile },
})
if (child.stdout) process.stdout.write(child.stdout)
if (child.stderr) process.stderr.write(child.stderr)
if (child.status !== 0) {
  rmSync(outDir, { recursive: true, force: true })
  process.exit(child.status ?? 1)
}

const nodeDigest = readFileSync(outFile, 'utf8').match(/digest ([0-9a-f]{64})/)?.[1]
rmSync(outDir, { recursive: true, force: true })
if (!nodeDigest) {
  console.error('Node digest was not written')
  process.exit(1)
}

const arg = process.argv[2]
if (!arg) {
  console.log(`digest ${nodeDigest}`)
  process.exit(0)
}
const source = arg === '--file' ? readFileSync(process.argv[3] ?? '', 'utf8') : arg
const hermes = source.match(/[0-9a-f]{64}/)?.[0]
if (!hermes) {
  console.error('Expected a 64 character hex digest')
  process.exit(1)
}
console.log(`node   ${nodeDigest}`)
console.log(`hermes ${hermes}`)
if (hermes !== nodeDigest) {
  console.error('mismatch')
  process.exit(1)
}
console.log('match')
