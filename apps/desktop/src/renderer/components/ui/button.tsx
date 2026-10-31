/**
 * [INPUT]: Native button props, Radix Slot, shared theme tokens and CVA variants.
 * [OUTPUT]: Button plus action, settings, icon and text controls with the existing desktop densities.
 * [POS]: Shared shadcn button boundary; semantic classes remain stable for feature skins and DOM hooks.
 */
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50',
  { variants: {
    variant: { default: 'bg-primary text-primary-foreground hover:opacity-90', outline: 'border border-border bg-card hover:bg-muted', ghost: 'hover:bg-muted', unstyled: '' },
    size: { default: 'h-11 px-5 py-2', icon: 'size-11' },
  }, defaultVariants: { variant: 'default', size: 'default' } },
)

export function Button({ className, variant, size, asChild = false, type = 'button', ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button'
  return <Component data-slot="button" type={asChild ? undefined : type} className={variant === 'unstyled' ? className : cn(buttonVariants({ variant, size, className }))} {...props} />
}

const actionVariants = cva('button inline-flex h-9 items-center gap-2 rounded-action px-[14px] text-[13px] font-medium whitespace-nowrap', {
  variants: { variant: {
    default: 'bg-hover',
    soft: 'soft bg-hover enabled:hover:bg-pressed aria-expanded:bg-pressed',
    primary: 'primary bg-foreground text-background',
    quiet: 'quiet text-muted-foreground enabled:hover:text-foreground',
  } }, defaultVariants: { variant: 'default' },
})

export function ActionButton({ className, variant, ...props }: React.ComponentProps<'button'> & VariantProps<typeof actionVariants>) {
  return <Button variant="unstyled" className={cn(actionVariants({ variant }), className)} {...props} />
}

// Disabled solid controls use a flat tint so their labels remain readable in both themes.
const settingsVariants = cva('settings-button h-[30px] shrink-0 rounded-control border border-border px-3 text-[12px] whitespace-nowrap transition-[background-color,opacity] duration-150 ease-out enabled:hover:bg-hover', {
  variants: { variant: {
    default: '',
    primary: 'primary h-8 border-0 bg-foreground px-[14px] text-[13px] text-background enabled:hover:bg-foreground enabled:hover:opacity-[.88] disabled:bg-pressed disabled:text-subtle disabled:opacity-100',
    subtle: 'subtle h-7 border-0 bg-hover px-2.5 text-soft enabled:hover:bg-pressed',
    ghost: 'ghost h-8 border-0 text-[13px] text-soft',
    danger: 'danger border-0 bg-destructive-tint font-medium text-destructive enabled:hover:bg-destructive-tint enabled:hover:opacity-[.85]',
    'danger-solid': 'danger-solid h-8 border-0 bg-destructive px-4 text-[13px] font-medium text-background enabled:hover:bg-destructive enabled:hover:opacity-90 disabled:bg-pressed disabled:text-subtle disabled:opacity-100',
    'subtle-danger': 'subtle-danger border-0 text-muted-foreground enabled:hover:bg-destructive-tint enabled:hover:text-destructive',
    link: 'link h-7 border-0 px-2.5 text-focus',
  } }, defaultVariants: { variant: 'default' },
})

export function SettingsButton({ className, variant, ...props }: React.ComponentProps<'button'> & VariantProps<typeof settingsVariants>) {
  return <Button variant="unstyled" className={cn(settingsVariants({ variant }), className)} {...props} />
}

const iconVariants = cva('icon-button inline-grid shrink-0 place-items-center hover:bg-hover aria-pressed:bg-pressed aria-expanded:bg-pressed aria-pressed:text-foreground aria-expanded:text-foreground', {
  variants: { size: {
    default: 'size-9 rounded-control text-muted-foreground hover:text-foreground',
    small: 'small size-7 rounded-icon-small text-subtle hover:text-muted-foreground',
  } }, defaultVariants: { size: 'default' },
})

export function IconButton({ className, size, ...props }: React.ComponentProps<'button'> & VariantProps<typeof iconVariants>) {
  return <Button variant="unstyled" className={cn(iconVariants({ size }), className)} {...props} />
}

export function TextButton({ className, ...props }: React.ComponentProps<'button'>) {
  // Keep the DOM marker outside merging: text-* also names Tailwind colors.
  return <Button variant="unstyled" className={`text-button ${cn('text-left text-[13px] leading-[22px] text-muted-foreground enabled:hover:text-foreground', className)}`} {...props} />
}
