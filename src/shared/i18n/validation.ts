/**
 * [INPUT]: The device-selected locale, synchronized per process and preload bridge.
 * [OUTPUT]: Five small catalogs for wire-validation errors, shared with server catalogs.
 * [POS]: Avoids pulling domain/server messages into the sandboxed preload bundle.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Locale } from './locale'

interface ValidationCatalog { invalidDate: string; invalidCalendarConfig: string; missingPreference: string }
export const validationCatalogs: Record<Locale, ValidationCatalog> = {
  zh: { invalidDate: '日期无效', invalidCalendarConfig: '日历配置无效', missingPreference: '缺少外观偏好' },
  en: { invalidDate: 'Invalid date', invalidCalendarConfig: 'Invalid calendar configuration', missingPreference: 'Appearance preference is missing' },
  ja: { invalidDate: '日付が無効です', invalidCalendarConfig: 'カレンダーの設定が無効です', missingPreference: '外観の設定がありません' },
  es: { invalidDate: 'Fecha no válida', invalidCalendarConfig: 'Configuración del calendario no válida', missingPreference: 'Faltan las preferencias de apariencia' },
  fr: { invalidDate: 'Date non valide', invalidCalendarConfig: 'Configuration du calendrier non valide', missingPreference: 'Préférence d’apparence manquante' },
}
let current = validationCatalogs.zh
export function setValidationLocale(locale: Locale): void { current = validationCatalogs[locale] }
export function validationText(): ValidationCatalog { return current }
