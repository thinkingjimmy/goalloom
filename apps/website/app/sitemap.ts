/**
 * [INPUT]: Depends on lib/i18n/locale, lib/seo/site and the public route inventory
 * [OUTPUT]: A static sitemap for public informational routes in five locales, with reciprocal hreflang alternates
 * [POS]: app's search discovery map
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { MetadataRoute } from 'next'
import { LOCALES, localizedPath } from '@/lib/i18n/locale'
import { absoluteUrl } from '@/lib/seo/site'
import routes from '@/lib/seo/routes.json'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.filter(route => route.index).flatMap(({ path }) => {
    const languages = Object.fromEntries([['x-default', absoluteUrl(path)], ...LOCALES.map(locale => [locale, absoluteUrl(localizedPath(locale, path))])])
    return LOCALES.map(locale => ({ url: absoluteUrl(localizedPath(locale, path)), alternates: { languages } }))
  })
}
