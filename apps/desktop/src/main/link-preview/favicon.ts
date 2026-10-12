/**
 * [INPUT]: Inert page markup, its final public URL, optional trusted provider and cancellation signal.
 * [OUTPUT]: A bounded, validated favicon data URL or null; never executable SVG.
 * [POS]: Optional enrichment through pinned public transport or exact official provider icon endpoints.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { fetchPublic, publicUrl } from './transport'
import { raster } from './images'
import { fetchProvider, providerFavicons, type PreviewProvider } from './providers'

export function faviconCandidates(html: string, base: string): string[] {
  const candidates: string[] = []
  for (const match of html.matchAll(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attributes = new Map<string, string>()
    for (const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attributes.set(attr[1]!.toLowerCase(), attr[2] ?? attr[3] ?? attr[4] ?? '')
    if (!/(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(attributes.get('rel') ?? '') || attributes.get('type')?.includes('svg')) continue
    try {
      const href = attributes.get('href')?.replace(/&amp;/g, '&')
      if (href) candidates.push(publicUrl(new URL(href, base).href).href)
    } catch { /* Unsupported or non-public icons are optional. */ }
    if (candidates.length === 3) break
  }
  // A redirected page's origin owns its fallback icon.
  candidates.push(new URL('/favicon.ico', base).href)
  return [...new Set(candidates)]
}

function validIcon(bytes: Buffer): boolean {
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x00010000) return false
  const count = bytes.readUInt16LE(4), directoryEnd = 6 + count * 16
  if (!count || count > 32 || directoryEnd > bytes.length) return false
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16, length = bytes.readUInt32LE(entry + 8), offset = bytes.readUInt32LE(entry + 12)
    if (!length || offset < directoryEnd || offset + length > bytes.length) return false
    const frame = bytes.subarray(offset, offset + length)
    if (raster(frame, 256, 65_536) === 'png') continue
    if (frame.length < 40 || frame.readUInt32LE(0) !== 40) return false
    const width = frame.readInt32LE(4), height = frame.readInt32LE(8), bits = frame.readUInt16LE(14)
    if (width < 1 || width > 256 || height !== (bytes[entry + 1] || 256) * 2 || width !== (bytes[entry] || 256)
      || frame.readUInt16LE(12) !== 1 || ![1, 4, 8, 24, 32].includes(bits) || frame.readUInt32LE(16) !== 0) return false
    const palette = bits <= 8 ? (frame.readUInt32LE(32) || 2 ** bits) * 4 : 0
    const pixels = Math.ceil(width * bits / 32) * 4 * height / 2
    if (40 + palette + pixels > frame.length) return false
  }
  return true
}

export async function loadFavicon(candidates: string[], original: string, signal: AbortSignal, provider?: PreviewProvider): Promise<string | null> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(4000)])
  const urls = provider ? [providerFavicons[provider]] : candidates.length ? candidates : [new URL('/favicon.ico', original).href]
  for (const url of urls) {
    if (bounded.aborted) break
    try {
      const { bytes } = provider ? await fetchProvider(url, provider, 'favicon', 256 * 1024, bounded)
        : await fetchPublic(url, 256 * 1024, bounded, 'image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon')
      const mime = raster(bytes, 512, 262_144) ?? (validIcon(bytes) ? 'x-icon' : null)
      if (mime) return `data:image/${mime};base64,${bytes.toString('base64')}`
    } catch { /* An icon failure never discards page text or its cover. */ }
  }
  return null
}
