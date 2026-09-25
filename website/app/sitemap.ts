/**
 * [INPUT]: Depends on lib/i18n/locale and lib/seo/site
 * [OUTPUT]: A static sitemap: one self-canonical URL per locale, each listing every hreflang alternate
 * [POS]: app's search discovery map
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { MetadataRoute } from 'next'
import { LOCALES, localizedPath } from '@/lib/i18n/locale'
import { absoluteUrl } from '@/lib/seo/site'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries([['x-default', absoluteUrl('/')], ...LOCALES.map(locale => [locale, absoluteUrl(localizedPath(locale, '/'))])])
  return LOCALES.map(locale => ({ url: absoluteUrl(localizedPath(locale, '/')), alternates: { languages } }))
}
