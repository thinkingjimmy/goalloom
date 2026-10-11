-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- Licensed under the GNU Affero General Public License v3.0 only.
-- The full text is supabase/LICENSE.
--
-- pgTAP for cases 1, 4, 16 and 17 on a hosted project.
-- Run with: supabase test db --db-url "$SUPABASE_DB_URL"
-- or: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0001_core.test.sql
-- The file rolls back. It does not install a signature oracle.
-- Noble fixture (seed 32 bytes of 0x42, message "goalloom/ed25519-fixture/v1"):
--   pub 2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12
--   sig 1b7e33e90d42931eee096472cdd462eaca2128375857134671acae886fa12ec804b26b5633f730b1045917702da9ec5446b068c1783196a0907b2c7a057fe10e

set search_path to extensions, public;

begin;

select no_plan();

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pgsodium' and p.proname = 'crypto_sign_verify_detached'
  ),
  'pgsodium crypto_sign_verify_detached is installed'
);

select is(
  public._ed25519_verify(
    decode('2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12', 'hex'),
    convert_to('goalloom/ed25519-fixture/v1', 'UTF8'),
    decode('1b7e33e90d42931eee096472cdd462eaca2128375857134671acae886fa12ec804b26b5633f730b1045917702da9ec5446b068c1783196a0907b2c7a057fe10e', 'hex')
  ),
  true,
  'noble Ed25519 fixture verifies'
);

select is(
  public._ed25519_verify(
    decode('2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12', 'hex'),
    convert_to('goalloom/ed25519-fixture/v1', 'UTF8'),
    decode('1a7e33e90d42931eee096472cdd462eaca2128375857134671acae886fa12ec804b26b5633f730b1045917702da9ec5446b068c1783196a0907b2c7a057fe10e', 'hex')
  ),
  false,
  'flipped noble signature is rejected'
);

select is(
  public._ed25519_verify(decode('11', 'hex'), convert_to('goalloom/ed25519-fixture/v1', 'UTF8'), decode(repeat('00', 64), 'hex')),
  false,
  'a public key that is not 32 bytes is rejected'
);

create or replace function pg_temp.insert_auth_user(p_id uuid, p_email text) returns void
language plpgsql as $$
declare
  col record;
  names text[] := '{}';
  literals text[] := '{}';
  literal text;
begin
  for col in
    select column_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
    order by ordinal_position
  loop
    literal := case col.column_name
      when 'id' then quote_literal(p_id::text) || '::uuid'
      when 'instance_id' then quote_literal('00000000-0000-0000-0000-000000000000') || '::uuid'
      when 'aud' then quote_literal('authenticated')
      when 'role' then quote_literal('authenticated')
      when 'email' then quote_literal(p_email)
      when 'encrypted_password' then quote_literal('')
      when 'email_confirmed_at' then 'now()'
      when 'created_at' then 'now()'
      when 'updated_at' then 'now()'
      when 'raw_app_meta_data' then quote_literal('{"provider":"email","providers":["email"]}') || '::jsonb'
      when 'raw_user_meta_data' then quote_literal('{}') || '::jsonb'
      when 'confirmation_token' then quote_literal('')
      when 'recovery_token' then quote_literal('')
      when 'email_change' then quote_literal('')
      when 'email_change_token_new' then quote_literal('')
      when 'email_change_token_current' then quote_literal('')
      when 'reauthentication_token' then quote_literal('')
      when 'phone_change' then quote_literal('')
      when 'phone_change_token' then quote_literal('')
      when 'email_change_confirm_status' then '0'
      when 'is_super_admin' then 'false'
      when 'is_sso_user' then 'false'
      when 'is_anonymous' then 'false'
      else null
    end;
    if literal is null then
      if col.is_nullable = 'YES' or col.column_default is not null then continue; end if;
      raise exception 'auth.users.% has no test value', col.column_name;
    end if;
    names := names || quote_ident(col.column_name);
    literals := literals || literal;
  end loop;
  execute 'insert into auth.users (' || array_to_string(names, ',') || ') values (' || array_to_string(literals, ',') || ')';
