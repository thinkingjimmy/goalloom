/**
 * [INPUT]: Newly reviewed installer, immutable paused continuation and unchanged accepted runtime evidence.
 * [OUTPUT]: Local fixed-installer rollback plan or one explicitly leased rollback with independent preservation proof.
 * [POS]: Installer validation only. No persistent install, privilege grant, policy/cron/source or fixture action.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile,open} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {client,developmentRef} from '../hosted-ai/client.mjs'
import {sha256} from '../deploy/schema.mjs'
import {reviewDeploymentPlan} from './d2-deploy-development.mjs'
import {buildInstallSql,collectDeploymentState,normalizedSchemaSql} from './d2-deploy-state.mjs'
import {acquireDeploymentLock} from './d2-deploy-lock.mjs'
import {isRuntime} from './d2-populated-gate.mjs'
import {literal as q} from './d1-sync-fixtures.mjs'
const directory='output/tests/billing/desktop/d2-deployment/diagnostics'
const same=(a,b)=>canonicalJson(a)===canonicalJson(b)
const entry=async path=>{const bytes=await readFile(path);return{path,sha256:sha256(bytes),bytes:bytes.length}}
const stable=state=>Object.fromEntries(Object.entries(state.business).filter(([key])=>!state.tables.some(t=>`${t.schema}.${t.name}`===key&&isRuntime(t))))
const paused=state=>state.admission.service_enabled===false&&state.admission.billing_enabled===false&&state.cron.find(j=>j.jobname==='goalloom-billing-worker-development')?.active===false
const absent=state=>Object.values(state.markers).every(v=>v===false)
export function buildInstallRollbackSql(reviewed,applicationName){
 const journal=reviewed.continuation.journal
 const generated=buildInstallSql({applicationName,migrations:reviewed.migrations,tables:journal.pausedState.tables,
  coreHistoryPresent:journal.pausedState.coreHistoryPresent,historySha256:journal.pausedState.history,
  drainEvidenceSha256:sha256(canonicalJson(journal.drainObservation))}).trim()
 assert(generated.startsWith('begin;')&&generated.endsWith('commit;'))
 const body=generated.slice(6,-7),capture=`get stacked diagnostics diagnostic_state=returned_sqlstate,diagnostic_message=message_text;
 insert into pg_temp.d2_install_diagnostic values(false,current_user,diagnostic_state,
 case when diagnostic_message~'^[a-z]+(_[a-z]+)+$' and length(diagnostic_message)<=128 then diagnostic_message else 'database_error_redacted' end,null);`
 const sql=`begin;set local application_name=${q(applicationName)};set local statement_timeout='45s';set local lock_timeout='3s';
 create temporary table d2_install_diagnostic(ok boolean,executor text,state text,message text,schema_attestation jsonb) on commit drop;
 do $diagnose$ declare diagnostic_state text;diagnostic_message text;attestation jsonb;begin
 begin execute ${q(body)};
 execute ${q(normalizedSchemaSql.trim().replace(/;$/,''))} into attestation;
 insert into pg_temp.d2_install_diagnostic values(true,current_user,null,null,attestation);
 exception when query_canceled or assert_failure then ${capture}
 when others then ${capture}
 end;end $diagnose$;
 select to_jsonb(d) as diagnostic from pg_temp.d2_install_diagnostic d;
 rollback;`
 return{sql,bodySha256:sha256(body),originalSqlSha256:sha256(generated)}
}
async function inputs(deploymentPlanPath,reviewedSet){
 const reviewed=await reviewDeploymentPlan(deploymentPlanPath,reviewedSet)
 assert(reviewed.continuation,'Exact immutable paused continuation required')
 const sources=await Promise.all([deploymentPlanPath,'scripts/billing/d2-install-diagnose.mjs',`${directory}/failure-cases.md`,
  'output/tests/billing/desktop/d2-deployment/continuation-failure-cases.md'].map(entry))
 return{reviewed,sources}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
const args=process.argv.slice(2),mode=args[0]??'--plan',flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
assert(['--plan','--run'].includes(mode),'Use --plan or an exactly leased --run <plan> --reviewed-set <hash>')
if(mode==='--plan'){
 const deploymentPlanPath=flag('--deployment-plan'),deploymentSet=flag('--deployment-set'),input=await inputs(deploymentPlanPath,deploymentSet)
 const applicationName=`d2-install:${randomUUID()}`,built=buildInstallRollbackSql(input.reviewed,applicationName)
 const targets=input.reviewed.continuation.journal.pausedState.tables.filter(t=>!isRuntime(t)&&['public','service_private'].includes(t.schema)&&['r','p','m'].includes(t.kind)).map(t=>`${t.schema}.${t.name}`)
 const plan={version:2,project:developmentRef,sourceOnly:true,remoteExecuted:false,rollbackOnly:true,applicationName,sources:input.sources,
  deploymentPlanPath,deploymentSet,sqlSha256:sha256(built.sql),bodySha256:built.bodySha256,originalSqlSha256:built.originalSqlSha256,lockTargets:targets,
  scope:'One exact fixed buildInstallSql body in error-catching forced ROLLBACK, from the immutable original paused baseline. Preserve every original stable fingerprint/catalog/source/history/AI fact; no persistent install, grants, Edge/Secret, fixture, provider or model action.'}
 plan.reviewedSetSha256=sha256(canonicalJson(plan));await mkdir(directory,{recursive:true,mode:0o700})
 const path=`${directory}/plan-${plan.reviewedSetSha256}.json`;await writeFile(path,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600})
 console.log(JSON.stringify({readyForReview:true,path,reviewedSetSha256:plan.reviewedSetSha256,sqlSha256:plan.sqlSha256,lockTargets:targets,remoteExecuted:false}))
}else{
 assert(process.env.D2_INSTALL_DIAGNOSTIC_WINDOW==='development','Exact Root diagnostic window required before credentials')
 assert(new RegExp(`^${directory}/plan-[a-f0-9]{64}\\.json$`).test(args[1]),'Exact immutable diagnostic plan required')
 const plan=JSON.parse(await readFile(args[1],'utf8')),{reviewedSetSha256,...material}=plan
 assert(plan.version===2&&plan.project===developmentRef&&reviewedSetSha256===flag('--reviewed-set')&&sha256(canonicalJson(material))===reviewedSetSha256,'Exact reviewed diagnostic set required')
 const input=await inputs(plan.deploymentPlanPath,plan.deploymentSet);assert(same(input.sources,plan.sources),'Diagnostic inputs changed')
 const built=buildInstallRollbackSql(input.reviewed,plan.applicationName);assert(sha256(built.sql)===plan.sqlSha256&&built.bodySha256===plan.bodySha256&&built.originalSqlSha256===plan.originalSqlSha256,'Reviewed fixed SQL changed')
 const attempt=plan.applicationName.slice('d2-install:'.length),reportPath=`${directory}/attempt-${attempt}.json`,intentPath=`${directory}/intent-${attempt}.json`
 try{await readFile(intentPath);throw Error('Original diagnostic dispatch exists; never replay it')}catch(error){if(error.code!=='ENOENT')throw error}
 const lock=await acquireDeploymentLock(`output/tests/billing/desktop/d2-deployment/windows/${plan.deploymentSet.slice(0,20)}`,plan.deploymentSet,attempt)
 const report={version:2,ok:false,project:developmentRef,rollbackRequested:true,writeRequests:0,reviewedSetSha256,applicationName:plan.applicationName,errors:[]};let db,before
 try{
  db=await client();before=await collectDeploymentState(db)
  const baseline=input.reviewed.continuation.journal.pausedState
  assert(absent(before)&&paused(before)&&before.history===baseline.history&&same(stable(before),stable(baseline))&&same(before.catalog,baseline.catalog)&&same(before.edges,baseline.edges)&&same(before.cron,baseline.cron),'Original paused D1 baseline drift')
  const originalApp=input.reviewed.continuation.journal.installApplicationName
  assert(Number((await db.query(`select count(*) as n from pg_stat_activity where application_name=${q(originalApp)} and state<>'idle'`))[0].n)===0,'Original installer still active')
  assert(Object.entries(before.drain).filter(([key])=>key!=='unknownAi').every(([,n])=>Number(n)===0),'Accepted writer/lease/queued worker remains active')
  const intent=await open(intentPath,'wx',0o600)
  try{await intent.writeFile(JSON.stringify({version:1,reviewedSetSha256,applicationName:plan.applicationName,sqlSha256:plan.sqlSha256,outcome:'unknown',writeRequests:1},null,2)+'\n');await intent.sync()}finally{await intent.close()}
  report.writeRequests=1
  const diagnostic=(await db.query(built.sql,false)).find(row=>row.diagnostic)?.diagnostic
  assert(diagnostic,'Diagnostic result missing')
  const {schema_attestation,...finite}=diagnostic;report.diagnostic=finite
  if(diagnostic.ok){report.installedSchemaMatched=same(schema_attestation,input.reviewed.sqlEvidence.installedSchemaAttestation);report.installedSchemaSha256=sha256(canonicalJson(schema_attestation));assert(report.installedSchemaMatched,'Fixed installer schema differs from accepted final runtime')}
 }catch(error){report.errors.push({type:error.name==='AssertionError'?'guard_failed':'diagnostic_incomplete',reason:error.name==='AssertionError'?error.message:'original_outcome_unknown_no_retry'})}
 finally{
  if(db)try{
   const after=await collectDeploymentState(db),originalApp=input.reviewed.continuation.journal.installApplicationName
   const counts=(await db.query(`select count(*) filter(where application_name=${q(plan.applicationName)}) diagnostic_active,count(*) filter(where application_name=${q(originalApp)}) original_active from pg_stat_activity where state<>'idle'`))[0]
   report.active={diagnostic:Number(counts.diagnostic_active),original:Number(counts.original_active)}
   report.stableBusinessRestored=!!before&&same(stable(before),stable(after));report.logicalCatalogRestored=!!before&&same(before.catalog,after.catalog)
   report.originalHistoryMatched=!!before&&before.history===after.history;report.edgesMatched=!!before&&same(before.edges,after.edges);report.cronMatched=!!before&&same(before.cron,after.cron)
   report.d2Absent=absent(after);report.paused=paused(after)
   const current=await inputs(plan.deploymentPlanPath,plan.deploymentSet);assert(same(current.sources,plan.sources),'Diagnostic source changed during execution');report.sourceFreezeVerified=true
   report.rollbackVerified=report.writeRequests===1&&report.active.diagnostic===0&&report.active.original===0&&report.stableBusinessRestored&&report.logicalCatalogRestored&&report.originalHistoryMatched&&report.edgesMatched&&report.cronMatched&&report.d2Absent&&report.paused&&report.sourceFreezeVerified
  }catch{report.errors.push({type:'independent_postflight_unverified'})}
  try{await lock.release()}catch{report.errors.push({type:'original_executor_lock_retained'})}
 }
 report.ok=report.diagnostic?.ok===true&&report.installedSchemaMatched===true&&report.rollbackVerified&&report.errors.length===0
 const bytes=JSON.stringify(report,null,2)+'\n';await writeFile(reportPath,bytes,{flag:'wx',mode:0o600})
 console.log(JSON.stringify({path:reportPath,sha256:sha256(bytes),...report}));if(!report.ok)process.exitCode=1
}
}
