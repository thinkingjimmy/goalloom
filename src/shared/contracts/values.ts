/**
 * [INPUT]: Fixed product planning horizons, supported AI services and the capabilities each one offers.
 * [OUTPUT]: Seven horizons, six period horizons, anchored/policy subsets, calendar modes, next-horizon mapping and fixed AI metadata.
 * [POS]: Lightweight metadata boundary; importing these values never constructs validation schemas.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const periodHorizons = ['year', 'half', 'cycle', 'month', 'week', 'day'] as const
export const horizons = ['later', ...periodHorizons] as const
export const anchoredHorizons = ['year', 'half', 'cycle'] as const
export const childHorizons = ['half', 'cycle', 'month', 'week', 'day'] as const
export const policyHorizons = ['cycle', 'month', 'week', 'day'] as const
export const calendarModes = ['rolling', 'natural'] as const
export type PeriodHorizon = typeof periodHorizons[number]
export function mapPeriodHorizons<T>(project: (horizon: PeriodHorizon) => T): Record<PeriodHorizon, T> {
  return Object.fromEntries(periodHorizons.map(horizon => [horizon, project(horizon)])) as Record<PeriodHorizon, T>
}
export type AnchoredHorizon = typeof anchoredHorizons[number]
export const isAnchoredHorizon = (horizon: string): horizon is AnchoredHorizon => anchoredHorizons.some(value => value === horizon)
export const nextHorizon = { later: null, year: 'half', half: 'cycle', cycle: 'month', month: 'week', week: 'day', day: null } as const
export const aiProviders = ['openrouter', 'vercel-gateway', 'typesafe'] as const
// jev = TypeSafe's judgement model (smart input); chat = the DeepSeek writing model (flow insight).
export const aiCapabilities = ['jev', 'chat'] as const
export const aiFeatures = ['smart', 'insight'] as const
export const providerCapabilities: Record<typeof aiProviders[number], readonly typeof aiCapabilities[number][]> = { openrouter: ['jev', 'chat'], 'vercel-gateway': ['jev', 'chat'], typesafe: ['jev'] }
export const featureCapability = { smart: 'jev', insight: 'chat' } as const
// Fixed per provider and capability; main sends exactly these and Settings shows them read-only.
export const providerModels = {
  openrouter: { jev: 'typesafe/jev-1.13', chat: '~deepseek/deepseek-flash-latest' },
  'vercel-gateway': { jev: 'typesafe-ai/jev', chat: 'deepseek/deepseek-v4.1-flash' },
  typesafe: { jev: 'jev-latest' },
} as const satisfies Record<typeof aiProviders[number], Partial<Record<typeof aiCapabilities[number], string>>>
