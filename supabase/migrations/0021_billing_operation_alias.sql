-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Verified owner, fenced billing lease and exact original cross-device Checkout intent.
-- OUTPUT: Immutable requested-to-canonical operation aliases and exact durable operation recovery.
-- POS: D1 recovery correction. Clients cannot select alias targets or turn callbacks into entitlement.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create table service_private.operation_aliases (
  environment text not null,user_id uuid not null,request_id uuid not null,
  action text not null check(action='checkout'),cycle text not null check(cycle in ('monthly','annual')),
  continuation jsonb not null,canonical_request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(environment,user_id,request_id),check(request_id<>canonical_request_id),
  foreign key(environment,user_id,canonical_request_id) references public.billing_operations(environment,user_id,request_id) on delete cascade
);
alter table service_private.operation_aliases enable row level security;
revoke all on service_private.operation_aliases from public,anon,authenticated;
grant select on service_private.operation_aliases to service_role;

create function public.service_operation_alias(p_environment text,p_user uuid,p_lease uuid,p_requested uuid,
  p_action text,p_cycle text,p_continuation jsonb,p_candidate uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved service_private.operation_aliases;operation public.billing_operations;keys text[];
begin
  perform public.billing_assert_lease(p_environment,p_user,p_lease);
  select a.* into saved from service_private.operation_aliases a
    where a.environment=p_environment and a.user_id=p_user and a.request_id=p_requested;
  if saved.request_id is not null then
    if saved.action is distinct from p_action or saved.cycle is distinct from p_cycle
      or saved.continuation is distinct from p_continuation
      or p_candidate is not null and p_candidate<>saved.canonical_request_id then raise exception 'billing_request_conflict';end if;
    select o.* into operation from public.billing_operations o where o.environment=p_environment and o.user_id=p_user and o.request_id=saved.canonical_request_id;
    if operation.request_id is null or operation.action<>saved.action or operation.cycle is distinct from saved.cycle then raise exception 'billing_request_conflict';end if;
    return jsonb_build_object('operation',to_jsonb(operation));
  end if;
  if p_candidate is null then
    select o.* into operation from public.billing_operations o where o.environment=p_environment and o.user_id=p_user and o.request_id=p_requested;
    return case when operation.request_id is null then null else jsonb_build_object('operation',to_jsonb(operation)) end;
  end if;
  if p_requested is null or p_requested=p_candidate or p_action is distinct from 'checkout' or coalesce(p_cycle,'') not in ('monthly','annual')
    or exists(select 1 from public.billing_operations o where o.environment=p_environment and o.user_id=p_user and o.request_id=p_requested)
    or jsonb_typeof(p_continuation) is distinct from 'object' then raise exception 'billing_request_conflict';end if;
  select array_agg(key order by key) into keys from jsonb_object_keys(p_continuation) key;
  if p_continuation->'version' is distinct from '1'::jsonb or coalesce(p_continuation->>'locale','') not in ('en','zh-CN','ja','es','fr')
    or coalesce(p_continuation->>'id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    or p_environment='development' and (keys is distinct from array['id','locale','port','transport','version']
      or coalesce(p_continuation->>'transport','')<>'loopback' or jsonb_typeof(p_continuation->'port') is distinct from 'number'
      or coalesce(p_continuation->>'port','')!~'^[0-9]{4,5}$')
    or p_environment='production' and (keys is distinct from array['id','locale','transport','version'] or coalesce(p_continuation->>'transport','')<>'app')
    or p_environment not in ('development','production') then raise exception 'invalid_request';end if;
  if p_environment='development' and (p_continuation->>'port')::integer not between 1024 and 65535 then raise exception 'invalid_request';end if;
  select o.* into operation from public.billing_operations o where o.environment=p_environment and o.user_id=p_user and o.request_id=p_candidate;
  if operation.request_id is null or operation.action<>'checkout' or operation.cycle is distinct from p_cycle or operation.status<>'pending'
    then raise exception 'billing_request_conflict';end if;
  insert into service_private.operation_aliases(environment,user_id,request_id,action,cycle,continuation,canonical_request_id)
    values(p_environment,p_user,p_requested,p_action,p_cycle,p_continuation,p_candidate);
  return jsonb_build_object('operation',to_jsonb(operation));
end $$;
revoke all on function public.service_operation_alias(text,uuid,uuid,uuid,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.service_operation_alias(text,uuid,uuid,uuid,text,text,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
