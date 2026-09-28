/**
 * [INPUT]: Mounted board nodes and their independent panel/column scroll viewports.
 * [OUTPUT]: Shared clipped rectangles for drops, overlay anchors and readable-result feedback.
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