end $$;

create or replace function pg_temp.insert_auth_session(p_id uuid, p_user uuid) returns void
language plpgsql as $$
declare
  col record;
  names text[] := '{}';
  literals text[] := '{}';
  literal text;
begin
  for col in
    select column_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'auth' and table_name = 'sessions'
    order by ordinal_position
  loop
    literal := case col.column_name
      when 'id' then quote_literal(p_id::text) || '::uuid'
      when 'user_id' then quote_literal(p_user::text) || '::uuid'
      when 'created_at' then 'now()'
      when 'updated_at' then 'now()'
      when 'refreshed_at' then 'now()'
      when 'aal' then quote_literal('aal1') || '::auth.aal_level'
      when 'refresh_token_counter' then '0'
      else null
    end;
    if literal is null then
      if col.is_nullable = 'YES' or col.column_default is not null then continue; end if;
      raise exception 'auth.sessions.% has no test value', col.column_name;
    end if;
    names := names || quote_ident(col.column_name);
    literals := literals || literal;
  end loop;
  execute 'insert into auth.sessions (' || array_to_string(names, ',') || ') values (' || array_to_string(literals, ',') || ')';
end $$;

create or replace function pg_temp.login(p_uid uuid, p_sid uuid) returns void
language plpgsql as $$
declare claims text := json_build_object('sub', p_uid, 'role', 'authenticated', 'session_id', p_sid)::text;
begin
  perform set_config('request.jwt.claims', claims, true);
  perform set_config('request.jwt.claim', claims, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end $$;

select pg_temp.insert_auth_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'p0-a@goalloom.test');
select pg_temp.insert_auth_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'p0-b@goalloom.test');
select pg_temp.insert_auth_session('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.insert_auth_session('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select pg_temp.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111');

insert into public.devices(id, user_id, name, platform, sign_pub, box_pub, status, auth_session_id, protocol_version)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'desktop', 'macos',
   decode(repeat('11', 32), 'hex'), decode(repeat('22', 32), 'hex'), 'authorized',
   '11111111-1111-4111-8111-111111111111', 1),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'phone', 'ios',
   decode(repeat('33', 32), 'hex'), decode(repeat('44', 32), 'hex'), 'registered',
   '11111111-1111-4111-8111-111111111111', 1),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'other', 'macos',
   decode(repeat('55', 32), 'hex'), decode(repeat('66', 32), 'hex'), 'authorized',
   '22222222-2222-4222-8222-222222222222', 1);

insert into public.workspaces(id, user_id, generation, key_epoch, roster_version)
values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '99999999-9999-4999-8999-999999999999', 1, 1);

insert into public.device_roster(workspace_id, version, roster, signer_type, signer_device, prev_hash, body_hash, signature)
values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 1,
        jsonb_build_object('recoverySignPub', repeat('ab', 32)),
        'device', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', null, repeat('cd', 32), decode(repeat('00', 64), 'hex'));

set local role anon;
do $$ begin
  begin
    perform public.push_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '99999999-9999-4999-8999-999999999999', '[]'::jsonb);
    perform set_config('goalloom.anon_push', 'allowed', true);
  exception when insufficient_privilege then
    perform set_config('goalloom.anon_push', 'denied', true);
  end;
end $$;
reset role;
select is(current_setting('goalloom.anon_push'), 'denied', 'case 17 anon cannot push');

