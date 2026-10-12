import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

// 使用 Electron 自带 Node，保证集成测试和产品使用同一 SQLite 实现。
// Vitest 的根在仓库根，这样桌面包、加密包和跨包同步测试共用一份配置。
// vitest.mjs 不在包的 exports 里，沿用仓库根上的文件路径，而不是 require.resolve。
const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(appRoot, '../..')
const vitest = join(repoRoot, 'node_modules/vitest/vitest.mjs')
const child = spawn(electron, [vitest, 'run', '--config', join(repoRoot, 'vitest.config.ts'), ...process.argv.slice(2)], {
  cwd: appRoot, stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
