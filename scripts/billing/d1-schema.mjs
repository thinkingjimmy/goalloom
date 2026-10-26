/**
 * [INPUT]: Forward D1 SQL and read-only development schema metadata.
 * [OUTPUT]: Ordered pending deltas and exact reviewed function/ACL/policy fingerprints.
 * [POS]: D1-only schema attestation; no old migration baseline, production access or data mutation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
export const d1Files=['0018_service_admission.sql','0019_ai_service_admission.sql','0020_billing_continuation.sql','0021_billing_operation_alias.sql','0022_billing_rejected_intent.sql','0023_bounded_pull.sql','0024_billing_operation_resolution.sql']
export async function d1Migrations(db){
 const exists=(await db.query("select to_regclass('service_private.migrations') is not null as present"))[0].present
 const history=exists?await db.query('select version,sha256 from service_private.migrations order by version'):[]
 assert(history.every(x=>d1Files.some(name=>name.startsWith(x.version+'_'))),'Unknown D1 migration history')
 const result=[]
 for(const file of d1Files){const sql=await readFile(`supabase/migrations/${file}`,'utf8'),sha256=createHash('sha256').update(sql).digest('hex'),prior=history.find(x=>file.startsWith(x.version+'_'));if(prior)assert.equal(prior.sha256,sha256,`Applied D1 source drift: ${file}`);result.push({file,sql,sha256,installed:!!prior})}
 assert(result.every((x,i)=>!x.installed||result.slice(0,i).every(y=>y.installed)),'Out-of-order D1 history')
 return result
}
export const schemaSnapshotSql=`select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'body',md5(p.prosrc),'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile,'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute')) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='service_private' or n.nspname='public' and p.proname in ('sync_entitled','billing_now','billing_commit','register_device','rebind_device','bootstrap_workspace','create_new_workspace','list_account','get_sync_status','push_ops','pull_ops','receipts_for','commit_roster','rotate_epoch','start_recovery','complete_recovery','regenerate_recovery','get_latest_checkpoint','get_roster','get_key_envelopes','put_key_envelopes','snapshot_access','snapshot_transfer_access','revoke_device','reset_sync','realtime_can_read','ai_service_status','ai_admit','service_continuation','service_operation_alias','service_reject_operation','service_resolve_operation')),
 'policies',(select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check) order by schemaname,tablename,policyname) from pg_policies where schemaname='service_private' or schemaname='realtime' and tablename='messages'),
 'privateSchemaUsage',has_schema_privilege('authenticated','service_private','usage'),
 'privateTableAccess',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'anonSelect',has_table_privilege('anon',c.oid,'select'),'authenticatedSelect',has_table_privilege('authenticated',c.oid,'select'),'authenticatedInsert',has_table_privilege('authenticated',c.oid,'insert'),'authenticatedUpdate',has_table_privilege('authenticated',c.oid,'update'),'authenticatedDelete',has_table_privilege('authenticated',c.oid,'delete')) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='service_private' and c.relkind='r'),
 'deviceVersion',(select is_nullable='NO' and data_type='integer' from information_schema.columns where table_schema='public' and table_name='devices' and column_name='service_version')) as schema_snapshot;`
export async function d1Snapshot(db){return (await db.query(schemaSnapshotSql))[0].schema_snapshot}
export function sameMigrations(report,migrations){return report.migrations.length===migrations.length&&report.migrations.every((x,i)=>x.file===migrations[i].file&&x.sha256===migrations[i].sha256)}
