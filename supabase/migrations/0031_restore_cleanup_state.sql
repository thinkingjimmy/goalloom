-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Exact installed0028 scoped delete_batch body and its existing lease/revision/intent gates.
-- OUTPUT: Replayed queued generations enter deleting while preserving the original destructive start and deadlines.
-- POS: Forward0031 body-only correction. No original rows, policy, scope, ACL or historical migration rewrite.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

do $restore_cleanup_state$
declare fn record;observed record;updated text;definition text;
 old_fragment text:=$old$ if row.destructive_started_at is null then
  update service_private.workspace_lifecycle set state='deleting',destructive_started_at=now_at where environment=p_environment and workspace_id=p_workspace;$old$;
 new_fragment text:=$new$ if row.state='queued' or row.destructive_started_at is null then
  update service_private.workspace_lifecycle set state='deleting',destructive_started_at=coalesce(destructive_started_at,now_at) where environment=p_environment and workspace_id=p_workspace;$new$;
begin
 select p.oid,p.prosrc,to_jsonb(p)-'prosrc' as contract into strict fn from pg_catalog.pg_proc p
  where p.oid='public.lifecycle_delete_batch(text,uuid,uuid,bigint,uuid)'::regprocedure;
 if encode(pg_catalog.sha256(convert_to(fn.prosrc,'UTF8')),'hex')<>'461d8de61bcff90a9a8e044592ee1ecd2c95da9b15eb0688358ecd0f622be9fe'
  or (length(fn.prosrc)-length(replace(fn.prosrc,old_fragment,'')))/length(old_fragment)<>1 then
  raise exception 'restore_cleanup_migration_contract';
 end if;
 updated:=replace(fn.prosrc,old_fragment,new_fragment);
 if encode(pg_catalog.sha256(convert_to(updated,'UTF8')),'hex')<>'2ba7ec5ad34de7fd64942f5a54afc94f2f0757e0cbea54e2ec24d0b02aff5d0b' then
  raise exception 'restore_cleanup_migration_contract';
 end if;
 -- Use the actual wrapped definition so both0028 scope checks and every function attribute survive.
 definition:=pg_catalog.pg_get_functiondef(fn.oid);
 execute replace(definition,fn.prosrc,updated);
 select p.prosrc,to_jsonb(p)-'prosrc' as contract into strict observed from pg_catalog.pg_proc p where p.oid=fn.oid;
 if observed.contract is distinct from fn.contract or observed.prosrc is distinct from updated then
  raise exception 'restore_cleanup_migration_contract';
 end if;
end $restore_cleanup_state$;
