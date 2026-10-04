/**
 * [INPUT]: Device locale and the five server catalogs.
 * [OUTPUT]: Current server messages and synchronized lightweight wire-validation locale.
 * [POS]: Per-process language state; zh is eager, other catalogs load on demand; messages are resolved when produced, not cached across changes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Locale } from './locale'
import { zh, type ServerCatalog } from './catalogs/zh'
import { setValidationLocale } from './validation'

const catalogs: Partial<Record<Locale, ServerCatalog>> = { zh }
const loaders: Record<Locale, () => Promise<ServerCatalog>> = {
  zh: async () => zh,
  en: () => import('./catalogs/en').then(module => module.en),
  ja: () => import('./catalogs/ja').then(module => module.ja),
  es: () => import('./catalogs/es').then(module => module.es),
  fr: () => import('./catalogs/fr').then(module => module.fr),
}
let current: ServerCatalog = zh

export async function loadServerLocale(locale: Locale): Promise<void> {
  catalogs[locale] ??= await loaders[locale]()
  setServerLocale(locale)
}

export function setServerLocale(locale: Locale): void {
  current = catalogs[locale] ?? zh
  setValidationLocale(locale)
}
// Read at the moment a message is produced; never cache the result across a language change.
export function serverText(): ServerCatalog { return current }
