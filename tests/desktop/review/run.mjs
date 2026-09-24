import { build } from 'esbuild'
import electron from 'electron'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const evidence = resolve('output/tests/review-fixes')
await mkdir(evidence, { recursive: true })
const run = (command, args, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { env, stdio: 'inherit' })
  child.on('error', reject)
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited ${code}`)))
})
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['smart', 'storage', 'renderer', 'lifecycle', 'virtual', 'wire']) {
  if (['smart', 'storage', 'scaling'].includes(name)) {
    const outfile = `${evidence}/${name}.cjs`
    await build({ entryPoints: [`tests/desktop/review/${name}.mjs`], outfile, bundle: true, platform: 'node', format: 'esm' })
    // Electron's Node runtime supplies the production node:sqlite version.
    const { rename } = await import('node:fs/promises')
    await rename(outfile, `${evidence}/${name}.mjs`)
    await run(electron, [`${evidence}/${name}.mjs`], { ...process.env, ELECTRON_RUN_AS_NODE: '1' })
  } else if (name === 'large-backup') await run(electron, [`tests/desktop/review/${name}.mjs`], { ...process.env, ELECTRON_RUN_AS_NODE: '1' })
  else await run(process.execPath, [`tests/desktop/review/${name}.mjs`])
}
