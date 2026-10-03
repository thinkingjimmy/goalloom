/**
 * [INPUT]: Validated actions, DeviceStore, adapters, a workspace reader and injected clock.
 * [OUTPUT]: Revision-guarded provider/feature configuration, per-capability connection tests, cancellable analysis, per-provider cooldown and account failures, renderer-session preview cache and uncached flow-insight draft/review calls on the insight feature's provider.
 * [POS]: Lightweight main-process service; analysis loads its planner on demand and HTTP never holds a storage transaction.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHash } from 'node:crypto'
import { checkBoolean, checkChoice, ContractError } from '../../domain/smart/distribution'
import { payloadSize, payloadLimit, tokenBudget, questionBudget, textLimit } from '../../domain/smart/budget'
import type { SmartContext } from '../../domain/smart/questions'
import type { Round } from '../../domain/smart/preview'
import { aiFeatures, aiProviders, featureCapability, providerCapabilities } from '../../shared/contracts/values'
import { smartActionSchema, type AiFeature, type AiProvider, type AnalyzeEcho, type AnalyzeReply, type AnalyzeRequest, type Diagnostics, type DraftRequest, type Failure, type FailureKind, type ReviewRequest, type SmartReply, type SmartStatus, type TestOutcome } from '../../shared/contracts/smart-input'
import type { ChatPrompt } from '../../domain/smart/insight'
import { chatSample, sampleAnswered, type ChatAdapter, type ChatProvider } from './insight'
import { blankProvider, type DeviceConfig, type DeviceStore } from './credentials'
import { Aborted, failure, JEV_PROVIDERS, ProviderFailure, type Adapter, type EvaluateOutput } from './providers'
import { serverText } from '../../shared/i18n/server'

export interface WorkspaceReader {
  generation(): Promise<string>
  context(text: string, hints: string[], referenceTime: string): Promise<SmartContext | null>
}
export interface ServiceOptions { store: DeviceStore; adapters: Record<AiProvider, Adapter>; chat?: Partial<Record<ChatProvider, ChatAdapter>>; reader: WorkspaceReader; now?: () => number; unsignedBuild: boolean; openExternal?: (url: string) => void }

// Fixed, non-private sample: a real judgement plus schema check, so a key string alone never counts as connected.
const sample = {
  state: { text: '样例：今天整理本周周报', reference: { date: '2000-01-03', weekday: '周一' } },
  questions: {
    horizon: { type: 'choice' as const, instructions: '根据 state.text，这件事打算在什么时间范围去做？', criteria: { day: '今天', week: '本周', later: '没有写执行时间' } },
    task: { type: 'boolean' as const, instructions: 'state.text 是否描述了一件要做的事？', criteria: { true: '是', false: '不是' } },
  },
}
// Account-level problems stay on the provider until a later call succeeds; request-level ones only reach the caller.
const accountFailures: ReadonlySet<FailureKind> = new Set(['account_verification_required', 'quota_exhausted', 'payment_required', 'authentication_failed', 'permission_denied', 'routing_policy'])
const credentialFailure = (state: 'missing' | 'unreadable' | 'unavailable', provider: AiProvider, missing: FailureKind) => failure(state === 'unavailable' ? 'credential_unavailable' : state === 'unreadable' ? 'credential_unreadable' : missing, provider)
const usable = (config: DeviceConfig, feature: AiFeature, provider: AiProvider | null): provider is AiProvider =>
  !!provider && !!config.providers[provider].consentedAt && !!config.providers[provider].capabilities[featureCapability[feature]]

export class SmartInputService {
  private chains = new Map<string, AbortController>()
  private cache = new Map<string, { reply: AnalyzeReply; bytes: number }>()
  private cacheBytes = 0
  private cacheGeneration: string | null = null
  private cooldownUntil = new Map<AiProvider, number>()
  private configurationRevision = 0
  private connections = new Set<AbortController>()
  private configurationQueue: Promise<unknown> = Promise.resolve()
  private readonly now: () => number
  constructor(private readonly options: ServiceOptions) { this.now = options.now ?? Date.now }

  private clearCache(): void { this.cache.clear(); this.cacheBytes = 0 }

  async handle(input: unknown): Promise<SmartReply> {
    const action = smartActionSchema.parse(input)
    switch (action.type) {
      case 'status': return this.reply(action.generation, null)
      case 'connect': return this.reply(action.generation, await this.connect(action.generation, action.provider, action.apiKey))
      case 'feature': await this.feature(action.generation, action.feature, action.provider, action.enabled); return this.reply(action.generation, null)
      case 'forget': {
        this.configurationRevision++; this.abortAll()
        await this.update(async config => {
          await this.options.store.removeKey(action.provider)
          config.providers[action.provider] = blankProvider()
          for (const feature of aiFeatures) {
            const current = config.features[feature]
            if (current.provider === action.provider) config.features[feature] = { provider: null, revision: current.revision + 1, enabledForGeneration: null }
          }
        })
        this.cooldownUntil.delete(action.provider)
        return this.reply(action.generation, null)
      }
      case 'dismiss': await this.update(config => { if (!config.dismissed.includes(action.notice)) config.dismissed.push(action.notice) }); return this.reply(action.generation, null)
      case 'openConsole': this.options.openExternal?.(JEV_PROVIDERS[action.provider].console); return { type: 'cancelled' }
      case 'analyze': return { type: 'analysis', reply: await this.analyze(action.request) }
      case 'cancel': this.chains.get(action.draftSessionId)?.abort(); this.chains.delete(action.draftSessionId); return { type: 'cancelled' }
      case 'draft': return { type: 'draft', reply: await this.insight(action.request, async request => {
        const { draftPrompt, parseDraft } = await import('../../domain/smart/insight')
        return { prompt: draftPrompt(request), parse: (content: string) => parseDraft(content, request) }
      }) }
      case 'review': return { type: 'review', reply: await this.insight(action.request, async request => {
        const { reviewPrompt, parseReview } = await import('../../domain/smart/insight')
        return { prompt: reviewPrompt(request), parse: parseReview }
      }) }
    }
  }

  async status(generation: string): Promise<SmartStatus> {
    const config = await this.options.store.config()
    const reads = Object.fromEntries(await Promise.all(aiProviders.map(async provider => [provider, (await this.options.store.readKey(provider)).state] as const))) as Record<AiProvider, SmartStatus['providers'][AiProvider]['credential']>
    const providers = Object.fromEntries(aiProviders.map(provider => {
      const value = config.providers[provider], until = this.cooldownUntil.get(provider) ?? 0
      return [provider, { credential: reads[provider], keyHint: value.keyHint, consentedAt: value.consentedAt, verifiedAt: value.verifiedAt, capabilities: value.capabilities, lastFailure: value.lastFailure,
        cooldownUntil: until > this.now() ? new Date(until).toISOString() : null }]
    })) as SmartStatus['providers']
    const features = Object.fromEntries(aiFeatures.map(feature => {
      const { provider, revision, enabledForGeneration } = config.features[feature]
      const ready = usable(config, feature, provider) && reads[provider] === 'saved'
      return [feature, { provider, revision, enabled: ready && enabledForGeneration === generation, paused: ready && enabledForGeneration !== null && enabledForGeneration !== generation }]
    })) as SmartStatus['features']
    return { providers, features, dismissed: config.dismissed, unsignedBuild: this.options.unsignedBuild }
  }
  private async reply(generation: string, test: TestOutcome | null): Promise<SmartReply> { return { type: 'status', status: await this.status(generation), test } }
  private configure<T>(action: () => Promise<T>): Promise<T> {
    const pending = this.configurationQueue.then(action)
    this.configurationQueue = pending.catch(() => undefined)
    return pending
  }
  private update(change: (config: DeviceConfig) => void | Promise<void>): Promise<void> {
    return this.configure(async () => {
      const config = await this.options.store.config()
      await change(config)
      await this.options.store.saveConfig(config)
    })
  }
  private abortAll(): void {
    for (const chain of [...this.chains.values(), ...this.connections]) chain.abort()
    this.chains.clear(); this.connections.clear(); this.clearCache()
  }
  releaseSession(): void {
    this.configurationRevision++
    this.abortAll()
    this.cacheGeneration = null
  }
  private coolingDown(provider: AiProvider): Failure | null {
    const until = this.cooldownUntil.get(provider) ?? 0
    return until > this.now() ? failure('rate_limited', provider, 429, new Date(until).toISOString()) : null
  }
  // --- A provider failure starts its cooldown and, when account-level, stays visible in Settings › AI services until the next success. ---
  private async record(provider: AiProvider, outcome: Failure | null): Promise<void> {
    if (outcome?.kind === 'rate_limited') this.cooldownUntil.set(provider, Date.parse(outcome.retryAt!))
    const kept = outcome && accountFailures.has(outcome.kind) ? outcome : null
    const config = await this.options.store.config()
    if (JSON.stringify(config.providers[provider].lastFailure) === JSON.stringify(kept) || (outcome && !kept)) return
    await this.update(current => { current.providers[provider].lastFailure = kept }).catch(() => undefined)
  }

  // --- Choosing a provider or switching a feature: enabling needs that provider's verified capability, consent and a readable key. ---
  private async feature(generation: string, feature: AiFeature, provider: AiProvider | null, enabled: boolean): Promise<void> {
    if (generation !== await this.options.reader.generation()) return
    if (enabled && provider && (await this.options.store.readKey(provider)).state !== 'saved') return
    await this.update(config => {
      const current = config.features[feature]
      if (enabled && !usable(config, feature, provider)) return
      const next = { provider, enabledForGeneration: enabled ? generation : null }
      if (current.provider === next.provider && current.enabledForGeneration === next.enabledForGeneration) return
      config.features[feature] = { ...next, revision: current.revision + 1 }
    })
    if (feature === 'smart') { this.configurationRevision++; this.abortAll() }
  }

  // --- Test every capability the provider offers with the candidate key; any pass saves it, and switches on features that had no provider yet. ---
  private async connect(generation: string, provider: AiProvider, apiKey: string | null): Promise<TestOutcome> {
    const revision = ++this.configurationRevision
    this.abortAll()
    const controller = new AbortController()
    this.connections.add(controller)
    const result = (value: Failure | null, extra: Partial<TestOutcome> = {}): TestOutcome => ({ ok: false, failure: value, sampleMatched: null, results: {}, enabled: [], ...extra })
    const superseded = () => result(failure('not_enabled', provider))
    const current = () => revision === this.configurationRevision && !controller.signal.aborted
    try {
      if (generation !== await this.options.reader.generation()) return superseded()
      let key = apiKey
      if (key === null) {
        const read = await this.options.store.readKey(provider)
        if (read.state !== 'saved') return result(credentialFailure(read.state, provider, 'authentication_failed'))
        key = read.key
      }
      if (!current()) return superseded()
      const capable = providerCapabilities[provider]
      const tests = await Promise.all(capable.map(capability => capability === 'jev' ? this.testJev(provider, key, controller.signal) : this.testChat(provider, key, controller.signal)))
      if (!current()) return superseded()
      const results = Object.fromEntries(capable.map((capability, index) => [capability, { ok: tests[index]!.ok, failure: tests[index]!.failure }])) as TestOutcome['results']
      const sampleMatched = capable.includes('jev') ? tests[capable.indexOf('jev')]!.matched : null
      const failed = tests.find(test => !test.ok)?.failure ?? null
      for (const test of tests) if (test.failure?.kind === 'rate_limited') this.cooldownUntil.set(provider, Date.parse(test.failure.retryAt!))
      if (!tests.some(test => test.ok)) return result(failed, { results, sampleMatched })
      return await this.configure(async () => {
        if (!current() || generation !== await this.options.reader.generation()) return superseded()
        let hint: string | null = null
        if (apiKey !== null) {
          // Serialize credential commits with forget/feature changes; HTTP never holds this queue.
          try { hint = await this.options.store.saveKey(provider, apiKey) }
          catch { return result(failure('credential_unavailable', provider), { results, sampleMatched }) }
        }
        const config = await this.options.store.config()
        if (!current() || generation !== await this.options.reader.generation()) return superseded()
        const at = new Date(this.now()).toISOString(), previous = config.providers[provider]
        const capabilities = { ...(apiKey === null ? previous.capabilities : { jev: null, chat: null }) }
        capable.forEach((capability, index) => { if (tests[index]!.ok) capabilities[capability] = at })
        const blocking = failed && accountFailures.has(failed.kind) ? failed : null
        config.providers[provider] = { consentedAt: previous.consentedAt ?? at, verifiedAt: at, keyHint: hint ?? previous.keyHint, capabilities, lastFailure: blocking }
        const enabled: AiFeature[] = []
        for (const feature of aiFeatures) {
          const setting = config.features[feature]
          if (setting.provider !== null || !capabilities[featureCapability[feature]]) continue
          config.features[feature] = { provider, revision: setting.revision + 1, enabledForGeneration: generation }
          enabled.push(feature)
        }
        await this.options.store.saveConfig(config)
        this.clearCache()
        return { ok: true, failure: failed, sampleMatched, results, enabled }
      })
    } finally { this.connections.delete(controller) }
  }
  private async testJev(provider: AiProvider, key: string, signal: AbortSignal): Promise<{ ok: boolean; failure: Failure | null; matched: boolean | null }> {
    let output: EvaluateOutput
    try { output = await this.options.adapters[provider](key, { ...sample, signal }) }
    catch (error) { return { ok: false, failure: error instanceof ProviderFailure ? error.failure : failure('unavailable', provider), matched: null } }
    try {
      const horizon = checkChoice(output.answers.horizon, Object.keys(sample.questions.horizon.criteria), output.precision)
      checkBoolean(output.answers.task)
      return { ok: true, failure: null, matched: horizon.choice === 'day' }
    } catch { return { ok: false, failure: failure('malformed_response', provider), matched: null } }
  }
  private async testChat(provider: AiProvider, key: string, signal: AbortSignal): Promise<{ ok: boolean; failure: Failure | null; matched: null }> {
    const chat = this.options.chat?.[provider as ChatProvider]
    if (!chat) return { ok: false, failure: failure('unavailable', provider), matched: null }
    try { return (sampleAnswered(await chat(key, chatSample, signal))) ? { ok: true, failure: null, matched: null } : { ok: false, failure: failure('malformed_response', provider), matched: null } }
    catch (error) { return { ok: false, failure: error instanceof ProviderFailure ? error.failure : failure('unavailable', provider), matched: null } }
  }

  async analyze(request: AnalyzeRequest): Promise<AnalyzeReply> {
    const revision = this.configurationRevision
    const echo: AnalyzeEcho = { requestId: request.requestId, draftSessionId: request.draftSessionId, inputRevision: request.inputRevision, manualRevision: request.manualRevision, generation: request.generation, providerRevision: request.providerRevision, contextRevision: request.contextRevision, referenceTime: request.referenceTime }
    const failed = (value: Failure): AnalyzeReply => ({ status: 'failed', echo, failure: value })
    // Register before file reads: cancel/release must also cover a request still in preflight.
    this.chains.get(request.draftSessionId)?.abort()
    const controller = new AbortController()
    this.chains.set(request.draftSessionId, controller)
    let provider: AiProvider = 'openrouter'
    try {
      const checkCurrent = () => { if (revision !== this.configurationRevision || controller.signal.aborted) throw new Aborted() }
      const config = await this.options.store.config()
      checkCurrent()
      const setting = config.features.smart
      provider = setting.provider ?? 'openrouter'
      if (!usable(config, 'smart', setting.provider) || setting.enabledForGeneration !== request.generation || setting.revision !== request.providerRevision) return failed(failure('not_enabled', provider))
      const generation = await this.options.reader.generation()
      checkCurrent()
      if (request.generation !== generation) return failed(failure('not_enabled', provider))
      const cooling = this.coolingDown(provider)
      if (cooling) return failed(cooling)
      const read = await this.options.store.readKey(provider)
      checkCurrent()
      if (read.state !== 'saved') return failed(credentialFailure(read.state, provider, 'not_enabled'))
      if ([...request.text].length > textLimit) return failed({ ...failure('too_large', provider), message: serverText().smart.textTooLong(textLimit) })
      const context = await this.options.reader.context(request.text, request.parentHints, request.referenceTime)
      checkCurrent()
      if (!context) return failed(failure('not_enabled', provider))
      const [{ planQuestions, relationRound }, { buildPreview, taskSlots }] = await Promise.all([import('../../domain/smart/questions'), import('../../domain/smart/preview')])
      checkCurrent()
      const plan = planQuestions(context)
      if ('kind' in plan) return failed({ ...failure('too_large', provider), message: plan.message })
      checkCurrent()
      if (this.cacheGeneration !== request.generation) { this.clearCache(); this.cacheGeneration = request.generation }
      const cacheKey = createHash('sha256').update(JSON.stringify([request.generation, provider, setting.revision, JEV_PROVIDERS[provider].model, plan.state, plan.questions, context.periods, context.candidates])).digest('hex')
      const cached = this.cache.get(cacheKey)
      if (cached?.reply.status === 'ready') { this.cache.delete(cacheKey); this.cache.set(cacheKey, cached); return { ...cached.reply, echo } }
      const diagnostics: Diagnostics[] = []
      let questionsSent = 0
      const call = async (state: typeof plan.state, questions: typeof plan.questions): Promise<Round> => {
        checkCurrent()
        const size = payloadSize(state, questions)
        questionsSent += Object.keys(questions).length
        if (size.bytes > payloadLimit || size.tokens > tokenBudget || questionsSent > questionBudget) throw new ProviderFailure(failure('too_large', provider))
        const started = this.now()
        const output = await this.options.adapters[provider](read.key, { state, questions, signal: controller.signal })
        checkCurrent()
        diagnostics.push({ provider, ...output.meta, estimatedInputTokens: size.tokens, latencyMs: Math.max(0, Math.round(this.now() - started)) })
        return { answers: output.answers, precision: output.precision }
      }
      const first = await call(plan.state, plan.questions)
      let supplement: Parameters<typeof buildPreview>[3] = null
      if (plan.deferredRelations) {
        const next = relationRound(plan, taskSlots(plan, first), context.candidates, Object.keys(plan.questions).length)!
        supplement = { pairs: next.pairs, round: Object.keys(next.questions).length ? await call(next.state, next.questions) : { answers: {}, precision: first.precision } }
      }
      const reply: AnalyzeReply = { status: 'ready', echo, preview: buildPreview(context, plan, first, supplement), diagnostics }
      if (config.providers[provider].lastFailure) await this.record(provider, null)
      const bytes = Buffer.byteLength(JSON.stringify(reply))
      while (this.cache.size && (this.cache.size >= 32 || this.cacheBytes + bytes > 512 * 1024)) { const key = this.cache.keys().next().value!; this.cacheBytes -= this.cache.get(key)!.bytes; this.cache.delete(key) }
      if (bytes <= 512 * 1024) { this.cache.set(cacheKey, { reply, bytes }); this.cacheBytes += bytes }
      return reply
    } catch (error) {
      if (error instanceof Aborted || controller.signal.aborted) return { status: 'cancelled', echo }
      if (error instanceof ContractError) return failed(failure('malformed_response', provider))
      if (error instanceof ProviderFailure) { await this.record(provider, error.failure); return failed(error.failure) }
      return failed(failure('unavailable', provider))
    } finally { if (this.chains.get(request.draftSessionId) === controller) this.chains.delete(request.draftSessionId) }
  }

  // --- Flow insight: one chat call per request on the insight feature's provider; gated like analysis, never cached or logged. ---
  private async insight<R extends DraftRequest | ReviewRequest, T>(request: R, build: (request: R) => Promise<{ prompt: ChatPrompt; parse: (content: string) => T }>):
    Promise<{ status: 'ready'; requestId: string; value: T } | { status: 'failed'; requestId: string; failure: Failure }> {
    const failed = (value: Failure) => ({ status: 'failed' as const, requestId: request.requestId, failure: value })
    const revision = this.configurationRevision
    const controller = new AbortController()
    this.connections.add(controller)
    let provider: AiProvider = 'openrouter'
    try {
      const config = await this.options.store.config()
      const setting = config.features.insight
      provider = setting.provider ?? 'openrouter'
      const chat = this.options.chat?.[provider as ChatProvider]
      if (!chat || !usable(config, 'insight', setting.provider) || setting.enabledForGeneration !== request.generation) return failed(failure('not_enabled', provider))
      if (request.generation !== await this.options.reader.generation()) return failed(failure('not_enabled', provider))
      const cooling = this.coolingDown(provider)
      if (cooling) return failed(cooling)
      const read = await this.options.store.readKey(provider)
      if (read.state !== 'saved') return failed(credentialFailure(read.state, provider, 'not_enabled'))
      const { prompt, parse } = await build(request)
      const content = await chat(read.key, prompt, controller.signal)
      if (revision !== this.configurationRevision) return failed(failure('not_enabled', provider))
      if (config.providers[provider].lastFailure) await this.record(provider, null)
      try { return { status: 'ready' as const, requestId: request.requestId, value: parse(content) } }
      catch { return failed(failure('malformed_response', provider)) }
    } catch (error) {
      if (error instanceof ProviderFailure) { await this.record(provider, error.failure); return failed(error.failure) }
      return failed(failure(error instanceof Aborted || controller.signal.aborted ? 'not_enabled' : 'unavailable', provider))
    } finally { this.connections.delete(controller) }
  }
}
