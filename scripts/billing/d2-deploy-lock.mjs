/**
 * [INPUT]: Exact development plan/execution identity and explicit read-only original-transaction inspection.
 * [OUTPUT]: Atomically published complete PID locks or narrowly verified local recovery; no database write.
 * [POS]: Installer crash-recovery seam. It never removes a lock because of age or signals another process to exit.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {open,link,unlink,readFile,stat,mkdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {developmentRef,client} from '../hosted-ai/client.mjs'
import {literal as q} from './d1-sync-fixtures.mjs'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
function validate(metadata,planSha256){
 assert(metadata.version===1&&metadata.project===developmentRef&&metadata.planSha256===planSha256&&/^[a-f0-9]{64}$/.test(planSha256)
  &&uuid.test(metadata.executionId)&&metadata.applicationName===`d2-install:${metadata.executionId}`
  &&Number.isSafeInteger(metadata.pid)&&metadata.pid>0,'Invalid executor lock identity; retain it for inspection')
}
function absent(pid){
 try{process.kill(pid,0);return false}catch(error){if(error.code==='ESRCH')return true;throw error}
}
async function observed(path,planSha256){
 const details=await stat(path)
 assert(details.isFile()&&details.size<=4096&&(details.mode&0o077)===0&&(!process.getuid||details.uid===process.getuid()),'Executor lock ownership/size is invalid')
 const bytes=await readFile(path)
 const metadata=JSON.parse(bytes);validate(metadata,planSha256)
 return {metadata,details,bytes}
}
export async function acquireDeploymentLock(directory,planSha256,executionId=randomUUID()){
 const metadata={version:1,project:developmentRef,planSha256,executionId,applicationName:`d2-install:${executionId}`,pid:process.pid}
 validate(metadata,planSha256);await mkdir(directory,{recursive:true,mode:0o700})
 const path=`${directory}/executor.lock`,pending=`${path}.${executionId}.pending`,handle=await open(pending,'wx',0o600)
 try{await handle.writeFile(JSON.stringify(metadata)+'\n');await handle.sync()}finally{await handle.close()}
 try{await link(pending,path)}finally{await unlink(pending)}
 const original=await observed(path,planSha256)
 return {path,metadata,release:async()=>{
  const current=await observed(path,planSha256)
  assert(current.bytes.equals(original.bytes)&&current.metadata.executionId===executionId&&current.details.ino===original.details.ino&&current.details.dev===original.details.dev,'Executor lock changed; do not remove another owner')
  await unlink(path)
 }}
}
export async function recoverDeploymentLock(directory,planSha256,providedDb){
 const path=`${directory}/executor.lock`
 let original
 try{original=await observed(path,planSha256)}catch(error){if(error.code==='ENOENT')return {recovered:false,reason:'no_lock',remoteWrites:0};throw error}
 assert(absent(original.metadata.pid),'Original executor PID exists or was reused; keep the lock')
 const db=providedDb??await client()
 const rows=await db.query(`select count(*) as n from pg_stat_activity where application_name=${q(original.metadata.applicationName)} and state<>'idle'`,true)
 assert(rows.length===1&&rows[0].n!==null&&rows[0].n!==undefined&&Number(rows[0].n)===0,'Original installer transaction is still active or unverified; keep the lock')
 const current=await observed(path,planSha256)
 assert(absent(original.metadata.pid)&&current.bytes.equals(original.bytes)&&current.details.ino===original.details.ino&&current.details.dev===original.details.dev,'Executor lock/process identity changed during recovery')
 await unlink(path)
 return {recovered:true,originalPid:original.metadata.pid,executionId:original.metadata.executionId,applicationName:original.metadata.applicationName,
  originalProcessAbsent:true,originalTransactionAbsent:true,remoteWrites:0,
  scope:'Exact local lock removed after read-only process/transaction proof. Original operation journal remains; no operation is replayed and no transport retirement is implied.'}
}
