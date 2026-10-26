/**
 * [INPUT]: Shared billing handoff copy, locale routing and static support/download navigation.
 * [OUTPUT]: Noindex BillingPage with finite continuation, aligned page gutters, explicit app return and manual recovery.
 * [POS]: Continue/return static composition; no authentication, purchase or entitlement side effects.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { getCatalog, localizedPath, type Locale } from '@/lib/i18n'
import { getServiceCatalog } from '@/lib/services'
import { absoluteUrl } from '@/lib/seo/site'
import { SiteHeader } from '../site-header'
import { SiteFooter } from '../site-footer'
import { ServiceSupport } from './pricing-page'
import { BillingStatus } from './billing-status'
export function BillingPage({ locale, kind }: { locale: Locale; kind: 'continue' | 'return' }) {
 const t = getCatalog(locale), copy = getServiceCatalog(locale), path = `/billing/${kind}/`
 const title = kind === 'continue' ? copy.billing.continueTitle : copy.billing.returnTitle
 const schema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: title, url: absoluteUrl(localizedPath(locale, path)), inLanguage: locale }).replace(/</gu, '\\u003c')
 return <>
  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />
  <SiteHeader locale={locale} copy={t.nav} className="site-bar billing-frame" logicalPath={path} />
  <main className="service-main billing-frame billing-main"><header className="service-intro"><p className="eyebrow">Goalloom</p><h1>{title}</h1></header>
   <BillingStatus copy={copy.billing} kind={kind} />
   <nav className="service-policies"><a href={localizedPath(locale, '/pricing/')}>{copy.billing.back}</a><a href={`${localizedPath(locale, '/')}#download`}>{copy.download}</a></nav>
   <ServiceSupport locale={locale} />
  </main>
  <SiteFooter locale={locale} t={t} logicalPath={path} />
 </>
}
