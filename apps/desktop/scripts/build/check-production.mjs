import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : join(directory, entry.name)))).flat()
}

const devEntry = /localhost:\d|127\.0\.0\.1:\d|@vite\/client|__vite_plugin_react_preamble|setTestClock|goalloom:test/
// GoTrue's default URL is unused: supabaseClient() always receives the configured project URL. It may appear only inside the bundled main process.
const vendoredGotrueUrl = 'http://localhost:9999'
const bareSupabaseImport = /(?:from|import\()\s*["']@supabase\/supabase-js["']|require\(\s*["']@supabase\/supabase-js["']\s*\)/
const output = await files('out')
for (const path of output) {
  assert(!path.endsWith('.map'), `正式产物不应含源码映射: ${path}`)
  const text = await readFile(path, 'utf8')
  const parts = path.split(/[/\\]/)
  const mainBundle = parts[0] === 'out' && parts[1] === 'main'
  const scanned = mainBundle ? text.split(vendoredGotrueUrl).join('') : text
  assert(!devEntry.test(scanned), `正式产物含开发/测试入口: ${path}`)
  assert(!bareSupabaseImport.test(text), `正式产物不得在运行时解析 @supabase/supabase-js: ${path}`)
}
const preload = await readFile('out/preload/index.cjs', 'utf8')
assert(!/require\(["'](?:node:|zod)/.test(preload), '沙箱 preload 不得依赖 Node 或未打包 npm 模块')
for (const [, dependency] of preload.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) assert.equal(dependency, 'electron', `Unexpected sandbox dependency: ${dependency}`)
const metadata = JSON.parse(await readFile('package.json', 'utf8'))
assert(!Object.keys(metadata.dependencies).some(name => /lucide|heroicons|phosphor/.test(name)), '仅允许 Hugeicons')
console.log(`生产产物检查通过：${output.length} 个文件；无 HMR/测试控制口/第二图标库。`)
