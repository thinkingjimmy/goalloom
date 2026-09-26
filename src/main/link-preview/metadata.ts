/**
 * [INPUT]: Public URLs and bounded responses from the pinned preview transport.
 * [OUTPUT]: Plain metadata and optional bounded PNG/JPEG/WebP data URLs; never executable HTML.
 * [POS]: Main-process provider adapters; public embed failures fall back to ordinary page metadata.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { LinkPreview } from '../../shared/contracts/link-preview'
import { fetchPublic, publicUrl } from './transport'
import { fetchProvider, type PreviewProvider } from './providers'

interface Metadata { title: string; siteName: string; description: string; imageUrl: string | null; provider?: PreviewProvider }
const pageLimit = 1024 * 1024
const imageLimit = 1024 * 1024

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, limit) : ''
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function entities(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' }
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, entity: string) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? whole
    const number = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : ''
  })
}
function plain(html: string): string {
  return entities(html.replace(/<br\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, ' '))
}
function imageUrl(value: unknown, base: string): string | null {
  try { return typeof value === 'string' && value.trim() ? publicUrl(new URL(entities(value.trim()), base).href).href : null }
  catch { return null }
}
function parseHtml(html: string, base: string): Metadata {
  const inert = html.replace(/<!--[^]*?-->|<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, '')
  const meta = new Map<string, string>()
  for (const match of inert.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attributes = new Map<string, string>()
    for (const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attributes.set(attr[1]!.toLowerCase(), entities(attr[2] ?? attr[3] ?? attr[4] ?? ''))
    }
    const key = (attributes.get('property') ?? attributes.get('name'))?.toLowerCase()
    const content = attributes.get('content')
    if (key && content && !meta.has(key)) meta.set(key, content)
  }
  return {
    title: text(meta.get('og:title') ?? meta.get('twitter:title') ?? plain(inert.match(/<title\b[^>]*>([^]*?)<\/title\s*>/i)?.[1] ?? ''), 1000),
    siteName: text(meta.get('og:site_name') ?? new URL(base).hostname.replace(/^www\./, ''), 200),
    description: text(meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'), 2000),
    imageUrl: imageUrl(meta.get('og:image:secure_url') ?? meta.get('og:image') ?? meta.get('twitter:image') ?? meta.get('twitter:image:src'), base),
  }
}

async function json(url: string, provider: PreviewProvider, signal: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetchProvider(url, provider, false, pageLimit, signal)
  return object(JSON.parse(response.bytes.toString('utf8')))
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase()
  const id = host === 'youtu.be' ? url.pathname.split('/')[1]
    : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com'].includes(host)
      ? url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1] : null
  return id && /^[\w-]{11}$/.test(id) ? id : null
}

async function youtube(id: string, signal: AbortSignal): Promise<Metadata | null> {
  const endpoint = new URL('https://www.youtube.com/oembed')
  endpoint.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`)
  endpoint.searchParams.set('format', 'json')
  const data = await json(endpoint.href, 'youtube', signal)
  if (!text(data.title, 1000)) return null
  return { title: text(data.title, 1000), siteName: text(data.author_name ? `${data.author_name} · YouTube` : 'YouTube', 200), description: '', imageUrl: imageUrl(data.thumbnail_url, endpoint.href), provider: 'youtube' }
}

function xPost(url: URL): string | null {
  if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com', 'mobile.x.com'].includes(url.hostname.toLowerCase())) return null
  return /^\/(?:[^/]+\/status|i\/web\/status)\/(\d{5,25})(?:\/|$)/.exec(url.pathname)?.[1] ?? null
}

async function xMetadata(id: string, original: URL, signal: AbortSignal): Promise<Metadata | null> {
  // X's public embed response includes article covers not exposed in plain oEmbed HTML.
  try {
    const data = await json(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=0`, 'x', signal)
    const article = object(data.article)
    const user = object(data.user)
    const articleMedia = object(object(article.cover_media).media_info)
    const photos = Array.isArray(data.photos) ? data.photos : []
    const media = Array.isArray(data.mediaDetails) ? data.mediaDetails : []
    const rawTitle = article.title ?? data.text
    const title = text(typeof rawTitle === 'string' ? entities(rawTitle) : '', 1000)
    if (title) return {
      title, siteName: text(user.screen_name ? `X · @${user.screen_name}` : 'X', 200),
      description: text(article.title ? entities(text(article.preview_text ?? data.text, 2000)) : '', 2000),
      imageUrl: imageUrl(articleMedia.original_img_url ?? object(photos[0]).url ?? object(media[0]).media_url_https ?? object(data.video).poster, original.href),
      provider: 'x',
    }
  } catch { if (signal.aborted) return null }
  const endpoint = new URL('https://publish.twitter.com/oembed')
  endpoint.searchParams.set('url', `https://twitter.com/i/status/${id}`)
  endpoint.searchParams.set('omit_script', 'true')
  endpoint.searchParams.set('dnt', 'true')
  try {
    const data = await json(endpoint.href, 'x', signal)
    const html = typeof data.html === 'string' ? data.html : ''
    const title = text(plain(html.match(/<p\b[^>]*>([^]*?)<\/p>/i)?.[1] ?? ''), 1000)
    return title ? { title, siteName: text(data.author_name ? `X · ${data.author_name}` : 'X', 200), description: '', imageUrl: null, provider: 'x' } : null
  } catch { return null }
}

function raster(bytes: Buffer): 'png' | 'jpeg' | 'webp' | null {
  let width = 0; let height = 0; let mime: 'png' | 'jpeg' | 'webp' | null = null
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    mime = 'png'; width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20)
  } else if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) break
      const marker = bytes[at + 1]!
      if (marker === 0xff) { at++; continue }
      if (marker === 0xda || marker === 0xd9) break
      const length = bytes.readUInt16BE(at + 2)
      if (length < 2 || at + 2 + length > bytes.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        mime = 'jpeg'; height = bytes.readUInt16BE(at + 5); width = bytes.readUInt16BE(at + 7); break
      }
      at += 2 + length
    }
  } else if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const format = bytes.toString('ascii', 12, 16)
    if (format === 'VP8X') { width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3) }
    else if (format === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff }
    else if (format === 'VP8L' && bytes[20] === 0x2f) { const bits = bytes.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1 }
    mime = 'webp'
  }
  return width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 20_000_000 ? mime : null
}

async function loadImage(url: string | null, provider: PreviewProvider | undefined, signal: AbortSignal): Promise<string | null> {
  if (!url || signal.aborted) return null
  try {
    const response = provider ? await fetchProvider(url, provider, true, imageLimit, signal)
      : await fetchPublic(url, imageLimit, signal, 'image/png,image/jpeg,image/webp')
    const type = raster(response.bytes)
    return type ? `data:image/${type};base64,${response.bytes.toString('base64')}` : null
  } catch { return null }
}

export function unavailable(url: string): LinkPreview {
  let siteName = ''
  try { siteName = new URL(url).hostname.replace(/^www\./, '').slice(0, 200) } catch { /* Keep invalid input inert. */ }
  return { url, status: 'unavailable', title: '', siteName, description: '', image: null }
}

export async function loadMetadata(url: string, signal: AbortSignal): Promise<LinkPreview> {
  const parsed = publicUrl(url)
  const videoId = youtubeId(parsed)
  const postId = xPost(parsed)
  let metadata: Metadata | null = null
  try {
    if (videoId) metadata = await youtube(videoId, signal)
    else if (postId) metadata = await xMetadata(postId, parsed, signal)
  } catch { /* Ordinary page metadata is still useful if an embed endpoint is unavailable. */ }
  if (!metadata && !signal.aborted) {
    try {
      const page = await fetchPublic(parsed.href, pageLimit, signal, 'text/html,application/xhtml+xml')
      if (/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(page.contentType)) metadata = parseHtml(page.bytes.toString('utf8'), page.url)
    } catch { /* The visible original link remains available. */ }
  }
  if (!metadata?.title || signal.aborted) return unavailable(url)
  const image = await loadImage(metadata.imageUrl, metadata.provider, signal)
  return { url, status: 'ready', title: metadata.title, siteName: metadata.siteName, description: metadata.description, image }
}
