-- Goalloom sync core. Ciphertext only. Direct table access is revoked for
-- anon and authenticated. Grants are limited to these objects so a hosted
-- project can keep unrelated public objects. This file does not embed keys.
-- Ed25519 verification uses pgsodium (libsodium), the same message bytes
-- noble ed25519.sign/verify hash internally. It fails closed when pgsodium
-- is missing.

create extension if not exists pgcrypto;
create extension if not exists pgsodium;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create or replace function public._random_bytes(n integer) returns bytea
language plpgsql security definer set search_path = '' as $$
declare
  schema_name text;
  result bytea;
begin
  select ns.nspname into schema_name from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where p.proname = 'gen_random_bytes' and ns.nspname in ('extensions', 'public')
   order by ns.nspname limit 1;
  if schema_name is not null then
    execute format('select %I.gen_random_bytes($1)', schema_name) into result using n;
    return result;
  end if;
  result := ''::bytea;
  while octet_length(result) < n loop
    result := result || decode(md5(random()::text || clock_timestamp()::text), 'hex');
  end loop;
  return substring(result from 1 for n);
end $$;

create or replace function public._ed25519_verify(pub bytea, message bytea, signature bytea) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if octet_length(pub) is distinct from 32 or octet_length(signature) is distinct from 64 then
    return false;
  end if;
  return pgsodium.crypto_sign_verify_detached(signature, message, pub);
exception
  when undefined_function or invalid_schema_name or insufficient_privilege then
    raise exception 'ed25519 verifier not installed' using errcode = '42501';
end $$;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (length(name) <= 64),
  platform text not null check (platform in ('ios', 'android', 'macos', 'windows')),
  sign_pub bytea not null check (octet_length(sign_pub) = 32),
  box_pub bytea not null check (octet_length(box_pub) = 32),
  status text not null default 'registered' check (status in ('registered', 'pending', 'authorized', 'revoked')),
  auth_session_id uuid,
  app_version text,
  protocol_version int not null,
  created_at timestamptz default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create table public.workspaces (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  generation uuid not null,
  key_epoch int not null default 1,
  head_seq bigint not null default 0,
  min_retained_seq bigint not null default 0,
  min_protocol_read int not null default 1,
  min_protocol_write int not null default 1,
  roster_version int not null default 0,
  created_at timestamptz default now(),
  unique (user_id, generation)
);

create table public.device_roster (
  workspace_id uuid references public.workspaces on delete cascade,
  version int not null,
  roster jsonb not null,
  signer_type text not null check (signer_type in ('device', 'recovery')),
  signer_device uuid references public.devices,
  prev_hash text,
  body_hash text not null,
  signature bytea not null,
  created_at timestamptz default now(),
  primary key (workspace_id, version),
  check ((signer_type = 'device') = (signer_device is not null))
);

create table public.key_envelopes (
  workspace_id uuid references public.workspaces on delete cascade,
  epoch int not null,
  recipient text not null,
  ciphertext bytea not null,
  signer_type text not null check (signer_type in ('device', 'recovery')),
  signer_device uuid references public.devices,
  roster_version int not null,
  signature bytea not null,
  created_at timestamptz default now(),
  primary key (workspace_id, epoch, recipient)
);

create table public.pairing_requests (
  id uuid primary key,
  workspace_id uuid references public.workspaces on delete cascade,
  new_device uuid references public.devices,
  nonce bytea not null,
  expires_at timestamptz not null,
  approved_by uuid references public.devices,
  consumed_at timestamptz
);

create table public.ops (
  workspace_id uuid not null references public.workspaces on delete cascade,
  seq bigint not null,
  op_id uuid not null,
  device_id uuid not null references public.devices,
  payload_hash text not null,
  format_version int not null,
  key_epoch int not null,
  ciphertext bytea not null,
  blob_refs uuid[] not null default '{}',
  received_at timestamptz default now(),
  primary key (workspace_id, seq)
);

