-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Fenced compensation decisions and fresh provider verification of individual paid periods.
-- OUTPUT: Durable once-only renewal-stop receipts and explicit unverified-payment state.
-- POS: D0 forward delta over 0014; existing sync/AI gates and budgets are unchanged.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create table public.billing_compensations (
  environment text not null, user_id uuid not null, invoice_id text not null,
  reason text not null check(reason in ('refund','dispute')),
  status text not null default 'pending' check(status in ('pending','complete')),
  created_at timestamptz not null default now(), completed_at timestamptz,
  primary key(environment,invoice_id,reason),
  foreign key(environment,user_id) references public.billing_accounts(environment,user_id)
);
alter table public.billing_compensations enable row level security;
revoke all on public.billing_compensations from public,anon,authenticated;
grant select,insert,update,delete on public.billing_compensations to service_role;

create function public.billing_prior_facts(p_environment text,p_user uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('invoice_id',invoice_id,'rc_verified',rc_verified)),'[]'::jsonb)
    from billing_transactions where environment=p_environment and user_id=p_user
$$;
create function public.billing_compensation(p_environment text,p_user uuid,p_lease uuid,p_invoice text,p_reason text,p_complete boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r billing_compensations;
begin
  perform billing_assert_lease(p_environment,p_user,p_lease);
  insert into billing_compensations(environment,user_id,invoice_id,reason) values(p_environment,p_user,p_invoice,p_reason) on conflict do nothing;
  select * into strict r from billing_compensations where environment=p_environment and invoice_id=p_invoice and reason=p_reason for update;
  if r.user_id<>p_user then raise exception 'billing_identity'; end if;
  if p_complete and r.status='pending' then
    update billing_compensations set status='complete',completed_at=clock_timestamp()
      where environment=p_environment and invoice_id=p_invoice and reason=p_reason returning * into r;
  end if;
  return to_jsonb(r);
end $$;
revoke all on function public.billing_prior_facts(text,uuid), public.billing_compensation(text,uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.billing_prior_facts(text,uuid), public.billing_compensation(text,uuid,uuid,text,text,boolean) to service_role;

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
  elsif a.trial_consumed_at is null and not coalesce(a.paid_ever,false) and a.trial_started_at<=t and a.trial_ends_at>t then why:='trialing'; e:=a.trial_ends_at;
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
