-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Fenced account lease, verified owner session and exact original Checkout intent.
-- OUTPUT: Existing original/alias operation only; unknown intent has no receipt or side effect.
-- POS: D1 receipt-only reconciliation. Never creates, rebinds or extends payment/navigation state.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create function public.service_resolve_operation(p_environment text,p_user uuid,p_lease uuid,p_requested uuid,
 p_action text,p_cycle text,p_continuation jsonb,p_session uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare resolved jsonb; operation public.billing_operations; saved service_private.continuations; keys text[];
begin
 perform public.billing_assert_lease(p_environment,p_user,p_lease);
 if not exists(select 1 from auth.sessions where id=p_session and user_id=p_user) then
  raise exception 'authentication_failed';
 end if;
 if p_requested is null or p_action is distinct from 'checkout' or coalesce(p_cycle,'') not in ('monthly','annual')
  or coalesce(p_environment,'') not in ('development','production')
  or jsonb_typeof(p_continuation) is distinct from 'object' then raise exception 'invalid_request';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_continuation) key;
 if p_continuation->'version' is distinct from '1'::jsonb or coalesce(p_continuation->>'locale','') not in ('en','zh-CN','ja','es','fr')
  or coalesce(p_continuation->>'id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  or p_environment='development' and (keys is distinct from array['id','locale','port','transport','version']
   or coalesce(p_continuation->>'transport','')<>'loopback' or jsonb_typeof(p_continuation->'port') is distinct from 'number'
   or coalesce(p_continuation->>'port','')!~'^[0-9]{4,5}$')
  or p_environment='production' and (keys is distinct from array['id','locale','transport','version']
   or coalesce(p_continuation->>'transport','')<>'app') then raise exception 'invalid_request';end if;
 if p_environment='development' and (p_continuation->>'port')::integer not between 1024 and 65535 then raise exception 'invalid_request';end if;

 resolved:=public.service_operation_alias(p_environment,p_user,p_lease,p_requested,p_action,p_cycle,p_continuation,null);
 if resolved is null then return null;end if;
 select r.* into operation from jsonb_populate_record(null::public.billing_operations,resolved->'operation') as r;
 if operation.request_id is null or operation.environment is distinct from p_environment or operation.user_id is distinct from p_user
  or operation.action is distinct from p_action or operation.cycle is distinct from p_cycle then
  raise exception 'billing_request_conflict';
 end if;
 if operation.request_id=p_requested then
  select c.* into saved from service_private.continuations c
   where c.environment=p_environment and c.user_id=p_user and c.request_id=p_requested;
  if saved.request_id is not null and saved.continuation is distinct from p_continuation
   or saved.request_id is null and operation.status='closed' then raise exception 'billing_request_conflict';end if;
 end if;
 -- Alias lookup already verifies B's immutable intent. Comparing B with A's
 -- continuation would reject legitimate recovery on another device.
 -- No expiry check: resolution cannot create navigation or provider authority.
 return jsonb_build_object('operation',to_jsonb(operation));
end $$;
revoke all on function public.service_resolve_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.service_resolve_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
