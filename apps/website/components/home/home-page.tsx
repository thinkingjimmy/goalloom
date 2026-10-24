/**
 * [INPUT]: Localized catalogs, SEO data, shared footer/pricing, FAQ, Hero and ProductTour.
 * [OUTPUT]: Exports HomePage
 * [POS]: components/home's page composition shared by the English and prefixed route trees
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { getCatalog, type Locale } from '@/lib/i18n'
import { buildStructuredData } from '@/lib/seo/structured-data'
import { HomePricing } from '../services/home-pricing'
import { SiteFooter } from '../site-footer'
import { FaqSection } from './faq-section'
import { Hero } from './sections'
import { ProductTour } from './product-tour'

export function HomePage({ locale }: { locale: Locale }) {
  const t = getCatalog(locale)
  const jsonLd = JSON.stringify(buildStructuredData(locale, t)).replace(/</gu, '\\u003c')
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    <Hero locale={locale} t={t} />
    <main>
      <ProductTour intro={t.intro} note={t.note} />
      <HomePricing locale={locale} />
      <FaqSection locale={locale} copy={t.faq} />
    </main>
    <SiteFooter locale={locale} t={t} />
  </>
}
