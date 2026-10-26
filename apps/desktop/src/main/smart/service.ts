/**
 * [INPUT]: Validated actions, DeviceStore, adapters, a workspace reader and injected clock.
 * [OUTPUT]: Revision-guarded services, durable hosted-attempt authorization, budgeted analysis, claimed completion and session previews/drafts/reviews.
 * [POS]: Lightweight main-process service; analysis loads its planner on demand and HTTP never holds a storage transaction.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHash } from 'node:crypto'
import { checkBoolean, checkChoice, ContractError } from '../../domain/smart/distribution'
import { payloadSize, payloadLimit, tokenBudget, questionBudget, textLimit } from '../../domain/smart/budget'
import type { SmartContext } from '../../domain/smart/questions'
import type { Round } from '../../domain/smart/preview'
import { aiFeatures, aiProviders, featureCapability, providerCapabilities } from '../../shared/contracts/values'
import { smartActionSchema, type AiFeature, type AiProvider, type AnalyzeEcho, type AnalyzeReply, type AnalyzeRequest, type Diagnostics, type DraftRequest, type Failure, type FailureKind, type ReviewRequest, type SmartAction, type SmartReply, type SmartStatus, type TestOutcome, insightEvidenceSchema } from '../../shared/contracts/smart-input'
import type { HostedInput } from '../../shared/contracts/hosted-ai'
import type { ChatPrompt } from '../../domain/smart/insight'
import { chatSample, sampleAnswered, type ChatAdapter, type ChatProvider } from './insight'
import { isSecretFingerprint, parseSetting } from '@goalloom/contracts'
import { blankProvider, type DeviceConfig, type DeviceStore, type ProviderConfig } from './credentials'
import { Aborted, failure, JEV_PROVIDERS, ProviderFailure, type Adapter, type EvaluateOutput } from './providers'
import { AssistanceService } from './assistance'
import type { AssistanceContext } from '../../shared/contracts/assistance'
import type { CommandOf } from '../../shared/contracts/commands'
import { serverText } from '../../shared/i18n/server'
import { CaptureCoordinator } from './capture'
import type { CreationSelection } from '../../shared/contracts/capture'
import type { Command, CommandResult } from '../../shared/contracts/commands'
import { HostedAttempts } from './attempts'
import { EvaluationQueue } from './queue'

export interface WorkspaceReader {
  generation(): Promise<string>
  insightEvidence?(itemId: string, generation: string, cutoff?: string): Promise<import('zod').infer<typeof insightEvidenceSchema>>
  assistance?(itemId: string, generation: string): Promise<AssistanceContext>
  context(text: string, hints: string[], referenceTime: string, target?: AnalyzeRequest['target']): Promise<SmartContext | null>
}
export interface ServiceOptions { hostedAttempts?: HostedAttempts; store: DeviceStore; hostedEligibility?: () => Promise<boolean | null>; adapters: Partial<Record<AiProvider, Adapter>>; chat?: Partial<Record<ChatProvider, ChatAdapter>>; reader: WorkspaceReader; now?: () => number; unsignedBuild: boolean; openExternal?: (url: string) => void; onSyncedSettings?: (entries: { key: string; value: unknown }[]) => void; completeCreation?: (command: CommandOf<'completeCreation'>) => Promise<CommandResult> }

// Fixed, non-private sample: a real judgement plus schema check, so a key string alone never counts as connected.
const sample = {
  state: { text: '样例：今天整理本周周报', reference: { date: '2000-01-03', weekday: '周一' } },
  questions: {
    horizon: { type: 'choice' as const, instructions: '根据 state.text，这件事打算在什么时间范围去做？', criteria: { day: '今天', week: '本周', later: '没有写执行时间' } },
    task: { type: 'boolean' as const, instructions: 'state.text 是否描述了一件要做的事？', criteria: { true: '是', false: '不是' } },
  },
}
// Account-level problems stay on the provider until a later call succeeds; request-level ones only reach the caller.
const accountFailures: ReadonlySet<FailureKind> = new Set(['account_verification_required', 'quota_exhausted', 'payment_required', 'authentication_failed', 'permission_denied', 'routing_policy', 'service_not_started', 'service_expired', 'service_revoked', 'upgrade_required', 'billing_configuration'])
const credentialFailure = (state: 'missing' | 'unreadable' | 'unavailable', provider: AiProvider, missing: FailureKind) => failure(state === 'unavailable' ? 'credential_unavailable' : state === 'unreadable' ? 'credential_unreadable' : missing, provider)
const usable = (config: DeviceConfig, feature: AiFeature, provider: AiProvider | null): provider is AiProvider =>
  !!provider && !!config.providers[provider].consentedAt && !!config.providers[provider].capabilities[featureCapability[feature]]
const metaOf = (provider: ProviderConfig) => ({
  consentedAt: provider.consentedAt, verifiedAt: provider.verifiedAt, keyHint: provider.keyHint,
  capabilities: provider.capabilities, assistanceConsent: provider.assistanceConsent,
})

const analyzeEcho = (request: AnalyzeRequest): AnalyzeEcho => ({ requestId: request.requestId, draftSessionId: request.draftSessionId, inputRevision: request.inputRevision, manualRevision: request.manualRevision, generation: request.generation, providerRevision: request.providerRevision, contextRevision: request.contextRevision, referenceTime: request.referenceTime })
function cancelledModelReply(action: SmartAction, provider: AiProvider): SmartReply {
  if (action.type === 'analyze') return { type: 'analysis', reply: { status: 'cancelled', echo: analyzeEcho(action.request) } }
  if (action.type === 'assist') {
    const { mode: _mode, prefs: _prefs, text: _text, answer: _answer, adjustment: _adjustment, ...echo } = action.request
    return { type: 'assistance', reply: { status: 'cancelled', echo } }
  }
  const failed = { status: 'failed' as const, requestId: 'request' in action && 'requestId' in action.request ? action.request.requestId : '', failure: failure('not_enabled', provider) }
  if (action.type === 'draft') return { type: 'draft', reply: failed }
  if (action.type === 'review') return { type: 'review', reply: failed }
  return { type: 'cancelled' }
}

export class SmartInputService {
  private readonly hostedAttempts: HostedAttempts
  private readonly captures: CaptureCoordinator
  private readonly evaluations = new EvaluationQueue()
  private completionChanged?: () => void
  private readonly assistance: AssistanceService
  private insightControllers = new Set<AbortController>()
  private chains = new Map<string, AbortController>()
  private cache = new Map<string, { reply: AnalyzeReply; bytes: number }>()
  private cacheBytes = 0
  private cacheGeneration: string | null = null
  private cooldownUntil = new Map<AiProvider, number>()
  private configurationRevision = 0
  private connections = new Set<AbortController>()
  private configurationQueue: Promise<unknown> = Promise.resolve()
  private readonly now: () => number
  constructor(private readonly options: ServiceOptions) {
    this.now = options.now ?? Date.now
    this.hostedAttempts = options.hostedAttempts ?? new HostedAttempts()
    this.captures = new CaptureCoordinator({ analyze: request => this.runAnalysis(request), abort: id => this.chains.get(id)?.abort(),
      ...(options.completeCreation ? { write: options.completeCreation } : {}), changed: () => this.completionChanged?.() })
    this.assistance = new AssistanceService({
      config: () => options.store.config(), generation: () => options.reader.generation(),
      context: (itemId, generation) => options.reader.assistance ? options.reader.assistance(itemId, generation) : Promise.reject(new Error('Assistance reader unavailable')),
      key: provider => options.store.readKey(provider), chat: options.chat ?? {}, now: this.now,
      cooling: provider => this.coolingDown(provider), record: (provider, outcome) => this.record(provider, outcome),
    })
  }
  validateAssistanceApply(command: CommandOf<'applyAssistance'>): Promise<void> { return this.assistance.validateApply(command) }
  onCaptureChanged(callback: () => void): void { this.completionChanged = callback }
  prepareCreation(command: Command): CreationSelection | undefined { return this.captures.prepare(command) }
  created(command: Command, receipt: CommandResult): void { this.captures.created(command, receipt) }
  creationFailed(command: Command): void { this.captures.failed(command) }
  observeCommand(command: Command): void { this.captures.observe(command) }

  /** Saved keys only. A missing key is not seeded as null, so another computer's key is not deleted. */
  async syncedSettingEntries(): Promise<{ key: string; value: unknown }[]> {
    const config = await this.options.store.config()
    const entries: { key: string; value: unknown }[] = []
    for (const provider of aiProviders.filter(value => value !== 'hosted')) {
      const read = await this.options.store.readKey(provider)
      if (read.state === 'saved') entries.push({ key: `ai.key.${provider}`, value: read.key })
      if (config.providers[provider].consentedAt || config.providers[provider].verifiedAt) entries.push({ key: `ai.meta.${provider}`, value: metaOf(config.providers[provider]) })
      else if (read.state === 'saved') entries.push({ key: `ai.meta.${provider}`, value: metaOf(config.providers[provider]) })
    }
    for (const feature of aiFeatures) {
      const setting = config.features[feature]
      if (setting.provider !== 'hosted' && (setting.provider || setting.enabledForGeneration)) entries.push({ key: `ai.feature.${feature}`, value: { provider: setting.provider, enabled: setting.enabledForGeneration !== null } })
    }
    return entries
  }

  /** The keychain value for a synced secret. `undefined` means the cipher cannot be read yet. */
  async syncedSecret(key: string): Promise<string | null | undefined> {
    if (key !== 'ai.key.openrouter' && key !== 'ai.key.vercel-gateway') return undefined
    const provider = key.slice('ai.key.'.length) as AiProvider
    const read = await this.options.store.readKey(provider)
    if (read.state === 'saved') return read.key
    if (read.state === 'missing') return null
    return undefined
  }

  /** Applies one remote setting into the keychain or device config. Does not emit another op. */
  async applyRemoteSetting(key: string, value: unknown): Promise<void> {
    const setting = parseSetting(key, value)
    if ((setting.key === 'ai.key.openrouter' || setting.key === 'ai.key.vercel-gateway') && isSecretFingerprint(setting.value)) return
    if (setting.key === 'ai.key.openrouter' || setting.key === 'ai.key.vercel-gateway') {
      const provider = setting.key.slice('ai.key.'.length) as AiProvider
      if (setting.value === null) { await this.options.store.removeKey(provider); return }
      const current = await this.options.store.readKey(provider)
      if (current.state === 'saved' && current.key === setting.value) return
      await this.options.store.saveKey(provider, setting.value)
      return
    }
    if (setting.key === 'ai.meta.openrouter' || setting.key === 'ai.meta.vercel-gateway') {
      const provider = setting.key.slice('ai.meta.'.length) as AiProvider
      await this.update(config => {
        const current = config.providers[provider]
        config.providers[provider] = { ...current, ...setting.value, lastFailure: current.lastFailure }
      })
      return
    }
    if (setting.key === 'ai.feature.smart' || setting.key === 'ai.feature.insight') {
      const feature = setting.key.slice('ai.feature.'.length) as AiFeature
      const generation = await this.options.reader.generation()
      let changed = false
      await this.update(config => {
        const current = config.features[feature]
        const enabledForGeneration = setting.value.enabled ? generation : null
        if (current.provider === setting.value.provider && current.enabledForGeneration === enabledForGeneration) return
        changed = true
        config.features[feature] = { provider: setting.value.provider, revision: current.revision + 1, enabledForGeneration }
      })
      if (changed) this.releaseSession()
    }
  }

  private publish(entries: { key: string; value: unknown }[]): void {
    if (entries.length) this.options.onSyncedSettings?.(entries)
  }

  private async publishProvider(provider: AiProvider): Promise<void> {
    const config = await this.options.store.config()
    if (provider === 'hosted') return
    this.publish([{ key: `ai.meta.${provider}`, value: metaOf(config.providers[provider]) }])
  }

  private clearCache(): void { this.cache.clear(); this.cacheBytes = 0 }

  async handle(input: unknown): Promise<SmartReply> {
    const action = smartActionSchema.parse(input)
    if (['feature', 'forget', 'consentAssistance'].includes(action.type) && 'provider' in action && action.provider === 'hosted'
      && (!('accountId' in action) || !action.accountId || action.accountId !== this.options.store.accountId())) return { type: 'cancelled' }
    if (['analyze', 'draft', 'review', 'assist'].includes(action.type) && 'request' in action) {
      const revision = this.configurationRevision
      const config = await this.options.store.config(), feature = action.type === 'analyze' ? 'smart' : 'insight'
      const setting = config.features[feature], source = 'source' in action ? action.source : undefined
      if (revision !== this.configurationRevision || source && (source.provider !== setting.provider || source.revision !== setting.revision || source.sessionRevision !== this.configurationRevision
        || source.provider === 'hosted' && (!source.accountId || source.accountId !== this.options.store.accountId()))
        || !source && setting.provider === 'hosted') return cancelledModelReply(action, setting.provider ?? source?.provider ?? 'openrouter')
    }
    switch (action.type) {
      case 'prepareAssistance': {
        const prepared = await this.assistance.prepare(action.request)
        return prepared ? { type: 'assistancePrepared', prepared } : { type: 'cancelled' }
      }
      case 'assist': return { type: 'assistance', reply: await this.assistance.assist(action.request) }
      case 'cancelAssistance': this.assistance.cancel(action.sessionId); return { type: 'cancelled' }
      case 'consentAssistance': {
        if (action.generation === await this.options.reader.generation()) {
          await this.update(config => { config.providers[action.provider].assistanceConsent = { version: 1, at: new Date(this.now()).toISOString() } })
          await this.publishProvider(action.provider)
        }
        return this.reply(action.generation, null)
      }
      case 'consentHosted': {
        if (action.accountId === this.options.store.accountId() && action.generation === await this.options.reader.generation()) {
          await this.update(config => {
            if (action.accountId !== this.options.store.accountId()) return
            const stamp = new Date(this.now()).toISOString()
            config.providers.hosted = { ...blankProvider(), consentedAt: stamp, capabilities: { jev: stamp, chat: stamp } }
          })
        }
        return this.reply(action.generation, null)
      }
      case 'status': return this.reply(action.generation, null)
      case 'connect': return this.reply(action.generation, await this.connect(action.generation, action.provider, action.apiKey))
      case 'feature': await this.feature(action.generation, action.feature, action.provider, action.enabled); return this.reply(action.generation, null)
      case 'forget': {
        this.configurationRevision++; this.abortAll()
        const cleared: AiFeature[] = []
        await this.update(async config => {
          await this.options.store.removeKey(action.provider)
          config.providers[action.provider] = blankProvider()
          for (const feature of aiFeatures) {
            const current = config.features[feature]
            if (current.provider !== action.provider) continue
            cleared.push(feature)
            config.features[feature] = { provider: null, revision: current.revision + 1, enabledForGeneration: null }
          }
        })
        this.cooldownUntil.delete(action.provider)
        const config = await this.options.store.config()
        if (action.provider !== 'hosted') this.publish([
          { key: `ai.key.${action.provider}`, value: null },
          { key: `ai.meta.${action.provider}`, value: metaOf(config.providers[action.provider]) },
          ...cleared.map(feature => ({ key: `ai.feature.${feature}`, value: { provider: null, enabled: false } })),
        ])
        return this.reply(action.generation, null)
      }
      case 'dismiss': await this.update(config => { if (!config.dismissed.includes(action.notice)) config.dismissed.push(action.notice) }); return this.reply(action.generation, null)
      case 'openConsole': if (action.provider === 'hosted') return { type: 'cancelled' }; this.options.openExternal?.(JEV_PROVIDERS[action.provider].console); return { type: 'cancelled' }
      case 'analyze': return { type: 'analysis', reply: await this.analyze(action.request) }
      case 'cancel': this.captures.cancelDraft(action.draftSessionId); return { type: 'cancelled' }
      case 'draft': return { type: 'draft', reply: await this.insight(action.request, async request => {
        const { draftPrompt, parseDraft } = await import('../../domain/smart/insight')
        const projected = await this.projectInsight(request)
        return { hosted: { capability: 'draft', input: projected }, prompt: draftPrompt(projected), parse: (content: string) => parseDraft(content, request) }
      }) }
      case 'review': return { type: 'review', reply: await this.insight(action.request, async request => {
        const { reviewPrompt, parseReview } = await import('../../domain/smart/insight')
        const projected = await this.projectInsight(request)
        return { hosted: { capability: 'review', input: projected }, prompt: reviewPrompt(projected), parse: parseReview }
      }) }
    }
  }

  accountChanged(): Promise<void> {
    this.releaseSession()
    return this.configure(() => this.options.store.activateAccount())
  }
  async status(generation: string): Promise<SmartStatus> {
    await this.configurationQueue
    const owner = this.options.store.accountId()
    const hostedEligible = owner ? await this.options.hostedEligibility?.() ?? null : null
    const config = await this.options.store.config()
    const reads = Object.fromEntries(await Promise.all(aiProviders.map(async provider => [provider, (await this.options.store.readKey(provider)).state] as const))) as Record<AiProvider, SmartStatus['providers'][AiProvider]['credential']>
    const providers = Object.fromEntries(aiProviders.map(provider => {
      const value = config.providers[provider], until = this.cooldownUntil.get(provider) ?? 0
      return [provider, { credential: reads[provider], keyHint: value.keyHint, assistanceConsent: value.assistanceConsent, consentedAt: value.consentedAt, verifiedAt: value.verifiedAt, capabilities: value.capabilities, lastFailure: value.lastFailure,
        cooldownUntil: until > this.now() ? new Date(until).toISOString() : null }]
    })) as SmartStatus['providers']
    const features = Object.fromEntries(aiFeatures.map(feature => {
      const { provider, revision, enabledForGeneration } = config.features[feature]
      const ready = usable(config, feature, provider) && reads[provider] === 'saved' && (provider !== 'hosted' || hostedEligible === true)
      return [feature, { provider, revision, enabled: ready && enabledForGeneration === generation, paused: provider === 'hosted' && !owner || ready && enabledForGeneration !== null && enabledForGeneration !== generation }]
    })) as SmartStatus['features']
    return { sessionRevision: this.configurationRevision, hostedEligible: owner === this.options.store.accountId() ? hostedEligible : null, hostedAccountId: this.options.store.accountId(), providers, features, dismissed: config.dismissed, unsignedBuild: this.options.unsignedBuild }
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
    this.captures.clear()
    this.assistance.release()
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
    const stored = await this.options.store.config()
    const setting = stored.features[feature]
    if (provider !== 'hosted') this.publish([{ key: `ai.feature.${feature}`, value: { provider: setting.provider, enabled: setting.enabledForGeneration !== null } }])
    if (feature === 'insight') { this.assistance.release(); for (const controller of this.insightControllers) controller.abort() }
    if (feature === 'smart') { this.configurationRevision++; this.abortAll() }
  }

  // --- Test every capability the provider offers with the candidate key; any pass saves it, and switches on features that had no provider yet. ---
  private async connect(generation: string, provider: AiProvider, apiKey: string | null): Promise<TestOutcome> {
    if (provider === 'hosted') return { ok: false, failure: failure('not_enabled', provider), sampleMatched: null, results: {}, enabled: [] }
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
        config.providers[provider] = { consentedAt: previous.consentedAt ?? at, verifiedAt: at, keyHint: hint ?? previous.keyHint, capabilities, lastFailure: blocking, assistanceConsent: previous.assistanceConsent }
        const enabled: AiFeature[] = []
        for (const feature of aiFeatures) {
          const setting = config.features[feature]
          if (setting.provider !== null || !capabilities[featureCapability[feature]]) continue
          config.features[feature] = { provider, revision: setting.revision + 1, enabledForGeneration: generation }
          enabled.push(feature)
        }
        await this.options.store.saveConfig(config)
        this.clearCache()
        const saved = apiKey === null ? null : apiKey
        this.publish([
          ...(saved ? [{ key: `ai.key.${provider}`, value: saved }] : []),
          { key: `ai.meta.${provider}`, value: metaOf(config.providers[provider]) },
          ...enabled.map(feature => ({ key: `ai.feature.${feature}`, value: { provider, enabled: true } })),
        ])
        return { ok: true, failure: failed, sampleMatched, results, enabled }
      })
    } finally { this.connections.delete(controller) }
  }
  private async testJev(provider: AiProvider, key: string, signal: AbortSignal): Promise<{ ok: boolean; failure: Failure | null; matched: boolean | null }> {
    let output: EvaluateOutput
    try { output = await this.options.adapters[provider]!(key, { ...sample, signal }) }
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

  analyze(request: AnalyzeRequest): Promise<AnalyzeReply> { return this.captures.analyze(request) }
  private async runAnalysis(request: AnalyzeRequest): Promise<AnalyzeReply> {
    const revision = this.configurationRevision
    const echo = analyzeEcho(request)
    const failed = (value: Failure): AnalyzeReply => ({ status: 'failed', echo, failure: value })
    // Register before file reads: cancel/release must also cover a request still in preflight.
    const controller = new AbortController()
    this.chains.set(request.requestId, controller)
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
      const context = await this.options.reader.context(request.text, request.parentHints, request.referenceTime, request.target)
      checkCurrent()
      if (!context) return failed(failure('not_enabled', provider))
      if (request.generation !== await this.options.reader.generation()) return { status: 'cancelled', echo }
      checkCurrent()
      const { matchingPlan, matchedPreview, plainPreview, urlOnly } = await import('../../domain/smart/matching')
      checkCurrent()
      if (urlOnly(request.text)) return { status: 'ready', echo, preview: plainPreview(context, request.text), diagnostics: [] }
      const plan = matchingPlan(context, request)
      if ('kind' in plan) return failed({ ...failure('too_large', provider), message: plan.message })
      checkCurrent()
      if (this.cacheGeneration !== request.generation) { this.clearCache(); this.cacheGeneration = request.generation }
      const cacheKey = createHash('sha256').update(JSON.stringify([request.generation, provider, setting.revision, JEV_PROVIDERS[provider].model, request.retryId, request.target, plan.state, plan.batches, context.periods, context.candidates, context.relations])).digest('hex')
      const cached = this.cache.get(cacheKey)
      if (cached?.reply.status === 'ready') { this.cache.delete(cacheKey); this.cache.set(cacheKey, cached); return { ...cached.reply, echo } }
      const diagnostics: Diagnostics[] = []
      let batchIndex = 0
      let authorization: Promise<void> | undefined
      const call = async (state: typeof plan.state, questions: typeof plan.core.questions): Promise<Round> => {
        checkCurrent()
        const size = payloadSize(state, questions)
        if (size.bytes > payloadLimit || size.tokens > tokenBudget || Object.keys(questions).length > questionBudget) throw new ProviderFailure(failure('too_large', provider))
        const identity = createHash('sha256').update(`hosted-batch-v1:${request.requestId}:${batchIndex++}`).digest('hex')
        const actionId = `${identity.slice(0, 8)}-${identity.slice(8, 12)}-4${identity.slice(13, 16)}-8${identity.slice(17, 20)}-${identity.slice(20, 32)}`
        const started = this.now()
        const output = await this.evaluations.run(controller.signal, async () => {
          checkCurrent()
          if (provider === 'hosted') {
            authorization ??= this.authorizeHosted(['smart', this.options.store.accountId(), request.generation, request.text.trim(), request.target?.horizon ?? null, request.parentHints], request.retryId)
            await authorization
            checkCurrent()
          }
          return this.options.adapters[provider]!(read.key, { actionId, state, questions, signal: controller.signal })
        })
        checkCurrent()
        diagnostics.push({ provider, ...output.meta, estimatedInputTokens: size.tokens, latencyMs: Math.max(0, Math.round(this.now() - started)) })
        return { answers: output.answers, precision: output.precision }
      }
      const rounds: Round[] = new Array(plan.batches.length)
      let next = 0
      await Promise.all(Array.from({ length: Math.min(2, plan.batches.length) }, async () => {
        for (;;) { const index = next++; if (index >= plan.batches.length) break; const batch = plan.batches[index]!; rounds[index] = await call(batch.state, batch.questions) }
      }))
      const precision = rounds[0]?.precision ?? { decimals: null, source: null }
      if (rounds.some(round => round.precision.decimals !== precision.decimals)) throw new ContractError('Inconsistent probability precision')
      const combined: Round = { answers: Object.assign({}, ...rounds.map(round => round.answers)), precision }
      const reply: AnalyzeReply = { status: 'ready', echo, preview: matchedPreview(context, request, plan, combined), diagnostics }
      if (config.providers[provider].lastFailure) await this.record(provider, null)
      checkCurrent()
      const bytes = Buffer.byteLength(JSON.stringify(reply))
      while (this.cache.size && (this.cache.size >= 32 || this.cacheBytes + bytes > 512 * 1024)) { const key = this.cache.keys().next().value!; this.cacheBytes -= this.cache.get(key)!.bytes; this.cache.delete(key) }
      if (bytes <= 512 * 1024) { this.cache.set(cacheKey, { reply, bytes }); this.cacheBytes += bytes }
      return reply
    } catch (error) {
      if (error instanceof Aborted || controller.signal.aborted) return { status: 'cancelled', echo }
      controller.abort()
      if (error instanceof ContractError) return failed(failure('malformed_response', provider))
      if (error instanceof ProviderFailure) { await this.record(provider, error.failure); return failed(error.failure) }
      return failed(failure('unavailable', provider))
    } finally { if (this.chains.get(request.requestId) === controller) this.chains.delete(request.requestId) }
  }

  private async authorizeHosted(identity: unknown, retryId?: string): Promise<void> {
    let entry
    try {
      const original = await this.hostedAttempts.reserve(['intent', identity])
      entry = retryId ? await this.hostedAttempts.reserve(['explicit-attempt', identity, retryId]) : original
    } catch { throw new ProviderFailure(failure('unavailable', 'hosted')) }
    if (!entry.fresh) throw new ProviderFailure(failure('result_not_delivered', 'hosted'))
  }

  private async projectInsight<R extends DraftRequest | ReviewRequest>(request: R): Promise<R> {
    const config = await this.options.store.config(), provider = config.features.insight.provider
    const allowed = !!provider && config.providers[provider].assistanceConsent?.version === 1 && !!this.options.reader.insightEvidence
    const { executionContext: _context, ...withoutContext } = request
    const sanitized = 'tasks' in request ? { ...withoutContext, tasks: request.tasks.map(({ guidance: _guidance, ...task }) => task) } : withoutContext
    if (!allowed) return sanitized as R
    const identities = 'tasks' in request ? request.tasks.map(task => ({ itemId: task.id, cutoff: undefined })) : request.evidenceRequests ?? []
    const executionContext = []
    for (const identity of identities.slice(0, 8)) {
      const evidence = await this.options.reader.insightEvidence!(identity.itemId, request.generation, identity.cutoff).catch(() => null)
      if (evidence) executionContext.push(evidence)
      if (Buffer.byteLength(JSON.stringify(executionContext)) > 32 * 1024) { executionContext.pop(); break }
    }
    return { ...sanitized, executionContext } as R
  }

  // --- Flow insight: one chat call per request on the insight feature's provider; gated like analysis, never cached or logged. ---
  private async insight<R extends DraftRequest | ReviewRequest, T>(request: R, build: (request: R) => Promise<{ hosted: HostedInput; prompt: ChatPrompt; parse: (content: string) => T }>):
    Promise<{ status: 'ready'; requestId: string; value: T } | { status: 'failed'; requestId: string; failure: Failure }> {
    const failed = (value: Failure) => ({ status: 'failed' as const, requestId: request.requestId, failure: value })
    const revision = this.configurationRevision
    const controller = new AbortController()
    this.connections.add(controller); this.insightControllers.add(controller)
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
      if (controller.signal.aborted || revision !== this.configurationRevision) throw new Aborted()
      const { prompt, parse, hosted } = await build(request)
      if (provider === 'hosted') {
        const intent = 'tasks' in request ? ['draft', request.intentKey ?? null, request.tasks.map(task => ({ id: task.id, targetHorizon: task.targetHorizon }))] : ['review', request.scope, request.intentKey ?? null]
        await this.authorizeHosted([this.options.store.accountId(), request.generation, intent], request.retryId)
        if (controller.signal.aborted || revision !== this.configurationRevision) throw new Aborted()
      }
      const content = await chat(read.key, prompt, controller.signal, hosted)
      if (controller.signal.aborted || revision !== this.configurationRevision || request.generation !== await this.options.reader.generation()) return failed(failure('not_enabled', provider))
      if (config.providers[provider].lastFailure) await this.record(provider, null)
      if (controller.signal.aborted || revision !== this.configurationRevision) return failed(failure('not_enabled', provider))
      try { return { status: 'ready' as const, requestId: request.requestId, value: parse(content) } }
      catch { return failed(failure('malformed_response', provider)) }
    } catch (error) {
      if (controller.signal.aborted || revision !== this.configurationRevision) return failed(failure('not_enabled', provider))
      if (error instanceof ProviderFailure) { await this.record(provider, error.failure); return failed(error.failure) }
      return failed(failure(error instanceof Aborted || controller.signal.aborted ? 'not_enabled' : 'unavailable', provider))
    } finally { this.connections.delete(controller); this.insightControllers.delete(controller) }
  }
}
