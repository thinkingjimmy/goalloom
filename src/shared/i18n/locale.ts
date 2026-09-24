/**
 * [INPUT]: zod；系统或浏览器给出的 BCP 47 语言列表。
 * [OUTPUT]: 支持的 Locale、语言偏好 schema（system | Locale）、按系统语言解析、原生语言名与 Intl 标签，以及把源语言文案放宽为可翻译类型的 widen。
 * [POS]: shared/i18n 的语言边界，main（偏好/对话框/错误）、worker 与 renderer 共用同一解析规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { z } from 'zod'

export const locales = ['zh', 'en', 'ja', 'es', 'fr'] as const
export type Locale = typeof locales[number]
export const languageSchema = z.enum(['system', ...locales])
export type Language = z.infer<typeof languageSchema>

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
