-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Fenced account lease, incompatible pending operation and a fresh original billing intent.
-- OUTPUT: Atomic own-request closed receipt with immutable navigation continuation, without provider writes.
-- POS: D1 definitive rejection; existing unknown operations are never closed or remapped by this function.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create function public.service_reject_operation(p_environment text,p_user uuid,p_lease uuid,p_requested uuid,p_action text,
 p_cycle text,p_continuation jsonb,p_session uuid,p_blocking uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare blocker public.billing_operations;operation jsonb;
begin
 perform public.billing_assert_lease(p_environment,p_user,p_lease);
 if p_requested is null or p_requested=p_blocking or coalesce(p_action,'') not in ('checkout','portal','switch','cancel','resume','remove_switch')
  or p_action in ('checkout','switch') and coalesce(p_cycle,'') not in ('monthly','annual')
  or p_action not in ('checkout','switch') and p_cycle is not null
  or p_action not in ('checkout','portal') and p_continuation is not null
  or exists(select 1 from public.billing_operations o where o.environment=p_environment and o.user_id=p_user and o.request_id=p_requested)
  or exists(select 1 from service_private.operation_aliases a where a.environment=p_environment and a.user_id=p_user and a.request_id=p_requested)
  then raise exception 'billing_request_conflict';end if;
 select o.* into blocker from public.billing_operations o where o.environment=p_environment and o.user_id=p_user and o.request_id=p_blocking;
 if blocker.request_id is null or blocker.status<>'pending'
  or blocker.action='checkout' and p_action='checkout' and blocker.cycle=p_cycle then raise exception 'billing_request_conflict';end if;
 operation:=public.billing_operation(p_environment,p_user,p_lease,p_requested,p_action,p_cycle,null,'{"error":"billing_request_conflict"}'::jsonb,'closed');
 if p_action in ('checkout','portal') then
  perform public.service_continuation(p_environment,p_user,p_session,p_lease,p_requested,p_requested,p_continuation);
 end if;
 return operation;
end $$;
revoke all on function public.service_reject_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_reject_operation(text,uuid,uuid,uuid,text,text,jsonb,uuid,uuid) to service_role;
notify pgrst,'reload schema';
