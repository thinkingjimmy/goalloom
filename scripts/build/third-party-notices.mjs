import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

// --- 将实际安装包中的许可证随离线产物一同交付，不修改项目授权。 ---
const visited = new Set()
const notices = []
notices.push(`shadcn/ui Button, Select (MIT)\n\n${await readFile('src/renderer/components/ui/LICENSE', 'utf8')}`)
const mit = holder => `MIT License\n\nCopyright (c) ${holder}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`
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
  const text = await Promise.all(licenses.map(file => readFile(join(root, file), 'utf8')))
  // Some MIT packages declare the license only in package.json; reproduce the standard text with the declared author.
  if (!text.length && metadata.license === 'MIT' && metadata.author) text.push(mit(typeof metadata.author === 'string' ? metadata.author : metadata.author.name))
  if (!text.length) throw new Error(`依赖缺少许可证文本: ${identity}`)
  notices.push(`${identity} (${metadata.license ?? 'see below'})\n\n${text.join('\n')}`)
  for (const dependency of Object.keys(metadata.dependencies ?? {})) await collect(dependency, root)
}
const metadata = JSON.parse(await readFile('package.json', 'utf8'))
for (const name of Object.keys(metadata.dependencies)) await collect(name, resolve('.'))
await writeFile('out/THIRD_PARTY_NOTICES.txt', `Goalloom third-party notices\n\n${notices.sort().join('\n\n--------------------\n\n')}`)
console.log(`已保留 ${notices.length} 个第三方依赖的许可证。`)
