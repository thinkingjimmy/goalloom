/**
 * [INPUT]: Localized navigation copy, locale paths and the current logical page path.
 * [OUTPUT]: Shared SiteFooter with accessible legal links and page-preserving language navigation.
 * [POS]: Website footer used by the homepage and legal documents.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { localizedPath, type Locale, type SiteCatalog } from '@/lib/i18n'
import { RELEASES_URL, REPO } from '@/lib/release'
import { LanguageMenu } from './site-header'

export function SiteFooter({ locale, t, logicalPath = '/' }: { locale: Locale; t: SiteCatalog; logicalPath?: string }) {
  return (
    <footer className="site-footer">
      <span>{t.footer.rights}</span>
      <nav aria-label={t.footer.links}>
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
