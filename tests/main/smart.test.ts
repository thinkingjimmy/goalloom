import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { classifyFailure, gatewayAdapter, ProviderFailure, systemOneAdapter, type Adapter, type EvaluateInput } from '../../src/main/smart/providers'
import { DeviceStore, type Cipher } from '../../src/main/smart/credentials'
import { SmartInputService, type WorkspaceReader } from '../../src/main/smart/service'
import type { SmartContext } from '../../src/domain/smart/questions'
import type { AnalyzeRequest, Candidate, SmartReply } from '../../src/shared/contracts/smart-input'

type Call = { url: string; init: RequestInit; body: Record<string, unknown> }
function fakeFetch(respond: (call: Call) => Response) {
  const calls: Call[] = []
  const fetch = async (url: string, init: RequestInit = {}) => { const call = { url, init, body: JSON.parse(String(init.body)) }; calls.push(call); return respond(call) }
  return { fetch, calls }
}
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } })
const input = (): EvaluateInput => ({ state: { text: '今天写文案' }, signal: new AbortController().signal, questions: {
  horizon: { type: 'choice', instructions: '执行范围？', criteria: { day: '今天', later: '无' } },
  task: { type: 'boolean', instructions: '是事项？', criteria: { true: '是', false: '否' } },
} })
const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name)

