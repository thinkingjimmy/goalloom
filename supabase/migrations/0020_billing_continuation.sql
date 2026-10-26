-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Verified Auth owner/session, original fenced operation and finite app/loopback continuation.
-- OUTPUT: Immutable operation-bound continuation and canonical recovery metadata, never a client-chosen URL.
-- POS: D1 browser handoff. No continuation, callback or provider return grants paid service.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create table service_private.continuations (
  environment text not null, user_id uuid not null, request_id uuid not null,
  session_id uuid not null, continuation jsonb not null,
  created_at timestamptz not null, expires_at timestamptz not null,
  primary key(environment,user_id,request_id),
  foreign key(environment,user_id,request_id) references public.billing_operations(environment,user_id,request_id) on delete cascade,
  check(expires_at=created_at+interval '24 hours')
);
alter table service_private.continuations enable row level security;
revoke all on service_private.continuations from public,anon,authenticated;
grant select on service_private.continuations to service_role;

create function public.service_continuation(p_environment text,p_user uuid,p_session uuid,p_lease uuid,p_request uuid,p_requested uuid,p_continuation jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare operation public.billing_operations; saved service_private.continuations; keys text[];
begin
  perform public.billing_assert_lease(p_environment,p_user,p_lease);
  if not exists(select 1 from auth.sessions where id=p_session and user_id=p_user) then raise exception 'authentication_failed';end if;
  select * into operation from public.billing_operations where environment=p_environment and user_id=p_user and request_id=p_request;
  if operation.request_id is null or operation.action not in ('checkout','portal') then raise exception 'billing_request_conflict';end if;
  if jsonb_typeof(p_continuation) is distinct from 'object' then raise exception 'invalid_request';end if;
  select array_agg(key order by key) into keys from jsonb_object_keys(p_continuation) key;
  if p_continuation->'version' is distinct from '1'::jsonb or coalesce(p_continuation->>'locale','') not in ('en','zh-CN','ja','es','fr')
    or coalesce(p_continuation->>'id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    or p_environment='development' and (keys is distinct from array['id','locale','port','transport','version']
      or coalesce(p_continuation->>'transport','')<>'loopback' or jsonb_typeof(p_continuation->'port') is distinct from 'number'
      or coalesce(p_continuation->>'port','')!~'^[0-9]{4,5}$')
    or p_environment='production' and (keys is distinct from array['id','locale','transport','version'] or coalesce(p_continuation->>'transport','')<>'app')
    or p_environment not in ('development','production') then raise exception 'invalid_request';end if;
  if p_environment='development' and (p_continuation->>'port')::integer not between 1024 and 65535 then raise exception 'invalid_request';end if;
  select * into saved from service_private.continuations where environment=p_environment and user_id=p_user and request_id=p_request for update;
  if saved.request_id is null then
    if operation.status='complete' and operation.action='checkout' then
      return jsonb_build_object('continuation',null,'expiresAt',operation.created_at+interval '24 hours','returnToThisDevice',false);
    end if;
    if operation.provider_id is not null then raise exception 'billing_review_required';end if;
    insert into service_private.continuations values(p_environment,p_user,p_request,p_session,p_continuation,operation.created_at,operation.created_at+interval '24 hours') returning * into saved;
  elsif p_requested=p_request and saved.continuation is distinct from p_continuation then raise exception 'billing_request_conflict';end if;
  if operation.status<>'closed' and not(operation.status='complete' and operation.action='checkout') and clock_timestamp()>=saved.expires_at then raise exception 'continuation_expired';end if;
  return jsonb_build_object('continuation',saved.continuation,'expiresAt',saved.expires_at,
    'returnToThisDevice',p_requested=p_request and saved.session_id=p_session and saved.continuation=p_continuation);
end $$;
revoke all on function public.service_continuation(text,uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.service_continuation(text,uuid,uuid,uuid,uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
