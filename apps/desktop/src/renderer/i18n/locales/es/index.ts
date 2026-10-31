/**
 * [INPUT]: Localized renderer sections, calendar messages and the Chinese Catalog type.
 * [OUTPUT]: Complete Spanish Catalog with compile-time key validation.
 * [POS]: es locale entry assembled by renderer/i18n; mirrors the shared catalog contract.
 */
import type { Catalog } from '../zh'
import { calendarMessages } from './calendar'
import { messages } from './messages'
import { providerNames, smartMessages } from './smart'
import { settingsMessages } from './settings'
import { shortcutMessages, shortcutNames, shortcutNotes } from './shortcuts'
import { insightMessages } from './insight'

export const es: Catalog = { calendar: calendarMessages, messages, smart: smartMessages, providers: providerNames, settings: settingsMessages, shortcuts: shortcutMessages, shortcutNames, shortcutNotes, insight: insightMessages }
