/**
 * [INPUT]: Localized site/service copy, private support contact, locale paths and the current logical page path.
 * [OUTPUT]: Shared SiteFooter with accessible legal links and page-preserving language navigation.
 * [POS]: Website footer used by home, pricing, legal and closed billing pages.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { localizedPath, type Locale, type SiteCatalog } from '@/lib/i18n'
import { getServiceCatalog, SERVICE } from '@/lib/services'
import { RELEASES_URL, REPO } from '@/lib/release'
import { LanguageMenu } from './language-menu'

export function SiteFooter({ locale, t, logicalPath = '/' }: { locale: Locale; t: SiteCatalog; logicalPath?: string }) {
  return (
    <footer className="site-footer">
      <span>{t.footer.rights}</span>
      <nav aria-label={t.footer.links}>
        <a className="service-link" href={localizedPath(locale, '/pricing/')} aria-current={logicalPath === '/pricing/' ? 'page' : undefined}>{getServiceCatalog(locale).navPricing}</a>
        <a className="service-link" href={`mailto:${SERVICE.supportEmail}`}>{getServiceCatalog(locale).support}</a>
        <a href={RELEASES_URL}>{t.nav.releases}</a>
        <a href={REPO}>{t.nav.github}</a>
        <a href={`${REPO}/issues`}>{t.footer.feedback}</a>
        <a className="legal-link" href={localizedPath(locale, '/privacy/')} aria-current={logicalPath === '/privacy/' ? 'page' : undefined}>{t.footer.privacy}</a>
        <a className="legal-link" href={localizedPath(locale, '/terms/')} aria-current={logicalPath === '/terms/' ? 'page' : undefined}>{t.footer.terms}</a>
        <LanguageMenu locale={locale} label={t.nav.language} className="lang-button" logicalPath={logicalPath} up />
      </nav>
    </footer>
  )
}
