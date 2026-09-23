// shadcn/ui Button，MIT；采用 Radix Slot/CVA，不引入第二图标库。
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50',
  { variants: {
    variant: { default: 'bg-primary text-primary-foreground hover:opacity-90', outline: 'border border-border bg-card hover:bg-muted', ghost: 'hover:bg-muted' },
    size: { default: 'h-11 px-5 py-2', icon: 'size-11' },
  }, defaultVariants: { variant: 'default', size: 'default' } },
)

export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button'
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
