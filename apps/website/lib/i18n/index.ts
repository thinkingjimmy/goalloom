/**
 * [INPUT]: Depends on ./locale and five ./catalogs
 * [OUTPUT]: Exports getCatalog, SiteCatalog and re-exports the locale helpers
 * [POS]: lib/i18n's copy entry; service policy answers are composed by the FAQ component from their own catalog
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import en, { type SiteCatalog } from './catalogs/en'
import es from './catalogs/es'
import fr from './catalogs/fr'
import ja from './catalogs/ja'
import zhCN from './catalogs/zh-CN'
import type { Locale } from './locale'

export type { SiteCatalog }
export * from './locale'

const CATALOGS: Record<Locale, SiteCatalog> = { en, 'zh-CN': zhCN, ja, es, fr }

export function getCatalog(locale: Locale): SiteCatalog {
  return CATALOGS[locale]
}
