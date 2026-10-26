/**
 * [INPUT]: Current production build and isolated encrypted two-peer native composition.
 * [OUTPUT]: Real UI/IPC review evidence, fault handling and five-language screenshots.
 * [POS]: Feature E2E; uses no live account, user task data or OS credential changes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir, arch, cpus, release } from 'node:os'
import { build } from 'vite'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'
import { configureSync } from './fixtures/billing.mjs'

const out=resolve('output/tests/sync-review'),root=await mkdtemp(join(tmpdir(),'goalloom-sync-review-ui-'))
await mkdir(join(out,'screenshots'),{recursive:true})
await build({configFile:false,ssr:{noExternal:true},define:{__GOALLOOM_BAKED_SUPABASE_ANON_KEY__:'""',__GOALLOOM_BAKED_SUPABASE_URL__:'""'},build:{
  ssr:true,target:'node24',minify:false,outDir:'out/main',emptyOutDir:false,
  lib:{entry:'tests/sync-review/native-entry.ts',formats:['es'],fileName:()=> 'sync-review-native.js'},
  rollupOptions:{external:[/^node:/,'electron','electron-updater'],output:{entryFileNames:'sync-review-native.js',chunkFileNames:'sync-review-[name]-[hash].js'}},
}})
const env={...process.env,GOALLOOM_SYNC_TEST_PROFILE:root}
for(const key of ['ELECTRON_RUN_AS_NODE','ELECTRON_RENDERER_URL','GOALLOOM_SUPABASE_URL','GOALLOOM_SUPABASE_ANON_KEY'])delete env[key]
const report={passed:false,checks:[],runtime:null,host:{os:release(),arch:arch(),cpu:cpus()[0]?.model,machine:'Physical/VM status not independently verified'},
  scope:'Production source Electron main/renderer/preload/IPC/SQLite. Synthetic OAuth, OS cipher and encrypted cloud. No packaged, live provider or Windows acceptance.',errors:[]}
let application,page
const check=name=>{report.checks.push(name);console.log(`PASS ${name}`)}
const shot=name=>page.screenshot({path:join(out,'screenshots',name+'.png')})
try{
  application=await electron.launch({args:[resolve('out/main/sync-review-native.js'),`--user-data-dir=${join(root,'alpha')}`],env,timeout:30000})
  page=await application.firstWindow();page.on('pageerror',error=>report.errors.push(error.message));await page.locator('.board').waitFor()
  report.runtime=await page.evaluate(()=>window.goalloom.getRuntime())
  await page.locator('.settings-toggle').click()
  const settings=page.locator('dialog.settings-modal')
  await settings.locator('.settings-nav-label').filter({hasText:/^同步$/}).click()
  await settings.getByRole('button',{name:/Google/}).click()
  await configureSync(settings)
  await settings.locator('input[type="password"]').nth(0).fill('synthetic-sync-password')
  await settings.locator('input[type="password"]').nth(1).fill('synthetic-sync-password')
  await settings.getByRole('button',{name:'开始同步',exact:true}).click()
  await pollPage(page,async()=> (await window.goalloom.sync({type:'status'})).status.phase==='ready')
  await application.evaluate(async()=>{
    const f=globalThis.syncSecurityFixture;await f.connectB();await f.settle()
    const run=async(peer,input)=>{const view=await peer.storage.call('sync',{type:'view'});return peer.storage.call('command',{...input,generation:view.generation,operationId:crypto.randomUUID()})}
    const get=async(peer,id)=>(await peer.storage.call('query',{type:'item',itemId:id})).item
    const edit=async(peer,id,title,description)=>{const i=await get(peer,id);return run(peer,{type:'edit',itemId:id,expectedVersion:i.version,title:title??i.title,description:description??i.description,dueDate:i.dueDate})}
    f.a.service.suspend();f.b.service.suspend();await f.a.service.schedule.settle();await f.b.service.schedule.settle()
    const ids=f.tasks(f.profile).map(row=>String(row.id));f.reviewIds=ids
    await edit(f.a,ids[0],'Local publish time',undefined);await edit(f.a,ids[0],undefined,'Local publish notes')
    await edit(f.b,ids[0],'Remote publish time','Remote publish notes')
    await edit(f.a,ids[1],'Local second task',undefined);await edit(f.b,ids[1],'Remote second task',undefined)
    await edit(f.a,ids[2],'Local deleted task','Keep these local notes')
    const removed=await get(f.b,ids[2]);await run(f.b,{type:'delete',itemId:ids[2],expectedVersion:removed.version})
    await f.a.service.resume();await f.settle();f.a.service.suspend();await f.a.service.schedule.settle()
    await f.b.service.resume();await f.settle();f.b.service.suspend();await f.b.service.schedule.settle()
    await f.a.service.resume();await f.settle()
  })
  await settings.locator('.modal-header > button').last().click()
  const notice=page.locator('.sync-review-notice')
  await notice.getByText('有 3 项任务需要确认同步结果',{exact:true}).waitFor()
  await notice.getByRole('button').click()
  const modal=page.locator('.sync-review-modal'),current=modal.locator('input[value="current"]'),local=modal.locator('input[value="local"]'),next=modal.locator('.sync-review-footer .primary')
  await modal.locator('.sync-review-compare').waitFor();assert(await current.isChecked())
  assert.equal(await notice.count(),0,'An open review hides its redundant corner entry and leaves footer actions clear')
  assert.equal(await modal.locator('textarea,select,[contenteditable],input:not([type="radio"])').count(),0)
  assert.equal(await modal.locator('.sync-review-progress').textContent(),'1 / 3')
  assert((await modal.boundingBox()).height<500)
  const body=()=>modal.locator('.sync-review-board').evaluateAll(nodes=>nodes.map(node=>({html:node.innerHTML,height:node.getBoundingClientRect().height,styles:Array.from(node.querySelectorAll('.task-title,.sync-review-note')).map(node=>({font:getComputedStyle(node).fontSize,line:getComputedStyle(node).lineHeight,color:getComputedStyle(node).color}))})))
  const before=await body();await local.check();assert.deepEqual(await body(),before)
  assert(before.every(version=>version.styles.every(style=>['14px','12px'].includes(style.font)&&style.line==='22px')))
  await shot('selected-local')
  await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});await notice.getByRole('button').click();await modal.waitFor();assert(await local.isChecked())
  check('Multiple lost fields group into one task. Read-only selected/unselected bodies match, default is synced, and Defer preserves the choice')

  for(const locale of ['en','ja','es','fr','zh']){
    await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'})
    await page.locator('.settings-toggle').click()
    await settings.locator('.settings-nav button').first().click()
    await settings.getByRole('combobox').first().click()
    const names={en:'English',ja:'日本語',es:'Español',fr:'Français',zh:'简体中文'},tags={en:'en',ja:'ja-JP',es:'es',fr:'fr-FR',zh:'zh-CN'}
    await page.getByRole('option',{name:names[locale],exact:true}).click()
    await page.waitForFunction(tag=>document.documentElement.lang===tag,tags[locale])
    await settings.locator('.modal-header > button').last().click()
    await notice.getByRole('button').click();await modal.waitFor()
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(800,720))
    assert(await modal.evaluate(node=>node.scrollWidth<=node.clientWidth+1))
    assert(await local.isChecked());await shot(`review-${locale}`)
  }
  check('A deferred review keeps its decision across five real Settings language changes and fits an 800 px native window')
  await application.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setMinimumSize(360,400);win.setContentSize(520,720)})
  assert(await modal.evaluate(node=>node.scrollWidth<=node.clientWidth+1));await shot('review-narrow')
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1000,760))

  await current.check();await application.evaluate(()=>{globalThis.syncReviewFault='after'})
  await next.dblclick();await modal.locator('.sync-review-progress').getByText('2 / 3',{exact:true}).waitFor();assert(await current.isChecked())
  check('A lost successful IPC reply is confirmed through the receipt; double click advances exactly once')
  await local.check();await application.evaluate(()=>{globalThis.syncReviewFault='before'})
  await next.click();await modal.getByRole('alert').waitFor();assert.equal(await modal.locator('.sync-review-progress').textContent(),'2 / 3');assert(await local.isChecked())
  await shot('write-failed-keeps-choice');await application.evaluate(()=>{globalThis.syncReviewFault='review'});await next.click()
  await modal.getByRole('alert').waitFor();assert.equal(await modal.locator('.sync-review-progress').textContent(),'2 / 3');assert(await local.isChecked())
  await shot('next-read-failed-keeps-progress');await next.click()
  await modal.locator('.sync-review-progress').getByText('3 / 3',{exact:true}).waitFor();assert(await current.isChecked())
  assert.equal(await next.textContent(),'完成');assert(await modal.getByText('恢复此任务',{exact:true}).isVisible())
  await shot('last-delete-default');await next.click();await modal.waitFor({state:'hidden'})
  await notice.waitFor({state:'hidden'});assert.equal(await page.getByText('全部处理完成',{exact:true}).count(),0)
  const result=await application.evaluate(async()=>{
    const f=globalThis.syncSecurityFixture
    const all=f.tasks(f.profile)
    return {count:all.length,deleted:all.find(row=>row.id===f.reviewIds[2]).deletedAt,second:all.find(row=>row.id===f.reviewIds[1]).title}
  })
  assert(result.deleted);assert.equal(result.second,'Local second task');await shot('finished-board')
  check('Failed requests and next-page reads retain selection/progress for idempotent retry. Finish closes without summary; default deletion stays deleted')

  await application.evaluate(async()=>{
    const f=globalThis.syncSecurityFixture
    const run=async(peer,input)=>{const view=await peer.storage.call('sync',{type:'view'});return peer.storage.call('command',{...input,generation:view.generation,operationId:crypto.randomUUID()})}
    const get=async(peer,id)=>(await peer.storage.call('query',{type:'item',itemId:id})).item
    await f.b.service.resume();await f.settle()
    const parent=await run(f.a,{type:'create',title:'Parent removed during creation',horizon:'year',flowColor:0})
    await f.settle();f.a.service.suspend();f.b.service.suspend();await f.a.service.schedule.settle();await f.b.service.schedule.settle()
    const child=await run(f.a,{type:'create',title:'New offline task to preserve',description:'Preserve this task without its deleted parent',horizon:'day',parentId:parent.itemId,expectedParentVersion:(await get(f.a,parent.itemId)).version})
    await run(f.a,{type:'edit',itemId:child.itemId,expectedVersion:(await get(f.a,child.itemId)).version,title:'Latest offline task to preserve',description:'Latest offline body',dueDate:null})
    await run(f.b,{type:'delete',itemId:parent.itemId,expectedVersion:(await get(f.b,parent.itemId)).version})
    await f.b.service.resume();await f.settle();f.b.service.suspend();await f.b.service.schedule.settle();await f.a.service.resume();await f.settle()
    f.newTaskReview={parentId:parent.itemId,itemId:child.itemId}
  })
  await notice.getByRole('button').click();await modal.getByText('当前看板中没有此任务',{exact:true}).waitFor()
  assert(await current.isChecked());assert.equal(await local.isDisabled(),false)
  await local.check();assert(await modal.getByText('保留此任务',{exact:true}).isVisible());await shot('offline-create-independent')
  await next.click();await modal.waitFor({state:'hidden'})
  const retained=await application.evaluate(async()=>{
    const f=globalThis.syncSecurityFixture;await f.settle();await f.b.service.resume();await f.settle()
    const child=(await f.b.storage.call('query',{type:'item',itemId:f.newTaskReview.itemId})).item
    return {id:child.id,description:child.description,parentDeleted:f.tasks(f.profile).find(row=>row.id===f.newTaskReview.parentId).deletedAt,expected:f.newTaskReview.itemId}
  })
  assert.equal(retained.id,retained.expected);assert.equal(retained.description,'Latest offline body');assert(retained.parentDeleted)
  check('A rejected offline creation has a read-only keep-task choice, preserves its ID on the peer and leaves the deleted parent absent')
  assert.deepEqual(report.errors,[]);report.passed=true
}catch(error){report.failure=error.stack;if(page){report.focus=await application.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return {focused:w.isFocused(),visible:w.isVisible()}}).catch(()=>null);await shot('failure').catch(()=>{})}throw error}
finally{await writeFile(join(out,'native.json'),JSON.stringify(report,null,2));await application?.close();await rm(root,{recursive:true,force:true})}
