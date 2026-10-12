-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- Licensed under the GNU Affero General Public License v3.0 only.
-- The full text is supabase/LICENSE.
--
-- Delta after 0003_roster_signature.sql. commit_roster, rotate_epoch (through
-- commit_roster) and complete_recovery verify the roster signature over
-- SHA-256 of goalloom/roster/v1| plus canonical JSON. A device signer must be
-- the calling authorized device. complete_recovery, and a recovery-typed
-- commit_roster, must be signed by the current roster's recoverySignPub.
-- A mismatch raises roster_signature_rejected (42501).

create or replace function public._require_roster_sig(p_pub bytea, p_roster jsonb, p_signature bytea) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_pub is null or octet_length(p_pub) is distinct from 32 or p_signature is null
     or not public._ed25519_verify(p_pub, public._roster_message(p_roster), p_signature) then
    raise exception 'roster_signature_rejected' using errcode = '42501';
  end if;
end $$;

create or replace function public.commit_roster(
  p_workspace uuid, p_device uuid, p_expected_version int, p_prev_hash text, p_roster jsonb, p_body_hash text, p_signature bytea, p_signer_type text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  current_version int;
  signer bytea;
begin
  perform public._device_guard(p_device);
  if p_signer_type = 'device' then
    select d.sign_pub into signer from public.devices d
     where d.id = p_device and d.user_id = auth.uid() and d.status = 'authorized';
  elsif p_signer_type = 'recovery' then
    select decode(r.roster->>'recoverySignPub', 'hex') into signer
      from public.device_roster r
      join public.workspaces w on w.id = r.workspace_id
     where r.workspace_id = p_workspace and w.user_id = auth.uid() and r.version = w.roster_version;
  end if;
  perform public._require_roster_sig(signer, p_roster, p_signature);
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
  perform public._require_roster_sig(pub, p_roster, p_roster_sig);
  select w.roster_version into v_version from public.workspaces w where w.id = p_workspace and w.user_id = auth.uid() for update;
  if v_version <> challenge.roster_version then raise exception 'roster moved' using errcode = '40001'; end if;
  update public.recovery_challenges set consumed_at = now() where id = p_challenge;
  insert into public.device_roster(workspace_id, version, roster, signer_type, signer_device, prev_hash, body_hash, signature)
  values (p_workspace, v_version + 1, p_roster, 'recovery', null, prev, p_body_hash, p_roster_sig);
  update public.workspaces set roster_version = v_version + 1 where id = p_workspace;
  update public.devices set status = 'authorized' where id = p_device;
end $$;

revoke execute on function public._require_roster_sig(bytea, jsonb, bytea) from public, anon, authenticated;
