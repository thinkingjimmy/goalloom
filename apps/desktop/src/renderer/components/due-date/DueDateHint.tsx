/**
 * [INPUT]: A deadline trigger and its disabled/calendar-open state.
 * [OUTPUT]: Localized guidance on trigger hover or focus, with bounded floating placement and independent Escape dismissal.
 * [POS]: Shared first-level deadline guidance for detail and composer; the calendar contains only date controls.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Slot } from '@radix-ui/react-slot'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { messages } from '../../i18n'
import { Popover } from '../Popover'
import './due-date.css'

export function DueDateHint({ children, inactive }: { children: ReactNode; inactive: boolean }) {
  const id = useId(), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const visible = !inactive && open
  const dismiss = () => { clearTimeout(timer.current); setOpen(false) }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { if (inactive) dismiss() }, [inactive])
  useEffect(() => {
    if (!visible) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault(); event.stopPropagation(); dismiss()
    }
    window.addEventListener('keydown', escape, true)
    return () => window.removeEventListener('keydown', escape, true)
  }, [visible])
  return <Popover floating open={visible} onClose={dismiss} className="due-tooltip" anchor={
    <Slot className="due-hint-trigger" aria-describedby={visible ? id : undefined}
      onPointerEnter={event => {
        clearTimeout(timer.current)
        if (!inactive && event.pointerType !== 'touch' && matchMedia('(hover: hover)').matches) timer.current = setTimeout(() => setOpen(true), 200)
      }} onPointerLeave={event => { clearTimeout(timer.current); if (!event.currentTarget.matches(':focus-visible')) dismiss() }}
      onFocus={event => { if (!inactive && event.currentTarget.matches(':focus-visible')) { clearTimeout(timer.current); setOpen(true) } }} onBlur={dismiss}
      onPointerDown={dismiss}>{children}</Slot>
  }><span id={id} role="tooltip">{messages.dueDateNote}</span></Popover>
}
