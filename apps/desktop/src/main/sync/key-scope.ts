/**
 * [INPUT]: Trusted account, configured project/environment and the main-owned profile directory.
 * [OUTPUT]: Immutable authenticated scope, bounded partition identity and managed local custody path.
 * [POS]: Shared PasswordVault/BindingJournal isolation; renderer input never chooses a partition.
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import { canonicalJson } from '@goalloom/contracts'

export const keyScopeSchema = z.strictObject({ version: z.literal(1), environment: z.enum(['development', 'production']), projectRef: z.string().min(1).max(100), accountId: z.uuid() })
export type KeyScope = z.infer<typeof keyScopeSchema>
export function scopeContext(scope: KeyScope): string { return canonicalJson(keyScopeSchema.parse(scope)) }
export function scopeId(scope: KeyScope): string { return createHash('sha256').update(scopeContext(scope)).digest('hex') }
export function scopeDirectory(directory: string, scope: KeyScope): string { return join(directory, 'sync', 'scopes', scopeId(scope)) }
