/**
 * [INPUT]: A zone id list (Intl.supportedValuesOf, or the bundled fallback), localized city names, and an instant for offsets.
 * [OUTPUT]: Case-insensitive matches, a friendly city label, a GMT label, and the pinned-current plus offset-sorted list. Does not write the workspace.
 * [POS]: Pure timezone search used by onboarding. No React Native.
 */
import type { LocaleId } from './prefs'
import { FALLBACK_ZONES, ZONE_CITIES } from './time-zone-data'

const MIN_IANA_ZONES = 100

/** Last path segment, with underscores written as spaces: America/New_York → New York. */
function zoneCity(id: string): string {
  const slash = id.lastIndexOf('/')
  const city = slash >= 0 ? id.slice(slash + 1) : id
  return city.replaceAll('_', ' ')
}

/** CLDR exemplar cities that differ from the id's own city, for every bundled locale. */
export function zoneLocalizedNames(id: string): string[] {
  const row = ZONE_CITIES[id]
  if (!row) return []
  return [...new Set(Object.values(row).filter((name): name is string => Boolean(name)))]
}

/** City in the active locale, or the zone's own city when no translation is bundled. */
export function friendlyZoneName(id: string, locale: LocaleId): string {
  return ZONE_CITIES[id]?.[locale] ?? zoneCity(id)
}

/**
 * Long timezone name from Intl ("新加坡标准时间"), when this runtime can produce one.
 * Returns null if the name is missing or just repeats the id.
 */
export function runtimeZoneName(id: string, locale: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZone: id, timeZoneName: 'long' }).formatToParts()
    const name = parts.find(part => part.type === 'timeZoneName')?.value
    if (!name || name === id) return null
    return name
  } catch {
    return null
  }
}

/**
 * Full IANA list. Uses Intl.supportedValuesOf('timeZone') when it returns a real catalog.
 * Hermes often lacks that key or throws; then the bundled snapshot is used.
 */
export function readTimeZones(read: () => readonly string[] = defaultSupportedTimeZones): string[] {
  try {
    const listed = read()
    if (listed.length >= MIN_IANA_ZONES) return [...new Set(listed)]
  } catch {
    // Unsupported key, or the method throws in this engine.
  }
  return [...FALLBACK_ZONES]
}

/**
 * Case-insensitive substring match on the zone id, the id with underscores as spaces,
 * the city name, and any localized names supplied by the caller.
 * An empty query returns every zone, in the original order.
 */
export function filterTimeZones(zones: readonly string[], query: string, namesOf: (id: string) => readonly string[]): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...zones]
  return zones.filter(id => haystack(id, namesOf(id)).includes(q))
}

/** Moves the current zone to the front when it is already in the list. */
export function pinCurrentZone(zones: readonly string[], current: string): string[] {
  const index = zones.indexOf(current)
  if (index <= 0) return [...zones]
  return [current, ...zones.slice(0, index), ...zones.slice(index + 1)]
}

/** Minutes east of UTC at `at`. Null when this runtime rejects the id. */
export function zoneOffsetMinutes(id: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: id, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at)
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
    const hourText = value('hour')
    const hour = hourText === '24' ? 0 : Number(hourText)
    let utc = Date.UTC(Number(value('year')), Number(value('month')) - 1, Number(value('day')), hour, Number(value('minute')), Number(value('second')))
    if (hourText === '24') utc += 24 * 60 * 60 * 1000
    return Math.round((utc - at.getTime()) / 60000)
  } catch {
    return null
  }
}

/** `GMT+8`, `GMT-5`, `GMT+5:30`, or `GMT+0`. Hours are not zero-padded. */
export function zoneOffsetLabel(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  const hours = Math.floor(abs / 60)
  const rest = abs % 60
  if (rest === 0) return `GMT${sign}${hours}`
  return `GMT${sign}${hours}:${String(rest).padStart(2, '0')}`
}

/** Ascending UTC offset, then zone id. Unknown offsets sort last. */
export function sortZonesByOffset(zones: readonly string[], at: Date): string[] {
  return [...zones].sort((a, b) => {
    const left = zoneOffsetMinutes(a, at)
    const right = zoneOffsetMinutes(b, at)
    if (left == null && right == null) return a.localeCompare(b)
    if (left == null) return 1
    if (right == null) return -1
    if (left !== right) return left - right
    return a.localeCompare(b)
  })
}

/**
 * The current zone stays in its own pinned row when the query still matches it.
 * Every other match is one flat list sorted by UTC offset, with no group headers.
 */
export function timeZonePickerList(
  zones: readonly string[],
  current: string,
  query: string,
  namesOf: (id: string) => readonly string[],
  at: Date,
): { pinned: string | null; rest: string[] } {
  const sorted = sortZonesByOffset(filterTimeZones(zones, query, namesOf), at)
  if (!sorted.includes(current)) return { pinned: null, rest: sorted }
  return { pinned: current, rest: sorted.filter(id => id !== current) }
}

/** First case-insensitive hit, keeping the original characters. An empty query highlights nothing. */
export function highlightSpans(text: string, query: string): { text: string; hit: boolean }[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [{ text, hit: false }]
  const index = text.toLowerCase().indexOf(needle)
  if (index < 0) return [{ text, hit: false }]
  const spans: { text: string; hit: boolean }[] = []
  if (index > 0) spans.push({ text: text.slice(0, index), hit: false })
  spans.push({ text: text.slice(index, index + needle.length), hit: true })
  const tail = text.slice(index + needle.length)
  if (tail) spans.push({ text: tail, hit: false })
  return spans
}

function haystack(id: string, names: readonly string[]): string {
  return [id, id.replaceAll('_', ' '), zoneCity(id), ...names].join('\n').toLowerCase()
}

function defaultSupportedTimeZones(): readonly string[] {
  const intl = Intl as { supportedValuesOf?: (key: 'timeZone') => readonly string[] }
  if (typeof intl.supportedValuesOf !== 'function') return []
  return intl.supportedValuesOf('timeZone')
}
