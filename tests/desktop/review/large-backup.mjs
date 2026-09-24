import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, cpus, release } from 'node:os'
const root=resolve('.')
const directory=await mkdtemp(join(tmpdir(),'goalloom-review-large-backup-'))
if(process.env.GOALLOOM_LARGE_SEED) await copyFile(resolve(process.env.GOALLOOM_LARGE_SEED),join(directory,'workspace.sqlite'))
const worker=new Worker(resolve(process.env.GOALLOOM_LARGE_WORKER??'out/main/storage.js'),{workerData:{databasePath:join(directory,'workspace.sqlite'),backupDirectory:join(directory,'backups'),locale:'en'}})
let peakRss=0,stage='startup'; const stages={}
const sample=()=>{const rss=process.memoryUsage().rss;peakRss=Math.max(peakRss,rss);stages[stage]=Math.max(stages[stage]??0,rss)}
const memoryTimer=setInterval(sample,20)
const pending=new Map(); let sequence=0
worker.on('message',message=>{const p=pending.get(message.id);pending.delete(message.id); if(message.ok)p.resolve(message.value);else p.reject(new Error(message.message))})
worker.on('error',error=>{for(const p of pending.values())p.reject(error)})
const call=(method,argument)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,method,argument})})
try {
 await call('startup')
 const generation=(await call('query',{type:'snapshot'})).workspace.generation
 const command=action=>call('command',{...action,generation,operationId:randomUUID()})
 const description='长'.repeat(100000)
 if(!process.env.GOALLOOM_LARGE_SEED) {
  await command({type:'confirmSetup',timezone:'Asia/Shanghai',weekStart:1,cycleAnchor:'2026-09-01',confirmed:true})
  for(let n=0;n<360;n++) {
   await command({type:'create',title:`Long item ${n}`,description,horizon:'later'})
   if(n%60===0)console.log(JSON.stringify({stage:'seed',items:n+1}))
  }
 }
 stage='backup';sample()
 const backupReply=await call('data',{type:'createBackup',generation})
 const backup=backupReply.status.records.find(record=>record.kind==='manual')
 stage='preview';sample()
 const restore=await call('data',{type:'previewBackup',generation,backupId:backup.id}).then(value=>({ok:true,value}),error=>({ok:false,error:error.message}))
 const reset=await call('data',{type:'previewReset',generation})
 stage='prepare-reset';sample()
 const prepared=await call('data',{type:'prepare',generation,token:reset.preview.token})
 const protective=prepared.preview.backup
 stage='reset';sample()
 await call('data',{type:'commit',generation,token:reset.preview.token,acknowledged:true})
 const newGeneration=(await call('query',{type:'snapshot'})).workspace.generation
 stage='preview-after-reset';sample()
 const recoverAfterReset=await call('data',{type:'previewBackup',generation:newGeneration,backupId:protective.id}).then(value=>({ok:true,value}),error=>({ok:false,error:error.message}))

 assert.ok(backup.size>100*1024*1024)
 assert.equal(restore.ok,true)
 assert.equal(recoverAfterReset.ok,true)
 const restoreToken=recoverAfterReset.value.preview.token
 stage='prepare-restore';sample()
 await call('data',{type:'prepare',generation:newGeneration,token:restoreToken})
 stage='restore';sample()
 await call('data',{type:'commit',generation:newGeneration,token:restoreToken,acknowledged:true})
 const restored=await call('query',{type:'list',view:'search',query:'Long item',offset:0,limit:50})
 assert.equal(restored.total,360)
 for(let offset=0;offset<restored.total;offset+=50) {
  const page=offset===0?restored:await call('query',{type:'list',view:'search',query:'Long item',offset,limit:50})
  for(const item of page.items) assert.equal((await call('query',{type:'item',itemId:item.id})).item.description,description)
 }
 sample()
 const result={restored:restored.total,peakRss,stages,memory:process.memoryUsage(),directory,environment:{electron:process.versions.electron,node:process.versions.node,sqlite:(await call('runtime')).sqlite,os:release(),cpu:cpus()[0]?.model,arch:process.arch},items:360,charactersPerDescription:100000,backup,restore,protective,recoverAfterReset}
 const label=process.env.GOALLOOM_LARGE_LABEL??'large-backup';assert.match(label,/^[a-z0-9-]+$/)
 await writeFile(join(root,`output/tests/review-fixes/${label}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify({label,restored:restored.total,peakRss,stages,directory}))
} finally {clearInterval(memoryTimer);await call('close');}
