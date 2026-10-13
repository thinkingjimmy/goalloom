-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- Licensed under the GNU Affero General Public License v3.0 only.
-- The full text is supabase/LICENSE.
--
-- Forgot-password reset. The password lock cannot be opened, so the cloud
-- ciphertext stays unreadable. A device that still has the local board
-- deletes this account's workspace and uploads a new one.
-- 0001–0006 stay as applied. This file is not deployed by the client.
-- It does not change sync_entitled.

create or replace function public.reset_sync(p_device uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._device_guard(p_device, true);
  delete from public.workspaces where user_id = auth.uid();
end $$;

revoke execute on function public.reset_sync(uuid) from public, anon, authenticated;
grant execute on function public.reset_sync(uuid) to authenticated;
