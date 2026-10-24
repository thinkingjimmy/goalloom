/**
 * [INPUT]: Shared metadata builder, service catalogs and locale paths.
 * [OUTPUT]: serviceMetadata for indexable pricing and noindex, no-referrer billing handoffs.
 * [POS]: Page-specific metadata boundary for both static route trees.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { getCatalog, type Locale } from '../i18n'
import { buildMetadata } from '../i18n/metadata'
import { getServiceCatalog } from './index'
export function serviceMetadata(locale: Locale, path: '/pricing/' | '/billing/continue/' | '/billing/return/') {
 const copy = getServiceCatalog(locale), t = getCatalog(locale)
 const meta = path === '/pricing/' ? copy.meta : { title: copy.billing.title, description: copy.billing.description }
 return { ...buildMetadata(locale, { ...t, meta: { ...t.meta, ...meta } }, path, path === '/pricing/'),
   ...(path === '/pricing/' ? {} : { referrer: 'no-referrer' as const }) }
}