create table public.recovery_challenges (
  id uuid primary key,
  workspace_id uuid references public.workspaces on delete cascade,
  device_id uuid references public.devices,
  nonce bytea not null,
  roster_version int not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create table public.recovery_checkpoints (
  workspace_id uuid not null references public.workspaces on delete cascade,
  cp_version int not null,
  body jsonb not null,
  rec_sig bytea not null,
  dev_signer uuid references public.devices,
  dev_sig bytea not null,
  primary key (workspace_id, cp_version)
);

create table public.op_receipts (
  workspace_id uuid references public.workspaces on delete cascade,
  op_id uuid not null,
  payload_hash text not null,
  seq bigint not null,
  primary key (workspace_id, op_id)
);

create table public.snapshots (
  workspace_id uuid references public.workspaces on delete cascade,
  upto_seq bigint not null,
  format_version int not null,
  key_epoch int not null,
  object_path text not null,
  sha256 text not null,
  size bigint not null,
  state text not null check (state in ('uploading', 'published', 'retired')),
  created_by uuid references public.devices,
  created_at timestamptz default now(),
  primary key (workspace_id, upto_seq)
);

create table public.op_blobs (
  workspace_id uuid references public.workspaces on delete cascade,
  blob_id uuid primary key,
  object_path text not null,
  sha256 text not null,
  size bigint not null check (size <= 2097152)
);

create table public.rpc_buckets (
  device_id uuid not null,
  kind text not null,
  window_start timestamptz not null,
  hits int not null,
  primary key (device_id, kind, window_start)
);

create table public.control_events (
  id bigint generated always as identity primary key,
  device_id uuid,
  topic text not null,
  event text not null,
  payload jsonb not null,
  created_at timestamptz default now()
);

create or replace function public._device_guard(p_device uuid, p_allow_unauthorized boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
begin
  if auth.uid() is null or sid is null then raise exception 'no session' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.devices d
     where d.id = p_device and d.user_id = auth.uid() and d.auth_session_id = sid
       and (d.status = 'authorized' or (p_allow_unauthorized and d.status in ('registered', 'pending')))
  ) then
    raise exception 'device not bound to this session or revoked' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.sessions s where s.id = sid and s.user_id = auth.uid()) then
    raise exception 'session no longer exists' using errcode = '42501';
  end if;
end $$;

