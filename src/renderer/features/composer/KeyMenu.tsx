/**
 * [INPUT]: An accessible label and menu content whose choices are buttons (optionally with data-key digits) and at most a search/date input.
 * [OUTPUT]: KeyMenu: focuses its first control on mount, ↑↓ move between controls, a bare digit presses the matching [data-key] choice; Esc is left to Popover.
 * [POS]: Keyboard shell for the composer's inline T/D/P menus; holds no state of its own.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

const controls = 'button:not(:disabled), input'

export function KeyMenu({ label, children }: { label: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { root.current?.querySelector<HTMLElement>(controls)?.focus() }, [])
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.key === 'Tab') return
    const list = [...root.current!.querySelectorAll<HTMLElement>(controls)]
    const index = list.indexOf(document.activeElement as HTMLElement)
    const typing = document.activeElement instanceof HTMLInputElement && document.activeElement.type !== 'date'
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      list[(index + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
    } else if (!typing && /^[1-9]$/.test(event.key)) {
      const choice = root.current!.querySelector<HTMLButtonElement>(`[data-key="${event.key}"]:not(:disabled)`)
      if (choice) { event.preventDefault(); choice.click() }
    }
    // The row's own shortcuts must not fire while a menu is open; Esc still reaches Popover to close it.
    if (event.key !== 'Escape') event.stopPropagation()
  }
  return <div ref={root} className="menu key-menu" role="menu" aria-label={label} onKeyDown={keys}>{children}</div>
}
