/**
 * [INPUT]: Explicit execution mode, private environment-specific user session and the existing shared budget.
 * [OUTPUT]: Durable synthetic identities, original-result/cache checks, full-row privacy scans and actual cost metadata.
 * [POS]: Manual live integration acceptance; no automatic retries, receipt deletion or budget changes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile, rename } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { build } from 'esbuild'
import { client, readFetch } from './client.mjs'
import { actionId } from './content-minimization/identity.mjs'
import { acceptanceTarget } from './acceptance-target.mjs'
import { metadataOnly } from './content-minimization/scan.mjs'
import { inspectInvocationLogs } from './content-minimization/platform-logs.mjs'
const { args, environment, projectRef, projectUrl, config, sessionFile, prefix } = acceptanceTarget()

const mode = args[0] ?? '--plan'
assert(['--plan', '--apply'].includes(mode), 'Use --plan or --apply')
const run = args[1] ?? 'initial'
assert(/^[a-z0-9-]{1,48}$/.test(run), 'Use a short lowercase run name')
const capabilities = args.slice(2)
assert(capabilities.every(value => ['evaluate', 'draft', 'review', 'assistance'].includes(value)), 'Unknown capability selector')
const directory = 'output/tests/hosted-ai'
await mkdir(directory, { recursive: true })
const file = `${directory}/${prefix}live-${run}.json`
let report
try { report = JSON.parse(await readFile(file, 'utf8')) }
catch (error) { if (error.code !== 'ENOENT') throw error }
const fresh = !report
report ??= { project: projectRef, run, ok: false, scope: `Real ${environment} Auth/Edge/provider with synthetic context. Structural checks only; human quality, desktop OAuth and packaged acceptance remain separate.`, actions: (capabilities.length ? [...new Set(capabilities)] : ['evaluate', 'draft', 'review', 'assistance']).map(capability => ({ capability, actionId: actionId(), stage: 'planned' })) }
assert(report.project === projectRef && report.run === run, 'Unexpected saved run')
assert(!capabilities.length || capabilities.every(capability => report.actions.some(action => action.capability === capability)), 'Saved run has different capabilities')
const persist = async () => {
  await writeFile(`${file}.tmp`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  await rename(`${file}.tmp`, file)
}
if (fresh) await writeFile(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
const bundle = await build({ stdin: { contents: "export {hostedInputSchema} from './apps/desktop/src/shared/contracts/hosted-ai'; export {parseDraft,parseReview} from './apps/desktop/src/domain/smart/insight'; export {parseAssistance} from './apps/desktop/src/domain/smart/assistance'; export {retainsNoteAnchors} from './apps/desktop/src/domain/smart/rewrite-notes'", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' })
const validators = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const { inputs } = await import('./content-minimization/fixtures.mjs')
// These markers stay in this process. Reports contain action identities, never content fingerprints.
const marker=`synthetic-${randomUUID()}`
inputs.evaluate.state.text += ` ${marker}`
inputs.draft.tasks[0].parent += ` ${marker}`
inputs.review.prefs.about = `Synthetic acceptance context ${marker}`
inputs.assistance.context.item.description += `\nSynthetic context: ${marker}`
const description=inputs.assistance.context.item.description
const markers=[marker]

for (const capability of Object.keys(inputs)) validators.hostedInputSchema.parse({ capability, input: inputs[capability] })
if (mode === '--plan') {
  console.log(`Plan: ${file}; ${report.actions.length} synthetic actions, USD 0.50 reservation each, existing USD 10 shared cap. No network or inference.`)
  process.exit(0)
}

let db
try {
  const privateFile = sessionFile
  assert(((await stat(privateFile)).mode & 0o077) === 0, 'Session file must be owner-only')
  const env = parseEnv(await readFile(privateFile, 'utf8'))
  assert(env.SUPABASE_PROJECT_REF === projectRef && env.HOSTED_AI_SESSION_TOKEN && env.SUPABASE_ANON_KEY, 'Missing selected-project user session configuration')
  db = await client(config, environment)
  db.hide(env.HOSTED_AI_SESSION_TOKEN); db.hide(env.SUPABASE_ANON_KEY)
  const call = async (path, json) => {
    const response = await (json ? fetch : readFetch)(`${projectUrl}${path}`, { method: json ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${env.HOSTED_AI_SESSION_TOKEN}`, apikey: env.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      ...(json ? { body: JSON.stringify(json) } : {}), signal: AbortSignal.timeout(45_000), redirect: 'error' })
    return { status: response.status, body: await response.json(), headers:response.headers }
  }
  const identity = await call('/auth/v1/user')
  assert.equal(identity.status, 200, 'User session unavailable')
  assert(/^[0-9a-f-]{36}$/i.test(identity.body.id), 'Invalid authenticated identity')
  // A saved run cannot be recovered under a different account.
  const owner = createHash('sha256').update(identity.body.id).digest('hex')
  assert(!report.owner || report.owner === owner, 'Saved run belongs to another account')
  report.owner = owner
  const endpoint = '/functions/v1/hosted-ai'
  const eligibility = await call(`${endpoint}?status=1`)
  assert.equal(eligibility.status, 200, 'Eligibility unavailable')
  const planned = report.actions.filter(action => action.stage === 'planned').length
  if (planned) assert.equal(eligibility.body.eligible, true, 'Hosted secrets or eligibility unavailable; no inference sent')
  const budget = (await db.query("select limit_micro,spent_micro,blocked,environment from public.ai_budget where id='integration-shared';"))[0]
  assert(budget && budget.environment === environment && budget.limit_micro <= 10000000, 'Shared budget unavailable')
  if (planned) assert(!budget.blocked && budget.limit_micro - budget.spent_micro >= 500000 * planned, 'Insufficient shared reservation budget or protection active')
  report.budgetBefore ??= budget
  if(!fresh)report.recoveryBudgetBefore=budget
  for (const action of report.actions) {
    const request = validators.hostedInputSchema.parse({ capability: action.capability, input: inputs[action.capability] })
    let response, originalResponse=false
    if (action.stage === 'planned') {
      // Planned identities have never crossed the send boundary; refresh only these on explicit apply.
      const issued=Number.parseInt(action.actionId.replaceAll('-','').slice(0,12),16)
      if(action.actionId[14]!=='7' || !Number.isFinite(issued) || issued<Date.now()-240000) action.actionId=actionId()
      action.stage = 'sent'; action.sentAt = new Date().toISOString(); await persist()
      try { response = await call(endpoint, { version: 2, consentScopeVersion: 3, actionId: action.actionId, request }); originalResponse=true }
      catch { response = await call(`${endpoint}?actionId=${action.actionId}`) }
    } else response = await call(`${endpoint}?actionId=${action.actionId}`)
    if(originalResponse) {
      action.httpStatus=response.status
      action.cacheControlNoStore=response.headers.get('cache-control')==='no-store'
      action.gatewayCacheDynamic=['DYNAMIC','BYPASS'].includes(response.headers.get('cf-cache-status'))
      action.executionId=response.headers.get('x-deno-execution-id')
      action.gatewayRequestId=response.headers.get('sb-request-id')
    } else {
      action.receiptHttpStatus=response.status
      action.receiptExecutionId=response.headers.get('x-deno-execution-id')
    }
    if(action.stage==='validated') {
      assert(response.status===409 && response.body.error==='result_not_delivered' && !Object.hasOwn(response.body,'result'),'Completed original attempt must stay receipt-only')
      action.receiptOnlyRechecked=true;await persist();continue
    }
    if (response.status !== 200 || response.body.status !== 'ready') {
      action.failure = ['result_not_delivered','outcome_pending','outcome_unknown','outcome_lost','reconciliation_closed','malformed_response','provider_failed','action_expired'].includes(response.body.error) ? response.body.error : 'unavailable'
      throw Error('Action unavailable; recover the same run without resending inference')
    }
    if (!Object.hasOwn(response.body, 'result')) throw Error('Original result unavailable; receipt cannot restore content')
    const result = response.body.result
    markers.push(JSON.stringify(result))
    assert(action.cacheControlNoStore && action.gatewayCacheDynamic,'Hosted gateway cache contract failed')
    if (action.capability === 'evaluate') assert(result?.answers?.task?.probability >= 0.7, 'Synthetic actionable task was not recognized')
    if (action.capability === 'draft') validators.parseDraft(result, inputs.draft)
    if (action.capability === 'review') validators.parseReview(result)
    if (action.capability === 'assistance') {
      const parsed = validators.parseAssistance(result)
      action.rewriteChecks={kindCorrect:parsed.kind==='rewrite',anchorsRetained:parsed.kind==='rewrite' && validators.retainsNoteAnchors(description,parsed.description)}
      assert(parsed.kind === 'rewrite' && validators.retainsNoteAnchors(description, parsed.description), 'Rewrite lost completed work or links')
    }
    action.stage = 'validated'; delete action.failure; await persist()
  }
  report.ok = true
  delete report.error
} catch (error) {
  report.ok = false; report.error = 'live_acceptance_incomplete'; process.exitCode = 1
} finally {
  if (db) {
    try {
      const ids = report.actions.map(action => action.actionId)
      assert(ids.every(id => /^[0-9a-f-]{36}$/i.test(id)), 'Invalid saved action identity')
      const completeRows = await db.query(`select * from public.ai_actions where action_id in (${ids.map(id => `'${id}'`).join(',')});`)
      report.fullPersistencePayloadsMetadataOnly=metadataOnly(completeRows,markers)
      assert(report.fullPersistencePayloadsMetadataOnly,'Server persistence is not metadata-only')
      const receipts=completeRows.map(row=>Object.fromEntries(['action_id','capability','status','model','rate_version','provider_request_id','input_tokens','output_tokens','charged_micro','confirmed','created_at'].map(key=>[key,row[key]])))
      const budgetAfter = (await db.query("select limit_micro,spent_micro,blocked,environment from public.ai_budget where id='integration-shared';"))[0]
      report.receipts = receipts; report.budgetAfter = budgetAfter; report.accountingCheckedAt = new Date().toISOString()
      delete report.accountingError
      report.accountingComplete = report.receipts.length === report.actions.length && report.receipts.every(row => row.confirmed && row.provider_request_id && row.input_tokens !== null && (row.capability === 'evaluate' || row.output_tokens !== null))
      report.feesConfirmed=report.receipts.length===report.actions.length && report.receipts.every(row=>row.confirmed)
      const executionIds=report.actions.map(action=>action.executionId).filter(Boolean)
      if(executionIds.length)report.platformLogs=await inspectInvocationLogs(db,{projectRef,executionIds,markers,startedAt:report.actions.find(action=>action.sentAt)?.sentAt??new Date().toISOString()})
      if (!report.accountingComplete) { report.ok = false; process.exitCode = 1 }
    } catch (error) { report.accountingComplete = false; report.accountingError = 'accounting_unverified'; report.ok = false; process.exitCode = 1 }
  }
  await persist()
  console.log(`Evidence: ${file}; ok=${report.ok}. No prompts, responses or credentials saved. Human quality review remains required.`)
}
