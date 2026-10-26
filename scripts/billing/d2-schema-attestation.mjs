/**
 * [INPUT]: Installed D2 public/private schema and the existing bounded metadata hashing conventions.
 * [OUTPUT]: OID-independent function/config/ACL/RLS/schema hashes and exact closed-readiness metadata.
 * [POS]: Read-only seam shared by final rollback evidence and persistent installation readback.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {LIMITS} from './d2-populated-gate.mjs'
import {literal as q} from './d1-sync-fixtures.mjs'
const hash=expression=>`encode(pg_catalog.sha256(convert_to((${expression})::text,'UTF8')),'hex')`
const noSemi=sql=>sql.trim().replace(/;$/,'')
export const defaultReadinessSql=`select jsonb_build_object('enabled',p.enabled,'independentLedgerReady',p.independent_ledger_ready,
 'restoreAdmissionReady',p.restore_admission_ready,'cleanupWiringReady',p.cleanup_wiring_ready,'restoreBlocked',p.restore_blocked,
 'drainVerified',(select verified from service_private.transfer_drain_policy where id=1),
 'developmentRequiresScope',(select development_requires_scope from service_private.worker_access where id=1)) as readiness
 from service_private.lifecycle_policy p where id=1;`
export const CLOSED_DEFAULTS={enabled:false,independentLedgerReady:false,restoreAdmissionReady:false,cleanupWiringReady:false,restoreBlocked:false,drainVerified:false,developmentRequiresScope:true}
const metadataRows=sql=>`(select jsonb_build_object('rows',count(*),'capped',count(*)>${LIMITS.maxRowsPerRelation},'sha256',${hash("coalesce(string_agg(h,'' order by h),'')")})
 from (select ${hash('body')} h from (${sql} limit ${LIMITS.maxRowsPerRelation+1}) bounded) digests)`
const objectScope="n.nspname in ('public','service_private')"
const schemaParts=[
 ['schemas',"select jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) body from pg_namespace where nspname in ('public','service_private')"],
 ['functions',`select jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),
  'definition',${hash('pg_get_functiondef(p.oid)')},'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definer',p.prosecdef,'config',p.proconfig,
  'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute')) body
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${objectScope} and p.prokind in ('f','p','w')`],
 ['relations',`select jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity) body
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where ${objectScope} and c.relkind in ('r','p','v','m','S')`],
 ['columns',`select jsonb_build_object('schema',n.nspname,'table',c.relname,'name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),
  'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl::text) body
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where ${objectScope} and c.relkind in ('r','p','v','m','S') and a.attnum>0 and not a.attisdropped`],
 ['constraints',`select jsonb_build_object('schema',n.nspname,'table',r.relname,'name',c.conname,'definition',pg_get_constraintdef(c.oid,true),'validated',c.convalidated,'deferrable',c.condeferrable,'deferred',c.condeferred) body
  from pg_constraint c join pg_namespace n on n.oid=c.connamespace left join pg_class r on r.oid=c.conrelid where ${objectScope}`],
 ['indexes',`select jsonb_build_object('schema',n.nspname,'name',c.relname,'definition',pg_get_indexdef(c.oid),'valid',i.indisvalid,'ready',i.indisready) body
  from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where ${objectScope}`],
 ['triggers',`select jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)) body
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where ${objectScope} and not t.tgisinternal`],
 ['policies',"select to_jsonb(p) body from pg_policies p where schemaname in ('public','service_private')"],
]
export const schemaAttestationScope='OID-independent public/service_private function definitions/config/ACL, schema/table/column/index/constraint/user-trigger definitions and RLS policies; readiness/pause configuration only. Not other schemas, all data, transport retirement or an external-system attestation.'
export const normalizedSchemaSql=`select jsonb_build_object('version',1,'scope',${q(schemaAttestationScope)},
 ${schemaParts.map(([name,sql])=>`${q(name)},${metadataRows(sql)}`).join(',')},
 'configuration',jsonb_build_object('readiness',(select readiness from (${noSemi(defaultReadinessSql)}) r),
 'service',(select jsonb_build_object('environment',environment,'projectRef',project_ref,'enabled',enabled,'minServiceVersion',min_service_version,'sourceFingerprint',source_fingerprint) from service_private.policy where id=1))) as schema_attestation;`
