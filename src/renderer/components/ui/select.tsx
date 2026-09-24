/**
 * [INPUT]: @radix-ui/react-select 的 Root/Trigger/Content/Item；renderer icons 的 Hugeicons。
 * [OUTPUT]: shadcn/ui Select 组合件：Select、SelectTrigger、SelectValue、SelectContent、SelectItem。
 * [POS]: components/ui 的通用单选下拉，替代系统原生 select；外观复用 .select-trigger / .menu / .menu-item，与时区下拉一致。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
// shadcn/ui Select, MIT; Radix primitives with Hugeicons instead of lucide.
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
  return <span className="select-value"><SelectPrimitive.Value data-slot="select-value" {...props} /></span>
}

export function SelectTrigger({ className, children, ...props }: Omit<React.ComponentProps<typeof SelectPrimitive.Trigger>, 'ref'>) {
  const { track } = React.useContext(PortalContainer)
  return <SelectPrimitive.Trigger ref={track} data-slot="select-trigger" className={cn('select-trigger', className)} {...props}>
    {children}
    <SelectPrimitive.Icon className="select-icon"><Icon name="expand" size={16} /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
}

export function SelectContent({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const { container } = React.useContext(PortalContainer)
  return <SelectPrimitive.Portal container={container ?? undefined}>
    <SelectPrimitive.Content data-slot="select-content" position="popper" sideOffset={6} align="start" collisionPadding={8} className={cn('menu select-menu', className)} {...props}>
      <SelectPrimitive.ScrollUpButton className="select-scroll"><Icon name="up" size={14} /></SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="select-viewport">{children}</SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="select-scroll"><Icon name="expand" size={14} /></SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item data-slot="select-item" className={cn('menu-item select-item', className)} {...props}>
    <span className="menu-check"><SelectPrimitive.ItemIndicator><Icon name="check" size={14} /></SelectPrimitive.ItemIndicator></span>
    <span className="menu-text"><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></span>
  </SelectPrimitive.Item>
}
