/**
 * [INPUT]: Device column preferences, workspace calendar, shared picker surface/list styles and the global dialog boundary.
 * [OUTPUT]: Immediate six-column checkbox menu with keyboard navigation, dismissal/focus return and a minimum-column hint.
 * [POS]: TopBar presentation control; reuses the shared popover and icon primitives without workspace writes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { CalendarConfig } from '../../../shared/contracts/entities'
import { periodHorizons } from '../../../shared/contracts/values'
import type { Columns } from '../../state/columns'
import { messages } from '../../i18n'
import { horizonName } from '../../lib/periods'
import { Icon } from '../../components/icons'
import { Popover } from '../../components/Popover'
import '../../components/picker-panel.css'

export function ColumnVisibilityMenu({ columns, calendar, blocked }: { columns: Columns; calendar: CalendarConfig; blocked: boolean }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), first = useRef(0)
  const count = columns.visible.filter(horizon => horizon !== 'later').length
  useEffect(() => { if (blocked) setOpen(false) }, [blocked])
  useLayoutEffect(() => {
    if (!open) return
    // Floating placement becomes visible after layout; focus only once the anchored panel is on screen.
    const frame = requestAnimationFrame(() => menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')[first.current]?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])
  const close = (returnFocus = false) => {
    setOpen(false)
    if (returnFocus) trigger.current?.focus({ preventScroll: true })
  }
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Tab') { close(true); return }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
    if (event.metaKey || event.ctrlKey || event.altKey) return
    event.stopPropagation()
    const controls = [...menu.current!.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')]
    const index = controls.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % controls.length
      : event.key === 'ArrowUp' ? (index - 1 + controls.length) % controls.length : null
    if (next !== null) { event.preventDefault(); controls[next]?.focus() }
  }
  return <Popover open={open} onClose={() => close()} align="end" floating anchor={
    <button ref={trigger} id="column-toggle" type="button" className="icon-button" aria-label={messages.visibleColumns} title={messages.visibleColumns}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'column-visibility-menu' : undefined} onClick={() => { first.current = 0; setOpen(!open) }}
      onBlur={event => { if (!menu.current?.contains(event.relatedTarget)) close() }}
      onKeyDown={event => {
        if (event.key === 'Tab' && open) { close(); return }
        if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey || !['ArrowDown', 'ArrowUp'].includes(event.key)) return
        event.preventDefault(); first.current = event.key === 'ArrowUp' ? periodHorizons.length - 1 : 0; setOpen(true)
      }}><Icon name="views" size={18} /></button>
  }>
    <div ref={menu} id="column-visibility-menu" className="picker-panel column-visibility-menu" role="menu" aria-label={messages.visibleColumns} onKeyDown={keys}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) close() }}>
      <div className="picker-list">
        {periodHorizons.map(horizon => {
          const checked = columns.visible.includes(horizon), last = checked && count === 1
          return <button key={horizon} type="button" className="picker-row" role="menuitemcheckbox" data-column-choice={horizon} data-selected={checked}
            aria-checked={checked} aria-disabled={last || undefined} aria-describedby={last ? 'column-visibility-hint' : undefined}
            onClick={() => { if (!last) columns.setVisible(horizon, !checked) }}>
            <span>{horizonName(horizon, calendar)}</span>{checked && <Icon name="check" size={14} />}
          </button>
        })}
      </div>
      {count === 1 && <p id="column-visibility-hint" className="column-visibility-hint" role="note">{messages.minimumVisibleColumns}</p>}
    </div>
  </Popover>
}
