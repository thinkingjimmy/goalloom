/**
 * [INPUT]: 受控开关、锚点内容与浮层内容。
 * [OUTPUT]: 锚点相对定位的轻量浮层；外部按下或 Esc 关闭，Esc 不冒泡到外层 dialog。
 * [POS]: 通用 UI 原语，供筛选、视图菜单、截止日、关联选择器和流程选择器复用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useEffect, useRef, type ReactNode } from 'react'

export function Popover({ open, onClose, anchor, children, align = 'start', side = 'bottom', className = '' }: { open: boolean; onClose: () => void; anchor: ReactNode; children: ReactNode; align?: 'start' | 'end'; side?: 'bottom' | 'top'; className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onClose() }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, onClose])
  return <div className="popover-root" ref={root} onKeyDown={event => {
    if (open && event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); onClose() }
  }}>
    {anchor}
    {open && <div className={`popover popover-${side} popover-${align} ${className}`}>{children}</div>}
  </div>
}
