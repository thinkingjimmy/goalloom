-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Installed0032, production-bound policy, pg_net, pg_cron and separate Vault worker credentials.
-- OUTPUT: Private bounded dispatch/completion records and finite health metadata; no active jobs or readiness change.
-- POS: Production worker operations. Product grace, deletion deadlines and AI policy remain authoritative elsewhere.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create extension if not exists pg_net with schema extensions;
create table service_private.worker_dispatches (
 request_id bigint primary key, worker text not null check(worker in ('billing','lifecycle')),
 dispatched_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 outcome text check(outcome in ('complete','http_failure','transport_failure','invalid_result','response_missing')),
 http_status integer, counters jsonb,
 check((completed_at is null)=(outcome is null))
);
create index worker_dispatch_pending on service_private.worker_dispatches(dispatched_at) where completed_at is null;
alter table service_private.worker_dispatches enable row level security;
revoke all on service_private.worker_dispatches from public,anon,authenticated,service_role;
create table service_private.worker_observation (
 id integer primary key check(id=1), observed_at timestamptz not null, retention_at timestamptz,
 retention_ok boolean, retention_counts jsonb
);
alter table service_private.worker_observation enable row level security;
revoke all on service_private.worker_observation from public,anon,authenticated,service_role;

create function service_private.dispatch_production_worker(p_worker text) returns bigint
language plpgsql volatile security definer set search_path='' as $$
declare credential text;request bigint;
begin
 if p_worker is null or p_worker not in ('billing','lifecycle') or not exists(select 1 from service_private.policy
  where id=1 and environment='production' and project_ref='keqprrgvcefqdwnxaafv') then raise exception 'worker_configuration';end if;
 -- Do not accumulate overlapping requests if a previous minute is still unresolved.
 perform pg_advisory_xact_lock(hashtextextended('goalloom-production-worker:'||p_worker,0));
 if exists(select 1 from service_private.worker_dispatches where worker=p_worker and completed_at is null
  and dispatched_at>clock_timestamp()-interval '2 minutes') then return null;end if;
 select decrypted_secret into strict credential from vault.decrypted_secrets
  where name='goalloom-'||p_worker||'-worker-auth-production';
 if credential is null or length(credential)<39 or left(credential,7)<>'Bearer ' then raise exception 'worker_configuration';end if;
 select net.http_post(url:='https://keqprrgvcefqdwnxaafv.supabase.co/functions/v1/'||p_worker||'/worker',
  headers:=jsonb_build_object('content-type','application/json','authorization',credential),body:='{}'::jsonb,
  timeout_milliseconds:=55000) into request;
 insert into service_private.worker_dispatches(request_id,worker) values(request,p_worker);
 return request;
end $$;

create function service_private.observe_production_workers() returns void
language plpgsql volatile security definer set search_path='' as $$
declare row record;payload jsonb;counts jsonb;fields text[];key text;valid boolean;result text;cleanup jsonb;cleaned boolean;
begin
 if not exists(select 1 from service_private.policy where id=1 and environment='production'
  and project_ref='keqprrgvcefqdwnxaafv') then raise exception 'worker_configuration';end if;
 perform pg_advisory_xact_lock(hashtextextended('goalloom-production-worker-observation',0));
 for row in select d.request_id,d.worker,r.id response_id,r.status_code,r.timed_out,r.error_msg,r.content
  from service_private.worker_dispatches d left join net._http_response r on r.id=d.request_id
  where d.completed_at is null and (r.id is not null or d.dispatched_at<clock_timestamp()-interval '3 minutes')
  order by d.dispatched_at limit 100 for update of d skip locked
 loop
  counts:=null;result:='invalid_result';valid:=true;payload:=null;
  if row.response_id is null then result:='response_missing';
  elsif row.timed_out or row.error_msg is not null then result:='transport_failure';
  elsif row.status_code is distinct from 200 then result:='http_failure';
  else
   begin if octet_length(row.content)>4096 then valid:=false;else payload:=row.content::jsonb;end if;
   exception when others then valid:=false;end;
   fields:=case when row.worker='billing' then array['complete','retry','elapsedMs']
    else array['version','exported','progressed','pending','authDeleted','renewalPending'] end;
   counts:='{}'::jsonb;
   foreach key in array fields loop
    if jsonb_typeof(payload->key) is distinct from 'number' or (payload->>key)!~'^[0-9]{1,9}$' then valid:=false;
    else counts:=counts||jsonb_build_object(key,(payload->>key)::bigint);end if;
   end loop;
   if row.worker='lifecycle' and payload->>'version' is distinct from '1' then valid:=false;end if;
   if valid then result:='complete';else counts:=null;end if;
  end if;
  update service_private.worker_dispatches set completed_at=clock_timestamp(),outcome=result,
   http_status=row.status_code,counters=counts where request_id=row.request_id;
 end loop;
 -- Preparation never runs product retention cleanup. Restoration barriers also stop it.
 if exists(select 1 from service_private.lifecycle_policy where id=1 and enabled and independent_ledger_ready
  and restore_admission_ready and cleanup_wiring_ready and not restore_blocked) then
  begin cleanup:=public.lifecycle_cleanup_retention('production',100);cleaned:=cleanup->>'ok'='true';
  exception when others then cleanup:=null;cleaned:=false;end;
 end if;
 insert into service_private.worker_observation(id,observed_at,retention_at,retention_ok,retention_counts)
  values(1,clock_timestamp(),case when cleaned is not null then clock_timestamp() end,cleaned,cleanup)
  on conflict(id) do update set observed_at=excluded.observed_at,
   retention_at=coalesce(excluded.retention_at,service_private.worker_observation.retention_at),
   retention_ok=coalesce(excluded.retention_ok,service_private.worker_observation.retention_ok),
   retention_counts=coalesce(excluded.retention_counts,service_private.worker_observation.retention_counts);
 delete from service_private.worker_dispatches where request_id in(select request_id from service_private.worker_dispatches
  where completed_at<clock_timestamp()-interval '14 days' order by completed_at limit 100);
