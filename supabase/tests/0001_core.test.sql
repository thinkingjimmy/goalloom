-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- Licensed under the GNU Affero General Public License v3.0 only.
-- The full text is supabase/LICENSE.
--
-- pgTAP for cases 1, 4, 16 and 17 on a hosted project.
-- Run with: supabase test db --db-url "$SUPABASE_DB_URL"
-- or: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0001_core.test.sql
-- The file rolls back. It does not install a signature oracle.
-- Noble fixtures from scripts/gen-ed25519-fixtures.mjs (seed 32 bytes of 0x42).
-- Hosted postgres cannot call pgsodium.crypto_sign_new_keypair (42501).
-- pub 2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12
-- fixture message "goalloom/ed25519-fixture/v1"
--   sig 1b7e33e90d42931eee096472cdd462eaca2128375857134671acae886fa12ec804b26b5633f730b1045917702da9ec5446b068c1783196a0907b2c7a057fe10e
-- recovery message uses nonce 32 bytes of 0x42 and roster hash cd*32
--   sig 947f9078028932189c32ee444dbc8a81f9297946bb1acca82e80f70cb19aa05084370b8258408c81349dcbc98fd633be5ce369cef2c339ef7a45be03ea3ec60c

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

-- Roster body signed by the 0x42 seed. Message is SHA-256 of
-- goalloom/roster/v1| plus canonical JSON, matching packages/crypto signRoster.
-- sig 0a92e4dedfc06749fcd95129ef6f54f20a9e72b5de577b7d57d9cddcb1e0a95449cb5a42c924b88d12fe0e09534de40730eae92259d3f30bc302d43ef098a30d
select is(
  public._canonical_json('{"b":1,"a":{"d":true,"c":null},"z":[2,1]}'::jsonb),
  '{"a":{"c":null,"d":true},"b":1,"z":[2,1]}',
  'canonical json sorts keys and keeps nulls and array order'
);

select is(
  public._canonical_json('{"workspaceId":"11111111-1111-4111-8111-111111111111","version":1,"epoch":1,"prevHash":null,"recoverySignPub":"dd","recoveryBoxPub":"cc","devices":[{"id":"dev","signPub":"bb","boxPub":"aa"}]}'::jsonb),
  '{"devices":[{"boxPub":"aa","id":"dev","signPub":"bb"}],"epoch":1,"prevHash":null,"recoveryBoxPub":"cc","recoverySignPub":"dd","version":1,"workspaceId":"11111111-1111-4111-8111-111111111111"}',
  'roster canonical json matches signRoster'
);

select is(
  public._ed25519_verify(
    decode('2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12', 'hex'),
    public._roster_message('{"workspaceId":"11111111-1111-4111-8111-111111111111","version":1,"epoch":1,"prevHash":null,"recoverySignPub":"dd","recoveryBoxPub":"cc","devices":[{"id":"dev","signPub":"bb","boxPub":"aa"}]}'::jsonb),
    decode('0a92e4dedfc06749fcd95129ef6f54f20a9e72b5de577b7d57d9cddcb1e0a95449cb5a42c924b88d12fe0e09534de40730eae92259d3f30bc302d43ef098a30d', 'hex')
  ),
  true,
  'bootstrap verifies the domain-separated roster digest'
);

\ir auth-fixtures.sql

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

select ok(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime' and c.relname = 'messages'
  ) or exists (
    select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and policyname = 'ws topic write'
      and coalesce(with_check, '') like '%realtime_can_read%'
  ),
  'ws topic write policy calls realtime_can_read when realtime.messages exists'
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

create or replace function public._random_bytes(n integer) returns bytea
language sql immutable set search_path = '' as $$
  select decode(repeat('42', n), 'hex')
$$;

do $$
declare
  pub bytea := decode('2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12', 'hex');
  nonce text := repeat('42', 32);
  roster_hash text := repeat('cd', 32);
  started jsonb;
  message bytea;
  sig bytea := decode('947f9078028932189c32ee444dbc8a81f9297946bb1acca82e80f70cb19aa05084370b8258408c81349dcbc98fd633be5ce369cef2c339ef7a45be03ea3ec60c', 'hex');
  challenge uuid;
