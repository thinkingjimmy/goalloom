/**
 * [INPUT]: Public URLs and bounded responses from the pinned preview transport.
 * [OUTPUT]: Plain metadata and independent cached-icon enrichment with bounded raster/ICO data URLs.
 * [POS]: Main-process provider adapters; public embed failures fall back to ordinary page metadata.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { raster } from './images'
import { faviconCandidates, loadFavicon } from './favicon'
import type { LinkPreview } from '../../shared/contracts/link-preview'
import { fetchPublic, publicUrl } from './transport'
import { fetchProvider, type PreviewProvider } from './providers'

interface Metadata { title: string; siteName: string; description: string; imageUrl: string | null; provider?: PreviewProvider; icons?: string[] }
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
    icons: faviconCandidates(inert, base),
    title: text(meta.get('og:title') ?? meta.get('twitter:title') ?? plain(inert.match(/<title\b[^>]*>([^]*?)<\/title\s*>/i)?.[1] ?? ''), 1000),
    siteName: text(meta.get('og:site_name') ?? new URL(base).hostname.replace(/^www\./, ''), 200),
    description: text(meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'), 2000),
    imageUrl: imageUrl(meta.get('og:image:secure_url') ?? meta.get('og:image') ?? meta.get('twitter:image') ?? meta.get('twitter:image:src'), base),
  }
}

async function json(url: string, provider: PreviewProvider, signal: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetchProvider(url, provider, 'metadata', pageLimit, signal)
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


async function loadImage(url: string | null, provider: PreviewProvider | undefined, signal: AbortSignal): Promise<string | null> {
  if (!url || signal.aborted) return null
  try {
    const response = provider ? await fetchProvider(url, provider, 'image', imageLimit, signal)
      : await fetchPublic(url, imageLimit, signal, 'image/png,image/jpeg,image/webp')
    const type = raster(response.bytes)
    return type ? `data:image/${type};base64,${response.bytes.toString('base64')}` : null
  } catch { return null }
}

export function unavailable(url: string): LinkPreview {
  let siteName = ''
  try { siteName = new URL(url).hostname.replace(/^www\./, '').slice(0, 200) } catch { /* Keep invalid input inert. */ }
  return { url, status: 'unavailable', title: '', siteName, description: '', image: null, favicon: null }
}

async function pageMetadata(url: string, signal: AbortSignal): Promise<Metadata | null> {
  try {
    const page = await fetchPublic(url, pageLimit, signal, 'text/html,application/xhtml+xml')
    return /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(page.contentType) ? parseHtml(page.bytes.toString('utf8'), page.url) : null
  } catch { return null }
}

export async function loadCachedFavicon(url: string, signal: AbortSignal): Promise<string | null> {
  const parsed = publicUrl(url)
  const provider = youtubeId(parsed) ? 'youtube' : xPost(parsed) ? 'x' : undefined
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(4000)])
  const page = provider ? null : await pageMetadata(parsed.href, bounded)
  return loadFavicon(page?.icons ?? [], parsed.href, bounded, provider)
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
    metadata = await pageMetadata(parsed.href, signal)
  }
  if (!metadata?.title || signal.aborted) return unavailable(url)
  const [image, favicon] = await Promise.all([loadImage(metadata.imageUrl, metadata.provider, signal), loadFavicon(metadata.icons ?? [], parsed.href, signal, metadata.provider)])
  return { url, status: 'ready', title: metadata.title, siteName: metadata.siteName, description: metadata.description, image, favicon }
}
