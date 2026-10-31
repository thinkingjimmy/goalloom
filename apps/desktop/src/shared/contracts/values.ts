/**
 * [INPUT]: Fixed product planning horizons, supported AI services and the capabilities each one offers.
 * [OUTPUT]: Seven horizons, six ordered period/policy horizons, anchored subsets, calendar modes, next-horizon mapping and fixed AI metadata and hosted operator-consent version.
 * [POS]: Lightweight metadata boundary; importing these values never constructs validation schemas.
 */
export const periodHorizons = ['year', 'half', 'cycle', 'month', 'week', 'day'] as const
export const horizons = ['later', ...periodHorizons] as const
export const anchoredHorizons = ['year', 'half', 'cycle'] as const
export const childHorizons = ['half', 'cycle', 'month', 'week', 'day'] as const
export const policyHorizons = periodHorizons
export const calendarModes = ['rolling', 'natural'] as const
export type PeriodHorizon = typeof periodHorizons[number]
export function mapPeriodHorizons<T>(project: (horizon: PeriodHorizon) => T): Record<PeriodHorizon, T> {
  return Object.fromEntries(periodHorizons.map(horizon => [horizon, project(horizon)])) as Record<PeriodHorizon, T>
}
export type AnchoredHorizon = typeof anchoredHorizons[number]
export const isAnchoredHorizon = (horizon: string): horizon is AnchoredHorizon => anchoredHorizons.some(value => value === horizon)
export const nextHorizon = { later: null, year: 'half', half: 'cycle', cycle: 'month', month: 'week', week: 'day', day: null } as const
export const hostedScopeVersion = 3
export const aiProviders = ['openrouter', 'vercel-gateway', 'hosted'] as const
// jev = TypeSafe's judgement model (smart input); chat = the DeepSeek writing model (flow insight).
export const aiCapabilities = ['jev', 'chat'] as const
export const aiFeatures = ['smart', 'insight'] as const
export const providerCapabilities: Record<typeof aiProviders[number], readonly typeof aiCapabilities[number][]> = { hosted: ['jev', 'chat'], openrouter: ['jev', 'chat'], 'vercel-gateway': ['jev', 'chat'] }
export const featureCapability = { smart: 'jev', insight: 'chat' } as const
// Fixed per provider and capability; main sends exactly these and Settings shows them read-only.
export const providerModels = {
  hosted: { jev: 'typesafe/jev-1.14', chat: 'deepseek/deepseek-v4.1-flash' },
  openrouter: { jev: 'typesafe/jev-1.14', chat: '~deepseek/deepseek-flash-latest' },
  'vercel-gateway': { jev: 'typesafe-ai/jev-1.14.0', chat: 'deepseek/deepseek-v4.1-flash' },
} as const satisfies Record<typeof aiProviders[number], Partial<Record<typeof aiCapabilities[number], string>>>

export const aiFailureKinds = ['account_verification_required', 'rate_limited', 'quota_exhausted', 'payment_required', 'authentication_failed', 'permission_denied', 'routing_policy', 'timeout', 'unavailable', 'malformed_response', 'request_failed', 'too_large', 'credential_unreadable', 'credential_unavailable', 'not_enabled', 'result_not_delivered', 'service_not_started', 'service_expired', 'service_revoked', 'upgrade_required', 'billing_configuration'] as const
