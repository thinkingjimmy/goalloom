-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Authenticated version1 service request and a finite pull page size.
-- OUTPUT: Bounded ordinary encrypted-operation pages; SQL NULL cannot remove the limit.
-- POS: D1 public admission correction; private cryptographic/read implementation remains unchanged.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create or replace function public.pull_ops(p_workspace uuid,p_device uuid,p_after bigint,p_limit integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 perform service_private.require_access();
 if p_limit is null or p_limit<1 or p_limit>200 then raise exception 'bad limit' using errcode='22023';end if;
 return service_private.pull_ops(p_workspace,p_device,p_after,p_limit);
exception when insufficient_privilege then
 if sqlerrm in ('sync not entitled','not entitled') then
  perform service_private.require_access();raise exception 'billing_configuration' using errcode='PT503';
 else raise;end if;
end $$;
revoke all on function public.pull_ops(uuid,uuid,bigint,integer) from public,anon;
grant execute on function public.pull_ops(uuid,uuid,bigint,integer) to authenticated;
notify pgrst,'reload schema';
