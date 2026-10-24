/**
 * [INPUT]: Locale paths/copy, service facts, shared icons/theme/download controls and optional page/preferences placement.
 * [OUTPUT]: Exports SiteHeader
 * [POS]: Shared site navigation; homepage delegates language/theme controls to the Hero status bar.
 *        The download control renders both platforms and <html data-platform> picks one before paint.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { getCatalog, localizedPath, type Locale, type SiteCatalog } from '@/lib/i18n'
import { getServiceCatalog } from '@/lib/services'
import { REPO } from '@/lib/release'
import { Mark } from './icons'
import { DownloadButton } from './download-button'
import { LanguageMenu } from './language-menu'
import { ThemeToggle } from './theme'

export function SiteHeader({ locale, copy, className, logicalPath = '/', showPreferences = true }: { locale: Locale; copy: SiteCatalog['nav']; className: string; logicalPath?: string; showPreferences?: boolean }) {
  return (
    <header className={`site-header ${className}`}>
      <a className="brand" href={localizedPath(locale, '/')} aria-label={copy.home}>
        <span className="brand-tile"><Mark size={20} /></span>Goalloom
      </a>
      <nav className="site-nav" aria-label={copy.main}>
        <a className="nav-link pricing-link" href={localizedPath(locale, '/pricing/')} aria-current={logicalPath === '/pricing/' ? 'page' : undefined}>{getServiceCatalog(locale).navPricing}</a>
        <a className="nav-link desktop-only" href={REPO}>{copy.github}</a>
        {showPreferences && <>
          <LanguageMenu locale={locale} label={copy.language} className="nav-link" logicalPath={logicalPath} />
          <ThemeToggle toDark={copy.themeToDark} toLight={copy.themeToLight} className="nav-link nav-icon" />
        </>}
        <DownloadButton copy={getCatalog(locale).download} compactLabel={copy.download} size="compact" />
      </nav>
    </header>
  )
}
