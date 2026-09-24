/**
 * [INPUT]: 本目录四个中文分册。
 * [OUTPUT]: zh 完整 Catalog 与其类型；其他语言必须实现同一 Catalog，缺键即类型错误。
 * [POS]: renderer/i18n/locales 的源语言入口，被 i18n/index 装载。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { messages } from './messages'
import { providerNames, smartMessages } from './smart'
import { settingsMessages } from './settings'
import { shortcutMessages, shortcutNames, shortcutNotes } from './shortcuts'

export const zh = { messages, smart: smartMessages, providers: providerNames, settings: settingsMessages, shortcuts: shortcutMessages, shortcutNames, shortcutNotes }
export type Catalog = typeof zh
