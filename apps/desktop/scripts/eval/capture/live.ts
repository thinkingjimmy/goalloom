/**
 * [INPUT]: Frozen bilingual synthetic fixtures, production planner/adapter and ignored root API key.
 * [OUTPUT]: Per-split exact-set accuracy, candidate judgements and full-case timing/model evidence without user workspace access.
 * [POS]: Live matching acceptance; labels and threshold are never tuned on the holdout.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { cpus, release } from 'node:os'
import { matchingPlan, matchedPreview, plainPreview, urlOnly } from '../../../src/domain/smart/matching'
import { currentPeriod, workspaceDate } from '../../../src/domain/calendar'
import { mapPeriodHorizons } from '../../../src/shared/contracts/values'
import type { AnalyzeRequest, Candidate } from '../../../src/shared/contracts/smart-input'
import type { SmartContext } from '../../../src/domain/smart/questions'
import type { Round } from '../../../src/domain/smart/preview'
import { systemOneAdapter, ProviderFailure } from '../../../src/main/smart/providers'

const root = resolve('../..'), stamp = new Date().toISOString().replace(/[:.]/g, '-'), directory = resolve('output/tests/auto-link/live', stamp)
await mkdir(directory, { recursive: true })
const env = await readFile(resolve(root, '.env.local'), 'utf8')
const key = env.split(/\r?\n/).find(line => line.startsWith('OPENROUTER_API_KEY='))?.slice('OPENROUTER_API_KEY='.length).trim().replace(/^["']|["']$/g, '')
if (!key) throw Error('OPENROUTER_API_KEY missing')
const limit = Number(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? Infinity)
const selectedSplit = ['regressions', 'development', 'holdout'].find(split => process.argv.includes(`--${split}`))
const splits = selectedSplit === 'development' ? ['development', 'regressions'] : selectedSplit ? [selectedSplit] : ['development', 'holdout', 'regressions']
const report: any = { status: 'running', model: 'typesafe/jev-1.14', gate: 0.60, datasetHashes: {}, sourceHashes: {},
  runtime: { electron: process.versions.electron, node: process.versions.node, os: release(), arch: process.arch, cpu: cpus()[0]?.model, machineScope: 'Physical/VM status not independently verified' }, rows: [], requests: [] }
const adapter = systemOneAdapter('openrouter')
for (const path of ['src/domain/smart/matching.ts', 'src/main/smart/providers.ts']) report.sourceHashes[path] = createHash('sha256').update(await readFile(path, 'utf8')).digest('hex')
const quantile = (values: number[], q: number) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1] : null
function metrics(rows: any[]) {
  return { cases: rows.length, exact: rows.filter(row => row.exact).length, errors: rows.filter(row => row.error).length,
    falseParents: rows.reduce((n, row) => n + row.actual.filter(id => !row.expected.includes(id)).length, 0),
    missedParents: rows.reduce((n, row) => n + row.expected.filter(id => !row.actual.includes(id)).length, 0),
    p50Ms: quantile(rows.map(row => row.ms), .50), p95Ms: quantile(rows.map(row => row.ms), .95),
    requests: rows.reduce((n, row) => n + row.requests, 0) }
}
async function save() {
  report.summary = Object.fromEntries(splits.map(split => [split, metrics(report.rows.filter(row => row.split === split))]))
  report.languages = Object.fromEntries(['zh', 'en'].map(language => [language, metrics(report.rows.filter(row => row.language === language))]))
  report.urls = metrics(report.rows.filter(row => row.url))
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2))
  const lines = ['# Production Jev 1.14 capture evaluation', '', 'Synthetic frozen labels; production inline matcher; no user workspace or web-page fetches. Complete-case timings include all batches and failures.', '', '| Split | Exact sets | False / missed parents | Errors | P50 / P95 ms | Requests |', '| --- | --- | --- | --- | --- | --- |',
    ...Object.entries(report.summary).map(([split, value]: [string, any]) => `| ${split} | ${value.exact}/${value.cases} | ${value.falseParents} / ${value.missedParents} | ${value.errors} | ${value.p50Ms} / ${value.p95Ms} | ${value.requests} |`), '',
    '| Slice | Exact sets | False / missed parents | Errors | P50 / P95 ms | Requests |', '| --- | --- | --- | --- | --- | --- |',
    ...Object.entries({ ...report.languages, urls: report.urls }).map(([slice, value]: [string, any]) => `| ${slice} | ${value.exact}/${value.cases} | ${value.falseParents} / ${value.missedParents} | ${value.errors} | ${value.p50Ms} / ${value.p95Ms} | ${value.requests} |`), '',
    `Served versions: ${[...new Set(report.requests.flatMap(request => request.meta?.modelVersion ? [request.meta.modelVersion] : []))].join(', ')}. Request totals include failed attempts; URL-only cases use zero requests.`, '',
    ...report.rows.filter(row => !row.exact).map(row => `- ${row.split}/${row.id}: expected ${JSON.stringify(row.expected)}, got ${JSON.stringify(row.actual)}${row.error ? ` (${row.error})` : ''}`), '']
  await writeFile(`${directory}/report.md`, lines.join('\n'))
}
try {
  for (const split of splits) {
    const source = await readFile(`scripts/eval/capture/${split}.json`, 'utf8'), data = JSON.parse(source)
    report.datasetHashes[split] = createHash('sha256').update(source).digest('hex')
    const calendar = data.calendar, referenceTime = data.referenceTime, referenceDate = workspaceDate(calendar.timezone, referenceTime)
    const periods = mapPeriodHorizons(horizon => currentPeriod(calendar, horizon, referenceTime))
    const candidates: Candidate[] = data.goals.map((goal, index) => ({ ref: `g${index + 1}`, itemId: goal.id, title: goal.title, horizon: goal.horizon,
      status: 'todo', archived: false, flowColor: goal.color ?? null, version: 1, named: false,
      parents: data.goals.filter(other => other.id === goal.parent).map(other => ({ itemId: other.id, title: other.title })),
      children: data.goals.filter(other => other.parent === goal.id).map(other => ({ itemId: other.id, title: other.title })) }))
    for (const item of data.cases.slice(0, limit)) {
      const start = performance.now(), before = report.requests.length
      const row: any = { split, id: item.id, family: item.family, language: item.language, url: item.text.includes('http'), expected: [...item.parents].sort(), actual: [], exact: false }
      try {
        const context: SmartContext = { text: item.text, calendar, referenceDate, weekdayName: '周五', timezone: calendar.timezone, weekStart: calendar.weekStart, periods, candidates }
        const request: AnalyzeRequest = { requestId: randomUUID(), draftSessionId: randomUUID(), generation: 'synthetic', providerRevision: 1, inputRevision: 1, manualRevision: 0, contextRevision: 1, referenceTime, text: item.text, parentHints: [], target: { horizon: 'day', startDate: referenceDate } }
        if (urlOnly(item.text)) row.actual = plainPreview(context, item.text).capture!.parents.map(parent => parent.itemId)
        else {
          const plan = matchingPlan(context, request)
          if ('kind' in plan) throw Error(plan.message)
          const rounds: Round[] = new Array(plan.batches.length)
          let next = 0
          await Promise.all(Array.from({ length: Math.min(2, plan.batches.length) }, async () => {
            for (;;) {
              const index = next++; if (index >= plan.batches.length) return
              const batch = plan.batches[index]!, started = performance.now(), record: any = { split, caseId: item.id, questions: Object.keys(batch.questions).length }
              report.requests.push(record)
              try {
                const output = await adapter(key, { ...batch, signal: AbortSignal.timeout(10_000) })
                record.meta = output.meta
                if (!output.meta.modelVersion?.includes('1.14')) throw Error('Unverified served model')
                rounds[index] = { answers: output.answers, precision: output.precision }
              } finally { record.ms = Math.round(performance.now() - started) }
            }
          }))
          const round: Round = { answers: Object.assign({}, ...rounds.map(value => value.answers)), precision: rounds[0]?.precision ?? { decimals: null, source: null } }
          row.judgements = plan.matches.map(match => ({ candidate: match.candidate.itemId, answer: round.answers[match.key] }))
          row.precision = round.precision
          row.actual = matchedPreview(context, request, plan, round).capture!.parents.map(parent => parent.itemId).sort()
        }
        row.exact = JSON.stringify(row.actual) === JSON.stringify(row.expected)
      } catch (error) { row.error = error instanceof ProviderFailure ? error.failure.kind : error instanceof Error ? error.message : String(error) }
      row.ms = Math.round(performance.now() - start); row.requests = report.requests.length - before
      report.rows.push(row)
      await save()
      console.log(`${split} ${report.rows.filter(value => value.split === split).length}/${Math.min(data.cases.length, limit)} ${row.exact ? 'pass' : row.error ?? 'mismatch'} ${row.ms}ms`)
      if (['authentication_failed', 'payment_required', 'quota_exhausted', 'permission_denied'].includes(row.error)) throw Error(`Provider stopped: ${row.error}`)
    }
  }
  report.status = 'complete'
} finally { await save(); console.log(`Evidence: ${directory}/report.md`) }
