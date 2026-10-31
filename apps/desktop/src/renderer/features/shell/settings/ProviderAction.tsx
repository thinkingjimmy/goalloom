/**
 * [INPUT]: Localized action labels, Hugeicons names, native button props and the shared floating Popover.
 * [OUTPUT]: Compact service actions with delayed pointer/immediate keyboard hints and scoped Escape dismissal.
 * [POS]: AI-service row control; floating hints stay inside the active native Settings dialog.
 */
import { useEffect, useId, useRef, useState, type ComponentProps } from 'react'
import { Icon, type IconName } from '../../../components/icons'
import { Popover } from '../../../components/Popover'
import { IconButton } from '../../../components/ui/button'

let warmUntil = 0

export function ProviderAction({ label, icon, danger = false, onClick, ...props }: Omit<ComponentProps<'button'>, 'children' | 'aria-label'> & { label: string; icon: IconName; danger?: boolean }) {
  const id = useId(), button = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const close = () => { clearTimeout(timer.current); if (open) warmUntil = Date.now() + 300; setOpen(false) }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!open) return
    // A pointer hint can be open while keyboard focus remains elsewhere in Settings.
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); close() }
    }
    document.addEventListener('keydown', escape, true)
    return () => document.removeEventListener('keydown', escape, true)
  }, [open])
  return <Popover open={open} onClose={close} align="end" floating className="provider-action-tooltip" anchor={
    <IconButton {...props} ref={button} type="button" className="provider-action size-10" data-danger={danger} aria-label={label} aria-describedby={open ? id : undefined}
      onClick={event => { close(); onClick?.(event) }}
      onPointerEnter={event => {
        clearTimeout(timer.current)
        if (!props.disabled && event.pointerType !== 'touch' && matchMedia('(hover: hover)').matches) timer.current = setTimeout(() => setOpen(true), Date.now() < warmUntil ? 0 : 200)
      }}
      onPointerLeave={() => { clearTimeout(timer.current); if (!button.current?.matches(':focus-visible')) close() }}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) { clearTimeout(timer.current); setOpen(true) } }} onBlur={close}>
      <Icon name={icon} size={18} />
    </IconButton>
  }><span id={id} role="tooltip">{label}</span></Popover>
}
