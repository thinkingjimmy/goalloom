/**
 * [INPUT]: Depends on lib/i18n (locale paths, SiteCatalog), lib/release, ./icons and ./theme
 * [OUTPUT]: Exports SiteHeader, LanguageMenu and PlatformDownload
 * [POS]: components' only site navigation. The hero mounts it twice (stage band and floating bar); only one is ever
 *        visible. The download control renders both platforms and <html data-platform> picks one before paint.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { LANGUAGE_OPTIONS, localizedPath, type Locale, type SiteCatalog } from '@/lib/i18n'
import { RELEASES_URL, REPO, downloadUrl } from '@/lib/release'
import { Icon, Mark } from './icons'
import { ThemeToggle } from './theme'

export function LanguageMenu({ locale, label, className, up = false }: { locale: Locale; label: string; className: string; up?: boolean }) {
  const current = LANGUAGE_OPTIONS.find(option => option.value === locale)!
  return (
    <details className="menu-pop">
      <summary className={className} aria-label={`${label}: ${current.label}`}>
        <Icon name="globe" size={16} /><span>{current.label}</span>
      </summary>
      <div className="menu-panel" data-up={up}>
        {LANGUAGE_OPTIONS.map(option => (
          <a key={option.value} href={localizedPath(option.value, '/')} hrefLang={option.value} lang={option.value} aria-current={option.value === locale ? 'page' : undefined}>
            {option.label}{option.value === locale && <Icon name="check" size={14} />}
          </a>
        ))}
      </div>
    </details>
  )
}

/** The header's download action: one anchor per platform, the visitor's platform shown (see boot.ts). */
export function PlatformDownload({ copy }: { copy: SiteCatalog['nav'] }) {
  return <>
    <a className="nav-cta" data-for="mac" href={downloadUrl('mac')}><Icon name="apple" size={15} />{copy.download}</a>
    <a className="nav-cta" data-for="windows" href={downloadUrl('windows')}><Icon name="windows" size={14} />{copy.download}</a>
  </>
}

export function SiteHeader({ locale, copy, className }: { locale: Locale; copy: SiteCatalog['nav']; className: string }) {
  return (
    <header className={`site-header ${className}`}>
      <a className="brand" href={localizedPath(locale, '/')} aria-label={copy.home}>
        <span className="brand-tile"><Mark size={20} /></span>Goalloom
      </a>
      <nav className="site-nav" aria-label={copy.main}>
        <a className="nav-link desktop-only" href="#board">{copy.board}</a>
        <a className="nav-link desktop-only" href="#jev">{copy.jev}</a>
        <a className="nav-link desktop-only" href={RELEASES_URL}>{copy.releases}</a>
        <a className="nav-link desktop-only" href={REPO}>{copy.github}</a>
        <LanguageMenu locale={locale} label={copy.language} className="nav-link" />
        <ThemeToggle toDark={copy.themeToDark} toLight={copy.themeToLight} className="nav-link nav-icon" />
        <PlatformDownload copy={copy} />
      </nav>
    </header>
  )
}
