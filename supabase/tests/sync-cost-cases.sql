-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: The core pgTAP transaction and its pg_temp auth fixture helpers.
-- OUTPUT: Target status, upload quota, deduplication and cleanup assertions, rolled back.
-- POS: Integration cases included by 0001_core.test.sql. Use an isolated dev database.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create or replace function public.sync_entitled(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select true $$;

create temp table sync_cost_fixture as select gen_random_uuid() as uid, gen_random_uuid() as sid,
  gen_random_uuid() as sid_b, gen_random_uuid() as foreign_uid, gen_random_uuid() as foreign_sid,
  gen_random_uuid() as dev, gen_random_uuid() as dev_b, gen_random_uuid() as foreign_dev,
  gen_random_uuid() as ws, gen_random_uuid() as foreign_ws, gen_random_uuid() as generation,
  gen_random_uuid() as op;
select pg_temp.insert_auth_user(uid, uid::text || '@goalloom.test') from sync_cost_fixture;
select pg_temp.insert_auth_user(foreign_uid, foreign_uid::text || '@goalloom.test') from sync_cost_fixture;
select pg_temp.insert_auth_session(sid, uid) from sync_cost_fixture;
select pg_temp.insert_auth_session(sid_b, uid) from sync_cost_fixture;
select pg_temp.insert_auth_session(foreign_sid, foreign_uid) from sync_cost_fixture;
insert into public.devices(id, user_id, name, platform, sign_pub, box_pub, status, auth_session_id, protocol_version)
select d.id, d.uid, 'cost-fixture', 'macos', decode(repeat('01',32),'hex'), decode(repeat('02',32),'hex'), 'authorized', d.sid, 1
from sync_cost_fixture f cross join lateral (values (f.dev,f.uid,f.sid),(f.dev_b,f.uid,f.sid_b),(f.foreign_dev,f.foreign_uid,f.foreign_sid)) d(id,uid,sid);
insert into public.workspaces(id,user_id,generation,roster_version)
select ws,uid,generation,1 from sync_cost_fixture union all select foreign_ws,foreign_uid,generation,1 from sync_cost_fixture;
select pg_temp.login(uid,sid) from sync_cost_fixture;

create temp table sync_cost_before as select
  (select count(*) from public.rpc_buckets) as buckets,
  (select count(*) from public.sync_account_usage) as usage,
  (select count(*) from public.control_events) as events,
  (select last_seen_at from public.devices where id=(select dev from sync_cost_fixture)) as seen;
select public.get_sync_status(f.ws,f.dev) from sync_cost_fixture f cross join generate_series(1,30);
select ok((select count(*) from public.rpc_buckets)=(select buckets from sync_cost_before)
  and (select count(*) from public.sync_account_usage)=(select usage from sync_cost_before)
  and (select count(*) from public.control_events)=(select events from sync_cost_before)
  and (select last_seen_at from public.devices where id=(select dev from sync_cost_fixture)) is not distinct from (select seen from sync_cost_before),
  'status reads do not create counters, events or last-seen writes');
select ok(not has_function_privilege('anon','public.get_sync_status(uuid,uuid)','execute'), 'anonymous status execution is denied');
select ok(not has_function_privilege('authenticated','public.cleanup_sync_runtime(integer)','execute'), 'clients cannot run cleanup');
select ok(not has_table_privilege('authenticated','public.sync_account_usage','SELECT'), 'clients cannot read account usage tables');
select throws_ok('select public.get_sync_status(foreign_ws,dev) from sync_cost_fixture','42501',null,'wrong workspace is rejected');
select pg_temp.login(foreign_uid,foreign_sid) from sync_cost_fixture;
select throws_ok('select public.get_sync_status(ws,dev) from sync_cost_fixture','42501',null,'foreign account is rejected');
select pg_temp.login(uid,sid) from sync_cost_fixture;
update public.devices set status='revoked' where id=(select dev from sync_cost_fixture);
select throws_ok('select public.get_sync_status(ws,dev) from sync_cost_fixture','42501',null,'revoked device is rejected');
update public.devices set status='authorized' where id=(select dev from sync_cost_fixture);
delete from auth.sessions where id=(select sid from sync_cost_fixture);
select throws_ok('select public.get_sync_status(ws,dev) from sync_cost_fixture','42501',null,'deleted auth session is rejected');
select pg_temp.insert_auth_session(sid,uid) from sync_cost_fixture;

update public.sync_cost_limits set enforce=true, minute_ops=200, day_ops=200, minute_bytes=1048576, day_bytes=1048576 where id=1;
insert into public.sync_account_usage(user_id,kind,window_start,accepted_ops)
select uid,'day',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',199 from sync_cost_fixture;
create temp table sync_cost_wire as select jsonb_build_array(jsonb_build_object(
  'op_id',op,'payload_hash',repeat('ab',32),'format_version',1,'key_epoch',1,'ciphertext','01')) as body from sync_cost_fixture;
select public.push_ops(f.ws,f.dev,f.generation,w.body) from sync_cost_fixture f cross join sync_cost_wire w;
create temp table sync_cost_dedup as select
  (select count(*) from public.control_events) as events,
  (select sum(accepted_ops) from public.sync_account_usage where user_id=(select uid from sync_cost_fixture)) as usage;
select public.push_ops(f.ws,f.dev,f.generation,w.body) from sync_cost_fixture f cross join sync_cost_wire w;
select ok((select head_seq from public.workspaces where id=(select ws from sync_cost_fixture))=1
  and (select count(*) from public.control_events)=(select events from sync_cost_dedup)
  and (select sum(accepted_ops) from public.sync_account_usage where user_id=(select uid from sync_cost_fixture))=(select usage from sync_cost_dedup),
  'duplicate receipt adds no head, event or accepted usage');
select pg_temp.login(uid,sid_b) from sync_cost_fixture;
select throws_ok($q$select public.push_ops(f.ws,f.dev_b,f.generation,jsonb_set(w.body,'{0,op_id}',to_jsonb(gen_random_uuid()::text)))
  from sync_cost_fixture f cross join sync_cost_wire w$q$,'P0001','upload_rate_limited','another device shares the exhausted day quota');
select is((select head_seq from public.workspaces where id=(select ws from sync_cost_fixture)),1::bigint,'quota rejection rolls back operations and head');
select is((select jsonb_array_length(public.pull_ops(ws,dev_b,0,200)) from sync_cost_fixture),1,'download still works during upload cooldown');
select is((select jsonb_array_length(public.receipts_for(ws,dev_b,array[op])) from sync_cost_fixture),1,'receipt lookup still works during upload cooldown');
select lives_ok('select public.get_sync_status(ws,dev_b) from sync_cost_fixture','status remains available during upload cooldown');
select pg_temp.login(foreign_uid,foreign_sid) from sync_cost_fixture;
select lives_ok('select public.push_ops(f.foreign_ws,f.foreign_dev,f.generation,w.body) from sync_cost_fixture f cross join sync_cost_wire w','another account has its own quota');

insert into public.rpc_buckets(device_id,kind,window_start,hits)
select dev,'cost-current',date_trunc('minute',now()),1 from sync_cost_fixture union all
select dev,'cost-old',now()-interval '2 days',1 from sync_cost_fixture;
insert into public.control_events(device_id,topic,event,payload,created_at)
select dev,'cost-fixture','head','{}',now()-interval '8 days' from sync_cost_fixture union all
select dev,'cost-fixture','other','{}',now()-interval '8 days' from sync_cost_fixture;
create temp table sync_cost_durable as select
  (select count(*) from public.ops) as ops, (select count(*) from public.op_receipts) as receipts,
  (select count(*) from public.device_roster) as roster, (select count(*) from public.key_envelopes) as envelopes,
  (select count(*) from public.recovery_checkpoints) as checkpoints,
  (select count(*) from public.control_events where event<>'head') as other;
create temp table sync_cost_cleanup as select public.cleanup_sync_runtime(1) as result;
select ok((select (result->>'rpcBuckets')::int<=1 and (result->>'accountWindows')::int<=3 and (result->>'headEvents')::int<=1 from sync_cost_cleanup),'cleanup uses bounded batches per category');
select lives_ok('select public.cleanup_sync_runtime(1)','cleanup is repeatable');
select ok((select count(*) from public.ops)=(select ops from sync_cost_durable)
  and (select count(*) from public.op_receipts)=(select receipts from sync_cost_durable)
  and (select count(*) from public.device_roster)=(select roster from sync_cost_durable)
  and (select count(*) from public.key_envelopes)=(select envelopes from sync_cost_durable)
  and (select count(*) from public.recovery_checkpoints)=(select checkpoints from sync_cost_durable)
  and (select count(*) from public.control_events where event<>'head')=(select other from sync_cost_durable),
  'cleanup preserves all durable sync data and non-head events');
select is((select count(*) from public.rpc_buckets where kind='cost-current' and device_id=(select dev from sync_cost_fixture)),1::bigint,'cleanup preserves the current rate window');
