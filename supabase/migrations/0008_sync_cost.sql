-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Authenticated, entitled devices bound to one workspace.
-- OUTPUT: Read-only control metadata. No request counters or last-seen writes.
-- POS: Target-version sync cost controls, applied after the base schema.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create or replace function public.get_sync_status(p_workspace uuid, p_device uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ws public.workspaces%rowtype;
begin
  perform public._device_guard(p_device);
  if not public.sync_entitled(auth.uid()) then
    raise exception 'sync not entitled' using errcode = '42501';
  end if;
  select * into ws from public.workspaces where id = p_workspace and user_id = auth.uid();
  if ws.id is null then raise exception 'workspace mismatch' using errcode = '42501'; end if;
  return jsonb_build_object(
    'workspaceId', ws.id, 'generation', ws.generation, 'headSeq', ws.head_seq,
    'rosterVersion', ws.roster_version, 'keyEpoch', ws.key_epoch,
    'minRetainedSeq', ws.min_retained_seq,
    'minProtocolRead', ws.min_protocol_read, 'minProtocolWrite', ws.min_protocol_write
  );
end $$;
revoke all on function public.get_sync_status(uuid, uuid) from public, anon;
grant execute on function public.get_sync_status(uuid, uuid) to authenticated;

-- Defaults allow a 10,000-item baseline plus ordinary multi-device bursts.
-- Start in observation mode until hosted baseline/import/concurrency checks pass.
create table public.sync_cost_limits (
  id int primary key check (id = 1),
  version int not null check (version > 0),
  enforce boolean not null,
  minute_ops bigint not null check (minute_ops >= 200),
  minute_bytes bigint not null check (minute_bytes >= 1048576),
  day_ops bigint not null check (day_ops >= minute_ops),
  day_bytes bigint not null check (day_bytes >= minute_bytes),
  registrations_per_day int not null check (registrations_per_day >= 2)
);
insert into public.sync_cost_limits values (1, 1, false, 6000, 33554432, 200000, 536870912, 64);

create table public.sync_account_usage (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('minute', 'day', 'registration')),
  window_start timestamptz not null,
  accepted_ops bigint not null default 0 check (accepted_ops >= 0),
  accepted_bytes bigint not null default 0 check (accepted_bytes >= 0),
  primary key (user_id, kind, window_start)
);
alter table public.sync_cost_limits enable row level security;
alter table public.sync_account_usage enable row level security;
revoke all on public.sync_cost_limits, public.sync_account_usage from public, anon, authenticated;
grant select, update on public.sync_cost_limits to service_role;
grant select on public.sync_account_usage to service_role;