describe('三渠道 adapter', () => {
  it('TypeSafe 原生：systemOne、jev-latest、不重试；noul 映射为 boolean，精度来自适配器 d=2', async () => {
    const { fetch, calls } = fakeFetch(() => json({ model: 'jev-2026-09', answers: { horizon: { type: 'choice', choice: 'day', confidence: 0.9, probabilities: { day: 0.97, later: 0.03 } }, task: { type: 'noul', noul: 0.99 } }, usage: { input_tokens: 120, output_tokens: 3 } }, 200, { 'x-typesafe-request-id': 'req_1' }))
    const output = await systemOneAdapter('typesafe', fetch)('ts-key-AAAA', input())
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(calls[0]!.body.model).toBe('jev-latest')
    expect(header(calls[0]!.init, 'authorization')).toContain('ts-key-AAAA')
    expect(calls[0]!.body.questions).toMatchObject({ task: { type: 'noul' } })
    expect(output.answers).toEqual({ horizon: { type: 'choice', choice: 'day', probabilities: { day: 0.97, later: 0.03 } }, task: { type: 'boolean', probability: 0.99 } })
    expect(output.precision).toEqual({ decimals: 2, source: 'adapter' })
    expect(output.meta).toEqual({ requestedModel: 'jev-latest', routingCanonicalSlug: null, modelVersion: 'jev-2026-09', inputTokens: 120, requestId: 'req_1' })
  })
  it('OpenRouter：System One 形状发往 openrouter.ai/api、固定 typesafe/jev-1.13；requestId 取响应 id，402 归为付费', async () => {
    const { fetch, calls } = fakeFetch(() => json({ id: 'gen-dec-1', model: 'typesafe/jev-1.13-20260917', provider: 'TypeSafe', answers: { horizon: { type: 'choice', choice: 'day', confidence: 0.9, probabilities: { day: 0.97, later: 0.03 } }, task: { type: 'noul', noul: 0.98 } }, usage: { input_tokens: 275, output_tokens: 20, cost: 0.00003 } }))
    const output = await systemOneAdapter('openrouter', fetch)('or-key-CCCC', input())
    expect(calls[0]!.url).toBe('https://openrouter.ai/api/v1/systemone')
    expect(calls[0]!.body.model).toBe('typesafe/jev-1.13')
    expect(header(calls[0]!.init, 'authorization')).toContain('or-key-CCCC')
    expect(calls[0]!.body.questions).toMatchObject({ task: { type: 'noul' } })
    expect(output.answers.task).toEqual({ type: 'boolean', probability: 0.98 })
    expect(output.meta).toEqual({ requestedModel: 'typesafe/jev-1.13', routingCanonicalSlug: null, modelVersion: 'typesafe/jev-1.13-20260917', inputTokens: 275, requestId: 'gen-dec-1' })
    const paid = await systemOneAdapter('openrouter', fakeFetch(() => json({ error: { code: 402, message: 'Insufficient credits' } }, 402)).fetch)('or-key-CCCC', input()).catch((error: ProviderFailure) => error.failure)
    expect(paid).toMatchObject({ kind: 'payment_required', status: 402, message: expect.stringContaining('OpenRouter') })
  })
  it('Gateway：/v1/evaluate、typesafe-ai/jev、only 限制、boolean 类型；不发送 ZDR；routing 与 rounding 从官方嵌套路径读取', async () => {
    const { fetch, calls } = fakeFetch(() => json({ model: 'typesafe-ai/jev', answers: { horizon: { type: 'choice', choice: 'day', probabilities: { day: 0.97, later: 0.03 } }, task: { type: 'boolean', probability: 0.98 } }, rounding: { probabilityDecimals: 2 }, usage: { inputTokens: 275 }, providerMetadata: { gateway: { routing: { canonicalSlug: 'typesafe-ai/jev', finalProvider: 'typesafe-ai' }, generationId: 'gen_1' } } }))
    const output = await gatewayAdapter(fetch)('gw-key-BBBB', input())
    expect(calls[0]!.url).toBe('https://ai-gateway.vercel.sh/v1/evaluate')
    expect(calls[0]!.body).toMatchObject({ model: 'typesafe-ai/jev', providerOptions: { gateway: { only: ['typesafe-ai'] } }, questions: { task: { type: 'boolean' } } })
    expect(JSON.stringify(calls[0]!.body)).not.toContain('zeroDataRetention')
    expect(header(calls[0]!.init, 'authorization')).toBe('Bearer gw-key-BBBB')
    expect(output.precision).toEqual({ decimals: 2, source: 'response' })
    expect(output.meta).toMatchObject({ routingCanonicalSlug: 'typesafe-ai/jev', modelVersion: null, inputTokens: 275, requestId: 'gen_1' })
  })
  it('Gateway 缺 routing/精度记未知；非法精度、其他提供方或 unsupported 路由警告拒绝', async () => {
    const answers = { horizon: { type: 'choice', choice: 'day', probabilities: { day: 1, later: 0 } }, task: { type: 'boolean', probability: 0.9 } }
    const minimal = await gatewayAdapter(fakeFetch(() => json({ answers })).fetch)('k'.repeat(10), input())
    expect(minimal.precision).toEqual({ decimals: null, source: null })
    expect(minimal.meta).toMatchObject({ routingCanonicalSlug: null, inputTokens: null })
    const reject = (value: unknown, status = 200) => gatewayAdapter(fakeFetch(() => json(value, status)).fetch)('k'.repeat(10), input()).catch((error: ProviderFailure) => error.failure.kind)
    expect(await reject({ answers, rounding: { probabilityDecimals: 1.5 } })).toBe('malformed_response')
    expect(await reject({ answers, providerMetadata: { gateway: { routing: { finalProvider: 'other' } } } })).toBe('routing_policy')
    expect(await reject({ answers, warnings: [{ type: 'unsupported', feature: 'providerOptions.gateway.only' }] })).toBe('routing_policy')
    expect(await reject({ answers: { horizon: answers.horizon } })).toBe('malformed_response')
    expect(await reject({ error: { message: 'unknown option only', type: 'invalid_request_error' } }, 400)).toBe('routing_policy')
  })
  it('错误按明确 type/code 优先分类，不按 403/429 猜原因', () => {
    const now = Date.parse('2026-09-23T00:00:00Z'), h = (value: Record<string, string> = {}) => new Headers(value)
    expect(classifyFailure('vercel-gateway', 403, { error: { type: 'customer_verification_required', message: 'x' } }, h(), now)).toMatchObject({ kind: 'account_verification_required', message: 'AI Gateway 账户需要完成验证，请到该账户的官方控制台查看要求' })
    expect(classifyFailure('vercel-gateway', 403, { error: { type: 'forbidden' } }, h(), now).kind).toBe('permission_denied')
    expect(classifyFailure('typesafe', 401, {}, h(), now).kind).toBe('authentication_failed')
    expect(classifyFailure('typesafe', 429, { error: { code: 'insufficient_quota' } }, h(), now).kind).toBe('quota_exhausted')
    expect(classifyFailure('typesafe', 429, {}, h({ 'retry-after': '12' }), now)).toMatchObject({ kind: 'rate_limited', retryAt: '2026-09-23T00:00:12.000Z' })
    expect(classifyFailure('typesafe', 429, {}, h(), now).retryAt).toBe('2026-09-23T00:00:30.000Z')
    expect(classifyFailure('typesafe', 418, { error: { message: '私人正文' } }, h(), now)).toMatchObject({ kind: 'request_failed' })
    expect(classifyFailure('typesafe', 418, { error: { message: '私人正文' } }, h(), now).message).not.toContain('私人正文')
    expect(classifyFailure('typesafe', 503, {}, h(), now).kind).toBe('unavailable')
  })
})

