/**
 * [INPUT]: Exact final migration/probe sources and the shared pinned pglast grammar program.
 * [OUTPUT]: Immutable local syntax audit with source/dependency hashes; never SQL text or signing seeds.
 * [POS]: Final D2 rollback preparation; no PostgreSQL, catalog/type or concurrency acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {FINAL_DIRECTORY,finalInputs,buildFinalPrepared,auditIdentity,immutable} from './d2-final-sql-acceptance.mjs'
import {sqlGrammarProgram} from './d2-sql-grammar.mjs'
import {gateSql,businessSql,catalogSql,safetySql,inventorySql,TOUCHED_OLD_TABLES} from './d2-populated-gate.mjs'
import {sha,retrievalFixture} from './d2-retrieval-fixtures.mjs'
import {RACE_CASES,buildRetrievalRace} from './d2-retrieval-concurrency.mjs'
import {cronRuntimeProofSql} from './d2-cron-runtime.mjs'

const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
const input=await finalInputs(),migrations=input.migrations.map(({content,...m})=>({...m,sql:content.toString('utf8')}))
const prepared=buildFinalPrepared(migrations)
const tables=TOUCHED_OLD_TABLES.map(name=>{const [schema,table]=name.split('.');return {schema,name:table,kind:'r',columns:['id','environment','user_id','enabled','min_service_version']}})
tables.push({schema:'vault',name:'secrets',kind:'r',columns:['id','secret']},...['cron.job','cron.job_run_details','net.http_request_queue','net._http_response'].map(name=>{const [schema,table]=name.split('.');return {schema,name:table,kind:'r',columns:['id']}}),
 {schema:'public',name:'control_events_id_seq',kind:'S',columns:[],owned_by:'public.control_events'},
 {schema:'net',name:'http_request_queue_id_seq',kind:'S',columns:[],owned_by:'net.http_request_queue'})
const sqlInputs=[...migrations.map(m=>({name:m.file,sql:m.sql})),
 {name:'rollback-gate',sql:gateSql({migrations,prepared,tables,applicationName:'d2-rollback:00000000-0000-4000-8000-000000000000'})},
 ...['retrievalSql','populatedSql','vectorSql','resultSql'].map(name=>({name,sql:prepared[name]})),
 {name:'inventory',sql:inventorySql},{name:'catalog',sql:catalogSql},{name:'safety',sql:safetySql},{name:'exact-cron-runtime-proof',sql:cronRuntimeProofSql},
 {name:'business-original',sql:businessSql(tables)},{name:'business-normalized',sql:businessSql(tables,{normalizePolicy:true})},{name:'business-forward',sql:businessSql(tables,{forward:true})}]
for(const scenario of RACE_CASES){
 const f=retrievalFixture(),race=buildRetrievalRace(f,scenario)
 const request=scenario.method==='prepare'?{version:1,workspaceId:f.workspace,generation:f.generation,proof:{kind:'recovery'}}
  :scenario.method==='finalize'?{buildId:f.request,manifest:{}}:scenario.method==='authorize'?{version:1,challengeId:f.request,signature:'00'.repeat(64)}:{version:1,capability:'00'.repeat(32),afterSeq:0}
 for(const [name,sql] of Object.entries({setup:race.setupSql,holder:race.holderSql(request),waiter:race.waiterSql(request),signal:race.signalSql,snapshot:race.snapshotSql}))sqlInputs.push({name:`race-preparation/${scenario.id}/${name}`,sql})
}
const python=flag('--python')??'/Applications/Xcode.app/Contents/Developer/usr/bin/python3',parserRoot=flag('--parser-root')??'/private/tmp/goalloom-d2-sql-parser'
const result=spawnSync(python,['-c',sqlGrammarProgram,parserRoot],{input:JSON.stringify({sqlInputs}),encoding:'utf8',maxBuffer:24*1024*1024,timeout:60000})
assert(result.status===0&&!result.error,'Pinned local grammar parser failed; no database action occurred')
const audit={version:1,scope:'SQL and PL/pgSQL grammar only',remoteExecuted:false,networkRequests:0,inputs:auditIdentity(input),...JSON.parse(result.stdout),
 scenarioCount:prepared.checks.length,probeGroups:prepared.probeGroups,
 limitations:['Grammar only; catalog/type/ACL and actual rollback require the leased PostgreSQL gate.','Dynamic substitutions of installed D1 prosrc require actual populated PostgreSQL execution.','Representative relation inventory exercises all hash projection branches; runtime inventory and row caps remain database gates.','Fresh generated fixture SQL stays in memory and its audit hashes differ on regeneration.','No independent ledger, actual Auth/Storage, operational producer bound, multi-connection or provider acceptance.']}
const bytes=JSON.stringify(audit,null,2)+'\n',hash=sha(bytes),directory=`${FINAL_DIRECTORY}/parser-audits`,path=`${directory}/${hash}.json`
await mkdir(directory,{recursive:true});await immutable(path,bytes)
console.log(JSON.stringify({ok:audit.ok,remoteExecuted:false,path,sha256:hash,reports:audit.reports.length,checks:prepared.checks.length,probeGroups:prepared.probeGroups,failures:audit.reports.filter(r=>r.errors.length).map(r=>({name:r.name,errors:r.errors}))}))
if(!audit.ok)process.exitCode=1
