/**
 * [INPUT]: Depends on Next's Metadata type, ./locale paths, a SiteCatalog and lib/seo/site
 * [OUTPUT]: Exports languageAlternates and buildMetadata (canonical, hreflang, robots, Open Graph, Twitter, icons)
 * [POS]: lib/i18n's localized metadata authority, shared by both route trees and mirrored by the export audit
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Metadata } from 'next'
import type { SiteCatalog } from './catalogs/en'
import { LOCALES, localizedPath, type Locale } from './locale'
import { SITE_NAME, SITE_URL, SOCIAL_IMAGE, absoluteUrl } from '../seo/site'

const OG_LOCALES: Record<Locale, string> = { en: 'en_US', 'zh-CN': 'zh_CN', ja: 'ja_JP', es: 'es_ES', fr: 'fr_FR' }

export function languageAlternates(logicalPath: string): Record<string, string> {
  return {
    'x-default': absoluteUrl(logicalPath),
    ...Object.fromEntries(LOCALES.map(locale => [locale, absoluteUrl(localizedPath(locale, logicalPath))])),
  }
}

export function buildMetadata(locale: Locale, catalog: SiteCatalog, logicalPath = '/'): Metadata {
  const canonical = absoluteUrl(localizedPath(locale, logicalPath))
  const image = { ...SOCIAL_IMAGE, url: absoluteUrl(SOCIAL_IMAGE.url), alt: catalog.meta.socialAlt }
  return {
    metadataBase: new URL(SITE_URL),
    title: catalog.meta.title,
    description: catalog.meta.description,
    alternates: { canonical, languages: languageAlternates(logicalPath) },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
    openGraph: {
      title: catalog.meta.title,
      description: catalog.meta.description,
      url: canonical,
      siteName: SITE_NAME,
      locale: OG_LOCALES[locale],
      alternateLocale: LOCALES.filter(entry => entry !== locale).map(entry => OG_LOCALES[entry]),
      type: 'website',
      images: [image],
    },
    twitter: { card: 'summary_large_image', title: catalog.meta.title, description: catalog.meta.description, images: [image] },
    icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }], apple: '/app-icon.png' },
  }
}
