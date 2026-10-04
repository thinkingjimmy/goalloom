/**
 * [INPUT]: Snapshot, board view, active flows, the optional highlighted preview chain, visible columns, insight readiness, guarded submission and a composer-seed opener.
 * [OUTPUT]: The breakpoint layer inside `.board`: an entry right-aligned inside each gap parent's row (flow colour) and skip parent's row (amber), never crossing
 *           the column rule where connector buses run — a thin ring at rest that becomes a labelled pill while its row is hovered, focused or pending;
 *           click shows a loading glyph while drafting and creating (create / insertBetween), ⇧-click or no model opens the prefilled composer;
 *           preview limits controls and bridge children to its highlighted chain; a next-period creation leaves a destination pill; the first sighting shows a one-time guide.
 * [POS]: Board insight overlay with a guide bounded to the planning viewport; pending actions survive hover exits and finite motion tracking.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
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
import { dotCenter, firstLine, panelViewport } from '../board/geometry'

interface Spot { key: string; kind: 'gap' | 'skip'; parent: ItemSummary; target: ChildHorizon; children: ItemSummary[]; color: string }
interface Place { x: number; y: number }
// Gap entries sit this far inside the row's right edge; skip entries also clear the shared relation-port anchor.
const inset = 6

export function Breakpoints({ snapshot, view, flows, flowIds, previewChain, columns, ready, submit, seed }: {
  snapshot: Snapshot; view: BoardView; flows: Flows; flowIds: string[]; previewChain: ReadonlySet<string> | null; columns: ItemHorizon[]; ready: boolean
  submit: (action: Action) => Promise<unknown>; seed: (seed: Seed) => void
}) {
  const settings = useInsightSettings()
  const root = useRef<HTMLDivElement>(null)
  const [places, setPlaces] = useState<Map<string, Place>>(new Map())
  const [pending, setPending] = useState<string | null>(null)
  // Session-only: a step created into the next period is not in this column, so the gap keeps a pointer to it.
  const [sent, setSent] = useState<Map<string, { title: string; period: PlanningPeriod; horizon: ChildHorizon }>>(new Map())
  const active = flowIds.length > 0
  const spots = useMemo<Spot[]>(() => {
    if (!active) return []
    const found = breakpoints(snapshot, flows, flowIds, columns, view.mode, previewChain)
    return [...found.gaps.map(gap => ({ key: `gap:${gap.parent.id}`, kind: 'gap' as const, parent: gap.parent, target: gap.target, children: [],
      color: flowStroke(flows.of(gap.parent.id).find(flow => flowIds.includes(flow.id))!.flowColor) })),
      ...found.skips.map(skip => ({ key: `skip:${skip.parent.id}`, kind: 'skip' as const, parent: skip.parent, target: 'week' as const, children: skip.children, color: 'var(--insight-skip)' }))]
  }, [snapshot, flows, flowIds, previewChain, columns, view.mode, active])
  const latest = useRef(spots); latest.current = spots

  const measure = (moving = false) => {
    const overlay = root.current, board = overlay?.parentElement
    if (!overlay || !board || !latest.current.length) return
    const origin = board.getBoundingClientRect(), dx = -origin.left, dy = -origin.top
    const next = new Map<string, Place>()
    for (const spot of latest.current) {
      const row = document.getElementById(`item-${spot.parent.id}`), content = row?.closest('.column-content')
      if (!row || !content || !board.contains(row)) continue
      const offset = inset + (spot.kind === 'skip' ? dotCenter : 0)
      const r = row.getBoundingClientRect(), c = content.getBoundingClientRect(), viewport = panelViewport(row), mid = r.top + Math.min(r.height, firstLine) / 2
      if (!viewport || r.right - offset - 24 < viewport.left || r.right - offset > viewport.right || mid < c.top || mid > c.bottom) continue
      // Anchored inside the row's right edge (level with the first line), so it never covers the connector bus on the column rule.
      next.set(spot.key, { x: r.right - offset + dx, y: mid + dy })
    }
    for (const node of root.current?.querySelectorAll<HTMLElement>('[data-spot-key]') ?? []) {
      const place = next.get(node.dataset.spotKey!)
      node.style.visibility = place ? '' : 'hidden'
      if (place) {
        const guide = node.classList.contains('breakpoint-guide')
        const panel = guide ? board.querySelector('.board-timeline') : null
        const viewport = panel && panelViewport(panel)
        if (guide && viewport) {
          // Keep the guide's dismissal reachable when a visible endpoint sits near the scroll viewport edge.
          const width = Math.min(300, viewport.width - 16)
          node.style.width = `${width}px`
          node.style.left = `${Math.max(viewport.left + dx + 8, Math.min(place.x - 24, viewport.right + dx - width - 8))}px`
          node.style.top = `${Math.max(viewport.top + dy + 8, Math.min(place.y + 20, viewport.bottom + dy - node.offsetHeight - 8))}px`
        } else {
          node.style.left = `${guide ? place.x - 24 : place.x}px`
          node.style.top = `${guide ? place.y + 20 : place.y}px`
        }
      }
    }
    if (!moving) setPlaces(previous => JSON.stringify([...previous]) === JSON.stringify([...next]) ? previous : next)
  }
  const measureRef = useRef(measure); measureRef.current = measure
  useLayoutEffect(() => {
    const overlay = root.current, board = overlay?.parentElement
    if (!overlay || !board || !active) return
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
  }, [active])
  // React may commit an earlier geometry read after FLIP has installed its inverse transform.
  useLayoutEffect(() => {
    const board = root.current?.parentElement
    measureRef.current(!!board && boardIsMoving(board))
  })

  // Rows live outside this layer, so the hovered row is tracked here to expand its entry into a labelled pill.
  const [hovered, setHovered] = useState<string | null>(null)
  useEffect(() => {
    const board = root.current?.parentElement
    if (!board || !active) return
    const over = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target || target.closest('.breakpoints')) return
      setHovered(target.closest('.task-row')?.getAttribute('data-item-id') ?? null)
    }
    const leave = () => setHovered(null)
    board.addEventListener('pointerover', over); board.addEventListener('pointerleave', leave)
    return () => { board.removeEventListener('pointerover', over); board.removeEventListener('pointerleave', leave) }
  }, [active])
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
      if (away) return <button key={spot.key} data-spot-key={spot.key} type="button" className="breakpoint-away" style={{ left: place.x, top: place.y, '--node': spot.color } as CSSProperties}
        aria-label={t.openDestination(planningLabel(away.period, snapshot.workspace.calendar!, snapshot.observedAt))}
        onClick={() => view.choose(away.horizon, away.period)}>{t.destination(planningLabel(away.period, snapshot.workspace.calendar!, snapshot.observedAt), away.title)}<Icon name="next" size={12} /></button>
      const label = spot.kind === 'skip' ? t.bridgeLabel(spot.parent.title, spot.children.length) : t.nodeLabel(spot.parent.title)
      return <button key={spot.key} data-spot-key={spot.key} type="button" className="breakpoint" data-kind={spot.kind} data-pending={pending === spot.key} data-guided={guide?.key === spot.key}
        data-expanded={hovered === spot.parent.id || pending === spot.key || guide?.key === spot.key}
        style={{ left: place.x, top: place.y, '--node': spot.color } as CSSProperties} aria-label={label} title={`${label}\n${t.nodeTip}`}
        aria-busy={pending === spot.key} disabled={!!pending} onClick={event => void open(spot, event)}>
        <Icon name={pending === spot.key ? 'loading' : 'add'} size={12} strokeWidth={2.4} /><span className="breakpoint-label" aria-hidden="true">{spot.kind === 'skip' ? t.bridgeShort : t.nodeShort}</span>
      </button>
    })}
    {guide && places.get(guide.key) && <div data-spot-key={guide.key} className="breakpoint-guide" role="note" style={{ left: places.get(guide.key)!.x - 24, top: places.get(guide.key)!.y + 20 }}>
      <p className="breakpoint-guide-kicker">{t.onboardKicker}</p>
      <p className="breakpoint-guide-title">{t.onboardTitle}</p>
      <p>{t.onboardBody}</p>
      <ul><li data-kind="gap">{t.onboardGap}</li><li data-kind="skip">{t.onboardSkip}</li></ul>
      <button type="button" className="settings-button" onClick={() => updateInsight(value => ({ ...value, onboarded: true }))}>{t.onboardDone}</button>
    </div>}
  </div>
}
