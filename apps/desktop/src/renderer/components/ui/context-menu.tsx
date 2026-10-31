/**
 * [INPUT]: Radix Context Menu primitives, shared Tailwind menu styles and caller props.
 * [OUTPUT]: Context-menu root, trigger, content, item, submenu and separator components.
 * [POS]: Shared shadcn context-menu presentation; Radix retains interaction and focus ownership.
 */
// shadcn/ui Context Menu, MIT.
import { menuStyles } from './menu'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

export const ContextMenu = ContextMenuPrimitive.Root
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger

export function ContextMenuContent({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return <ContextMenuPrimitive.Portal><ContextMenuPrimitive.Content collisionPadding={8} className={cn(menuStyles.surface, 'menu context-menu', className)} {...props} /></ContextMenuPrimitive.Portal>
}

export function ContextMenuItem({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Item>) {
  return <ContextMenuPrimitive.Item className={cn(menuStyles.item, 'menu-item context-menu-item', className)} {...props} />
}

export const ContextMenuSub = ContextMenuPrimitive.Sub
export function ContextMenuSubTrigger({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
  return <ContextMenuPrimitive.SubTrigger className={cn(menuStyles.item, 'menu-item context-menu-item', className)} {...props} />
}
export function ContextMenuSubContent({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return <ContextMenuPrimitive.Portal><ContextMenuPrimitive.SubContent collisionPadding={8} sideOffset={4} className={cn(menuStyles.surface, 'menu context-menu context-submenu', className)} {...props} /></ContextMenuPrimitive.Portal>
}
export function ContextMenuSeparator({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator className={cn('context-menu-separator', className)} {...props} />
}
