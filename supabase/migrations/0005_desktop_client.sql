-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- Licensed under the GNU Affero General Public License v3.0 only.
-- The full text is supabase/LICENSE.
--
-- Desktop PC-to-PC client. Does not change sync_entitled. The owner applies
-- this file; the client does not deploy it.
--
-- list_account lets a signed-in device discover the one workspace id. The
-- recovery phrase still has to open the checkpoint; the id alone is not a key.
-- get_roster and get_key_envelopes allow a registered device so recovery can
-- verify the checkpoint before complete_recovery authorizes it.
-- put_key_envelopes is authorized devices only. Ciphertext stays opaque.
-- linux is a desktop platform alongside macos and windows.

alter table public.devices drop constraint if exists devices_platform_check;
alter table public.devices add constraint devices_platform_check
  check (platform in ('ios', 'android', 'macos', 'windows', 'linux'));

create or replace function public.list_account()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  row public.workspaces%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into row from public.workspaces where user_id = auth.uid() order by created_at limit 1;
  if row.id is null then
    return 'null'::jsonb;
  end if;
  return jsonb_build_object(
    'workspaceId', row.id,
    'generation', row.generation,
    'keyEpoch', row.key_epoch,
    'headSeq', row.head_seq,
    'rosterVersion', row.roster_version
  );
end $$;

create or replace function public.get_roster(p_workspace uuid, p_device uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._device_guard(p_device, true);
  if not exists (select 1 from public.workspaces w where w.id = p_workspace and w.user_id = auth.uid()) then
    raise exception 'workspace mismatch' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'version', r.version,
      'roster', r.roster,
      'bodyHash', r.body_hash,
      'signature', encode(r.signature, 'hex'),
      'signerType', r.signer_type,
      'signerDevice', r.signer_device
    ) order by r.version)
    from public.device_roster r
    where r.workspace_id = p_workspace
  ), '[]'::jsonb);
end $$;

create or replace function public.get_key_envelopes(p_workspace uuid, p_device uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._device_guard(p_device, true);
  if not exists (select 1 from public.workspaces w where w.id = p_workspace and w.user_id = auth.uid()) then
    raise exception 'workspace mismatch' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'epoch', e.epoch,
      'recipient', e.recipient,
      'ciphertext', encode(e.ciphertext, 'hex'),
      'signature', encode(e.signature, 'hex'),
      'rosterVersion', e.roster_version,
      'signerDevice', e.signer_device
    ) order by e.epoch, e.recipient)
    from public.key_envelopes e
    where e.workspace_id = p_workspace
  ), '[]'::jsonb);
end $$;

create or replace function public.put_key_envelopes(p_workspace uuid, p_device uuid, p_envelopes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  recipient text;
  epoch int;
  body bytea;
  signature bytea;
  roster_version int;
begin
  perform public._device_guard(p_device);
  if not exists (select 1 from public.workspaces w where w.id = p_workspace and w.user_id = auth.uid()) then
    raise exception 'workspace mismatch' using errcode = '42501';
  end if;
  if jsonb_typeof(p_envelopes) <> 'array' or jsonb_array_length(p_envelopes) > 32 then
    raise exception 'batch limit' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_envelopes) loop
    recipient := item->>'recipient';
    epoch := (item->>'epoch')::int;
    body := decode(item->>'ciphertext', 'hex');
    signature := decode(item->>'signature', 'hex');
    roster_version := (item->>'rosterVersion')::int;
    if recipient is null or epoch is null or body is null or signature is null or octet_length(body) > 65536 or octet_length(signature) <> 64 then
      raise exception 'bad envelope' using errcode = '22023';
    end if;
    if recipient <> 'recovery' and recipient <> 'chain' and not exists (
      select 1 from public.device_roster r
      where r.workspace_id = p_workspace and r.version = (select w.roster_version from public.workspaces w where w.id = p_workspace)
        and r.roster->'devices' @> jsonb_build_array(jsonb_build_object('id', recipient))
    ) then
      raise exception 'recipient rejected' using errcode = '42501';
    end if;
    insert into public.key_envelopes(workspace_id, epoch, recipient, ciphertext, signer_type, signer_device, roster_version, signature)
    values (p_workspace, epoch, recipient, body, 'device', p_device, roster_version, signature)
    on conflict (workspace_id, epoch, recipient) do update
      set ciphertext = excluded.ciphertext, signature = excluded.signature, roster_version = excluded.roster_version,
          signer_type = excluded.signer_type, signer_device = excluded.signer_device;
  end loop;
end $$;

revoke execute on function
  public.list_account(),
  public.get_roster(uuid, uuid),
  public.get_key_envelopes(uuid, uuid),
  public.put_key_envelopes(uuid, uuid, jsonb)
from public, anon, authenticated;

grant execute on function
  public.list_account(),
  public.get_roster(uuid, uuid),
  public.get_key_envelopes(uuid, uuid),
  public.put_key_envelopes(uuid, uuid, jsonb)
to authenticated;
