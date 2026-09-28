/**
 * [INPUT]: Stable virtual-row identities, period scope and dnd ownership.
 * [OUTPUT]: Interruptible 240 ms FLIP translations and a finite shared geometry pulse for board overlays.
 * [POS]: Outer-row motion boundary; dnd-kit keeps ownership of the inner article transform.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Component, createRef, type ReactNode } from 'react'

export const boardMotionEvent = 'goalloom:board-motion'
const drops = new Map<string, DOMRect>()
export function captureDropPosition(id: string, rect: DOMRect) {
  drops.set(id, rect)
  setTimeout(() => { if (drops.get(id) === rect) drops.delete(id) }, 300)
}
const loops = new WeakMap<Element, { count: number; frame: number }>()
export const boardIsMoving = (board: Element) => (loops.get(board)?.count ?? 0) > 0
export function beginBoardMotion(board: Element): () => void {
  let loop = loops.get(board)
  if (!loop) { loop = { count: 0, frame: 0 }; loops.set(board, loop) }
  const active = loop
  active.count++
  const frame = () => {
    board.dispatchEvent(new Event(boardMotionEvent))
    active.frame = active.count ? requestAnimationFrame(frame) : 0
  }
  if (!active.frame) active.frame = requestAnimationFrame(frame)
  let released = false
  return () => {
    if (released) return
    released = true
    active.count--
    if (!active.count) { cancelAnimationFrame(active.frame); active.frame = 0; board.dispatchEvent(new Event(boardMotionEvent)) }
  }
}
function track(board: Element, animation: Animation) {
  const release = beginBoardMotion(board)
  void animation.finished.catch(() => {}).finally(release)
}
interface Props { children: ReactNode; scope: string; orderKey: string; offsets: ReadonlyMap<string, number>; dragging: boolean }
interface Point { left: number; top: number }
interface Positions { mounted: Map<string, Point>; offsets: ReadonlyMap<string, number>; origin: Point }

export class RowMotion extends Component<Props, Record<string, never>, Positions | null> {
  private root = createRef<HTMLDivElement>()
  private animations = new Map<HTMLElement, Animation>()
  private media: MediaQueryList | null = null
  private clear = () => {
    for (const [node, animation] of this.animations) { animation.cancel(); node.style.willChange = '' }
    this.animations.clear()
  }
  private reduced = () => { if (this.media?.matches) this.clear() }
  componentDidMount() {
    this.media = matchMedia('(prefers-reduced-motion: reduce)')
    this.media.addEventListener('change', this.reduced)
  }
  componentWillUnmount() { this.clear(); this.media?.removeEventListener('change', this.reduced) }
  getSnapshotBeforeUpdate(previous: Props): Positions | null {
    if (previous.scope !== this.props.scope || this.props.dragging || this.media?.matches) { this.clear(); return null }
    if (previous.orderKey === this.props.orderKey) return null
    const mounted = new Map<string, Point>(), origin = this.root.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
    for (const node of this.root.current?.querySelectorAll<HTMLElement>('[data-virtual-id]') ?? []) {
      const rect = node.getBoundingClientRect(), row = node.querySelector('.task-row')
      const transform = row ? getComputedStyle(row).transform : 'none'
      const shift = transform === 'none' ? null : new DOMMatrixReadOnly(transform)
      mounted.set(node.dataset.virtualId!, { left: rect.left + (shift?.m41 ?? 0), top: rect.top + (shift?.m42 ?? 0) })
    }
    return { mounted, offsets: previous.offsets, origin }
  }
  componentDidUpdate(_previous: Props, _state: Record<string, never>, positions: Positions | null) {
    if (!positions) return
    this.clear()
    const board = this.root.current?.closest('.board')
    if (!board) return
    const changes: { node: HTMLElement; dx: number; dy: number }[] = []
    for (const node of this.root.current?.querySelectorAll<HTMLElement>('[data-virtual-id]') ?? []) {
      const id = node.dataset.virtualId!, drop = drops.get(id), offset = positions.offsets.get(id)
      const before = drop ?? positions.mounted.get(id) ?? (offset !== undefined ? { left: positions.origin.left, top: positions.origin.top + offset } : null)
      if (!before) continue
      drops.delete(id)
      const after = node.getBoundingClientRect(), article = drop ? node.querySelector('.task-row')?.getBoundingClientRect() : null
      const dx = before.left - after.left + (article ? after.left - article.left : 0), dy = before.top - after.top + (article ? after.top - article.top : 0)
      if (Math.abs(dx) + Math.abs(dy) > .5) changes.push({ node, dx, dy })
    }
    for (const { node, dx, dy } of changes) {
      node.style.willChange = 'transform'
      const animation = node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 240, easing: 'cubic-bezier(0.645, 0.045, 0.355, 1)' })
      this.animations.set(node, animation); track(board, animation)
      void animation.finished.catch(() => {}).finally(() => {
        if (this.animations.get(node) === animation) { this.animations.delete(node); node.style.willChange = '' }
      })
    }
    // Layout effects may have measured the final layout before these inverse transforms existed.
    // Re-anchor synchronously so the first painted frame is already connected.
    if (changes.length) board.dispatchEvent(new Event(boardMotionEvent))
  }
  render() { return <div ref={this.root} className="row-motion" style={{ overflowAnchor: 'none' }}>{this.props.children}</div> }
}
