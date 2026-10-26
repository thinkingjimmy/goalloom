-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Installed D2 push_ops wrapper and its existing admission/initialization/delegated write guards.
-- OUTPUT: Unambiguous workspace lookup and operation-local UUID references; existing function identity and ACL are preserved.
-- POS: Forward-only PL/pgSQL name-scope correction. No protocol, policy, data or other function change.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create or replace function public.push_ops(p_workspace uuid,p_device uuid,p_generation uuid,p_ops jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare i service_private.initializations;item jsonb;receipt public.op_receipts;row public.ops;seen uuid[]:='{}';final_seen boolean:=false;result jsonb;bytes integer:=0;v_op_id uuid;hash text;
begin
 perform service_private.write_access(p_workspace);
 if not exists(select 1 from public.workspaces w where w.id=p_workspace and w.generation=p_generation and w.user_id=auth.uid()) then raise exception 'workspace mismatch' using errcode='42501';end if;
 perform service_private.initialization_access(p_workspace,p_device,'seed_push');
 if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops)>200 then raise exception 'invalid_request' using errcode='22023';end if;
 select * into i from service_private.initializations where workspace_id=p_workspace and generation=p_generation;
 final_seen:=i.final_seq is not null and i.completed_at is null;
 for item in select value from jsonb_array_elements(p_ops) loop
  v_op_id:=(item->>'op_id')::uuid;hash:=item->>'payload_hash';
  if v_op_id is null or coalesce(hash,'')!~'^[a-f0-9]{64}$' or item->>'format_version' is distinct from '1' or item->>'key_epoch' is distinct from '1'
   or coalesce(item->>'ciphertext','')!~'^[a-f0-9]+$' or length(item->>'ciphertext')%2<>0 then raise exception 'invalid_request' using errcode='22023';end if;
  bytes:=bytes+length(item->>'ciphertext')/2;
  if bytes>1048576 then raise exception 'payload too large' using errcode='22023';end if;
  select * into receipt from public.op_receipts where workspace_id=p_workspace and op_id=v_op_id;
  if i.workspace_id is not null and i.completed_at is null then
   if v_op_id=any(seen) then raise exception 'initialization_conflict' using errcode='PT409';end if;
   if receipt.op_id is not null then
    if receipt.payload_hash<>hash then raise exception 'initialization_conflict' using errcode='PT409';end if;
   else
    if final_seen then raise exception 'initialization_pending' using errcode='PT409';end if;
    if v_op_id=i.final_op_id then final_seen:=true;end if;
   end if;
   if (select count(*) from public.key_envelopes where workspace_id=p_workspace and epoch=1 and recipient in ('recovery',p_device::text))<>2 then raise exception 'initialization_pending' using errcode='PT409';end if;
  end if;
  seen:=array_append(seen,v_op_id);
 end loop;
 result:=service_private.push_ops(p_workspace,p_device,p_generation,p_ops);
 if i.workspace_id is not null and i.completed_at is null then
  if exists(select 1 from jsonb_array_elements(result) e where e ? 'error') then raise exception 'initialization_conflict' using errcode='PT409';end if;
  select * into receipt from public.op_receipts where workspace_id=p_workspace and op_id=i.final_op_id;
  if receipt.op_id is not null then
   select * into row from public.ops where workspace_id=p_workspace and seq=receipt.seq;
   if row.device_id is distinct from i.creator_device_id or row.payload_hash is distinct from receipt.payload_hash then raise exception 'initialization_conflict' using errcode='PT409';end if;
   update service_private.initializations set final_seq=receipt.seq,final_payload_hash=receipt.payload_hash where workspace_id=p_workspace and final_seq is null;
  end if;
 end if;
 return result;
end $$;
