/**
 * [INPUT]: Production matching code and frozen synthetic bilingual fixtures.
 * [OUTPUT]: Electron-as-Node live evaluator, or a zero-network prepared bundle.
 * [POS]: Repeatable authorized Jev 1.14 evaluation launcher.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import electron from 'electron'
await build({ entryPoints: ['scripts/eval/capture/live.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node24', outfile: 'output/tests/auto-link/live/build/evaluate.mjs', logLevel: 'warning',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
if (process.argv.includes('--prepare')) { console.log('Prepared; zero API calls.'); process.exit(0) }
const child = spawn(electron, ['output/tests/auto-link/live/build/evaluate.mjs', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
