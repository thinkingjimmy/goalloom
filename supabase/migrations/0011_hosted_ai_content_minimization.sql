-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Existing hosted ledger, drained admission and protocol-v2 timestamped action identities.
-- OUTPUT: Receipt-only settlement, irreversible logical content removal and bounded replay admission.
-- POS: Forward-only privacy migration; preserves cumulative budget, cost facts, ownership and RLS.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

-- Fail closed unless the operator first pauses admission and drains the original request lease.
do $guard$ begin
  -- Keep pause validation under the same lock as admission and settlement until commit.
  perform 1 from public.ai_budget where id='integration-shared' for update;
  if exists(select 1 from public.ai_budget where policy<>'disabled') then raise exception 'Pause AI admission before migration'; end if;
  if exists(select 1 from public.ai_actions where status='running' and created_at>clock_timestamp()-interval '90 seconds') then raise exception 'Drain AI requests before migration'; end if;
end $guard$;

-- DROP removes logical values; database backups and physical pages require separate retention handling.
alter table public.ai_actions drop column result_cipher, drop column result_expires_at;
drop function public.ai_settle(uuid,uuid,text,bigint,boolean,text,bigint,bigint,text,text);
update public.ai_actions set failure='outcome_lost' where failure is not null and failure not in
  ('malformed_response','provider_failed','too_large','outcome_unknown','outcome_lost','reconciliation_closed','result_not_delivered');
alter table public.ai_actions add constraint ai_failure_metadata check(failure is null or failure in
  ('malformed_response','provider_failed','too_large','outcome_unknown','outcome_lost','reconciliation_closed','result_not_delivered'));

create function public.ai_receipt_metadata(a public.ai_actions) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
  select jsonb_build_object('user_id',a.user_id,'action_id',a.action_id,'capability',a.capability,
    'environment',a.environment,'eligibility',a.eligibility,'status',a.status,'model',a.model,'rate_version',a.rate_version,
    'reserved_micro',a.reserved_micro,'charged_micro',a.charged_micro,'confirmed',a.confirmed,
    'provider_request_id',a.provider_request_id,'input_tokens',a.input_tokens,'output_tokens',a.output_tokens,
    'failure',a.failure,'created_at',a.created_at,'updated_at',a.updated_at);
$$;
revoke all on function public.ai_receipt_metadata(public.ai_actions) from public,anon,authenticated;
grant execute on function public.ai_receipt_metadata(public.ai_actions) to service_role;

