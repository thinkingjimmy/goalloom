/**
 * [INPUT]: Has no runtime dependencies
 * [OUTPUT]: Exports SITE_URL, SITE_NAME, SOCIAL_IMAGE and absoluteUrl
 * [POS]: lib/seo's shared site identity for metadata, structured data, crawler routes and the export audit
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */

export const SITE_URL = 'https://goalloom.com'
export const SITE_NAME = 'Goalloom'

export const SOCIAL_IMAGE = { url: '/og.png', width: 1200, height: 630 } as const

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).href
}
