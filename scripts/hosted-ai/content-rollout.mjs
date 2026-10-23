/**
 * [INPUT]: Explicit environment/operation, exact privacy-scope migration history and existing shared budget.
 * [OUTPUT]: Metadata-only inventory, guarded pause or forward migration; enable remains an explicit reviewed step.
 * [POS]: Manual content-minimization rollout. No inference, budget initialization, secret values or content export.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { client } from './client.mjs'
import { hostedSchemaMatches } from './schema-state.mjs'
import { acceptanceTarget } from './acceptance-target.mjs'
import { migrationManifest, pendingMigrations, schemaSql, sha256, transactionStart } from '../deploy/schema.mjs'
import { eszipOriginalSource } from '../deploy/edge-source.mjs'
const explicit = process.argv.includes('--environment')
const { args, environment, projectRef, config, prefix } = acceptanceTarget()
assert(explicit && args.length === 1 && ['--plan','--audit','--pause','--migrate','--enable'].includes(args[0]), 'Use an explicit --environment and one rollout operation')
const mode=args[0],repositoryManifest=await migrationManifest()
const manifest=repositoryManifest.filter(row=>row.version<='0013'),latest=manifest.at(-1)
assert(latest?.version==='0013' && latest.name==='hosted_ai_assistance_revision','Reviewed privacy migration required')
const bundle=await build({entryPoints:['supabase/functions/hosted-ai/index.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022',external:['node:*'],logLevel:'silent'})
const hash=sha256(bundle.outputFiles[0].text),out='output/tests/hosted-ai/content-minimization'
await mkdir(out,{recursive:true})
const report={ok:false,mode,environment,project:projectRef,at:new Date().toISOString(),sourceSha256:hash,migrationSha256:latest.sha256,deferredVersions:repositoryManifest.filter(row=>row.version>latest.version).map(row=>row.version),realProviderCalls:0,platformLogsVerified:false,historicalPhysicalDeletionVerified:false}
let db,enableSubmitted=false
try {
  if(mode!=='--plan') {
    db=await client(config,environment)
    const hasHistory=(await db.query("select to_regclass('supabase_migrations.schema_migrations') is not null as present;"))[0].present
    const history=hasHistory ? await db.query('select version,name,statements from supabase_migrations.schema_migrations order by version;') : []
    let pending=hasHistory ? pendingMigrations(manifest,history,[]) : []
    assert(hasHistory || environment==='development','Production requires exact migration history')
    if(mode==='--audit') {
      const metadata=await db.request('/functions/hosted-ai'),bytes=await db.request('/functions/hosted-ai/body',{binary:true})
      const source=bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8')
      report.deployedVersion=metadata.version;report.deployedSourceSha256=sha256(source)
      report.deployedSourceMatchesLocal=report.deployedSourceSha256===hash;report.jwtVerification=metadata.verify_jwt===true
      report.deployedLegacyCacheDependency=source.includes('HOSTED_AI_CACHE_KEY')
    }
    report.historyMode=hasHistory?'full-checksum-history':'development-standalone-rpc-readback'
    if(!hasHistory) {
      report.legacyRpcSourceMatched=await hostedSchemaMatches(db,false)
      report.initialPrivacyRpcMatched=await hostedSchemaMatches(db,true,false)
      report.decisionReceiptsMatched=await hostedSchemaMatches(db,true,true,false)
      report.privacyRpcInstalled=await hostedSchemaMatches(db,true)
      pending=report.privacyRpcInstalled?[]:manifest.filter(row=>['0011','0012','0013'].includes(row.version) && row.version>(report.decisionReceiptsMatched?'0012':report.initialPrivacyRpcMatched?'0011':'0010'))
    }
    report.inventory=(await db.query(`select
      (select row_to_json(b) from (select limit_micro,spent_micro,policy,environment,blocked from public.ai_budget where id='integration-shared') b) as budget,
      (select count(*)::int from public.ai_actions where status='running' and created_at>clock_timestamp()-interval '90 seconds') as running,
      (select count(*)::int from public.ai_actions where not confirmed) as unconfirmed,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='ai_actions' and column_name='result_cipher') as legacy_content_column;`))[0]
    assert(report.inventory.budget?.environment===environment,'Existing environment budget required')
    report.installedVersions=history.map(row=>row.version)
    if(mode==='--pause') {
      assert(report.inventory.budget.policy==='authenticated' || report.inventory.budget.policy==='disabled','Unexpected eligibility policy')
      // Save the pre-mutation facts so unknown transport outcomes can be inspected without replaying a write.
      await writeFile(`${out}/${prefix}pause-before.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600})
      await db.query(`begin; select 1 from public.ai_budget where id='integration-shared' for update;
update public.ai_budget set policy='disabled' where id='integration-shared' and environment='${environment}' and policy='authenticated'; commit;`,false)
    }
    if(mode==='--migrate') {
      assert(report.inventory.budget.policy==='disabled' && report.inventory.running===0,'Pause and drain admission first')
      assert((hasHistory || report.legacyRpcSourceMatched || report.initialPrivacyRpcMatched || report.decisionReceiptsMatched) && pending.length>0 && pending.every(row=>['0011','0012','0013'].includes(row.version)),'Expected only the reviewed forward privacy/identity migrations; inspect uncertain prior outcomes')
      await db.query(`${transactionStart}\n${hasHistory ? schemaSql(manifest,history) : pending.map(row=>row.sql).join('\n')}\ncommit;`,false)
      assert(await hostedSchemaMatches(db),'Installed privacy RPC source readback failed')
      if(hasHistory) {
        const after=await db.query('select version,name,statements from supabase_migrations.schema_migrations order by version;')
        assert(pendingMigrations(manifest,after,[]).length===0,'Migration readback failed')
      }
    }
    if(mode==='--enable') {
      assert((hasHistory ? pending.length===0 : report.privacyRpcInstalled) && !report.inventory.legacy_content_column && report.inventory.running===0,'Verify the installed forward migration first')
      assert(report.inventory.budget.policy==='disabled' && !report.inventory.budget.blocked && report.inventory.budget.limit_micro>report.inventory.budget.spent_micro,'Enable requires a paused environment with an existing usable allocation')
      assert(await hostedSchemaMatches(db),'Installed privacy RPC source differs')
      const approval=JSON.parse(await readFile(`${out}/${prefix}platform-review.json`,'utf8'))
      assert(approval.environment===environment && approval.project===projectRef && approval.sourceSha256===hash
        && approval.bodyLoggingDisabled===true && approval.tracePayloadsDisabled===true && approval.gatewayCacheDisabled===true
        && approval.historyLogicallyCleared===true && approval.backupRetentionReviewed===true && approval.restoreRequiresReclean===true
        && approval.controlledAcceptancePassed===true,'Current environment-specific platform review is required')
      const bytes=await db.request('/functions/hosted-ai/body',{binary:true})
      const source=bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8')
      assert(sha256(source)===hash,'Deployed source differs from the reviewed version')
      enableSubmitted=true
      await db.query(`begin; select 1 from public.ai_budget where id='integration-shared' for update;
do $guard$ begin if not exists(select 1 from public.ai_budget where id='integration-shared' and environment='${environment}' and policy='disabled' and not blocked and limit_micro=${Number(report.inventory.budget.limit_micro)} and spent_micro=${Number(report.inventory.budget.spent_micro)}) then raise exception 'Allocation changed during enable';end if;end $guard$;
update public.ai_budget set policy='authenticated' where id='integration-shared'; commit;`,false)
      report.platformReviewAccepted=true
    }
    report.budgetAfter=(await db.query("select limit_micro,spent_micro,policy,environment,blocked from public.ai_budget where id='integration-shared';"))[0]
    assert(report.budgetAfter.limit_micro===report.inventory.budget.limit_micro && report.budgetAfter.spent_micro===report.inventory.budget.spent_micro,'Budget changed; keep admission paused and inspect concurrent settlement')
  }
  report.ok=true
} catch (error) {
  if(mode==='--enable' && db && enableSubmitted) {
    try { await db.query("begin; select 1 from public.ai_budget where id='integration-shared' for update;update public.ai_budget set policy='disabled' where id='integration-shared';commit;",false);report.admissionPausedAfterFailure=true } catch {report.admissionStateUnknown=true}
  }
  report.error='rollout_incomplete_inspect_original_state';report.failure=error.message.match(/HTTP \d{3}|Applied SQL drift: [a-z0-9_.]+|Remote history is not the expected migration prefix|Remote migration history is newer than this checkout|Existing sync tables lack migration history/)?.[0]??'guard_or_transport';process.exitCode=1}
await writeFile(`${out}/${prefix}rollout-${mode.slice(2)}.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600})
console.log(JSON.stringify(report,null,2))