create or replace function public._charge_sync_upload(p_ops int, p_bytes int, p_registration boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  limits public.sync_cost_limits%rowtype;
  bucket record;
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  max_ops bigint;
  max_bytes bigint;
  retry_at timestamptz;
begin
  if auth.uid() is null or p_ops < 1 or p_bytes < 0 then raise exception 'invalid usage' using errcode = '42501'; end if;
  select * into strict limits from public.sync_cost_limits where id = 1;
  if p_registration then
    insert into public.sync_account_usage(user_id, kind, window_start) values (auth.uid(), 'registration', day_start)
      on conflict do nothing;
  else
    insert into public.sync_account_usage(user_id, kind, window_start)
      values (auth.uid(), 'minute', minute_start), (auth.uid(), 'day', day_start) on conflict do nothing;
  end if;
  -- A fixed lock order serializes devices, including distinct workspaces of one account.
  for bucket in select * from public.sync_account_usage
    where user_id = auth.uid() and (
      (p_registration and kind = 'registration' and window_start = day_start) or
      (not p_registration and ((kind = 'minute' and window_start = minute_start) or (kind = 'day' and window_start = day_start)))
    ) order by kind for update
  loop
    max_ops := case bucket.kind when 'minute' then limits.minute_ops when 'day' then limits.day_ops else limits.registrations_per_day end;
    max_bytes := case bucket.kind when 'minute' then limits.minute_bytes else limits.day_bytes end;
    if limits.enforce and (bucket.accepted_ops + p_ops > max_ops or bucket.accepted_bytes + p_bytes > max_bytes) then
      retry_at := bucket.window_start + case when bucket.kind = 'minute' then interval '1 minute' else interval '1 day' end;
      raise exception 'upload_rate_limited' using errcode = 'P0001', detail = jsonb_build_object(
        'scope', case when p_registration then 'registration' else 'upload' end,
        'retryAt', (extract(epoch from retry_at) * 1000)::bigint, 'limitsVersion', limits.version
      )::text;
    end if;
  end loop;
  update public.sync_account_usage set accepted_ops = accepted_ops + p_ops, accepted_bytes = accepted_bytes + p_bytes
    where user_id = auth.uid() and (
      (p_registration and kind = 'registration' and window_start = day_start) or
      (not p_registration and ((kind = 'minute' and window_start = minute_start) or (kind = 'day' and window_start = day_start)))
    );
end $$;
revoke all on function public._charge_sync_upload(int, int, boolean) from public, anon, authenticated;

create or replace function public.register_device(p_name text, p_platform text, p_sign_pub bytea, p_box_pub bytea, p_protocol int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid; sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
begin
  if auth.uid() is null or sid is null or not exists (select 1 from auth.sessions where id = sid and user_id = auth.uid()) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if octet_length(p_sign_pub) is distinct from 32 or octet_length(p_box_pub) is distinct from 32 then
    raise exception 'bad public key' using errcode = '22023';
  end if;
  perform public._charge_sync_upload(1, 0, true);
  insert into public.devices(user_id, auth_session_id, name, platform, sign_pub, box_pub, protocol_version)
    values (auth.uid(), sid, p_name, p_platform, p_sign_pub, p_box_pub, p_protocol) returning id into v;
  return v;
end $$;

-- Time indexes serve bounded cleanup without scanning durable synchronization data.
create index rpc_buckets_expiry on public.rpc_buckets(window_start);
create index sync_account_usage_expiry on public.sync_account_usage(kind, window_start);
create index control_head_expiry on public.control_events(created_at, id) where event = 'head';

create or replace function public.cleanup_sync_runtime(p_limit int default 1000)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '250ms' set statement_timeout = '5s' as $$
declare n int := greatest(1, least(coalesce(p_limit, 1000), 5000)); buckets int; usage int := 0; removed int; heads int; category text;
begin
  with expired as (
    select ctid from public.rpc_buckets where window_start < now() - interval '24 hours'
      order by window_start limit n for update skip locked
  ) delete from public.rpc_buckets where ctid in (select ctid from expired);
  get diagnostics buckets = row_count;
  foreach category in array array['minute', 'day', 'registration'] loop
    with expired as (
      select ctid from public.sync_account_usage
        where kind = category and window_start < now() - case when category = 'minute' then interval '24 hours' else interval '7 days' end
        order by window_start limit n for update skip locked
    ) delete from public.sync_account_usage where ctid in (select ctid from expired);
    get diagnostics removed = row_count;
    usage := usage + removed;
  end loop;
  with expired as (
    select id from public.control_events where event = 'head' and created_at < now() - interval '7 days'
      order by created_at, id limit n for update skip locked
  ) delete from public.control_events where id in (select id from expired);
  get diagnostics heads = row_count;
  return jsonb_build_object('rpcBuckets', buckets, 'accountWindows', usage, 'headEvents', heads);
end $$;
revoke all on function public.cleanup_sync_runtime(int) from public, anon, authenticated;
grant execute on function public.cleanup_sync_runtime(int) to service_role;

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
  v_new_ops int := 0;
  v_new_bytes int := 0;
  results jsonb := '[]'::jsonb;
begin
  perform public._device_guard(p_device);
  if not public.sync_entitled(auth.uid()) then
    raise exception 'sync not entitled' using errcode = '42501';
  end if;
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
    if octet_length(v_ct) > 1048576 then
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
    v_new_ops := v_new_ops + 1;
    v_new_bytes := v_new_bytes + octet_length(v_ct);
    v_head := v_head + 1;
    insert into public.ops(workspace_id, seq, op_id, device_id, payload_hash, format_version, key_epoch, ciphertext)
    values (p_workspace, v_head, v_op, p_device, v_hash, v_fmt, v_epoch, v_ct);
    insert into public.op_receipts(workspace_id, op_id, payload_hash, seq) values (p_workspace, v_op, v_hash, v_head);
    results := results || jsonb_build_array(jsonb_build_object('op_id', v_op, 'seq', v_head, 'duplicate', false));
  end loop;
  if v_head > ws.head_seq then
    perform public._charge_sync_upload(v_new_ops, v_new_bytes);
    update public.workspaces set head_seq = v_head where id = p_workspace;
    insert into public.control_events(device_id, topic, event, payload)
    values (p_device, 'ws:' || p_workspace::text, 'head', jsonb_build_object('head', v_head));
    begin
      perform realtime.send(jsonb_build_object('head', v_head), 'head', 'ws:' || p_workspace::text, true);
    exception when others then
      -- control_events is the durable hint. A broadcast failure must not roll back an accepted push.
      null;
    end;
  end if;
  return results;
end $$;
