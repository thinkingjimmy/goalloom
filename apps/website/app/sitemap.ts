/**
 * [INPUT]: Depends on lib/i18n/locale and lib/seo/site
 * [OUTPUT]: A static sitemap for home, privacy and terms in five locales, with reciprocal hreflang alternates
 * [POS]: app's search discovery map
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { MetadataRoute } from 'next'
import { LOCALES, localizedPath } from '@/lib/i18n/locale'
import { absoluteUrl } from '@/lib/seo/site'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/privacy/', '/terms/'].flatMap(path => {
    const languages = Object.fromEntries([['x-default', absoluteUrl(path)], ...LOCALES.map(locale => [locale, absoluteUrl(localizedPath(locale, path))])])
    return LOCALES.map(locale => ({ url: absoluteUrl(localizedPath(locale, path)), alternates: { languages } }))
  })
}
