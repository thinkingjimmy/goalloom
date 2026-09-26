// Failure cases under review: (1) a current-period refresh silently retargets an old
// preview; (2) removing a card during analysis resurrects it; (3) typing during a
// delayed save loses newer text; (4) deleting the last row of the last page hides
// pagination while earlier rows still exist. This is a temporary browser harness,
// not packaged-desktop acceptance. All regressions assert the repaired behavior.
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { writeFile, mkdir } from 'node:fs/promises'
const repo=resolve('.')
const evidence=resolve('output/tests/review-fixes')
await mkdir(evidence,{recursive:true})
const require=createRequire(`${repo}/package.json`)
const {createServer}=await import(require.resolve('vite'))
const react=(await import(require.resolve('@vitejs/plugin-react'))).default
const tailwind=(await import(require.resolve('@tailwindcss/vite'))).default
const {chromium}=require('playwright')
const server=await createServer({root:`${repo}/src/renderer`,configFile:false,plugins:[react(),tailwind()],server:{host:'127.0.0.1',port:0,fs:{allow:[repo]}}})
await server.listen()
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1280,height:840}})
const errors=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('dialog',dialog=>dialog.accept())
await page.addInitScript(()=>{
 const period=(horizon,startDate,endDate)=>({id:`c:${horizon}:${startDate}`,horizon,startDate,endDate,startAt:`${startDate}T00:00:00.000Z`,endAt:`${endDate}T00:00:00.000Z`})
 const now='2026-09-24T12:00:00.000Z'
 const item={id:'item-a',title:'Original title',description:'',dueDate:null,status:'todo',completedAt:null,cancelledAt:null,archivedAt:null,deletedAt:null,deletedBy:null,createdAt:now,updatedAt:now,version:1,flowColor:null,placement:{itemId:'item-a',horizon:'later',periodId:null,sortKey:1,version:1,holdPeriodId:null}}
 window.review={snapshot:{workspace:{generation:'test-generation',calendar:{id:'c',timezone:'UTC',weekStart:1,cycleAnchor:'2026-07-01'},setupConfirmedAt:now,pausedAfterRestore:false,revision:1,lastObservedAt:now,clockAnomaly:false,theme:'light',style:'paper',checkStyle:'outline',backupEnabled:true,backupRetention:7},periods:[period('cycle','2026-07-01','2026-10-01'),period('month','2026-09-01','2026-10-01'),period('week','2026-09-21','2026-09-28'),period('day','2026-09-24','2026-09-25')],items:[item],relations:[],policies:[],backlog:{},observedAt:now,maintenance:false,backupError:null,rolloverSources:{},flows:[]},listeners:[],commands:[],analyses:[],delayAnalysis:false,waiters:[],delayExecute:false,executeWaiters:[],smartEnabled:true}
 const r=window.review
 r.smartEnabled = !location.search.includes('plain')
 const status=()=>({activeProvider:'typesafe',providerRevision:1,enabled:r.smartEnabled,paused:false,providers:{typesafe:{credential:'saved',keyHint:'abc',consentedAt:now,verifiedAt:now},'vercel-gateway':{credential:'missing',keyHint:null,consentedAt:null,verifiedAt:null},openrouter:{credential:'missing',keyHint:null,consentedAt:null,verifiedAt:null}},lastFailure:null,cooldownUntil:null,dismissed:['globalEntry','smartSetup'],unsignedBuild:false})
 r.advance=()=>{r.snapshot.observedAt='2026-09-25T12:00:00.000Z';r.snapshot.workspace.revision++;r.snapshot.periods=r.snapshot.periods.map(p=>p.horizon==='day'?period('day','2026-09-25','2026-09-26'):p);r.listeners.forEach(f=>f(null))}
 window.goalloom={getLanguage:async()=>({language:'en',locale:'en',system:'en'}),getSnapshot:async()=>{if(r.delaySnapshot){r.delaySnapshot=false;await new Promise(resolve=>r.snapshotWaiter=resolve)}return structuredClone(r.snapshot)},onChanged:listener=>{r.listeners.push(listener);return()=>{r.listeners=r.listeners.filter(f=>f!==listener)}},getItem:async id=>({item:structuredClone(r.snapshot.items.find(i=>i.id===id)),relations:[]}),getActivitySummary:async()=>({total:0,latest:null}),getCounts:async()=>({done:0,cancelled:0,archived:0,trash:0}),getBackupSummary:async()=>({latest:null,total:0}),getActivity:async()=>({events:[],more:false}),listItems:async()=>({items:[],total:0}),smart:async action=>{
  if(action.type==='status')return {type:'status',status:status(),test:null}
  if(action.type!=='analyze')return {type:'cancelled'}
  r.analyses.push(action.request)
  const previewSnapshot=structuredClone(r.snapshot)
  if(r.delayAnalysis)await new Promise(resolve=>r.waiters.push(resolve))
  const {requestId,draftSessionId,inputRevision,manualRevision,generation,providerRevision,contextRevision,referenceTime}=action.request
  return {type:'analysis',reply:{status:'ready',echo:{requestId,draftSessionId,inputRevision,manualRevision,generation,providerRevision,contextRevision,referenceTime},preview:{layout:{value:'list',certain:true,metrics:null},referenceDate:previewSnapshot.observedAt.slice(0,10),periods:Object.fromEntries(previewSnapshot.periods.map(p=>[p.horizon,p])),drafts:['Alpha','Beta'].map((title,index)=>({draftId:`d${index}`,source:title,title,description:'',roleCertain:true,horizon:{value:'day',certain:true,metrics:null},due:{value:null,certain:true,metrics:null}})),candidates:r.suggestParent?[{ref:'g0',itemId:'parent-existing',title:'Existing suggested parent',status:'todo',horizon:'month',archived:false,flowColor:null,version:7,named:true}]:[],relations:r.suggestParent?[{parent:{kind:'existing',itemId:'parent-existing'},childDraftId:'d0',state:'maybe',probability:.7}]:[],warnings:[],questionCount:1,requests:1},diagnostics:[]}}
 },execute:async command=>{r.commands.push(command);if(r.delayExecute)await new Promise(resolve=>r.executeWaiters.push(resolve));if(r.failExecute)return {ok:false,code:'invalid',message:'Synthetic save failure'};if(command.type==='edit'){Object.assign(r.snapshot.items[0],{title:command.title,description:command.description,dueDate:command.dueDate,version:r.snapshot.items[0].version+1})};r.snapshot.workspace.revision++;return {ok:true,result:{operationId:command.operationId,generation:command.generation,changed:true,undoable:false,outcome:'committed',itemId:command.type==='edit'?'item-a':null,itemIds:[],label:'Saved',warnings:[],restoreSource:null,originalOperationId:null}}},getReceipt:async()=>null}
})
const result={scope:'Current source rendered in Chromium, mocked IPC, no production data or external service',checks:[]}
try{
 await page.goto(server.resolvedUrls.local[0]);await page.getByRole('button',{name:'Original title',exact:true}).waitFor()
 // Search failure modes: opening commands queries the whole workspace unnecessarily;
 // a transient error survives a later successful query; a pending query says no results.
 await page.evaluate(()=>{
  review.originalListItems=window.goalloom.listItems;review.searches=[]
  window.goalloom.listItems=async query=>{
   review.searches.push(query.query)
   if(query.query==='failure')throw Error('Synthetic search failure')
   return {items:query.query==='recovered'?[review.snapshot.items[0]]:[],total:query.query==='recovered'?1:0}
  }
 })
 await page.getByRole('button',{name:'Search & commands',exact:true}).click()
 await page.locator('.palette').waitFor();await page.waitForTimeout(250)
 assert.deepEqual(await page.evaluate(()=>review.searches),[])
 await page.getByRole('textbox',{name:'Search items',exact:true}).fill('failure')
 await page.getByRole('alert').filter({hasText:'Search failed'}).waitFor()
 await page.getByRole('textbox',{name:'Search items',exact:true}).fill('recovered')
 await page.locator('.command-results').getByRole('button',{name:'Original title',exact:false}).waitFor()
 assert.equal(await page.locator('.palette [role="alert"]').count(),0)
 result.checks.push({case:'search-recovery',queries:await page.evaluate(()=>review.searches)})
 await page.keyboard.press('Escape')
 await page.evaluate(()=>{window.goalloom.listItems=review.originalListItems})
 // Loading a nested detail must not hide its already-open Settings dialog.
 let releaseDetail, requestedDetail
 const detailGate=new Promise(resolve=>releaseDetail=resolve)
 const detailRequested=new Promise(resolve=>requestedDetail=resolve)
 const detailPattern='**/features/items/ItemDetail.tsx*'
 await page.route(detailPattern,async route=>{requestedDetail();await detailGate;await route.continue()})
 try {
  await page.evaluate(()=>{window.goalloom.listItems=async()=>({items:[review.snapshot.items[0]],total:1})})
  await page.getByRole('button',{name:'Settings & data',exact:true}).click()
  await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'Done',exact:true}).click()
  await page.locator('.items-open').click()
  await detailRequested
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  assert(await page.locator('dialog.settings-modal').isVisible())
  releaseDetail()
  await page.locator('dialog.detail').waitFor()
  await page.locator('dialog.detail .modal-header').getByRole('button',{name:'Close',exact:true}).click()
  assert(await page.locator('dialog.settings-modal').isVisible())
  await page.locator('dialog.settings-modal .modal-header').getByRole('button',{name:'Close',exact:true}).click()
  result.checks.push({case:'nested-lazy-dialog',settingsRemainedVisible:true})
 } finally {
  releaseDetail();await page.unroute(detailPattern)
  await page.evaluate(()=>{window.goalloom.listItems=review.originalListItems})
 }
 // Period boundary.
 await page.locator('.fab').click();await page.locator('.composer-input').fill('Alpha\nBeta');await page.locator('.composer-plan').waitFor()
 const before=await page.evaluate(()=>({analysisCount:review.analyses.length,period:review.snapshot.periods.find(p=>p.horizon==='day').id}))
 await page.evaluate(()=>review.advance());await page.waitForFunction(()=>review.analyses.length===2);await page.waitForTimeout(50);await page.locator('.composer-primary').click();await page.waitForTimeout(100)
 result.checks.push({case:'preview-period',before,after:await page.evaluate(()=>({analysisCount:review.analyses.length,submitted:review.commands.at(-1).items.map(i=>i.previewPeriodId)}))})
 // Removal while an updated text analysis is in flight.
 await page.locator('.fab').click();await page.locator('.composer-input').fill('Alpha\nBeta');await page.locator('.composer-plan').waitFor()
 await page.evaluate(()=>{review.delayAnalysis=true});await page.locator('.composer-input').fill('Alpha\nBeta\nchanged context');await page.waitForFunction(()=>review.waiters.length===1)
 await page.locator('.composer-input').press('Tab');await page.locator('.plan-list .plan-focus').waitFor();await page.keyboard.press('Backspace')
 const removed=await page.locator('.plan-row .plan-title').allTextContents()
 await page.evaluate(()=>{review.delayAnalysis=false;review.waiters.shift()()});await page.waitForTimeout(800)
 result.checks.push({case:'removed-draft',removed,after:await page.locator('.plan-row .plan-title').allTextContents()})
 await page.screenshot({path:`${evidence}/removed-draft.png`})
 await page.getByRole('button',{name:'Clear draft',exact:true}).click()
 // Async detail save.
 await page.getByRole('button',{name:'Original title',exact:true}).click();await page.locator('.title-input').fill('Saved text');await page.evaluate(()=>review.delayExecute=true)
 await page.locator('.save-bar .primary').click();await page.waitForFunction(()=>review.executeWaiters.length===1)
 await page.locator('.title-input').fill('New unsaved text entered during save')
 const typed=await page.locator('.title-input').inputValue()
 await page.evaluate(()=>{review.delayExecute=false;review.executeWaiters.shift()()});await page.waitForTimeout(300)
 result.checks.push({case:'detail-save',typed,after:await page.locator('.title-input').inputValue(),stored:await page.evaluate(()=>review.snapshot.items[0].title)})
 await page.screenshot({path:`${evidence}/detail-save.png`})
 // QuickAdd continuous entry while a save is pending.
 await page.locator('dialog.detail .modal-header').getByRole('button',{name:'Close',exact:true}).click()
 await page.getByRole('button',{name:'Add to Later',exact:true}).click()
 await page.locator('.quick-add input').fill('First task');await page.evaluate(()=>review.delayExecute=true)
 await page.locator('.quick-add input').press('Enter');await page.waitForFunction(()=>review.executeWaiters.length===1)
 await page.locator('.quick-add input').fill('Second task already typed')
 const second=await page.locator('.quick-add input').inputValue()
 await page.evaluate(()=>{review.delayExecute=false;review.executeWaiters.shift()()});await page.waitForTimeout(200)
 result.checks.push({case:'quick-add-save',typed:second,after:await page.locator('.quick-add input').inputValue(),submitted:await page.evaluate(()=>review.commands.at(-1).title)})
 await page.locator('.quick-add input').press('Escape')
 // Restore the one row on page 2 of a 51-item trash list.
 await page.evaluate(()=>{
  const r=review,base=r.snapshot.items[0]
  r.trash=Array.from({length:51},(_,i)=>({...base,id:`trash-${i}`,title:`Trashed ${i}`,deletedAt:'2026-09-24T12:00:00.000Z'}))
  window.goalloom.data=async()=>({type:'status',status:{records:[],lastError:null,directory:'/mock/backups'}})
  window.goalloom.getBatches=async()=>[]
  window.goalloom.listItems=async q=>q.view==='trash'?{items:r.trash.slice(q.offset,q.offset+q.limit),total:r.trash.length}:{items:[],total:0}
  r.executeOriginal=window.goalloom.execute
  window.goalloom.execute=async command=>{r.trash=r.trash.filter(i=>i.id!==command.itemId);r.snapshot.workspace.revision++;return {ok:true,result:{operationId:command.operationId,generation:command.generation,changed:true,undoable:false,outcome:'committed',itemId:null,itemIds:[],label:'Restored',warnings:[],restoreSource:null,originalOperationId:null}}}
 })
 await page.getByRole('button',{name:'Settings & data',exact:true}).click()
 await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'Trash',exact:true}).click()
 await page.getByRole('button',{name:'Next page',exact:true}).click();await page.getByRole('button',{name:/Trashed 50/}).waitFor()
 await page.getByRole('button',{name:'Restore',exact:true}).click();await page.waitForTimeout(200)
 result.checks.push({case:'trash-last-page',remaining:await page.evaluate(()=>review.trash.length),visibleRows:await page.locator('.items-row').count(),previousButton:await page.getByRole('button',{name:'Previous page',exact:true}).count()})
 await page.screenshot({path:`${evidence}/trash-last-page.png`})

 const check=name=>result.checks.find(row=>row.case===name)
 assert.ok(check('preview-period').after.analysisCount>check('preview-period').before.analysisCount)
 assert.ok(check('preview-period').after.submitted.every(id=>id==='c:day:2026-09-25'))
 assert.deepEqual(check('removed-draft').after,['Beta'])
 assert.equal(check('detail-save').after,check('detail-save').typed)
 assert.equal(check('detail-save').stored,'Saved text')
 assert.equal(check('quick-add-save').after,check('quick-add-save').typed)
 assert.equal(check('trash-last-page').visibleRows,50)
 await page.locator('dialog.settings-modal .modal-header').getByRole('button',{name:'Close',exact:true}).click()
 await page.evaluate(()=>{review.smartEnabled=false;window.goalloom.execute=review.executeOriginal})
 await page.locator('.fab').click();await page.locator('.composer-input').fill('First plain task')
 await page.evaluate(()=>review.delayExecute=true)
 await page.locator('.composer-primary').click();await page.waitForFunction(()=>review.executeWaiters.length===1)
 await page.locator('.composer-input').fill('New text while saving')
 await page.evaluate(()=>{review.delayExecute=false;review.executeWaiters.shift()()});await page.waitForTimeout(250)
 assert.equal(await page.locator('.composer-input').inputValue(),'New text while saving')
 result.checks.push({case:'composer-save',after:await page.locator('.composer-input').inputValue()})

 await page.getByRole('button',{name:'Clear draft',exact:true}).click()
 // Acceptance also waits for a snapshot. Typing in that second window must survive.
 for(const kind of ['detail','quick-add','composer']) {
  if(kind==='detail') await page.getByRole('button',{name:'Saved text',exact:true}).click()
  else if(kind==='quick-add') await page.getByRole('button',{name:'Add to Later',exact:true}).click()
  else await page.locator('.fab').click()
  const field=page.locator(kind==='detail'?'.title-input':kind==='quick-add'?'.quick-add input':'.composer-input')
  await field.fill(`${kind} submitted`)
  await page.evaluate(()=>review.delaySnapshot=true)
  if(kind==='detail') await page.locator('.save-bar .primary').click()
  else if(kind==='quick-add') await field.press('Enter')
  else await page.locator('.composer-primary').click()
  await page.waitForFunction(()=>Boolean(review.snapshotWaiter))
  await field.fill(`${kind} typed during snapshot refresh`)
  await page.evaluate(()=>{review.snapshotWaiter();review.snapshotWaiter=null})
  await page.waitForTimeout(200)
  assert.equal(await field.inputValue(),`${kind} typed during snapshot refresh`)
  result.checks.push({case:`${kind}-refresh-save`,after:await field.inputValue()})
  if(kind==='detail') await page.locator('dialog.detail .modal-header').getByRole('button',{name:'Close',exact:true}).click()
  else if(kind==='quick-add') await field.press('Escape')
  else await page.getByRole('button',{name:'Clear draft',exact:true}).click()
 }
 // Cache pruning must retain metadata for unconfirmed suggestions and their later acceptance.
 await page.reload();await page.getByRole('button',{name:'Original title',exact:true}).waitFor()
 await page.evaluate(()=>review.suggestParent=true)
 await page.locator('.fab').click();await page.locator('.composer-input').fill('Alpha\nBeta')
 await page.locator('.composer-plan').getByText(/Existing suggested parent/).waitFor()
 await page.locator('.composer-primary').click()
 await page.waitForFunction(()=>review.commands.length>0)
 assert.deepEqual(await page.evaluate(()=>review.commands.at(-1).items[0].parentRefs),[{kind:'existing',itemId:'parent-existing',expectedVersion:7}])
 result.checks.push({case:'suggested-parent-metadata',version:7})
 // Failure cases: closing during a save retains submitted text; an old receipt
 // clears newer reopened input or failed input, or retains an old-generation draft.
 for (const mode of ['plain', 'smart']) for (const outcome of ['closed', 'reopened', 'edited', 'failed', 'replaced']) {
  await page.goto(`${server.resolvedUrls.local[0]}?${mode}`)
  await page.getByRole('button',{name:'Original title',exact:true}).waitFor()
  await page.locator('.fab').click()
  await page.locator('.composer-input').fill('Alpha\nBeta')
  if (mode === 'smart') await page.locator('.composer-plan').waitFor()
  await page.evaluate(failed => { review.delayExecute=true; review.failExecute=failed }, outcome === 'failed')
  await page.locator('.composer-primary').click()
  await page.waitForFunction(()=>review.executeWaiters.length===1)
  await page.locator('.composer-modal .modal-header').getByRole('button',{name:'Close',exact:true}).click()
  if (outcome === 'replaced') {
   await page.evaluate(()=>{review.snapshot.workspace.generation='replacement';review.listeners.forEach(listener=>listener(null))})
   await page.waitForTimeout(100)
  }
  if (['reopened','edited','replaced'].includes(outcome)) {
   await page.keyboard.press('Meta+n')
   await page.locator('.composer-input').waitFor()
   if (outcome !== 'reopened') await page.locator('.composer-input').fill('New draft after close')
  }
  await page.evaluate(()=>{review.delayExecute=false;review.executeWaiters.shift()()})
  await page.waitForFunction(()=>!document.querySelector('.fab').disabled)
  if (!await page.locator('.composer-input').count()) await page.locator('.fab').click()
  // Replacement notifications wait behind the accepted write; text typed before
  // that refresh still belongs to the old workspace and must be discarded.
  const expected = outcome === 'edited' ? 'New draft after close' : outcome === 'failed' ? 'Alpha\nBeta' : ''
  console.log('COMPOSER_CLOSE',JSON.stringify({mode,outcome,expected,actual:await page.locator('.composer-input').inputValue()}))
  await page.waitForFunction(expected=>document.querySelector('.composer-input')?.value===expected,expected,{timeout:2000})
  assert.equal(await page.evaluate(()=>review.commands.length),1)
  result.checks.push({case:`composer-close-${mode}-${outcome}`,text:await page.locator('.composer-input').inputValue()})
 }
 assert.deepEqual(errors,[])
 await writeFile(`${evidence}/renderer.json`,JSON.stringify(result,null,2))
 console.log('Renderer review regressions passed')
}finally{await browser.close();await server.close()}