create or replace function public._rate_limit(p_device uuid, p_kind text, p_limit int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  bucket timestamptz := date_trunc('minute', now());
  seen int;
begin
  insert into public.rpc_buckets as b (device_id, kind, window_start, hits)
  values (p_device, p_kind, bucket, 1)
  on conflict (device_id, kind, window_start) do update set hits = b.hits + 1
  returning b.hits into seen;
  if seen > p_limit then raise exception 'rate_limited' using errcode = 'P0001'; end if;
end $$;

create or replace function public.register_device(p_name text, p_platform text, p_sign_pub bytea, p_box_pub bytea, p_protocol int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if auth.uid() is null or nullif(auth.jwt()->>'session_id', '') is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if octet_length(p_sign_pub) <> 32 or octet_length(p_box_pub) <> 32 then
    raise exception 'bad public key' using errcode = '22023';
  end if;
  insert into public.devices(user_id, auth_session_id, name, platform, sign_pub, box_pub, protocol_version)
  values (auth.uid(), (auth.jwt()->>'session_id')::uuid, p_name, p_platform, p_sign_pub, p_box_pub, p_protocol)
  returning id into v;
  return v;
end $$;

create or replace function public.rebind_device(p_device uuid, p_message bytea, p_signature bytea) returns void
language plpgsql security definer set search_path = '' as $$
declare pub bytea;
begin
  if auth.uid() is null or nullif(auth.jwt()->>'session_id', '') is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select sign_pub into pub from public.devices where id = p_device and user_id = auth.uid() and status <> 'revoked';
  if pub is null or not public._ed25519_verify(pub, p_message, p_signature) then
    raise exception 'rebind proof rejected' using errcode = '42501';
  end if;
  update public.devices set auth_session_id = (auth.jwt()->>'session_id')::uuid, last_seen_at = now() where id = p_device;
end $$;

create or replace function public.bootstrap_workspace(
  p_device uuid, p_workspace uuid, p_generation uuid, p_roster jsonb, p_roster_hash text, p_roster_sig bytea, p_checkpoint jsonb, p_rec_sig bytea, p_dev_sig bytea
) returns void language plpgsql security definer set search_path = '' as $$
declare pub bytea;
begin
  perform public._device_guard(p_device, true);
  if exists (select 1 from public.workspaces w where w.user_id = auth.uid()) then
    raise exception 'workspace exists' using errcode = '42501';
  end if;
  select sign_pub into pub from public.devices where id = p_device;
  if not public._ed25519_verify(pub, convert_to(p_roster::text, 'UTF8'), p_roster_sig) then
    raise exception 'roster signature rejected' using errcode = '42501';
  end if;
  insert into public.workspaces(id, user_id, generation, roster_version) values (p_workspace, auth.uid(), p_generation, 1);
  insert into public.device_roster(workspace_id, version, roster, signer_type, signer_device, prev_hash, body_hash, signature)
  values (p_workspace, 1, p_roster, 'device', p_device, null, p_roster_hash, p_roster_sig);
  insert into public.recovery_checkpoints(workspace_id, cp_version, body, rec_sig, dev_signer, dev_sig)
  values (p_workspace, 1, p_checkpoint, p_rec_sig, p_device, p_dev_sig);
  update public.devices set status = 'authorized' where id = p_device and status in ('registered', 'pending');
end $$;

create or replace function public.push_ops(p_workspace uuid, p_device uuid, p_generation uuid, p_ops jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ws public.workspaces%rowtype;
  item jsonb;
  v_op uuid;
  v_hash text;
  v_fmt int;
  v_epoch int;
  v_ct bytea;
  existing_hash text;
  existing_seq bigint;
  v_head bigint;
  v_bytes int := 0;
  results jsonb := '[]'::jsonb;
begin
  perform public._device_guard(p_device);
  perform public._rate_limit(p_device, 'push', 60);
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'batch limit' using errcode = '22023';
  end if;
  select * into ws from public.workspaces
   where id = p_workspace and user_id = auth.uid() and generation = p_generation
   for update;
  if ws.id is null then raise exception 'workspace mismatch' using errcode = '42501'; end if;
  v_head := ws.head_seq;
  for item in select value from jsonb_array_elements(p_ops) loop
    v_op := (item->>'op_id')::uuid;
    v_hash := item->>'payload_hash';
    v_fmt := (item->>'format_version')::int;
    v_epoch := (item->>'key_epoch')::int;
    v_ct := decode(item->>'ciphertext', 'hex');
    v_bytes := v_bytes + octet_length(v_ct);
    if v_bytes > 1048576 then raise exception 'payload too large' using errcode = '22023'; end if;
    select r.payload_hash, r.seq into existing_hash, existing_seq from public.op_receipts r
     where r.workspace_id = p_workspace and r.op_id = v_op;
    if existing_hash is not null then
      if existing_hash <> v_hash then
        results := results || jsonb_build_array(jsonb_build_object('op_id', v_op, 'error', 'op_id_reused'));
      else
        results := results || jsonb_build_array(jsonb_build_object('op_id', v_op, 'seq', existing_seq, 'duplicate', true));
      end if;
      continue;
    end if;
    if octet_length(v_ct) > 65536 then
      results := results || jsonb_build_array(jsonb_build_object('op_id', v_op, 'error', 'payload_too_large'));
      continue;
    end if;
    if v_epoch <> ws.key_epoch then
      results := results || jsonb_build_array(jsonb_build_object('op_id', v_op, 'error', 'stale_epoch'));
      continue;
    end if;
    if v_fmt < ws.min_protocol_write then
      results := results || jsonb_build_array(jsonb_build_object('op_id', v_op, 'error', 'protocol_too_old'));
      continue;
    end if;
    v_head := v_head + 1;
    insert into public.ops(workspace_id, seq, op_id, device_id, payload_hash, format_version, key_epoch, ciphertext)
    values (p_workspace, v_head, v_op, p_device, v_hash, v_fmt, v_epoch, v_ct);
    insert into public.op_receipts(workspace_id, op_id, payload_hash, seq) values (p_workspace, v_op, v_hash, v_head);
    results := results || jsonb_build_array(jsonb_build_object('op_id', v_op, 'seq', v_head, 'duplicate', false));
  end loop;
  update public.workspaces set head_seq = v_head where id = p_workspace;
  insert into public.control_events(device_id, topic, event, payload)
  values (p_device, 'ws:' || p_workspace::text, 'head', jsonb_build_object('head', v_head));
  begin
    perform realtime.send(jsonb_build_object('head', v_head), 'head', 'ws:' || p_workspace::text, true);
  exception when others then
    -- control_events is the durable hint. A broadcast failure must not roll back an accepted push.
    null;
  end;
  return results;
end $$;

create or replace function public.pull_ops(p_workspace uuid, p_device uuid, p_after bigint, p_limit int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rows jsonb;
begin
  perform public._device_guard(p_device);
  perform public._rate_limit(p_device, 'pull', 120);
  if p_limit < 1 or p_limit > 200 then raise exception 'bad limit' using errcode = '22023'; end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace and w.user_id = auth.uid()) then
    raise exception 'workspace mismatch' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'seq', o.seq, 'op_id', o.op_id, 'device_id', o.device_id, 'payload_hash', o.payload_hash,
    'format_version', o.format_version, 'key_epoch', o.key_epoch, 'ciphertext', encode(o.ciphertext, 'hex')
  ) order by o.seq), '[]'::jsonb) into rows
  from (
    select * from public.ops
     where workspace_id = p_workspace and seq > p_after
     order by seq limit p_limit
  ) o;
  return rows;
