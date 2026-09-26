/**
 * [INPUT]: Fixed product planning horizons and supported Jev providers.
 * [OUTPUT]: Shared ordered values used by both schemas and interface controls.
 * [POS]: Lightweight metadata boundary; importing these values never constructs validation schemas.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const horizons = ['later', 'cycle', 'month', 'week', 'day'] as const
export const jevProviders = ['typesafe', 'vercel-gateway', 'openrouter'] as const
