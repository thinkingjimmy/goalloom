/**
 * [INPUT]: Device locale and the five server catalogs.
 * [OUTPUT]: Current server messages and synchronized lightweight wire-validation locale.
 * [POS]: Per-process language state; messages are resolved when produced, not cached across changes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Locale } from './locale'
import { zh, type ServerCatalog } from './catalogs/zh'
import { en } from './catalogs/en'
import { ja } from './catalogs/ja'
import { es } from './catalogs/es'
import { fr } from './catalogs/fr'
import { setValidationLocale } from './validation'

const catalogs: Record<Locale, ServerCatalog> = { zh, en, ja, es, fr }
let current: ServerCatalog = zh

export function setServerLocale(locale: Locale): void { current = catalogs[locale]; setValidationLocale(locale) }
// Read at the moment a message is produced; never cache the result across a language change.
export function serverText(): ServerCatalog { return current }
