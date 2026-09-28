/**
 * [INPUT]: The saved OpenRouter key, a ChatPrompt from domain/smart/insight, an abort signal and optional injected fetch.
 * [OUTPUT]: chatAdapter — one OpenRouter chat-completions call (fixed flash model, reasoning off, JSON mode) returning raw message text; typed ProviderFailure/Aborted.
 * [POS]: Flow-insight network boundary beside providers.ts; never logs prompt or reply bodies and follows no URL from responses.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ChatPrompt } from '../../domain/smart/insight'
import { Aborted, classifyFailure, failure, ProviderFailure } from './providers'

export const INSIGHT_MODEL = '~deepseek/deepseek-flash-latest'
const endpoint = 'https://openrouter.ai/api/v1/chat/completions'
// Flash usually answers in 1–3 s; the observed tail reached ~10 s, so allow a little more than that.
export const insightTimeoutMs = 15_000
type Fetch = (input: string, init?: RequestInit) => Promise<Response>
export type ChatAdapter = (apiKey: string, prompt: ChatPrompt, signal: AbortSignal) => Promise<string>

export function chatAdapter(fetch?: Fetch): ChatAdapter {
  return async (apiKey, prompt, signal) => {
    if (signal.aborted) throw new Aborted()
    // Reasoning must stay off: with it on, flash spent the token budget thinking and returned empty content in 9 of 12 runs.
    const body = JSON.stringify({ model: INSIGHT_MODEL, messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
      temperature: 0.3, max_tokens: prompt.maxTokens, reasoning: { enabled: false }, response_format: { type: 'json_object' } })
    let response: Response
    try {
      response = await (fetch ?? globalThis.fetch)(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.any([signal, AbortSignal.timeout(insightTimeoutMs)]), redirect: 'error' })
    } catch { if (signal.aborted) throw new Aborted(); throw new ProviderFailure(failure('unavailable', 'openrouter')) }
    let data: Record<string, unknown>
    try { data = await response.json() as Record<string, unknown> }
    catch { if (signal.aborted) throw new Aborted(); throw new ProviderFailure(response.ok ? failure('malformed_response', 'openrouter') : classifyFailure('openrouter', response.status, null, response.headers, Date.now())) }
    if (!response.ok) throw new ProviderFailure(classifyFailure('openrouter', response.status, data, response.headers, Date.now()))
    const content = ((data.choices as { message?: { content?: unknown } }[] | undefined)?.[0]?.message?.content)
    if (typeof content !== 'string' || !content.trim()) throw new ProviderFailure(failure('malformed_response', 'openrouter'))
    return content
  }
}
