// Run domain calendar rules with the same native Temporal implementation as the application.
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import electron from 'electron'

await build({ entryPoints: ['scripts/eval/smart.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: 'output/eval/build/smart.mjs', logLevel: 'warning',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
const child = spawn(electron, ['output/eval/build/smart.mjs', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
