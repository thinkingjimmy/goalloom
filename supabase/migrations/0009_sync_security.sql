-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Authenticated device/session and signed initial roster/checkpoint.
-- OUTPUT: Additional encrypted workspaces, pinned discovery and workspace-scoped destructive reset.
-- POS: Non-destructive desktop recovery. Apply after 0008_sync_cost.sql.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

drop function public.list_account();
create function public.list_account(p_workspace uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare target public.workspaces%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into target from public.workspaces
    where user_id = auth.uid() and (p_workspace is null or id = p_workspace)
    order by created_at desc, id desc limit 1;
  if target.id is null then return 'null'::jsonb; end if;
  return jsonb_build_object('workspaceId', target.id, 'generation', target.generation,
    'keyEpoch', target.key_epoch, 'headSeq', target.head_seq, 'rosterVersion', target.roster_version);
end $$;

create function public.create_new_workspace(
  p_device uuid, p_workspace uuid, p_generation uuid, p_roster jsonb, p_roster_hash text,
  p_roster_sig bytea, p_checkpoint jsonb, p_rec_sig bytea, p_dev_sig bytea
) returns void language plpgsql security definer set search_path = '' as $$
declare
  dev public.devices%rowtype;
  checkpoint_message bytea;
  existing public.workspaces%rowtype;
begin
  perform public._device_guard(p_device, true);
  if not public.sync_entitled(auth.uid()) then raise exception 'not entitled' using errcode = '42501'; end if;
  select * into dev from public.devices where id = p_device;
  if p_workspace is null or p_generation is null
    or octet_length(convert_to(p_roster::text, 'UTF8')) > 65536
    or p_roster->>'workspaceId' is distinct from p_workspace::text
    or p_roster->>'version' is distinct from '1' or p_roster->>'epoch' is distinct from '1'
    or p_roster->'prevHash' is distinct from 'null'::jsonb
    or p_roster->'devices' is distinct from jsonb_build_array(jsonb_build_object(
      'id', p_device, 'signPub', encode(dev.sign_pub, 'hex'), 'boxPub', encode(dev.box_pub, 'hex')))
    or coalesce(p_roster->>'recoverySignPub', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_roster->>'recoveryBoxPub', '') !~ '^[0-9a-f]{64}$'
    or p_roster_hash is distinct from encode(public._sha256(convert_to(public._canonical_json(p_roster), 'UTF8')), 'hex')
    or p_checkpoint is distinct from jsonb_build_object('workspaceId', p_workspace, 'cpVersion', 1,
      'rosterVersion', 1, 'rosterHash', p_roster_hash, 'epoch', 1,
      'recoverySignPub', p_roster->>'recoverySignPub', 'recoveryBoxPub', p_roster->>'recoveryBoxPub', 'prevCpHash', null)
  then raise exception 'invalid workspace proof' using errcode = '22023'; end if;
  checkpoint_message := public._sha256(convert_to('goalloom/recovery-cp/v1|' || public._canonical_json(p_checkpoint), 'UTF8'));
  if public._ed25519_verify(dev.sign_pub, public._roster_message(p_roster), p_roster_sig) is distinct from true
    or public._ed25519_verify(dev.sign_pub, checkpoint_message, p_dev_sig) is distinct from true
    or public._ed25519_verify(decode(p_roster->>'recoverySignPub', 'hex'), checkpoint_message, p_rec_sig) is distinct from true
  then raise exception 'workspace signature rejected' using errcode = '42501'; end if;

  -- The account lock orders concurrent creation and discovery without changing an existing workspace.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 9));
  select * into existing from public.workspaces where id = p_workspace;
  if existing.id is not null then
    if existing.user_id = auth.uid() and existing.generation = p_generation
      and exists (select 1 from public.device_roster where workspace_id = p_workspace and version = 1
        and roster = p_roster and body_hash = p_roster_hash and signer_device = p_device)
      and exists (select 1 from public.recovery_checkpoints where workspace_id = p_workspace and cp_version = 1 and body = p_checkpoint)
    then return; end if;
    raise exception 'workspace exists' using errcode = '42501';
  end if;
  insert into public.workspaces(id, user_id, generation, roster_version)
    values (p_workspace, auth.uid(), p_generation, 1);
  insert into public.device_roster(workspace_id, version, roster, signer_type, signer_device, prev_hash, body_hash, signature)
    values (p_workspace, 1, p_roster, 'device', p_device, null, p_roster_hash, p_roster_sig);
  insert into public.recovery_checkpoints(workspace_id, cp_version, body, rec_sig, dev_signer, dev_sig)
    values (p_workspace, 1, p_checkpoint, p_rec_sig, p_device, p_dev_sig);
  update public.devices set status = 'authorized' where id = p_device and status in ('registered', 'pending');
end $$;

drop function public.reset_sync(uuid);
create function public.reset_sync(p_device uuid, p_workspace uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._device_guard(p_device, true);
  if p_workspace is null then raise exception 'workspace required' using errcode = '22023'; end if;
  if exists (select 1 from public.workspaces where id = p_workspace and user_id <> auth.uid()) then
    raise exception 'workspace mismatch' using errcode = '42501';
  end if;
  -- Only the explicitly selected workspace is destroyed. Other preserved workspaces remain usable.
  delete from public.workspaces where id = p_workspace and user_id = auth.uid();
end $$;

revoke execute on function public.list_account(uuid),
  public.create_new_workspace(uuid, uuid, uuid, jsonb, text, bytea, jsonb, bytea, bytea),
  public.reset_sync(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_account(uuid),
  public.create_new_workspace(uuid, uuid, uuid, jsonb, text, bytea, jsonb, bytea, bytea),
  public.reset_sync(uuid, uuid) to authenticated;