end $$;

create or replace function public.receipts_for(p_workspace uuid, p_device uuid, p_op_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public._device_guard(p_device);
  if cardinality(p_op_ids) > 200 then raise exception 'batch limit' using errcode = '22023'; end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace and w.user_id = auth.uid()) then
    raise exception 'workspace mismatch' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('op_id', r.op_id, 'payload_hash', r.payload_hash, 'seq', r.seq))
    from public.op_receipts r
    where r.workspace_id = p_workspace and r.op_id = any (p_op_ids)
  ), '[]'::jsonb);
end $$;

create or replace function public.commit_roster(
  p_workspace uuid, p_device uuid, p_expected_version int, p_prev_hash text, p_roster jsonb, p_body_hash text, p_signature bytea, p_signer_type text
) returns void language plpgsql security definer set search_path = '' as $$
declare current_version int;
begin
  perform public._device_guard(p_device);
  select roster_version into current_version from public.workspaces where id = p_workspace and user_id = auth.uid() for update;
  if current_version is null or current_version <> p_expected_version then
    raise exception 'roster cas failed' using errcode = '40001';
  end if;
  if p_expected_version > 0 and p_prev_hash is distinct from (
    select body_hash from public.device_roster where workspace_id = p_workspace and version = p_expected_version
  ) then
    raise exception 'roster prev hash mismatch' using errcode = '40001';
  end if;
  insert into public.device_roster(workspace_id, version, roster, signer_type, signer_device, prev_hash, body_hash, signature)
  values (p_workspace, p_expected_version + 1, p_roster, p_signer_type, case when p_signer_type = 'device' then p_device else null end, p_prev_hash, p_body_hash, p_signature);
  update public.workspaces set roster_version = p_expected_version + 1 where id = p_workspace;
