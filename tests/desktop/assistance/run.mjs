/**
 * [INPUT]: Selected assistance acceptance groups and the built production app.
 * [OUTPUT]: Sequential isolated Electron boundary/native runs and repeatable reports.
 * [POS]: Feature runner; no live providers, paid CI, full-project suite or production test controls.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { build } from 'esbuild'
import electron from 'electron'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const all = ['entry', 'generation', 'apply', 'undo', 'recovery', 'language', 'statistics']
const groups = process.argv.slice(2).length ? process.argv.slice(2) : all
if (groups.some(group => !all.includes(group))) throw Error(`Supported groups: ${all.join(', ')}`)
const output = resolve('output/tests/assistance')
await mkdir(output, { recursive: true })
const run = (command, args, env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { env, stdio: 'inherit' })
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`Assistance acceptance exited ${code}`)))
})
const dataGroups = groups.filter(group => ['apply', 'undo', 'recovery', 'statistics'].includes(group))
if (dataGroups.length) {
  const file = `${output}/data.mjs`
  await build({ entryPoints: ['tests/desktop/assistance/data.ts'], outfile: file, bundle: true, platform: 'node', format: 'esm', external: ['electron', 'node:*'] })
  await run(electron, [file, ...dataGroups], { ...process.env, ELECTRON_RUN_AS_NODE: '1' })
}
const reviewGroups = groups.filter(group => ['undo', 'recovery', 'statistics'].includes(group))
if (reviewGroups.length) {
  const file = `${output}/review.mjs`
  await build({ entryPoints: ['tests/desktop/assistance/review.ts'], outfile: file, bundle: true, platform: 'node', format: 'esm', external: ['electron', 'node:*'] })
  await run(electron, [file, ...reviewGroups], { ...process.env, ELECTRON_RUN_AS_NODE: '1' })
}
const native = groups.filter(group => ['entry', 'generation', 'language'].includes(group))
if (native.length) await run(process.execPath, ['tests/desktop/assistance/native.mjs', ...native], process.env)
if (native.some(group => ['entry', 'generation'].includes(group))) await run(process.execPath, ['tests/desktop/assistance/preflight.mjs'], process.env)
if (groups.includes('recovery')) await run(process.execPath, ['tests/desktop/assistance/upgrade.mjs'], process.env)
