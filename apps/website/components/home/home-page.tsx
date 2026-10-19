/**
 * [INPUT]: Depends on lib/i18n, lib/seo/structured-data, ../site-footer and ./sections
 * [OUTPUT]: Exports HomePage
 * [POS]: components/home's page composition shared by the English and prefixed route trees
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { getCatalog, type Locale } from '@/lib/i18n'
import { buildStructuredData } from '@/lib/seo/structured-data'
import { SiteFooter } from '../site-footer'
import { DownloadFaq, Hero, JevGroup, MakerNote, OkrGroup } from './sections'

export function HomePage({ locale }: { locale: Locale }) {
  const t = getCatalog(locale)
  const jsonLd = JSON.stringify(buildStructuredData(locale, t)).replace(/</gu, '\\u003c')
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    <Hero locale={locale} t={t} />
    <main>
      <MakerNote locale={locale} t={t} />
      <OkrGroup locale={locale} t={t} />
      <JevGroup locale={locale} t={t} />
      <DownloadFaq locale={locale} t={t} />
    </main>
    <SiteFooter locale={locale} t={t} />
  </>
}
