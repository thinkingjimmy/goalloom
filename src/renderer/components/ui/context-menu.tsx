// shadcn/ui Context Menu, MIT; Radix primitives styled with the shared menu tokens.
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

export const ContextMenu = ContextMenuPrimitive.Root
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger

export function ContextMenuContent({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return <ContextMenuPrimitive.Portal><ContextMenuPrimitive.Content collisionPadding={8} className={cn('menu context-menu', className)} {...props} /></ContextMenuPrimitive.Portal>
}

export function ContextMenuItem({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Item>) {
  return <ContextMenuPrimitive.Item className={cn('menu-item context-menu-item', className)} {...props} />
}

export const ContextMenuSub = ContextMenuPrimitive.Sub
export function ContextMenuSubTrigger({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
  return <ContextMenuPrimitive.SubTrigger className={cn('menu-item context-menu-item', className)} {...props} />
}
export function ContextMenuSubContent({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return <ContextMenuPrimitive.Portal><ContextMenuPrimitive.SubContent collisionPadding={8} sideOffset={4} className={cn('menu context-menu', className)} {...props} /></ContextMenuPrimitive.Portal>
}
export function ContextMenuSeparator({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator className={cn('context-menu-separator', className)} {...props} />
}
