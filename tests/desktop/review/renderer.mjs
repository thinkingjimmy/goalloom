// Failure cases under review: (1) a current-period refresh silently retargets an old
// preview; (2) removing a card during analysis resurrects it; (3) typing during a
// delayed save loses newer text; (4) deleting the last row of the last page hides
// pagination while earlier rows still exist. This is a temporary browser harness,
// not packaged-desktop acceptance. All regressions assert the repaired behavior.
/**
 * [INPUT]: Current renderer, deterministic browser IPC fixtures and synthetic composer analysis.
 * [OUTPUT]: Review regression report/screenshots, including the shared composer deadline calendar's draft boundary.
 * [POS]: Browser interaction acceptance; native deadline persistence is covered by desktop/due-dates.mjs.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
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
const server=await createServer({root:`${repo}/src/renderer`,configFile:false,cacheDir:`${repo}/node_modules/.vite-review`,plugins:[react(),tailwind()],server:{host:'127.0.0.1',port:0,fs:{allow:[repo]}}})
await server.listen()
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1280,height:840}})
const errors=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('dialog',dialog=>dialog.accept())
const initReview = ()=>{
 const period=(horizon,startDate,endDate)=>({id:`c:${horizon}:${startDate}`,horizon,startDate,endDate,startAt:`${startDate}T00:00:00.000Z`,endAt:`${endDate}T00:00:00.000Z`})
 const now='2026-09-24T12:00:00.000Z'
 const item={id:'item-a',title:'Original title',description:'',dueDate:null,status:'todo',completedAt:null,cancelledAt:null,archivedAt:null,deletedAt:null,deletedBy:null,createdAt:now,updatedAt:now,version:1,flowColor:null,placement:{itemId:'item-a',horizon:'later',periodId:null,sortKey:1,version:1,holdPeriodId:null}}
 window.review={snapshot:{workspace:{generation:'test-generation',calendar:{id:'c',mode:'rolling',timezone:'UTC',weekStart:1,cycleAnchor:'2026-07-01'},setupConfirmedAt:now,pausedAfterRestore:false,revision:1,lastObservedAt:now,clockAnomaly:false,theme:'light',style:'paper',checkStyle:'outline',backupEnabled:true,backupRetention:7},periods:[period('year','2026-07-01','2027-07-01'),period('half','2026-07-01','2027-01-01'),period('cycle','2026-07-01','2026-10-01'),period('month','2026-09-01','2026-10-01'),period('week','2026-09-21','2026-09-28'),period('day','2026-09-24','2026-09-25')],items:[item],relations:[],policies:[],backlog:{},observedAt:now,maintenance:false,backupError:null,rolloverSources:{},flows:[],orderNodes:[]},listeners:[],commands:[],analyses:[],delayAnalysis:false,waiters:[],delayExecute:false,executeWaiters:[],smartEnabled:true}
 const r=window.review
 if(location.search.includes('setup')) { r.snapshot.workspace.calendar=null;r.snapshot.workspace.setupConfirmedAt=null;r.snapshot.periods=[];r.snapshot.items=[];r.smartEnabled=false }
 r.smartEnabled = !location.search.includes('plain') && !location.search.includes('setup')
 const blank={credential:'missing',keyHint:null,consentedAt:null,verifiedAt:null,capabilities:{jev:null,chat:null},lastFailure:null,cooldownUntil:null}; const status=()=>({providers:{openrouter:{...blank,credential:'saved',keyHint:'abc',consentedAt:now,verifiedAt:now,capabilities:{jev:now,chat:null}},'vercel-gateway':blank},features:{smart:{provider:'openrouter',revision:1,enabled:r.smartEnabled,paused:false},insight:{provider:null,revision:0,enabled:false,paused:false}},dismissed:['globalEntry','smartSetup'],unsignedBuild:false})
 r.advance=()=>{r.snapshot.observedAt='2026-09-25T12:00:00.000Z';r.snapshot.workspace.revision++;r.snapshot.periods=r.snapshot.periods.map(p=>p.horizon==='day'?period('day','2026-09-25','2026-09-26'):p);r.listeners.forEach(f=>f(null))}
 window.goalloom={onBeforeClose:()=>()=>{},getLanguage:async()=>({language:'en',locale:'en',system:'en'}),getSnapshot:async()=>{if(r.delaySnapshot){r.delaySnapshot=false;await new Promise(resolve=>r.snapshotWaiter=resolve)}return structuredClone(r.snapshot)},onChanged:listener=>{r.listeners.push(listener);return()=>{r.listeners=r.listeners.filter(f=>f!==listener)}},getItem:async id=>({item:structuredClone(r.snapshot.items.find(i=>i.id===id)),relations:[]}),getActivitySummary:async()=>({total:0,latest:null}),getCounts:async()=>({done:0,cancelled:0,archived:0,trash:0}),getBackupSummary:async()=>({latest:null,total:0}),getActivity:async()=>({events:[],more:false}),listItems:async()=>({items:[],total:0}),smart:async action=>{
  if(action.type==='status')return {type:'status',status:status(),test:null}
  if(action.type!=='analyze')return {type:'cancelled'}
  r.analyses.push(action.request)
  const previewSnapshot=structuredClone(r.snapshot)
  if(r.delayAnalysis)await new Promise(resolve=>r.waiters.push(resolve))
  const {requestId,draftSessionId,inputRevision,manualRevision,generation,providerRevision,contextRevision,referenceTime}=action.request
  return {type:'analysis',reply:{status:'ready',echo:{requestId,draftSessionId,inputRevision,manualRevision,generation,providerRevision,contextRevision,referenceTime},preview:{layout:{value:'list',certain:true,metrics:null},referenceDate:previewSnapshot.observedAt.slice(0,10),periods:Object.fromEntries(previewSnapshot.periods.map(p=>[p.horizon,p])),drafts:['Alpha','Beta'].map((title,index)=>({draftId:`d${index}`,source:title,title,description:'',roleCertain:true,horizon:{value:'day',certain:true,metrics:null},due:{value:null,certain:true,metrics:null}})),candidates:r.suggestParent?[{ref:'g0',itemId:'parent-existing',title:'Existing suggested parent',status:'todo',horizon:'month',archived:false,flowColor:null,version:7,named:true}]:[],relations:r.suggestParent?[{parent:{kind:'existing',itemId:'parent-existing'},childDraftId:'d0',state:'maybe',probability:.7}]:[],warnings:[],questionCount:1,requests:1},diagnostics:[]}}
 },execute:async command=>{r.commands.push(command);if(command.type==='confirmSetup')return {ok:false,code:'stale_preview',message:'Date changed. Confirm the refreshed start date.'};if(r.delayExecute)await new Promise(resolve=>r.executeWaiters.push(resolve));if(r.failExecute)return {ok:false,code:'invalid',message:'Synthetic save failure'};if(command.type==='edit'){Object.assign(r.snapshot.items[0],{title:command.title,description:command.description,dueDate:command.dueDate,version:r.snapshot.items[0].version+1})};r.snapshot.workspace.revision++;return {ok:true,result:{operationId:command.operationId,generation:command.generation,changed:true,undoable:false,outcome:'committed',itemId:command.type==='edit'?'item-a':null,itemIds:[],label:'Saved',warnings:[],restoreSource:null,originalOperationId:null}}},getReceipt:async()=>null}
}
await page.addInitScript(initReview)
const result={scope:'Current source rendered in Chromium, mocked IPC, no production data or external service',checks:[]}
const calendarOnly=process.argv.includes('--calendar')
try{
 if(!calendarOnly){
 const setupPage=await browser.newPage({viewport:{width:1280,height:840},timezoneId:'UTC'})
 await setupPage.addInitScript(initReview)
 await setupPage.clock.install({time:new Date('2026-12-31T23:59:40Z')})
 await setupPage.goto(`${server.resolvedUrls.local[0]}?setup`)
 assert.equal(await setupPage.locator('[data-mode="rolling"]').getAttribute('aria-checked'),'true')
 await setupPage.locator('[data-mode="natural"]').click()
 await setupPage.locator('.onboarding-actions button').last().click()
 await setupPage.locator('.direction-input').fill('Retained annual draft')
 assert.match(await setupPage.locator('.onboarding-hint').last().innerText(),/2027/)
 await setupPage.locator('.direction-input').press('Enter')
 assert.equal((await setupPage.evaluate(()=>review.commands)).length,0)
 await setupPage.clock.fastForward(30000)
 await setupPage.waitForFunction(()=>document.querySelector('.onboarding-note')?.textContent.includes('2027'))
 assert.equal(await setupPage.locator('.direction-input').inputValue(),'Retained annual draft')
 assert.match(await setupPage.locator('.onboarding-hint').first().innerText(),/365/)
 await setupPage.screenshot({path:`${evidence}/setup-natural-midnight.png`})
 await setupPage.locator('.onboarding-actions button').last().click()
 await setupPage.getByRole('alert').filter({hasText:'Date changed'}).waitFor()
 assert.equal((await setupPage.evaluate(()=>review.commands.at(-1))).anchor.expected,'2027-01-01')
 assert.equal(await setupPage.locator('.direction-input').inputValue(),'Retained annual draft')
 assert.equal(await setupPage.evaluate(()=>review.snapshot.workspace.setupConfirmedAt),null)
 await setupPage.locator('.onboarding-actions button').first().click()
 await setupPage.locator('[data-mode="rolling"]').click()
 await setupPage.clock.setSystemTime(new Date('2027-01-02T08:00:00Z'))
 await setupPage.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await setupPage.locator('.onboarding-actions button').last().click()
 await setupPage.locator('.onboarding-actions button').last().click()
 assert.equal((await setupPage.evaluate(()=>review.commands.at(-1))).anchor.expected,'2027-01-02')
 await setupPage.locator('.onboarding-actions button').first().click()
 await setupPage.locator('.calendar-start .text-button').click()
 await setupPage.locator('.calendar-start [role="combobox"]').click()
 await setupPage.getByRole('option').nth(1).click()
 await setupPage.clock.setSystemTime(new Date('2027-01-31T23:59:40Z'))
 await setupPage.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await setupPage.locator('.onboarding-actions button').last().click()
 await setupPage.clock.fastForward(30000)
 await setupPage.locator('.onboarding-actions button').last().click()
 const monthCommand=await setupPage.evaluate(()=>review.commands.at(-1))
 assert.deepEqual(monthCommand.anchor,{kind:'monthStart',expected:'2027-02-01'})
 assert.equal(await setupPage.locator('.direction-input').inputValue(),'Retained annual draft')
 await setupPage.close()
 result.checks.push({case:'setup-midnight-focus-and-stale-confirmation',modes:['natural','rolling'],presets:['today','monthStart'],draftPreserved:true,enterDidNotLock:true})
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
 await page.getByRole('button',{name:'Original title',exact:true}).click();await page.getByRole('button',{name:'Edit title',exact:true}).click();await page.locator('.title-input').fill('Saved text');await page.evaluate(()=>review.delayExecute=true)
 await page.waitForFunction(()=>review.executeWaiters.length===1)
 await page.locator('.title-input').fill('New unsaved text entered during save')
 const typed=await page.locator('.title-input').inputValue()
 await page.evaluate(()=>{review.delayExecute=false;review.executeWaiters.shift()()});await page.locator('dialog.detail .detail-body[data-save-state="saved"]').waitFor()
 result.checks.push({case:'detail-save',typed,after:await page.locator('.title-input').inputValue(),stored:await page.evaluate(()=>review.snapshot.items[0].title)})
 await page.screenshot({path:`${evidence}/detail-save.png`})
 // A workspace replacement invalidates a pending detail debounce.
 await page.locator('.title-input').fill('Must not enter the replacement workspace')
 await page.evaluate(()=>{review.snapshot.workspace.generation='replacement-generation';review.snapshot.workspace.revision++;review.listeners.forEach(listener=>listener(null))})
 await page.locator('dialog.detail').waitFor({state:'hidden'})
 await page.waitForTimeout(550)
 assert(!await page.evaluate(()=>review.commands.some(command=>command.title==='Must not enter the replacement workspace')))
 result.checks.push({case:'detail-generation',staleDraftSubmitted:false})
 // QuickAdd continuous entry while a save is pending.
 await page.getByRole('button',{name:'Add to Later',exact:true}).click()
 await page.locator('.quick-add-title').fill('First task');await page.evaluate(()=>review.delayExecute=true)
 await page.locator('.quick-add-title').press('Enter');await page.waitForFunction(()=>review.executeWaiters.length===1)
 await page.locator('.quick-add-title').fill('Second task already typed')
 const second=await page.locator('.quick-add-title').inputValue()
 await page.evaluate(()=>{review.delayExecute=false;review.executeWaiters.shift()()});await page.waitForTimeout(200)
 result.checks.push({case:'quick-add-save',typed:second,after:await page.locator('.quick-add-title').inputValue(),submitted:await page.evaluate(()=>review.commands.at(-1).title)})
 await page.locator('.quick-add-title').press('Escape')
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
 assert.equal(check('detail-save').stored,check('detail-save').typed)
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
  if(kind==='detail') { await page.getByRole('button',{name:'New unsaved text entered during save',exact:true}).click();await page.getByRole('button',{name:'Edit title',exact:true}).click() }
  else if(kind==='quick-add') await page.getByRole('button',{name:'Add to Later',exact:true}).click()
  else await page.locator('.fab').click()
  const field=page.locator(kind==='detail'?'.title-input':kind==='quick-add'?'.quick-add-title':'.composer-input')
  await field.fill(`${kind} submitted`)
  await page.evaluate(()=>review.delaySnapshot=true)
  if(kind==='quick-add') await field.press('Enter')
  else if(kind==='composer') await page.locator('.composer-primary').click()
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
 }
 // Calendar selection must remain inside the draft until explicit composer confirmation.
 await page.goto(`${server.resolvedUrls.local[0]}?smart`)
 await page.getByRole('button',{name:'Original title',exact:true}).waitFor()
 await page.locator('.fab').click();await page.locator('.composer-input').fill('Alpha\nBeta')
 await page.locator('.composer-plan').waitFor()
 await page.locator('.composer-input').press('Tab')
 await page.keyboard.press('d')
 const calendar=page.locator('.composer-modal .due-panel')
 await calendar.getByRole('grid').waitFor()
 await page.waitForFunction(()=>document.activeElement?.getAttribute('data-date')==='2026-09-24')
 await page.keyboard.press('2')
 await calendar.waitFor({state:'detached'})
 assert.match(await page.locator('.plan-token[aria-keyshortcuts="D"]').innerText(),/9\/25/)
 await page.keyboard.press('d')
 await calendar.locator('[data-date="2026-09-25"]').press('ArrowRight')
 await page.keyboard.press('Enter')
 await calendar.waitFor({state:'detached'})
 assert.equal(await page.evaluate(()=>review.commands.length),0)
 assert.equal(await page.locator('.plan-focus').evaluate(node=>node===document.activeElement),true)
 await page.keyboard.press('d')
 await calendar.getByRole('button',{name:'Clear due date',exact:true}).click()
 await page.keyboard.press('d')
 await calendar.locator('[data-date="2026-09-24"]').press('PageDown')
 await page.keyboard.press('Enter')
 await calendar.waitFor({state:'detached'})
 await page.keyboard.press('d')
 await calendar.screenshot({path:`${evidence}/composer-deadline-calendar.png`})
 await page.keyboard.press('Escape')
 assert.equal(await page.locator('.composer-modal').count(),1)
 await page.locator('.composer-primary').click()
 await page.waitForFunction(()=>review.commands.length===1)
 const calendarDraft=await page.evaluate(()=>review.commands[0].items[0])
 assert.deepEqual([calendarDraft.dueDate,calendarDraft.horizon],['2026-10-24','day'])
 result.checks.push({case:'composer-deadline-calendar',dueDate:calendarDraft.dueDate,horizon:calendarDraft.horizon,numericShortcut:true,clear:true,noEarlyWrite:true})
 assert.deepEqual(errors,[])
 await writeFile(`${evidence}/${calendarOnly?'calendar':'renderer'}.json`,JSON.stringify(result,null,2))
 console.log(calendarOnly?'Composer calendar checks passed':'Renderer review regressions passed')
}catch(error){
 await page.screenshot({path:`${evidence}/${calendarOnly?'calendar':'renderer'}-failure.png`}).catch(()=>undefined)
 await writeFile(`${evidence}/${calendarOnly?'calendar':'renderer'}-failure.json`,JSON.stringify({error:String(error),errors,state:await page.evaluate(()=>({commands:review.commands,analyses:review.analyses.length,active:document.activeElement?.outerHTML.slice(0,500),focused:document.hasFocus(),visibility:document.visibilityState,content:document.querySelector('.composer-modal')?.textContent}))},null,2))
 throw error
}finally{await browser.close();await server.close()}
