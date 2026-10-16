-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- Licensed under the GNU Affero General Public License v3.0 only.
-- The full text is supabase/LICENSE.
--
-- 0005 is already applied on the dev project. This replaces two functions
-- in place. It does not change sync_entitled. The client does not deploy it.
--
-- put_key_envelopes: 0005 declared epoch, recipient, signature and
-- roster_version. Those are also columns of public.key_envelopes. Under the
-- default plpgsql.variable_conflict (error), the INSERT is 42702 ambiguous,
-- so the first envelope write fails. The variables are now v_-prefixed.
--
-- push_ops: a description of 100_000 characters seals to more than 64 KiB
-- and less than the existing 1 MiB batch cap. The per-op cap now matches
-- that batch cap. A per-op payload_too_large result still continues the
-- batch; it does not abort the function.

create or replace function public.put_key_envelopes(p_workspace uuid, p_device uuid, p_envelopes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_recipient text;
  v_epoch int;
  v_body bytea;
  v_signature bytea;
  v_roster_version int;
begin
  perform public._device_guard(p_device);
  if not exists (select 1 from public.workspaces w where w.id = p_workspace and w.user_id = auth.uid()) then
    raise exception 'workspace mismatch' using errcode = '42501';
  end if;
  if jsonb_typeof(p_envelopes) <> 'array' or jsonb_array_length(p_envelopes) > 32 then
    raise exception 'batch limit' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_envelopes) loop
    v_recipient := v_item->>'recipient';
    v_epoch := (v_item->>'epoch')::int;
    v_body := decode(v_item->>'ciphertext', 'hex');
    v_signature := decode(v_item->>'signature', 'hex');
    v_roster_version := (v_item->>'rosterVersion')::int;
    if v_recipient is null or v_epoch is null or v_body is null or v_signature is null or octet_length(v_body) > 65536 or octet_length(v_signature) <> 64 then
      raise exception 'bad envelope' using errcode = '22023';
    end if;
    if v_recipient <> 'recovery' and v_recipient <> 'chain' and not exists (
      select 1 from public.device_roster r
      where r.workspace_id = p_workspace and r.version = (select w.roster_version from public.workspaces w where w.id = p_workspace)
        and r.roster->'devices' @> jsonb_build_array(jsonb_build_object('id', v_recipient))
    ) then
      raise exception 'recipient rejected' using errcode = '42501';
    end if;
    insert into public.key_envelopes(workspace_id, epoch, recipient, ciphertext, signer_type, signer_device, roster_version, signature)
    values (p_workspace, v_epoch, v_recipient, v_body, 'device', p_device, v_roster_version, v_signature)
    on conflict (workspace_id, epoch, recipient) do update
      set ciphertext = excluded.ciphertext, signature = excluded.signature, roster_version = excluded.roster_version,
          signer_type = excluded.signer_type, signer_device = excluded.signer_device;
  end loop;
end $$;
