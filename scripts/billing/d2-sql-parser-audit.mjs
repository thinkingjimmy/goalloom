/**
 * [INPUT]: Frozen lifecycle manifest, retrieval harness and pinned local pglast 6.17 installation.
 * [OUTPUT]: Immutable grammar audit with exact input/parser dependency hashes; no SQL text or fixture seeds.
 * [POS]: Local preparation for the populated rollback gate; no database, catalog/type or runtime acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {sqlGrammarProgram as program} from './d2-sql-grammar.mjs'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {buildRetrievalSql,retrievalAuditInputs} from './d2-retrieval-sql-acceptance.mjs'
import {gateSql,businessSql,catalogSql,safetySql,inventorySql,TOUCHED_OLD_TABLES} from './d2-populated-gate.mjs'
import {sha} from './d2-retrieval-fixtures.mjs'

const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
const input=await retrievalAuditInputs({lifecycleManifestPath:flag('--lifecycle-manifest')})
const migrations=input.migrations.map(({content,...m})=>({...m,sql:content.toString('utf8')}))
const prepared=buildRetrievalSql(migrations)
// Representative inventory covers every projection branch. Actual inventory and
// catalog/type correctness remain fail-closed checks for the leased PG gate.
const tables=TOUCHED_OLD_TABLES.map(name=>{const [schema,table]=name.split('.');return {schema,name:table,kind:'r',columns:['id','environment','user_id','enabled','min_service_version']}})
tables.push({schema:'vault',name:'secrets',kind:'r',columns:['id','secret']},...['cron.job','cron.job_run_details','net.http_request_queue','net._http_response'].map(name=>{const [schema,table]=name.split('.');return {schema,name:table,kind:'r',columns:['id']}}),
 {schema:'public',name:'control_events_id_seq',kind:'S',columns:[],owned_by:'public.control_events'},
 {schema:'net',name:'http_request_queue_id_seq',kind:'S',columns:[],owned_by:'net.http_request_queue'})
const sqlInputs=[...migrations.map(m=>({name:m.file,sql:m.sql})),
 {name:'rollback-gate',sql:gateSql({migrations,prepared,tables,applicationName:'d2-rollback:00000000-0000-4000-8000-000000000000'})},
 ...['retrievalSql','populatedSql','vectorSql','resultSql'].map(name=>({name,sql:prepared[name]})),
 {name:'inventory',sql:inventorySql},{name:'catalog',sql:catalogSql},{name:'safety',sql:safetySql},
 {name:'business-original',sql:businessSql(tables)},{name:'business-normalized',sql:businessSql(tables,{normalizePolicy:true})},{name:'business-forward',sql:businessSql(tables,{forward:true})}]
const python=flag('--python')??'/Applications/Xcode.app/Contents/Developer/usr/bin/python3'
const parserRoot=flag('--parser-root')??'/private/tmp/goalloom-d2-sql-parser'

const result=spawnSync(python,['-c',program,parserRoot],{input:JSON.stringify({sqlInputs}),encoding:'utf8',maxBuffer:16*1024*1024,timeout:60000})
assert(result.status===0&&!result.error,'Local pinned parser failed; no database action was attempted')
const parsed=JSON.parse(result.stdout),audit={version:1,scope:'SQL and PL/pgSQL grammar only',remoteExecuted:false,networkRequests:0,
 inputs:{migrations:input.migrations.map(({file,sha256,bytes})=>({file,sha256,bytes})),sources:input.sources,d1Baseline:input.d1Baseline,lifecycleManifest:input.lifecycleManifest},
 ...parsed,scenarioCount:prepared.checks.length,limitations:['No PostgreSQL connection or execution.','Grammar does not establish catalog/type/ACL correctness or actual rollback.','Original installed prosrc substitutions require actual populated PostgreSQL validation.','Generated fixture SQL hashes identify this audit only; fresh fixture signing seeds are not persisted.','Representative relation inventory exercises SQL projection branches; runtime inventory and row caps remain database gates.']}
const bytes=JSON.stringify(audit,null,2)+'\n',hash=sha(bytes),directory='output/tests/billing/desktop/d2-retrieval/parser-audits',path=directory+'/'+hash+'.json'
await mkdir(directory,{recursive:true})
try{await writeFile(path,bytes,{flag:'wx'})}catch(error){if(error.code!=='EEXIST')throw error;assert((await readFile(path,'utf8'))===bytes,'Immutable audit differs')}
console.log(JSON.stringify({ok:audit.ok,remoteExecuted:false,path,sha256:hash,parser:audit.parser,reports:audit.reports.length,checks:audit.scenarioCount,failures:audit.reports.filter(r=>r.errors.length).map(r=>({name:r.name,errors:r.errors}))}))
if(!audit.ok)process.exitCode=1
