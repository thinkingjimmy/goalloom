/**
 * [INPUT]: Fresh fixed-development catalog proof for the exact pg_cron 1.6.4 log sequence.
 * [OUTPUT]: A separately observed counter only when exact extension/default/dependency guards pass.
 * [POS]: Approved final-gate runtime exception. Definitions/ACL/owner/parameters remain in stable catalog scope.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
export const CRON_RUNTIME_TAG='pg_cron:1.6.4/cron.job_run_details.runid'
export const cronRuntimeProofSql=`select jsonb_build_object(
 'name','cron.runid_seq','extension','pg_cron','extensionVersion',e.extversion,
 'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'persistence',c.relpersistence,
 'type',format_type(s.seqtypid,null),'start',s.seqstart,'increment',s.seqincrement,'min',s.seqmin,'max',s.seqmax,'cache',s.seqcache,'cycle',s.seqcycle,
 'default',pg_get_expr(ad.adbin,ad.adrelid),
 'verified',c.relkind='S' and e.extname='pg_cron' and e.extversion='1.6.4'
  and ad.adrelid='cron.job_run_details'::regclass and a.attname='runid' and pg_get_expr(ad.adbin,ad.adrelid)='nextval(''cron.runid_seq''::regclass)'
  and (select count(*) from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid)=2
  and exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.refclassid='pg_namespace'::regclass and d.refobjid=n.oid and d.deptype='n')
  and (select count(*) from pg_depend d where d.refclassid='pg_class'::regclass and d.refobjid=c.oid)=1
  and exists(select 1 from pg_depend d where d.refclassid='pg_class'::regclass and d.refobjid=c.oid and d.classid='pg_attrdef'::regclass and d.objid=ad.oid and d.deptype='n')
  and pg_get_serial_sequence('cron.job_run_details','runid') is null) as proof
 from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_sequence s on s.seqrelid=c.oid
 join pg_depend member on member.classid='pg_class'::regclass and member.objid=c.oid and member.refclassid='pg_extension'::regclass and member.deptype='e'
 join pg_extension e on e.oid=member.refobjid
 join pg_attrdef ad on ad.adrelid='cron.job_run_details'::regclass
 join pg_attribute a on a.attrelid=ad.adrelid and a.attnum=ad.adnum and a.attname='runid'
 where n.nspname='cron' and c.relname='runid_seq';`
export async function attestCronRuntimeInventory(db,tables){
 const rows=await db.query(cronRuntimeProofSql)
 assert(rows.length===1&&rows[0].proof?.verified===true,'Exact pg_cron runtime-sequence proof failed')
 const matches=tables.filter(t=>t.schema==='cron'&&t.name==='runid_seq')
 assert(matches.length===1&&matches[0].kind==='S'&&matches[0].owned_by===null,'Runtime sequence inventory/ownership drift')
 const counters=await db.query('select last_value,is_called from cron.runid_seq')
 assert(counters.length===1,'Runtime sequence counter unavailable')
 return {tables:tables.map(t=>t===matches[0]?{...t,runtime_sequence:CRON_RUNTIME_TAG}:t),proof:rows[0].proof,observations:{name:'cron.runid_seq',...counters[0]}}
}
