/**
 * [INPUT]: Canonical column order and device-local storage.
 * [OUTPUT]: Persisted Later visibility with all four planning columns always shown.
 * [POS]: Local renderer preference outside workspace history, exports and backups.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useMemo, useState } from 'react'
import { horizons } from '../../shared/contracts/values'
import type { ItemHorizon } from '../../shared/contracts/entities'

const key = 'goalloom.hiddenColumns'

function load(): boolean {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return !Array.isArray(value) || !value.includes('later')
  } catch { return true }
}

export interface Columns {
  visible: ItemHorizon[]; laterOpen: boolean
  setLaterOpen: (open: boolean) => void
}

export function useColumns(): Columns {
  const [laterOpen, setOpen] = useState(load)
  const setLaterOpen = (open: boolean) => {
    setOpen(open)
    try { localStorage.setItem(key, JSON.stringify(open ? [] : ['later'])) } catch { /* Display preference only; the session keeps working without persistence. */ }
  }
  const visible = useMemo(() => horizons.filter(horizon => horizon !== 'later' || laterOpen), [laterOpen])
  return { visible, laterOpen, setLaterOpen }
}
