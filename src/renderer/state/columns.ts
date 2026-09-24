/**
 * [INPUT]: Canonical column order and device-local storage.
 * [OUTPUT]: Stable visible-column identities and controls that retain at least one column.
 * [POS]: Local renderer preference outside workspace history, exports and backups.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useMemo, useState } from 'react'
import { horizons, type ItemHorizon } from '../../shared/contracts/entities'

const key = 'goalloom.hiddenColumns'

function load(): ItemHorizon[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    const hidden = Array.isArray(value) ? horizons.filter(horizon => value.includes(horizon)) : []
    return hidden.length < horizons.length ? hidden : []
  } catch { return [] }
}

export interface Columns { visible: ItemHorizon[]; hiddenCount: number; toggle: (horizon: ItemHorizon) => void; showAll: () => void }

export function useColumns(): Columns {
  const [hidden, setHidden] = useState(load)
  const save = (next: ItemHorizon[]) => {
    setHidden(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Display preference only; the session keeps working without persistence. */ }
  }
  const visible = useMemo(() => horizons.filter(horizon => !hidden.includes(horizon)), [hidden])
  return {
    visible, hiddenCount: hidden.length,
    toggle: horizon => {
      if (hidden.includes(horizon)) save(hidden.filter(entry => entry !== horizon))
      else if (visible.length > 1) save([...hidden, horizon])
    },
    showAll: () => save([]),
  }
}
