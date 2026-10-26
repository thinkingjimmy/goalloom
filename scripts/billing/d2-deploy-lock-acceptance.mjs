/**
 * [INPUT]: Actual installer lock implementation, isolated filesystem and a controlled read-only DB port.
 * [OUTPUT]: Repeatable real-child SIGKILL recovery evidence, explicitly separate from hosted DB proof.
 * [POS]: Installer crash-boundary acceptance; no original project state, credentials or remote request.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {mkdir,writeFile,readFile,stat} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID,createHash} from 'node:crypto'
import {acquireDeploymentLock,recoverDeploymentLock} from './d2-deploy-lock.mjs'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),planSha256='a'.repeat(64)
const directory=resolve(`output/tests/billing/desktop/d2-deployment/lock-acceptance/${randomUUID()}`),lockDirectory=`${directory}/fixture-window`
await mkdir(directory,{recursive:true,mode:0o700})
const childPath=`${directory}/child.mjs`,implementation='scripts/billing/d2-deploy-lock.mjs',before=sha(await readFile(implementation))
await writeFile(childPath,`globalThis.fetch=async()=>{throw Error('network_forbidden')};
const {acquireDeploymentLock}=await import(${JSON.stringify(pathToFileURL(resolve(implementation)).href)});
const lock=await acquireDeploymentLock(${JSON.stringify(lockDirectory)},${JSON.stringify(planSha256)});
process.stdout.write(JSON.stringify(lock.metadata)+'\\n');setInterval(()=>{},1000);`,{mode:0o600})
const checks=[],queries=[],child=spawn(process.execPath,[childPath],{stdio:['ignore','pipe','pipe']})
let exited=false;child.once('exit',()=>{exited=true})
const db=n=>({query:async(sql,readOnly)=>{assert.equal(readOnly,true);assert(sql.startsWith('select count(*) as n from pg_stat_activity where application_name='));queries.push({sha256:sha(sql),readOnly:true,controlledActive:n});return [{n}]}})
try{
 const metadata=await new Promise((resolveReady,reject)=>{
  const timer=setTimeout(()=>reject(Error('child_readiness_timeout')),10000);let buffer=''
  child.stdout.on('data',chunk=>{buffer+=chunk;const boundary=buffer.indexOf('\n');if(boundary>=0){clearTimeout(timer);try{resolveReady(JSON.parse(buffer.slice(0,boundary)))}catch(error){reject(error)}}})
  child.once('error',reject);child.once('exit',()=>{clearTimeout(timer);reject(Error('child_exited_before_readiness'))})
 })
 assert(metadata.pid===child.pid&&metadata.applicationName===`d2-install:${metadata.executionId}`)
 assert.deepEqual(JSON.parse(await readFile(`${lockDirectory}/executor.lock`,'utf8')),metadata)
 await assert.rejects(()=>recoverDeploymentLock(lockDirectory,planSha256,db(0)),/Original executor PID exists/)
 checks.push({name:'Live original process retains complete lock',ok:true,dbQueries:queries.length})
 const exit=once(child,'exit');child.kill('SIGKILL');await exit
 assert(exited)
 await assert.rejects(()=>recoverDeploymentLock(lockDirectory,planSha256,db(1)),/Original installer transaction is still active/)
 assert.equal(JSON.parse(await readFile(`${lockDirectory}/executor.lock`,'utf8')).executionId,metadata.executionId)
 checks.push({name:'Dead original process with active controlled transaction retains lock',ok:true})
 const recovered=await recoverDeploymentLock(lockDirectory,planSha256,db(0))
 assert(recovered.recovered&&recovered.originalProcessAbsent&&recovered.originalTransactionAbsent&&recovered.remoteWrites===0)
 checks.push({name:'Dead original process and absent controlled transaction remove only exact lock',ok:true})
 const next=await acquireDeploymentLock(lockDirectory,planSha256);assert.notEqual(next.metadata.executionId,metadata.executionId);await next.release()
 await assert.rejects(()=>stat(`${lockDirectory}/executor.lock`),{code:'ENOENT'})
 checks.push({name:'Next execution acquires and releases a new identity',ok:true})
 assert.equal(sha(await readFile(implementation)),before)
 const report={version:1,ok:true,checks,remoteExecuted:false,remoteWrites:0,controlledDbQueries:queries,
  child:{pid:metadata.pid,executionId:metadata.executionId,signal:'SIGKILL',actualChildExited:true},implementation:{path:implementation,sha256:before},
  scope:'Actual child process, SIGKILL, PID absence and filesystem metadata/reacquisition. DB active/absent counts are controlled, not actual hosted transaction proof. No credential, provider, Auth/Storage, schema or Edge operation.',
  runtime:{node:process.version,os:process.platform,cpu:process.arch}}
 const path=`${directory}/report.json`;await writeFile(path,JSON.stringify(report,null,2)+'\n',{mode:0o600})
 console.log(JSON.stringify({ok:true,path,sha256:sha(await readFile(path)),checks:checks.length,actualChildTerminated:true,controlledDb:true,remoteExecuted:false}))
}finally{if(!exited){const exit=once(child,'exit');child.kill('SIGKILL');await exit}}
