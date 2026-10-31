/**
 * [INPUT]: Radix Select primitives, shared Tailwind menu styles and explicit Hugeicons.
 * [OUTPUT]: Select, SelectTrigger, SelectValue, SelectContent and SelectItem with caller style overrides.
 * [POS]: Shared shadcn selection control; preserves native-dialog portal ownership and focus behavior.
 */
// shadcn/ui Select, MIT; Radix primitives with Hugeicons instead of lucide.
import { menuStyles } from './menu'
import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { cn } from '../../lib/utils'
import { Icon } from '../icons'

// A modal <dialog> sits in the top layer and makes the rest of the page inert, so the list must portal into it.
const PortalContainer = React.createContext<{ container: HTMLElement | null; track: (node: HTMLElement | null) => void }>({ container: null, track: () => undefined })

export function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  const [container, setContainer] = React.useState<HTMLElement | null>(null)
  const track = React.useCallback((node: HTMLElement | null) => setContainer(node?.closest('dialog') ?? null), [])
  return <PortalContainer.Provider value={{ container, track }}><SelectPrimitive.Root data-slot="select" {...props} /></PortalContainer.Provider>
}

export function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <span className="select-value min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"><SelectPrimitive.Value data-slot="select-value" {...props} /></span>
}

export function SelectTrigger({ className, children, ...props }: Omit<React.ComponentProps<typeof SelectPrimitive.Trigger>, 'ref'>) {
  const { track } = React.useContext(PortalContainer)
  return <SelectPrimitive.Trigger ref={track} data-slot="select-trigger" className={cn('select-trigger flex w-full items-center gap-2.5 rounded-control border border-border bg-raised px-3 py-[9px] text-left text-[14px] font-normal text-foreground hover:border-[var(--edit-line,var(--line))] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-expanded:outline-2 aria-expanded:outline-offset-1 aria-expanded:outline-ring', className)} {...props}>
    {children}
    <SelectPrimitive.Icon className="select-icon flex shrink-0"><Icon name="expand" size={16} /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
}

export function SelectContent({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const { container } = React.useContext(PortalContainer)
  return <SelectPrimitive.Portal container={container ?? undefined}>
    <SelectPrimitive.Content data-slot="select-content" position="popper" sideOffset={6} align="start" collisionPadding={8} className={cn(menuStyles.surface, 'menu select-menu', className)} {...props}>
      <SelectPrimitive.ScrollUpButton className="select-scroll"><Icon name="up" size={14} /></SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="select-viewport flex flex-col">{children}</SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="select-scroll"><Icon name="expand" size={14} /></SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item data-slot="select-item" className={cn(menuStyles.item, 'menu-item select-item shrink-0 cursor-default outline-none select-none', className)} {...props}>
    <span className={cn(menuStyles.check, 'menu-check')}><SelectPrimitive.ItemIndicator><Icon name="check" size={14} /></SelectPrimitive.ItemIndicator></span>
    <span className={cn(menuStyles.text, 'menu-text')}><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></span>
  </SelectPrimitive.Item>
}