set local role authenticated;
do $$ begin
  begin
    perform count(*) from public.workspaces;
    perform set_config('goalloom.table_read', 'allowed', true);
  exception when insufficient_privilege then
    perform set_config('goalloom.table_read', 'denied', true);
  end;
  begin
    perform public._device_guard('cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
    perform set_config('goalloom.guard', 'allowed', true);
  exception when insufficient_privilege then
    perform set_config('goalloom.guard', 'denied', true);
  end;
end $$;
reset role;
select is(current_setting('goalloom.table_read'), 'denied', 'case 17 authenticated cannot read workspaces');
select is(current_setting('goalloom.guard'), 'denied', 'case 17 authenticated cannot call _device_guard');

select is(public.realtime_can_read('ws:ffffffff-ffff-4fff-8fff-ffffffffffff'), true, 'case 17 own topic is readable');
select is(public.realtime_can_read('ws:00000000-0000-4000-8000-000000000000'), false, 'case 17 foreign topic is rejected');

select ok(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime' and c.relname = 'messages'
  ) or exists (
    select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and policyname = 'ws topic read'
      and coalesce(qual, '') like '%realtime_can_read%'
  ),
  'ws topic read policy calls realtime_can_read when realtime.messages exists'
);

do $$
declare
  v_op uuid := '12121212-1212-4121-8121-121212121212';
  first jsonb;
  again jsonb;
  reused jsonb;
begin
  first := public.push_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '99999999-9999-4999-8999-999999999999',
    jsonb_build_array(jsonb_build_object('op_id', v_op, 'payload_hash', repeat('ab', 32), 'format_version', 1, 'key_epoch', 1, 'ciphertext', 'aa')));
  if (first->0->>'seq')::bigint <> 1 or (first->0->>'duplicate')::boolean then
    raise exception 'case 1 first push %', first;
  end if;
  delete from public.ops where workspace_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and op_id = v_op;
  again := public.push_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '99999999-9999-4999-8999-999999999999',
    jsonb_build_array(jsonb_build_object('op_id', v_op, 'payload_hash', repeat('ab', 32), 'format_version', 1, 'key_epoch', 1, 'ciphertext', 'aa')));
  if again->0->>'seq' <> '1' or (again->0->>'duplicate')::boolean is not true then
    raise exception 'case 1 retry %', again;
  end if;
  if (select count(*) from public.ops where op_id = v_op) <> 0 then
    raise exception 'case 1 compacted op was reinserted';
  end if;
  if (select head_seq from public.workspaces where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff') <> 1 then
    raise exception 'case 1 head moved on duplicate';
  end if;
  reused := public.push_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '99999999-9999-4999-8999-999999999999',
    jsonb_build_array(jsonb_build_object('op_id', v_op, 'payload_hash', repeat('ff', 32), 'format_version', 1, 'key_epoch', 1, 'ciphertext', 'aa')));
  if reused->0->>'error' <> 'op_id_reused' then raise exception 'case 1 hash mismatch %', reused; end if;
  if (select count(*) from public.op_receipts where op_id = v_op) <> 1 then
    raise exception 'case 1 receipt was duplicated';
  end if;
end $$;
select pass('case 1 duplicate hash and op_id_reused');

do $$ begin
  perform public.revoke_device('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  begin
    perform public.push_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '99999999-9999-4999-8999-999999999999', '[]'::jsonb);
    raise exception 'case 4 revoked device was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
select is(public.realtime_can_read('ws:ffffffff-ffff-4fff-8fff-ffffffffffff'), false, 'case 4 revoked device cannot subscribe');

update public.devices set status = 'authorized', revoked_at = null where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select is(public.realtime_can_read('ws:ffffffff-ffff-4fff-8fff-ffffffffffff'), true, 'reauthorized device can subscribe again');

do $$ begin
  begin
    perform public.push_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      '99999999-9999-4999-8999-999999999999', '[]'::jsonb);
    raise exception 'case 4 impersonation was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
select pass('case 4 impersonation rejected');

delete from auth.sessions where id = '11111111-1111-4111-8111-111111111111';
select is(public.realtime_can_read('ws:ffffffff-ffff-4fff-8fff-ffffffffffff'), false, 'case 4 deleted session cannot subscribe');
do $$ begin
  begin
    perform public.push_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '99999999-9999-4999-8999-999999999999', '[]'::jsonb);
    raise exception 'case 4 signed-out jwt was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
