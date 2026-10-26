/**
 * [INPUT]: Guarded development Management access, forward D1 deltas and synthetic signed proofs.
 * [OUTPUT]: Named real-PostgreSQL checks and pre-fixture schema fingerprints, all changes rolled back.
 * [POS]: D1 database integration acceptance; no provider/model call or persistent service allocation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { client } from '../hosted-ai/client.mjs'
import { actionId } from '../hosted-ai/content-minimization/identity.mjs'
import { d1Migrations, schemaSnapshotSql } from './d1-schema.mjs'
import { authSql, bytea, identitySql, json, literal as q, ordinaryCalls, syncFixture } from './d1-sync-fixtures.mjs'

const output='output/tests/billing/desktop/d1-backend/sql-acceptance.json'
const owner=syncFixture(), stranger=syncFixture()
// A separate valid owner/device avoids rewriting signed fixture bodies.
const fresh=syncFixture()
const db=await client()
const migrations=await d1Migrations(db)
const protectedSql=`select jsonb_build_object(
 'budget',(select to_jsonb(b) from public.ai_budget b where id='integration-shared'),
 'fees',(select md5(coalesce(string_agg(user_id::text||':'||action_id::text||':'||charged_micro::text||':'||confirmed::text,',' order by user_id,action_id),'')) from public.ai_actions),
 'protection',(select md5(coalesce(string_agg(user_id::text||':'||blocked::text||':'||coalesce(reason,''),',' order by user_id),'')) from public.ai_protection)) as protected_state;`
const protectedBefore=(await db.query(protectedSql))[0].protected_state
const f=owner,w=q(f.workspace),d=q(f.device),g=q(f.generation),u=q(f.user)
const calls=ordinaryCalls(f)
assert.equal(calls.length,17)
const sql=[]
const emit=text=>sql.push(text)
const check=(name,statement,state=null,message=null)=>emit(`select pg_temp.d1_check(${q(name)},${q(statement)},${q(state)},${q(message)});`)
const test=(name,expression)=>check(name,`do $assert$ begin if (${expression}) is distinct from true then raise exception 'assertion_failed';end if;end $assert$;`)
const asOwner=(options={})=>emit(authSql(f,options)+'set local role authenticated;')
const admin=()=>emit('reset role;')
const denyAll=(label,state,message)=>{for(const [name,call] of calls)check(`${label}: ${name}`,`select * from ${call}`,state,message)}
const invoke=(name,args)=>`public.${name}(${args})`
const push=invoke('push_ops',`${w},${d},${g},${json([f.operation])}`)
const receipt=(ids=[f.op],hashes=[f.payloadHash],workspace=f.workspace,device=f.device)=>`public.receipts_for(${q(workspace)},${q(device)},array[${ids.map(q).join(',')}]::uuid[],array[${hashes.map(q).join(',')}]::text[])`
const transfer=(method='download',overrides={})=>`public.snapshot_transfer_access(${q(overrides.device??f.device)},${q(overrides.workspace??f.workspace)},${q(overrides.generation??f.generation)},${overrides.seq??1},${q(overrides.path??f.snapshotPath)},${q(method)})`
const t="'2030-01-01T00:00:00Z'::timestamptz"
const expired=()=>emit(`update public.billing_accounts set test_now=${t}+interval '192 hours' where environment='development' and user_id=${u};`)

emit(`begin;set local lock_timeout='5s';set local statement_timeout='120s';
${migrations.filter(x=>!x.installed).map(x=>x.sql).join('\n')}
create temporary table d1_evidence(key text primary key,value jsonb) on commit drop;
create temporary table d1_checks(position integer generated always as identity,name text not null,ok boolean not null,expected_state text,actual_state text) on commit drop;
insert into d1_evidence values('schemaSnapshot',(${schemaSnapshotSql.trim().replace(/;$/,'')}));
insert into d1_evidence values('database',jsonb_build_object('version',version(),'serverTime',clock_timestamp()));
grant insert on d1_checks to authenticated;grant usage on sequence d1_checks_position_seq to authenticated;
create function pg_temp.d1_check(p_name text,p_sql text,p_state text default null,p_message text default null) returns void
language plpgsql security invoker set search_path='' as $check$
declare actual text; message text; good boolean:=false;
begin
  -- Each probe gets its own rollback subtransaction, including successful probes.
  begin
    execute p_sql;
    raise exception 'rollback_probe' using errcode='P9998';
  exception when others then
    get stacked diagnostics actual=returned_sqlstate,message=message_text;
    good:=case when p_state is null then actual='P9998' and message='rollback_probe'
      else actual=p_state and (p_message is null or message=p_message) end;
  end;
  insert into pg_temp.d1_checks(name,ok,expected_state,actual_state) values(p_name,good,p_state,case when actual='P9998' then null else actual end);
end $check$;
grant execute on function pg_temp.d1_check(text,text,text,text) to authenticated;
-- The schema snapshot above precedes every temporary policy/source/fee fixture change.
${identitySql(f)}
${identitySql(stranger)}
${identitySql(fresh)}
update service_private.policy set enabled=true,source_fingerprint=null where id=1;
update public.billing_policy set enabled=true where environment='development';
insert into public.billing_sources(environment,source,account_id,rc_project,rc_app,monthly_price,annual_price,enabled)
values('development','stripe','acct_1QvwdlITpGuR8ZMB','projd720c733','appD1Rollback','price_D1Month','price_D1Annual',true)
on conflict(environment,source) do update set account_id=excluded.account_id,rc_project=excluded.rc_project,rc_app=excluded.rc_app,monthly_price=excluded.monthly_price,annual_price=excluded.annual_price,enabled=true;
insert into public.billing_accounts(environment,user_id,test_now) values('development',${u},${t}),('development',${q(stranger.user)},${t}),('development',${q(fresh.user)},${t});`)

// The version boundary precedes configuration or ordinary service eligibility.
for(const version of [null,'0','2']){
  asOwner({version});denyAll(`version ${version??'missing'}`,'PT409','upgrade_required');admin()
}
asOwner();denyAll('unattested source','PT503','billing_configuration');admin()
emit("update service_private.policy set source_fingerprint=md5(public.billing_source('development')::text),enabled=false where id=1;")
asOwner();denyAll('disabled service policy','PT503','billing_configuration');admin()
emit('update service_private.policy set enabled=true where id=1;')
emit("update public.billing_policy set enabled=false where environment='development';")
asOwner();denyAll('disabled D0 source policy','PT503','billing_configuration');admin()
emit("update public.billing_policy set enabled=true where environment='development';")
asOwner();denyAll('service not started','PT403','service_not_started');admin()
test('legacy entitlement fallback closed',`not public.sync_entitled(${u})`)
const pendingCheckout=randomUUID()
emit(`insert into public.billing_operations(environment,user_id,request_id,action,cycle) values('development',${u},${q(pendingCheckout)},'checkout','monthly');`)
asOwner();denyAll('unpaid verification pending','PT403','service_not_started');admin()
emit(`delete from public.billing_operations where environment='development' and user_id=${u} and request_id=${q(pendingCheckout)};`)
emit(`select public.billing_claim_trial('development',${u},${q(f.request)});
select public.billing_claim_trial('development',${q(stranger.user)},${q(stranger.request)});
select public.billing_claim_trial('development',${q(fresh.user)},${q(fresh.request)});`)
asOwner()
check('trial permits signed bootstrap',`select public.bootstrap_workspace(${f.workspaceArguments})`)
emit(`select public.bootstrap_workspace(${f.workspaceArguments});`)
test('trial discovers pinned workspace',`public.list_account(${w})->>'workspaceId'=${w}`)
test('trial reads current workspace status',`public.get_sync_status(${w},${d})->>'workspaceId'=${w}`)
test('trial reads signed roster',`public.get_roster(${w},${d})->0->>'bodyHash'=${q(f.rosterHash)}`)
test('trial reads pinned recovery checkpoint',`public.get_latest_checkpoint(${w},${d})->'body'=${json(f.checkpoint)}`)
test('trial reads empty encrypted envelopes',`public.get_key_envelopes(${w},${d})='[]'::jsonb`)
check('trial accepts finite empty envelope batch',`select public.put_key_envelopes(${w},${d},'[]'::jsonb)`)
check('trial registers service-version device',`do $proof$ declare id uuid;begin id:=public.register_device('D1 synthetic registered','macos',${bytea(f.signPub)},${bytea(f.boxPub)},1);if id is null then raise exception 'missing_device';end if;end $proof$;`)
check('paid access does not replace roster signature',`select public.commit_roster(${w},${d},1,${q(f.rosterHash)},${json(f.nextRoster)},${q(f.nextRosterHash)},${bytea(f.badSig)},'device')`,'42501','roster_signature_rejected')
check('trial accepts next pinned roster signature',`select public.commit_roster(${w},${d},1,${q(f.rosterHash)},${json(f.nextRoster)},${q(f.nextRosterHash)},${bytea(f.nextRosterSig)},'device')`)
check('trial accepts signed epoch rotation',`select public.rotate_epoch(${w},${d},1,${json(f.rotatedRoster)},${q(f.rotatedRosterHash)},${bytea(f.rotatedRosterSig)})`)
check('trial accepts signed recovery regeneration',`select public.regenerate_recovery(${w},${d},1,${q(f.rosterHash)},${json(f.nextRoster)},${q(f.nextRosterHash)},${bytea(f.nextRosterSig)},${json(f.nextCheckpoint)},${bytea(f.nextRecSig)},${bytea(f.nextDevSig)})`)
check('trial can request bounded recovery challenge',`do $proof$ declare r jsonb;begin r:=public.start_recovery(${w},${d});if r->>'rosterHash' is distinct from ${q(f.rosterHash)} or length(r->>'nonce')<>64 then raise exception 'challenge_failed';end if;end $proof$;`)
emit(`select ${push};`)
test('accepted ciphertext is readable under current service',`public.pull_ops(${w},${d},0,10)->0->>'payload_hash'=${q(f.payloadHash)}`)
for(const limit of ['null','0','201'])check(`pull rejects unbounded/invalid limit ${limit}`,`select public.pull_ops(${w},${d},0,${limit})`,'22023','bad limit')
test('pull keeps legal maximum and empty-page semantics',`jsonb_array_length(public.pull_ops(${w},${d},0,200))=1 and public.pull_ops(${w},${d},9999,200)='[]'::jsonb`)
admin()
test('accepted push stores one original receipt and new topic only',`(select count(*)=1 from public.op_receipts where workspace_id=${w} and op_id=${q(f.op)} and payload_hash=${q(f.payloadHash)}) and exists(select 1 from public.control_events where device_id=${d} and topic='cloud:v1:ws:'||${w}::text and event='head') and not exists(select 1 from public.control_events where device_id=${d} and topic='ws:'||${w}::text and event='head')`)
emit(`insert into public.recovery_challenges(id,workspace_id,device_id,nonce,roster_version,expires_at) values(${q(f.challenge)},${w},${d},${bytea(f.recoveryNonce)},1,clock_timestamp()+interval '5 minutes');
insert into public.snapshots(workspace_id,upto_seq,format_version,key_epoch,object_path,sha256,size,state,created_by)
values(${w},1,1,1,${q(f.snapshotPath)},${q(f.snapshotHash)},4,'published',${d}),(${w},2,1,1,${q(f.legacySnapshotPath)},${q(f.snapshotHash)},4,'published',${d});`)
emit(`insert into storage.objects(bucket_id,name,metadata) values('snapshots',${q(f.snapshotPath)},'{"size":4,"mimetype":"application/octet-stream"}'::jsonb);`)
asOwner()
check('trial completes valid existing recovery proof',`select public.complete_recovery(${w},${d},${q(f.challenge)},${bytea(f.recoverySig)},${json(f.nextRoster)},${q(f.nextRosterHash)},${bytea(f.recoveryRosterSig)})`)
check('trial cannot replace recovery proof with payment',`select public.complete_recovery(${w},${d},${q(f.challenge)},${bytea(f.badSig)},${json(f.nextRoster)},${q(f.nextRosterHash)},${bytea(f.recoveryRosterSig)})`,'42501','recovery signature rejected')
check('snapshot proxy reads approved metadata',`do $proof$ declare r record;begin select * into r from ${transfer()};if r.object_path is distinct from ${q(f.snapshotPath)} or r.sha256 is distinct from ${q(f.snapshotHash)} or r.size<>4 then raise exception 'metadata_failed';end if;end $proof$;`)
check('snapshot proxy upload requires generation-qualified creator path',`select * from ${transfer('upload')}`)
check('snapshot proxy reads approved legacy path only',`select * from ${transfer('download',{seq:2,path:f.legacySnapshotPath})}`)
check('snapshot proxy rejects legacy path upload',`select * from ${transfer('upload',{seq:2,path:f.legacySnapshotPath})}`,'PT409','snapshot_conflict')
check('snapshot proxy rejects stale generation',`select * from ${transfer('download',{generation:randomUUID()})}`,'PT409','snapshot_conflict')
check('snapshot proxy rejects unknown object',`select * from ${transfer('download',{seq:3,path:`workspaces/${f.workspace}/${f.generation}/3.bin`})}`,'PT404','snapshot_not_found')
check('legacy snapshot credential mint upgrades',`select * from public.snapshot_access(${d},${w},1,${q(f.snapshotPath)})`,'PT409','upgrade_required')
test('new Realtime topic admits approved bound service device',`public.realtime_can_read('cloud:v1:ws:'||${w}::text)`)
test('legacy and arbitrary Realtime topics denied',`not public.realtime_can_read('ws:'||${w}::text) and not public.realtime_can_read('cloud:v1:ws:'||${q(stranger.workspace)}::text)`)
admin()
emit(`update public.devices set service_version=0 where id=${d};`)
asOwner();test('legacy registered device cannot join new Realtime topic',`not public.realtime_can_read('cloud:v1:ws:'||${w}::text)`);admin()
emit(`update public.devices set service_version=1 where id=${d};`)

// A separate identity exercises strict initial checkpoint proof rather than rewriting keys.
emit(authSql(fresh)+'set local role authenticated;')
check('trial creates additional workspace from valid device/recovery proof',`select public.create_new_workspace(${fresh.workspaceArguments})`)
check('paid access does not replace workspace device signature',`select public.create_new_workspace(${fresh.workspaceArguments.replace(bytea(fresh.devSig),bytea(fresh.badSig))})`,'42501','workspace signature rejected')
admin()

// Identity/session/ownership remain independent of the D0 access projection.
asOwner({session:f.otherSession})
check('active service cannot use a device bound to another session',`select public.get_roster(${w},${d})`,'42501','device not bound to this session or revoked')
admin();asOwner({session:randomUUID()})
check('deleted session fails authentication before service',`select public.list_account(${w})`,'42501','authentication_failed')
admin();asOwner({issuer:'https://keqprrgvcefqdwnxaafv.supabase.co/auth/v1'})
check('foreign issuer cannot select another environment',`select public.list_account(${w})`,'PT503','billing_configuration')
admin();emit(authSql(stranger)+'set local role authenticated;')
check('other paid owner cannot use fixture device',`select public.get_roster(${w},${d})`,'42501','device not bound to this session or revoked')
check('other paid owner cannot query fixture receipts',`select ${receipt()}`,'42501','device not bound to this session or revoked')
admin()
emit(`update public.devices set status='authorized' where id=${q(stranger.device)};`)
emit(authSql(stranger)+'set local role authenticated;')
check('own device cannot read another owner workspace',`select public.get_roster(${w},${q(stranger.device)})`,'42501','workspace mismatch')
check('own device cannot query another owner receipts',`select ${receipt([f.op],[f.payloadHash],f.workspace,stranger.device)}`,'42501','workspace mismatch')
admin()

expired();asOwner();denyAll('exact trial expiry','PT403','service_expired')
test('original receipt remains available after expiry',`${receipt()}->0->>'payload_hash'=${q(f.payloadHash)} and ${receipt()}->0->>'seq'='1'`)
test('altered hash cannot acknowledge original operation',`${receipt([f.op],['f'.repeat(64)])}='[]'::jsonb`)
check('old IDs-only receipt shape upgrades after expiry',`select public.receipts_for(${w},${d},array[${q(f.op)}]::uuid[])`,'PT409','upgrade_required')
check('parallel receipt arrays cannot change cardinality',`select public.receipts_for(${w},${d},array[${q(f.op)}]::uuid[],array[]::text[])`,'22023','invalid_request')
check('parallel receipt duplicate IDs rejected',`select ${receipt([f.op,f.op],[f.payloadHash,f.payloadHash])}`,'22023','invalid_request')
test('expired owner cannot rejoin new Realtime topic',`not public.realtime_can_read('cloud:v1:ws:'||${w}::text)`)
check('privacy revocation remains authorized after expiry',`select public.revoke_device(${d},${d})`)
check('privacy reset remains authorized after expiry',`select public.reset_sync(${d},${w})`)
check('privacy rebind still requires valid key proof',`select public.rebind_device(${d},${bytea(f.rebindMessage)},${bytea(f.badSig)})`,'42501','rebind proof rejected')
check('privacy rebind preserves key ownership after expiry',`select public.rebind_device(${d},${bytea(f.rebindMessage)},${bytea(f.rebindSig)})`)
admin()
test('expired probes changed neither original receipt nor workspace head',`(select head_seq=1 and roster_version=1 from public.workspaces where id=${w}) and (select count(*)=1 from public.op_receipts where workspace_id=${w}) and not exists(select 1 from public.recovery_challenges where id=${q(f.challenge)} and consumed_at is not null)`)

// Synthetic provider facts exercise the one D0 projection, never a second paid flag.
emit(`insert into public.billing_customers(environment,user_id,customer_id) values('development',${u},'cus_D1Rollback');
insert into public.billing_subscriptions(environment,user_id,subscription_id,customer_id,status,price_id,period_start,period_end,cancel_at_period_end,verified_at)
values('development',${u},'sub_D1Rollback','cus_D1Rollback','active','price_D1Month',${t},${t}+interval '30 days',false,clock_timestamp());
insert into public.billing_transactions(environment,invoice_id,user_id,subscription_id,price_id,starts_at,ends_at,paid_at,amount_cents,refunded_cents,disposition,rc_verified,verified_at,financial_at)
values('development','in_D1Rollback',${u},'sub_D1Rollback','price_D1Month',${t},${t}+interval '30 days',${t},899,0,'paid',true,clock_timestamp(),clock_timestamp());
update public.billing_accounts set trial_consumed_at=${t},paid_ever=true where environment='development' and user_id=${u};`)
asOwner();test('confirmed paid invoice permits normal status',`public.get_sync_status(${w},${d})->>'headSeq'='1'`);admin()
emit(`update public.billing_transactions set disposition='refunded',refunded_cents=899,revoked_at=${t} where environment='development' and invoice_id='in_D1Rollback';`)
asOwner();denyAll('revoked paid invoice','PT403','service_revoked')
test('revocation keeps original hash-bound receipt',`${receipt()}->0->>'payload_hash'=${q(f.payloadHash)}`)
admin()
emit(`update public.billing_transactions set disposition='paid',refunded_cents=0,revoked_at=null where environment='development' and invoice_id='in_D1Rollback';
update public.billing_accounts set test_now=${t}+interval '30 days' where environment='development' and user_id=${u};
insert into public.billing_grace(environment,invoice_id,user_id,subscription_id,starts_at,ends_at,active)
values('development','in_D1Renewal',${u},'sub_D1Rollback',${t}+interval '30 days',${t}+interval '30 days 72 hours',true);`)
asOwner();test('paid renewal grace permits ordinary status',`public.get_sync_status(${w},${d})->>'headSeq'='1'`);admin()
emit(`update public.billing_accounts set test_now=${t}+interval '33 days' where environment='development' and user_id=${u};`)
asOwner();check('exact grace deadline denies normal access',`select public.get_sync_status(${w},${d})`,'PT403','service_expired');admin()

// Catalog/ACL checks and actual authenticated attempts cover bypasses independently.
test('private schema and helper execution inaccessible',`not has_schema_privilege('authenticated','service_private','usage') and not exists(select 1 from pg_proc p where p.pronamespace='service_private'::regnamespace and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute')))`)
test('all normal cloud tables remain RLS-protected and private',`not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any(array['devices','workspaces','device_roster','key_envelopes','ops','op_receipts','snapshots','recovery_checkpoints','recovery_challenges','billing_accounts','billing_transactions']) and (not c.relrowsecurity or has_table_privilege('authenticated',c.oid,'select,insert,update,delete') or has_table_privilege('anon',c.oid,'select,insert,update,delete')))`)
test('normal and hash-bound receipt RPCs exclude anon',`not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[${calls.map(([name])=>q(name)).join(',')},'receipts_for']) and has_function_privilege('anon',p.oid,'execute'))`)
test('snapshot bucket remains private',`exists(select 1 from storage.buckets where id='snapshots' and not public)`)
test('Realtime has exactly cached-read and denied-write policies',`(select count(*)=2 from pg_policies where schemaname='realtime' and tablename='messages') and exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='ws topic write' and with_check='false') and exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='ws topic read' and qual like '%realtime_can_read%')`)
asOwner()
check('direct ciphertext SELECT denied',`select * from public.ops where workspace_id=${w}`,'42501')
check('direct snapshot metadata SELECT denied',`select * from public.snapshots where workspace_id=${w}`,'42501')
check('direct paid fact UPDATE denied',`update public.billing_accounts set paid_ever=true where user_id=${u}`,'42501')
check('private sync implementation cannot bypass wrapper',`select service_private.list_account(${w})`,'42501')
check('private service evaluator cannot be called directly',`select service_private.evaluate(${u})`,'42501')
test('Storage RLS reveals no fixture bucket object',`not exists(select 1 from storage.objects where bucket_id='snapshots' and name like ${q(`workspaces/${f.workspace}/%`)})`)
check('direct Storage INSERT has no owner-policy bypass',`insert into storage.objects(bucket_id,name) values('snapshots',${q(`workspaces/${f.workspace}/direct.bin`)})`,'42501')
admin()

// No model transport exists in this runner. Existing fees are never reset.
const aiAction=actionId(), deniedAction=actionId(), compatAction=actionId()
const admit=(action=aiAction,user=f.user)=>`public.ai_admit(${q(user)},${q(action)},'evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000)`
emit(`insert into d1_evidence values('budgetBefore',(select to_jsonb(b) from public.ai_budget b where id='integration-shared'));
select 1 from public.ai_budget where id='integration-shared' for update;
update public.ai_budget set policy='trial_or_paid' where id='integration-shared';
${authSql(f)}`)
test('AI early paid policy denies expired without allocation',`public.ai_service_status(${u},'development')->>'error'='service_expired' and ${admit(deniedAction)}->>'error'='service_expired' and not exists(select 1 from public.ai_actions where user_id=${u} and action_id=${q(deniedAction)})`)
emit(authSql(f,{version:null}))
test('AI trial_or_paid requires service version',`public.ai_service_status(${u},'development')->>'error'='upgrade_required' and ${admit(deniedAction)}->>'error'='upgrade_required'`)
emit(authSql(f))
test('AI rejects foreign environment',`public.ai_service_status(${u},'production')->>'error'='permission_denied'`)
emit(`update public.billing_accounts set test_now=${t}+interval '1 hour' where environment='development' and user_id=${u};`)
test('AI paid status uses the same confirmed D0 projection',`(public.ai_service_status(${u},'development')->>'eligible')::boolean and public.ai_service_status(${u},'development')->>'policy'='trial_or_paid'`)
test('AI trial status uses the same original D0 trial',`(public.ai_service_status(${q(stranger.user)},'development')->>'eligible')::boolean`)
emit(`update public.billing_accounts set test_now=${t}+interval '31 days' where environment='development' and user_id=${u};`)
test('AI renewal grace uses the same bounded D0 projection',`(public.ai_service_status(${u},'development')->>'eligible')::boolean`)
emit(`update public.billing_accounts set test_now=${t}+interval '1 hour' where environment='development' and user_id=${u};`)
// Configure synthetic room without overwriting any existing fee or user protection.
// Global running rows are untouched; a crowded shared environment is a failed/unverified prerequisite.
emit(`update public.ai_budget set blocked=false,limit_micro=spent_micro+1000000 where id='integration-shared';
insert into d1_evidence values('spentBeforeAdmission',(select to_jsonb(spent_micro) from public.ai_budget where id='integration-shared'));
select ${admit()};`)
test('AI atomic admission reserves once using paid eligibility',`exists(select 1 from public.ai_actions where user_id=${u} and action_id=${q(aiAction)} and eligibility='trial_or_paid' and charged_micro=500000 and reserved_micro=500000) and (select spent_micro from public.ai_budget where id='integration-shared')=(select (value#>>'{}')::bigint+500000 from d1_evidence where key='spentBeforeAdmission') and (${admit()}->>'existing')::boolean`)
emit(`update public.billing_accounts set test_now=${t}+interval '33 days' where environment='development' and user_id=${u};`)
test('AI atomic service refusal preserves admitted fee and receipt',`${admit(deniedAction)}->>'error'='service_expired' and public.ai_receipt(${u},${q(aiAction)})->>'status'='running' and not exists(select 1 from public.ai_actions where user_id=${u} and action_id=${q(deniedAction)})`)
emit(`select public.ai_settle(${u},${q(aiAction)},'ready',123,true,'gen-1792700000000-d1synthetic',100,10,null);`)
test('AI settlement stays independent of current service',`(public.ai_receipt(${u},${q(aiAction)})->>'charged_micro')::bigint=123 and (public.ai_receipt(${u},${q(aiAction)})->>'confirmed')::boolean and public.ai_receipt(${q(stranger.user)},${q(aiAction)}) is null and (select spent_micro from public.ai_budget where id='integration-shared')=(select (value#>>'{}')::bigint+123 from d1_evidence where key='spentBeforeAdmission')`)
emit(`update public.ai_budget set policy='authenticated' where id='integration-shared';${authSql(f,{version:null})}`)
test('untouched authenticated AI policy remains version-independent',`(public.ai_service_status(${u},'development')->>'eligible')::boolean and public.ai_service_status(${u},'development')->>'policy'='authenticated'`)
check('authenticated AI compatibility retains trusted accounting',`do $compat$ declare r jsonb;begin r:=${admit(compatAction)};if (r->>'existing')::boolean is distinct from false or r->'receipt'->>'status'<>'running' then raise exception 'compat_failed';end if;end $compat$;`)
emit(`update public.ai_budget set policy='disabled' where id='integration-shared';`)
test('AI paused receipt remains available with exact original fee',`public.ai_receipt(${u},${q(aiAction)})->>'charged_micro'='123' and public.ai_service_status(${u},'development')->>'error'='permission_denied'`)
test('AI admission/status never exposed to authenticated or anon',`not has_function_privilege('authenticated','public.ai_service_status(uuid,text)','execute') and not has_function_privilege('authenticated','public.ai_admit(uuid,uuid,text,text,text,text,bigint)','execute') and not has_function_privilege('anon','public.ai_service_status(uuid,text)','execute')`)

// Immutable owner/session/canonical continuation; never grants qualification.
const request=randomUUID(),otherRequest=randomUUID(),continuation={version:1,id:randomUUID(),locale:'en',transport:'loopback',port:43125}
const lease=randomUUID()
emit(`${authSql(f)}
update public.billing_accounts set lease=${q(lease)},lease_until=clock_timestamp()+interval '5 minutes' where environment='development' and user_id=${u};
insert into public.billing_operations(environment,user_id,request_id,action,cycle) values('development',${u},${q(request)},'checkout','monthly');`)
const cont=(session=f.session,requested=request,c=continuation,user=f.user,l=lease)=>`public.service_continuation('development',${q(user)},${q(session)},${q(l)},${q(request)},${q(requested)},${json(c)})`
emit(`select ${cont()};`)
test('continuation saved against original operation and exact session',`${cont()}->'continuation'=${json(continuation)} and (${cont()}->>'returnToThisDevice')::boolean and (select expires_at=created_at+interval '24 hours' and session_id=${q(f.session)} from service_private.continuations where environment='development' and user_id=${u} and request_id=${q(request)})`)
test('other device recovers canonical operation without rewriting continuation',`${cont(f.otherSession,otherRequest,{...continuation,id:randomUUID(),port:43126})}->'continuation'=${json(continuation)} and not (${cont(f.otherSession,otherRequest,{...continuation,id:randomUUID(),port:43126})}->>'returnToThisDevice')::boolean`)
const aliasRequest=randomUUID(),aliasContinuation={...continuation,id:randomUUID(),port:43126}
const alias=(requested=aliasRequest,c=aliasContinuation,candidate=null,action='checkout',cycle='monthly',user=f.user,l=lease)=>
 `public.service_operation_alias('development',${q(user)},${q(l)},${q(requested)},${q(action)},${q(cycle)},${json(c)},${q(candidate)})`
emit(`select ${alias(aliasRequest,aliasContinuation,request)};`)
test('server alias retains exact canonical pending operation',`${alias()}->'operation'->>'request_id'=${q(request)} and ${alias()}->'operation'->>'status'='pending'`)
test('exact original operation lookup is independent of lock-list window',`${alias(request,continuation)}->'operation'->>'request_id'=${q(request)}`)
const resolveOperation=({requested=request,c=continuation,cycle='monthly',action='checkout',session=f.session,user=f.user,lock=lease}={})=>
 `public.service_resolve_operation('development',${q(user)},${q(lock)},${q(requested)},${q(action)},${q(cycle)},${json(c)},${q(session)})`
const resolutionState=`jsonb_build_object(
 'operations',(select coalesce(jsonb_agg(to_jsonb(o) order by request_id),'[]'::jsonb) from public.billing_operations o where environment='development' and user_id=${u}),
 'aliases',(select coalesce(jsonb_agg(to_jsonb(a) order by request_id),'[]'::jsonb) from service_private.operation_aliases a where environment='development' and user_id=${u}),
 'continuations',(select coalesce(jsonb_agg(to_jsonb(saved_continuation) order by request_id),'[]'::jsonb) from service_private.continuations saved_continuation where environment='development' and user_id=${u}))`
const resolutionProbe=(name,expression)=>check(name,`do $resolve$ declare before jsonb;r jsonb;begin before:=${resolutionState};
 r:=${expression};if ${resolutionState} is distinct from before then raise exception 'resolution_changed_state';end if;
end $resolve$;`)
check('receipt-only unknown request cannot adopt pending A or create state',`do $resolve$ declare before jsonb;r jsonb;begin before:=${resolutionState};
 r:=${resolveOperation({requested:randomUUID()})};if r is not null or ${resolutionState} is distinct from before then raise exception 'unknown_resolution_changed_state';end if;end $resolve$;`)
check('receipt-only pending original and alias preserve full state and canonical identity',`do $resolve$ declare before jsonb;r jsonb;begin before:=${resolutionState};
 r:=${resolveOperation()};if r->'operation'->>'request_id' is distinct from ${q(request)} or r->'operation'->>'status' is distinct from 'pending' then raise exception 'pending_resolution_failed';end if;
 r:=${resolveOperation({requested:aliasRequest,c:aliasContinuation,session:f.otherSession})};if r->'operation'->>'request_id' is distinct from ${q(request)} or r->'operation'->>'status' is distinct from 'pending' then raise exception 'pending_alias_resolution_failed';end if;
 if ${resolutionState} is distinct from before then raise exception 'pending_resolution_changed_state';end if;end $resolve$;`)
check('receipt-only original cannot change continuation',`select ${resolveOperation({c:{...continuation,port:43127}})}`,'P0001','billing_request_conflict')
check('receipt-only alias cannot change its distinct continuation',`select ${resolveOperation({requested:aliasRequest,c:{...aliasContinuation,port:43127}})}`,'P0001','billing_request_conflict')
check('receipt-only original cannot change cycle',`select ${resolveOperation({cycle:'annual'})}`,'P0001','billing_request_conflict')
check('receipt-only alias cannot change cycle',`select ${resolveOperation({requested:aliasRequest,c:aliasContinuation,cycle:'annual'})}`,'P0001','billing_request_conflict')
check('receipt-only resolution supports Checkout intent only',`select ${resolveOperation({action:'portal',cycle:null})}`,'P0001','invalid_request')
check('receipt-only resolution requires current owner Auth session',`select ${resolveOperation({session:stranger.session})}`,'P0001','authentication_failed')
check('receipt-only resolution rejects deleted Auth session',`select ${resolveOperation({session:randomUUID()})}`,'P0001','authentication_failed')
check('receipt-only resolution cannot cross owner lease',`select ${resolveOperation({user:stranger.user,session:stranger.session})}`,'P0001','billing_lease_lost')
for(const [name,c] of [
 ['null',null],['array',[]],['missing fields',{}],['string version',{...continuation,version:'1'}],
 ['unknown locale',{...continuation,locale:'xx'}],['callback URL',{...continuation,url:'https://invalid.example/'}],
 ['app transport in development',{version:1,id:randomUUID(),locale:'en',transport:'app'}],
 ['low port',{...continuation,port:1023}],['high port',{...continuation,port:65536}],
 ['fractional port',{...continuation,port:43125.5}],['string port',{...continuation,port:'43125'}],
 ['invalid nonce',{...continuation,id:'invalid'}],
])check(`receipt-only strict continuation rejects ${name}`,`select ${resolveOperation({c})}`,'P0001','invalid_request')
check('receipt-only resolution rejects missing request identity',`select ${resolveOperation({requested:null})}`,'P0001','invalid_request')
const foreignResolutionLease=randomUUID()
emit(`update public.billing_accounts set lease=${q(foreignResolutionLease)},lease_until=clock_timestamp()+interval '5 minutes' where environment='development' and user_id=${q(stranger.user)};`)
test('another owner with valid session and lease cannot discover original operation',`${resolveOperation({user:stranger.user,session:stranger.session,lock:foreignResolutionLease})} is null`)
test('receipt-only RPC is explicitly service-role-only',`has_function_privilege('service_role','public.service_resolve_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid)','execute') and not has_function_privilege('authenticated','public.service_resolve_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid)','execute') and not has_function_privilege('anon','public.service_resolve_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid)','execute')`)
asOwner();check('authenticated client cannot invoke receipt-only resolver directly',`select ${resolveOperation()}`,'42501');admin()
check('alias continuation cannot be replaced',`select ${alias(aliasRequest,{...aliasContinuation,port:43127})}`,'P0001','billing_request_conflict')
check('alias cycle cannot be changed',`select ${alias(aliasRequest,aliasContinuation,null,'checkout','annual')}`,'P0001','billing_request_conflict')
check('alias action cannot be changed',`select ${alias(aliasRequest,aliasContinuation,null,'portal',null)}`,'P0001','billing_request_conflict')
check('alias cannot cross owner lease',`select ${alias(aliasRequest,aliasContinuation,null,'checkout','monthly',stranger.user)}`,'P0001','billing_lease_lost')
check('alias cannot remap to another target',`select ${alias(aliasRequest,aliasContinuation,randomUUID())}`,'P0001','billing_request_conflict')
const rejectedCheckout=randomUUID(),rejectedPortal=randomUUID(),rejectedCancel=randomUUID(),badRejected=randomUUID()
const reject=(id,action='checkout',cycle='annual',c=aliasContinuation,blocking=request,user=f.user,l=lease)=>
 `public.service_reject_operation('development',${q(user)},${q(l)},${q(id)},${q(action)},${q(cycle)},${c===null?'null':json(c)},${q(f.otherSession)},${q(blocking)})`
emit(`select ${reject(rejectedCheckout)};select ${reject(rejectedPortal,'portal',null)};select ${reject(rejectedCancel,'cancel',null,null)};`)
test('incompatible new intents persist their own durable closed receipts',`(select count(*)=3 from public.billing_operations where environment='development' and user_id=${u} and request_id in (${q(rejectedCheckout)},${q(rejectedPortal)},${q(rejectedCancel)}) and status='closed' and result='{"error":"billing_request_conflict"}'::jsonb) and (select status='pending' from public.billing_operations where environment='development' and user_id=${u} and request_id=${q(request)})`)
test('rejected navigation continuation is bound atomically to own request',`(select continuation=${json(aliasContinuation)} and session_id=${q(f.otherSession)} from service_private.continuations where environment='development' and user_id=${u} and request_id=${q(rejectedCheckout)})`)
check('incompatible rejection cannot close an existing unknown operation',`select ${reject(request)}`,'P0001','billing_request_conflict')
check('same-cycle recovery cannot be misclassified as incompatible',`select ${reject(randomUUID(),'checkout','monthly')}`,'P0001','billing_request_conflict')
check('rejected intent invalid continuation rolls back own closed row',`select ${reject(badRejected,'checkout','annual',{...aliasContinuation,url:'https://invalid.example/'})}`,'P0001','invalid_request')
test('invalid rejected intent left no operation or continuation',`not exists(select 1 from public.billing_operations where environment='development' and user_id=${u} and request_id=${q(badRejected)}) and not exists(select 1 from service_private.continuations where environment='development' and user_id=${u} and request_id=${q(badRejected)})`)
check('rejected intent cannot use another owner lease',`select ${reject(randomUUID(),'checkout','annual',aliasContinuation,request,stranger.user)}`,'P0001','billing_lease_lost')
check('rejected own continuation remains immutable',`select public.service_continuation('development',${u},${q(f.otherSession)},${q(lease)},${q(rejectedCheckout)},${q(rejectedCheckout)},${json({...aliasContinuation,port:43127})})`,'P0001','billing_request_conflict')
test('rejected-intent RPC remains service-only',`not has_function_privilege('authenticated','public.service_reject_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid,uuid)','execute') and not has_function_privilege('anon','public.service_reject_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid,uuid)','execute')`)
check('original request cannot replace continuation',`select ${cont(f.session,request,{...continuation,port:43126})}`,'P0001','billing_request_conflict')
check('continuation requires original verified owner session',`select ${cont(stranger.session)}`,'P0001','authentication_failed')
check('continuation cannot use another owner lease',`select ${cont(f.session,request,continuation,stranger.user)}`,'P0001','billing_lease_lost')
check('continuation rejects arbitrary callback destination',`select ${cont(f.session,request,{...continuation,url:'https://invalid.example/'})}`,'P0001','invalid_request')
check('development continuation cannot select production app transport',`select ${cont(f.session,request,{version:1,id:randomUUID(),locale:'en',transport:'app'})}`,'P0001','invalid_request')
check('original operation action/cycle conflict cannot become closed receipt',`select public.billing_operation('development',${u},${q(lease)},${q(request)},'portal',null)`,'P0001','billing_request_conflict')
emit(`with boundary as(select clock_timestamp()-interval '25 hours' as t) update service_private.continuations set created_at=boundary.t,expires_at=boundary.t+interval '24 hours' from boundary where environment='development' and user_id=${u} and request_id=${q(request)};`)
check('expired continuation keeps unresolved operation pending',`select ${cont()}`,'P0001','continuation_expired')
test('continuation expiry did not synthesize terminal receipt',`exists(select 1 from public.billing_operations where environment='development' and user_id=${u} and request_id=${q(request)} and status='pending' and result is null)`)
test('receipt-only pending resolution ignores continuation expiry without terminal state',`${resolveOperation()}->'operation'->>'status'='pending' and ${resolveOperation({requested:aliasRequest,c:aliasContinuation})}->'operation'->>'status'='pending'`)
emit(`select public.billing_operation('development',${u},${q(lease)},${q(request)},'checkout','monthly',null,'{"error":"checkout_expired"}'::jsonb,'closed');`)
test('durable terminal receipt recoverable despite expired continuation',`${cont()}->'continuation'=${json(continuation)} and (select status='closed' and result='{"error":"checkout_expired"}'::jsonb from public.billing_operations where environment='development' and user_id=${u} and request_id=${q(request)})`)
check('receipt-only old closed original and alias survive unrelated new C without any state change',`do $resolve$ declare c uuid:=gen_random_uuid();before jsonb;r jsonb;begin
 update public.billing_operations set created_at=clock_timestamp()-interval '26 hours' where environment='development' and user_id=${u} and request_id=${q(request)};
 insert into public.billing_operations(environment,user_id,request_id,action,cycle) values('development',${u},c,'checkout','monthly');
 before:=${resolutionState};
 r:=${resolveOperation()};if r->'operation'->>'request_id' is distinct from ${q(request)} or r->'operation'->>'status' is distinct from 'closed' then raise exception 'closed_original_rebased';end if;
 r:=${resolveOperation({requested:aliasRequest,c:aliasContinuation,session:f.otherSession})};if r->'operation'->>'request_id' is distinct from ${q(request)} or r->'operation'->>'status' is distinct from 'closed' then raise exception 'closed_alias_rebased';end if;
 r:=public.service_resolve_operation('development',${u},${q(lease)},c,'checkout','monthly',${json(continuation)},${q(f.session)});
 if r->'operation'->>'request_id' is distinct from c::text or r->'operation'->>'status' is distinct from 'pending' then raise exception 'unbound_pending_resolved_terminal';end if;
 r:=${resolveOperation({requested:randomUUID()})};if r is not null or ${resolutionState} is distinct from before then raise exception 'resolution_changed_new_pending';end if;end $resolve$;`)
check('closed canonical alias survives new pending Checkout',`do $alias$ declare c uuid:=gen_random_uuid();r jsonb;begin
 insert into public.billing_operations(environment,user_id,request_id,action,cycle) values('development',${u},c,'checkout','monthly');
 r:=${alias()};if r->'operation'->>'request_id'<>${q(request)} or r->'operation'->>'status'<>'closed' then raise exception 'alias_rebased';end if;
 if not exists(select 1 from public.billing_operations where environment='development' and user_id=${u} and request_id=c and status='pending') then raise exception 'new_checkout_changed';end if;
end $alias$;`)
check('closed original continuation conflict remains a conflict',`select ${cont(f.session,request,{...continuation,port:43126})}`,'P0001','billing_request_conflict')
const completedRequest=randomUUID(),legacyRequest=randomUUID(),portalRequest=randomUUID(),completedAlias=randomUUID()
const savedContinuation=(id,c=continuation)=>`public.service_continuation('development',${u},${q(f.session)},${q(lease)},${q(id)},${q(id)},${json(c)})`
emit(`insert into public.billing_operations(environment,user_id,request_id,action,cycle) values
('development',${u},${q(completedRequest)},'checkout','annual'),('development',${u},${q(portalRequest)},'portal',null);
select ${savedContinuation(completedRequest)};
select ${savedContinuation(portalRequest)};
select ${alias(completedAlias,aliasContinuation,completedRequest,'checkout','annual')};
select public.billing_operation('development',${u},${q(lease)},${q(completedRequest)},'checkout','annual','cs_test_D1Completed','{"status":"complete"}'::jsonb,'complete');
select public.billing_operation('development',${u},${q(lease)},${q(portalRequest)},'portal',null,'bps_D1Completed','{"status":"complete"}'::jsonb,'complete');
with boundary as(select clock_timestamp()-interval '25 hours' as t)
update service_private.continuations set created_at=boundary.t,expires_at=boundary.t+interval '24 hours' from boundary
where environment='development' and user_id=${u} and request_id in (${q(completedRequest)},${q(portalRequest)});
insert into public.billing_operations(environment,user_id,request_id,action,cycle,status,provider_id,created_at)
values('development',${u},${q(legacyRequest)},'checkout','monthly','complete','cs_test_D1Legacy',clock_timestamp()-interval '25 hours');`)
test('completed Checkout recovers immutable continuation after its expiry',`${savedContinuation(completedRequest)}->'continuation'=${json(continuation)} and (${savedContinuation(completedRequest)}->>'returnToThisDevice')::boolean`)
check('completed Checkout still rejects changed original continuation',`select ${savedContinuation(completedRequest,{...continuation,port:43126})}`,'P0001','billing_request_conflict')
test('legacy completed Checkout returns status-only recovery without minting continuation',`${savedContinuation(legacyRequest)}->'continuation'='null'::jsonb and not (${savedContinuation(legacyRequest)}->>'returnToThisDevice')::boolean and not exists(select 1 from service_private.continuations where environment='development' and user_id=${u} and request_id=${q(legacyRequest)})`)
check('receipt-only old complete original and alias return exact row with expired continuation and newer C',`do $resolve$ declare c uuid:=gen_random_uuid();before jsonb;r jsonb;begin
 update public.billing_operations set created_at=clock_timestamp()-interval '26 hours' where environment='development' and user_id=${u} and request_id=${q(completedRequest)};
 insert into public.billing_operations(environment,user_id,request_id,action,cycle) values('development',${u},c,'checkout','monthly');before:=${resolutionState};
 r:=${resolveOperation({requested:completedRequest,cycle:'annual'})};if r->'operation'->>'request_id' is distinct from ${q(completedRequest)} or r->'operation'->>'status' is distinct from 'complete' then raise exception 'complete_original_rebased';end if;
 r:=${resolveOperation({requested:completedAlias,c:aliasContinuation,cycle:'annual',session:f.otherSession})};if r->'operation'->>'request_id' is distinct from ${q(completedRequest)} or r->'operation'->>'status' is distinct from 'complete' then raise exception 'complete_alias_rebased';end if;
 if ${resolutionState} is distinct from before then raise exception 'complete_resolution_changed_state';end if;end $resolve$;`)
resolutionProbe('receipt-only legacy complete without continuation creates no binding',resolveOperation({requested:legacyRequest}))
test('receipt-only legacy complete is status-only existing operation',`${resolveOperation({requested:legacyRequest})}->'operation'->>'status'='complete' and not exists(select 1 from service_private.continuations where environment='development' and user_id=${u} and request_id=${q(legacyRequest)})`)
check('receipt-only unverifiable legacy closed intent cannot mint terminal receipt',`do $resolve$ declare c uuid:=gen_random_uuid();begin
 insert into public.billing_operations(environment,user_id,request_id,action,cycle,status,result) values('development',${u},c,'checkout','monthly','closed','{"error":"checkout_expired"}'::jsonb);
 perform public.service_resolve_operation('development',${u},${q(lease)},c,'checkout','monthly',${json(continuation)},${q(f.session)});end $resolve$;`,'P0001','billing_request_conflict')
check('receipt-only complete original still rejects changed continuation',`select ${resolveOperation({requested:completedRequest,c:{...continuation,port:43127},cycle:'annual'})}`,'P0001','billing_request_conflict')
check('completed Portal cannot mint access from an expired continuation',`select ${savedContinuation(portalRequest)}`,'P0001','continuation_expired')
check('old completed alias and original survive a newer pending operation',`do $alias$ declare c uuid:=gen_random_uuid();r jsonb;begin
 update public.billing_operations set created_at=clock_timestamp()-interval '25 hours' where environment='development' and user_id=${u} and request_id=${q(completedRequest)};
 insert into public.billing_operations(environment,user_id,request_id,action,cycle) values('development',${u},c,'checkout','monthly');
 r:=${alias(completedAlias,aliasContinuation,null,'checkout','annual')};if r->'operation'->>'request_id'<>${q(completedRequest)} or r->'operation'->>'status'<>'complete' then raise exception 'alias_rebased';end if;
 r:=${alias(completedRequest,continuation,null,'checkout','annual')};if r->'operation'->>'request_id'<>${q(completedRequest)} or r->'operation'->>'status'<>'complete' then raise exception 'original_rebased';end if;
end $alias$;`)
test('alias RPC and table remain service-only',`not has_function_privilege('authenticated','public.service_operation_alias(text,uuid,uuid,uuid,text,text,jsonb,uuid)','execute') and not has_function_privilege('anon','public.service_operation_alias(text,uuid,uuid,uuid,text,text,jsonb,uuid)','execute') and not has_table_privilege('authenticated','service_private.operation_aliases','select,insert,update,delete')`)
test('continuation alone never revives expired service',`service_private.evaluate(${u})->>'error'='service_expired'`)
test('continuation RPC and table remain service-only',`not has_function_privilege('authenticated','public.service_continuation(text,uuid,uuid,uuid,uuid,uuid,jsonb)','execute') and not has_table_privilege('authenticated','service_private.continuations','select,insert,update,delete')`)

emit(`select jsonb_build_object('checks',(select jsonb_agg(to_jsonb(c)-'position' order by position) from d1_checks c),
'schemaSnapshot',(select value from d1_evidence where key='schemaSnapshot'),
'database',(select value from d1_evidence where key='database'),
'budgetWasPresent',exists(select 1 from d1_evidence where key='budgetBefore' and value is not null)) as acceptance;
rollback;`)

const report={ok:false,migrations:migrations.map(({file,sha256,installed})=>({file,sha256,installed})),
  scope:'Real development PostgreSQL only. Pending D1 migrations, synthetic identities/proofs, configuration and AI budget changes are in one rollback transaction. No provider/model calls, no persistent schema, fee, policy, account or workspace change. Independent lock races and HTTP/Storage transport are separate acceptance.',
  rollback:true,realProviderCalls:0,realModelCalls:0,realCostUsd:0,platform:{node:process.version,os:process.platform,cpu:process.arch},checks:[]}
try{
  const rows=await db.query(sql.join('\n'),false)
  const result=rows.find(row=>row.acceptance)?.acceptance
  assert(result?.schemaSnapshot&&Array.isArray(result.checks),'Missing rollback acceptance result')
  Object.assign(report,result)
  report.reviewedSchema=result.schemaSnapshot
  const protectedAfter=(await db.query(protectedSql))[0].protected_state
  report.protectedStateRestored=JSON.stringify(protectedBefore)===JSON.stringify(protectedAfter)
  const fixtureIds=[f.user,stranger.user,fresh.user].map(q).join(',')
  report.fixturesAbsent=(await db.query(`select not exists(select 1 from auth.users where id in (${fixtureIds}))
    and not exists(select 1 from auth.sessions where user_id in (${fixtureIds}))
    and not exists(select 1 from public.devices where user_id in (${fixtureIds}))
    and not exists(select 1 from public.workspaces where user_id in (${fixtureIds}))
    and not exists(select 1 from public.billing_accounts where user_id in (${fixtureIds}))
    and not exists(select 1 from public.ai_actions where user_id in (${fixtureIds}))
    and not exists(select 1 from storage.objects where bucket_id='snapshots' and name=${q(f.snapshotPath)}) as absent;`))[0].absent
  const afterMigrations=await d1Migrations(db)
  report.migrationStateRestored=afterMigrations.every((entry,i)=>entry.installed===migrations[i].installed)
  report.ok=result.checks.length>100&&result.checks.every(entry=>entry.ok)&&result.budgetWasPresent&&report.protectedStateRestored&&report.fixturesAbsent&&report.migrationStateRestored
  if(!report.ok){report.error='d1_sql_check_failed';process.exitCode=1}
}catch(error){
  report.error='d1_sql_acceptance_failed'
  report.transportStatus=error.message.match(/HTTP \d{3}/)?.[0]??null
  report.networkCode=error.cause?.code??null
  process.exitCode=1
}
await mkdir('output/tests/billing/desktop/d1-backend',{recursive:true})
await writeFile(output,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({ok:report.ok,checks:report.checks.length,failed:report.checks.filter(x=>!x.ok).map(x=>({name:x.name,expectedState:x.expected_state,actualState:x.actual_state})),evidence:output,error:report.error??null},null,2))
