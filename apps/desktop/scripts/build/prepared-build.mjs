/**
 * [INPUT]: Production build output, exact Git commit, platform and public production client configuration.
 * [OUTPUT]: A hash manifest, or verification before packaging without another build.
 * [POS]: Release artifact handoff; stale, foreign or incomplete output fails closed.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const mode = process.argv[2]
assert(['record', 'check'].includes(mode), 'Use record or check')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const url = process.env.GOALLOOM_SUPABASE_URL
const key = process.env.GOALLOOM_SUPABASE_ANON_KEY
assert.equal(process.env.GOALLOOM_BUILD_ENV, 'production', 'Prepared packages require production mode')
assert.equal(url, 'https://keqprrgvcefqdwnxaafv.supabase.co', 'Production URL is required')
const payload = JSON.parse(Buffer.from(key?.split('.')[1] ?? '', 'base64url').toString())
assert(payload.role === 'anon' && payload.ref === 'keqprrgvcefqdwnxaafv', 'Matching production anon JWT is required')
const manifestPath = 'out/production-build.json'
async function inventory(directory) {
  const rows = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (path.replaceAll('\\', '/') === manifestPath) continue
    assert(!entry.isSymbolicLink(), 'Build output must not contain symlinks')
    if (entry.isDirectory()) rows.push(...await inventory(path))
    else rows.push([path.replaceAll('\\', '/'), sha(await readFile(path))])
  }
  return rows.sort(([a], [b]) => a.localeCompare(b))
}
const metadata = JSON.parse(await readFile('package.json', 'utf8'))
const identity = {
  version: metadata.version, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  platform: process.platform, arch: process.arch, url, keySha256: sha(key),
}
const main = await readFile('out/main/index.js', 'utf8')
assert(main.includes(url) && main.includes(key), 'Built main does not contain the expected production pair')
const files = await inventory('out')
if (mode === 'record') await writeFile(manifestPath, JSON.stringify({ ...identity, files }, null, 2) + '\n')
else assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), { ...identity, files }, 'Prepared build differs from this release checkout/configuration')
console.log(`Production build ${mode}: ${metadata.version}; ${files.length} files; ${process.platform}-${process.arch}`)
