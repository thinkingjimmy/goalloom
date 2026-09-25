/**
 * [INPUT]: OPENROUTER_API_KEY from the git-ignored .env.local; evalCases; the product's real planQuestions/adapter/buildPreview.
 * [OUTPUT]: output/eval/smart-<timestamp>.{json,md}: per-case preview, expectation checks, question count and latency; exit code 1 on any failed check.
 * [POS]: Repeatable live evaluation of the smart-input pipeline against a real provider; never prints or stores the key or the request body.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { planQuestions, relationRound, type SmartContext } from '../../src/domain/smart/questions'
import { buildPreview, taskSlots, type Round } from '../../src/domain/smart/preview'
import { systemOneAdapter, ProviderFailure, type Adapter } from '../../src/main/smart/providers'
import type { Candidate, SmartPreview } from '../../src/shared/contracts/smart-input'
import { sharedTerm } from '../../src/domain/smart/terms'
import { evalCases, type EvalCase } from './cases'

const periods = { day: { id: 'eval:day:2026-09-23', startDate: '2026-09-23', endDate: '2026-09-24' }, week: { id: 'eval:week:2026-09-21', startDate: '2026-09-21', endDate: '2026-09-28' }, month: { id: 'eval:month:2026-09-01', startDate: '2026-09-01', endDate: '2026-10-01' }, cycle: { id: 'eval:cycle:2026-07-01', startDate: '2026-07-01', endDate: '2026-10-01' } }

async function key(): Promise<string> {
  const line = (await readFile('.env.local', 'utf8')).split(/\r?\n/).find(row => row.startsWith('OPENROUTER_API_KEY='))
  const value = line?.slice('OPENROUTER_API_KEY='.length).trim().replace(/^["']|["']$/g, '')
  if (!value) throw new Error('OPENROUTER_API_KEY missing in .env.local')
  return value
}
function context(item: EvalCase): SmartContext {
  // Mirrors the product reader: a board goal reaches Jev when named in full or sharing a distinctive term.
  const candidates: Candidate[] = (item.goals ?? []).map(goal => typeof goal === 'string' ? { title: goal, horizon: 'cycle' as const } : goal)
    .filter(goal => item.text.includes(goal.title) || sharedTerm(item.text, goal.title) > 0 || (item.goals ?? []).every(row => typeof row === 'string'))
    .map((goal, index) => ({ ref: `g${index + 1}`, itemId: `goal-${goal.title}`, title: goal.title, status: 'todo', horizon: goal.horizon, archived: false, flowColor: null, version: 1, named: item.text.includes(goal.title) }))
  return { text: item.text, referenceDate: '2026-09-23', weekdayName: '周三', timezone: 'Asia/Shanghai', weekStart: 1, periods, candidates }
}

async function run(adapter: Adapter, apiKey: string, item: EvalCase) {
  const ctx = context(item)
  const plan = planQuestions(ctx)
  if ('kind' in plan) return { error: plan.message }
  const calls: { questions: number; ms: number; inputTokens: number | null }[] = []
  const call = async (state: typeof plan.state, questions: typeof plan.questions): Promise<Round> => {
    const started = performance.now()
    const output = await adapter(apiKey, { state, questions, signal: AbortSignal.timeout(60_000) })
    calls.push({ questions: Object.keys(questions).length, ms: Math.round(performance.now() - started), inputTokens: output.meta.inputTokens })
    return { answers: output.answers, precision: output.precision }
  }
  const first = await call(plan.state, plan.questions)
  // Contract violations are recorded per answer, so a rejected response stays diagnosable.
  const violations = Object.entries(first.answers).flatMap(([id, answer]) => {
    if (answer.type !== 'choice' || !answer.probabilities) return []
    const top = Math.max(...Object.values(answer.probabilities))
    return top - (answer.probabilities[answer.choice] ?? 0) > 1e-6 ? [`${id}: choice=${answer.choice} ${JSON.stringify(answer.probabilities)}`] : []
  })
  if (violations.length) console.log(`  ! ${item.id} choice-not-max: ${violations.join(' | ')}`)
  let supplement: Parameters<typeof buildPreview>[3] = null
  if (plan.deferredRelations) {
    const next = relationRound(plan, taskSlots(plan, first), ctx.candidates, Object.keys(plan.questions).length)!
    supplement = { pairs: next.pairs, round: Object.keys(next.questions).length ? await call(next.state, next.questions) : { answers: {}, precision: first.precision } }
  }
  const preview = buildPreview(ctx, plan, first, supplement)
  // Raw choices for the slot-level questions make a wrong split diagnosable without re-running.
  const raw = Object.fromEntries(Object.entries(first.answers).filter(([id]) => /^(layout|role_|horizon_|infer_|due_|use_|rel_)/.test(id)).map(([id, answer]) => [id, answer.type === 'choice' ? `${answer.choice} ${JSON.stringify(answer.probabilities)}` : answer.probability]))
  return { preview, calls, slots: plan.slots.map(slot => slot.text), raw }
}

function check(item: EvalCase, preview: SmartPreview): string[] {
  const e = item.expected, drafts = preview.drafts, failures: string[] = []
  const [min, max] = Array.isArray(e.drafts) ? e.drafts : [e.drafts, e.drafts]
  if (drafts.length < min || drafts.length > max) failures.push(`drafts ${drafts.length}, expected ${min === max ? min : `${min}–${max}`}`)
  e.titles?.forEach((title, i) => { if (drafts[i]?.title !== title) failures.push(`title[${i}] "${drafts[i]?.title}" ≠ "${title}"`) })
  // A horizon only counts when it would actually be prefilled (certain), matching what the user sees.
  e.horizons?.forEach((horizon, i) => { const d = drafts[i]; const shown = d ? (d.horizon.certain ? (d.horizon.value === 'future' ? 'later' : d.horizon.value) : 'later') : null; if (shown !== horizon) failures.push(`horizon[${i}] ${shown} ≠ ${horizon}`) })
  e.due?.forEach((due, i) => { const d = drafts[i]; const shown = d?.due.certain ? d.due.value : null; if (shown !== due) failures.push(`due[${i}] ${shown} ≠ ${due}`) })
  if (e.anyDue && !drafts.some(d => d.due.certain && d.due.value === e.anyDue)) failures.push(`no draft due ${e.anyDue}`)
  e.descriptionIncludes?.forEach(text => { if (!drafts.some(d => d.description.includes(text))) failures.push(`no description contains "${text}"`) })
  if (e.existingParent) {
    const goal = preview.candidates.find(c => c.title === e.existingParent)
    if (!goal || !preview.relations.some(r => r.state === 'yes' && r.parent.kind === 'existing' && r.parent.itemId === goal.itemId)) failures.push(`parent "${e.existingParent}" not suggested`)
  }
  if (e.parentSuggested) {
    const goal = preview.candidates.find(c => c.title === e.parentSuggested)
    const states = goal ? preview.relations.filter(r => r.parent.kind === 'existing' && r.parent.itemId === goal.itemId).map(r => r.state) : []
    if (!states.some(state => state === 'yes' || state === 'maybe')) failures.push(`parent "${e.parentSuggested}" ${goal ? states.join('/') || 'not asked' : 'not a candidate'}`)
  }
  e.draftParent?.forEach(([child, parent]) => {
    const c = drafts[child], p = drafts[parent]
    const state = c && p ? preview.relations.find(r => r.childDraftId === c.draftId && r.parent.kind === 'draft' && r.parent.draftId === p.draftId)?.state : undefined
    if (state !== 'yes' && state !== 'maybe') failures.push(`draft ${child} → ${parent}: ${state ?? 'missing'}`)
  })
  e.warnings?.forEach(kind => { if (!preview.warnings.some(w => w.kind === kind)) failures.push(`missing warning ${kind}`) })
  return failures
}

const apiKey = await key()
const adapter = systemOneAdapter('openrouter')
const only = process.argv.slice(2)
const results = []
for (const item of evalCases.filter(row => !only.length || only.includes(row.id))) {
  try {
    const outcome = await run(adapter, apiKey, item)
    if ('error' in outcome) { results.push({ id: item.id, text: item.text, failures: [String(outcome.error)] }); continue }
    const failures = check(item, outcome.preview)
    results.push({ id: item.id, text: item.text, failures, slots: outcome.slots, calls: outcome.calls, raw: outcome.raw,
      drafts: outcome.preview.drafts.map(d => ({ title: d.title, description: d.description, horizon: `${d.horizon.value}${d.horizon.certain ? '' : '?'}`, inferred: d.inferredHorizon ? `${d.inferredHorizon.value}${d.inferredHorizon.certain ? '' : '?'}` : null, due: d.due.value ? `${d.due.value}${d.due.certain ? '' : '?'}` : null, roleCertain: d.roleCertain })),
      relations: outcome.preview.relations.filter(r => r.state !== 'no').map(r => ({ child: r.childDraftId, parent: r.parent.kind === 'existing' ? r.parent.itemId : r.parent.draftId, state: r.state, p: r.probability })),
      warnings: outcome.preview.warnings.map(w => w.kind) })
  } catch (error) {
    results.push({ id: item.id, text: item.text, failures: [error instanceof ProviderFailure ? `${error.failure.kind} ${error.failure.status ?? ''}` : String(error)] })
  }
  const last = results.at(-1)!
  console.log(`${last.failures.length ? '✗' : '✓'} ${item.id}${last.failures.length ? `  ${last.failures.join('; ')}` : ''}`)
}
const passed = results.filter(row => !row.failures.length).length
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
await mkdir('output/eval', { recursive: true })
await writeFile(`output/eval/smart-${stamp}.json`, JSON.stringify({ provider: 'openrouter', model: 'typesafe/jev-1.13', referenceDate: '2026-09-23', passed, total: results.length, results }, null, 2))
const md = [`# Smart input eval ${stamp}`, '', `OpenRouter · typesafe/jev-1.13 · ${passed}/${results.length} passed`, '', '| case | result | drafts | calls (questions / ms) |', '| --- | --- | --- | --- |',
  ...results.map(row => `| ${row.id} | ${row.failures.length ? `✗ ${row.failures.join('; ')}` : '✓'} | ${'drafts' in row ? (row.drafts ?? []).map(d => `${d.title} [${d.horizon}${d.inferred ? ` → 推测 ${d.inferred}` : ''}${d.due ? ` · ${d.due}` : ''}]`).join(' / ') : ''} | ${'calls' in row ? (row.calls ?? []).map(c => `${c.questions}/${c.ms}`).join(', ') : ''} |`)].join('\n')
await writeFile(`output/eval/smart-${stamp}.md`, md)
console.log(`\n${passed}/${results.length} passed → output/eval/smart-${stamp}.md`)
process.exitCode = passed === results.length ? 0 : 1