end $$;

create or replace function public.rotate_epoch(p_workspace uuid, p_device uuid, p_expected_epoch int, p_roster jsonb, p_body_hash text, p_signature bytea)
returns void language plpgsql security definer set search_path = '' as $$
declare v_epoch int; v_version int; prev text;
begin
  perform public._device_guard(p_device);
  select key_epoch, roster_version into v_epoch, v_version from public.workspaces where id = p_workspace and user_id = auth.uid() for update;
  if v_epoch is null or v_epoch <> p_expected_epoch then raise exception 'epoch cas failed' using errcode = '40001'; end if;
  select r.body_hash into prev from public.device_roster r where r.workspace_id = p_workspace and r.version = v_version;
  perform public.commit_roster(p_workspace, p_device, v_version, prev, p_roster, p_body_hash, p_signature, 'device');
  update public.workspaces set key_epoch = v_epoch + 1 where id = p_workspace;
end $$;

create or replace function public.start_recovery(p_workspace uuid, p_device uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_nonce bytea := public._random_bytes(32);
  v_version int;
  v_hash text;
begin
  perform public._device_guard(p_device, true);
  select r.version, r.body_hash into v_version, v_hash
    from public.device_roster r
    join public.workspaces w on w.id = r.workspace_id
   where w.id = p_workspace and w.user_id = auth.uid()
   order by r.version desc limit 1;
  if v_version is null then raise exception 'no roster' using errcode = '42501'; end if;
  insert into public.recovery_challenges(id, workspace_id, device_id, nonce, roster_version, expires_at)
  values (v_id, p_workspace, p_device, v_nonce, v_version, now() + interval '5 minutes');
  return jsonb_build_object('challengeId', v_id, 'nonce', encode(v_nonce, 'hex'), 'rosterVersion', v_version, 'rosterHash', v_hash);
end $$;

create or replace function public.complete_recovery(
  p_workspace uuid, p_device uuid, p_challenge uuid, p_signature bytea, p_roster jsonb, p_body_hash text, p_roster_sig bytea
) returns void language plpgsql security definer set search_path = '' as $$
declare
  challenge public.recovery_challenges%rowtype;
  recovery_pub text;
  pub bytea;
  message bytea;
  v_version int;
  prev text;
begin
  perform public._device_guard(p_device, true);
  select * into challenge from public.recovery_challenges
   where id = p_challenge and workspace_id = p_workspace and device_id = p_device
   for update;
  if challenge.id is null or challenge.consumed_at is not null or challenge.expires_at < now() then
    raise exception 'challenge rejected' using errcode = '42501';
  end if;
  select r.roster->>'recoverySignPub', r.body_hash into recovery_pub, prev from public.device_roster r
   where r.workspace_id = p_workspace and r.version = challenge.roster_version;
  pub := decode(recovery_pub, 'hex');
  message := convert_to('goalloom/recover/v1|' || p_workspace::text || '|' || p_device::text || '|' || encode(challenge.nonce, 'hex') || '|' || prev, 'UTF8');
  if pub is null or octet_length(pub) <> 32 or not public._ed25519_verify(pub, message, p_signature) then
    raise exception 'recovery signature rejected' using errcode = '42501';
  end if;
  select w.roster_version into v_version from public.workspaces w where w.id = p_workspace and w.user_id = auth.uid() for update;
  if v_version <> challenge.roster_version then raise exception 'roster moved' using errcode = '40001'; end if;
  update public.recovery_challenges set consumed_at = now() where id = p_challenge;
  insert into public.device_roster(workspace_id, version, roster, signer_type, signer_device, prev_hash, body_hash, signature)
  values (p_workspace, v_version + 1, p_roster, 'recovery', null, prev, p_body_hash, p_roster_sig);
  update public.workspaces set roster_version = v_version + 1 where id = p_workspace;
  update public.devices set status = 'authorized' where id = p_device;
end $$;

create or replace function public.regenerate_recovery(
  p_workspace uuid, p_device uuid, p_expected_version int, p_prev_hash text, p_roster jsonb, p_body_hash text, p_signature bytea, p_checkpoint jsonb, p_rec_sig bytea, p_dev_sig bytea
) returns void language plpgsql security definer set search_path = '' as $$
declare next_version int;
begin
  perform public._device_guard(p_device);
  perform public.commit_roster(p_workspace, p_device, p_expected_version, p_prev_hash, p_roster, p_body_hash, p_signature, 'device');
  select coalesce(max(cp_version), 0) + 1 into next_version from public.recovery_checkpoints where workspace_id = p_workspace;
  insert into public.recovery_checkpoints(workspace_id, cp_version, body, rec_sig, dev_signer, dev_sig)
  values (p_workspace, next_version, p_checkpoint, p_rec_sig, p_device, p_dev_sig);
end $$;

create or replace function public.get_latest_checkpoint(p_workspace uuid, p_device uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare row public.recovery_checkpoints%rowtype;
begin
  perform public._device_guard(p_device, true);
  if not exists (select 1 from public.workspaces w where w.id = p_workspace and w.user_id = auth.uid()) then
    raise exception 'workspace mismatch' using errcode = '42501';
  end if;
  select * into row from public.recovery_checkpoints where workspace_id = p_workspace order by cp_version desc limit 1;
  if row.workspace_id is null then return 'null'::jsonb; end if;
  return jsonb_build_object('cpVersion', row.cp_version, 'body', row.body, 'recSig', encode(row.rec_sig, 'hex'), 'devSig', encode(row.dev_sig, 'hex'));
end $$;

create or replace function public.revoke_device(p_actor uuid, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._device_guard(p_actor);
  update public.devices set status = 'revoked', revoked_at = now()
   where id = p_target and user_id = auth.uid() and status <> 'revoked';
  if not found then raise exception 'device not found' using errcode = '42501'; end if;
  insert into public.control_events(device_id, topic, event, payload)
  values (p_target, 'device:' || p_target::text, 'revoked', jsonb_build_object('deviceId', p_target));
end $$;

create or replace function public.realtime_can_read(p_topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
begin
  if auth.uid() is null or sid is null or p_topic is null or p_topic not like 'ws:%' then return false; end if;
  return exists (select 1 from public.workspaces w where w.user_id = auth.uid() and 'ws:' || w.id::text = p_topic)
     and exists (select 1 from public.devices d where d.user_id = auth.uid() and d.auth_session_id = sid and d.status = 'authorized')
     and exists (select 1 from auth.sessions s where s.id = sid and s.user_id = auth.uid());
end $$;

create or replace function public.snapshot_access(p_device uuid, p_workspace uuid, p_seq bigint, p_path text)
returns table(object_path text, sha256 text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public._device_guard(p_device);
  if p_path is null or p_path not like 'workspaces/' || p_workspace::text || '/%' then
    raise exception 'path rejected' using errcode = '42501';
  end if;
  return query
  select s.object_path, s.sha256 from public.snapshots s
    join public.workspaces w on w.id = s.workspace_id
   where s.workspace_id = p_workspace and w.user_id = auth.uid() and s.upto_seq = p_seq
     and s.object_path = p_path and s.state = 'published';
end $$;

revoke all on table
  public.devices, public.workspaces, public.device_roster, public.key_envelopes, public.pairing_requests,
  public.ops, public.recovery_challenges, public.recovery_checkpoints, public.op_receipts, public.snapshots,
  public.op_blobs, public.rpc_buckets, public.control_events
from public, anon, authenticated;
revoke all on sequence public.control_events_id_seq from public, anon, authenticated;
revoke execute on function
  public._random_bytes(integer),
  public._ed25519_verify(bytea, bytea, bytea),
  public._device_guard(uuid, boolean),
  public._rate_limit(uuid, text, integer),
  public.register_device(text, text, bytea, bytea, integer),
  public.rebind_device(uuid, bytea, bytea),
  public.bootstrap_workspace(uuid, uuid, uuid, jsonb, text, bytea, jsonb, bytea, bytea),
  public.push_ops(uuid, uuid, uuid, jsonb),
  public.pull_ops(uuid, uuid, bigint, integer),
  public.receipts_for(uuid, uuid, uuid[]),
  public.commit_roster(uuid, uuid, integer, text, jsonb, text, bytea, text),
  public.rotate_epoch(uuid, uuid, integer, jsonb, text, bytea),
  public.start_recovery(uuid, uuid),
  public.complete_recovery(uuid, uuid, uuid, bytea, jsonb, text, bytea),
  public.regenerate_recovery(uuid, uuid, integer, text, jsonb, text, bytea, jsonb, bytea, bytea),
  public.get_latest_checkpoint(uuid, uuid),
  public.revoke_device(uuid, uuid),
  public.realtime_can_read(text),
  public.snapshot_access(uuid, uuid, bigint, text)
from public, anon, authenticated;

grant execute on function
  public.register_device(text, text, bytea, bytea, int),
  public.rebind_device(uuid, bytea, bytea),
  public.bootstrap_workspace(uuid, uuid, uuid, jsonb, text, bytea, jsonb, bytea, bytea),
  public.push_ops(uuid, uuid, uuid, jsonb),
  public.pull_ops(uuid, uuid, bigint, int),
  public.receipts_for(uuid, uuid, uuid[]),
  public.commit_roster(uuid, uuid, int, text, jsonb, text, bytea, text),
  public.rotate_epoch(uuid, uuid, int, jsonb, text, bytea),
  public.start_recovery(uuid, uuid),
  public.complete_recovery(uuid, uuid, uuid, bytea, jsonb, text, bytea),
  public.regenerate_recovery(uuid, uuid, int, text, jsonb, text, bytea, jsonb, bytea, bytea),
  public.get_latest_checkpoint(uuid, uuid),
  public.revoke_device(uuid, uuid),
  public.realtime_can_read(text),
  public.snapshot_access(uuid, uuid, bigint, text)
to authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on table public.devices, public.workspaces, public.device_roster, public.key_envelopes, public.pairing_requests, public.ops, public.recovery_challenges, public.recovery_checkpoints, public.op_receipts, public.snapshots, public.op_blobs, public.rpc_buckets, public.control_events to service_role';
    execute 'grant usage, select on sequence public.control_events_id_seq to service_role';
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('snapshots', 'snapshots', false)
    on conflict (id) do nothing;
  end if;
end $$;

alter table public.devices enable row level security;
alter table public.workspaces enable row level security;
alter table public.device_roster enable row level security;
alter table public.key_envelopes enable row level security;
alter table public.pairing_requests enable row level security;
alter table public.ops enable row level security;
alter table public.recovery_challenges enable row level security;
alter table public.recovery_checkpoints enable row level security;
alter table public.op_receipts enable row level security;
alter table public.snapshots enable row level security;
alter table public.op_blobs enable row level security;
alter table public.rpc_buckets enable row level security;
alter table public.control_events enable row level security;

alter table public.devices force row level security;
alter table public.workspaces force row level security;
alter table public.ops force row level security;
alter table public.op_receipts force row level security;
alter table public.snapshots force row level security;

do $$ begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime' and c.relname = 'messages'
  ) then
    execute 'drop policy if exists "ws topic read" on realtime.messages';
    execute 'create policy "ws topic read" on realtime.messages for select to authenticated using ((select public.realtime_can_read(realtime.topic())))';
  end if;
end $$;
