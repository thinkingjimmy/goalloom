/**
 * [INPUT]: Existing bounded AI schemas, the current hosted consent scope and provider-neutral Jev questions.
 * [OUTPUT]: Scope-v3 operator/retention consent, protocol-v2 finite actions and separate result/receipt-only reply types; no client-selected identity, model or URL.
 * [POS]: Shared desktop/Edge transport contract. Provider secrets and cost controls remain server-owned.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { hostedScopeVersion } from './values'
import type { ServiceFailureCode } from '@goalloom/contracts'
import { draftRequestSchema, reviewRequestSchema } from './smart-input'
import { assistanceContextSchema, assistanceOutputSchema, assistanceRequestSchema } from './assistance'

const stateKeys = new Set(['text', 'reference', 'periods', 'calendarMode', 'calendarPhrases', 'slots', 'dates', 'goals', 'task', 'reason', 'tasks'])
function textOnly(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true
  if (Array.isArray(value)) return value.every(textOnly)
  const object = value as Record<string, unknown>
  if (Object.keys(object).some(key => ['image_url', 'image', 'audio', 'video', 'file', 'tools', 'messages'].includes(key))) return false
  if (typeof object.type === 'string' && /image|audio|video|file|tool/i.test(object.type)) return false
  return Object.values(object).every(textOnly)
}
const textJson = z.json().refine(textOnly, 'Only inert text context is supported')
const question = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('choice'), instructions: z.union([z.string().max(8000), z.record(z.string().max(100), textJson)]), criteria: z.record(z.string().max(80), z.string().max(4000)) }),
  z.strictObject({ type: z.literal('boolean'), instructions: z.union([z.string().max(8000), z.record(z.string().max(100), textJson)]), criteria: z.strictObject({ true: z.string().max(4000), false: z.string().max(4000) }) }),
])
export const hostedInputSchema = z.discriminatedUnion('capability', [
  z.strictObject({ capability: z.literal('evaluate'), input: z.strictObject({ state: z.record(z.string().max(100), textJson).refine(value => Object.keys(value).length > 0 && Object.keys(value).every(key => stateKeys.has(key))), questions: z.record(z.string().max(100), question).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 64) }) }),
  z.strictObject({ capability: z.literal('draft'), input: draftRequestSchema }),
  z.strictObject({ capability: z.literal('review'), input: reviewRequestSchema }),
  z.strictObject({ capability: z.literal('assistance'), input: z.strictObject({ context: assistanceContextSchema, request: assistanceRequestSchema, conversation: z.array(z.strictObject({ turn: z.number().int().min(1).max(3), input: z.strictObject({ text: z.string().max(4000), answer: z.string().max(4000).nullable(), adjustment: z.string().max(4000).nullable() }), output: assistanceOutputSchema })).max(2) }) }),
])
export type HostedInput = z.infer<typeof hostedInputSchema>
export const hostedActionSchema = z.strictObject({ version: z.literal(2), consentScopeVersion: z.literal(hostedScopeVersion), actionId: z.uuidv7(), request: hostedInputSchema })
export { hostedScopeVersion }

export const hostedProtocolVersion = 2

export type HostedReceiptStatus = 'running' | 'unknown' | 'ready' | 'failed' | 'expired'
export type HostedReceiptFailure = 'outcome_pending' | 'result_not_delivered' | 'malformed_response' | 'provider_failed' | 'too_large' | 'outcome_unknown' | 'outcome_lost' | 'reconciliation_closed'
export type HostedHttpFailure = ServiceFailureCode | HostedReceiptFailure | 'not_found' | 'configuration' | 'unavailable' | 'authentication_failed' | 'permission_denied' | 'invalid_request' | 'method_not_allowed' | 'routing_policy' | 'action_expired' | 'account_protection' | 'platform_budget' | 'account_budget' | 'platform_concurrency' | 'account_concurrency' | 'platform_rate' | 'account_rate'
// Receipt-only replies cannot acquire a result field when the server adds metadata.
export type HostedReceiptReply = { status: HostedReceiptStatus; error: HostedReceiptFailure; confirmed: boolean; retryAt?: string; result?: never }
export type HostedResultReply = { status: 'ready'; result: unknown; error?: never; confirmed?: never; retryAt?: never }
export type HostedErrorReply = { error: HostedHttpFailure; retryAt?: string; status?: never; result?: never; confirmed?: never }
export type HostedReply = HostedReceiptReply | HostedResultReply | HostedErrorReply