begin
  update public.device_roster
     set roster = jsonb_build_object('recoverySignPub', encode(pub, 'hex'))
   where workspace_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and version = 1;
  started := public.start_recovery('ffffffff-ffff-4fff-8fff-ffffffffffff', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  challenge := (started->>'challengeId')::uuid;
  if started->>'nonce' is distinct from nonce or started->>'rosterHash' is distinct from roster_hash then
    raise exception 'case 16 nonce or roster hash drifted: %', started;
  end if;
  message := convert_to(
    'goalloom/recover/v1|ffffffff-ffff-4fff-8fff-ffffffffffff|dddddddd-dddd-4ddd-8ddd-dddddddddddd|'
    || nonce || '|' || roster_hash, 'UTF8');
  if public._ed25519_verify(pub, message, sig) is not true then
    raise exception 'case 16 noble fixture failed the server verifier';
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
    '{"devices":[]}'::jsonb, repeat('ee', 32),
    decode('2bfff60c99fef2811e2f227bf799748f0c989712cf3cbebe2da6a47f7a0b5d44d93bac0a1697c32556c18194762403882ff9155981c84c5885f6eddd21a9b708', 'hex'));
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

-- Seeds 0x42 (authorized device) and 0x24 (recovery). Signatures are over
-- SHA-256(goalloom/roster/v1| + canonical JSON). Keep them in scripts/gen-ed25519-fixtures.mjs.
do $$
declare
  ws uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  dev uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  phone uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  recovery_pub text := '58936604abda112bc94933569c82f8d0cc0ddf92a3f8329f2f448f7f484a594c';
  v2 text := '{"devices":[{"boxPub":"22","id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","signPub":"2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12"}],"epoch":1,"prevHash":"1111111111111111111111111111111111111111111111111111111111111111","recoveryBoxPub":"cc","recoverySignPub":"58936604abda112bc94933569c82f8d0cc0ddf92a3f8329f2f448f7f484a594c","version":2,"workspaceId":"ffffffff-ffff-4fff-8fff-ffffffffffff"}';
  v3 text := '{"devices":[{"boxPub":"22","id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","signPub":"2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12"}],"epoch":2,"prevHash":"2222222222222222222222222222222222222222222222222222222222222222","recoveryBoxPub":"cc","recoverySignPub":"58936604abda112bc94933569c82f8d0cc0ddf92a3f8329f2f448f7f484a594c","version":3,"workspaceId":"ffffffff-ffff-4fff-8fff-ffffffffffff"}';
  v4 text := '{"devices":[{"boxPub":"22","id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","signPub":"2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12"}],"epoch":2,"prevHash":"3333333333333333333333333333333333333333333333333333333333333333","recoveryBoxPub":"cc","recoverySignPub":"58936604abda112bc94933569c82f8d0cc0ddf92a3f8329f2f448f7f484a594c","version":4,"workspaceId":"ffffffff-ffff-4fff-8fff-ffffffffffff"}';
  v2_device bytea := decode('c500969e5abd0bf709fe010df3ea6f12b9ff17a49dac66fca7d0fad8b38347c2948933d362dd260ce0d2881a0c32eaaa99526d265f32729e647ff6b2029faf0e', 'hex');
  v2_recovery bytea := decode('01ff77a97631f0a940e7fa509da27aae3940399ec87d12da24c763d69aaaf7d5dccc6260c761e6adcfaf91b5ecc554178a64bc5e8df88049c15182d643ebae03', 'hex');
  v3_device bytea := decode('d0b80c9ed46eac5988e2b5847be5d267e69da75987d118d7df53480893e76a34261b41ffb1699d66277a5db66bb43ca7c1d9b7d41661f77ea9c1a419112af908', 'hex');
  v3_recovery bytea := decode('8532a0845417a69a54870aedd9b5209f85a119da7852542cd188cf90a97e80f5e8ad3de685389cdc083b84f4dcefda39a635a00b55558407c0372fec0acd7607', 'hex');
  v4_device bytea := decode('033bef9f2d3e561a6a116394ce5bce400778aed4194e41297a534a50b55953afe7db80dd0863799ee29bf775f11096e0433db7b0888968abec9d88862f11410f', 'hex');
  v4_recovery bytea := decode('22c57f16cc246cfd199949a2dbe7aba7c0be5e726c657a4127b9ca0f94b78e152738b95226112614adbca295ece9094ce635ddcf7f4162fa30d2ed5a07700b0c', 'hex');
  challenge_sig bytea := decode('3dea9aa8c29eac141008a98ec7f089353d530e9ca0c0ef10564b376d1bd773a860af57e34a430692119a983fc41965f3938037a608f4dfbf0e659a9b46c1ed01', 'hex');
  started jsonb;
  challenge uuid;
