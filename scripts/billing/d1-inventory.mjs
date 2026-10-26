/**
 * [INPUT]: Checked-in sync migrations and optional read-only development catalog access.
 * [OUTPUT]: D1 RPC/ACL/RLS/Storage/Realtime surface inventory without user content or credentials.
 * [POS]: Pre-implementation security map; no deployment, fixture writes or production access.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {client,developmentRef} from '../hosted-ai/client.mjs'
const mode=process.argv[2]??'--source';assert(['--source','--development'].includes(mode))
const directory='output/tests/billing/desktop/d1-backend';await mkdir(directory,{recursive:true})
const ordinary=['register_device','bootstrap_workspace','create_new_workspace','list_account','get_sync_status','push_ops','pull_ops','commit_roster','rotate_epoch','start_recovery','complete_recovery','regenerate_recovery','get_latest_checkpoint','get_roster','get_key_envelopes','put_key_envelopes','snapshot_access']
const privacy=['rebind_device','revoke_device','reset_sync'],receipt=['receipts_for'],realtime=['realtime_can_read']
const map=new Map()
for(const file of (await readdir('supabase/migrations')).filter(x=>/^000[1-9]_.*\.sql$/.test(x)).sort()){
 const source=await readFile(`supabase/migrations/${file}`,'utf8')
 for(const match of source.matchAll(/create (?:or replace )?function public\.([a-z_]+)\(([\s\S]*?)\)\s*(returns[\s\S]*?)as \$\$([\s\S]*?)\$\$;/gi))map.set(match[1],{name:match[1],file,definitionHash:createHash('sha256').update(match[0]).digest('hex'),body:match[4]})
}
const names=[...ordinary,...privacy,...receipt,...realtime]
assert.equal(new Set(names).size,22);assert(names.every(name=>map.has(name)),'Missing source RPC definition')
const report={mode,project:mode==='--development'?developmentRef:null,remoteMutation:false,productionAccess:false,scopes:{ordinary,privacy,receipt,realtime},source:names.map(name=>{const value=map.get(name);return {name,file:value.file,definitionHash:value.definitionHash,legacyEntitlementCall:/sync_entitled\(/.test(value.body),deviceGuard:/_device_guard\(/.test(value.body),references:[...new Set([...value.body.matchAll(/public\.([a-z_]+)\(/g)].map(x=>x[1]))]}})}
if(mode==='--development'){
 const db=await client()
 const installed=(await db.query("select to_regclass('service_private.policy') is not null as installed"))[0].installed
 const runtimeNames=installed?[...names,'snapshot_transfer_access']:names
 report.d1Installed=installed
 report.catalog=await db.query(`select p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,pg_get_function_result(p.oid) as result,p.prosecdef as definer,p.provolatile as volatility,has_function_privilege('anon',p.oid,'execute') as anon_execute,has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,md5(p.prosrc) as body_md5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${runtimeNames.map(x=>`'${x}'`).join(',')}) order by p.proname`)
 report.tableGrants=await db.query("select table_schema,table_name,privilege_type,grantee from information_schema.table_privileges where grantee in ('PUBLIC','anon','authenticated') and table_schema in ('public','storage','realtime') order by table_schema,table_name,grantee,privilege_type")
 report.additionalDefiners=await db.query(`select p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'execute') and p.proname not in (${runtimeNames.map(x=>`'${x}'`).join(',')}) order by p.proname`)
 report.tableAccess=await db.query("select n.nspname as schema,c.relname as name,c.relrowsecurity as rls,c.relforcerowsecurity as forced,has_table_privilege('authenticated',c.oid,'select') as authenticated_select,has_table_privilege('authenticated',c.oid,'insert') as authenticated_insert,has_table_privilege('anon',c.oid,'select') as anon_select from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and (n.nspname='public' or n.nspname='storage' and c.relname='objects' or n.nspname='realtime' and c.relname='messages') order by n.nspname,c.relname")
 report.policies=await db.query("select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage','realtime') order by schemaname,tablename,policyname")
 report.snapshotsBucket=await db.query("select id,public from storage.buckets where id='snapshots'")
 report.publications=await db.query("select pubname,schemaname,tablename from pg_publication_tables where schemaname='public' order by pubname,tablename")
 assert.equal(report.catalog.length,installed?24:22,'Unexpected sync RPC overload or missing entry')
}
await writeFile(`${directory}/surface-inventory${mode==='--development'?'-development':''}.json`,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({mode,ordinary:ordinary.length,privacy:privacy.length,receipt:receipt.length,realtime:realtime.length,remoteMutation:false,catalogCount:report.catalog?.length},null,2))
