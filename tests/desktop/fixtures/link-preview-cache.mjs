/**
 * [INPUT]: An isolated Electron user-data directory and the production preview-cache wire format.
 * [OUTPUT]: Fresh deterministic cache files for public URLs, with locally generated PNG evidence.
 * [POS]: Offline desktop acceptance fixture; never imported by production code.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

export const urls = {
  x: 'https://x.com/trq212/status/2103576349499855160',
  youtube: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ&start=5#notes',
  article: 'https://example.com/link-preview-article',
  unavailable: 'https://example.com/link-preview-unavailable',
}

export const titles = {
  mixed: `用这个 x 帖子${urls.x} 作为小红书或者公众号分享`,
  multiple: `参考[这支动画](${urls.youtube})的镜头，结合[这篇文章](${urls.article})和${urls.x} 整理一篇分享。`,
  repeated: `先读[这篇帖子](${urls.x})，写稿时再对照[原帖](${urls.x})。`,
  failure: `稍后阅读 ${urls.unavailable}`,
  completed: `已完成的旧任务 ${urls.x}`,
  archived: `已归档的旧任务 [资料](${urls.youtube})`,
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, crc])
}

function png() {
  const width = 96, height = 64, header = Buffer.alloc(13), pixels = Buffer.alloc(height * (1 + width * 3))
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (1 + width * 3) + 1 + x * 3
    const color = x < width / 2 ? [220, 118, 66] : [86, 116, 156]
    color.forEach((value, channel) => { pixels[offset + channel] = value - (y >= height / 2 ? 20 : 0) })
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}

export async function seedPreviewCache(profile) {
  const directory = join(profile, 'link-previews'), image = `data:image/png;base64,${png().toString('base64')}`
  await mkdir(directory, { recursive: true })
  const previews = [
    { url: urls.x, title: 'Fixture X post', siteName: 'X', description: 'Synthetic cached post metadata.', image },
    { url: urls.youtube, title: 'Fixture YouTube video', siteName: 'YouTube', description: 'Synthetic cached video metadata.', image },
    { url: urls.article, title: 'Fixture article without image', siteName: 'Example', description: 'A page without an Open Graph image remains readable.', image: null },
  ]
  for (const preview of previews) {
    const canonical = new URL(preview.url); canonical.hash = ''
    const filename = `${createHash('sha256').update(canonical.href).digest('hex')}.json`
    await writeFile(join(directory, filename), JSON.stringify({ version: 1, fetchedAt: Date.now(), preview: { ...preview, url: canonical.href, status: 'ready' } }))
  }
  return { directory, entries: previews.length, imageSize: png().length }
}
