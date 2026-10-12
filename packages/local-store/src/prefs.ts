/**
 * [INPUT]: A separate SQL driver, not the workspace file.
 * [OUTPUT]: Device preferences stored outside the workspace: language, columns, relation lines, parent order, celebration.
 * [POS]: Matches the desktop split. Workspace backup does not include this file.
 */
import type { Horizon, PeriodHorizon, SqlDriver } from './types'
import { horizons, periodHorizons } from './types'

export type LocaleId = 'zh' | 'en' | 'ja' | 'es' | 'fr'

export interface DevicePrefs {
  locale: LocaleId | null
  columns: Record<PeriodHorizon, boolean>
  later: boolean
  parentOrder: boolean
  relationLines: boolean
  showInsight: boolean
  celebration: Record<Horizon, boolean>
}

export function defaultPrefs(): DevicePrefs {
  return {
    locale: null,
    columns: { year: true, half: true, cycle: true, month: true, week: true, day: true },
    later: true,
    parentOrder: false,
    relationLines: true,
    showInsight: true,
    celebration: { later: false, year: true, half: true, cycle: true, month: true, week: true, day: false },
  }
}

export function readPrefs(driver: SqlDriver): DevicePrefs {
  const row = driver.prepare('SELECT value FROM prefs WHERE key=?').get('device')
  if (!row) return defaultPrefs()
  try {
    const parsed = JSON.parse(String(row.value)) as Partial<DevicePrefs>
    const base = defaultPrefs()
    return {
      locale: parsed.locale === 'zh' || parsed.locale === 'en' || parsed.locale === 'ja' || parsed.locale === 'es' || parsed.locale === 'fr' ? parsed.locale : null,
      columns: { ...base.columns, ...parsed.columns },
      later: parsed.later ?? base.later,
      parentOrder: parsed.parentOrder ?? base.parentOrder,
      relationLines: parsed.relationLines ?? base.relationLines,
      showInsight: parsed.showInsight ?? base.showInsight,
      celebration: { ...base.celebration, ...parsed.celebration },
    }
  } catch { return defaultPrefs() }
}

export function writePrefs(driver: SqlDriver, prefs: DevicePrefs): void {
  const value = JSON.stringify(prefs)
  driver.prepare('INSERT INTO prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('device', value)
  for (const horizon of horizons) if (typeof prefs.celebration[horizon] !== 'boolean') throw new Error('celebration')
  for (const horizon of periodHorizons) if (typeof prefs.columns[horizon] !== 'boolean') throw new Error('columns')
}
