/**
 * [INPUT]: Native Temporal supplied by the pinned Electron runtime; polyfill declarations are type-only.
 * [OUTPUT]: The native Temporal API and PlainDate type without a bundled polyfill.
 * [POS]: Shared calendar runtime boundary for domain rules and desktop fixtures.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Temporal as TemporalApi } from '@js-temporal/polyfill'

export const Temporal = (globalThis as unknown as { Temporal: typeof TemporalApi }).Temporal
export type PlainDate = TemporalApi.PlainDate
