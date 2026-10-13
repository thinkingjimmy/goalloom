/**
 * [INPUT]: Canonical column order and Later/planning preferences.
 * [OUTPUT]: Persisted visibility controls, canonical visible columns and an at-least-one planning-column guard.
 * [POS]: Renderer column visibility. The choice syncs; it stays out of task history, exports and backups.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { horizons, periodHorizons } from '../../shared/contracts/values'
import type { ItemHorizon } from '../../shared/contracts/entities'
import type { Horizon } from '../../domain/calendar'
import { noteDevicePref } from './device-pref-bus'

const laterKey = 'goalloom.hiddenColumns', planningKey = 'goalloom.visiblePlanningColumns'

function loadLater(): boolean {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(laterKey) ?? '[]')
    return !Array.isArray(value) || !value.includes('later')
  } catch { return true }
}

function loadPlanning(): Horizon[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(planningKey) ?? 'null')
    if (Array.isArray(value) && value.length && value.every(entry => periodHorizons.some(horizon => horizon === entry))) {
      return periodHorizons.filter(horizon => value.includes(horizon))
    }
  } catch { /* Malformed preferences fall back to the complete board. */ }
  return [...periodHorizons]
}

function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Display preferences remain usable for this session. */ }
}

let laterOpen = loadLater()
let planning = loadPlanning()
const listeners = new Set<() => void>()
const emit = () => { for (const listener of listeners) listener() }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

function persistLater(open: boolean, report: boolean) {
  laterOpen = open
  save(laterKey, open ? [] : ['later'])
  emit()
  if (report) noteDevicePref('columns.later', open)
}

function persistPlanning(next: Horizon[], report: boolean) {
  planning = next
  save(planningKey, next)
  emit()
  if (report) noteDevicePref('columns.planning', next)
}

export function currentColumns(): { laterOpen: boolean; planning: Horizon[] } {
  return { laterOpen, planning }
}

export function applyColumnsLater(open: boolean): void {
  if (laterOpen !== open) persistLater(open, false)
}

export function applyColumnsPlanning(next: readonly Horizon[]): void {
  const normalized = periodHorizons.filter(horizon => next.includes(horizon))
  if (!normalized.length || normalized.join() === planning.join()) return
  persistPlanning(normalized, false)
}

export interface Columns {
  visible: ItemHorizon[]; laterOpen: boolean
  setLaterOpen: (open: boolean) => void
  setVisible: (horizon: Horizon, visible: boolean) => void
}

export function useColumns(): Columns {
  const later = useSyncExternalStore(subscribe, () => laterOpen)
  const plan = useSyncExternalStore(subscribe, () => planning)
  const setLaterOpen = useCallback((open: boolean) => { if (laterOpen !== open) persistLater(open, true) }, [])
  const setVisible = useCallback((horizon: Horizon, visible: boolean) => {
    if (planning.includes(horizon) === visible || !visible && planning.length === 1) return
    persistPlanning(periodHorizons.filter(entry => entry === horizon ? visible : planning.includes(entry)), true)
  }, [])
  const visible = useMemo(() => horizons.filter(horizon => horizon === 'later' ? later : plan.includes(horizon)), [later, plan])
  return { visible, laterOpen: later, setLaterOpen, setVisible }
}
