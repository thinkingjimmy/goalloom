/**
 * [INPUT]: 本目录四个英文分册，依赖 ../zh 的 Catalog 类型。
 * [OUTPUT]: en 完整 Catalog；缺键即类型错误。
 * [POS]: renderer/i18n/locales 的英文入口，与 zh 同构，被 i18n/index 装载。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { Catalog } from '../zh'
import { messages } from './messages'
import { providerNames, smartMessages } from './smart'
import { settingsMessages } from './settings'
import { shortcutMessages, shortcutNames, shortcutNotes } from './shortcuts'

export const en: Catalog = { messages, smart: smartMessages, providers: providerNames, settings: settingsMessages, shortcuts: shortcutMessages, shortcutNames, shortcutNotes }
