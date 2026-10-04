/**
 * [INPUT]: Shared locale/server catalogs, the eager Chinese renderer catalog and on-demand en/ja/es/fr catalogs.
 * [OUTPUT]: Live calendar/app/smart/settings/insight/shortcut text, seven horizon names and locale controls.
 * [POS]: Renderer text boundary; in-place catalog updates preserve drafts, undo and open dialogs. Unused locales stay out of the first board parse.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useSyncExternalStore } from 'react'
import type { ItemHorizon } from '../../shared/contracts/entities'
import { intlTags, type Locale } from '../../shared/i18n/locale'
import { loadServerLocale } from '../../shared/i18n/server'
import { zh, type Catalog } from './locales/zh'

const loaders: Record<Locale, () => Promise<Catalog>> = {
  zh: async () => zh,
  en: () => import('./locales/en').then(module => module.en),
  ja: () => import('./locales/ja').then(module => module.ja),
  es: () => import('./locales/es').then(module => module.es),
  fr: () => import('./locales/fr').then(module => module.fr),
}
const loaded: Partial<Record<Locale, Catalog>> = { zh }

// Components read these at render time; setLocale swaps their contents in place, so no import ever goes stale.
export const calendarMessages = { ...zh.calendar }
export const messages = { ...zh.messages }
export const smartMessages = { ...zh.smart }
export const providerNames = { ...zh.providers }
export const settingsMessages = { ...zh.settings }
export const shortcutMessages = { ...zh.shortcuts }
export const shortcutNames = { ...zh.shortcutNames }
export const shortcutNotes: Catalog['shortcutNotes'] = { ...zh.shortcutNotes }
export const insightMessages = { ...zh.insight }
export const horizonNames = {} as Record<ItemHorizon, string>
export const activityNames: Record<string, string> = {}
export const statusNames = {} as Record<'todo' | 'done' | 'cancelled', string>
export type MessageCatalog = Catalog['messages']

let locale: Locale = 'zh'
const listeners = new Set<() => void>()

function replace<T extends object>(target: T, source: T): void {
  for (const key of Object.keys(target)) if (!(key in source)) delete target[key as keyof T]
  Object.assign(target, source)
}
function apply(catalog: Catalog): void {
  replace(calendarMessages, catalog.calendar); replace(messages, catalog.messages); replace(smartMessages, catalog.smart); replace(providerNames, catalog.providers)
  replace(settingsMessages, catalog.settings); replace(shortcutMessages, catalog.shortcuts)
  replace(shortcutNames, catalog.shortcutNames); replace(shortcutNotes, catalog.shortcutNotes); replace(insightMessages, catalog.insight)
  const m = catalog.messages
  Object.assign(horizonNames, { later: 'Later', year: catalog.calendar.year, half: catalog.calendar.half, cycle: m.cycle, month: m.month, week: m.week, day: m.day })
  Object.assign(activityNames, { created: m.create, baseline: m.baseline, moved: m.move, rolled_over: m.rollover, status_changed: m.statusChanged, archived: m.archive, unarchived: m.unarchive, deleted: m.delete, item_restored: m.restoreItem, undo: m.undo })
  Object.assign(statusNames, { todo: m.todo, done: m.done, cancelled: m.cancelled })
}
apply(zh)

async function catalogFor(next: Locale): Promise<Catalog> {
  return loaded[next] ??= await loaders[next]()
}

export async function setLocale(next: Locale): Promise<void> {
  if (next === locale && document.documentElement.lang === intlTags[next]) return
  const catalog = await catalogFor(next)
  await loadServerLocale(next)
  locale = next
  apply(catalog)
  document.documentElement.lang = intlTags[next]
  for (const listener of listeners) listener()
}
export function currentLocale(): Locale { return locale }
function subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener) } }
/** Subscribing re-renders the caller (and its subtree) whenever the language changes. */
export function useLocale(): Locale { return useSyncExternalStore(subscribe, currentLocale) }
