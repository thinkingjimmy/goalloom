/**
 * [INPUT]: Exact four-migration candidate, accepted D1 baseline and preserved 73-probe source/evidence.
 * [OUTPUT]: Immutable local plan or one explicitly leased final PostgreSQL rollback attempt.
 * [POS]: Final D2 SQL composition; reuses the existing populated gate and all restoration checks.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {buildRetrievalSql,runRetrievalSql} from './d2-retrieval-sql-acceptance.mjs'
import {buildFinalSqlProbes} from './d2-final-sql-probes.mjs'
import {sha,q} from './d2-retrieval-fixtures.mjs'
import {LIMITS,RUNTIME_TABLES,catalogScope,safetySql,TOUCHED_OLD_TABLES} from './d2-populated-gate.mjs'
import {RACE_CASES} from './d2-retrieval-concurrency.mjs'
import {normalizedSchemaSql,schemaAttestationScope} from './d2-schema-attestation.mjs'
import {attestCronRuntimeInventory,CRON_RUNTIME_TAG} from './d2-cron-runtime.mjs'

export const FINAL_DIRECTORY='output/tests/billing/desktop/d2-final-sql'
export const FINAL_MIGRATIONS=['0025_service_lifecycle.sql','0026_account_deletion.sql','0027_retained_retrieval.sql','0028_lifecycle_cleanup.sql']
const priorPlan='output/tests/billing/desktop/d2-retrieval/staging/241b46ecad7100d14eb6/plan.json'
const priorReport='output/tests/billing/desktop/d2-retrieval/attempts/1e7bcba1-6fe0-4029-ad80-e484e214b157.json'
const priorReportSha='1f1a9af08d08535c97331ae38b07f1f794ce8bbe0ca58d5d83fb4d4528ef050a'
const baselinePath='output/tests/billing/desktop/d1-backend/sql-acceptance.json'
const requiredReceiptCases=['Restore receipt from backup before preparation preserves original digest and TTL','Restore prepared-only backup becomes confirmed and claimable']
const sourceFiles=['scripts/billing/d2-final-sql-acceptance.mjs','scripts/billing/d2-final-sql-parser.mjs','scripts/billing/d2-final-sql-probes.mjs','scripts/billing/d2-sql-grammar.mjs',
 'scripts/billing/d2-schema-attestation.mjs','scripts/billing/d2-cron-runtime.mjs',
 'scripts/billing/d2-retrieval-concurrency.mjs',
 'scripts/billing/d2-retrieval-sql-acceptance.mjs','scripts/billing/d2-retrieval-fixtures.mjs','scripts/billing/d2-populated-gate.mjs',
 'scripts/billing/d1-schema.mjs','scripts/billing/d1-sync-fixtures.mjs','scripts/hosted-ai/client.mjs','scripts/deploy/transport.mjs',
 'packages/contracts/src/canonical.ts','package.json','pnpm-lock.yaml',`${FINAL_DIRECTORY}/failure-cases.md`]
const same=(a,b)=>canonicalJson(a)===canonicalJson(b)
const extraOldTables=['public.snapshots','public.op_blobs','public.pairing_requests','public.recovery_challenges','public.rpc_buckets','auth.identities']
const extraSafety=safetySql.replaceAll(TOUCHED_OLD_TABLES.map(q).join(','),extraOldTables.map(q).join(','))
export const entry=async path=>{const bytes=await readFile(path);return {path,sha256:sha(bytes),bytes:bytes.length}}
export async function immutable(path,bytes){try{await writeFile(path,bytes,{flag:'wx'})}catch(error){if(error.code!=='EEXIST')throw error;assert((await readFile(path)).equals(Buffer.from(bytes)),'Immutable artifact changed')}}
const readinessName='Final migration defaults keep every readiness and drain proof closed'
const expectedDefaults={enabled:false,independentLedgerReady:false,restoreAdmissionReady:false,cleanupWiringReady:false,
 restoreBlocked:false,drainVerified:false,developmentRequiresScope:true}
const defaultsSql=`insert into pg_temp.d2_gate_evidence(key,value) select 'finalDefaultReadiness',jsonb_build_object(
 'enabled',l.enabled,'independentLedgerReady',l.independent_ledger_ready,'restoreAdmissionReady',l.restore_admission_ready,
 'cleanupWiringReady',l.cleanup_wiring_ready,'restoreBlocked',l.restore_blocked,
 'drainVerified',(select verified from service_private.transfer_drain_policy where id=1),
 'developmentRequiresScope',(select development_requires_scope from service_private.worker_access where id=1)) from service_private.lifecycle_policy l where l.id=1;
do $final_defaults$ begin if (select value from pg_temp.d2_gate_evidence where key='finalDefaultReadiness') is distinct from
 ${q(JSON.stringify(expectedDefaults))}::jsonb
 then raise exception 'default_readiness_open' using errcode='P7300';end if;end $final_defaults$;`
const extraSafetySql=`insert into pg_temp.d2_gate_evidence(key,value) select 'finalExtraEffectSafety',safety from (${extraSafety.trim().replace(/;$/,'')}) s;
do $final_effects$ begin
 if exists(select 1 from jsonb_each((select value from pg_temp.d2_gate_evidence where key='finalExtraEffectSafety')) e where jsonb_array_length(e.value)>0)
  or exists(select 1 from pg_trigger where tgrelid='public.control_events'::regclass and not tgisinternal and tgenabled<>'D')
 then raise exception 'unexpected_final_persistent_effect' using errcode='P7301';end if;end $final_effects$;`
const finalDiagnosticSql=`alter table pg_temp.d2_checks add column message text;
create or replace function pg_temp.d2_check(p_name text,p_sql text) returns void language plpgsql security invoker set search_path='' as $final_check$
declare good boolean:=false;s text;m text;
begin
 begin execute p_sql;raise exception 'rollback_probe' using errcode='P9998';
 exception when others then get stacked diagnostics s=returned_sqlstate,m=message_text;good:=s='P9998' and m='rollback_probe';end;
 if not good and not (length(m)<=256 and (m~'^[a-z]+(_[a-z]+)+$' or m='query has no destination for result data'
  or m~'^syntax error at or near "[A-Za-z_]{1,48}"$'
  or m~'^column reference "[A-Za-z_]{1,48}" is ambiguous$'
  or m~'^column "[A-Za-z_]{1,48}" does not exist$'
  or m~'^relation "[A-Za-z_.]{1,96}" does not exist$'
  or m~'^duplicate key value violates unique constraint "[A-Za-z_]{1,96}"$')) then m:='database_error_redacted';end if;
 insert into pg_temp.d2_checks(name,ok,state,message) values(p_name,good,case when good then null else s end,case when good then null else m end);
end $final_check$;`

export function buildFinalPrepared(migrations){
 const base=buildRetrievalSql(migrations),extra=buildFinalSqlProbes()
 assert(base.checks.length===73,'The accepted retrieval scenario count changed')
 const readinessProbe=`select pg_temp.d2_check(${q(readinessName)},${q(`do $default_probe$ begin if not exists(select 1 from pg_temp.d2_gate_evidence where key='finalDefaultReadiness' and value=${q(JSON.stringify(expectedDefaults))}::jsonb) then raise exception 'defaults_not_verified';end if;end $default_probe$;`)});`
 const schemaSql=`insert into pg_temp.d2_gate_evidence(key,value) select 'installedSchemaAttestation',schema_attestation from (${normalizedSchemaSql.trim().replace(/;$/,'')}) s;
 do $schema_cap$ begin if exists(select 1 from jsonb_each((select value from pg_temp.d2_gate_evidence where key='installedSchemaAttestation')) e where e.value->'capped'='true'::jsonb)
 then raise exception 'schema_attestation_cap' using errcode='P7302';end if;end $schema_cap$;`
 return {...base,retrievalSql:`${extraSafetySql}\n${defaultsSql}\n${schemaSql}\n${base.retrievalSql}\n${readinessProbe}\n${finalDiagnosticSql}\n${extra.sql}`,
  checks:[...base.checks,readinessName,...extra.checks],fixtureIds:[...new Set([...base.fixtureIds,...extra.fixtureIds])],
  resultSql:`select acceptance||jsonb_build_object('defaultReadiness',(select value from pg_temp.d2_gate_evidence where key='finalDefaultReadiness'),'extraEffectSafety',(select value from pg_temp.d2_gate_evidence where key='finalExtraEffectSafety'),'installedSchemaAttestation',(select value from pg_temp.d2_gate_evidence where key='installedSchemaAttestation')) as acceptance from (${base.resultSql.trim().replace(/;$/,'')}) r;`,
  probeGroups:{retainedRetrieval:base.checks.length,migrationDefaults:1,finalLifecycle:extra.checks.length}}
}

export async function finalInputs(){
 const accepted=JSON.parse(await readFile(priorPlan,'utf8')),reportBytes=await readFile(priorReport)
 assert.equal(sha(reportBytes),priorReportSha,'Accepted rollback evidence changed')
 const acceptedReport=JSON.parse(reportBytes)
 assert(acceptedReport.ok&&acceptedReport.rollbackVerified&&acceptedReport.checks.length===73,'Accepted base gate required')
 const originalSources=accepted.sources.filter(x=>/^supabase\/migrations\/00(?:0[1-9]|1[0-9]|2[0-4])_/.test(x.path))
 assert.equal(originalSources.length,24,'Exact immutable D1 source inventory required')
 for(const expected of originalSources){const actual=await entry(expected.path);assert(actual.sha256===expected.sha256&&actual.bytes===expected.bytes,'Immutable D1 source changed')}
 const sources=await Promise.all([...sourceFiles,...originalSources.map(x=>x.path)].map(entry))
 const migrations=await Promise.all(FINAL_MIGRATIONS.map(async file=>{const content=await readFile(`supabase/migrations/${file}`);return {file,sha256:sha(content),bytes:content.length,content}}))
 const baseline=JSON.parse(await readFile(baselinePath,'utf8'));assert(baseline.ok&&baseline.reviewedSchema)
 const d1Baseline={...await entry(baselinePath),schemaSha256:sha(canonicalJson(baseline.reviewedSchema)),migrations:baseline.migrations.map(({file,sha256})=>({file,sha256}))}
 const priorAcceptance={plan:await entry(priorPlan),report:await entry(priorReport),actualLegacyUnmappedCount:0}
 const prepared=buildFinalPrepared(migrations.map(m=>({...m,sql:m.content.toString('utf8')})))
 assert(same(prepared.checks.slice(0,73),accepted.checks),'Accepted retrieval scenario identities changed')
 return {migrations,sources,d1Baseline,priorAcceptance,checks:prepared.checks,probeGroups:prepared.probeGroups}
}
export const auditIdentity=input=>({migrations:input.migrations.map(({file,sha256,bytes})=>({file,sha256,bytes})),sources:input.sources,d1Baseline:input.d1Baseline,priorAcceptance:input.priorAcceptance,checks:input.checks})
async function verifyAudit(path,input){
 const record=await entry(path),audit=JSON.parse(await readFile(path,'utf8'))
 assert(audit.version===1&&audit.ok===true&&audit.remoteExecuted===false&&audit.scope==='SQL and PL/pgSQL grammar only')
 assert(same(audit.inputs,auditIdentity(input)),'Parser audit does not match the final source set')
 assert(audit.parser?.package==='pglast'&&audit.parser.version==='v6.17'&&audit.dependencies?.length>0&&audit.reports?.length>0)
 assert(audit.reports.every(r=>Array.isArray(r.errors)&&r.errors.length===0),'Every grammar unit must pass')
 for(const expected of audit.dependencies){const actual=await entry(expected.path);assert(actual.sha256===expected.sha256&&actual.bytes===expected.bytes,'Pinned parser dependency changed')}
 return record
}
const material=plan=>{const {reviewedSetSha256,...rest}=plan;return {...rest,migrations:plan.migrations.map(({file,sha256,bytes})=>({file,sha256,bytes}))}}
export async function createFinalPlan({parserAuditPath}={}){
 assert(parserAuditPath,'Use a matching --parser-audit after the complete local audit')
 const input=await finalInputs(),parserAudit=await verifyAudit(parserAuditPath,input)
 assert(requiredReceiptCases.every(name=>input.checks.includes(name)),'Final receipt restore scenarios are still pending the lifecycle contract')
 const plan={version:1,project:'asqyvcnxdltzzfutbbqy',status:'FROZEN_SOURCES_REVIEW_REQUIRED',remoteExecuted:false,sourceOnly:true,rollbackOnly:true,
  ...input,migrations:input.migrations.map(({file,sha256,bytes})=>({file,sha256,bytes})),parserAudit,stageCount:11,limits:LIMITS,catalogScope,
  runtimeObservability:{tables:RUNTIME_TABLES,sequences:'Catalog-proven owned sequences of the exact tables, plus only the separately proved extension sequence below. Every other persistent relation/configuration must match.',
   extensionSequence:{name:'cron.runid_seq',tag:CRON_RUNTIME_TAG,required:'Fresh pg_cron1.6.4 extension membership, sole exact runid default dependency, exact namespace/extension dependencies, no OWNEDBY/other dependencies. Pre/post proof must match; schema/owner/ACL/type/parameters/default/dependencies remain strict catalog equality.',observedValues:['last_value','is_called']}},
  additionalEffectSafety:{tables:extraOldTables,deleteOnlyTables:['public.control_events'],required:'Original guard remains mandatory. Before new probes, reject extra-table enabled user triggers, owned persistent sequences and unsafe defaults; reject control_events user triggers. control_events is delete-only, with its existing sequence value protected by stable pre/post equality.'},
  installedSchemaAttestation:{scope:schemaAttestationScope,source:'scripts/billing/d2-schema-attestation.mjs',timing:'After exact four migrations and closed-default verification, before fixture readiness is enabled. Source/config/ACL/RLS/schema hashes only; no OIDs, random lifecycle key, user content or external-system claim.'},
  concurrencyPreparation:{cases:RACE_CASES,executionReady:false,scope:'Existing blocked-PID builders are syntax-audited against this source set only. Actual two-connection races need a committed final schema, coordinator readiness/fixture cleanup contract and a separate Root lease.'},
  semantics:'Original 73 probes remain unchanged; new migration-default and final lifecycle probes have separate ordered results. No persistent install, Auth/Storage API, independent ledger runtime, actual producer-bound proof, concurrent connection, provider or model acceptance.',
  safeguards:'Reuse populated re-key preservation, effect safety, one non-retried write, mandatory ROLLBACK and independent postflight on both success and failure. Stable data/catalog equality only; exact background runtime observations remain separate.',
  requiredInvocation:'D2_FINAL_SQL_WINDOW=development node scripts/billing/d2-final-sql-acceptance.mjs --run <plan.json> --reviewed-set <hash> after Root grants this exact single-attempt lease'}
 plan.reviewedSetSha256=sha(canonicalJson(material(plan)))
 const directory=`${FINAL_DIRECTORY}/staging/${plan.reviewedSetSha256.slice(0,20)}`;await mkdir(directory,{recursive:true})
 for(let i=0;i<input.migrations.length;i++){const path=`${directory}/${input.migrations[i].file}`;await immutable(path,input.migrations[i].content);plan.migrations[i].path=path}
 const path=`${directory}/plan.json`;await immutable(path,JSON.stringify(plan,null,2)+'\n');return {plan,path}
}
export async function reviewFinalPlan(path,reviewedSet){
 const plan=JSON.parse(await readFile(path,'utf8'))
 assert(plan.version===1&&plan.project==='asqyvcnxdltzzfutbbqy'&&plan.rollbackOnly===true&&plan.remoteExecuted===false&&plan.stageCount===11)
 assert(reviewedSet===plan.reviewedSetSha256&&sha(canonicalJson(material(plan)))===reviewedSet,'Exact Root-reviewed final set required')
 assert(same(plan.migrations.map(x=>x.file),FINAL_MIGRATIONS),'Exact four-migration order required')
 for(const expected of [...plan.sources,plan.d1Baseline,plan.priorAcceptance.plan,plan.priorAcceptance.report,plan.parserAudit]){
  const actual=await entry(expected.path);assert(actual.sha256===expected.sha256&&actual.bytes===expected.bytes,'Reviewed final source/evidence drift')
 }
 const migrations=[]
 for(const expected of plan.migrations){const content=await readFile(expected.path);assert(sha(content)===expected.sha256&&content.length===expected.bytes,'Frozen migration changed');migrations.push({...expected,sql:content.toString('utf8')})}
 await verifyAudit(plan.parserAudit.path,{...plan,migrations})
 const accepted=JSON.parse(await readFile(plan.priorAcceptance.plan.path,'utf8'))
 assert(same(plan.checks.slice(0,73),accepted.checks),'Accepted base scenario identities changed')
 return {plan,migrations,evidence:JSON.parse(await readFile(plan.d1Baseline.path,'utf8'))}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),mode=args[0]??'--plan',flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
 assert(['--plan','--run'].includes(mode),'Use --plan --parser-audit <audit> or explicitly leased --run <plan> --reviewed-set <hash>')
 if(mode==='--plan'){const {plan,path}=await createFinalPlan({parserAuditPath:flag('--parser-audit')});console.log(JSON.stringify({ready:true,remoteExecuted:false,path,reviewedSetSha256:plan.reviewedSetSha256,migrations:plan.migrations,probeGroups:plan.probeGroups,parserAudit:plan.parserAudit}))}
 else await runRetrievalSql({planPath:args[1],reviewedSetSha256:flag('--reviewed-set'),adapter:{directory:FINAL_DIRECTORY,windowEnv:'D2_FINAL_SQL_WINDOW',stageCount:11,
  attestInventory:attestCronRuntimeInventory,
  scope:'Final populated D1 to exact 0025/26/27/28 rollback only. Original 73 retrieval probes plus separately identified final lifecycle SQL probes. No persistent installation, worker, external Auth/Storage, producer operational-bound evidence, provider, model or production acceptance.',
  reviewPlan:reviewFinalPlan,prepare:buildFinalPrepared}})
}
