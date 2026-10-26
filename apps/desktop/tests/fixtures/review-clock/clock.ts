/**
 * [INPUT]: A canonical instant baked by the explicit fixed-review test builder.
 * [OUTPUT]: One immutable clock shared by the test main and real storage worker.
 * [POS]: Test-only alias; never imported by the production build graph.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
declare const __GOALLOOM_REVIEW_AT__: string
const at = __GOALLOOM_REVIEW_AT__
const milliseconds = Date.parse(at)
if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== at) throw Error('Invalid fixed review instant')
export const workspaceClock = Object.freeze({ now: () => at, nowMs: () => milliseconds })
