/**
 * [INPUT]: Authoritative current snapshot, visible columns and explicit period selections.
 * [OUTPUT]: Generation-scoped planning views retaining hidden future selections, atomic return from past selections, parent-order projections, revision-bound materialization and shared candidates/locate requests.
 * [POS]: Board view state; current snapshots and closed-period history keep their independent read paths.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { compareInstants } from '../../domain/calendar'
import type { ItemHorizon, ItemSummary, PlanningPeriod } from '../../shared/contracts/entities'
import type { BoardPeriods, Snapshot } from '../../shared/contracts/queries'
import { desktopApi } from './use-workspace'
import { buildParentOrder } from '../../domain/parent-order'
import { finishParentOrder, useParentOrder } from './parent-order'
import { periodHorizons } from '../../shared/contracts/values'

type Selection = Partial<Record<ItemHorizon, PlanningPeriod>>
const empty: Selection = {}
export type PeriodMode = 'current' | 'future' | 'history'

export function useBoardPeriods(snapshot: Snapshot | null, columns: ItemHorizon[]) {
  const ordering = useParentOrder()
  const generation = snapshot?.workspace.generation ?? '', revision = snapshot?.workspace.revision ?? 0, observedAt = snapshot?.observedAt
  const [selected, setSelected] = useState<{ generation: string; periods: Selection }>({ generation, periods: {} })
  const selection = selected.generation === generation ? selected.periods : empty
  const [loaded, setLoaded] = useState<{ key: string; selectionKey: string; data: BoardPeriods | null; failed: boolean }>({ key: '', selectionKey: '', data: null, failed: false })
  const [attempt, setAttempt] = useState(0)
  const [locating, setLocating] = useState<{ generation: string; id: string; seq: number } | null>(null)
  const periods = useMemo(() => Object.fromEntries((snapshot?.periods ?? []).map(current => [current.horizon, selection[current.horizon] ?? current])) as Selection, [snapshot?.periods, selection])
  const mode = (horizon: ItemHorizon): PeriodMode => {
    const period = periods[horizon], current = snapshot?.periods.find(value => value.horizon === horizon)
    if (!period || period.id === current?.id) return 'current'
    return compareInstants(period.endAt, snapshot!.observedAt) <= 0 ? 'history' : 'future'
  }
  const requested = periodHorizons.filter(horizon => mode(horizon) === 'future').map(horizon => periods[horizon]!)
  const selectionKey = `${generation}:${requested.map(period => period.id).join('|')}`
  const key = `${selectionKey}:${revision}:${attempt}`
  const requestJson = JSON.stringify(requested.map(({ horizon, startDate }) => ({ horizon, startDate })))
  useEffect(() => {
    if (!generation || requestJson === '[]') return
    let active = true
    void desktopApi().getBoardPeriods({ type: 'boardPeriods', generation, periods: JSON.parse(requestJson) })
      .then(data => { if (active && data.generation === generation && data.revision >= revision) setLoaded({ key, selectionKey, data, failed: false }) })
      .catch(() => { if (active) setLoaded(previous => ({ key, selectionKey, data: previous.selectionKey === selectionKey ? previous.data : null, failed: true })) })
    return () => { active = false }
  }, [key, requestJson, generation])
  // A future view becoming current starts following the live calendar, just like the default board.
  useEffect(() => {
    setSelected(previous => {
      if (previous.generation !== generation) return { generation, periods: {} }
      const next = { ...previous.periods }
      let changed = false
      for (const current of snapshot?.periods ?? []) if (next[current.horizon]?.id === current.id) { delete next[current.horizon]; changed = true }
      return changed ? { generation, periods: next } : previous
    })
  }, [generation, snapshot?.periods])
  const fresh = loaded.key === key
  const failed = fresh && loaded.failed
  const data = loaded.selectionKey === selectionKey ? loaded.data : null
  const loading = (horizon: ItemHorizon) => mode(horizon) === 'future' && columns.includes(horizon) && !fresh
  const rawItems = useMemo(() => {
    const current = (snapshot?.items ?? []).filter(item => !selection[item.placement.horizon] || selection[item.placement.horizon]?.id === item.placement.periodId)
    const live = new Map((snapshot?.items ?? []).map(item => [item.id, item]))
    const future = (data?.items ?? []).filter(item => periods[item.placement.horizon]?.id === item.placement.periodId && !live.has(item.id))
    return [...current, ...future]
  }, [snapshot?.items, selection, periods, data])
  const orderNodes = useMemo(() => {
    const sources = data && data.revision > revision ? [snapshot?.orderNodes ?? [], data.orderNodes] : [data?.orderNodes ?? [], snapshot?.orderNodes ?? []]
    return [...new Map(sources.flat().map(node => [node.id, node])).values()]
  }, [snapshot?.orderNodes, data, revision])
  const order = useMemo(() => buildParentOrder(orderNodes, snapshot?.relations ?? [], snapshot?.observedAt ?? ''), [orderNodes, snapshot?.relations, snapshot?.observedAt])
  const parentOrder = ordering.enabled || ordering.pending?.generation === generation
  const items = useMemo(() => parentOrder ? order.sort(rawItems) : rawItems, [rawItems, order, parentOrder])
  useEffect(() => { finishParentOrder(generation, revision, requested.length === 0 || fresh && !failed) }, [generation, revision, fresh, failed, requestJson, ordering.pending])
  const candidates = useMemo(() => {
    const combined = [...new Map([...(snapshot?.items ?? []), ...items].map(item => [item.id, item])).values()]
    return parentOrder ? order.sort(combined) : combined
  }, [snapshot?.items, items, parentOrder, order])
  const choose = useCallback((horizon: ItemHorizon, period: PlanningPeriod | null) => {
    setSelected(previous => {
      const next = previous.generation === generation ? { ...previous.periods } : {}
      if (period) next[horizon] = period; else delete next[horizon]
      return { generation, periods: next }
    })
  }, [generation])
  const returnPastToCurrent = useCallback(() => {
    if (!observedAt) return
    setSelected(previous => {
      if (previous.generation !== generation) return previous
      const next = { ...previous.periods }
      let changed = false
      for (const period of Object.values(next)) if (compareInstants(period.endAt, observedAt) <= 0) {
        delete next[period.horizon]
        changed = true
      }
      return changed ? { generation, periods: next } : previous
    })
  }, [generation, observedAt])
  const locate = (item: Pick<ItemSummary, 'id' | 'placement'>, period: PlanningPeriod | null) => {
    const current = snapshot?.periods.find(value => value.horizon === item.placement.horizon)
    choose(item.placement.horizon, period?.id === current?.id ? null : period)
    setLocating(previous => ({ generation, id: item.id, seq: (previous?.seq ?? 0) + 1 }))
  }
  const finishLocate = useCallback((seq: number) => setLocating(previous => previous?.seq === seq ? null : previous), [])
  return { periods, mode, items, rawItems, order, orderNodes, parentOrder, candidates, loading, failed, retry: () => setAttempt(value => value + 1), choose, returnPastToCurrent, locate, finishLocate, locating: locating?.generation === generation ? locating : null }
}

export type BoardView = ReturnType<typeof useBoardPeriods>
