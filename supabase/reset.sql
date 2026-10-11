-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- Licensed under the GNU Affero General Public License v3.0 only.
-- The full text is supabase/LICENSE.
--
-- Reset Goalloom rows on the dedicated test project asqyvcnxdltzzfutbbqy.
-- Deletes test auth users (email ending in @goalloom.test) and their cascaded
-- devices, workspaces, ops and receipts. Does not drop schemas, extensions,
-- storage buckets, or any other auth user.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/reset.sql

begin;

delete from public.control_events;
delete from public.rpc_buckets;
delete from public.op_blobs;
delete from public.snapshots;
delete from public.op_receipts;
delete from public.ops;
delete from public.recovery_checkpoints;
delete from public.recovery_challenges;
delete from public.pairing_requests;
delete from public.key_envelopes;
delete from public.device_roster;
delete from public.workspaces;
delete from public.devices;

do $$ begin
  if pg_catalog.to_regclass('public.entitlements') is not null then
    delete from public.entitlements e
     using auth.users u
     where e.user_id = u.id and u.email like '%@goalloom.test';
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'objects'
  ) then
    delete from storage.objects
     where bucket_id = 'snapshots' and name like 'workspaces/%';
  end if;
end $$;

delete from auth.users where email like '%@goalloom.test';

commit;
