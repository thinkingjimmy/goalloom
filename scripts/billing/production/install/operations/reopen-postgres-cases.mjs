/**
 * [INPUT]: Existing restricted-role PostgreSQL fixture and the continuous-recovery SQL generator.
 * [OUTPUT]: Actual transaction/refusal, owner isolation, preserved-boundary and AI qualification evidence.
 * [POS]: Selected --reopen CLI E2E cases; no production/provider/model connection.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {ROOT,REF,JOBS,q,hash,json} from '../source.mjs'
import {save} from '../io.mjs'
import {reopenSql} from './reopen-sql.mjs'
import {retrievalFixture,bytea,json as sqlJson} from '../../../d2-retrieval-fixtures.mjs'

export async function reopenCases({sql,query,check,flags,snapshot,originalCleanup,out}){
 const owner='93300000-0000-4000-8000-000000000001',newOwner=randomUUID(),workspace=randomUUID(),generation=randomUUID(),session=randomUUID(),newSession=randomUUID()
 await sql(`insert into auth.users values(${q(newOwner)},'new-owner@goalloom.test',null);
 insert into auth.sessions values(${q(session)},${q(owner)}),(${q(newSession)},${q(newOwner)});`,{role:'postgres'})
 await sql(`select service_private.ensure_live_subject('production',${q(owner)}),service_private.ensure_live_subject('production',${q(newOwner)});`)
 await sql(`insert into public.workspaces(id,user_id,generation,roster_version) values(${q(workspace)},${q(owner)},${q(generation)},1);`,{role:'postgres'})
 await sql(`
 insert into service_private.workspace_lifecycle(environment,subject_id,workspace_id,generation,state,seed_required,profile_verified,boundary_verified)
 select 'production',subject_id,${q(workspace)},${q(generation)},'retained',false,true,false from service_private.account_lifecycle where user_id=${q(owner)};`)
 const inspection={state:await query(snapshot)},statements=reopenSql(inspection,randomUUID())
 await save(resolve(out,'continuous-sql.json'),{sourceSha256:hash(await readFile(resolve(ROOT,'scripts/billing/production/install/operations/reopen-sql.mjs'))),sql:statements})
 const boundarySql=`select to_jsonb(w) from service_private.workspace_lifecycle w where workspace_id=${q(workspace)};`
 const originalBoundary=await query(boundarySql),budget=await query("select to_jsonb(b) from public.ai_budget b where id='integration-shared';")
 const subject=(await query(`select jsonb_build_object('id',subject_id) from service_private.account_lifecycle where user_id=${q(owner)};`)).id
 const newSubject=(await query(`select jsonb_build_object('id',subject_id) from service_private.account_lifecycle where user_id=${q(newOwner)};`)).id
 const status=(headers={})=>query(`begin;select set_config('request.headers',${q(JSON.stringify(headers))},true);select public.ai_service_status(${q(owner)},'production');rollback;`)
 check('restricted_role_has_no_cron_table_write_privilege',(await query("select jsonb_build_object('super',(select rolsuper from pg_roles where rolname=current_user),'write',has_table_privilege(current_user,'cron.job','UPDATE'));")).super===false&&!(await query("select jsonb_build_object('write',has_table_privilege(current_user,'cron.job','UPDATE'));")).write)
 check('closed_billing_source_is_null_but_authenticated_ai_is_eligible',(await query("select jsonb_build_object('source',public.billing_source('production'));")).source===null&&(await status()).eligible===true)
 let denied=await sql(reopenSql({state:{...inspection.state,serverNow:new Date(Date.now()-360000).toISOString()}},randomUUID()).billing,{allowFailure:true})
 check('stale_inspection_refuses_without_opening',denied.code!==0&&denied.stderr.includes('inspection_stale')&&!(await query(flags)).source)
 await sql("update public.billing_sources set rc_app='appforeign' where environment='production';")
 denied=await sql(statements.billing,{allowFailure:true})
 check('foreign_source_binding_refuses_without_overwrite',denied.code!==0&&denied.stderr.includes('closed_baseline_changed')&&!(await query(flags)).source)
 await sql("update public.billing_sources set rc_app='app31d218cbde' where environment='production';")
 await sql(statements.billing)
 let state=await query(flags)
 check('billing_stage_activates_only_exact_three_jobs_and_billing_source',state.billing&&state.source&&!state.cloud&&!state.lifecycle&&(await query(snapshot)).jobs.every(j=>j.active&&JOBS.some(x=>x.name===j.name&&x.command===j.command)))
 await sql(statements.close)
 check('close_after_billing_restores_closed_gates_and_exact_paused_jobs',!(await query(flags)).source&&json((await query(snapshot)).jobs)===json(inspection.state.jobs))
 await sql(statements.billing);await sql(statements.service)
 const observation=await query(statements.read)
 check('service_atomically_binds_enabled_database_source_and_sets_four_readiness_flags',observation.policy.enabled&&observation.policy.min_service_version===2&&observation.sourceFingerprintMatches&&['enabled','independent_ledger_ready','restore_admission_ready','cleanup_wiring_ready'].every(k=>observation.lifecycle[k])&&!observation.lifecycle.restore_blocked)
 const disabledHash=await query(`select jsonb_build_object('hash',md5(${q(JSON.stringify(inspection.state.source))}::jsonb::text));`)
 check('enabled_source_fingerprint_is_not_disabled_row_or_null',observation.policy.source_fingerprint!==disabledHash.hash&&observation.policy.source_fingerprint!==null)
 check('ai_switch_preserves_every_other_budget_field',json(observation.aiBudget)===json({...budget,policy:'trial_or_paid'}))
 check('trial_or_paid_requires_header1_and_unstarted_account_is_ineligible',(await status()).error==='upgrade_required'&&(await status({'x-goalloom-service-version':'2'})).error==='upgrade_required'&&(await status({'x-goalloom-service-version':'1'})).error==='service_not_started')
 const trial=await query(`select public.billing_claim_trial('production',${q(subject)},${q(randomUUID())});`)
 check('local_real_trial_qualifies_ai_with_header1',trial.eligible&&(await status({'x-goalloom-service-version':'1'})).eligible===true)
 check('trial_does_not_invent_legacy_boundary_or_activate_original',json(await query(boundarySql))===json(originalBoundary))
 const active=await query(`select service_private.assert_active_generation_locked(${q(subject)},'production',${q(workspace)},${q(generation)});`)
 const retained=await query(`select service_private.lock_retained_boundary(${q(owner)},'production',${q(workspace)},${q(generation)});`)
 check('original_retained_null_boundary_refuses_sync_and_retrieval',active.error==='service_expired'&&retained.error==='retrieval_closed')
 await sql(`select public.billing_claim_trial('production',${q(newSubject)},${q(randomUUID())});`)
 const bootstrap=(user,sid)=>`begin;select set_config('request.jwt.claim.sub',${q(user)},true),set_config('request.jwt.claims',${q(JSON.stringify({role:'authenticated',session_id:sid,iss:`https://${REF}.supabase.co/auth/v1`}))},true),set_config('request.headers','{"x-goalloom-service-version":"2"}',true);
 select public.bootstrap_workspace(null::uuid,${q(randomUUID())}::uuid,${q(randomUUID())}::uuid,null::jsonb,null::text,null::bytea,null::jsonb,null::bytea,null::bytea,null::jsonb);rollback;`
 const oldBootstrap=await sql(bootstrap(owner,session),{allowFailure:true}),newBootstrap=await sql(bootstrap(newOwner,newSession),{allowFailure:true})
 await save(resolve(out,'bootstrap-diagnostics.json'),{oldBootstrap,newBootstrap})
 check('same_owner_legacy_blocks_replacement_but_new_owner_passes_that_guard',oldBootstrap.stderr.includes('initialization_pending')&&newBootstrap.stderr.includes('invalid_request')&&!newBootstrap.stderr.includes('initialization_pending'))
 const explicitNew=bootstrap(owner,session).replace('public.bootstrap_workspace','public.create_new_workspace')
 const newCloud=await sql(explicitNew,{allowFailure:true})
 await save(resolve(out,'explicit-new-cloud-diagnostic.json'),newCloud)
 check('same_owner_explicit_new_cloud_passes_legacy_guard_and_reaches_seed_validation',newCloud.stderr.includes('invalid_request')&&!newCloud.stderr.includes('initialization_pending'))
 const proof=retrievalFixture(),initialization={requestId:proof.request,finalOpId:proof.finalOp,envelopes:['recovery',proof.device].map(recipient=>({recipient,epoch:1,ciphertext:proof.envelopeCiphertext,signature:proof.envelopeSig,rosterVersion:1,signerDevice:proof.device}))}
 await sql(`insert into public.devices(id,user_id,name,platform,sign_pub,box_pub,status,auth_session_id,protocol_version,service_version)
 values(${q(proof.device)},${q(owner)},'Recovery SQL fixture','macos',${bytea(proof.signPub)},${bytea(proof.boxPub)},'authorized',${q(session)},1,2);`,{role:'postgres'})
 const authPrefix=bootstrap(owner,session).split('select public.bootstrap_workspace')[0]
 const create=await sql(`${authPrefix}select public.create_new_workspace(${q(proof.device)}::uuid,${q(proof.workspace)}::uuid,${q(proof.generation)}::uuid,
 ${sqlJson(proof.roster)},${q(proof.rosterHash)},${bytea(proof.rosterSig)},${sqlJson(proof.checkpoint)},${bytea(proof.recSig)},${bytea(proof.devSig)},${sqlJson(initialization)});commit;`,{allowFailure:true})
 await save(resolve(out,'signed-new-cloud-diagnostic.json'),create)
 check('signed_explicit_new_cloud_commits_same_owner_new_generation',create.code===0&&(await query(`select jsonb_build_object('n',count(*)) from service_private.initializations where workspace_id=${q(proof.workspace)};`)).n===1)
 check('explicit_new_cloud_preserves_exact_original_generation_and_boundary',json(await query(boundarySql))===json(originalBoundary)&&(await query(`select jsonb_build_object('n',count(*)) from public.workspaces where id=${q(workspace)} and generation=${q(generation)};`)).n===1)
 await sql(`select cron.alter_job((select jobid from cron.job where jobname=${q(JOBS[0].name)}),command:='select 2;');`)
 denied=await sql(statements.close,{allowFailure:true})
 check('closure_refuses_foreign_job_without_partial_gate_changes',denied.code!==0&&denied.stderr.includes('worker_job_drift')&&(await query(flags)).cloud)
 await sql(`select cron.alter_job((select jobid from cron.job where jobname=${q(JOBS[0].name)}),command:=${q(JOBS[0].command)});update service_private.lifecycle_policy set restore_blocked=true where id=1;`)
 denied=await sql(statements.close,{allowFailure:true})
 check('closure_refuses_active_restore_barrier',denied.code!==0&&denied.stderr.includes('service_or_restore_drift')&&(await query(flags)).cloud)
 await sql("update service_private.lifecycle_policy set restore_blocked=false where id=1;")
 await sql(statements.close)
 state=await query(flags)
 check('close_after_service_preserves_trials_boundary_and_paid_ai_policy',!state.cloud&&!state.lifecycle&&!state.billing&&!state.source&&json(await query(boundarySql))===json(originalBoundary)&&(await query("select jsonb_build_object('n',count(*)) from public.billing_accounts;")).n===2&&(await status({'x-goalloom-service-version':'1'})).error==='billing_configuration')
 const finalBudget=await query("select to_jsonb(b) from public.ai_budget b where id='integration-shared';"),cleanup=await query("select jsonb_build_object('command',command,'active',active,'schedule',schedule) from cron.job where jobname='goalloom-sync-runtime-cleanup';")
 check('no_network_model_or_cleanup_dispatch_and_original_cleanup_preserved',state.queued===0&&state.dispatches===0&&json(cleanup)===json(originalCleanup)&&json(finalBudget)===json({...budget,policy:'trial_or_paid'}))
 return {originalBoundary,finalBoundary:await query(boundarySql),aiBudget:{before:budget,after:finalBudget},oldBootstrapFailure:oldBootstrap.stderr,newBootstrapFailure:newBootstrap.stderr,finalFlags:state,cronLaunchingEnabled:false}
}
