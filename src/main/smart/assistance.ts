/**
 * [INPUT]: Device configuration, the existing chat adapters and a short authoritative context reader.
 * [OUTPUT]: Local preflight tickets or normal cancellation, with owned cleanup and bounded sessions retaining accepted multi-turn context.
 * [POS]: Main-only network coordinator; no raw content is logged or persisted and no write is performed here.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import type { AssistanceContext, AssistanceEcho, AssistancePrepare, AssistancePrepared, AssistanceReply, AssistanceRequest } from '../../shared/contracts/assistance'
import type { CommandOf } from '../../shared/contracts/commands'
import { DomainError } from '../../shared/contracts/commands'
import type { AiProvider, Failure } from '../../shared/contracts/smart-input'
import type { DeviceConfig, KeyRead } from './credentials'
import type { ChatAdapter } from './insight'
import { Aborted, failure, ProviderFailure } from './providers'
import { assistanceServerText } from '../../shared/i18n/assistance'
import type { AssistanceTurn } from '../../domain/smart/assistance'

interface Dependencies {
  config(): Promise<DeviceConfig>; generation(): Promise<string>; context(itemId: string, generation: string): Promise<AssistanceContext>
  key(provider: AiProvider): Promise<KeyRead>; chat: Partial<Record<AiProvider, ChatAdapter>>
  now(): number; cooling(provider: AiProvider): Failure | null; record(provider: AiProvider, outcome: Failure | null): Promise<void>
}
interface Session { controller: AbortController; prepared: AssistancePrepared | null; turns: number; clarified: boolean; conversation: AssistanceTurn[]; last: AssistanceReply | null; signature: string | null; bytes: number }
export class AssistanceService {
  private sessions = new Map<string, Session>()
  constructor(private readonly dependencies: Dependencies) {}
  cancel(sessionId: string): void {
    this.sessions.get(sessionId)?.controller.abort()
    this.sessions.delete(sessionId)
  }
  release(provider?: AiProvider): void {
    for (const [id, session] of this.sessions) if (!provider || session.prepared?.provider === provider || !session.prepared) this.cancel(id)
  }
  private trim() {
    while (this.sessions.size > 8 || [...this.sessions.values()].reduce((sum, row) => sum + row.bytes, 0) > 512 * 1024) this.cancel(this.sessions.keys().next().value!)
  }
  private account(session: Session) {
    session.bytes = Buffer.byteLength(JSON.stringify([session.prepared, session.conversation, session.last])) + Buffer.byteLength(session.signature ?? '')
    this.trim()
  }
  async prepare(request: AssistancePrepare): Promise<AssistancePrepared | null> {
    this.cancel(request.sessionId)
    const session: Session = { controller: new AbortController(), prepared: null, turns: 0, clarified: false, conversation: [], last: null, signature: null, bytes: 0 }
    this.sessions.set(request.sessionId, session)
    this.trim()
    const active = () => this.sessions.get(request.sessionId) === session && !session.controller.signal.aborted
    const discard = () => { if (this.sessions.get(request.sessionId) === session) this.cancel(request.sessionId); return null }
    try {
      const context = await this.dependencies.context(request.itemId, request.generation)
      if (!active()) return discard()
      const config = await this.dependencies.config()
      if (!active()) return discard()
      const generation = await this.dependencies.generation()
      if (!active() || request.generation !== generation) return discard()
      const setting = config.features.insight, provider = setting.provider
      const prepared: AssistancePrepared = { ...request, contextId: randomUUID(), context,
        expiresAt: new Date(this.dependencies.now() + 10 * 60_000).toISOString(), featureRevision: setting.revision, provider,
        enabled: !!provider && setting.enabledForGeneration === request.generation && !!config.providers[provider].capabilities.chat,
        consented: !!provider && config.providers[provider].assistanceConsent?.version === 1,
      }
      session.prepared = prepared; this.account(session)
      return active() ? prepared : discard()
    } catch (error) {
      const cancelled = !active() || error instanceof Aborted
      discard()
      if (cancelled) return null
      throw error
    }
  }
  private async current(prepared: AssistancePrepared, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted || Date.parse(prepared.expiresAt) <= this.dependencies.now()) return false
    const config = await this.dependencies.config(), setting = config.features.insight, provider = prepared.provider
    if (!provider || setting.provider !== provider || setting.revision !== prepared.featureRevision || setting.enabledForGeneration !== prepared.generation
      || !config.providers[provider].capabilities.chat || !config.providers[provider].consentedAt || config.providers[provider].assistanceConsent?.version !== 1
      || prepared.generation !== await this.dependencies.generation()) return false
    const context = await this.dependencies.context(prepared.itemId, prepared.generation)
    return !signal?.aborted && JSON.stringify(context.guard) === JSON.stringify(prepared.context.guard)
  }
  async validateApply(command: CommandOf<'applyAssistance'>): Promise<void> {
    // Lost-receipt retries are checked by the caller before a ticket is needed again.
    const prepared = [...this.sessions.values()].find(row => row.prepared?.contextId === command.contextId)?.prepared
    if (!prepared || prepared.itemId !== command.itemId || prepared.generation !== command.generation
      || JSON.stringify(prepared.context.guard) !== JSON.stringify(command.guard) || !await this.current(prepared)) throw new DomainError('stale_preview', assistanceServerText().contextChanged)
  }
  async assist(request: AssistanceRequest): Promise<AssistanceReply> {
    const { prefs: _prefs, text: _text, answer: _answer, adjustment: _adjustment, ...echo } = request
    const session = this.sessions.get(request.sessionId), prepared = session?.prepared
    const stale = (): AssistanceReply => ({ status: 'stale', echo })
    if (!session || !prepared || prepared.contextId !== request.contextId || prepared.itemId !== request.itemId || prepared.generation !== request.generation
      || prepared.locale !== request.locale || prepared.featureRevision !== request.featureRevision) return stale()
    if (session.last?.echo.requestId === request.requestId) return session.signature === JSON.stringify(request) ? session.last : stale()
    if (request.turn !== session.turns + 1 || request.turn > 3) return stale()
    session.turns = request.turn; session.signature = JSON.stringify(request)
    this.sessions.delete(request.sessionId); this.sessions.set(request.sessionId, session); this.account(session)
    session.controller.abort(); session.controller = new AbortController()
    const controller = session.controller, provider = prepared.provider ?? 'openrouter'
    const failed = (value: Failure): AssistanceReply => { const reply: AssistanceReply = { status: 'failed', echo, failure: value }; session.last = reply; this.account(session); return reply }
    try {
      const config = await this.dependencies.config()
      if (config.providers[provider].assistanceConsent?.version !== 1) return failed({ ...failure('not_enabled', provider), message: assistanceServerText().consentRequired })
      if (!await this.current(prepared, controller.signal)) return controller.signal.aborted ? { status: 'cancelled', echo } : stale()
      const cooling = this.dependencies.cooling(provider)
      if (cooling) return failed(cooling)
      const key = await this.dependencies.key(provider), chat = this.dependencies.chat[provider]
      if (controller.signal.aborted) throw new Aborted()
      if (key.state !== 'saved' || !chat) return failed(failure(key.state === 'unreadable' ? 'credential_unreadable' : key.state === 'unavailable' ? 'credential_unavailable' : 'not_enabled', provider))
      const { assistancePrompt, parseAssistance } = await import('../../domain/smart/assistance')
      const context = structuredClone(prepared.context)
      let prompt
      try { prompt = assistancePrompt(context, request, session.conversation) } catch { return failed(failure('too_large', provider)) }
      if (controller.signal.aborted) throw new Aborted()
      const content = await chat(key.key, prompt, controller.signal)
      if (controller.signal.aborted || this.sessions.get(request.sessionId) !== session) throw new Aborted()
      if (!await this.current(prepared, controller.signal)) return stale()
      let value
      try { value = parseAssistance(content) } catch { return failed(failure('malformed_response', provider)) }
      if (value.kind === 'clarify') {
        if (session.clarified || request.turn !== 1) return failed(failure('malformed_response', provider))
        session.clarified = true
      }
      await this.dependencies.record(provider, null)
      if (controller.signal.aborted || this.sessions.get(request.sessionId) !== session) throw new Aborted()
      if (!await this.current(prepared, controller.signal)) return stale()
      const reply: AssistanceReply = { status: 'ready', echo: echo as AssistanceEcho, provider, value, facts: prepared.context.facts, truncatedSections: context.truncatedSections }
      session.conversation.push({ turn: request.turn, input: { text: request.text, answer: request.answer, adjustment: request.adjustment }, output: structuredClone(value) })
      session.last = reply; this.account(session)
      return reply
    } catch (error) {
      if (error instanceof Aborted || controller.signal.aborted) return { status: 'cancelled', echo }
      if (error instanceof ProviderFailure) { await this.dependencies.record(provider, error.failure); return failed(error.failure) }
      return failed(failure('unavailable', provider))
    }
  }
}
