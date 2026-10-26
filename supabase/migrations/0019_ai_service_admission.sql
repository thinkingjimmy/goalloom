-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Verified Edge identity, D0 service projection and existing immutable AI accounting.
-- OUTPUT: Early/atomic trial_or_paid admission without changing any environment policy, budget or fee.
-- POS: D1 hosted AI seam. Authenticated production behavior and receipt/settlement authority stay independent.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create function public.ai_service_status(p_user uuid,p_environment text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare budget public.ai_budget; headers jsonb;
begin
  select * into budget from public.ai_budget where id='integration-shared';
  if budget.id is null or budget.environment<>p_environment or budget.policy not in ('authenticated','trial_or_paid') then
    return jsonb_build_object('version',1,'eligible',false,'error','permission_denied');
  end if;
  if budget.policy='authenticated' then return jsonb_build_object('version',1,'eligible',true,'policy','authenticated');end if;
  begin headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then headers:='{}';end;
  if headers->>'x-goalloom-service-version' is distinct from '1' then
    return jsonb_build_object('version',1,'eligible',false,'error','upgrade_required','minServiceVersion',1);
  end if;
  return service_private.evaluate(p_user,p_environment)||jsonb_build_object('policy','trial_or_paid');
end $$;
revoke all on function public.ai_service_status(uuid,text) from public,anon,authenticated;
grant execute on function public.ai_service_status(uuid,text) to service_role;

create or replace function public.ai_admit(p_user uuid,p_action uuid,p_capability text,p_environment text,p_model text,p_rate text,p_reserve bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.ai_budget; a public.ai_actions; why text; t timestamptz := clock_timestamp(); issued timestamptz; access jsonb;
begin
  select * into b from public.ai_budget where id='integration-shared' for update;
  if not found or b.environment<>p_environment or b.policy not in ('authenticated','trial_or_paid') then return jsonb_build_object('error','permission_denied'); end if;
  if b.policy='trial_or_paid' then
    perform 1 from public.billing_accounts where environment=p_environment and user_id=p_user for update;
  end if;
  access:=public.ai_service_status(p_user,p_environment);
  if not coalesce((access->>'eligible')::boolean,false) then return access; end if;
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
