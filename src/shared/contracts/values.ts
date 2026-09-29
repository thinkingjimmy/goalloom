/**
 * [INPUT]: Fixed product planning horizons, supported AI services and the capabilities each one offers.
 * [OUTPUT]: Shared ordered values used by both schemas and interface controls: horizons, aiProviders (recommended first), aiFeatures, providerCapabilities, featureCapability and the fixed providerModels.
 * [POS]: Lightweight metadata boundary; importing these values never constructs validation schemas.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const horizons = ['later', 'cycle', 'month', 'week', 'day'] as const
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
