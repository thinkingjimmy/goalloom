/**
 * [INPUT]: Snapshot, board view, flows, the filtered flow, visible columns, insight readiness, guarded submission and a composer-seed opener.
 * [OUTPUT]: The breakpoint layer inside `.board`: a ＋ on the column rule beside each gap parent (flow colour) and skip parent (amber);
 *           click drafts one title and creates it (create / insertBetween), ⇧-click or no model opens the prefilled composer;
 *           a next-period creation leaves a destination pill; the first sighting shows a one-time guide.
 * [POS]: features/insight overlay mounted by Board only under a single-flow filter; shares the finite row-motion pulse with RelationLines.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import type { ItemHorizon, ItemSummary, PlanningPeriod } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import { insightMessages as t } from '../../i18n'
import type { Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import type { BoardView } from '../../state/board-periods'
import { updateInsight, useInsightSettings } from '../../state/insight'
import { flowStroke } from '../../lib/colors'
import { planningLabel } from '../../lib/periods'
import { Icon } from '../../components/icons'
import { breakpoints, type ChildHorizon } from './signals'
import { decompose, type Seed } from './decompose'
import './insight.css'
import { boardIsMoving, boardMotionEvent } from '../board/RowMotion'

interface Spot { key: string; kind: 'gap' | 'skip'; parent: ItemSummary; target: ChildHorizon; children: ItemSummary[]; color: string }
interface Place { x: number; y: number }
const firstLine = 40

export function Breakpoints({ snapshot, view, flows, filter, columns, ready, submit, seed }: {
  snapshot: Snapshot; view: BoardView; flows: Flows; filter: string; columns: ItemHorizon[]; ready: boolean
  submit: (action: Action) => Promise<unknown>; seed: (seed: Seed) => void
}) {
  const settings = useInsightSettings()
  const root = useRef<HTMLDivElement>(null)
  const [places, setPlaces] = useState<Map<string, Place>>(new Map())
  const [pending, setPending] = useState<string | null>(null)
  // Session-only: a step created into the next period is not in this column, so the gap keeps a pointer to it.
  const [sent, setSent] = useState<Map<string, { title: string; period: PlanningPeriod; horizon: ChildHorizon }>>(new Map())
  const flow = flows.all.find(value => value.id === filter)
  const spots = useMemo<Spot[]>(() => {
    const found = breakpoints(snapshot, flows, filter, columns, view.mode)
    const color = flow ? flowStroke(flow.flowColor) : 'currentColor'
    return [...found.gaps.map(gap => ({ key: `gap:${gap.parent.id}`, kind: 'gap' as const, parent: gap.parent, target: gap.target, children: [], color })),
      ...found.skips.map(skip => ({ key: `skip:${skip.parent.id}`, kind: 'skip' as const, parent: skip.parent, target: 'week' as const, children: skip.children, color: 'var(--insight-skip)' }))]
  }, [snapshot, flows, filter, columns, view.mode, flow])
  const latest = useRef(spots); latest.current = spots

  const measure = (moving = false) => {
    const overlay = root.current, board = overlay?.parentElement
    if (!overlay || !board) return
    const origin = board.getBoundingClientRect(), dx = board.scrollLeft - origin.left, dy = -origin.top
    const next = new Map<string, Place>()
    for (const spot of latest.current) {
      const row = document.getElementById(`item-${spot.parent.id}`), content = row?.closest('.column-content')
      if (!row || !content || !board.contains(row)) continue
      const r = row.getBoundingClientRect(), c = content.getBoundingClientRect(), mid = r.top + Math.min(r.height, firstLine) / 2
      if (mid < c.top || mid > c.bottom) continue
      // Rows sit 8px inside the column rule; the ＋ rides on the rule so it never covers the next column's rows.
      next.set(spot.key, { x: r.right + 8 + dx, y: mid + dy })
    }
    for (const node of root.current?.querySelectorAll<HTMLElement>('[data-spot-key]') ?? []) {
      const place = next.get(node.dataset.spotKey!)
      node.style.visibility = place ? '' : 'hidden'
      if (place) {
        const guide = node.classList.contains('breakpoint-guide')
        node.style.left = `${place.x - (guide ? 12 : 9)}px`
        node.style.top = `${place.y + (guide ? 20 : node.classList.contains('breakpoint-away') ? -12 : -9)}px`
      }
    }
    if (!moving) setPlaces(previous => JSON.stringify([...previous]) === JSON.stringify([...next]) ? previous : next)
  }
  const measureRef = useRef(measure); measureRef.current = measure
  useLayoutEffect(() => {
    const overlay = root.current, board = overlay?.parentElement
    if (!overlay || !board) return
    let frame = 0
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; measureRef.current(boardIsMoving(board)) }) }
    const mutations = new MutationObserver(records => { if (records.some(record => !overlay.contains(record.target))) schedule() })
    mutations.observe(board, { childList: true, subtree: true })
    const resize = new ResizeObserver(schedule)
    resize.observe(board)
    board.addEventListener('scroll', schedule, { capture: true, passive: true })
    board.addEventListener('transitionend', schedule)
    const motion = () => measureRef.current(boardIsMoving(board))
    board.addEventListener(boardMotionEvent, motion)
    measureRef.current()
    return () => { cancelAnimationFrame(frame); mutations.disconnect(); resize.disconnect(); board.removeEventListener('scroll', schedule, { capture: true }); board.removeEventListener('transitionend', schedule); board.removeEventListener(boardMotionEvent, motion) }
  }, [])
  // React may commit an earlier geometry read after FLIP has installed its inverse transform.
  useLayoutEffect(() => {
    const board = root.current?.parentElement
    measureRef.current(!!board && boardIsMoving(board))
  })

  const open = async (spot: Spot, event: MouseEvent) => {
    if (pending) return
    if (!settings.onboarded) updateInsight(value => ({ ...value, onboarded: true }))
    setPending(spot.key)
    try {
      await decompose({ snapshot, flows, ready, submit, seed }, { parent: spot.parent, target: spot.target, children: spot.children, manual: event.shiftKey,
        onCreated: (title, period, next) => { if (next && spot.kind === 'gap') setSent(previous => new Map(previous).set(spot.parent.id, { title, period, horizon: spot.target })) } })
    } finally { setPending(null) }
  }

  const guide = !settings.onboarded ? spots.find(spot => places.has(spot.key)) : undefined
  return <div ref={root} className="breakpoints">
    {spots.map(spot => {
      const place = places.get(spot.key)
      if (!place) return null
      const away = spot.kind === 'gap' ? sent.get(spot.parent.id) : undefined
      if (away) return <button key={spot.key} data-spot-key={spot.key} type="button" className="breakpoint-away" style={{ left: place.x - 9, top: place.y - 12, '--node': spot.color } as CSSProperties}
        aria-label={t.openDestination(planningLabel(away.period, snapshot.workspace.calendar!, snapshot.observedAt))}
        onClick={() => view.choose(away.horizon, away.period)}>{t.destination(planningLabel(away.period, snapshot.workspace.calendar!, snapshot.observedAt), away.title)}<Icon name="next" size={12} /></button>
      const label = spot.kind === 'skip' ? t.bridgeLabel(spot.parent.title, spot.children.length) : t.nodeLabel(spot.parent.title)
      return <button key={spot.key} data-spot-key={spot.key} type="button" className="breakpoint" data-kind={spot.kind} data-pending={pending === spot.key} data-guided={guide?.key === spot.key}
        style={{ left: place.x - 9, top: place.y - 9, '--node': spot.color } as CSSProperties} aria-label={label} title={`${label}\n${t.nodeTip}`}
        disabled={!!pending} onClick={event => void open(spot, event)}>
        <Icon name="add" size={12} strokeWidth={2.2} />
      </button>
    })}
    {guide && places.get(guide.key) && <div data-spot-key={guide.key} className="breakpoint-guide" role="note" style={{ left: places.get(guide.key)!.x - 12, top: places.get(guide.key)!.y + 20 }}>
      <p className="breakpoint-guide-kicker">{t.onboardKicker}</p>
      <p className="breakpoint-guide-title">{t.onboardTitle}</p>
      <p>{t.onboardBody}</p>
      <ul><li data-kind="gap">{t.onboardGap}</li><li data-kind="skip">{t.onboardSkip}</li></ul>
      <button type="button" className="settings-button" onClick={() => updateInsight(value => ({ ...value, onboarded: true }))}>{t.onboardDone}</button>
    </div>}
  </div>
}
