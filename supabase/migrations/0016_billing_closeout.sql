-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Fenced renewal-failure closeout decisions and provider idempotency receipts.
-- OUTPUT: Durable recovery of void/release/cancel work after any interrupted side effect.
-- POS: D0 forward reliability delta; no production gate or existing service behavior change.
-- [PROTOCOL]: Update this header when making changes, then check README.md.
alter table public.billing_compensations drop constraint billing_compensations_reason_check;
alter table public.billing_compensations add constraint billing_compensations_reason_check check(reason in ('refund','dispute','grace'));
create function public.billing_closeouts(p_environment text,p_user uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(invoice_id),'[]'::jsonb) from billing_compensations
    where environment=p_environment and user_id=p_user and reason='grace' and status='pending'
$$;
revoke all on function public.billing_closeouts(text,uuid) from public,anon,authenticated;
grant execute on function public.billing_closeouts(text,uuid) to service_role;
