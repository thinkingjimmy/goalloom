/**
 * [INPUT]: Localized renderer sections, calendar messages and the Chinese Catalog type.
 * [OUTPUT]: Complete Japanese Catalog with compile-time key validation.
 * [POS]: ja locale entry assembled by renderer/i18n; mirrors the shared catalog contract.
 */
import type { Catalog } from '../zh'
import { calendarMessages } from './calendar'
import { messages } from './messages'
import { providerNames, smartMessages } from './smart'
import { settingsMessages } from './settings'
import { shortcutMessages, shortcutNames, shortcutNotes } from './shortcuts'
import { insightMessages } from './insight'

export const ja: Catalog = { calendar: calendarMessages, messages, smart: smartMessages, providers: providerNames, settings: settingsMessages, shortcuts: shortcutMessages, shortcutNames, shortcutNotes, insight: insightMessages }
