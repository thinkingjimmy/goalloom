-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- Licensed under the GNU Affero General Public License v3.0 only.
-- The full text is supabase/LICENSE.
--
-- Delta for a database that already applied 0001_core.sql. bootstrap_workspace
-- was verifying p_roster::text. signRoster signs SHA-256 of
-- goalloom/roster/v1| plus canonical JSON. Fresh installs get the same
-- functions from 0001; this file replaces them in place.

create or replace function public._canonical_json(p_value jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  kind text;
  element jsonb;
  object_key text;
  parts text[] := array[]::text[];
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return 'null';
  end if;
  kind := jsonb_typeof(p_value);
  if kind = 'boolean' or kind = 'number' then
    return p_value::text;
  elsif kind = 'string' then
    return to_json(p_value #>> '{}')::text;
  elsif kind = 'array' then
    for element in select value from jsonb_array_elements(p_value) as t(value)
    loop
      parts := parts || public._canonical_json(element);
    end loop;
    return '[' || array_to_string(parts, ',') || ']';
  elsif kind = 'object' then
    for object_key in
      select t.key from jsonb_object_keys(p_value) as t(key) order by t.key collate "C"
    loop
      parts := parts || (to_json(object_key)::text || ':' || public._canonical_json(p_value -> object_key));
    end loop;
    return '{' || array_to_string(parts, ',') || '}';
  else
    raise exception 'unsupported json' using errcode = '22023';
  end if;
end $$;

create or replace function public._sha256(p_data bytea) returns bytea
language plpgsql immutable security definer set search_path = '' as $$
declare
  schema_name text;
  result bytea;
begin
  select ns.nspname into schema_name from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where p.proname = 'digest' and pg_get_function_identity_arguments(p.oid) = 'bytea, text'
     and ns.nspname in ('extensions', 'public')
   order by ns.nspname limit 1;
  if schema_name is null then
    raise exception 'sha256 not installed' using errcode = '42501';
  end if;
  execute format('select %I.digest($1, %L)', schema_name, 'sha256') into result using p_data;
  return result;
end $$;

create or replace function public._roster_message(p_roster jsonb) returns bytea
language sql immutable set search_path = '' as $$
  select public._sha256(convert_to('goalloom/roster/v1|' || public._canonical_json(p_roster), 'UTF8'));
$$;

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
  if not public._ed25519_verify(pub, public._roster_message(p_roster), p_roster_sig) then
    raise exception 'roster signature rejected' using errcode = '42501';
  end if;
  insert into public.workspaces(id, user_id, generation, roster_version) values (p_workspace, auth.uid(), p_generation, 1);
  insert into public.device_roster(workspace_id, version, roster, signer_type, signer_device, prev_hash, body_hash, signature)
  values (p_workspace, 1, p_roster, 'device', p_device, null, p_roster_hash, p_roster_sig);
  insert into public.recovery_checkpoints(workspace_id, cp_version, body, rec_sig, dev_signer, dev_sig)
  values (p_workspace, 1, p_checkpoint, p_rec_sig, p_device, p_dev_sig);
  update public.devices set status = 'authorized' where id = p_device and status in ('registered', 'pending');
end $$;

revoke execute on function
  public._canonical_json(jsonb),
  public._sha256(bytea),
  public._roster_message(jsonb)
from public, anon, authenticated;