end $$;

create function service_private.production_worker_health() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',1,'serverNow',clock_timestamp(),'environment','production',
  'observation',(select jsonb_build_object('observedAt',observed_at,'retentionAt',retention_at,'retentionOk',retention_ok)
   from service_private.worker_observation where id=1),
  'workers',(select jsonb_object_agg(worker,value) from(select worker,jsonb_build_object(
   'lastDispatch',max(dispatched_at),'lastComplete',max(completed_at) filter(where outcome='complete'),
   'recentFailures',count(*) filter(where outcome is not null and outcome<>'complete' and dispatched_at>clock_timestamp()-interval '5 minutes'),
   'unresolved',count(*) filter(where completed_at is null),'latestCounters',(select x.counters from service_private.worker_dispatches x
    where x.worker=d.worker and x.outcome='complete' order by x.dispatched_at desc limit 1)) value
   from service_private.worker_dispatches d group by worker) w),
  'billing',jsonb_build_object(
   'pendingEvents',(select count(*) from public.billing_inbox where environment='production' and status in ('pending','processing')),
   'oldestEvent',(select min(received_at) from public.billing_inbox where environment='production' and status in ('pending','processing')),
   'maxAttempts',(select coalesce(max(attempts),0) from public.billing_inbox where environment='production' and status in ('pending','processing')),
   'dueAccounts',(select count(*) from public.billing_accounts where environment='production' and reconcile_at<=clock_timestamp()),
   'expiredLeases',(select count(*) from public.billing_accounts where environment='production' and lease is not null and lease_until<=clock_timestamp()),
   'pendingCompensations',(select count(*) from public.billing_compensations where environment='production' and status<>'complete'),
   'overdueGrace',(select count(*) from public.billing_grace where environment='production' and active and ends_at<=clock_timestamp()),
   'oldestGraceCutoff',(select min(ends_at) from public.billing_grace where environment='production' and active and ends_at<=clock_timestamp())),
  'lifecycle',jsonb_build_object(
   'unexported',(select count(*) from service_private.deletion_outbox where environment='production' and acknowledged_at is null),
   'dueGenerations',(select count(*) from service_private.workspace_lifecycle where environment='production' and state<>'deleted' and next_due_at<=clock_timestamp()),
   'expiredLeases',(select count(*) from service_private.workspace_lifecycle where environment='production' and lease is not null and lease_until<=clock_timestamp()),
   'deadlineRisk',(select count(*) from service_private.workspace_lifecycle where environment='production' and state<>'deleted'
    and online_delete_by<=clock_timestamp()+interval '24 hours'),
   'overdueDeletion',(select count(*) from service_private.workspace_lifecycle where environment='production' and state<>'deleted' and online_delete_by<=clock_timestamp()),
   'renewalPending',(select count(*) from service_private.deletion_requests where environment='production' and confirmed_at is not null and renewal in ('pending','attention_required'))))
$$;

revoke all on function service_private.dispatch_production_worker(text),service_private.observe_production_workers(),
 service_private.production_worker_health() from public,anon,authenticated,service_role;
