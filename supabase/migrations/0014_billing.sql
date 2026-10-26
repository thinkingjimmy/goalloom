-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Auth-verified account IDs, environment-bound provider facts and fenced worker leases.
-- OUTPUT: Atomic account trial, immutable ownership, transaction eligibility and durable billing work.
-- POS: D0 billing boundary; existing sync and AI gates are unchanged until their delivery milestones.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create table public.billing_policy (
  environment text primary key check(environment in ('development','production')),
  enabled boolean not null default false,
  trial_hours integer not null default 192 check(trial_hours=192),
  grace_hours integer not null default 72 check(grace_hours=72),
  retention_hours integer not null default 720 check(retention_hours=720),
  online_delete_hours integer not null default 168 check(online_delete_hours=168),
  backup_hours integer not null default 840 check(backup_hours=840),
  discounts boolean not null default false check(not discounts),
  version integer not null default 1 check(version=1)
);
create table public.billing_sources (
  environment text not null references public.billing_policy(environment),
  source text not null check(source='stripe'),
  account_id text not null check(account_id ~ '^acct_[A-Za-z0-9]+$'),
  rc_project text not null check(rc_project='projd720c733'), rc_app text not null,
  monthly_price text not null, annual_price text not null,
  monthly_cents integer not null default 899 check(monthly_cents=899),
  annual_cents integer not null default 7900 check(annual_cents=7900),
  currency text not null default 'usd' check(currency='usd'),
  inclusive boolean not null default true check(inclusive),
  enabled boolean not null default false,
  primary key(environment,source), check(monthly_price<>annual_price)
);
create table public.billing_accounts (
  environment text not null references public.billing_policy(environment),
  user_id uuid not null references auth.users(id),
  trial_request uuid, trial_started_at timestamptz, trial_ends_at timestamptz,
  trial_consumed_at timestamptz, paid_ever boolean not null default false,
  test_now timestamptz, lease uuid, lease_until timestamptz,
  reconcile_at timestamptz not null default now(), verified_at timestamptz,
  primary key(environment,user_id),
  check(test_now is null or environment='development'),
  check((trial_started_at is null and trial_ends_at is null and trial_request is null)
    or (trial_started_at is not null and trial_ends_at=trial_started_at+interval '192 hours' and trial_request is not null))
);
create index billing_reconcile_due on public.billing_accounts(environment,reconcile_at);
create table public.billing_customers (
  environment text not null, user_id uuid not null, source text not null default 'stripe', customer_id text not null,
  primary key(environment,user_id), unique(environment,source,customer_id),
  foreign key(environment,user_id) references public.billing_accounts(environment,user_id),
  foreign key(environment,source) references public.billing_sources(environment,source)
);
create table public.billing_subscriptions (
  environment text not null, user_id uuid not null, subscription_id text not null,
  customer_id text not null, status text not null, price_id text not null,
  period_start timestamptz not null, period_end timestamptz not null,
  cancel_at_period_end boolean not null, schedule_id text, next_price text,
  verified_at timestamptz not null,
  primary key(environment,subscription_id),
  foreign key(environment,user_id) references public.billing_customers(environment,user_id),
  check(period_start<period_end)
);
create index billing_subscriptions_owner on public.billing_subscriptions(environment,user_id);
create table public.billing_transactions (
  environment text not null, invoice_id text not null, user_id uuid not null, subscription_id text not null,
  price_id text not null, starts_at timestamptz not null, ends_at timestamptz not null,
  paid_at timestamptz not null, amount_cents integer not null check(amount_cents>=0),
  refunded_cents integer not null check(refunded_cents>=0),
  disposition text not null check(disposition in ('paid','refunded','disputed','lost')),
  revoked_at timestamptz, rc_verified boolean not null,
  verified_at timestamptz not null, financial_at timestamptz not null,
  primary key(environment,invoice_id),
  foreign key(environment,subscription_id) references public.billing_subscriptions(environment,subscription_id),
  foreign key(environment,user_id) references public.billing_accounts(environment,user_id),
  check(starts_at<ends_at), check((disposition='paid')=(revoked_at is null))
);
create index billing_transactions_owner on public.billing_transactions(environment,user_id,ends_at);
create table public.billing_grace (
  environment text not null, invoice_id text not null, user_id uuid not null, subscription_id text not null,
  starts_at timestamptz not null, ends_at timestamptz not null, active boolean not null,
  primary key(environment,invoice_id),
  foreign key(environment,subscription_id) references public.billing_subscriptions(environment,subscription_id),
  foreign key(environment,user_id) references public.billing_accounts(environment,user_id),
  check(ends_at=starts_at+interval '72 hours')
);
create table public.billing_operations (
  environment text not null, user_id uuid not null, request_id uuid not null,
  action text not null check(action in ('checkout','portal','switch','cancel','resume','remove_switch')),
  cycle text check(cycle in ('monthly','annual')), status text not null default 'pending' check(status in ('pending','complete','closed')),
  provider_id text, result jsonb, created_at timestamptz not null default now(),
  primary key(environment,user_id,request_id),
  foreign key(environment,user_id) references public.billing_accounts(environment,user_id)
);
create unique index billing_one_checkout on public.billing_operations(environment,user_id) where action='checkout' and status='pending';
create table public.billing_inbox (
  environment text not null references public.billing_policy(environment), provider text not null check(provider in ('stripe','revenuecat')),
  event_id text not null check(length(event_id) between 1 and 200), event_type text not null,
  user_id uuid, object_id text, occurred_at timestamptz not null,
  status text not null default 'pending' check(status in ('pending','processing','complete','ignored')),
  attempts integer not null default 0, retry_at timestamptz not null default now(), lease uuid, lease_until timestamptz,
  reason text, received_at timestamptz not null default now(),
  primary key(environment,provider,event_id)
);
create index billing_inbox_due on public.billing_inbox(environment,retry_at) where status in ('pending','processing');

