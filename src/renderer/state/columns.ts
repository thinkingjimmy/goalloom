/**
 * [INPUT]: 共享契约的看板列顺序、renderer 本机 localStorage。
 * [OUTPUT]: useColumns：可见列（保持看板顺序）、切换单列、全部显示；至少保留一列。
 * [POS]: renderer/state 的本机显示偏好；不进入工作区数据、历史、导出或备份，读写失败时退回全部显示。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useState } from 'react'
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
  const visible = horizons.filter(horizon => !hidden.includes(horizon))
  return {
    visible, hiddenCount: hidden.length,
    toggle: horizon => {
      if (hidden.includes(horizon)) save(hidden.filter(entry => entry !== horizon))
      else if (visible.length > 1) save([...hidden, horizon])
    },
    showAll: () => save([]),
  }
}