select pass('case 4 signed-out jwt rejected');

select pg_temp.insert_auth_session('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

do $$
declare
  pub bytea;
  secret bytea;
  started jsonb;
  message bytea;
  sig bytea;
  challenge uuid;
begin
  select kp."public", kp.secret into pub, secret from pgsodium.crypto_sign_new_keypair() as kp;
  update public.device_roster
     set roster = jsonb_build_object('recoverySignPub', encode(pub, 'hex'))
   where workspace_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and version = 1;
  started := public.start_recovery('ffffffff-ffff-4fff-8fff-ffffffffffff', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  challenge := (started->>'challengeId')::uuid;
  message := convert_to(
    'goalloom/recover/v1|ffffffff-ffff-4fff-8fff-ffffffffffff|dddddddd-dddd-4ddd-8ddd-dddddddddddd|'
    || (started->>'nonce') || '|' || (started->>'rosterHash'), 'UTF8');
  sig := pgsodium.crypto_sign_detached(message, secret);
  if public._ed25519_verify(pub, message, sig) is not true then
    raise exception 'case 16 pgsodium signature failed the server verifier';
  end if;
  begin
    perform public.complete_recovery(
      'ffffffff-ffff-4fff-8fff-ffffffffffff', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', challenge,
      set_byte(sig, 0, get_byte(sig, 0) # 1),
      '{"devices":[]}'::jsonb, repeat('ee', 32), decode(repeat('00', 64), 'hex'));
    raise exception 'case 16 bad signature was accepted';
  exception when insufficient_privilege then null;
  end;
  perform public.complete_recovery(
    'ffffffff-ffff-4fff-8fff-ffffffffffff', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', challenge, sig,
    '{"devices":[]}'::jsonb, repeat('ee', 32), decode(repeat('00', 64), 'hex'));
  if (select status from public.devices where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') <> 'authorized' then
    raise exception 'case 16 device was not authorized';
  end if;
  if (select roster_version from public.workspaces where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff') <> 2 then
    raise exception 'case 16 roster did not advance';
  end if;
  begin
    perform public.complete_recovery(
      'ffffffff-ffff-4fff-8fff-ffffffffffff', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', challenge, sig,
      '{"devices":[]}'::jsonb, repeat('ee', 32), decode(repeat('00', 64), 'hex'));
    raise exception 'case 16 challenge replay was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
select pass('case 16 real Ed25519 recovery, bad signature and replay');

do $$
declare result jsonb;
begin
  result := public.push_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '99999999-9999-4999-8999-999999999999',
    jsonb_build_array(jsonb_build_object(
      'op_id', '34343434-3434-4434-8434-343434343434', 'payload_hash', repeat('11', 32),
      'format_version', 1, 'key_epoch', 9, 'ciphertext', 'bb')));
  if result->0->>'error' <> 'stale_epoch' then raise exception 'stale epoch %', result; end if;
end $$;
select pass('stale epoch allocates no seq');

select is(public.sync_entitled('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), true, 'entitlement is open while public.entitlements is absent');

create table public.entitlements (
  user_id uuid primary key,
  active boolean not null
);
select is(public.sync_entitled('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), false, 'missing entitlements row is not entitled');
insert into public.entitlements(user_id, active)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select is(public.sync_entitled('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), true, 'active entitlement');
update public.entitlements set active = false
 where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(public.sync_entitled('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), false, 'inactive entitlement');
drop table public.entitlements;

create or replace function public.sync_entitled(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select false $$;

do $$ begin
  begin
    perform public.push_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '99999999-9999-4999-8999-999999999999', '[]'::jsonb);
    raise exception 'unentitled push was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pull_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 0, 1);
    raise exception 'unentitled pull was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
select pass('sync_entitled false rejects push and pull');

select * from finish();
rollback;
