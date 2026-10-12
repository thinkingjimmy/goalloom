/**
 * [INPUT]: Explicitly authorized provider credentials and sixty synthetic annotated cases.
 * [OUTPUT]: Existing-draft/contextual-assistance comparison with structure, latency, usage and pending human grades.
 * [POS]: Live quality evaluation only; no workspace, telemetry, writes, automatic model retry or provider switch.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { chatAdapter, CHAT_PROVIDERS } from '../../../src/main/smart/insight'
import { assistancePrompt, assistancePromptVersion, parseAssistance } from '../../../src/domain/smart/assistance'
import { draftPrompt, parseDraft } from '../../../src/domain/smart/insight'
import { openDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'
import { readAssistanceContext } from '../../../src/main/workspace/assistance-context'
import { reconcile } from '../../../src/main/workspace/reconcile'
import type { Locale } from '../../../src/shared/i18n/locale'
import type { ChatPrompt } from '../../../src/domain/smart/insight'

interface Sample { id: string; group: string; locale: Locale; title: string; description: string; text: string; scenario: string; expected: object }
const output = resolve('output/eval/assistance'), provider = process.env.GOALLOOM_ASSISTANCE_PROVIDER ?? 'openrouter'
if (provider !== 'openrouter' && provider !== 'vercel-gateway') throw Error('Unsupported evaluation provider')
const key = process.env[provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'AI_GATEWAY_API_KEY']
if (!key) throw Error('The selected evaluation provider has no environment credential')
const dataset = JSON.parse(await readFile('scripts/eval/assistance/samples.json', 'utf8')) as { version: number; samples: Sample[] }
const selected = process.env.GOALLOOM_ASSISTANCE_SAMPLE ? dataset.samples.filter(sample => sample.id === process.env.GOALLOOM_ASSISTANCE_SAMPLE) : dataset.samples
const results: object[] = []
const report = { status: 'running', provider, model: CHAT_PROVIDERS[provider].model, promptVersion: assistancePromptVersion, sampleVersion: dataset.version, results,
  comparisonLimit: 'The existing draft baseline returns a next-step title; assistance returns a guidance proposal or clarification. Human reviewers must assess that difference.', manualQualityAcceptance: 'unverified', cost: 'unknown' }
for (const sample of selected) {
  const db = openDatabase(':memory:'); migrate(db)
  let now = '2026-10-01T12:00:00Z'
  const repo = new Repository(db, { now: () => now }), generation = repo.store.workspace().generation
  const run = (action: object) => repo.execute({ ...action, generation, operationId: randomUUID() })
  try {
    run({ type: 'confirmSetup', mode: 'rolling', timezone: 'UTC', weekStart: 1, anchor: { kind: 'date', date: '2026-01-01' }, confirmed: true })
    const horizon = sample.scenario === 'later' ? 'later' : sample.scenario === 'future' || sample.scenario === 'advance' ? 'week' : 'day'
    const id = run({ type: 'create', title: sample.title, description: sample.description, horizon,
      dueDate: sample.scenario === 'overdue' ? '2026-10-01' : null, ...(horizon === 'week' ? { period: { kind: 'date', startDate: '2026-10-12' } } : {}) }).itemId!
    if (sample.scenario === 'advance') run({ type: 'move', itemId: id, expectedVersion: 1, expectedPlacementVersion: 1, horizon: 'week', period: { kind: 'date', startDate: '2026-10-19' } })
    now = '2026-10-07T12:00:00Z'
    if (sample.scenario === 'system-carry') reconcile(repo)
    if (['manual-carry', 'waiting'].includes(sample.scenario)) run({ type: 'move', itemId: id, expectedVersion: repo.store.item(id).version, expectedPlacementVersion: repo.store.item(id).placement.version, horizon: 'day' })
    if (sample.scenario === 'reopen') for (const status of ['done', 'todo']) run({ type: 'status', itemId: id, expectedVersion: repo.store.item(id).version, status })
    if (sample.scenario === 'baseline') db.prepare("UPDATE item_events SET type='baseline' WHERE itemId=?").run(id)
    if (sample.scenario === 'waiting') run({ type: 'applyAssistance', itemId: id, expectedVersion: repo.store.item(id).version, expectedGuidanceRevision: 0, guidance: { kind: 'set', value: { formatVersion: 1, kind: 'waiting_note', nextAction: 'Wait for the reviewer’s answer', contextNote: null, scopeNote: null, authorship: 'user' } } })
    const context = readAssistanceContext(repo.store, repo.execution, { type: 'assistanceContext', itemId: id, generation }, now)
    const request = { requestId: randomUUID(), sessionId: randomUUID(), itemId: id, generation, inputRevision: 0, manualRevision: 0, featureRevision: 1, contextId: randomUUID(), locale: sample.locale, turn: 1, text: sample.text, answer: null, adjustment: null }
    const baseline = { requestId: randomUUID(), generation, board: { today: '2026-10-07', periods: {}, goals: [], unlinked: { half: [], cycle: [], month: [], week: [], day: [] } }, tasks: [{ id: 'sample', parent: sample.title, goal: null, target: 'Today', targetHorizon: 'day' as const, siblings: [] }], prefs: { about: '', stepSize: 'hour' as const, stepNotes: '', tone: 'direct' as const, focus: [] } }
    for (const mode of ['existing-draft', 'contextual-assistance']) {
      let usage: unknown = 'unknown', actualModel: unknown = 'unknown'
      const adapter = chatAdapter(provider, async (url, init) => {
        const response = await fetch(url, init)
        const value = await response.clone().json().catch(() => null) as { usage?: unknown; model?: unknown } | null
        usage = value?.usage ?? 'unknown'; actualModel = typeof value?.model === 'string' ? value.model : 'unknown'
        return response
      })
      const prompt: ChatPrompt = mode === 'existing-draft' ? draftPrompt(baseline) : assistancePrompt(context, request)
      const started = performance.now()
      try {
        const content = await adapter(key, prompt, new AbortController().signal)
        const value = mode === 'existing-draft' ? parseDraft(content, baseline) : parseAssistance(content)
        results.push({ sampleId: sample.id, locale: sample.locale, mode, structurallyValid: true, value, latencyMs: performance.now() - started, calls: 1, usage, requestedModel: CHAT_PROVIDERS[provider].model, actualModel, humanReview: null, criteria: sample.expected })
      } catch { results.push({ sampleId: sample.id, mode, structurallyValid: false, latencyMs: performance.now() - started, calls: 1, usage, requestedModel: CHAT_PROVIDERS[provider].model, actualModel, humanReview: null }) }
      await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
    }
  } finally { db.close() }
}
report.status = 'needs_human_review'
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify({ status: report.status, provider, samples: selected.length, calls: results.length, manualQualityAcceptance: report.manualQualityAcceptance }))
