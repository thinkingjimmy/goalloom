/**
 * [INPUT]: Provider-neutral text and question payloads.
 * [OUTPUT]: Shared size/token limits and deterministic payload estimates.
 * [POS]: Lightweight smart-input budget boundary, independent of date planning.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const questionBudget = 64
export const textLimit = 4_000
export const dateLimit = 8
export const payloadLimit = 64 * 1024
export const tokenBudget = 24_000

export function estimateTokens(text: string): number {
  let ascii = 0, wide = 0
  for (const char of text) { if (char.charCodeAt(0) < 0x80) ascii++; else wide++ }
  return Math.ceil(wide + ascii / 4)
}
export function payloadSize(state: unknown, questions: unknown): { bytes: number; tokens: number } {
  const body = JSON.stringify({ state, questions })
  return { bytes: new TextEncoder().encode(body).length, tokens: estimateTokens(body) }
}
