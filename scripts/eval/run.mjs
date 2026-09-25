// Bundles the TypeScript eval against the real src modules, then runs it on the host Node.
import { build } from 'esbuild'
import { spawn } from 'node:child_process'

await build({ entryPoints: ['scripts/eval/smart.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: 'output/eval/build/smart.mjs', logLevel: 'warning',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
const child = spawn(process.execPath, ['output/eval/build/smart.mjs', ...process.argv.slice(2)], { stdio: 'inherit' })
child.on('exit', code => { process.exitCode = code ?? 1 })
