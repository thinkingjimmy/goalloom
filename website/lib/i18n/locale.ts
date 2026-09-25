/**
 * [INPUT]: Uses only URL path semantics
 * [OUTPUT]: Exports Locale, LOCALES, DEFAULT_LOCALE, PREFIXED_LOCALES, LANGUAGE_OPTIONS, isLocale, stripLocale, localizedPath
 * [POS]: lib/i18n's URL language authority, shared by static routes, the language menu, metadata and the SEO audit
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */

// The site ships the same five languages as the app. English is the unprefixed x-default; the rest carry a prefix.
export const LOCALES = ['en', 'zh-CN', 'ja', 'es', 'fr'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'
export const PREFIXED_LOCALES = LOCALES.filter(locale => locale !== DEFAULT_LOCALE)

// Each language names itself, matching the app's language picker.
export const LANGUAGE_OPTIONS: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
]

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale)
}

/** Removes a leading locale segment and keeps the trailing-slash route policy. */
export function stripLocale(pathname: string): string {
  const segments = pathname.split(/[?#]/u)[0]!.split('/').filter(Boolean)
  if (segments.length > 0 && isLocale(segments[0])) segments.shift()
  return segments.length ? `/${segments.join('/')}/` : '/'
}

export function localizedPath(locale: Locale, pathname: string): string {
  const logical = stripLocale(pathname)
  return locale === DEFAULT_LOCALE ? logical : `/${locale}${logical}`.replace(/\/+/gu, '/')
}
