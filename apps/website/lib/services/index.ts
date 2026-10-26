/**
 * [INPUT]: Five service catalogs, the publication snapshot and locale identity.
 * [OUTPUT]: getServiceCatalog with centralized commercial values interpolated into translated copy.
 * [POS]: Server-side service copy boundary; public pages never receive an alternate account or entitlement store.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Locale } from '../i18n/locale'
import type { ServiceCatalog } from './types'
import { interpolateServiceText } from './release'
import en from './catalogs/en'
import zhCN from './catalogs/zh-CN'
import ja from './catalogs/ja'
import es from './catalogs/es'
import fr from './catalogs/fr'

export * from './types'
export * from './release'
const catalogs: Record<Locale, ServiceCatalog> = { en, 'zh-CN': zhCN, ja, es, fr }

export function getServiceCatalog(locale: Locale): ServiceCatalog {
  return JSON.parse(JSON.stringify(catalogs[locale]), (_key, value: unknown) => typeof value === 'string' ? interpolateServiceText(value) : value) as ServiceCatalog
}
