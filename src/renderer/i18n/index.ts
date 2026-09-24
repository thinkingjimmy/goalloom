/**
 * [INPUT]: shared/i18n 的 Locale 与服务端文案切换；locales/* 五种语言的完整 Catalog；React useSyncExternalStore。
 * [OUTPUT]: 当前语言的实时文案视图（messages、smartMessages、settingsMessages、shortcut*、providerNames、horizon/activity/status 名称）、setLocale/currentLocale/useLocale 与固定模型名。
 * [POS]: renderer 唯一文案入口；原地替换视图内容实现即时切换，不重挂载组件，草稿、撤销栈与打开的弹窗保留。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useSyncExternalStore } from 'react'
import type { ItemHorizon } from '../../shared/contracts/entities'
import type { JevProvider } from '../../shared/contracts/smart-input'
import { intlTags, type Locale } from '../../shared/i18n/locale'
import { setServerLocale } from '../../shared/i18n/server'
import { zh, type Catalog } from './locales/zh'
import { en } from './locales/en'
import { ja } from './locales/ja'
import { es } from './locales/es'
import { fr } from './locales/fr'

const catalogs: Record<Locale, Catalog> = { zh, en, ja, es, fr }

// Components read these at render time; setLocale swaps their contents in place, so no import ever goes stale.
export const messages = { ...zh.messages }
export const smartMessages = { ...zh.smart }
export const providerNames = { ...zh.providers }
export const settingsMessages = { ...zh.settings }
export const shortcutMessages = { ...zh.shortcuts }
export const shortcutNames = { ...zh.shortcutNames }
export const shortcutNotes: Catalog['shortcutNotes'] = { ...zh.shortcutNotes }
export const horizonNames = {} as Record<ItemHorizon, string>
export const activityNames: Record<string, string> = {}
export const statusNames = {} as Record<'todo' | 'done' | 'cancelled', string>
export const providerModels: Record<JevProvider, string> = { typesafe: 'jev-latest', 'vercel-gateway': 'typesafe-ai/jev' }
export type MessageCatalog = Catalog['messages']

let locale: Locale = 'zh'
const listeners = new Set<() => void>()

function replace<T extends object>(target: T, source: T): void {
  for (const key of Object.keys(target)) if (!(key in source)) delete target[key as keyof T]
  Object.assign(target, source)
}
function apply(catalog: Catalog): void {
  replace(messages, catalog.messages); replace(smartMessages, catalog.smart); replace(providerNames, catalog.providers)
  replace(settingsMessages, catalog.settings); replace(shortcutMessages, catalog.shortcuts)
  replace(shortcutNames, catalog.shortcutNames); replace(shortcutNotes, catalog.shortcutNotes)
  const m = catalog.messages
  Object.assign(horizonNames, { later: 'Later', cycle: m.cycle, month: m.month, week: m.week, day: m.day })
  Object.assign(activityNames, { created: m.create, baseline: m.baseline, moved: m.move, rolled_over: m.rollover, status_changed: m.statusChanged, archived: m.archive, unarchived: m.unarchive, deleted: m.delete, item_restored: m.restoreItem, undo: m.undo })
  Object.assign(statusNames, { todo: m.todo, done: m.done, cancelled: m.cancelled })
}
apply(zh)

export function setLocale(next: Locale): void {
  if (next === locale && document.documentElement.lang === intlTags[next]) return
  locale = next
  apply(catalogs[next])
  setServerLocale(next)
  document.documentElement.lang = intlTags[next]
  for (const listener of listeners) listener()
}
export function currentLocale(): Locale { return locale }
function subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener) } }
/** Subscribing re-renders the caller (and its subtree) whenever the language changes. */
export function useLocale(): Locale { return useSyncExternalStore(subscribe, currentLocale) }
