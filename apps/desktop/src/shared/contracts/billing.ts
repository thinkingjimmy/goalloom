/**
 * [INPUT]: Finite renderer billing intents and trusted main-process account projections.
 * [OUTPUT]: Strict billing actions/status/events without tokens, provider URLs or account selectors.
 * [POS]: Main/preload/renderer billing boundary, independent of sync setup and AI consent.
 */
import { z } from 'zod'

export const billingChannel = 'goalloom:billing'
export const billingEvent = 'goalloom:billing-state'
export const billingCycles = ['monthly', 'annual'] as const
export const billingMutationKinds = ['claim_trial', 'checkout', 'portal', 'switch', 'cancel', 'resume', 'remove_switch'] as const
export const billingErrors = ['authentication_failed', 'billing_configuration', 'billing_pending', 'billing_unavailable',
  'billing_request_conflict', 'billing_review_required', 'billing_source_mismatch', 'subscription_exists',
  'subscription_missing', 'checkout_expired', 'renewal_confirmation_required', 'billing_invalid_cycle',
  'network', 'storage', 'upgrade_required', 'continuation_expired'] as const
export const billingEnvironmentSchema = z.enum(['development', 'production'])
export const billingCycleSchema = z.enum(billingCycles)
export const billingContinuationSchema = z.strictObject({
  version: z.literal(1), id: z.uuid(), locale: z.enum(['en', 'zh-CN', 'ja', 'es', 'fr']),
  transport: z.enum(['app', 'loopback']), port: z.number().int().min(1024).max(65535).optional(),
}).refine(value => value.transport === 'loopback' ? value.port !== undefined : value.port === undefined)
export const billingActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status') }),
  z.strictObject({ type: z.literal('refresh') }),
  z.strictObject({ type: z.literal('claim_trial'), expectedAccountId: z.uuid() }),
  z.strictObject({ type: z.literal('checkout'), cycle: billingCycleSchema, expectedAccountId: z.uuid() }),
  z.strictObject({ type: z.literal('portal'), expectedAccountId: z.uuid() }),
  z.strictObject({ type: z.literal('switch'), cycle: billingCycleSchema, expectedAccountId: z.uuid() }),
  z.strictObject({ type: z.literal('cancel'), expectedAccountId: z.uuid() }),
  z.strictObject({ type: z.literal('resume'), expectedAccountId: z.uuid() }),
  z.strictObject({ type: z.literal('remove_switch'), expectedAccountId: z.uuid() }),
  z.strictObject({ type: z.literal('recover'), expectedAccountId: z.uuid() }),
])
export const billingPriceSchema = z.strictObject({ amount: z.number().int().nonnegative(), currency: z.literal('USD') })
export const billingSubscriptionSchema = z.strictObject({
  status: z.string().max(64), cycle: billingCycleSchema.nullable(), endsAt: z.iso.datetime({ offset: true }).nullable(), cancelAtPeriodEnd: z.boolean(),
  nextCycle: billingCycleSchema.nullable(), nextAmount: z.number().int().nonnegative().nullable(), nextCurrency: z.literal('USD').nullable(),
})
export const billingAccessSchema = z.strictObject({
  status: z.enum(['none', 'trialing', 'active', 'verification_pending', 'expired', 'revoked']),
  eligible: z.boolean(), serverNow: z.iso.datetime({ offset: true }), effectiveEnd: z.iso.datetime({ offset: true }).nullable(), trialEligible: z.boolean(),
  grace: z.boolean(), prices: z.strictObject({ monthly: billingPriceSchema, annual: billingPriceSchema }),
  subscriptions: billingSubscriptionSchema.array().max(20),
})
export const billingStateSchema = z.strictObject({
  accountId: z.uuid().nullable(), environment: billingEnvironmentSchema,
  access: billingAccessSchema.nullable(), busy: z.boolean(), error: z.enum(billingErrors).nullable(),
  pending: z.strictObject({ action: z.enum(billingMutationKinds), cycle: billingCycleSchema.nullable(), browserOpened: z.boolean(), returnToThisDevice: z.boolean().nullable() }).nullable(),
})
export type BillingCycle = z.infer<typeof billingCycleSchema>
export type BillingRequest = z.infer<typeof billingActionSchema>
type WithoutOwnerGuard<T> = T extends unknown ? Omit<T, 'expectedAccountId'> : never
export type BillingAction = WithoutOwnerGuard<BillingRequest>
export type BillingState = z.infer<typeof billingStateSchema>
export type BillingAccess = z.infer<typeof billingAccessSchema>
export type BillingEnvironment = z.infer<typeof billingEnvironmentSchema>
export type BillingMutation = typeof billingMutationKinds[number]
export type BillingError = typeof billingErrors[number]
export type BillingContinuation = z.infer<typeof billingContinuationSchema>
