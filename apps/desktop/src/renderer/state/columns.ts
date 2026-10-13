/**
 * [INPUT]: Canonical column order and independent device-local Later/planning preferences.
 * [OUTPUT]: Persisted visibility controls, canonical visible columns and an at-least-one planning-column guard.
 * [POS]: Local renderer preference outside workspace history, exports and backups.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { horizons, periodHorizons } from '../../shared/contracts/values'
import type { ItemHorizon } from '../../shared/contracts/entities'
import type { Horizon } from '../../domain/calendar'

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

export interface Columns {
  visible: ItemHorizon[]; laterOpen: boolean
  setLaterOpen: (open: boolean) => void
  setVisible: (horizon: Horizon, visible: boolean) => void
}

export function useColumns(): Columns {
  const [laterOpen, setOpen] = useState(loadLater), [planning, setPlanning] = useState(loadPlanning)
  useEffect(() => { save(planningKey, planning) }, [planning])
  const setLaterOpen = useCallback((open: boolean) => {
    setOpen(open)
    save(laterKey, open ? [] : ['later'])
  }, [])
  const setVisible = useCallback((horizon: Horizon, visible: boolean) => {
    setPlanning(previous => {
      if (previous.includes(horizon) === visible || !visible && previous.length === 1) return previous
      return periodHorizons.filter(entry => entry === horizon ? visible : previous.includes(entry))
    })
  }, [])
  const visible = useMemo(() => horizons.filter(horizon => horizon === 'later' ? laterOpen : planning.includes(horizon)), [laterOpen, planning])
  return { visible, laterOpen, setLaterOpen, setVisible }
}