// --- Service over a reversible test cipher: the file on disk is never the key itself. ---
const cipher = (state: { available: boolean; broken?: boolean }): Cipher => ({
  available: () => state.available,
  encrypt: text => Buffer.from([...Buffer.from(text)].map(byte => byte ^ 0x5a)),
  decrypt: data => { if (state.broken) throw new Error('keychain denied'); return Buffer.from([...data].map(byte => byte ^ 0x5a)).toString() },
})
const periods = { day: { id: 'c:day:2026-09-23', startDate: '2026-09-23', endDate: '2026-09-24' }, week: { id: 'c:week:2026-09-21', startDate: '2026-09-21', endDate: '2026-09-28' }, month: { id: 'c:month:2026-09-01', startDate: '2026-09-01', endDate: '2026-10-01' }, cycle: { id: 'c:cycle:2026-07-01', startDate: '2026-07-01', endDate: '2026-10-01' } }
let directory: string, generation: string, keyState: { available: boolean; broken?: boolean }, calls: { provider: string; key: string; questions: number }[]
let behaviour: (question: string, criteria: string[] | null) => unknown
let candidates: Candidate[]
const answerAll: Adapter = async (key, request) => {
  calls.push({ provider: 'x', key, questions: Object.keys(request.questions).length })
  const answers: Record<string, unknown> = {}
  for (const [id, question] of Object.entries(request.questions)) answers[id] = behaviour(id, question.type === 'choice' ? Object.keys(question.criteria) : null)
  return { answers: answers as never, precision: { decimals: 2, source: 'adapter' }, meta: { requestedModel: 'jev-latest', routingCanonicalSlug: null, modelVersion: null, inputTokens: null, requestId: null } }
}
const defaults = (id: string, criteria: string[] | null) => criteria
  ? { type: 'choice', choice: id.startsWith('role_') ? 'task' : id === 'horizon' ? 'day' : criteria.includes('none') ? 'none' : criteria.includes('later') ? 'later' : criteria[0], probabilities: null as Record<string, number> | null }
  : { type: 'boolean', probability: 0.05 }
function withProbabilities(value: { type: string; choice?: string | undefined; probabilities?: Record<string, number> | null | undefined; probability?: number | undefined }, criteria: string[] | null) {
  if (!criteria) return value
  return { ...value, probabilities: Object.fromEntries(criteria.map(option => [option, option === value.choice ? 0.97 : Number((0.03 / (criteria.length - 1)).toFixed(2))])) }
}
const reader = (): WorkspaceReader => ({
  generation: async () => generation,
  context: async (text): Promise<SmartContext> => ({ text, referenceDate: '2026-09-23', weekdayName: '周三', timezone: 'Asia/Shanghai', weekStart: 1, periods, candidates }),
})
let service: SmartInputService, adapters: Record<'typesafe' | 'vercel-gateway' | 'openrouter', Adapter>
const act = (action: unknown) => service.handle(action) as Promise<SmartReply>
const status = async () => { const reply = await act({ type: 'status', generation }); if (reply.type !== 'status') throw new Error('status'); return reply }
const request = (text: string, overrides: Partial<AnalyzeRequest> = {}): AnalyzeRequest => ({ requestId: randomUUID(), draftSessionId: randomUUID(), inputRevision: 1, manualRevision: 0, generation, providerRevision: 1, contextRevision: 0, referenceTime: '2026-09-23T02:00:00.000Z', text, parentHints: [], ...overrides })
const analyze = async (value: AnalyzeRequest) => { const reply = await act({ type: 'analyze', request: value }); if (reply.type !== 'analysis') throw new Error('analysis'); return reply.reply }

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'Goalloom 智能输入 ')); generation = randomUUID(); keyState = { available: true }; calls = []; candidates = []
  behaviour = (id, criteria) => withProbabilities(defaults(id, criteria), criteria)
  adapters = { typesafe: answerAll, 'vercel-gateway': answerAll, openrouter: answerAll }
  service = new SmartInputService({ store: new DeviceStore(directory, cipher(keyState)), adapters: { typesafe: (key, value) => adapters.typesafe(key, value), 'vercel-gateway': (key, value) => adapters['vercel-gateway'](key, value), openrouter: (key, value) => adapters.openrouter(key, value) }, reader: reader(), unsignedBuild: true })
})
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

