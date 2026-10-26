/**
 * [INPUT]: Exact development project keys kept only in child-process memory.
 * [OUTPUT]: Hosted dual-client acceptance output and actual Electron/Node/SQLite/platform evidence.
 * [POS]: D1 affected sync-feature verification; no foreground UI, provider or model request.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import electron from 'electron'
import {client,developmentRef,developmentUrl} from '../hosted-ai/client.mjs'
const directory='output/tests/billing/desktop/d1-backend',db=await client()
await mkdir(directory,{recursive:true})
const keys=await db.request('/api-keys?reveal=true'),anon=keys.find(x=>x.name==='anon')?.api_key,service=keys.find(x=>x.name==='service_role')?.api_key
assert(anon&&service,'Development fixture keys unavailable')
const redact=value=>[anon,service].reduce((text,key)=>text.replaceAll(key,'[redacted]'),String(value))
 .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted-jwt]')
 .replace(/([?&](?:token|sig|signature)=)[^&\s"']+/gi,'$1[redacted]')
const runtime=spawnSync(electron,['-e',"const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');console.log(JSON.stringify({electron:process.versions.electron,node:process.versions.node,sqlite:db.prepare('select sqlite_version() as version').get().version,os:process.platform,arch:process.arch}));db.close()"],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8'})
assert.equal(runtime.status,0,'Read actual acceptance runtime')
const report={ok:false,project:developmentRef,command:'pnpm test:phase0',runtime:JSON.parse(runtime.stdout.trim()),
 database:(await db.query('select version() as version'))[0].version,
 scope:'Source Electron in Node mode, real isolated development Auth/RPC/snapshot SDK and SQLite. No packaged app, Windows, foreground UI or verified physical-machine scope.'}
const chunks=[]
report.code=await new Promise((resolve,reject)=>{
 const child=spawn('pnpm',['test:phase0'],{env:{...process.env,SUPABASE_URL:developmentUrl,SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service},stdio:['ignore','pipe','pipe']})
 child.stdout.on('data',x=>chunks.push(x));child.stderr.on('data',x=>chunks.push(x));child.on('error',reject);child.on('exit',resolve)
})
await writeFile(`${directory}/phase0.txt`,redact(Buffer.concat(chunks).toString()))
report.ok=report.code===0
await writeFile(`${directory}/phase0.json`,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1
