-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Exact installed generation_view body and original workspace lifecycle/initialization contracts.
-- OUTPUT: Deleted generations expose initialization.state=not_applicable without reading initialization.
-- POS: Forward0032 body-only candidate. Non-deleted guards, fields, purge and historical migrations stay unchanged.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

do $deleted_generation_status$
declare fn record;observed record;updated text;definition text;
 old_fragment text:=$old$ if p_row.seed_required then$old$;
 new_fragment text:=$new$ if p_row.state='deleted' then
  initialization:='{"state":"not_applicable"}'::jsonb;
 elsif p_row.seed_required then$new$;
begin
 select p.oid,p.prosrc,to_jsonb(p)-'prosrc' as contract into strict fn from pg_catalog.pg_proc p
  where p.oid='service_private.generation_view(service_private.workspace_lifecycle,timestamp with time zone)'::regprocedure;
 if encode(pg_catalog.sha256(convert_to(fn.prosrc,'UTF8')),'hex')<>'1f4946f6dbefe5795345bbfbd81489c90e42529d1fc9024018a6f00275a93988'
  or fn.contract->>'provolatile'<>'s' or fn.contract->>'prosecdef'<>'true'
  or (length(fn.prosrc)-length(replace(fn.prosrc,old_fragment,'')))/length(old_fragment)<>1 then
  raise exception 'deleted_generation_migration_contract';
 end if;
 updated:=replace(fn.prosrc,old_fragment,new_fragment);
 if encode(pg_catalog.sha256(convert_to(updated,'UTF8')),'hex')<>'bd3a66e2fdb8ca893eb96ec0bcac238d0152a445c07b71a51fe1c484afea5c0d' then
  raise exception 'deleted_generation_migration_contract';
 end if;
 definition:=pg_catalog.pg_get_functiondef(fn.oid);
 execute replace(definition,fn.prosrc,updated);
 select p.prosrc,to_jsonb(p)-'prosrc' as contract into strict observed from pg_catalog.pg_proc p where p.oid=fn.oid;
 if observed.contract is distinct from fn.contract or observed.prosrc is distinct from updated then
  raise exception 'deleted_generation_migration_contract';
 end if;
end $deleted_generation_status$;
