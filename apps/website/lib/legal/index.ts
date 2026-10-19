/**
 * [INPUT]: Five legal catalogs, locale routing and the site's shared metadata builder.
 * [OUTPUT]: getLegalCatalog, legalMetadata and the legal document types/constants.
 * [POS]: Server-side entry for localized privacy/terms routes and their metadata.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { getCatalog, type Locale } from '../i18n'
import { buildMetadata } from '../i18n/metadata'
import en from './catalogs/en'
import es from './catalogs/es'
import fr from './catalogs/fr'
import ja from './catalogs/ja'
import zhCN from './catalogs/zh-CN'
import type { LegalCatalog, LegalKind } from './types'

export * from './types'
const catalogs: Record<Locale, LegalCatalog> = { en, es, fr, ja, 'zh-CN': zhCN }

export const getLegalCatalog = (locale: Locale): LegalCatalog => catalogs[locale]

export function legalMetadata(locale: Locale, kind: LegalKind) {
  const catalog = getCatalog(locale)
  const document = getLegalCatalog(locale)[kind]
  return buildMetadata(locale, {
    ...catalog,
    meta: { ...catalog.meta, title: `${document.title} · Goalloom`, description: document.description },
  }, `/${kind}/`)
}