describe('设备配置与凭据', () => {
  it('测试通过才启用并加密保存；Key 不以明文落盘，配置不含 Key', async () => {
    const reply = await act({ type: 'connect', generation, provider: 'typesafe', apiKey: 'ts-secret-1234', consent: true })
    expect(reply.type === 'status' && reply.test).toMatchObject({ ok: true, sampleMatched: true })
    const { status: current } = await status()
    expect(current).toMatchObject({ activeProvider: 'typesafe', enabled: true, paused: false, providerRevision: 1 })
    expect(current.providers.typesafe).toMatchObject({ credential: 'saved', keyHint: '••••1234' })
    expect(current.providers['vercel-gateway'].credential).toBe('missing')
    for (const name of await readdir(join(directory))) expect(await readFile(join(directory, name), 'utf8')).not.toContain('ts-secret-1234')
  })
  it('新凭据测试失败时旧可用配置不变；一个服务的 Key 不发给另一服务', async () => {
    await act({ type: 'connect', generation, provider: 'typesafe', apiKey: 'ts-secret-1234', consent: true })
    adapters['vercel-gateway'] = async () => { throw new ProviderFailure({ kind: 'authentication_failed', message: 'x', status: 401, retryAt: null }) }
    const reply = await act({ type: 'connect', generation, provider: 'vercel-gateway', apiKey: 'gw-secret-9999', consent: true })
    expect(reply.type === 'status' && reply.test?.failure?.kind).toBe('authentication_failed')
    const { status: current } = await status()
    expect(current).toMatchObject({ activeProvider: 'typesafe', enabled: true })
    expect(current.providers['vercel-gateway'].credential).toBe('missing')
    await analyze(request('今天写文案'))
    expect(calls.map(call => call.key)).toEqual(['ts-secret-1234', 'ts-secret-1234'])
  })
  it('系统凭据不可用不保存、读取失败保留加密文件，不回退明文也不说远端 Key 失效', async () => {
    keyState.available = false
    const reply = await act({ type: 'connect', generation, provider: 'typesafe', apiKey: 'ts-secret-1234', consent: true })
    expect(reply.type === 'status' && reply.test?.failure?.kind).toBe('credential_unavailable')
    expect((await status()).status.activeProvider).toBeNull()
    expect(await readdir(directory).catch(() => [])).not.toContain('typesafe.key')
    keyState.available = true
    await act({ type: 'connect', generation, provider: 'typesafe', apiKey: 'ts-secret-1234', consent: true })
    keyState.broken = true
    const { status: current } = await status()
    expect(current.providers.typesafe.credential).toBe('unreadable')
    expect(current.enabled).toBe(false)
    expect(await readdir(directory)).toContain('typesafe.key')
    const failed = await analyze(request('写文案'))
    expect(failed.status === 'failed' && failed.failure.kind).toBe('credential_unreadable')
  })
  it('整库恢复/重置产生新 generation：自动失配暂停，保留设备 Key，重新启用显式绑定当前代次', async () => {
    await act({ type: 'connect', generation, provider: 'typesafe', apiKey: 'ts-secret-1234', consent: true })
    const old = generation
    generation = randomUUID()
    const { status: current } = await status()
    expect(current).toMatchObject({ enabled: false, paused: true })
    expect(current.providers.typesafe.credential).toBe('saved')
    const blocked = await analyze(request('写文案', { generation: old }))
    expect(blocked.status === 'failed' && blocked.failure.kind).toBe('not_enabled')
    expect(calls).toHaveLength(1)
    await act({ type: 'connect', generation, provider: 'typesafe', apiKey: null, consent: true })
    expect((await status()).status).toMatchObject({ enabled: true, providerRevision: 2 })
  })
  it('连接测试进行中关闭、删除 Key 或切换服务，迟到的测试结果不会重新启用旧服务', async () => {
    await act({ type: 'connect', generation, provider: 'typesafe', apiKey: 'ts-secret-1234', consent: true })
    const cases: [Record<string, unknown>, Record<string, unknown>][] = [
      [{ type: 'disable' }, { activeProvider: 'typesafe', enabled: false }],
      [{ type: 'forget', provider: 'typesafe' }, { activeProvider: null, enabled: false }],
      [{ type: 'connect', provider: 'vercel-gateway', apiKey: 'gw-secret-9999', consent: true }, { activeProvider: 'vercel-gateway', enabled: true }],
    ]
    for (const [action, expected] of cases) {
      let release!: () => void, entered!: () => void
      const gate = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
      adapters.typesafe = async (key, value) => { entered(); await gate; return answerAll(key, value) }
      const late = act({ type: 'connect', generation, provider: 'typesafe', apiKey: 'ts-secret-5678', consent: true })
      await started
      await act({ ...action, generation })
      release(); await late
      expect((await status()).status, String(action.type)).toMatchObject(expected)
    }
  })
  it('服务配置变更使旧修订建议过期；关闭与删除 Key 后不可用；提示关闭只记在设备配置', async () => {
    await act({ type: 'connect', generation, provider: 'typesafe', apiKey: 'ts-secret-1234', consent: true })
    // Still enabled for this generation: only the provider revision can reject the stale request.
    await act({ type: 'connect', generation, provider: 'typesafe', apiKey: null, consent: true })
    expect((await status()).status).toMatchObject({ enabled: true, providerRevision: 2 })
    const stale = await analyze(request('写文案', { providerRevision: 1 }))
    expect(stale.status === 'failed' && stale.failure.kind).toBe('not_enabled')
    expect(calls).toHaveLength(2)
    await act({ type: 'disable', generation })
    expect((await status()).status).toMatchObject({ enabled: false, paused: false, providerRevision: 3 })
    const disabled = await analyze(request('写文案', { providerRevision: 3 }))
    expect(disabled.status === 'failed' && disabled.failure.kind).toBe('not_enabled')
    await act({ type: 'dismiss', generation, notice: 'globalEntry' })
    await act({ type: 'forget', generation, provider: 'typesafe' })
    expect((await status()).status).toMatchObject({ activeProvider: null, dismissed: ['globalEntry'] })
    expect((await status()).status.providers.typesafe.credential).toBe('missing')
  })
})

