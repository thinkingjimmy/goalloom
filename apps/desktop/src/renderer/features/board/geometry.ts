/**
 * [INPUT]: Mounted board nodes and their independent panel/column scroll viewports.
 * [OUTPUT]: Shared clipped rectangles for drops, overlay anchors and readable-result feedback; the relation connector
 *           route (`orthogonal`) with independently clamped corners, including vertical starts, and its row anchor constants, shared by drawn lines and the drag preview.
 * [POS]: Renderer-only geometry; fixed Later never shares the timeline's horizontal scroll coordinates.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export function intersectRect(a: DOMRectReadOnly, b: DOMRectReadOnly): DOMRect | null {
  const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top), right = Math.min(a.right, b.right), bottom = Math.min(a.bottom, b.bottom)
  return right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : null
}

export function panelViewport(node: Element): DOMRect | null {
  if (node.closest('[inert]')) return null
  const board = node.closest('.board'), panel = node.closest<HTMLElement>('[data-board-panel]')
  if (!board || !panel) return null
  const bounds = panel.getBoundingClientRect()
  return intersectRect(new DOMRect(bounds.left, bounds.top, panel.clientWidth, panel.clientHeight), board.getBoundingClientRect())
}

export function dropViewport(node: Element): DOMRect | null {
  const panel = panelViewport(node), content = node.closest('.column-content')
  return panel && content ? intersectRect(panel, content.getBoundingClientRect()) : panel
}

// Titles grow freely; anchors stay level with the first line, where the dot and checkbox sit.
export const firstLine = 32
// Rows sit 3px inside each column rule, so a connector's vertical bus runs on the rule itself; a forward line stops at
// the flow dot's left edge (the 18px dot button starts at the row edge and centres a 6px dot). A right-side port mirrors
// that dot inside the row's right gutter, so both ends sit on the row's ground.
export const busGap = 3, dotEdge = 6, dotCenter = 9

/** Horizontal–vertical path through vertical buses, ending horizontally at x2.
 *  Each corner fits its own adjoining segments, so a vertical start still rounds into the destination. */
export function orthogonal(x: number, y: number, turns: [number, number][], x2: number): string {
  let d = `M${x} ${y}`
  turns.forEach(([bus, to], index) => {
    const next = turns[index + 1]?.[0] ?? x2
    const vertical = Math.abs(to - y) / 2
    const entry = Math.min(5, vertical, Math.abs(bus - x)), exit = Math.min(5, vertical, Math.abs(next - bus))
    const dy = Math.sign(to - y), dx = Math.sign(next - bus)
    d += entry < .5 ? `H${bus}` : `H${bus - Math.sign(bus - x) * entry}Q${bus} ${y} ${bus} ${y + dy * entry}`
    d += exit < .5 ? `V${to}` : `V${to - dy * exit}Q${bus} ${to} ${bus + dx * exit} ${to}`
    x = exit < .5 ? bus : bus + dx * exit; y = to
  })
  return `${d}H${x2}`
}
