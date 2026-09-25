/**
 * [INPUT]: Current-version private builder output, platform language manifests and measured size budgets.
 * [OUTPUT]: File/license checks, signing evidence, byte counts, SHA256 and a JSON package manifest.
 * [POS]: Read-only packaging gate; never modifies an application bundle or publishes artifacts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { extractFile, listPackage } from '@electron/asar'

const root = resolve(process.argv[2] ?? 'release'), label = process.argv[3] ?? 'latest'
assert(/^[a-z0-9-]+$/.test(label))
const requested = process.argv[4]
assert(!requested || ['darwin-arm64', 'win32-x64'].includes(requested))
const packageRoot = requested === 'win32-x64' ? join(root, 'win-unpacked') : requested === 'darwin-arm64' ? join(root, 'mac-arm64/Goalloom.app') : await lstat(join(root, 'mac-arm64/Goalloom.app')).then(() => join(root, 'mac-arm64/Goalloom.app')).catch(() => join(root, 'win-unpacked'))
const platform = packageRoot.endsWith('.app') ? 'darwin-arm64' : 'win32-x64'
const asar = join(packageRoot, platform === 'darwin-arm64' ? 'Contents/Resources/app.asar' : 'resources/app.asar')
const metadata = JSON.parse(await readFile('package.json', 'utf8'))
const packagedMetadata = JSON.parse(extractFile(asar, 'package.json').toString('utf8'))
assert.equal(packagedMetadata.name, metadata.name, 'Unpacked application identity differs from the project')
assert.equal(packagedMetadata.version, metadata.version, 'Unpacked application version differs from the project')
async function walk(directory) {
  const entries = []
  for (const name of await readdir(directory)) {
    const path = join(directory, name), info = await lstat(path)
    if (info.isSymbolicLink()) continue
    if (info.isDirectory()) entries.push(...await walk(path))
    else entries.push({ path: relative(packageRoot, path), bytes: info.size, allocated: info.blocks * 512 })
  }
  return entries
}
const files = await walk(packageRoot), contents = listPackage(asar).map(path => path.replaceAll('\\', '/'))
assert(contents.includes('/out/THIRD_PARTY_NOTICES.txt'))
for (const path of contents) assert(!/(?:^|\/)(?:node_modules|tests|fixtures|screenshots|backups|exports|cache|private-debug|\.env(?:\.[^/]*)?)(?:\/|$)|\.(?:map|sqlite3?|db)(?:-wal|-shm)?$|\.(?:pem|key|p12|pfx)$/.test(path), `Private/development file in ASAR: ${path}`)
const locales = [...new Set(files.flatMap(file => platform === 'darwin-arm64' ? file.path.match(/([^/]+)\.lproj\//)?.[1] ?? [] : file.path.match(/^locales\/([^/]+)\.pak$/)?.[1] ?? []))].sort()
const archive = `Goalloom-${metadata.version}-${platform === 'darwin-arm64' ? 'mac-arm64.dmg' : 'win-x64.exe'}`
const archivePath = join(root, archive), hash = createHash('sha256')
assert(await lstat(archivePath).then(info => info.isFile()).catch(() => false), `Current download artifact missing: ${archive}`)
for await (const chunk of createReadStream(archivePath)) hash.update(chunk)
let signing
if (platform === 'darwin-arm64') {
  const check = spawnSync('codesign', ['-d', '--verbose=2', packageRoot], { encoding: 'utf8' })
  signing = { signed: check.status === 0, details: check.stderr.trim() }
} else {
  const executable = await readFile(archivePath), optionalHeader = executable.readUInt32LE(0x3c) + 24
  const directories = optionalHeader + (executable.readUInt16LE(optionalHeader) === 0x20b ? 112 : 96)
  const certificateBytes = executable.readUInt32LE(directories + 4 * 8 + 4)
  signing = { signed: certificateBytes > 0, certificateBytes }
}
let whitelist
try { whitelist = JSON.parse(await readFile('scripts/build/package-locales.json', 'utf8'))[platform] } catch {}
if (whitelist && !label.startsWith('baseline')) assert.deepEqual(locales, whitelist.toSorted(), 'Runtime language manifest differs from the reviewed whitelist')
const report = { label, platform, sourceBase: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceKind: label.startsWith('baseline') ? 'frozen-reviewed-commit' : 'review-fixes-working-tree', version: metadata.version, electron: metadata.devDependencies.electron, builder: metadata.devDependencies['electron-builder'], signing,
  archive: archivePath, downloadBytes: (await lstat(archivePath)).size, sha256: hash.digest('hex'), logicalBytes: files.reduce((n, file) => n + file.bytes, 0), allocatedBytes: files.reduce((n, file) => n + file.allocated, 0), asarBytes: (await lstat(asar)).size,
  localeBytes: files.filter(file => /\.lproj\/|^locales\//.test(file.path)).reduce((n, file) => n + file.bytes, 0), locales, asarFiles: contents, largest: files.toSorted((a, b) => b.bytes - a.bytes).slice(0, 15), files }
let budgets
try { budgets = JSON.parse(await readFile('scripts/build/package-budgets.json', 'utf8')) } catch {}
if (budgets && !label.startsWith('baseline')) {
  assert.equal(report.electron, budgets.electron, 'Reassess package composition after an Electron upgrade')
  const budget = budgets[platform]
  for (const key of ['downloadBytes', 'logicalBytes', 'asarBytes']) assert(report[key] <= budget[key] * (1 + budgets.thresholdPercent / 100), `${platform} ${key} exceeds the measured budget by more than ${budgets.thresholdPercent}%; record an explanation and update the baseline`)
}
await mkdir('output/tests/packages', { recursive: true })
await writeFile(`output/tests/packages/${label}-${platform}.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify({ label, platform, downloadBytes: report.downloadBytes, logicalBytes: report.logicalBytes, asarBytes: report.asarBytes, languages: locales.length, sha256: report.sha256 }))
