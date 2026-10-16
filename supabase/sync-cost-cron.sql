-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Operator-verified pg_cron capability and the target sync schema.
-- OUTPUT: One named bounded cleanup job; Cron run details retain failures.
-- POS: Explicit hosted setup, separate from schema creation and GitHub Actions.
-- [PROTOCOL]: Update this header when making changes, then check README.md.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'Enable and verify Supabase Cron before installing sync cleanup';
  end if;
end $$;
select cron.schedule('goalloom-sync-runtime-cleanup', '*/5 * * * *',
  'set statement_timeout = ''5s''; select public.cleanup_sync_runtime(5000)');
select jobid, jobname, schedule, active from cron.job where jobname = 'goalloom-sync-runtime-cleanup';
