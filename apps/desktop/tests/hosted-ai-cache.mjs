/**
 * [INPUT]: Development renderer modules, real Electron/main/IPC and synthetic account/provider fixture.
 * [OUTPUT]: Repeatable cache ownership and stale-session rejection across A/B/A transitions and held responses.
 * [POS]: Source Electron integration acceptance; no production test control, live model or private task data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import {_electron as electron} from 'playwright'
import {finishSetup} from './fixtures/setup.mjs'
const out=resolve('../../output/tests/hosted-ai/cache'),profile=await mkdtemp(join(tmpdir(),'goalloom-hosted-cache-'))
await mkdir(out,{recursive:true});await writeFile(join(profile,'preferences.json'),JSON.stringify({language:'zh'}))
const server=await createServer({root:resolve('src/renderer'),configFile:false,cacheDir:resolve('node_modules/.vite-hosted'),plugins:[react(),tailwind()],server:{host:'127.0.0.1',port:0,fs:{allow:[resolve('.')]}}})
await server.listen()
const env={...process.env,ELECTRON_RENDERER_URL:server.resolvedUrls.local[0],GOALLOOM_SUPABASE_URL:'https://credential-fixture.invalid',GOALLOOM_SUPABASE_ANON_KEY:'synthetic-anon',GOALLOOM_HOSTED_FIXTURE:'1'};delete env.ELECTRON_RUN_AS_NODE
let app,page
const report={ok:false,checks:[],scope:'Development renderer with production cache modules, source Electron/main/IPC and synthetic Auth/provider; no live model or packaged acceptance.'}
const a='11111111-1111-4111-8111-111111111111',b='33333333-3333-4333-8333-333333333333'
const calls=()=>app.evaluate(()=>globalThis.credentialFixture.modelCalls??0)
const waitForNewCall=before=>app.evaluate(async(_electron,before)=>{const end=Date.now()+5000;while((globalThis.credentialFixture.modelCalls??0)<=before){if(Date.now()>end)throw Error('Expected authorized input attempt');await new Promise(resolve=>setTimeout(resolve,10))}},before)
async function signIn(accountId,enable=false){
 const before=await app.evaluate(()=>globalThis.credentialFixture.browser)
 await app.evaluate((_electron,id)=>{globalThis.credentialFixture.activeUserId=id},accountId)
 const pending=page.evaluate(()=>window.goalloom.sync({type:'sign-in',provider:'google',purpose:'ai'}))
 await app.evaluate(async(_electron,before)=>{const end=Date.now()+5000;while(globalThis.credentialFixture.browser<=before){if(Date.now()>end)throw Error('OAuth did not open');await new Promise(r=>setTimeout(r,10))}},before)
 assert.equal((await fetch('http://127.0.0.1:53682/callback?code=synthetic-code',{headers:{Connection:'close'}})).status,200);await pending
 const expected=await page.evaluate(async({accountId,enable})=>{
  const api=window.goalloom,generation=(await api.getSnapshot()).workspace.generation
  if(enable){await api.smart({type:'consentHosted',generation,accountId,scopeVersion:3,consent:true});await api.smart({type:'feature',generation,accountId,feature:'insight',provider:'hosted',enabled:true})}
  const status=(await api.smart({type:'status',generation})).status
  return {provider:status.features.insight.provider,accountId:status.hostedAccountId,revision:status.features.insight.revision,sessionRevision:status.sessionRevision}
 },{accountId,enable})
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('goalloom:ai-refresh',null))
 await page.waitForFunction(async expected=>{const {aiSource}=await import('/state/ai-scope.ts');return JSON.stringify(aiSource('insight'))===JSON.stringify(expected)},expected)
}
const review=(refresh,variant=false,periodKey='synthetic-week')=>page.evaluate(async ({refresh,variant,periodKey})=>{
 const {prepareReviewSummary,loadReviewSummary}=await import('/state/review-summary.ts')
 const generation=(await window.goalloom.getSnapshot()).workspace.generation
 const board={today:'2026-10-23',periods:{},goals:[],unlinked:{half:[],cycle:[],month:[],week:[],day:[]}},prefs={about:'',stepSize:'smallest',stepNotes:'',tone:'direct',focus:[]}
 if(variant) board.goals.push({title:'Changed context only',half:[],cycle:[],month:[],week:[],day:[]})
 return loadReviewSummary(prepareReviewSummary({generation,scope:'week',board,signals:[]},[periodKey],prefs),refresh)
},{refresh,variant,periodKey})
const draft=(variant=false)=>page.evaluate(async variant=>{const {requestReviewDraft}=await import('/state/review-drafts.ts');const generation=(await window.goalloom.getSnapshot()).workspace.generation;return requestReviewDraft({generation,board:{today:'2026-10-23',periods:{},goals:[],unlinked:{half:[],cycle:[],month:[],week:[],day:[]}},tasks:[{id:'cache-task',parent:variant?'Changed parent context':'Synthetic cache parent',goal:null,target:'This week',targetHorizon:'week',siblings:[]}]},'week:cache')},variant)
const check=name=>{report.checks.push(name);console.log(`pass ${name}`)}
try{
 app=await electron.launch({args:[resolve('tests/fixtures/credential-entry.mjs'),`--user-data-dir=${profile}`],env});page=await app.firstWindow();page.on('dialog',dialog=>dialog.accept().catch(()=>{}));await finishSetup(page)
 report.runtime=await app.evaluate(()=>process.versions)
 await signIn(a,true);const first=await review(false);assert(first.ok);const count=await calls();assert.equal((await review(false)).value.headline,first.value.headline);assert.equal(await calls(),count)
 check('An unchanged account/source reuses its validated local review cache')
 const staleSource=await page.evaluate(async()=>{const generation=(await window.goalloom.getSnapshot()).workspace.generation;const status=(await window.goalloom.smart({type:'status',generation})).status;return {provider:'hosted',accountId:status.hostedAccountId,revision:status.features.insight.revision,sessionRevision:status.sessionRevision}})
 await page.evaluate(()=>window.goalloom.sync({type:'sign-out'}));await signIn(b,true);assert.equal(await calls(),count)
 const second=await review(false);assert(second.ok);assert.notEqual(second.value.headline,first.value.headline);assert.equal(await calls(),count+1)
 check('Login alone sends no context; B cannot reuse A’s cached review')
 await page.evaluate(()=>window.goalloom.sync({type:'sign-out'}));await signIn(a)
 const rejected=await page.evaluate(async source=>{const generation=(await window.goalloom.getSnapshot()).workspace.generation;return window.goalloom.smart({type:'review',source,request:{requestId:crypto.randomUUID(),generation,scope:'week',board:{today:'2026-10-23',periods:{},goals:[],unlinked:{half:[],cycle:[],month:[],week:[],day:[]}},prefs:{about:'',stepSize:'smallest',stepNotes:'',tone:'direct',focus:[]},signals:[]}})},staleSource)
 assert.equal(rejected.type,'review');assert.equal(rejected.reply.status,'failed');assert.equal(rejected.reply.failure.kind,'not_enabled');assert.equal(await calls(),count+1)
 check('An old session cannot dispatch a new model call after the same account signs in again')
 await app.evaluate(()=>{globalThis.credentialFixture.holdHosted=true;globalThis.credentialFixture.pendingHosted=false})
 const old=review(true)
 await app.evaluate(async()=>{const end=Date.now()+5000;while(!globalThis.credentialFixture.pendingHosted){if(Date.now()>end)throw Error('No held review');await new Promise(r=>setTimeout(r,10))}})
 await page.evaluate(()=>window.goalloom.sync({type:'sign-out'}));await signIn(b)
 await app.evaluate(()=>{globalThis.credentialFixture.holdHosted=false})
 const current=await review(false);assert(current.ok);assert.equal(current.value.headline,second.value.headline)
 const beforeRelease=await calls();await app.evaluate(()=>globalThis.releaseHosted?.());assert.equal((await old).ok,false)
 assert.equal((await review(false)).value.headline,current.value.headline);assert.equal(await calls(),beforeRelease)
 check('A held A response cannot populate B’s cache or remove B’s newer request/result')
 const cachedDraft=await draft();assert(cachedDraft.ok);let cacheCalls=await calls()
 assert.equal((await review(false,true)).ok,false);assert.equal((await draft(true)).ok,false);assert.equal(await calls(),cacheCalls)
 assert((await review(true,false,'explicit-first')).ok);const explicitFirst=await calls();assert.equal((await review(false,true,'explicit-first')).ok,false);assert.equal(await calls(),explicitFirst)
 cacheCalls=await calls()
 check('An explicit first attempt also locks subsequent automatic calls for that review intent')
 check('A changed summary fingerprint invalidates applicability without unlocking a prior hosted intent')
 await page.reload();await page.locator('.board').waitFor()
 assert((await draft()).ok);assert((await review(false)).ok);assert.equal(await calls(),cacheCalls)
 check('Unadopted summary and arrangement results persist across renderer restart without a new call')
 await page.evaluate(async accountId=>{const api=window.goalloom,generation=(await api.getSnapshot()).workspace.generation;await api.smart({type:'feature',generation,accountId,feature:'smart',provider:'hosted',enabled:true})},b)
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('goalloom:ai-refresh',null))
 await page.waitForFunction(async()=>{const {aiSource}=await import('/state/ai-scope.ts');return aiSource('smart')?.provider==='hosted'})
 await app.evaluate(()=>{globalThis.credentialFixture.dropHosted=true})
 await page.keyboard.press('Meta+n');const input=page.locator('.composer-input').first();await input.fill('Synthetic capture with a dropped completed response')
 await page.getByRole('button',{name:'重新生成',exact:true}).waitFor()
 const lostCalls=await calls(),originalIds=await app.evaluate(()=>[...globalThis.credentialFixture.hostedActions])
 await page.evaluate(async()=>{const api=window.goalloom,s=await api.getSnapshot();await api.execute({type:'create',operationId:crypto.randomUUID(),generation:s.workspace.generation,title:'Unrelated context revision',description:'',dueDate:null,horizon:'later',parentId:null,expectedParentVersion:null,flowColor:null})})
 await page.getByRole('button',{name:'重新生成',exact:true}).waitFor()
 assert.equal(await calls(),lostCalls)
 await input.press('Escape');await page.keyboard.press('Meta+n')
 await page.getByRole('button',{name:'重新生成',exact:true}).waitFor();assert.equal(await calls(),lostCalls)
 await input.press('Enter');await page.waitForFunction(async()=>(await window.goalloom.getSnapshot()).items.some(item=>item.title==='Synthetic capture with a dropped completed response'))
 assert.equal(await calls(),lostCalls)
 check('Dropped completed response, unrelated board refresh and Enter retain one model attempt and the saved task')
 await page.keyboard.press('Meta+n');await input.fill('Synthetic capture with a dropped completed response');await waitForNewCall(lostCalls);await page.getByRole('button',{name:'重新生成',exact:true}).waitFor();assert((await calls())>lostCalls)
 const newDraftCalls=await calls()
 await input.fill('Synthetic changed input B');await waitForNewCall(newDraftCalls);await page.getByRole('button',{name:'重新生成',exact:true}).waitFor();assert((await calls())>newDraftCalls)
 const changedInputCalls=await calls()
 await input.fill('Synthetic capture with a dropped completed response');await waitForNewCall(changedInputCalls);await page.getByRole('button',{name:'重新生成',exact:true}).waitFor();assert((await calls())>changedInputCalls)
 check('A newly typed same-title draft and real A-to-B-to-A edits each authorize a new attempt without reusing historical input locks')
 await app.evaluate(()=>{globalThis.credentialFixture.dropHosted=false;globalThis.credentialFixture.holdHosted=true;globalThis.credentialFixture.pendingHosted=false})
 await page.getByRole('button',{name:'重新生成',exact:true}).focus();await page.keyboard.press('Enter')
 await app.evaluate(async()=>{const end=Date.now()+5000;while(!globalThis.credentialFixture.pendingHosted){if(Date.now()>end)throw Error('No explicit retry');await new Promise(resolve=>setTimeout(resolve,10))}})
 const retryCalls=await calls(),newIds=await app.evaluate(()=>[...globalThis.credentialFixture.hostedActions]);assert(retryCalls>lostCalls);assert(!originalIds.includes(newIds.at(-1)))
 await input.press('Enter');await page.waitForFunction(async()=>(await window.goalloom.getSnapshot()).items.filter(item=>item.title==='Synthetic capture with a dropped completed response').length===2)
 assert.equal(await calls(),retryCalls)
 await app.evaluate(()=>{globalThis.credentialFixture.holdHosted=false;globalThis.releaseHosted?.()})
 await page.waitForFunction(async()=>(await window.goalloom.getSnapshot()).items.filter(item=>item.title==='Synthetic capture with a dropped completed response').some(item=>item.placement.horizon==='day'))
 const beforeUndo=(await page.evaluate(()=>window.goalloom.getSnapshot())).items.length
 await page.keyboard.press('Meta+z');await page.waitForFunction(async n=>(await window.goalloom.getSnapshot()).items.length===n-1,beforeUndo)
 assert.equal(await calls(),retryCalls)
 check('Keyboard regeneration uses a new action, Enter creates once, late completion and one-step undo retain creation ownership')
 await app.evaluate(()=>{globalThis.credentialFixture.dropHosted=true})
 await page.keyboard.press('Meta+n');await input.fill('Synthetic retry with storage quota')
 await page.getByRole('button',{name:'重新生成',exact:true}).waitFor();const quotaOriginalCalls=await calls()
 await page.evaluate(()=>{window.captureStorageSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('goalloom.capture-attempt.'))throw new DOMException('Synthetic capacity limit','QuotaExceededError');return window.captureStorageSetItem.call(this,key,value)}})
 await app.evaluate(()=>{globalThis.credentialFixture.dropHosted=false;globalThis.credentialFixture.holdHosted=true;globalThis.credentialFixture.pendingHosted=false})
 await page.getByRole('button',{name:'重新生成',exact:true}).click()
 await app.evaluate(async()=>{const end=Date.now()+5000;while(!globalThis.credentialFixture.pendingHosted){if(Date.now()>end)throw Error('Quota retry not dispatched');await new Promise(resolve=>setTimeout(resolve,10))}})
 const quotaRetryCalls=await calls();assert.equal(quotaRetryCalls,quotaOriginalCalls+1)
 await page.evaluate(async()=>{const api=window.goalloom,s=await api.getSnapshot();await api.execute({type:'create',operationId:crypto.randomUUID(),generation:s.workspace.generation,title:'Unrelated refresh during quota retry',horizon:'later'})})
 await page.getByRole('button',{name:'重新生成',exact:true}).waitFor();assert.equal(await calls(),quotaRetryCalls);assert.equal(await input.inputValue(),'Synthetic retry with storage quota')
 await input.press('Enter');await page.waitForFunction(async()=>(await window.goalloom.getSnapshot()).items.filter(item=>item.title==='Synthetic retry with storage quota').length===1)
 assert.equal(await calls(),quotaRetryCalls)
 await app.evaluate(()=>{globalThis.credentialFixture.holdHosted=false;globalThis.releaseHosted?.()})
 await page.evaluate(()=>{Storage.prototype.setItem=window.captureStorageSetItem;delete window.captureStorageSetItem})
 check('Storage write failure preserves one explicit retry in memory; unrelated refresh and Enter keep its attempt and saved input')
 await page.evaluate(async()=>{const api=window.goalloom,s=await api.getSnapshot();await api.execute({type:'create',operationId:crypto.randomUUID(),generation:s.workspace.generation,title:'Synthetic parent for inline matching',description:'',dueDate:null,horizon:'cycle',parentId:null,expectedParentVersion:null,flowColor:null})})
 await page.getByRole('button',{name:'在今天新建',exact:true}).click();const inline=page.locator('[data-horizon="day"] .quick-add-title')
 await app.evaluate(()=>{globalThis.credentialFixture.dropHosted=true})
 await inline.fill('Synthetic inline lost result');await page.locator('.quick-add-smart').getByRole('button',{name:'重新生成',exact:true}).waitFor()
 const inlineCalls=await calls()
 const periodDrift=await page.evaluate(async()=>{const {CaptureInput}=await import('/state/capture-input.ts'),{aiSourceOptions}=await import('/state/ai-scope.ts');const s=await window.goalloom.getSnapshot(),day=s.periods.find(period=>period.horizon==='day'),input=new CaptureInput();const request=await input.request(s,aiSourceOptions('smart').source.revision,'Synthetic inline lost result',0,0,{horizon:'day',startDate:Temporal.PlainDate.from(day.startDate).add({days:1}).toString()});return window.goalloom.smart({type:'analyze',...aiSourceOptions('smart'),request})})
 assert.equal(periodDrift.reply.status,'failed');assert.equal(await calls(),inlineCalls)
 check('A date/period target refresh changes preview applicability without authorizing a second hosted call')
 await inline.press('Escape');await page.getByRole('button',{name:'在今天新建',exact:true}).click();assert.equal(await inline.inputValue(),'Synthetic inline lost result')
 await page.locator('.quick-add-smart').getByRole('button',{name:'重新生成',exact:true}).waitFor();assert.equal(await calls(),inlineCalls)
 await inline.press('Enter');await page.waitForFunction(async()=>(await window.goalloom.getSnapshot()).items.some(item=>item.title==='Synthetic inline lost result'));assert.equal(await calls(),inlineCalls)
 check('QuickAdd remount and Enter cannot authorize another charged attempt for unchanged input')
 await inline.fill('Synthetic inline lost result');await waitForNewCall(inlineCalls);await page.locator('.quick-add-smart').getByRole('button',{name:'重新生成',exact:true}).waitFor()
 const newInlineCalls=await calls();assert(newInlineCalls>inlineCalls)
 await inline.press('Enter');await page.waitForFunction(async()=>(await window.goalloom.getSnapshot()).items.filter(item=>item.title==='Synthetic inline lost result').length===2);assert.equal(await calls(),newInlineCalls)
 check('A new inline draft after creation may reuse the title with a fresh authorized attempt')
 await inline.fill('');await inline.press('Escape')
 await app.evaluate(()=>{const f=globalThis.credentialFixture;f.dropHosted=false;f.holdHosted=true;f.pendingHosted=false;f.matchProbability=0.99})
 await page.getByRole('button',{name:'在今天新建',exact:true}).click();await inline.fill('Synthetic superseded attempt')
 await app.evaluate(async()=>{const end=Date.now()+5000;while(!globalThis.credentialFixture.pendingHosted){if(Date.now()>end)throw Error('Missing original attempt');await new Promise(resolve=>setTimeout(resolve,10))}})
 await page.evaluate(async()=>{const api=window.goalloom,s=await api.getSnapshot();const result=await api.execute({type:'create',operationId:crypto.randomUUID(),generation:s.workspace.generation,title:'Context revision while a response is held',horizon:'later'});if(!result.ok)throw Error('Context fixture write failed')})
 await page.getByRole('button',{name:'重新生成',exact:true}).waitFor()
 const heldCalls=await calls()
 await app.evaluate(()=>{globalThis.credentialFixture.holdHosted=false;globalThis.credentialFixture.matchProbability=0})
 await page.getByRole('button',{name:'重新生成',exact:true}).click();await page.locator('.quick-add-smart[data-phase="ready"]').waitFor()
 await inline.press('Enter');await page.waitForFunction(async()=>(await window.goalloom.getSnapshot()).items.some(item=>item.title==='Synthetic superseded attempt'))
 await page.evaluate(async()=>{const api=window.goalloom,s=await api.getSnapshot(),item=s.items.find(item=>item.title==='Synthetic superseded attempt');await api.execute({type:'edit',operationId:crypto.randomUUID(),generation:s.workspace.generation,itemId:item.id,expectedVersion:item.version,title:item.title,description:'Manual notes after retry',dueDate:null})})
 await app.evaluate(()=>globalThis.releaseHosted?.())
 const superseded=(await page.evaluate(()=>window.goalloom.getSnapshot())).items.filter(item=>item.title==='Synthetic superseded attempt')
 assert.equal(superseded.length,1);assert.equal(superseded[0].placement.horizon,'day');assert.equal((await page.evaluate(id=>window.goalloom.getItem(id),superseded[0].id)).item.description,'Manual notes after retry');assert.equal(await calls(),heldCalls+1);assert(!(await page.evaluate(()=>window.goalloom.getSnapshot())).relations.some(edge=>edge.childId===superseded[0].id))
 check('Context invalidation retains a held attempt; explicit retry wins and the late old response cannot replace its saved task or manual notes')
 await app.evaluate(()=>{globalThis.credentialFixture.dropHosted=true})
 await inline.fill('Synthetic unfinished restart draft');await page.locator('.quick-add-smart').getByRole('button',{name:'重新生成',exact:true}).waitFor()
 await app.close();app=null
 app=await electron.launch({args:[resolve('tests/fixtures/credential-entry.mjs'),`--user-data-dir=${profile}`],env:{...env,GOALLOOM_HOSTED_USER:b}});page=await app.firstWindow();page.on('dialog',dialog=>dialog.accept().catch(()=>{}));await page.locator('.board').waitFor()
 assert((await review(false)).ok);assert((await draft()).ok);assert.equal(await calls(),0)
 await app.evaluate(()=>{globalThis.credentialFixture.dropHosted=true})
 const restored=await page.evaluate(async()=>{const {CaptureInput}=await import('/state/capture-input.ts'),{aiSourceOptions}=await import('/state/ai-scope.ts'),s=await window.goalloom.getSnapshot(),day=s.periods.find(p=>p.horizon==='day'),capture=new CaptureInput();const request=await capture.request(s,aiSourceOptions('smart').source.revision,'Synthetic unfinished restart draft',0,0,{horizon:'day',startDate:day.startDate});return window.goalloom.smart({type:'analyze',...aiSourceOptions('smart'),request})})
 assert.equal(restored.reply.status,'failed');assert.equal(await calls(),0)
 check('Process restart reuses both device caches and preserves sent-attempt tombstones without inference replay')
 await page.getByRole('button',{name:'在今天新建',exact:true}).click();const restarted=page.locator('[data-horizon="day"] .quick-add-title');await restarted.fill('Synthetic inline lost result')
 await page.locator('.quick-add-smart').getByRole('button',{name:'重新生成',exact:true}).waitFor();assert((await calls())>0)
 check('A genuine new input after restart remains eligible while reconstructed unfinished input is not replayed')
 await restarted.fill('');await restarted.press('Escape')
 const locales={zh:['重新生成','重新生成会发起新的 AI 请求。','AI 结果未送达，输入和已保存的任务已保留。'],en:['Regenerate','Regenerate sends a new AI request.','The AI result was not delivered. Your input and saved tasks are kept.'],ja:['再生成','再生成すると、新しい AI リクエストを送信します。','AI の結果を受信できませんでした。入力と保存済みタスクは保持されています。'],es:['Volver a generar','Volver a generar envía una nueva solicitud de IA.','No se recibió el resultado de IA. Se conservan la entrada y las tareas guardadas.'],fr:['Régénérer','Régénérer envoie une nouvelle requête à l’IA.','Le résultat de l’IA n’a pas été reçu. Votre saisie et vos tâches enregistrées sont conservées.']}
 for(const [locale,[label,hint,message]] of Object.entries(locales)) {
  await page.evaluate(async locale=>{const next=await window.goalloom.setLanguage(locale);const {setLocale}=await import('/i18n/index.ts');await setLocale(next.locale)},locale)
  await page.waitForFunction(locale=>document.documentElement.lang.split('-')[0]===locale,locale)
  await page.keyboard.press('Meta+n');const field=page.locator('.composer-input'),title=`Synthetic delivery loss locale ${locale}`;await field.fill(title)
  const regenerate=page.getByRole('button',{name:label,exact:true});await regenerate.waitFor()
  assert.equal(await regenerate.getAttribute('aria-description'),hint)
  assert.equal(await page.locator('.composer-cand [role="alert"]').innerText(),message)
  assert.equal(await field.inputValue(),title);await regenerate.focus();assert(await regenerate.evaluate(node=>node===document.activeElement))
  const attempted=await calls();await field.press('Enter');await page.waitForFunction(async title=>(await window.goalloom.getSnapshot()).items.filter(item=>item.title===title).length===1,title);assert.equal(await calls(),attempted)
 }
 report.verifiedLocales=Object.keys(locales)
 check('Five-language result-loss feedback, keyboard regeneration focus and accessible request explanations preserve input and immediate Enter without a second call')
 report.ok=true
}catch(error){report.error='cache_acceptance_failed';report.failureType=error.name;report.location=error.stack?.match(/hosted-ai-cache\.mjs:\d+:\d+/)?.[0]??null;report.appState=await page?.evaluate(async()=>({visible:document.visibilityState,focused:document.hasFocus(),activeTag:document.activeElement?.tagName,tone:document.querySelector('.composer-cand')?.getAttribute('data-tone'),revision:(await window.goalloom.getSnapshot()).workspace.revision})).catch(()=>null);report.calls=await app?.evaluate(()=>({count:globalThis.credentialFixture.modelCalls,analyses:globalThis.credentialFixture.analyses})).catch(()=>null);process.exitCode=1}
finally{await app?.evaluate(()=>globalThis.releaseHosted?.()).catch(()=>{});await app?.close();await server.close();await rm(profile,{recursive:true,force:true});await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(`Evidence: ${join(out,'report.json')}`)}
