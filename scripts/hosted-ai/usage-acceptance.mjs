/**
 * [INPUT]: The real read-only reporting CLI and controlled Management API metadata.
 * [OUTPUT]: Repeatable process-level evidence for UTC, permissions, missing fees, incomplete records and redaction.
 * [POS]: Reporting E2E. Synthetic credentials/rows remain isolated in a temporary private directory.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
const dir=await mkdtemp(join(tmpdir(),'hosted-usage-')),out=resolve('output/tests/hosted-ai')
await mkdir(out,{recursive:true})
const config=join(dir,'config.env'),fixture=join(dir,'fetch.mjs'),result=join(dir,'usage.json')
const user='11111111-1111-4111-8111-111111111111'
await writeFile(config,'SUPABASE_PROJECT_REF=asqyvcnxdltzzfutbbqy\nSUPABASE_ACCESS_TOKEN=synthetic-private-token\n',{mode:0o600})
await writeFile(fixture,`import assert from 'node:assert/strict';let dropped=false;
globalThis.fetch=async(url,init)=>{
 assert.equal(new URL(url).pathname,'/v1/projects/asqyvcnxdltzzfutbbqy/database/query');
 const body=JSON.parse(init.body);assert.equal(body.read_only,true);assert(/^select /i.test(body.query));
 assert(!/insert|update|delete|truncate|alter|drop|grant/i.test(body.query));
 if(process.env.USAGE_FIXTURE==='flaky'&&!dropped){dropped=true;throw new TypeError('fetch failed')}
 if(process.env.USAGE_FIXTURE==='unavailable')throw new TypeError('fetch failed');
 if(process.env.USAGE_FIXTURE==='denied')return new Response('{}',{status:403});
 const sql=body.query;
 let rows;
 if(sql.includes('from public.ai_actions')){
  assert(sql.includes("environment='development'"));assert(sql.includes("created_at>='2026-10-22T00:00:00.000Z'"));assert(sql.includes("created_at<'2026-10-23T00:00:00.000Z'"));
  rows=sql.includes('count(*)')?[{total:process.env.USAGE_FIXTURE==='truncated'?'3':process.env.USAGE_FIXTURE==='empty'?'0':'2'}]:process.env.USAGE_FIXTURE==='empty'?[]:[
   {user_id:'${user}',capability:'evaluate',environment:'development',eligibility:'authenticated',status:'failed',confirmed:true,input_tokens:20,output_tokens:0,charged_micro:123},
   {user_id:'${user}',capability:'review',environment:'development',eligibility:'authenticated',status:'unknown',confirmed:false,input_tokens:null,output_tokens:null,charged_micro:500000}];
 }else if(sql.includes('ai_limit_events'))rows=[{reason:'account_rate',count:2}];else rows=[{limit_micro:10000000,spent_micro:500123,environment:'development',blocked:false}];
 return new Response(JSON.stringify(rows),{headers:{'content-type':'application/json'}});
};`)
const args=['--import',fixture,'scripts/hosted-ai/usage.mjs','--config',config,'--from','2026-10-22','--to','2026-10-23','--environment','development','--json',result]
const run=(mode,extra=[])=>{try{return {code:0,output:execFileSync(process.execPath,[...args,...extra],{encoding:'utf8',env:{...process.env,USAGE_FIXTURE:mode},stdio:['ignore','pipe','pipe']})}}catch(error){return {code:error.status,output:String(error.stdout)+String(error.stderr)}}}
const report={ok:false,checks:[],scope:'Real reporting CLI subprocess with controlled read-only metadata HTTP; no real account data or writes.'}
try{
 const first=run('normal');assert.equal(first.code,0)
 const parsed=JSON.parse(await readFile(result,'utf8'));assert.equal(parsed.completeness,'incomplete');assert.equal(parsed.totals.calls,2);assert.equal(parsed.totals.confirmedMicro,123);assert.equal(parsed.totals.unresolvedMicro,500000);assert.equal(parsed.totals.missingTokens,1)
 assert(!first.output.includes(user));assert(!first.output.includes('synthetic-private-token'));report.checks.push('UTC exclusive bounds, environment, missing tokens/fees and pseudonymous account output')
 const second=run('normal');assert.equal(second.output,first.output);report.checks.push('Repeated report is stable and every request is a read-only SELECT')
 assert.equal(run('flaky').code,0);assert.equal(run('unavailable').code,1);report.checks.push('A transient metadata transport failure recovers through bounded read-only retry; persistent failure stays explicit')
 assert.equal(run('denied').code,1);assert(run('denied').output.includes('not confirmed zero'));report.checks.push('Denied metadata access fails explicitly without confirmed zero totals')
 assert.equal(run('empty').code,0);assert.equal(JSON.parse(await readFile(result,'utf8')).completeness,'no_records')
 assert.equal(run('truncated').code,0);assert.equal(JSON.parse(await readFile(result,'utf8')).expectedRecords,3);assert.equal(JSON.parse(await readFile(result,'utf8')).completeness,'incomplete');report.checks.push('Empty and truncated records stay distinct from confirmed zero usage')
 assert.equal(run('normal',['--from','2026-02-31']).code,1)
 assert.equal(run('normal',['--environment','production']).code,1);report.checks.push('Invalid UTC dates and environment/config mismatches reject before querying')
 report.ok=true
}catch(error){report.error=error.stack;process.exitCode=1}
finally{await rm(dir,{recursive:true,force:true});await writeFile(join(out,'usage-acceptance.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))}
