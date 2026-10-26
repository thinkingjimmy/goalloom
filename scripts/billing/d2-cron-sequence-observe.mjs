/**
 * [INPUT]: Root-authorized read-only development window and the preserved failed final rollback report.
 * [OUTPUT]: Sequence definition/dependency and bounded cron-run aggregates, without command bodies or resets.
 * [POS]: Focused cron.runid_seq diagnosis; no runtime-exception or baseline change.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {client,developmentRef} from '../hosted-ai/client.mjs'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const attempt='output/tests/billing/desktop/d2-final-sql/attempts/2ac67c90-09d2-4adc-8597-e1e4d16a70db.json'
const previous=JSON.parse(await readFile(attempt,'utf8')),db=await client()
const definition=await db.query(`select n.nspname,c.relname,c.relkind,c.relpersistence,pg_get_userbyid(c.relowner) as owner,
 s.seqstart,s.seqincrement,s.seqmin,s.seqmax,s.seqcache,s.seqcycle,
 (select e.extname||':'||e.extversion from pg_depend d join pg_extension e on e.oid=d.refobjid
  where d.classid='pg_class'::regclass and d.objid=c.oid and d.refclassid='pg_extension'::regclass and d.deptype='e') as extension_member,
 pg_get_serial_sequence('cron.job_run_details','runid') as column_owned_sequence
 from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_sequence s on s.seqrelid=c.oid where n.nspname='cron' and c.relname='runid_seq'`)
const dependencies=await db.query(`select d.deptype,pg_describe_object(d.classid,d.objid,d.objsubid) as dependent,
 pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) as referenced from pg_depend d
 where (d.classid='pg_class'::regclass and d.objid='cron.runid_seq'::regclass)
  or (d.refclassid='pg_class'::regclass and d.refobjid='cron.runid_seq'::regclass) order by dependent,referenced,deptype`)
const defaults=await db.query(`select a.attname,pg_get_expr(d.adbin,d.adrelid) as default_expression
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
 where a.attrelid='cron.job_run_details'::regclass and a.attname='runid' and not a.attisdropped`)
const runs=await db.query(`select jobid,status,count(*)::int as runs,min(runid) as first_run_id,max(runid) as last_run_id,
 min(start_time) as first_started_at,max(start_time) as last_started_at,max(end_time) as last_ended_at
 from cron.job_run_details where start_time between '${previous.database.serverTime}'::timestamptz-interval '10 seconds'
  and '${previous.database.serverTime}'::timestamptz+interval '10 seconds' group by jobid,status order by jobid,status`)
const current=await db.query('select clock_timestamp() as observed_at,last_value,is_called from cron.runid_seq')
const report={version:1,project:developmentRef,readOnly:true,remoteWrites:0,readRequests:5,attempt:{path:attempt,sha256:sha(await readFile(attempt)),rollbackVerified:previous.rollbackVerified},
 definition,dependencies,defaults,runs,current,scope:'Exact cron sequence metadata and aggregate runs around the failed gate. No command/return-message payload, Secret, user body, nextval, setval, reset or exception-policy change.',
 limitation:'Correlation and metadata only; extension source must establish allocator behavior. The original failed report remains unchanged and false.'}
const bytes=JSON.stringify(report,null,2)+'\n',directory='output/tests/billing/desktop/d2-deployment/cron-sequence',path=`${directory}/${sha(bytes)}.json`
await mkdir(directory,{recursive:true});await writeFile(path,bytes,{flag:'wx',mode:0o600})
console.log(JSON.stringify({path,sha256:sha(bytes),...report},null,2))