begin
  if public._canonical_json(v2::jsonb) is distinct from v2
     or public._canonical_json(v3::jsonb) is distinct from v3
     or public._canonical_json(v4::jsonb) is distinct from v4 then
    raise exception 'signer fixture is not canonical: %', public._canonical_json(v2::jsonb);
  end if;
  delete from public.recovery_challenges where workspace_id = ws;
  delete from public.device_roster where workspace_id = ws;
  update public.workspaces set roster_version = 1, key_epoch = 1 where id = ws;
  update public.devices set status = 'authorized', revoked_at = null,
    sign_pub = decode('2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12', 'hex')
   where id = dev;
  insert into public.device_roster(workspace_id, version, roster, signer_type, signer_device, prev_hash, body_hash, signature)
  values (ws, 1, jsonb_build_object('recoverySignPub', recovery_pub), 'device', dev, null, repeat('11', 32), decode(repeat('00', 64), 'hex'));

  perform public.commit_roster(ws, dev, 1, repeat('11', 32), v2::jsonb, repeat('22', 32), v2_device, 'device');
  if (select roster_version from public.workspaces where id = ws) <> 2 then
    raise exception 'commit_roster valid did not advance';
  end if;
  begin
    perform public.commit_roster(ws, dev, 2, repeat('22', 32), v3::jsonb, repeat('33', 32), set_byte(v3_device, 0, get_byte(v3_device, 0) # 1), 'device');
    raise exception 'commit_roster invalid was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'roster_signature_rejected' then raise exception 'commit_roster invalid: %', sqlerrm; end if;
  end;
  begin
    perform public.commit_roster(ws, dev, 2, repeat('22', 32), v3::jsonb, repeat('33', 32), v3_recovery, 'device');
    raise exception 'commit_roster wrong signer was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'roster_signature_rejected' then raise exception 'commit_roster wrong signer: %', sqlerrm; end if;
  end;
  if (select roster_version from public.workspaces where id = ws) <> 2 then
    raise exception 'rejected commit_roster advanced the roster';
  end if;

  begin
    perform public.rotate_epoch(ws, dev, 1, v3::jsonb, repeat('33', 32), set_byte(v3_device, 0, get_byte(v3_device, 0) # 1));
    raise exception 'rotate_epoch invalid was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'roster_signature_rejected' then raise exception 'rotate_epoch invalid: %', sqlerrm; end if;
  end;
  begin
    perform public.rotate_epoch(ws, dev, 1, v3::jsonb, repeat('33', 32), v3_recovery);
    raise exception 'rotate_epoch wrong signer was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'roster_signature_rejected' then raise exception 'rotate_epoch wrong signer: %', sqlerrm; end if;
  end;
  if (select key_epoch from public.workspaces where id = ws) <> 1 then
    raise exception 'rejected rotate_epoch advanced the epoch';
  end if;
  perform public.rotate_epoch(ws, dev, 1, v3::jsonb, repeat('33', 32), v3_device);
  if (select key_epoch from public.workspaces where id = ws) <> 2
     or (select roster_version from public.workspaces where id = ws) <> 3 then
    raise exception 'rotate_epoch valid did not advance';
  end if;

  started := public.start_recovery(ws, phone);
  challenge := (started->>'challengeId')::uuid;
  if started->>'nonce' is distinct from repeat('42', 32) or started->>'rosterHash' is distinct from repeat('33', 32) then
    raise exception 'signer recovery challenge drifted: %', started;
  end if;
  begin
    perform public.complete_recovery(ws, phone, challenge, challenge_sig, v4::jsonb, repeat('44', 32), set_byte(v4_recovery, 0, get_byte(v4_recovery, 0) # 1));
    raise exception 'complete_recovery invalid was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'roster_signature_rejected' then raise exception 'complete_recovery invalid: %', sqlerrm; end if;
  end;
  begin
    perform public.complete_recovery(ws, phone, challenge, challenge_sig, v4::jsonb, repeat('44', 32), v4_device);
    raise exception 'complete_recovery wrong signer was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'roster_signature_rejected' then raise exception 'complete_recovery wrong signer: %', sqlerrm; end if;
  end;
  if (select roster_version from public.workspaces where id = ws) <> 3 then
    raise exception 'rejected complete_recovery advanced the roster';
  end if;
  perform public.complete_recovery(ws, phone, challenge, challenge_sig, v4::jsonb, repeat('44', 32), v4_recovery);
  if (select roster_version from public.workspaces where id = ws) <> 4
     or (select signer_type from public.device_roster where workspace_id = ws and version = 4) <> 'recovery' then
    raise exception 'complete_recovery valid did not record a recovery signature';
  end if;
end $$;
select pass('commit_roster, rotate_epoch and complete_recovery accept only the roster signer');

\ir sync-cost-cases.sql
select * from finish();
rollback;
