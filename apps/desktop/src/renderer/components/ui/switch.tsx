/**
 * [INPUT]: Native button props and the caller-owned checked state and change callback.
 * [OUTPUT]: Accessible switch with the existing 38 × 22 desktop track and native keyboard activation.
 * [POS]: Shared controlled UI primitive; feature components own persistence and labels.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

export function Switch({ checked, onCheckedChange, className, ...props }: Omit<ComponentProps<'button'>, 'onChange' | 'onClick' | 'role' | 'aria-checked'> & { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <button {...props} type="button" role="switch" aria-checked={checked} className={cn('switch group flex h-[22px] w-[38px] shrink-0 rounded-[11px] bg-pressed p-0.5 transition-colors duration-150 ease-out aria-checked:bg-success-mark', className)} onClick={() => onCheckedChange(!checked)}>
    <span className="size-[18px] rounded-[9px] bg-raised shadow-[0_1px_2px_rgba(0,0,0,.2)] transition-transform duration-150 ease-out group-aria-checked:translate-x-4" />
  </button>
}