describe('判断流程', () => {
  beforeEach(async () => { await act({ type: 'connect', generation, provider: 'vercel-gateway', apiKey: 'gw-secret-9999', consent: true }); calls = [] })
  // Failure cases: oversized text reads every board item and searches quoted phrases before
  // rejection; counting UTF-16 units instead of code points rejects valid emoji input early.
  it('checks the text budget before workspace context reads using Unicode code points', async () => {
    let reads = 0
    const source = reader()
    service = new SmartInputService({ store: new DeviceStore(directory, cipher(keyState)), adapters,
      reader: { ...source, context: async (...args) => { reads++; return source.context(...args) } }, unsignedBuild: true })
    const rejected = await analyze(request('😀'.repeat(4001)))
    expect(rejected.status === 'failed' && rejected.failure.kind).toBe('too_large')
    expect(reads).toBe(0)
    expect(calls).toHaveLength(0)
    expect((await analyze(request('😀'.repeat(4000)))).status).toBe('ready')
    expect(reads).toBe(1)
  })
  // Failure cases: session release during credential reads starts a late cloud request;
  // release during HTTP accepts a stale result; cached private previews survive a new renderer.
  it('releasing a renderer session cancels preflight reads before any provider call', async () => {
    const pending = analyze(request('Write a private draft'))
    service.releaseSession()
    expect((await pending).status).toBe('cancelled')
    expect(calls).toHaveLength(0)
    expect((await status()).status.enabled).toBe(true)
  })
  it('releasing a renderer session aborts pending analysis and drops cached previews', async () => {
    expect((await analyze(request('Cached private draft'))).status).toBe('ready')
    expect(calls).toHaveLength(1)
    let started!: () => void, finish!: () => void, signal!: AbortSignal
    const entered = new Promise<void>(resolve => { started = resolve })
    const released = new Promise<void>(resolve => { finish = resolve })
    adapters['vercel-gateway'] = async (key, value) => {
      signal = value.signal; started(); await released
      return answerAll(key, value)
    }
    const pending = analyze(request('Pending private draft'))
    await entered
    service.releaseSession()
    expect(signal.aborted).toBe(true)
    finish()
    expect((await pending).status).toBe('cancelled')
    adapters['vercel-gateway'] = answerAll
    expect((await analyze(request('Cached private draft'))).status).toBe('ready')
    expect(calls).toHaveLength(3)
  })
  it('releasing a renderer session prevents a late connection test from saving credentials', async () => {
    let started!: () => void, finish!: () => void, signal!: AbortSignal
    const entered = new Promise<void>(resolve => { started = resolve })
    const released = new Promise<void>(resolve => { finish = resolve })
    adapters.typesafe = async (key, value) => {
      signal = value.signal; started(); await released
      return answerAll(key, value)
    }
    const pending = act({ type: 'connect', generation, provider: 'typesafe', apiKey: 'ts-private-1234', consent: true })
    await entered
    service.releaseSession()
    expect(signal.aborted).toBe(true)
    finish(); await pending
    const current = (await status()).status
    expect(current).toMatchObject({ activeProvider: 'vercel-gateway', enabled: true })
    expect(current.providers.typesafe.credential).toBe('missing')
  })
  it('常规单任务一次请求；相同有效修订命中会话缓存，回声对应本次请求', async () => {
    const first = await analyze(request('今天写文案'))
    expect(first.status).toBe('ready')
    if (first.status !== 'ready') return
    expect(first.preview.drafts).toHaveLength(1)
    expect(first.preview.requests).toBe(1)
    const again = request('今天写文案', { inputRevision: 5 })
    const second = await analyze(again)
    expect(calls).toHaveLength(1)
    expect(second.echo).toMatchObject({ requestId: again.requestId, inputRevision: 5 })
  })
  it('上级候选版本变化时不命中旧缓存，预览带当前版本', async () => {
    const parent: Candidate = { ref: 'g1', itemId: 'parent', title: 'Parent', status: 'todo', horizon: 'cycle', archived: false, flowColor: 0, version: 1, named: true }
    candidates = [parent]
    await analyze(request('推进 Parent'))
    candidates = [{ ...parent, version: 2 }]
    const second = await analyze(request('推进 Parent'))
    expect(calls).toHaveLength(2)
    expect(second.status === 'ready' && second.preview.candidates[0]!.version).toBe(2)
  })
  it('8 项计划：核心一轮后按分组发一次具名补充，预览题数等于实际发送', async () => {
    const text = Array.from({ length: 8 }, (_, i) => `事项${i}`).join('\n')
    const reply = await analyze(request(text))
    expect(reply.status).toBe('ready')
    expect(calls).toHaveLength(2)
    if (reply.status === 'ready') expect(reply.preview.questionCount).toBe(calls[0]!.questions + calls[1]!.questions)
  })
  it('同一草稿新修订取消旧请求；慢请求期间其他动作不被阻塞', async () => {
    let release: () => void = () => undefined
    adapters['vercel-gateway'] = (key, value) => new Promise((resolve, reject) => {
      value.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      release = () => { void answerAll(key, value).then(resolve) }
    })
    const session = randomUUID()
    const slow = analyze(request('写文案', { draftSessionId: session }))
    await new Promise(resolve => setTimeout(resolve, 10))
    const started = Date.now()
    expect((await status()).status.enabled).toBe(true)
    expect(Date.now() - started).toBeLessThan(500)
    const newer = analyze(request('写文案，补充', { draftSessionId: session, inputRevision: 2 }))
    expect((await slow).status).toBe('cancelled')
    await new Promise(resolve => setTimeout(resolve, 10))
    release()
    expect((await newer).status).toBe('ready')
  })
  it('限流：尊重 Retry-After，冷却内新输入不重发', async () => {
    adapters['vercel-gateway'] = async () => { throw new ProviderFailure({ kind: 'rate_limited', message: 'x', status: 429, retryAt: new Date(Date.now() + 60_000).toISOString() }) }
    expect((await analyze(request('写文案'))).status).toBe('failed')
    let hits = 0
    adapters['vercel-gateway'] = async (key, value) => { hits++; return answerAll(key, value) }
    const cooled = await analyze(request('另一件事'))
    expect(cooled.status === 'failed' && cooled.failure.kind).toBe('rate_limited')
    expect(hits).toBe(0)
    expect((await status()).status.cooldownUntil).not.toBeNull()
  })
})
