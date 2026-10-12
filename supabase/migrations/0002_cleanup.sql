-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- Licensed under the GNU Affero General Public License v3.0 only.
-- The full text is supabase/LICENSE.
--
-- Device foreign keys cascade so deleting an auth user can delete devices
-- even when workspace-owned rows still point at them. Hosted Storage rejects
-- DELETE on storage.objects; snapshot files are removed by scripts/supabase-reset.mjs.
-- Private Realtime channels need both select and insert policies.

alter table public.ops drop constraint if exists ops_device_id_fkey;
alter table public.ops
  add constraint ops_device_id_fkey foreign key (device_id) references public.devices (id) on delete cascade;

alter table public.device_roster drop constraint if exists device_roster_signer_device_fkey;
alter table public.device_roster
  add constraint device_roster_signer_device_fkey foreign key (signer_device) references public.devices (id) on delete cascade;

alter table public.key_envelopes drop constraint if exists key_envelopes_signer_device_fkey;
alter table public.key_envelopes
  add constraint key_envelopes_signer_device_fkey foreign key (signer_device) references public.devices (id) on delete cascade;

alter table public.pairing_requests drop constraint if exists pairing_requests_new_device_fkey;
alter table public.pairing_requests
  add constraint pairing_requests_new_device_fkey foreign key (new_device) references public.devices (id) on delete cascade;

alter table public.pairing_requests drop constraint if exists pairing_requests_approved_by_fkey;
alter table public.pairing_requests
  add constraint pairing_requests_approved_by_fkey foreign key (approved_by) references public.devices (id) on delete cascade;

alter table public.recovery_challenges drop constraint if exists recovery_challenges_device_id_fkey;
alter table public.recovery_challenges
  add constraint recovery_challenges_device_id_fkey foreign key (device_id) references public.devices (id) on delete cascade;

alter table public.recovery_checkpoints drop constraint if exists recovery_checkpoints_dev_signer_fkey;
alter table public.recovery_checkpoints
  add constraint recovery_checkpoints_dev_signer_fkey foreign key (dev_signer) references public.devices (id) on delete cascade;

alter table public.snapshots drop constraint if exists snapshots_created_by_fkey;
alter table public.snapshots
  add constraint snapshots_created_by_fkey foreign key (created_by) references public.devices (id) on delete cascade;

do $$ begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime' and c.relname = 'messages'
  ) then
    execute 'drop policy if exists "ws topic read" on realtime.messages';
    execute 'drop policy if exists "ws topic write" on realtime.messages';
    execute 'create policy "ws topic read" on realtime.messages for select to authenticated using ((select public.realtime_can_read(realtime.topic())))';
    execute 'create policy "ws topic write" on realtime.messages for insert to authenticated with check ((select public.realtime_can_read(realtime.topic())))';
  end if;
end $$;
