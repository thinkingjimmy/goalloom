import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

// --- 将实际安装包中的许可证随离线产物一同交付，不修改项目授权。 ---
const visited = new Set()
const notices = []
notices.push(`shadcn/ui Button (MIT)\n\n${await readFile('src/renderer/components/ui/LICENSE', 'utf8')}`)
async function locate(name, from) {
  for (let directory = from; ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', name)
    try { return { root: candidate, metadata: JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8')) } } catch {}
    if (dirname(directory) === directory) throw new Error(`无法定位依赖许可证: ${name}`)
  }
}
async function collect(name, from) {
  const { root, metadata } = await locate(name, from)
  const identity = `${metadata.name}@${metadata.version}`
  if (visited.has(identity)) return
  visited.add(identity)
  const licenses = (await readdir(root)).filter(file => /^(license|licence|copying)(\.[^.]+)?$/i.test(file))
  if (!licenses.length) throw new Error(`依赖缺少许可证文本: ${identity}`)
  const text = await Promise.all(licenses.map(file => readFile(join(root, file), 'utf8')))
  notices.push(`${identity} (${metadata.license ?? 'see below'})\n\n${text.join('\n')}`)
  for (const dependency of Object.keys(metadata.dependencies ?? {})) await collect(dependency, root)
}
const metadata = JSON.parse(await readFile('package.json', 'utf8'))
for (const name of Object.keys(metadata.dependencies)) await collect(name, resolve('.'))
await writeFile('out/THIRD_PARTY_NOTICES.txt', `Goalloom third-party notices\n\n${notices.sort().join('\n\n--------------------\n\n')}`)
console.log(`已保留 ${notices.length} 个第三方依赖的许可证。`)
