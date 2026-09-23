/**
 * [INPUT]: 已校验 SmartAction、DeviceStore、两个 Adapter、WorkspaceReader（短只读 RPC 取日历/候选）与注入时钟。
 * [OUTPUT]: SmartInputService：状态、测试并启用（成功前旧配置不变）、关闭/删除/提示关闭；analyze 按 generation/providerRevision/同意门控，同草稿单链取消、限流冷却、会话缓存，一轮判断＋分组后可选具名补充轮，返回带修订回声的预览或归一化失败。
 * [POS]: main 独立异步智能服务；HTTP 等待不进入存储 worker 队列、不持有事务，也不改变 workspace 或 pausedAfterRestore。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { createHash } from 'node:crypto'
import { checkBoolean, checkChoice, ContractError } from '../../domain/smart/distribution'
import { planQuestions, relationRound, type SmartContext } from '../../domain/smart/questions'
import { buildPreview, taskSlots, type Round } from '../../domain/smart/preview'
import { smartActionSchema, type AnalyzeEcho, type AnalyzeReply, type AnalyzeRequest, type Diagnostics, type Failure, type JevProvider, type SmartReply, type SmartStatus, type TestOutcome } from '../../shared/contracts/smart-input'
import type { DeviceConfig, DeviceStore } from './credentials'
import { Aborted, failure, JEV_PROVIDERS, ProviderFailure, type Adapter, type EvaluateOutput } from './providers'

export interface WorkspaceReader {
  generation(): Promise<string>
  context(text: string, hints: string[], referenceTime: string): Promise<SmartContext | null>
}
export interface ServiceOptions { store: DeviceStore; adapters: Record<JevProvider, Adapter>; reader: WorkspaceReader; now?: () => number; unsignedBuild: boolean; openExternal?: (url: string) => void }

// Fixed, non-private sample: a real judgement plus schema check, so a key string alone never counts as connected.
const sample = {
  state: { text: '样例：今天整理本周周报', reference: { date: '2000-01-03', weekday: '周一' } },
  questions: {
    horizon: { type: 'choice' as const, instructions: '根据 state.text，这件事打算在什么时间范围去做？', criteria: { day: '今天', week: '本周', later: '没有写执行时间' } },
    task: { type: 'boolean' as const, instructions: 'state.text 是否描述了一件要做的事？', criteria: { true: '是', false: '不是' } },
  },
}

export class SmartInputService {
  private chains = new Map<string, AbortController>()
  private cache = new Map<string, AnalyzeReply>()
  private cooldownUntil = 0
  private readonly now: () => number
  constructor(private readonly options: ServiceOptions) { this.now = options.now ?? Date.now }

  async handle(input: unknown): Promise<SmartReply> {
    const action = smartActionSchema.parse(input)
    switch (action.type) {
      case 'status': return this.reply(action.generation, null)
      case 'connect': return this.reply(action.generation, await this.connect(action.generation, action.provider, action.apiKey))
      case 'disable': await this.update(config => { config.enabledForGeneration = null; config.providerRevision++ }); this.abortAll(); return this.reply(action.generation, null)
      case 'forget': {
        await this.options.store.removeKey(action.provider)
        await this.update(config => {
          config.providers[action.provider] = { consentedAt: null, verifiedAt: null, keyHint: null }
          if (config.activeProvider === action.provider) { config.activeProvider = null; config.enabledForGeneration = null; config.providerRevision++ }
        })
        this.abortAll(); return this.reply(action.generation, null)
      }
      case 'dismiss': await this.update(config => { if (!config.dismissed.includes(action.notice)) config.dismissed.push(action.notice) }); return this.reply(action.generation, null)
      case 'openConsole': this.options.openExternal?.(JEV_PROVIDERS[action.provider].console); return { type: 'cancelled' }
      case 'analyze': return { type: 'analysis', reply: await this.analyze(action.request) }
      case 'cancel': this.chains.get(action.draftSessionId)?.abort(); this.chains.delete(action.draftSessionId); return { type: 'cancelled' }
    }
  }

  async status(generation: string): Promise<SmartStatus> {
    const config = await this.options.store.config()
    const providers = Object.fromEntries(await Promise.all((['typesafe', 'vercel-gateway'] as const).map(async provider => {
      const read = await this.options.store.readKey(provider)
      return [provider, { credential: read.state, keyHint: config.providers[provider].keyHint, consentedAt: config.providers[provider].consentedAt, verifiedAt: config.providers[provider].verifiedAt }]
    }))) as SmartStatus['providers']
    const active = config.activeProvider
    const usable = !!active && providers[active].credential === 'saved' && !!config.providers[active].consentedAt
    return { activeProvider: active, providerRevision: config.providerRevision, enabled: usable && config.enabledForGeneration === generation,
      paused: usable && config.enabledForGeneration !== null && config.enabledForGeneration !== generation, providers, lastFailure: config.lastFailure,
      cooldownUntil: this.cooldownUntil > this.now() ? new Date(this.cooldownUntil).toISOString() : null, dismissed: config.dismissed, unsignedBuild: this.options.unsignedBuild }
  }
  private async reply(generation: string, test: TestOutcome | null): Promise<SmartReply> { return { type: 'status', status: await this.status(generation), test } }
  private async update(change: (config: DeviceConfig) => void): Promise<void> {
    const config = await this.options.store.config()
    change(config)
    await this.options.store.saveConfig(config)
  }
  private abortAll(): void { for (const chain of this.chains.values()) chain.abort(); this.chains.clear(); this.cache.clear() }

  // --- Test first with the candidate key; only a verified judgement replaces the previous working setup. ---
  private async connect(generation: string, provider: JevProvider, apiKey: string | null): Promise<TestOutcome> {
    if (generation !== await this.options.reader.generation()) return { ok: false, failure: failure('not_enabled', provider), sampleMatched: null }
    let key = apiKey
    if (key === null) {
      const read = await this.options.store.readKey(provider)
      if (read.state !== 'saved') return { ok: false, failure: failure(read.state === 'unavailable' ? 'credential_unavailable' : read.state === 'unreadable' ? 'credential_unreadable' : 'authentication_failed', provider), sampleMatched: null }
      key = read.key
    }
    const controller = new AbortController()
    let output: EvaluateOutput
    try { output = await this.options.adapters[provider](key, { ...sample, signal: controller.signal }) }
    catch (error) {
      const outcome = error instanceof ProviderFailure ? error.failure : failure('unavailable', provider)
      if (outcome.kind === 'rate_limited') this.cooldownUntil = Date.parse(outcome.retryAt!)
      return { ok: false, failure: outcome, sampleMatched: null }
    }
    let matched: boolean
    try {
      const horizon = checkChoice(output.answers.horizon, Object.keys(sample.questions.horizon.criteria), output.precision)
      checkBoolean(output.answers.task)
      matched = horizon.choice === 'day'
    } catch { return { ok: false, failure: failure('malformed_response', provider), sampleMatched: null } }
    let hint: string | null = null
    if (apiKey !== null) {
      // Never falls back to plaintext: an unavailable OS store leaves the previous setup untouched.
      try { hint = await this.options.store.saveKey(provider, apiKey) }
      catch { return { ok: false, failure: failure('credential_unavailable', provider), sampleMatched: matched } }
    }
    const at = new Date(this.now()).toISOString()
    await this.update(config => {
      config.providers[provider] = { consentedAt: config.providers[provider].consentedAt ?? at, verifiedAt: at, keyHint: hint ?? config.providers[provider].keyHint }
      config.activeProvider = provider; config.enabledForGeneration = generation; config.providerRevision++; config.lastFailure = null
    })
    this.abortAll()
    return { ok: true, failure: null, sampleMatched: matched }
  }

  async analyze(request: AnalyzeRequest): Promise<AnalyzeReply> {
    const echo: AnalyzeEcho = { requestId: request.requestId, draftSessionId: request.draftSessionId, inputRevision: request.inputRevision, manualRevision: request.manualRevision, generation: request.generation, providerRevision: request.providerRevision, contextRevision: request.contextRevision, referenceTime: request.referenceTime }
    const config = await this.options.store.config()
    const provider = config.activeProvider
    const failed = (value: Failure): AnalyzeReply => ({ status: 'failed', echo, failure: value })
    if (!provider || !config.providers[provider].consentedAt || config.enabledForGeneration !== request.generation || config.providerRevision !== request.providerRevision || request.generation !== await this.options.reader.generation()) return failed(failure('not_enabled', provider ?? 'typesafe'))
    if (this.cooldownUntil > this.now()) return failed(failure('rate_limited', provider, 429, new Date(this.cooldownUntil).toISOString()))
    const read = await this.options.store.readKey(provider)
    if (read.state !== 'saved') return failed(failure(read.state === 'unavailable' ? 'credential_unavailable' : read.state === 'unreadable' ? 'credential_unreadable' : 'not_enabled', provider))
    // One live chain per draft: a newer revision cancels this application's use of the older answer.
    this.chains.get(request.draftSessionId)?.abort()
    const controller = new AbortController()
    this.chains.set(request.draftSessionId, controller)
    try {
      const context = await this.options.reader.context(request.text, request.parentHints, request.referenceTime)
      if (!context) return failed(failure('not_enabled', provider))
      const plan = planQuestions(context)
      if ('kind' in plan) return failed({ ...failure('too_large', provider), message: plan.message })
      const cacheKey = createHash('sha256').update(JSON.stringify([provider, config.providerRevision, JEV_PROVIDERS[provider].model, plan.state, plan.questions, context.periods])).digest('hex')
      const cached = this.cache.get(cacheKey)
      if (cached?.status === 'ready') return { ...cached, echo }
      const diagnostics: Diagnostics[] = []
      const call = async (state: typeof plan.state, questions: typeof plan.questions): Promise<Round> => {
        const started = this.now()
        const output = await this.options.adapters[provider](read.key, { state, questions, signal: controller.signal })
        diagnostics.push({ provider, ...output.meta, estimatedInputTokens: plan.estimatedTokens, latencyMs: Math.max(0, Math.round(this.now() - started)) })
        return { answers: output.answers, precision: output.precision }
      }
      const first = await call(plan.state, plan.questions)
      let supplement: Parameters<typeof buildPreview>[3] = null
      if (plan.deferredRelations) {
        const next = relationRound(plan, taskSlots(plan, first), context.candidates, Object.keys(plan.questions).length)!
        supplement = { pairs: next.pairs, round: Object.keys(next.questions).length ? await call(next.state, next.questions) : { answers: {}, precision: first.precision } }
      }
      const reply: AnalyzeReply = { status: 'ready', echo, preview: buildPreview(context, plan, first, supplement), diagnostics }
      if (this.cache.size > 50) this.cache.delete(this.cache.keys().next().value!)
      this.cache.set(cacheKey, reply)
      return reply
    } catch (error) {
      if (error instanceof Aborted || controller.signal.aborted) return { status: 'cancelled', echo }
      if (error instanceof ContractError) return failed(failure('malformed_response', provider))
      if (error instanceof ProviderFailure) {
        if (error.failure.kind === 'rate_limited') this.cooldownUntil = Date.parse(error.failure.retryAt!)
        return failed(error.failure)
      }
      return failed(failure('unavailable', provider))
    } finally { if (this.chains.get(request.draftSessionId) === controller) this.chains.delete(request.draftSessionId) }
  }
}
