/**
 * [INPUT]: A private experiment label, compression mode and optional target platform.
 * [OUTPUT]: Unpublished packages, manifests, build timings and macOS DMG install timings (mount + copy the app).
 * [POS]: Repeatable local package comparison; Windows installation remains a Windows-machine check.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const label = process.argv[2], compression = process.argv[3] ?? 'normal', selected = process.argv[4] ?? 'both'
assert(label && /^[a-z0-9-]+$/.test(label), 'Use a lowercase experiment label')
assert(['normal', 'maximum'].includes(compression))
assert(['both', 'mac', 'win'].includes(selected))
const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
const { version } = JSON.parse(await readFile('package.json', 'utf8'))
function run(command, args) {
  const start = performance.now(), result = spawnSync(command, args, { env, stdio: 'inherit' })
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed`)
  return performance.now() - start
}
await mkdir('output/tests/packages', { recursive: true })
const buildMs = run('pnpm', ['build'])
for (const [platform, flags] of [['mac', ['--mac', '--arm64']], ['win', ['--win', '--x64']]]) {
  if (selected !== 'both' && selected !== platform) continue
  const output = resolve(`output/tests/packages/${label}-${platform}`)
  const packageMs = run('pnpm', ['exec', 'electron-builder', ...flags, '--publish', 'never', `--config.directories.output=${output}`, `--config.compression=${compression}`])
  run(process.execPath, ['scripts/build/package-report.mjs', output, label])
  const installMs = []
  if (platform === 'mac') for (let sample = 0; sample < 3; sample++) {
    const directory = await mkdtemp(join(tmpdir(), 'goalloom-package-install-')), volume = join(directory, 'volume')
    try {
      const mountMs = run('hdiutil', ['attach', '-nobrowse', '-readonly', '-quiet', '-mountpoint', volume, join(output, `Goalloom-${version}-mac-arm64.dmg`)])
      try { installMs.push(mountMs + run('ditto', [join(volume, 'Goalloom.app'), join(directory, 'Goalloom.app')])) }
      finally { run('hdiutil', ['detach', '-quiet', volume]) }
    } finally { await rm(directory, { recursive: true, force: true }) }
  }
  await writeFile(`output/tests/packages/${label}-${platform}-timing.json`, JSON.stringify({ buildMs, packageMs, compression, installMs, windowsInstallation: 'Requires Windows 11 x64' }, null, 2))
}
