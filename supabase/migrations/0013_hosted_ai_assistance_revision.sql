-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Paused hosted admission and the owner-approved assistance model revision.
-- OUTPUT: Assistance-only 1017 model admission; existing receipts and fees remain unchanged.
-- POS: Forward-only routing contract; retains Jev, draft, review, limits and content minimization.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

do $guard$ begin
  perform 1 from public.ai_budget where id='integration-shared' for update;
  if exists(select 1 from public.ai_budget where policy<>'disabled') then raise exception 'Pause AI admission before migration'; end if;
  if exists(select 1 from public.ai_actions where status='running' and created_at>clock_timestamp()-interval '90 seconds') then raise exception 'Drain AI requests before migration'; end if;
end $guard$;

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
    or (p_capability in ('draft','review') and p_model<>'deepseek/deepseek-v4.1-flash')
    or (p_capability='assistance' and p_model<>'deepseek/deepseek-v4.1-flash-1017')
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
