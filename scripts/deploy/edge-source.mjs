/**
 * [INPUT]: Downloaded Supabase ESZIP 2.3 bytes with inline original source maps.
 * [OUTPUT]: Original single-entry TypeScript source, or a closed failure for unsupported/corrupt archives.
 * [POS]: Deployment source verification only. Never executes code or extracts filesystem paths.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'

// Format authority: denoland/deno, libs/eszip/v2.rs. Supabase uses no-checksum options here.
export function eszipOriginalSource(bytes) {
  assert(bytes.length <= 20 * 1024 * 1024, 'Edge archive exceeds inspection limit')
  let offset = 0
  const take = size => {
    assert(Number.isSafeInteger(size) && size >= 0 && offset + size <= bytes.length, 'Truncated Edge archive')
    const value = bytes.subarray(offset, offset + size)
    offset += size
    return value
  }
  const u32 = () => take(4).readUInt32BE()
  const block = () => take(u32())
  assert(take(8).toString() === 'ESZIP2.3', 'Unsupported Edge archive version')
  assert(block().equals(Buffer.from([0, 0, 1, 0])), 'Unsupported Edge archive checksum/options')
  const header = block()
  const npm = block()
  const sources = block()
  const maps = block()
  assert(npm.length === 0 && offset === bytes.length, 'Unexpected npm or trailing Edge data')
  let index = 0
  const headerTake = size => {
    assert(size >= 0 && index + size <= header.length, 'Truncated Edge module header')
    const value = header.subarray(index, index + size)
    index += size
    return value
  }
  const headerU32 = () => headerTake(4).readUInt32BE()
  const modules = []
  while (index < header.length) {
    const name = headerTake(headerU32()).toString('utf8')
    assert(headerTake(1)[0] === 0, 'Unexpected Edge redirect/npm entry')
    const sourceOffset = headerU32(), sourceSize = headerU32(), mapOffset = headerU32(), mapSize = headerU32()
    const kind = headerTake(1)[0]
    assert(sourceOffset + sourceSize <= sources.length && mapOffset + mapSize <= maps.length, 'Edge module is outside its data section')
    modules.push({ name, sourceOffset, sourceSize, mapOffset, mapSize, kind })
  }
  const code = modules.filter(module => !module.name.startsWith('---'))
  assert(code.length === 1 && code[0].name === 'source/index.ts' && code[0].kind === 0, 'Expected exactly one executable source/index.ts')
  assert(modules.filter(module => module.name.startsWith('---')).every(module => module.kind === 3 && module.mapSize === 0), 'Unexpected executable metadata')
  const entry = code[0]
  assert(entry.sourceSize > 0 && entry.mapSize > 0, 'Missing Edge code or original source map')
  const map = JSON.parse(maps.subarray(entry.mapOffset, entry.mapOffset + entry.mapSize).toString('utf8'))
  assert(map.version === 3 && map.sources?.length === 1 && map.sources[0] === entry.name, 'Wrong Edge source map entrypoint')
  assert(map.sourcesContent?.length === 1 && typeof map.sourcesContent[0] === 'string', 'Missing original TypeScript source')
  return map.sourcesContent[0]
}
