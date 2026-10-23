-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Edge-verified user identity, finite capability and server-owned reservation.
-- OUTPUT: Atomic shared budget admission, immutable attempt ownership and bounded encrypted results.
-- POS: Hosted AI ledger. No workspace, entitlement or trial dependency.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create table public.ai_budget (
  id text primary key check (id = 'integration-shared'),
  limit_micro bigint not null check (limit_micro between 0 and 10000000),
  spent_micro bigint not null default 0 check (spent_micro >= 0),
  policy text not null default 'authenticated' check (policy in ('authenticated','trial_or_paid','disabled')),
  environment text not null check (environment in ('development','production')),
  blocked boolean not null default false
);
-- Deployment must explicitly enable its environment and budget. Unknown configuration fails closed.
create table public.ai_actions (
  user_id uuid not null references auth.users(id), action_id uuid not null,
  capability text not null check (capability in ('evaluate','draft','review','assistance')),
  environment text not null check (environment in ('development','production')),
  eligibility text not null check (eligibility in ('authenticated','trial_or_paid')),
  status text not null check (status in ('running','ready','failed','unknown','expired')),
  model text not null, rate_version text not null,
  reserved_micro bigint not null check (reserved_micro > 0),
  charged_micro bigint not null check (charged_micro >= 0),
  confirmed boolean not null default false,
  provider_request_id text, input_tokens bigint, output_tokens bigint,
  failure text, result_cipher text, result_expires_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(user_id, action_id)
);
create unique index ai_provider_receipt on public.ai_actions(provider_request_id) where provider_request_id is not null;
create index ai_actions_time on public.ai_actions(created_at);
create table public.ai_protection (
  user_id uuid primary key references auth.users(id), blocked boolean not null default false,
  reason text not null check (reason in ('manual_review','released')), updated_at timestamptz not null default now()
);
create table public.ai_limit_events (
  user_id uuid not null references auth.users(id), action_id uuid not null, environment text not null,
  reason text not null, created_at timestamptz not null default now(), primary key(user_id,action_id)
);
alter table public.ai_budget enable row level security;
alter table public.ai_actions enable row level security;
alter table public.ai_protection enable row level security;
alter table public.ai_limit_events enable row level security;
revoke all on public.ai_budget, public.ai_actions, public.ai_protection, public.ai_limit_events from public, anon, authenticated;
grant select, insert, update, delete on public.ai_budget, public.ai_actions, public.ai_protection, public.ai_limit_events to service_role;

create function public.ai_admit(p_user uuid,p_action uuid,p_capability text,p_environment text,p_model text,p_rate text,p_reserve bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.ai_budget; a public.ai_actions; why text; t timestamptz := clock_timestamp();
begin
  select * into b from public.ai_budget where id='integration-shared' for update;
  if not found or b.environment<>p_environment or b.policy<>'authenticated' then return jsonb_build_object('error','permission_denied'); end if;
  -- Recover crashed workers without releasing unknown fees or reissuing a request.
  update public.ai_actions set status='unknown',failure='outcome_unknown',updated_at=t
    where status='running' and created_at<t-interval '90 seconds';
  update public.ai_actions set status='failed',failure='reconciliation_closed',updated_at=t
    where status='unknown' and created_at<t-interval '10 minutes';
  update public.ai_actions set result_cipher=null,result_expires_at=null,status=case when status='ready' then 'expired' else status end
    where result_expires_at<t;
  delete from public.ai_actions where created_at<t-interval '90 days' and status not in ('running','unknown');
  delete from public.ai_limit_events where created_at<t-interval '90 days';
  select * into a from public.ai_actions where user_id=p_user and action_id=p_action;
  if found then return jsonb_build_object('existing',true,'receipt',to_jsonb(a)); end if;
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
  return jsonb_build_object('existing',false,'receipt',to_jsonb(a));
end $$;

create function public.ai_settle(p_user uuid,p_action uuid,p_status text,p_cost bigint,p_confirmed boolean,p_provider text,p_input bigint,p_output bigint,p_failure text,p_cipher text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.ai_actions; charge bigint; t timestamptz:=clock_timestamp();
begin
  perform 1 from public.ai_budget where id='integration-shared' for update;
  select * into a from public.ai_actions where user_id=p_user and action_id=p_action for update;
  if not found then raise exception 'Unknown AI action'; end if;
  if a.confirmed or a.status='expired' then return to_jsonb(a); end if;
  if p_status not in ('ready','failed','unknown') or (p_confirmed and (p_cost is null or p_cost<0)) then raise exception 'Invalid settlement'; end if;
  if p_provider is not null and exists(select 1 from public.ai_actions where provider_request_id=p_provider and (user_id<>p_user or action_id<>p_action)) then raise exception 'Duplicate provider receipt'; end if;
  charge := case when p_confirmed then p_cost else a.reserved_micro end;
  update public.ai_budget set spent_micro=spent_micro-a.charged_micro+charge,blocked=blocked or charge>a.reserved_micro where id='integration-shared';
  update public.ai_actions set status=p_status,charged_micro=charge,confirmed=p_confirmed,provider_request_id=coalesce(p_provider,provider_request_id),
    input_tokens=p_input,output_tokens=p_output,failure=p_failure,
    result_cipher=case when p_status='ready' then coalesce(p_cipher,result_cipher) else null end,
    result_expires_at=case when p_status='ready' then coalesce(result_expires_at,t+interval '1 hour') else null end,updated_at=t
    where user_id=p_user and action_id=p_action returning * into a;
  return to_jsonb(a);
end $$;

create function public.ai_receipt(p_user uuid,p_action uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.ai_actions; t timestamptz:=clock_timestamp();
begin
  update public.ai_actions set result_cipher=null,result_expires_at=null,status=case when status='ready' then 'expired' else status end
    where user_id=p_user and action_id=p_action and result_expires_at<t;
  update public.ai_actions set status=case when created_at<t-interval '10 minutes' then 'failed' else 'unknown' end,failure='outcome_unknown',updated_at=t
    where user_id=p_user and action_id=p_action and status in ('running','unknown') and created_at<t-interval '90 seconds';
  select * into a from public.ai_actions where user_id=p_user and action_id=p_action;
  return case when found then to_jsonb(a) else null end;
end $$;

revoke all on function public.ai_admit(uuid,uuid,text,text,text,text,bigint), public.ai_settle(uuid,uuid,text,bigint,boolean,text,bigint,bigint,text,text), public.ai_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_admit(uuid,uuid,text,text,text,text,bigint), public.ai_settle(uuid,uuid,text,bigint,boolean,text,bigint,bigint,text,text), public.ai_receipt(uuid,uuid) to service_role;

create function public.ai_eligibility(p_environment text) returns boolean
language sql security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.ai_budget where id='integration-shared' and environment=p_environment and policy='authenticated');
$$;
revoke all on function public.ai_eligibility(text) from public,anon,authenticated;
grant execute on function public.ai_eligibility(text) to service_role;
