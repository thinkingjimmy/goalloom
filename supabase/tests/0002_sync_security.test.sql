-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Target schema through 0009 and real pgsodium/pgTAP.
-- OUTPUT: Rolled-back auth, entitlement, proof, preservation, discovery and destructive-scope checks.
-- POS: Hosted recovery acceptance. It never changes a real account.
-- [PROTOCOL]: Update this header when making changes, then check README.md.
begin;
set local search_path to extensions, public;
select no_plan();
\ir auth-fixtures.sql
\ir sync-security-fixtures.sql
select pg_temp.insert_auth_user('91111111-1111-4111-8111-111111111111', 'security-owner@goalloom.test');
select pg_temp.insert_auth_user('92222222-2222-4222-8222-222222222222', 'security-foreign@goalloom.test');
select pg_temp.insert_auth_session('96666666-6666-4666-8666-666666666666', '91111111-1111-4111-8111-111111111111');
select pg_temp.insert_auth_session('97777777-7777-4777-8777-777777777777', '92222222-2222-4222-8222-222222222222');
select pg_temp.login('91111111-1111-4111-8111-111111111111', '96666666-6666-4666-8666-666666666666');
insert into public.devices(id, user_id, name, platform, sign_pub, box_pub, status, auth_session_id, protocol_version)
select (proof->>'deviceId')::uuid, auth.uid(), 'Security fixture', 'macos', decode(proof->>'signPub','hex'),
  decode(proof->>'boxPub','hex'), 'registered', '96666666-6666-4666-8666-666666666666', 1
from security_proofs where name='workspace1';

create function pg_temp.create_security_workspace(p_name text) returns void language plpgsql as $$
declare p jsonb;
begin
  select proof into strict p from security_proofs where name=p_name;
  perform public.create_new_workspace((p->>'deviceId')::uuid, (p->>'workspaceId')::uuid, (p->>'generation')::uuid,
    p->'roster', p->>'rosterHash', decode(p->>'rosterSig','hex'), p->'checkpoint', decode(p->>'recSig','hex'), decode(p->>'devSig','hex'));
end $$;
select lives_ok($$select pg_temp.create_security_workspace('workspace1')$$, 'Initial signed workspace is created');
update public.workspaces set created_at=now()-interval '1 day' where id='94444444-4444-4444-8444-444444444441';
insert into public.ops(workspace_id, seq, op_id, device_id, payload_hash, format_version, key_epoch, ciphertext)
values ('94444444-4444-4444-8444-444444444441', 1, '98888888-8888-4888-8888-888888888888',
 '93333333-3333-4333-8333-333333333333', repeat('ab',32), 1, 1, decode('deadbeef','hex'));
insert into public.key_envelopes(workspace_id, epoch, recipient, ciphertext, signer_type, signer_device, roster_version, signature)
values ('94444444-4444-4444-8444-444444444441', 1, 'recovery', decode('cafe','hex'), 'device',
 '93333333-3333-4333-8333-333333333333', 1, decode(repeat('ab',64),'hex'));
select lives_ok($$select pg_temp.create_security_workspace('workspace2')$$, 'Recovery creates another workspace without deleting the old one');
select is((select count(*) from public.workspaces where user_id=auth.uid()), 2::bigint, 'Both workspaces coexist');
select is((select encode(ciphertext,'hex') from public.ops where workspace_id='94444444-4444-4444-8444-444444444441'), 'deadbeef', 'Old operations are intact');
select is((select count(*) from public.device_roster where workspace_id='94444444-4444-4444-8444-444444444441'), 1::bigint, 'Old roster is intact');
select is((select encode(ciphertext,'hex') from public.key_envelopes where workspace_id='94444444-4444-4444-8444-444444444441'), 'cafe', 'Old recovery envelope is intact');
select is((public.list_account()->>'workspaceId'), '94444444-4444-4444-8444-444444444442', 'An unbound device discovers the newest workspace');
select is((public.list_account('94444444-4444-4444-8444-444444444441')->>'workspaceId'), '94444444-4444-4444-8444-444444444441', 'An old device discovers its pinned workspace');
select lives_ok($$select pg_temp.create_security_workspace('workspace2')$$, 'A repeated signed creation is idempotent');
select is((select count(*) from public.workspaces where user_id=auth.uid()), 2::bigint, 'Retry does not create a duplicate');
insert into public.ops(workspace_id, seq, op_id, device_id, payload_hash, format_version, key_epoch, ciphertext)
values ('94444444-4444-4444-8444-444444444442', 1, '98888888-8888-4888-8888-888888888889',
 '93333333-3333-4333-8333-333333333333', repeat('bc',32), 1, 1, decode('c0ffee','hex'));
