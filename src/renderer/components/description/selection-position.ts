/**
 * [INPUT]: The saved DOM selection, editable root and measured floating panel.
 * [OUTPUT]: Viewport coordinates constrained by the visible editor scroll area, refreshed on layout changes.
 * [POS]: Description-only placement; the toolbar owns selection semantics and portals within its dialog.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

const gap = 8

function visibleBounds(root: HTMLElement) {
  const bounds = { left: gap, top: gap, right: window.innerWidth - gap, bottom: window.innerHeight - gap }
  for (let element = root.parentElement; element; element = element.parentElement) {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect()
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      bounds.left = Math.max(bounds.left, rect.left + element.clientLeft + gap)
      bounds.right = Math.min(bounds.right, rect.left + element.clientLeft + element.clientWidth - gap)
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      bounds.top = Math.max(bounds.top, rect.top + element.clientTop + gap)
      bounds.bottom = Math.min(bounds.bottom, rect.top + element.clientTop + element.clientHeight - gap)
    }
  }
  return bounds
}

export function useSelectionPosition(root: HTMLElement | null, anchor: Range | null, panel: RefObject<HTMLDivElement | null>, expanded: boolean): CSSProperties {
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    if (!root || !anchor) return
    const place = () => {
      const element = panel.current
      if (!element || !anchor.startContainer.isConnected) return
      const bounds = visibleBounds(root)
      let range = anchor.getBoundingClientRect()
      if (!range.height) {
        const first = root.getBoundingClientRect(), style = getComputedStyle(root)
        range = new DOMRect(first.left, first.top + parseFloat(style.paddingTop), 0, parseFloat(style.lineHeight) || 20)
      }
      if (range.bottom <= bounds.top || range.top >= bounds.bottom || range.right < bounds.left || range.left > bounds.right) {
        setPosition(previous => previous.visibility === 'hidden' ? previous : { ...previous, visibility: 'hidden' }); return
      }
      const maxWidth = Math.max(0, bounds.right - bounds.left)
      const size = element.getBoundingClientRect(), height = element.scrollHeight + element.offsetHeight - element.clientHeight
      const above = Math.max(0, range.top - gap - bounds.top), below = Math.max(0, bounds.bottom - range.bottom - gap)
      const side = above >= height || above >= below && below < height ? 'above' : 'below'
      const available = side === 'above' ? above : below
      // Large selections can fill the scrollport. Formatting shortcuts still work while its bar is out of view.
      if (!expanded && available < height) { setPosition(previous => ({ ...previous, visibility: 'hidden' })); return }
      const maxHeight = expanded ? Math.max(Math.min(80, bounds.bottom - bounds.top), available) : height
      const fittedHeight = Math.min(height, maxHeight)
      const top = side === 'above' ? Math.max(bounds.top, range.top - gap - fittedHeight) : Math.min(bounds.bottom - fittedHeight, range.bottom + gap)
      const next: CSSProperties = { left: Math.max(bounds.left, Math.min(range.left, bounds.right - Math.min(size.width, maxWidth))), top, maxWidth, maxHeight, visibility: 'visible' }
      setPosition(previous => Object.keys(next).every(key => previous[key as keyof CSSProperties] === next[key as keyof CSSProperties]) ? previous : next)
    }
    place()
    const resize = new ResizeObserver(place), mutation = new MutationObserver(place)
    resize.observe(root)
    if (panel.current) resize.observe(panel.current)
    for (let element = root.parentElement; element; element = element.parentElement) resize.observe(element)
    mutation.observe(root, { subtree: true, childList: true, characterData: true })
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => { resize.disconnect(); mutation.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [root, anchor, panel, expanded])
  return position
}
