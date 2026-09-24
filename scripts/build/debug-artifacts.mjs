/**
 * [INPUT]: Current source, locked build tools and existing production output.
 * [OUTPUT]: Private hidden source maps, file hashes and matching-code checks outside packaged out/.
 * [POS]: Local error-diagnosis artifact builder; never uploads or publishes source maps.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'

execFileSync('pnpm', ['exec', 'electron-vite', 'build'], { stdio: 'inherit', env: { ...process.env, GOALLOOM_DEBUG_BUILD: '1' } })
const root = 'output/private-debug', files = []
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) { await walk(path); continue }
    if (!/\.(?:[cm]?js|css)(?:\.map)?$/.test(path)) continue
    const content = await readFile(path), name = relative(root, path)
    const row = { path: name, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') }
    if (path.endsWith('.map')) {
      const map = JSON.parse(content), traced = new TraceMap(map)
      assert.ok(map.sourcesContent?.some(Boolean), `${name}: missing private sources`)
      let mapped
      for (let column = 0; column < 1000 && !mapped?.source; column++) mapped = originalPositionFor(traced, { line: 1, column })
      assert.ok(mapped?.source, `${name}: unusable error-location mapping`)
      row.example = mapped
    } else {
      const production = await readFile(join('out', name))
      assert.ok(production.equals(content), `${name}: debug code must match the packaged build`)
    }
    files.push(row)
  }
}
await walk(root)
await writeFile(join(root, 'manifest.json'), JSON.stringify({ commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), files }, null, 2))
console.log(`Verified ${files.length} private code/map artifacts; production code bytes match.`)
