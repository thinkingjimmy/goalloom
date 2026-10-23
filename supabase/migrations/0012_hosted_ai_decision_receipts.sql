-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Paused hosted ledger and OpenRouter chat/decision generation identities.
-- OUTPUT: Strict settlement accepts documented gen-dec identities without releasing unknown reservations.
-- POS: Forward-only identity correction; preserves previous migration history, all fees, RLS and receipt-only delivery.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

do $guard$ begin
  perform 1 from public.ai_budget where id='integration-shared' for update;
  if exists(select 1 from public.ai_budget where policy<>'disabled') then raise exception 'Pause AI admission before migration'; end if;
  if exists(select 1 from public.ai_actions where status='running' and created_at>clock_timestamp()-interval '90 seconds') then raise exception 'Drain AI requests before migration'; end if;
end $guard$;

create or replace function public.ai_settle(p_user uuid,p_action uuid,p_status text,p_cost bigint,p_confirmed boolean,p_provider text,p_input bigint,p_output bigint,p_failure text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.ai_actions; charge bigint; t timestamptz:=clock_timestamp();
begin
  perform 1 from public.ai_budget where id='integration-shared' for update;
  select * into a from public.ai_actions where user_id=p_user and action_id=p_action for update;
  if not found then raise exception 'Unknown AI action'; end if;
  if a.confirmed then return public.ai_receipt_metadata(a); end if;
  if p_failure is not null and p_failure not in ('malformed_response','provider_failed','too_large','outcome_unknown','outcome_lost','reconciliation_closed','result_not_delivered') then raise exception 'Invalid failure'; end if;
  if p_provider is not null and p_provider !~ '^gen-(dec-)?[0-9]{10,16}-[A-Za-z0-9]{1,80}$' then raise exception 'Invalid provider identity'; end if;
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