create or replace function public.ai_admit(p_user uuid,p_action uuid,p_capability text,p_environment text,p_model text,p_rate text,p_reserve bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.ai_budget; a public.ai_actions; why text; t timestamptz := clock_timestamp(); issued timestamptz;
begin
  select * into b from public.ai_budget where id='integration-shared' for update;
  if not found or b.environment<>p_environment or b.policy<>'authenticated' then return jsonb_build_object('error','permission_denied'); end if;
  -- Recover crashed workers without releasing unknown fees or reissuing a request.
  update public.ai_actions set status='unknown',failure='outcome_unknown',updated_at=t
    where status='running' and created_at<t-interval '90 seconds';
  update public.ai_actions set status='failed',failure='reconciliation_closed',updated_at=t
    where status='unknown' and created_at<t-interval '10 minutes';
  delete from public.ai_actions where created_at<t-interval '90 days' and status not in ('running','unknown');
  delete from public.ai_limit_events where created_at<t-interval '90 days';
  select * into a from public.ai_actions where user_id=p_user and action_id=p_action;
  if found then return jsonb_build_object('existing',true,'receipt',public.ai_receipt_metadata(a)); end if;
  -- UUIDv7 binds replay validity to the original identity without storing content or permanent tombstones.
  if substring(p_action::text,15,1)<>'7' then return jsonb_build_object('error','action_expired'); end if;
  issued := to_timestamp((('x'||replace(substring(p_action::text,1,13),'-',''))::bit(48)::bigint)::double precision/1000);
  if issued<t-interval '5 minutes' or issued>t+interval '1 minute' then return jsonb_build_object('error','action_expired'); end if;
  if p_reserve<>500000 or p_rate<>'openrouter-2026-10-23-v1'
    or (p_capability='evaluate' and p_model<>'typesafe/jev-1.14')
    or (p_capability in ('draft','review','assistance') and p_model<>'deepseek/deepseek-v4.1-flash')
    or p_capability not in ('evaluate','draft','review','assistance') then return jsonb_build_object('error','permission_denied'); end if;
  if b.blocked or b.spent_micro+p_reserve>b.limit_micro then why:='platform_budget';
  elsif exists(select 1 from public.ai_protection where user_id=p_user and blocked) then why:='account_protection';
  elsif (select coalesce(sum(charged_micro),0) from public.ai_actions where user_id=p_user and created_at>=date_trunc('day',t at time zone 'UTC') at time zone 'UTC')+p_reserve>5000000 then why:='account_budget';
  elsif (select count(*) from public.ai_actions where status='running')>=16 then why:='platform_concurrency';
  elsif (select count(*) from public.ai_actions where user_id=p_user and status='running')>=4 then why:='account_concurrency';
  elsif (select count(*) from public.ai_actions where created_at>=t-interval '1 minute')>=600 then why:='platform_rate';
  elsif (select count(*) from public.ai_actions where user_id=p_user and created_at>=t-interval '1 minute')>=120 then why:='account_rate'; end if;
  if why is not null then
    insert into public.ai_limit_events values(p_user,p_action,p_environment,why,t) on conflict do nothing;
    return jsonb_build_object('error',why,'retryAt',t+interval '1 minute');
  end if;
  update public.ai_budget set spent_micro=spent_micro+p_reserve where id=b.id;
  insert into public.ai_actions(user_id,action_id,capability,environment,eligibility,status,model,rate_version,reserved_micro,charged_micro)
    values(p_user,p_action,p_capability,p_environment,b.policy,'running',p_model,p_rate,p_reserve,p_reserve)
    returning * into a;
  return jsonb_build_object('existing',false,'receipt',public.ai_receipt_metadata(a));
end $$;

create function public.ai_settle(p_user uuid,p_action uuid,p_status text,p_cost bigint,p_confirmed boolean,p_provider text,p_input bigint,p_output bigint,p_failure text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.ai_actions; charge bigint; t timestamptz:=clock_timestamp();
begin
  perform 1 from public.ai_budget where id='integration-shared' for update;
  select * into a from public.ai_actions where user_id=p_user and action_id=p_action for update;
  if not found then raise exception 'Unknown AI action'; end if;
  if a.confirmed then return public.ai_receipt_metadata(a); end if;
  if p_failure is not null and p_failure not in ('malformed_response','provider_failed','too_large','outcome_unknown','outcome_lost','reconciliation_closed','result_not_delivered') then raise exception 'Invalid failure'; end if;
  if p_provider is not null and p_provider !~ '^gen-[0-9]{10,16}-[A-Za-z0-9]{1,80}$' then raise exception 'Invalid provider identity'; end if;
  if (p_input is not null and p_input<0) or (p_output is not null and p_output<0) then raise exception 'Invalid usage'; end if;
  if p_status not in ('ready','failed','unknown') or (p_confirmed and (p_cost is null or p_cost<0)) then raise exception 'Invalid settlement'; end if;
  if p_provider is not null and exists(select 1 from public.ai_actions where provider_request_id=p_provider and (user_id<>p_user or action_id<>p_action)) then raise exception 'Duplicate provider receipt'; end if;
  charge := case when p_confirmed then p_cost else a.reserved_micro end;
  update public.ai_budget set spent_micro=spent_micro-a.charged_micro+charge,blocked=blocked or charge>a.reserved_micro where id='integration-shared';
  update public.ai_actions set status=case when a.status in ('ready','expired') then a.status when a.created_at<t-interval '10 minutes' then 'failed' else p_status end,charged_micro=charge,confirmed=p_confirmed,provider_request_id=coalesce(p_provider,provider_request_id),
    input_tokens=p_input,output_tokens=p_output,failure=p_failure,
    updated_at=t
    where user_id=p_user and action_id=p_action returning * into a;
  return public.ai_receipt_metadata(a);
end $$;

create or replace function public.ai_receipt(p_user uuid,p_action uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.ai_actions; t timestamptz:=clock_timestamp();
begin
  update public.ai_actions set status=case when created_at<t-interval '10 minutes' then 'failed' else 'unknown' end,failure=case when created_at<t-interval '10 minutes' then 'reconciliation_closed' else 'outcome_unknown' end,updated_at=t
    where user_id=p_user and action_id=p_action and status in ('running','unknown') and created_at<t-interval '90 seconds';
  select * into a from public.ai_actions where user_id=p_user and action_id=p_action and created_at>=t-interval '90 days';
  return case when found then public.ai_receipt_metadata(a) else null end;
end $$;


revoke all on function public.ai_settle(uuid,uuid,text,bigint,boolean,text,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.ai_settle(uuid,uuid,text,bigint,boolean,text,bigint,bigint,text) to service_role;
