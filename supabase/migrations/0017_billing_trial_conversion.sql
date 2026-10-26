-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Financial paid facts, RevenueCat-confirmed windows and an existing atomic trial grant.
-- OUTPUT: Pending recognition preserves the original trial; confirmed/revoked purchases consume it permanently.
-- POS: D0 forward trial-conversion correction; no provider trial, budget or cloud gate changes.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create or replace function public.billing_commit(p_environment text,p_user uuid,p_lease uuid,p_subscriptions jsonb,p_transactions jsonb,p_grace jsonb) returns jsonb
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
    -- trial_conversion_v2: financial success prevents a new grant; pending recognition preserves an existing grant.
    update billing_accounts set paid_ever=true,trial_consumed_at=case when (x->>'rc_verified')::boolean or x->>'disposition'<>'paid' then coalesce(trial_consumed_at,t) else trial_consumed_at end where environment=p_environment and user_id=p_user;
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

create or replace function public.billing_status(p_environment text,p_user uuid) returns jsonb
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
  elsif a.trial_consumed_at is null and a.trial_started_at<=t and a.trial_ends_at>t then why:='trialing'; e:=a.trial_ends_at;
  elsif exists(select 1 from billing_transactions where environment=p_environment and user_id=p_user and disposition='paid' and not rc_verified and starts_at<=t and ends_at>t)
    or exists(select 1 from billing_operations where environment=p_environment and user_id=p_user and status='pending' and action='checkout') then why:='verification_pending';
  elsif exists(select 1 from billing_transactions where environment=p_environment and user_id=p_user and disposition<>'paid' and ends_at>t) then why:='revoked';
  elsif a.trial_started_at is not null or coalesce(a.paid_ever,false) then why:='expired';
  else why:='none'; end if;
  return jsonb_build_object('version',1,'status',why,'eligible',why in ('active','trialing'),'serverNow',t,'effectiveEnd',e,
    'trialEligible',a.trial_started_at is null and not coalesce(a.paid_ever,false),'trialStartedAt',a.trial_started_at,'trialEndsAt',a.trial_ends_at,
    'trialConsumed',a.trial_consumed_at is not null,'grace',coalesce(grace,false),'verifiedAt',a.verified_at,
    'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('id',subscription_id,'status',status,'price',price_id,'endsAt',period_end,'cancelAtPeriodEnd',cancel_at_period_end,'nextPrice',next_price)) from billing_subscriptions where environment=p_environment and user_id=p_user),'[]'::jsonb));
end $$;
