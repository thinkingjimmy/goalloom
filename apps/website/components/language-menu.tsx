/**
 * [INPUT]: Locale URL helpers, shared icons and shared native-menu dismissal.
 * [OUTPUT]: LanguageMenu with outside-click dismissal and Escape focus restoration.
 * [POS]: Shared preference control for the page header and footer; native links work without JavaScript.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
'use client'

import { LANGUAGE_OPTIONS, localizedPath, type Locale } from '@/lib/i18n/locale'
import { Icon } from './icons'
import { useDismissibleMenu } from './use-dismissible-menu'

export function LanguageMenu({ locale, label, className, up = false, logicalPath = '/' }: { locale: Locale; label: string; className: string; up?: boolean; logicalPath?: string }) {
  const menuRef = useDismissibleMenu()
  const current = LANGUAGE_OPTIONS.find(option => option.value === locale)!

  return (
    <details ref={menuRef} className="menu-pop">
      <summary className={className} aria-label={`${label}: ${current.label}`}>
        <Icon name="globe" size={16} /><span>{current.label}</span>
      </summary>
      <div className="menu-panel" data-up={up}>
        {LANGUAGE_OPTIONS.map(option => (
          <a key={option.value} href={localizedPath(option.value, logicalPath)} hrefLang={option.value} lang={option.value} aria-current={option.value === locale ? 'page' : undefined}>
            {option.label}{option.value === locale && <Icon name="check" size={14} />}
          </a>
        ))}
      </div>
    </details>
  )
}
