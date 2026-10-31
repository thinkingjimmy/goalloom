/**
 * [INPUT]: Remote renderer settings and the local stores that own them.
 * [OUTPUT]: Live application of those settings, then a seed of local customizations the log does not already have.
 * [POS]: Renderer coordinator for settings sync. It does not emit while applying, and it does not upload untouched defaults.
 */
import { horizons, periodHorizons } from '../../shared/contracts/values'
import type { ItemHorizon } from '../../shared/contracts/entities'
import type { DevicePrefEntry } from '../../shared/contracts/runtime'
import { suppressDevicePrefs } from './device-pref-bus'
import { applyCelebration, celebrationDefaults, currentCelebration } from './celebration'
import { applyColumnsLater, applyColumnsPlanning, currentColumns } from './columns'
import { applyInsightReviews, applyInsightBreakpoints, applyInsightPrefs, defaultPrefs, insightSettings } from './insight'
import { applyParentOrder, currentParentOrder } from './parent-order'
import { applyCollapseCompleted, currentCollapseCompleted } from './completed-layout'
import { applyRelationLines, currentRelationLines } from './relation-lines'
import { applyShortcuts, currentShortcutOverrides } from './shortcuts'

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function isDefault(entry: DevicePrefEntry): boolean {
  if (entry.key === 'columns.later') return entry.value === true
  if (entry.key === 'columns.planning') return Array.isArray(entry.value) && sameList(entry.value, periodHorizons)
  if (entry.key === 'relationLines') return entry.value === true
  if (entry.key === 'shortcuts') return !!entry.value && typeof entry.value === 'object' && !Object.keys(entry.value).length
  if (entry.key === 'parentOrder') return entry.value === false
  if (entry.key === 'collapseCompleted') return entry.value === false
  if (entry.key === 'celebration') {
    const value = entry.value as Partial<Record<ItemHorizon, boolean>> | null
    return !!value && horizons.every(horizon => value[horizon] === celebrationDefaults[horizon])
  }
  if (entry.key === 'insight.prefs') return JSON.stringify(entry.value) === JSON.stringify(defaultPrefs)
  if (entry.key === 'insight.breakpoints' || entry.key === 'insight.reviews') return entry.value === true
  return true
}

function localEntries(): DevicePrefEntry[] {
  const columns = currentColumns()
  const insight = insightSettings()
  return [
    { key: 'columns.later', value: columns.laterOpen },
    { key: 'columns.planning', value: columns.planning },
    { key: 'relationLines', value: currentRelationLines() },
    { key: 'shortcuts', value: currentShortcutOverrides() },
    { key: 'parentOrder', value: currentParentOrder() },
    { key: 'collapseCompleted', value: currentCollapseCompleted() },
    { key: 'celebration', value: currentCelebration() },
    { key: 'insight.prefs', value: insight.prefs },
    { key: 'insight.breakpoints', value: insight.breakpoints },
    { key: 'insight.reviews', value: insight.reviews },
  ]
}

export function applyDevicePrefEntries(entries: DevicePrefEntry[]): void {
  for (const entry of entries) {
    if (entry.key === 'columns.later' && typeof entry.value === 'boolean') applyColumnsLater(entry.value)
    else if (entry.key === 'columns.planning' && Array.isArray(entry.value)) applyColumnsPlanning(entry.value.filter((horizon): horizon is typeof periodHorizons[number] => periodHorizons.some(item => item === horizon)))
    else if (entry.key === 'relationLines' && typeof entry.value === 'boolean') applyRelationLines(entry.value)
    else if (entry.key === 'shortcuts') applyShortcuts(entry.value)
    else if (entry.key === 'parentOrder' && typeof entry.value === 'boolean') applyParentOrder(entry.value)
    else if (entry.key === 'collapseCompleted' && typeof entry.value === 'boolean') applyCollapseCompleted(entry.value)
    else if (entry.key === 'celebration' && entry.value && typeof entry.value === 'object') applyCelebration(entry.value as Record<ItemHorizon, boolean>)
    else if (entry.key === 'insight.prefs' && entry.value && typeof entry.value === 'object') applyInsightPrefs(entry.value as typeof defaultPrefs)
    else if (entry.key === 'insight.breakpoints' && typeof entry.value === 'boolean') applyInsightBreakpoints(entry.value)
    else if (entry.key === 'insight.reviews' && typeof entry.value === 'boolean') applyInsightReviews(entry.value)
  }
}

/** Subscribes immediately, applies whatever the log already holds, and seeds customizations once sync is ready. */
export function startDevicePrefs(): () => void {
  const api = typeof window === 'undefined' ? undefined : window.goalloom
  if (!api) return () => {}
  let stopped = false
  let seeded = false
  const stopEvents = api.onDevicePrefs(entries => { void suppressDevicePrefs(() => { applyDevicePrefEntries(entries) }) })
  const seed = async () => {
    if (stopped || seeded) return
    seeded = true
    try {
      const remote = await api.pullDevicePrefs()
      if (stopped) return
      await suppressDevicePrefs(() => { applyDevicePrefEntries(remote) })
      const present = new Set(remote.map(entry => entry.key))
      for (const row of await api.pullDevicePrefs()) present.add(row.key)
      const entries = localEntries().filter(entry => !present.has(entry.key) && !isDefault(entry))
      if (entries.length) await api.reportDevicePrefs(entries, 'seed')
    } catch { seeded = false }
  }
  const stopSync = api.onSync(status => { if (status.phase === 'ready') void seed() })
  void api.sync({ type: 'status' }).then(reply => { if (reply.status.phase === 'ready') return seed() }).catch(() => undefined)
  return () => { stopped = true; stopEvents(); stopSync() }
}
