/**
 * [INPUT]: A private read-only Management credential, UTC date bounds and an explicit environment.
 * [OUTPUT]: Redacted terminal/optional JSON usage totals with confirmed and unresolved costs separated.
 * [POS]: Manual read-only report; no account, eligibility or cost writes and no raw provider/task data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { createHash } from 'node:crypto'
import { client } from './client.mjs'
export function usageRange(values, now = Date.now()) {
  const boundary = value => { assert(/^(\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)$/u.test(value), 'Dates must use UTC (YYYY-MM-DD or ISO with Z)'); const date = new Date(value); assert(Number.isFinite(date.getTime()) && date.toISOString().startsWith(value.slice(0,10)), 'Invalid UTC date'); return date.toISOString() }
  const to = values.to ? boundary(values.to) : new Date(now).toISOString()
  const from = values.from ? boundary(values.from) : new Date(Date.parse(to) - 86_400_000).toISOString()
  assert(from < to, 'Expected from < to')
  assert(['development','production'].includes(values.environment), 'Explicit environment is required')
  return { from, to, environment: values.environment }
}
export function summarize(rows, events, budget, range) {
  const groups = new Map(), accounts = new Map()
  const add = (target, row) => {
    target.calls++; target.inputTokens += Number(row.input_tokens ?? 0); target.outputTokens += Number(row.output_tokens ?? 0)
    target.missingTokens += Number(row.input_tokens === null || row.output_tokens === null)
    target.failed += Number(row.status === 'failed'); target.unknown += Number(row.status === 'unknown' || row.status === 'running')
    target[row.confirmed ? 'confirmedMicro' : 'unresolvedMicro'] += Number(row.charged_micro)
  }
  const empty = () => ({ calls: 0, inputTokens: 0, outputTokens: 0, missingTokens: 0, failed: 0, unknown: 0, confirmedMicro: 0, unresolvedMicro: 0 })
  const totals = empty()
  for (const row of rows) {
    assert(row.charged_micro !== null && row.charged_micro !== undefined && Number.isSafeInteger(Number(row.charged_micro)) && Number(row.charged_micro) >= 0 && typeof row.confirmed === 'boolean', 'Missing cost metadata')
    add(totals,row)
    const key = `${row.environment}/${row.capability}/${row.eligibility}`
    if (!groups.has(key)) groups.set(key,empty())
    add(groups.get(key),row)
    const alias = createHash('sha256').update(`hosted-usage-account-v1:${row.user_id}`).digest('hex').slice(0,16)
    if (!accounts.has(alias)) accounts.set(alias,empty())
    add(accounts.get(alias),row)
  }
  return { range, completeness: rows.length ? totals.unresolvedMicro || totals.missingTokens ? 'incomplete' : 'confirmed' : 'no_records',
    totals, groups: Object.fromEntries(groups), highConsumption: [...accounts].sort((a,b)=>(b[1].confirmedMicro+b[1].unresolvedMicro)-(a[1].confirmedMicro+a[1].unresolvedMicro)).slice(0,10).map(([account,usage])=>({account,...usage})),
    limited: events, budget: budget ?? null, retries: 'No automatic retries. Each admitted action is one provider attempt; new action IDs are separately charged.',
    note: 'Amounts are USD microdollars. Unresolved amounts are conservative reservations, never confirmed zero. No records does not establish zero cost; retention is 90 days. Budget totals are cumulative and do not reset.' }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: { from: {type:'string'}, to: {type:'string'}, environment: {type:'string',default:'development'}, config: {type:'string',default:'.env.hosted-ai-readonly.local'}, json: {type:'string'} } })
    const range = usageRange(values)
    const db = await client(values.config, range.environment)
    // Read-only API transaction plus SELECT-only SQL. Neither this script nor the credential should have write authority.
    const filter = `environment='${range.environment}' and created_at>='${range.from}'::timestamptz and created_at<'${range.to}'::timestamptz`
    const [rows,events,budget,count] = await Promise.all([
      db.query(`select user_id,capability,environment,eligibility,status,confirmed,input_tokens,output_tokens,charged_micro from public.ai_actions where ${filter} order by created_at;`),
      db.query(`select reason,count(*)::int as count from public.ai_limit_events where ${filter} group by reason;`),
      db.query("select limit_micro,spent_micro,environment,blocked from public.ai_budget where id='integration-shared';"),
      db.query(`select count(*)::text as total from public.ai_actions where ${filter};`),
    ])
    const report = summarize(rows,events,budget[0],range)
    report.receivedRecords = rows.length; report.expectedRecords = Number(count[0]?.total ?? NaN)
    if (report.receivedRecords !== report.expectedRecords) report.completeness = 'incomplete'
    report.automaticRetries = 0
    if (values.json) await writeFile(values.json, JSON.stringify(report,null,2)+'\n',{mode:0o600})
    console.log(JSON.stringify(report,null,2))
  } catch (error) { console.error(`Usage report unavailable: ${error.message}. Costs are not confirmed zero.`); process.exitCode=1 }
}
