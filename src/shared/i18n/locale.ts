/**
 * [INPUT]: System or browser BCP 47 language lists.
 * [OUTPUT]: Locale/language values and types, system-language resolution, native names, Intl tags and catalog widening.
 * [POS]: Lightweight language metadata shared by main, worker and renderer; validation belongs to contracts/runtime.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const locales = ['zh', 'en', 'ja', 'es', 'fr'] as const
export type Locale = typeof locales[number]
export const languages = ['system', ...locales] as const
export type Language = typeof languages[number]

// Always shown in their own language so a user can find theirs regardless of the current UI language.
export const localeNames: Record<Locale, string> = { zh: '简体中文', en: 'English', ja: '日本語', es: 'Español', fr: 'Français' }
export const intlTags: Record<Locale, string> = { zh: 'zh-CN', en: 'en', ja: 'ja-JP', es: 'es', fr: 'fr-FR' }

// First supported primary subtag wins; an unsupported system language falls back to English, not the source language.
export function systemLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split(/[-_]/)[0]
    const match = locales.find(locale => locale === primary)
    if (match) return match
  }
  return 'en'
}
// Source catalogs infer literal types; widening lets every other language satisfy the same shape.
export type Widen<T> = T extends string ? string
  : T extends (...args: infer A) => string ? (...args: A) => string
  : T extends readonly (infer U)[] ? Widen<U>[]
  : { [K in keyof T]: Widen<T[K]> }
export function widen<T>(catalog: T): Widen<T> { return catalog as Widen<T> }

export function resolveLocale(language: Language, languages: readonly string[]): Locale {
  return language === 'system' ? systemLocale(languages) : language
}
