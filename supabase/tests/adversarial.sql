-- Cases 1, 4, 16 and 17 against the migrated schema.
-- Signature checks use a test oracle (sha256(pub || message)), not Ed25519.
-- The migration default fails closed; this file replaces the verifier after case 17's default check.

\set ON_ERROR_STOP on

create extension if not exists pgcrypto;

insert into auth.users(id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into auth.sessions(id, user_id) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

select auth._login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111');

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

-- Case 17: default verifier fails closed, and a fresh grant set rejects anon plus direct reads.
do $$ begin
  begin
    perform public._ed25519_verify(decode(repeat('11', 32), 'hex'), 'msg'::bytea, decode(repeat('00', 64), 'hex'));
    raise exception 'case 17 default verifier accepted a signature';
  exception when insufficient_privilege then null;
  end;
end $$;

set role anon;
do $$ begin
  begin
    perform public.push_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '99999999-9999-4999-8999-999999999999', '[]'::jsonb);
    raise exception 'case 17 anon push was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role authenticated;
do $$ begin
  begin
    perform count(*) from public.workspaces;
    raise exception 'case 4 direct table read was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public._device_guard('cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
    raise exception 'case 4 guard was callable';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin
  if public.realtime_can_read('ws:ffffffff-ffff-4fff-8fff-ffffffffffff') is not true then
    raise exception 'case 17 authorized subscribe predicate failed';
  end if;
  if public.realtime_can_read('ws:00000000-0000-4000-8000-000000000000') is not false then
    raise exception 'case 17 foreign topic was accepted';
  end if;
end $$;

-- Case 1: push, compact the op row, retry the same hash, reject a different hash.
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
  if (again->0->>'seq')::bigint <> 1 or (again->0->>'duplicate')::boolean is not true then
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

-- Case 4: revoked JWT, impersonation, signed-out session.
do $$ begin
  perform public.revoke_device('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  begin
    perform public.push_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '99999999-9999-4999-8999-999999999999', '[]'::jsonb);
    raise exception 'case 4 revoked device was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

update public.devices set status = 'authorized', revoked_at = null where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

do $$ begin
  begin
    perform public.push_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      '99999999-9999-4999-8999-999999999999', '[]'::jsonb);
    raise exception 'case 4 impersonation was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

delete from auth.sessions where id = '11111111-1111-4111-8111-111111111111';
do $$ begin
  if public.realtime_can_read('ws:ffffffff-ffff-4fff-8fff-ffffffffffff') is not false then
    raise exception 'case 17 signed-out device could subscribe';
  end if;
  begin
    perform public.push_ops('ffffffff-ffff-4fff-8fff-ffffffffffff', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '99999999-9999-4999-8999-999999999999', '[]'::jsonb);
    raise exception 'case 4 signed-out jwt was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

insert into auth.sessions(id, user_id) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- Install the test oracle only after the fail-closed check.
create or replace function public._ed25519_verify(pub bytea, message bytea, signature bytea) returns boolean
language sql immutable set search_path = public as $$
  select signature = public.digest(pub || message, 'sha256'::text)
$$;

-- Case 16: start_recovery then complete_recovery CAS. Replay is rejected.
do $$
declare
  started jsonb;
  nonce text;
  message bytea;
  sig bytea;
  challenge uuid;
  pub bytea := decode(repeat('ab', 32), 'hex');
begin
  started := public.start_recovery('ffffffff-ffff-4fff-8fff-ffffffffffff', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  challenge := (started->>'challengeId')::uuid;
  nonce := started->>'nonce';
  message := convert_to('goalloom/recover/v1|ffffffff-ffff-4fff-8fff-ffffffffffff|dddddddd-dddd-4ddd-8ddd-dddddddddddd|' || nonce || '|' || (started->>'rosterHash'), 'UTF8');
  sig := public.digest(pub || message, 'sha256'::text);
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

-- Stale epoch is reported without allocating a seq.
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
