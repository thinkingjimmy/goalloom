import { spawn } from 'node:child_process'
import electron from 'electron'

// 使用 Electron 自带 Node，保证集成测试和产品使用同一 SQLite 实现。
const child = spawn(electron, ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
