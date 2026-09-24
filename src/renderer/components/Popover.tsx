/**
 * [INPUT]: 受控开关、锚点内容与浮层内容；floating 时读取锚点的视口位置。
 * [OUTPUT]: 锚点相对定位的轻量浮层；floating 时经 portal 以 fixed 定位浮出滚动容器并随滚动/缩放跟随锚点。外部按下或 Esc 关闭，Esc 不冒泡到外层 dialog。
 * [POS]: 通用 UI 原语，供筛选、列显示、截止日、关联选择器、流程选择器和看板流程圆点复用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Keep a floating panel this far from the window edges.
const margin = 8

export function Popover({ open, onClose, anchor, children, align = 'start', side = 'bottom', className = '', floating = false }: { open: boolean; onClose: () => void; anchor: ReactNode; children: ReactNode; align?: 'start' | 'end'; side?: 'bottom' | 'top'; className?: string; floating?: boolean }) {
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { const target = event.target as Node; if (!root.current?.contains(target) && !panel.current?.contains(target)) onClose() }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, onClose])
  // A floating panel escapes clipping scroll containers (board columns), so it tracks the anchor itself and stays on screen.
  useLayoutEffect(() => {
    if (!open || !floating) { setPosition(null); return }
    const place = () => {
      const anchorRect = root.current?.getBoundingClientRect(), size = panel.current?.getBoundingClientRect()
      if (!anchorRect) return
      const width = size?.width ?? 0, height = size?.height ?? 0
      const below = anchorRect.bottom + 6, above = anchorRect.top - 6 - height
      const top = side === 'top' || below + height > window.innerHeight - margin ? Math.max(margin, above) : below
      const left = align === 'end' ? anchorRect.right - width : anchorRect.left - 6
      setPosition({ top, left: Math.max(margin, Math.min(left, window.innerWidth - width - margin)) })
    }
    place()
    const frame = requestAnimationFrame(place)
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, floating, side, align])
  const escape = (event: KeyboardEvent) => {
    if (open && event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); onClose() }
  }
  const content = open && (floating
    // React events still bubble through the portal to the anchor's ancestors; keep presses away from row drag sensors.
    ? createPortal(<div ref={panel} className={`popover popover-floating ${className}`} onKeyDown={escape} onPointerDown={event => event.stopPropagation()} style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}>{children}</div>, document.body)
    : <div ref={panel} className={`popover popover-${side} popover-${align} ${className}`}>{children}</div>)
  return <div className="popover-root" ref={root} onKeyDown={escape}>
    {anchor}
    {content}
  </div>
}
