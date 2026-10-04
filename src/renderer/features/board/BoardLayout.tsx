/**
 * [INPUT]: Independent Later/planning visibility, persistent column content and the shared drag context.
 * [OUTPUT]: Equal-width visible columns, retained hidden-column scroll and a fixed sidebar with interruptible transform-only transitions.
 * [POS]: Board layout boundary; keeps drafts/scroll mounted and pulses existing geometry observers during motion.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Component, createRef, useLayoutEffect, type CSSProperties, type ReactNode } from 'react'
import type { Horizon } from '../../../domain/calendar'
import { useDndContext, useDndMonitor } from '@dnd-kit/core'
import { beginBoardMotion, boardMotionEvent } from './RowMotion'

const settleEvent = 'goalloom:settle-board-layout'
interface Props { open: boolean; columns: Horizon[]; sidebar: ReactNode; children: ReactNode }
interface Positions { sidebar: number; timeline: number }

function DragMeasurements({ columns }: { columns: string }) {
  const { measureDroppableContainers } = useDndContext()
  useLayoutEffect(() => { measureDroppableContainers([]) }, [columns, measureDroppableContainers])
  useDndMonitor({ onDragStart: () => {
    document.querySelector('.board-panels')?.dispatchEvent(new Event(settleEvent))
    measureDroppableContainers([])
  } })
  return null
}

export class BoardLayout extends Component<Props, Record<string, never>, Positions | null> {
  private root = createRef<HTMLDivElement>()
  private sidebar = createRef<HTMLElement>()
  private timeline = createRef<HTMLDivElement>()
  private animations: Animation[] = []
  private release: (() => void) | null = null
  private media: MediaQueryList | null = null
  private scroll = new Map<Horizon, { periodId: string | null; top: number }>()
  private clear = () => {
    for (const animation of this.animations) animation.cancel()
    this.animations = []
    if (this.sidebar.current) this.sidebar.current.style.visibility = ''
    this.release?.(); this.release = null
  }
  private settle = () => this.clear()
  private reduced = () => { if (this.media?.matches) this.clear() }
  private visibility = () => { if (document.hidden) this.clear() }
  componentDidMount() {
    this.media = matchMedia('(prefers-reduced-motion: reduce)')
    this.media.addEventListener('change', this.reduced)
    this.root.current?.addEventListener(settleEvent, this.settle)
    document.addEventListener('visibilitychange', this.visibility)
  }
  componentWillUnmount() {
    this.clear(); this.media?.removeEventListener('change', this.reduced)
    this.root.current?.removeEventListener(settleEvent, this.settle)
    document.removeEventListener('visibilitychange', this.visibility)
  }
  getSnapshotBeforeUpdate(previous: Props): Positions | null {
    const changed = previous.columns.join() !== this.props.columns.join()
    if (changed) for (const horizon of previous.columns.filter(horizon => !this.props.columns.includes(horizon))) {
      const column = this.timeline.current?.querySelector<HTMLElement>(`[data-horizon="${horizon}"]`)
      this.scroll.set(horizon, { periodId: column?.getAttribute('data-period-id') ?? null, top: column?.querySelector('.column-content')?.scrollTop ?? 0 })
      if (column?.contains(document.activeElement)) document.getElementById('column-toggle')?.focus({ preventScroll: true })
    }
    if (previous.open === this.props.open) return null
    if (!this.props.open && this.sidebar.current?.contains(document.activeElement)) document.getElementById('later-toggle')?.focus({ preventScroll: true })
    return { sidebar: this.sidebar.current!.getBoundingClientRect().left, timeline: this.timeline.current!.getBoundingClientRect().left }
  }
  componentDidUpdate(previous: Props, _state: Record<string, never>, before: Positions | null) {
    if (previous.columns.join() !== this.props.columns.join()) {
      this.clear()
      for (const horizon of this.props.columns.filter(horizon => !previous.columns.includes(horizon))) {
        const column = this.timeline.current?.querySelector(`[data-horizon="${horizon}"]`), content = column?.querySelector('.column-content')
        const saved = this.scroll.get(horizon)
        if (content) content.scrollTop = saved && saved.periodId === column?.getAttribute('data-period-id') ? saved.top : 0
      }
      this.root.current?.closest('.board')?.dispatchEvent(new Event(boardMotionEvent))
    }
    if (!before) return
    this.clear()
    const sidebar = this.sidebar.current!, timeline = this.timeline.current!, board = this.root.current!.closest('.board')!
    if (this.media?.matches || document.hidden || document.documentElement.dataset.dragging) return
    const finalX = this.props.open ? 0 : -sidebar.offsetWidth
    const dx = before.sidebar - sidebar.getBoundingClientRect().left, shift = before.timeline - timeline.getBoundingClientRect().left
    const distance = Math.max(Math.abs(dx), Math.abs(shift))
    if (distance < .5) return
    const options = { duration: (this.props.open ? 240 : 180) * Math.min(1, distance / sidebar.offsetWidth), easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
    sidebar.style.visibility = 'visible'
    this.animations = [
      sidebar.animate([{ transform: `translateX(${finalX + dx}px)` }, { transform: `translateX(${finalX}px)` }], options),
      timeline.animate([{ transform: `translateX(${shift}px)` }, { transform: 'translateX(0)' }], options),
    ]
    this.release = beginBoardMotion(board)
    board.dispatchEvent(new Event(boardMotionEvent))
    const current = this.animations
    void Promise.allSettled(current.map(animation => animation.finished)).then(() => { if (this.animations === current) this.clear() })
  }
  render() {
    return <div ref={this.root} className="board-panels" data-later-open={this.props.open} style={{ '--planning-count': this.props.columns.length } as CSSProperties}>
      <DragMeasurements columns={`${this.props.open}:${this.props.columns.join()}`} />
      <aside ref={this.sidebar} id="later-sidebar" className="board-later" data-board-panel="later" inert={!this.props.open} aria-hidden={!this.props.open}>
        {this.props.sidebar}
      </aside>
      <div ref={this.timeline} className="board-timeline" data-board-panel="timeline">{this.props.children}</div>
    </div>
  }
}
