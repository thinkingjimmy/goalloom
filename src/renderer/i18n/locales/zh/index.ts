/**
 * [INPUT]: Six Chinese calendar/app/smart/settings/shortcut/insight catalogs.
 * [OUTPUT]: Complete zh catalog and the shared type enforced by all other locales.
 * [POS]: Source-language entry loaded by renderer/i18n/index.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { calendarMessages } from './calendar'
import { messages } from './messages'
import { providerNames, smartMessages } from './smart'
import { settingsMessages } from './settings'
import { shortcutMessages, shortcutNames, shortcutNotes } from './shortcuts'
import { insightMessages } from './insight'

export const zh = { calendar: calendarMessages, messages, smart: smartMessages, providers: providerNames, settings: settingsMessages, shortcuts: shortcutMessages, shortcutNames, shortcutNotes, insight: insightMessages }
export type Catalog = typeof zh
