/**
 * [INPUT]: Depends on lib/seo/site
 * [OUTPUT]: A static robots.txt allowing every page and pointing to the sitemap
 * [POS]: app's crawler entry
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo/site'

export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/' }, sitemap: absoluteUrl('/sitemap.xml') }
}