insert into public.key_envelopes(workspace_id, epoch, recipient, ciphertext, signer_type, signer_device, roster_version, signature)
values ('94444444-4444-4444-8444-444444444442', 1, 'recovery', decode('beef','hex'), 'device',
 '93333333-3333-4333-8333-333333333333', 1, decode(repeat('bc',64),'hex'));
select lives_ok($$select public.pull_ops('94444444-4444-4444-8444-444444444441', '93333333-3333-4333-8333-333333333333', 0, 200)$$, 'Old authorized device can still read its workspace');

select pg_temp.login(null, null);
select throws_ok($$select pg_temp.create_security_workspace('workspace3')$$, '42501', 'no session', 'Unauthenticated creation is rejected');
select throws_ok($$select public.list_account()$$, '42501', 'not authenticated', 'Unauthenticated discovery is rejected');
select pg_temp.login('92222222-2222-4222-8222-222222222222', '97777777-7777-4777-8777-777777777777');
select is(public.list_account('94444444-4444-4444-8444-444444444441'), 'null'::jsonb, 'Foreign account cannot discover a pinned workspace');
select throws_ok($$select pg_temp.create_security_workspace('workspace3')$$, '42501', 'device not bound to this session or revoked', 'Foreign device creation is rejected');
select pg_temp.login('91111111-1111-4111-8111-111111111111', '96666666-6666-4666-8666-666666666666');
update security_proofs set proof=jsonb_set(proof,'{rosterSig}',to_jsonb(repeat('00',64))) where name='workspace3';
select throws_ok($$select pg_temp.create_security_workspace('workspace3')$$, '42501', 'workspace signature rejected', 'Invalid signature cannot create a workspace');
select is((select count(*) from public.workspaces where user_id=auth.uid()), 2::bigint, 'Rejected creation leaves both workspaces intact');
select lives_ok($$select public.reset_sync('93333333-3333-4333-8333-333333333333','94444444-4444-4444-8444-444444444442')$$, 'Explicit reset removes only its selected workspace');
select is((select count(*) from public.workspaces where user_id=auth.uid()), 1::bigint, 'The preserved workspace survives reset');
select is((select count(*) from public.ops where workspace_id='94444444-4444-4444-8444-444444444442'), 0::bigint, 'Selected operations are deleted');
select is((select count(*) from public.key_envelopes where workspace_id='94444444-4444-4444-8444-444444444442'), 0::bigint, 'Selected envelopes are deleted');
select is((select count(*) from public.ops where workspace_id='94444444-4444-4444-8444-444444444441'), 1::bigint, 'Preserved operations survive reset');
select is((select count(*) from public.device_roster where workspace_id='94444444-4444-4444-8444-444444444442'), 0::bigint, 'Selected roster is deleted');
select is((select count(*) from public.recovery_checkpoints where workspace_id='94444444-4444-4444-8444-444444444442'), 0::bigint, 'Selected checkpoints are deleted');
select ok(to_regprocedure('public.reset_sync(uuid)') is null, 'Account-wide destructive reset is removed');
select ok(not has_function_privilege('anon', 'public.create_new_workspace(uuid,uuid,uuid,jsonb,text,bytea,jsonb,bytea,bytea)', 'EXECUTE'), 'Anonymous RPC execution is denied');

-- This temporary definition is rolled back; production entitlement behavior is unchanged.
create or replace function public.sync_entitled(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$select false$$;
select throws_ok($$select pg_temp.create_security_workspace('workspace3')$$, '42501', 'not entitled', 'An unentitled account cannot create another workspace');
select * from finish();
rollback;
