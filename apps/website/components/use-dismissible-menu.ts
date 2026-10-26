/**
 * [INPUT]: React refs/effects and native pointer/keyboard events.
 * [OUTPUT]: useDismissibleMenu returns a native details ref with outside-pointer and Escape dismissal.
 * [POS]: Shared progressive dismissal for language, platform-download and information controls.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
'use client'

import { useEffect, useRef } from 'react'

export function useDismissibleMenu() {
  const menuRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const menu = menuRef.current!
    const dismissOutside = (event: PointerEvent) => {
      if (menu.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false
    }
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menu.open || !(event.target instanceof Node) || !menu.contains(event.target)) return
      event.preventDefault()
      menu.open = false
      menu.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    menu.addEventListener('keydown', dismissWithEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true)
      menu.removeEventListener('keydown', dismissWithEscape)
    }
  }, [])
  return menuRef
}
