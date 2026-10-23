/**
 * [INPUT]: Paused migrated environment, exact deployed source, current platform inventory and synthetic session.
 * [OUTPUT]: Uncharged invalid-input/old-consent/cache/full-log evidence and a source-bound review only when all gates pass.
 * [POS]: Pre-enable privacy acceptance. No provider requests, raw log exports or budget mutation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {client} from './client.mjs'
import {acceptanceTarget} from './acceptance-target.mjs'
import {inspectInvocationLogs} from './content-minimization/platform-logs.mjs'
import {eszipOriginalSource} from '../deploy/edge-source.mjs'
import {sha256} from '../deploy/schema.mjs'
import {actionId} from './content-minimization/identity.mjs'
import {inputs} from './content-minimization/fixtures.mjs'

const {args,environment,projectRef,projectUrl,config,sessionFile,prefix}=acceptanceTarget()
assert(process.argv.includes('--environment') && args.length===0,'Use an explicit --environment')
const out='output/tests/hosted-ai/content-minimization',db=await client(config,environment)
const report={ok:false,environment,project:projectRef,at:new Date().toISOString(),realProviderCalls:0,historicalPhysicalDeletionVerified:false}
let stage='platform_inventory'
try {
  const inventory=JSON.parse(await readFile(`${out}/${prefix}platform-inspection.json`,'utf8'))
  const audit=JSON.parse(await readFile(`${out}/${prefix}rollout-audit.json`,'utf8'))
  assert(inventory.ok && inventory.environment===environment && inventory.project===projectRef && Date.now()-Date.parse(inventory.at)<1800000,'Fresh environment platform inspection required')
  assert(audit.ok && audit.deployedSourceMatchesLocal && !audit.deployedLegacyCacheDependency && !audit.inventory.legacy_content_column && audit.inventory.budget.policy==='disabled','Paused source-matched privacy rollout required')
  assert(inventory.surfaces.logDrains.noConfiguredDrains && !inventory.surfaces.secrets.customTelemetrySecretPresent && inventory.surfaces.schema.contentColumnsAbsent,'Unreviewed telemetry or persistence surface')
  stage='retired_cache_key'
  const retired=JSON.parse(await readFile(`${out}/${prefix}cache-secret-apply.json`,'utf8'))
  assert(retired.ok && !retired.cacheKeyPresentAfter && retired.providerSecretUnchanged && retired.sourceSha256===audit.sourceSha256,'Retire the legacy cache Secret first')
  stage='source_sinks'
  const bytes=await db.request('/functions/hosted-ai/body',{binary:true})
  const source=bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8')
  assert(sha256(source)===audit.sourceSha256 && !/console\.(?:log|error|warn)|Sentry|OpenTelemetry|writeFile|Deno\.write/i.test(source),'Unreviewed application logging or file sink')
  stage='fixture_session'
  const env=parseEnv(await readFile(sessionFile,'utf8'))
  assert(env.SUPABASE_PROJECT_REF===projectRef && env.HOSTED_AI_SYNTHETIC_USER_ID && env.HOSTED_AI_SESSION_TOKEN,'Synthetic session required')
  stage='invalid_input_response'
  const marker=`synthetic-${randomUUID()}`,startedAt=new Date().toISOString()
  const response=await fetch(`${projectUrl}/functions/v1/hosted-ai`,{method:'POST',headers:{authorization:`Bearer ${env.HOSTED_AI_SESSION_TOKEN}`,apikey:env.SUPABASE_ANON_KEY,'content-type':'application/json'},body:JSON.stringify({version:2,consentScopeVersion:3,actionId:randomUUID(),request:{capability:'invalid',input:{text:marker}}}),signal:AbortSignal.timeout(15000),redirect:'error'})
  const body=await response.json()
  report.httpStatus=response.status
  assert(response.status===400 && body.error==='invalid_request' && Object.keys(body).length===1,'Malformed input did not produce a fixed error')
  report.cacheControlNoStore=response.headers.get('cache-control')==='no-store'
  report.gatewayCacheDynamic=['DYNAMIC','BYPASS'].includes(response.headers.get('cf-cache-status'))
  assert(report.cacheControlNoStore && report.gatewayCacheDynamic,'Gateway cache contract failed')
  report.executionId=response.headers.get('x-deno-execution-id')
  const executionIds=[report.executionId],rejectedActions=[]
  stage='old_client_consent_scope'
  inputs.assistance.context.item.description+=`\nSynthetic scope context: ${marker}`
  for(const scope of [undefined,1,2]) {
    const id=actionId();rejectedActions.push(id)
    const rejected=await fetch(`${projectUrl}/functions/v1/hosted-ai`,{method:'POST',headers:{authorization:`Bearer ${env.HOSTED_AI_SESSION_TOKEN}`,apikey:env.SUPABASE_ANON_KEY,'content-type':'application/json'},body:JSON.stringify({version:2,...(scope===undefined?{}:{consentScopeVersion:scope}),actionId:id,request:{capability:'assistance',input:inputs.assistance}}),signal:AbortSignal.timeout(15000),redirect:'error'})
    const failure=await rejected.json()
    assert(rejected.status===400 && failure.error==='invalid_request' && Object.keys(failure).length===1,'Old client bypassed consent scope')
    executionIds.push(rejected.headers.get('x-deno-execution-id'))
  }
  const admitted=await db.query(`select count(*)::int as count from public.ai_actions where user_id='${env.HOSTED_AI_SYNTHETIC_USER_ID}' and action_id in (${rejectedActions.map(id=>`'${id}'`).join(',')});`)
  assert(admitted[0].count===0,'Old client reserved an action')
  report.oldConsentRequestsRejected=3;report.oldConsentReservations=0
  stage='exposed_log_payloads'
  report.logInspection=await inspectInvocationLogs(db,{projectRef,executionIds,markers:[marker],startedAt})
  stage='uncharged_budget_readback'
  const budget=(await db.query("select limit_micro,spent_micro,policy,environment,blocked from public.ai_budget where id='integration-shared';"))[0]
  assert(JSON.stringify(budget)===JSON.stringify(audit.budgetAfter),'Budget changed during the uncharged probe')
  stage='controlled_acceptance'
  const controlled=JSON.parse(await readFile(`${out}/http-acceptance.json`,'utf8')),detector=JSON.parse(await readFile(`${out}/detector.json`,'utf8'))
  assert(controlled.ok && detector.ok,'Controlled privacy acceptance must pass first')
  report.sourceSha256=audit.sourceSha256;report.ok=true
  await writeFile(`${out}/${prefix}platform-review.json`,JSON.stringify({environment,project:projectRef,sourceSha256:audit.sourceSha256,at:new Date().toISOString(),bodyLoggingDisabled:true,tracePayloadsDisabled:true,gatewayCacheDisabled:true,historyLogicallyCleared:true,backupRetentionReviewed:true,restoreRequiresReclean:true,controlledAcceptancePassed:true,evidence:{inventory:`${prefix}platform-inspection.json`,probe:`${prefix}platform-probe.json`,retirement:`${prefix}cache-secret-apply.json`},scope:'Application sinks, empty configured log drains/telemetry secrets and complete exposed synthetic invocation payloads checked. Hidden infrastructure traces, backups/WAL retention and historical physical erasure remain unverified.'},null,2)+'\n',{mode:0o600})
}catch(error){report.error='platform_probe_incomplete';report.failureStage=stage;report.transportStatus=error.message.match(/HTTP \d{3}/)?.[0]??null;process.exitCode=1}
await writeFile(`${out}/${prefix}platform-probe.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600})
console.log(JSON.stringify(report,null,2))
