/**
 * [INPUT]: Localized return label, busy state, existing period-switch action and the shared floating Popover.
 * [OUTPUT]: A compact return icon with delayed pointer/immediate keyboard guidance; Escape dismisses the hint before column navigation.
 * [POS]: Board-header navigation control beside PeriodPicker; preserves pointer/keyboard return motion and never writes items.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '../../components/icons'
import { Popover } from '../../components/Popover'
import './period-picker.css'

export function PeriodReturn({ label, disabled, onReturn }: { label: string; disabled: boolean; onReturn: (pointer: boolean) => void }) {
  const id = useId(), button = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const close = () => { clearTimeout(timer.current); setOpen(false) }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { if (disabled) close() }, [disabled])
  return <Popover open={open} onClose={close} align="end" floating className="period-return-tooltip" anchor={
    <button ref={button} type="button" className="icon-button small period-return" data-return-current aria-label={label}
      aria-describedby={open ? id : undefined} disabled={disabled} onClick={event => onReturn(event.detail > 0)}
      onPointerEnter={event => {
        clearTimeout(timer.current)
        if (!disabled && event.pointerType !== 'touch' && matchMedia('(hover: hover)').matches) timer.current = setTimeout(() => setOpen(true), 200)
      }}
      onPointerLeave={() => { clearTimeout(timer.current); if (!button.current?.matches(':focus-visible')) setOpen(false) }}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) { clearTimeout(timer.current); setOpen(true) } }} onBlur={close}>
      <Icon name="return" size={16} />
    </button>
  }><span id={id} role="tooltip">{label}</span></Popover>
}
