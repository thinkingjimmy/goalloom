import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : join(directory, entry.name)))).flat()
}

const output = await files('out')
for (const path of output) {
  assert(!path.endsWith('.map'), `正式产物不应含源码映射: ${path}`)
  const text = await readFile(path, 'utf8')
  assert(!/localhost:\d|127\.0\.0\.1:\d|@vite\/client|__vite_plugin_react_preamble|setTestClock|goalloom:test/.test(text), `正式产物含开发/测试入口: ${path}`)
}
const preload = await readFile('out/preload/index.cjs', 'utf8')
assert(!/require\(["'](?:node:|zod)/.test(preload), '沙箱 preload 不得依赖 Node 或未打包 npm 模块')
const metadata = JSON.parse(await readFile('package.json', 'utf8'))
assert(!Object.keys(metadata.dependencies).some(name => /lucide|heroicons|phosphor/.test(name)), '仅允许 Hugeicons')
console.log(`生产产物检查通过：${output.length} 个文件；无 HMR/测试控制口/第二图标库。`)