-- Missing configuration is disabled. Migration itself enables neither environment.
insert into public.billing_policy(environment) values('development'),('production');
do $$ declare n text; begin
  foreach n in array array['billing_policy','billing_sources','billing_accounts','billing_customers','billing_subscriptions','billing_transactions','billing_grace','billing_operations','billing_inbox'] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('revoke all on public.%I from public,anon,authenticated',n);
    execute format('grant select,insert,update,delete on public.%I to service_role',n);
  end loop;
end $$;

create function public.billing_now(p_environment text,p_user uuid) returns timestamptz
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select test_now from billing_accounts where environment=p_environment and user_id=p_user and environment='development'),statement_timestamp())
$$;
create function public.billing_status(p_environment text,p_user uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a billing_accounts; t timestamptz:=billing_now(p_environment,p_user); e timestamptz; why text; paid boolean; grace boolean;
begin
  if not exists(select 1 from billing_policy p join billing_sources s using(environment) where p.environment=p_environment and p.enabled and s.enabled) then
    return jsonb_build_object('version',1,'error','billing_configuration','eligible',false,'serverNow',t);
  end if;
  select * into a from billing_accounts where environment=p_environment and user_id=p_user;
  select max(ends_at) into e from billing_transactions where environment=p_environment and user_id=p_user and rc_verified and disposition='paid' and starts_at<=t and ends_at>t;
  paid:=e is not null;
  select greatest(e,max(g.ends_at)),count(*)>0 into e,grace from billing_grace g where g.environment=p_environment and g.user_id=p_user and g.active and g.starts_at<=t and g.ends_at>t;
  if e is not null then why:='active';
  elsif a.trial_consumed_at is null and not coalesce(a.paid_ever,false) and a.trial_started_at<=t and a.trial_ends_at>t then why:='trialing'; e:=a.trial_ends_at;
  elsif exists(select 1 from billing_operations where environment=p_environment and user_id=p_user and status='pending' and action='checkout') then why:='verification_pending';
  elsif exists(select 1 from billing_transactions where environment=p_environment and user_id=p_user and disposition<>'paid' and ends_at>t) then why:='revoked';
  elsif a.trial_started_at is not null or coalesce(a.paid_ever,false) then why:='expired';
  else why:='none'; end if;
  return jsonb_build_object('version',1,'status',why,'eligible',why in ('active','trialing'),'serverNow',t,'effectiveEnd',e,
    'trialEligible',a.trial_started_at is null and not coalesce(a.paid_ever,false),'trialStartedAt',a.trial_started_at,'trialEndsAt',a.trial_ends_at,
    'trialConsumed',a.trial_consumed_at is not null,'grace',coalesce(grace,false),'verifiedAt',a.verified_at,
    'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('id',subscription_id,'status',status,'price',price_id,'endsAt',period_end,'cancelAtPeriodEnd',cancel_at_period_end,'nextPrice',next_price)) from billing_subscriptions where environment=p_environment and user_id=p_user),'[]'::jsonb));
end $$;

create function public.billing_claim_trial(p_environment text,p_user uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a billing_accounts; t timestamptz;
begin
  if billing_status(p_environment,p_user) ? 'error' then return billing_status(p_environment,p_user); end if;
  insert into billing_accounts(environment,user_id) values(p_environment,p_user) on conflict do nothing;
  select * into a from billing_accounts where environment=p_environment and user_id=p_user for update;
  t:=billing_now(p_environment,p_user);
  if a.trial_started_at is null and not a.paid_ever then
    update billing_accounts set trial_request=p_request,trial_started_at=t,trial_ends_at=t+interval '192 hours' where environment=p_environment and user_id=p_user;
  end if;
  return billing_status(p_environment,p_user)||jsonb_build_object('trialReceipt',(select trial_request from billing_accounts where environment=p_environment and user_id=p_user));
end $$;

create function public.billing_lock(p_environment text,p_user uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a billing_accounts; k uuid:=gen_random_uuid();
begin
  if billing_status(p_environment,p_user) ? 'error' then return jsonb_build_object('error','billing_configuration'); end if;
  insert into billing_accounts(environment,user_id) values(p_environment,p_user) on conflict do nothing;
  update billing_accounts set lease=k,lease_until=clock_timestamp()+interval '120 seconds'
    where environment=p_environment and user_id=p_user and (lease_until is null or lease_until<clock_timestamp()) returning * into a;
  if not found then return jsonb_build_object('error','billing_pending'); end if;
  return jsonb_build_object('lease',k,'customer',(select customer_id from billing_customers where environment=p_environment and user_id=p_user),
    'operations',coalesce((select jsonb_agg(to_jsonb(o)) from billing_operations o where environment=p_environment and user_id=p_user and (status='pending' or created_at>clock_timestamp()-interval '24 hours')),'[]'::jsonb));
end $$;
create function public.billing_assert_lease(p_environment text,p_user uuid,p_lease uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from billing_accounts where environment=p_environment and user_id=p_user and lease=p_lease and lease_until>clock_timestamp() for update;
  if not found then raise exception 'billing_lease_lost' using errcode='P0001'; end if;
end $$;
create function public.billing_unlock(p_environment text,p_user uuid,p_lease uuid) returns void
language sql security definer set search_path=public,pg_temp as $$
  update billing_accounts set lease=null,lease_until=null where environment=p_environment and user_id=p_user and lease=p_lease
$$;
create function public.billing_bind_customer(p_environment text,p_user uuid,p_lease uuid,p_customer text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform billing_assert_lease(p_environment,p_user,p_lease);
  if p_customer !~ '^cus_[A-Za-z0-9]+$' then raise exception 'billing_identity'; end if;
  insert into billing_customers values(p_environment,p_user,'stripe',p_customer) on conflict(environment,user_id) do nothing;
  if not exists(select 1 from billing_customers where environment=p_environment and user_id=p_user and customer_id=p_customer) then raise exception 'billing_identity'; end if;
end $$;
create function public.billing_operation(p_environment text,p_user uuid,p_lease uuid,p_request uuid,p_action text,p_cycle text,p_provider text default null,p_result jsonb default null,p_status text default 'pending') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare o billing_operations;
begin
  perform billing_assert_lease(p_environment,p_user,p_lease);
  select * into o from billing_operations where environment=p_environment and user_id=p_user and request_id=p_request;
  if found and (o.action<>p_action or o.cycle is distinct from p_cycle) then raise exception 'billing_request_conflict'; end if;
  if found and o.status in ('complete','closed') then return to_jsonb(o); end if;
  insert into billing_operations(environment,user_id,request_id,action,cycle,status,provider_id,result)
    values(p_environment,p_user,p_request,p_action,p_cycle,p_status,p_provider,p_result)
    on conflict(environment,user_id,request_id) do update set provider_id=coalesce(excluded.provider_id,billing_operations.provider_id),result=coalesce(excluded.result,billing_operations.result),status=excluded.status returning * into o;
  return to_jsonb(o);
end $$;

-- All provider data below has already passed the server object-graph and source allowlist checks.
-- The account lease fences stale network responses and serializes trial consumption with facts.
create function public.billing_commit(p_environment text,p_user uuid,p_lease uuid,p_subscriptions jsonb,p_transactions jsonb,p_grace jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb; x jsonb; g jsonb; c text; t timestamptz:=billing_now(p_environment,p_user); allowed text[]; affected integer;
begin
  perform billing_assert_lease(p_environment,p_user,p_lease);
  select customer_id into strict c from billing_customers where environment=p_environment and user_id=p_user;
  select array[monthly_price,annual_price] into strict allowed from billing_sources where environment=p_environment and source='stripe' and enabled;
  for s in select value from jsonb_array_elements(p_subscriptions) loop
    if s->>'customer_id'<>c or not(s->>'price_id'=any(allowed)) or s->>'subscription_id' !~ '^sub_[A-Za-z0-9]+$' then raise exception 'billing_identity'; end if;
    if exists(select 1 from billing_subscriptions where environment=p_environment and subscription_id=s->>'subscription_id' and user_id<>p_user) then raise exception 'billing_identity'; end if;
    insert into billing_subscriptions values(p_environment,p_user,s->>'subscription_id',c,s->>'status',s->>'price_id',(s->>'period_start')::timestamptz,(s->>'period_end')::timestamptz,(s->>'cancel_at_period_end')::boolean,s->>'schedule_id',s->>'next_price',t)
      on conflict(environment,subscription_id) do update set status=excluded.status,price_id=excluded.price_id,period_start=excluded.period_start,period_end=excluded.period_end,cancel_at_period_end=excluded.cancel_at_period_end,schedule_id=excluded.schedule_id,next_price=excluded.next_price,verified_at=t
      where billing_subscriptions.user_id=excluded.user_id and billing_subscriptions.customer_id=excluded.customer_id;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'billing_identity'; end if;
  end loop;
  for x in select value from jsonb_array_elements(p_transactions) loop
    if not(x->>'price_id'=any(allowed)) or not exists(select 1 from billing_subscriptions where environment=p_environment and user_id=p_user and subscription_id=x->>'subscription_id') then raise exception 'billing_identity'; end if;
    if exists(select 1 from billing_transactions where environment=p_environment and invoice_id=x->>'invoice_id' and (user_id<>p_user or subscription_id<>x->>'subscription_id')) then raise exception 'billing_identity'; end if;
    insert into billing_transactions values(p_environment,x->>'invoice_id',p_user,x->>'subscription_id',x->>'price_id',(x->>'starts_at')::timestamptz,(x->>'ends_at')::timestamptz,(x->>'paid_at')::timestamptz,(x->>'amount_cents')::integer,(x->>'refunded_cents')::integer,x->>'disposition',case when x->>'disposition'<>'paid' then t end,(x->>'rc_verified')::boolean,t,(x->>'financial_at')::timestamptz)
      on conflict(environment,invoice_id) do update set refunded_cents=excluded.refunded_cents,disposition=excluded.disposition,
        revoked_at=case when excluded.disposition='paid' then null else coalesce(billing_transactions.revoked_at,t) end,
        rc_verified=excluded.rc_verified,verified_at=t,financial_at=greatest(billing_transactions.financial_at,excluded.financial_at)
      where billing_transactions.user_id=excluded.user_id and billing_transactions.subscription_id=excluded.subscription_id
        and billing_transactions.price_id=excluded.price_id and billing_transactions.starts_at=excluded.starts_at and billing_transactions.ends_at=excluded.ends_at
        and billing_transactions.paid_at=excluded.paid_at and billing_transactions.amount_cents=excluded.amount_cents;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'billing_identity'; end if;
    -- A successful purchase consumes eligibility even if this reconciliation first sees its refund.
    update billing_accounts set paid_ever=true,trial_consumed_at=coalesce(trial_consumed_at,t) where environment=p_environment and user_id=p_user;
  end loop;
  update billing_grace set active=false where environment=p_environment and user_id=p_user;
  for g in select value from jsonb_array_elements(p_grace) loop
    if not exists(select 1 from billing_subscriptions where environment=p_environment and user_id=p_user and subscription_id=g->>'subscription_id')
      or not exists(select 1 from billing_transactions where environment=p_environment and user_id=p_user and subscription_id=g->>'subscription_id' and disposition='paid' and rc_verified and ends_at=(g->>'starts_at')::timestamptz) then raise exception 'billing_grace_invalid'; end if;
    insert into billing_grace values(p_environment,g->>'invoice_id',p_user,g->>'subscription_id',(g->>'starts_at')::timestamptz,(g->>'starts_at')::timestamptz+interval '72 hours',true)
      on conflict(environment,invoice_id) do update set active=true
      where billing_grace.user_id=excluded.user_id and billing_grace.subscription_id=excluded.subscription_id and billing_grace.starts_at=excluded.starts_at;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'billing_identity'; end if;
  end loop;
  update billing_accounts set verified_at=t,reconcile_at=clock_timestamp()+interval '15 minutes' where environment=p_environment and user_id=p_user;
  return billing_status(p_environment,p_user);
end $$;

create function public.billing_receive(p_environment text,p_provider text,p_event text,p_type text,p_user uuid,p_object text,p_occurred timestamptz,p_reason text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into billing_inbox(environment,provider,event_id,event_type,user_id,object_id,occurred_at,status,reason)
    values(p_environment,p_provider,p_event,p_type,p_user,p_object,p_occurred,case when p_reason is null then 'pending' else 'ignored' end,p_reason)
    on conflict do nothing;
end $$;
create function public.billing_source(p_environment text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select to_jsonb(s) from billing_sources s join billing_policy p using(environment) where s.environment=p_environment and s.enabled and p.enabled
$$;
create function public.billing_owner(p_environment text,p_customer text) returns uuid
language sql stable security definer set search_path=public,pg_temp as $$
  select user_id from billing_customers where environment=p_environment and customer_id=p_customer
$$;
create function public.billing_take_work(p_environment text,p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare jobs jsonb; accounts jsonb;
begin
  with due as(select environment,provider,event_id from billing_inbox where environment=p_environment and retry_at<=clock_timestamp()
    and (status='pending' or status='processing' and lease_until<clock_timestamp()) order by retry_at limit least(greatest(p_limit,1),20) for update skip locked),
  claimed as(update billing_inbox i set status='processing',lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '120 seconds',attempts=attempts+1
    from due d where i.environment=d.environment and i.provider=d.provider and i.event_id=d.event_id returning i.*)
  select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into jobs from claimed;
  with due as(select environment,user_id from billing_accounts where environment=p_environment and reconcile_at<=clock_timestamp()
    and (lease_until is null or lease_until<clock_timestamp()) order by reconcile_at limit least(greatest(p_limit,1),20) for update skip locked),
  claimed as(update billing_accounts a set reconcile_at=clock_timestamp()+interval '2 minutes' from due d where a.environment=d.environment and a.user_id=d.user_id returning a.user_id)
  select coalesce(jsonb_agg(user_id),'[]'::jsonb) into accounts from claimed;
  return jsonb_build_object('events',jobs,'accounts',accounts);
end $$;
create function public.billing_finish_work(p_environment text,p_provider text,p_event text,p_lease uuid,p_ok boolean,p_reason text default null) returns void
language sql security definer set search_path=public,pg_temp as $$
  update billing_inbox set status=case when p_ok then 'complete' else 'pending' end,reason=p_reason,
    retry_at=clock_timestamp()+make_interval(secs=>least(3600,5*power(2,least(attempts,10)))::integer),lease=null,lease_until=null
    where environment=p_environment and provider=p_provider and event_id=p_event and lease=p_lease and lease_until>clock_timestamp()
$$;

do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'billing_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
