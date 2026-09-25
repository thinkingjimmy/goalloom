/**
 * [INPUT]: Depends on lib/i18n (locale paths, SiteCatalog), lib/release and ./site
 * [OUTPUT]: Exports buildStructuredData, the home page's JSON-LD graph
 * [POS]: lib/seo's semantic description of the site and the downloadable desktop app; claims only published facts
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { SiteCatalog } from '../i18n/catalogs/en'
import { LOCALES, localizedPath, type Locale } from '../i18n/locale'
import { RELEASE, RELEASES_URL, REPO } from '../release'
import { SITE_NAME, absoluteUrl } from './site'

export function buildStructuredData(locale: Locale, catalog: SiteCatalog) {
  const url = absoluteUrl(localizedPath(locale, '/'))
  const websiteId = absoluteUrl('/#website')
  const softwareId = absoluteUrl('/#software')
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': websiteId, url: absoluteUrl('/'), name: SITE_NAME, inLanguage: LOCALES },
      {
        '@type': 'WebPage', '@id': `${url}#webpage`, url, name: catalog.meta.title, description: catalog.meta.description,
        inLanguage: locale, isPartOf: { '@id': websiteId }, mainEntity: { '@id': softwareId },
      },
      {
        '@type': 'SoftwareApplication', '@id': softwareId, name: SITE_NAME, url, description: catalog.meta.description,
        image: absoluteUrl('/app-icon.png'), applicationCategory: 'ProductivityApplication', operatingSystem: ['macOS 14', 'Windows 11'],
        softwareVersion: RELEASE.version, downloadUrl: RELEASES_URL, license: `${REPO}/blob/main/LICENSE`, sameAs: REPO, isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD', url: RELEASES_URL },
      },
    ],
  }
}
