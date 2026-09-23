import { spawn } from 'node:child_process'
import { builtinModules } from 'node:module'
import { build } from 'vite'
import electron from 'electron'

await build({
  configFile: false,
  build: {
    target: 'node24', outDir: '.electron-test', emptyOutDir: true,
    lib: { entry: 'tests/fixtures/electron-probe.ts', formats: ['cjs'], fileName: () => 'probe.cjs' },
    rollupOptions: { external: id => id === 'electron' || id.startsWith('node:') || builtinModules.includes(id) },
  },
})
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
const child = spawn(electron, ['.electron-test/probe.cjs'], { stdio: 'inherit', env: environment })
const timer = setTimeout(() => { child.kill(); process.exitCode = 1 }, 30_000)
child.on('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { clearTimeout(timer); process.exitCode = code ?? 1 })
