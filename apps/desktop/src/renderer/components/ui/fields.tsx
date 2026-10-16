/**
 * [INPUT]: Native field props, shared theme tokens and optional local class overrides.
 * [OUTPUT]: Input and Textarea with common borders, typography and keyboard focus presentation.
 * [POS]: Shared field presentation; callers retain labels, validation, drafts and persistence.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

const field = 'w-full rounded-control border border-border bg-raised px-3 py-[9px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(field, className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(field, 'resize-y leading-[1.7]', className)} {...props} />
}
