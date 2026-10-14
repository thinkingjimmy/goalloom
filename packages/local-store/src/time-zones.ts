/**
 * [INPUT]: A zone id list (Intl.supportedValuesOf, or the bundled fallback) and localized city names.
 * [OUTPUT]: Case-insensitive matches and a friendly city label. Does not write the workspace.
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

function haystack(id: string, names: readonly string[]): string {
  return [id, id.replaceAll('_', ' '), zoneCity(id), ...names].join('\n').toLowerCase()
}

function defaultSupportedTimeZones(): readonly string[] {
  const intl = Intl as { supportedValuesOf?: (key: 'timeZone') => readonly string[] }
  if (typeof intl.supportedValuesOf !== 'function') return []
  return intl.supportedValuesOf('timeZone')
}
