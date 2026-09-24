/**
 * Failure cases: snapshot binds more than SQLite's variable limit; fixing it loses
 * latest-move semantics, truncates the import maximum, or includes archived items.
 * Uses real commands, a closed disk database and the production storage worker.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir, cpus, release } from 'node:os'
import { join, resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import { openDatabase } from '../../../src/main/storage/database.ts'
import { migrate } from '../../../src/main/storage/schema.ts'
import { Repository } from '../../../src/main/workspace/repository.ts'
import { reconcile } from '../../../src/main/workspace/reconcile.ts'

const directory = await mkdtemp(join(tmpdir(), 'goalloom-large-workspace-'))
const path = join(directory, 'workspace.sqlite'), checks = []
const today = new Date().toISOString().slice(0, 10)
let now = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString()
let db = openDatabase(path); migrate(db)
let repo = new Repository(db, { now: () => now })
const run = action => repo.execute({ ...action, generation: repo.store.workspace().generation, operationId: randomUUID() })
try {
  run({ type:'confirmSetup', timezone:'UTC', weekStart:1, cycleAnchor:now.slice(0,10), confirmed:true })
  const rolled = run({ type:'create', title:'Still rolled over', horizon:'day' }).itemId
  const moved = run({ type:'create', title:'Moved after rollover', horizon:'day' }).itemId
  const oldDate = now.slice(0,10)
  now = `${today}T12:00:00Z`; reconcile(repo)
  const item = repo.store.item(moved)
  run({ type:'move', itemId:moved, expectedVersion:item.version, expectedPlacementVersion:item.placement.version, horizon:'later' })
  let total = 2
  for (const count of [32_769, 100_000]) {
    while (total < count) { run({ type:'create', title:`Large workspace ${total}`, horizon:'later' }); total++ }
    db.close(); db = null
    const worker = new Worker(resolve('out/main/storage.js'), { workerData:{ databasePath:path, backupDirectory:join(directory,'backups'), locale:'en' } })
    const pending = new Map(); let sequence=0
    worker.on('message', message => { const entry=pending.get(message.id); pending.delete(message.id); message.ok ? entry.resolve(message.value) : entry.reject(Error(message.message)) })
    worker.on('error', error => { for (const entry of pending.values()) entry.reject(error) })
    const call = (method,argument) => new Promise((resolve,reject) => { const id=++sequence; pending.set(id,{resolve,reject}); worker.postMessage({id,method,argument}) })
    try {
      await call('startup')
      const snapshot = await call('query',{type:'snapshot'})
      assert.equal(snapshot.items.length,count)
      assert.equal(snapshot.rolloverSources[rolled],oldDate)
      assert.equal(snapshot.rolloverSources[moved],undefined)
      const current = snapshot.items.find(item=>item.id===rolled)
      const archived = await call('command',{type:'archive',archived:true,itemId:rolled,expectedVersion:current.version,generation:snapshot.workspace.generation,operationId:randomUUID()})
      assert.equal(archived.changed,true)
      const hidden = await call('query',{type:'snapshot'})
      assert.equal(hidden.items.length,count-1)
      assert.equal(hidden.rolloverSources[rolled],undefined)
      await call('command',{type:'archive',archived:false,itemId:rolled,expectedVersion:current.version+1,generation:snapshot.workspace.generation,operationId:randomUUID()})
      checks.push({items:count,rolloverSources:'latest position change only; archived excluded',runtime:await call('runtime')})
      console.log(JSON.stringify(checks.at(-1)))
    } finally { await call('close'); await worker.terminate() }
    db = openDatabase(path); repo = new Repository(db,{now:()=>now})
  }
  await mkdir('output/tests/review-followup',{recursive:true})
  await writeFile('output/tests/review-followup/large-workspace.json',JSON.stringify({checks,environment:{electron:process.versions.electron,node:process.versions.node,os:release(),cpu:cpus()[0]?.model,arch:process.arch}},null,2))
} finally { db?.close(); await rm(directory,{recursive:true,force:true}) }
