/**
 * [INPUT]: A saved key of a chat-capable provider, a ChatPrompt from domain/smart/insight, an abort signal and optional injected fetch.
 * [OUTPUT]: CHAT_PROVIDERS presets, chatAdapter(provider) — one chat-completions call (fixed DeepSeek flash model, reasoning off, JSON mode) returning raw message text — and the fixed capability sample; typed ProviderFailure/Aborted.
 * [POS]: Flow-insight network boundary beside providers.ts; never logs prompt or reply bodies and follows no URL from responses.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ChatPrompt } from '../../domain/smart/insight'
import { providerModels } from '../../shared/contracts/values'
import { Aborted, classifyFailure, failure, ProviderFailure } from './providers'

export type ChatProvider = 'openrouter' | 'vercel-gateway'
// Reasoning must stay off: with it on, flash spent the token budget thinking and returned empty content in 9 of 12 runs.
// Gateway routes only to DeepSeek's own endpoint; `deepseek/deepseek-v4.1-flash` is what OpenRouter's flash alias resolved to on 2026-09-29.
export const CHAT_PROVIDERS: Record<ChatProvider, { endpoint: string; model: string; options: Record<string, unknown> }> = {
  openrouter: { endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: providerModels.openrouter.chat, options: { reasoning: { enabled: false } } },
  'vercel-gateway': { endpoint: 'https://ai-gateway.vercel.sh/v1/chat/completions', model: providerModels['vercel-gateway'].chat, options: { reasoning: { enabled: false }, providerOptions: { gateway: { only: ['deepseek'] } } } },
}
// Flash usually answers in 1–3 s; the observed tail reached ~10 s, so allow a little more than that.
export const insightTimeoutMs = 15_000
type Fetch = (input: string, init?: RequestInit) => Promise<Response>
export type ChatAdapter = (apiKey: string, prompt: ChatPrompt, signal: AbortSignal) => Promise<string>

// Fixed, non-private capability sample: the reply must be the JSON object the prompt asks for.
export const chatSample: ChatPrompt = { system: 'Reply with the JSON object {"ok":true} and nothing else.', user: '{"check":"goalloom"}', maxTokens: 20 }
export function sampleAnswered(content: string): boolean {
  try { return (JSON.parse(content) as { ok?: unknown }).ok === true } catch { return false }
}

export function chatAdapter(provider: ChatProvider, fetch?: Fetch): ChatAdapter {
  const preset = CHAT_PROVIDERS[provider]
  return async (apiKey, prompt, signal) => {
    if (signal.aborted) throw new Aborted()
    const body = JSON.stringify({ model: preset.model, messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
      temperature: 0.3, max_tokens: prompt.maxTokens, response_format: { type: 'json_object' }, ...preset.options })
    let response: Response
    try {
      response = await (fetch ?? globalThis.fetch)(preset.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.any([signal, AbortSignal.timeout(insightTimeoutMs)]), redirect: 'error' })
    } catch { if (signal.aborted) throw new Aborted(); throw new ProviderFailure(failure('unavailable', provider)) }
    let data: Record<string, unknown>
    try { data = await response.json() as Record<string, unknown> }
    catch { if (signal.aborted) throw new Aborted(); throw new ProviderFailure(response.ok ? failure('malformed_response', provider) : classifyFailure(provider, response.status, null, response.headers, Date.now())) }
    if (!response.ok) throw new ProviderFailure(classifyFailure(provider, response.status, data, response.headers, Date.now()))
    const content = ((data.choices as { message?: { content?: unknown } }[] | undefined)?.[0]?.message?.content)
    if (typeof content !== 'string' || !content.trim()) throw new ProviderFailure(failure('malformed_response', provider))
    return content
  }
}
