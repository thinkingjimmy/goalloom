/**
 * [INPUT]: Dedicated local production pair or hosted release environment.
 * [OUTPUT]: One validated production build and its prepared-artifact manifest.
 * [POS]: Production build entry; source development never loads this configuration.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { spawnSync } from 'node:child_process'

let local = {}
try { local = parseEnv(await readFile('../../.env.sync.production.local', 'utf8')) }
catch (error) { if (error.code !== 'ENOENT') throw error }
const env = { ...local, ...process.env, GOALLOOM_BUILD_ENV: 'production' }
for (const [command, args] of [
  ['pnpm', ['exec', 'electron-vite', 'build']],
  ['node', ['scripts/build/third-party-notices.mjs']],
  ['node', ['scripts/build/check-production.mjs']],
  ['node', ['scripts/build/prepared-build.mjs', 'record']],
]) {
  const result = spawnSync(command, args, { env, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
