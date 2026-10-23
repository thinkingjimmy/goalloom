/**
 * [INPUT]: Built Electron, isolated synthetic account/cipher/provider fixture and real IPC/SQLite/renderer.
 * [OUTPUT]: Repeatable account-only onboarding, consent, A/B isolation, BYOK preservation and stale-result evidence.
 * [POS]: Hosted desktop acceptance; no real provider, native keychain or packaged/Windows claim.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir,mkdtemp,readFile,rm,writeFile } from 'node:fs/promises'
import { tmpdir,cpus,release } from 'node:os'
import { join,resolve } from 'node:path'
import { _electron as electron } from 'playwright'
const out=resolve('../../output/tests/hosted-ai/desktop'),profile=await mkdtemp(join(tmpdir(),'goalloom-hosted-'))
await mkdir(out,{recursive:true});await writeFile(join(profile,'preferences.json'),JSON.stringify({language:'zh'}))
const env={...process.env,GOALLOOM_SUPABASE_URL:'https://credential-fixture.invalid',GOALLOOM_SUPABASE_ANON_KEY:'synthetic-anon',GOALLOOM_HOSTED_FIXTURE:'1'}
delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
let app,page
const report={ok:false,checks:[],host:{os:release(),arch:process.arch,cpu:cpus()[0]?.model},scope:'Source Electron, real renderer/preload/main/SQLite; controlled OAuth, cipher and provider. No packaged, native keychain, live provider or Windows acceptance.'}
const check=name=>{report.checks.push(name);console.log(`pass ${name}`)}
const snapshot=()=>page.evaluate(()=>window.goalloom.getSnapshot())
const aiStatus=()=>page.evaluate(async()=>{const generation=(await window.goalloom.getSnapshot()).workspace.generation;return(await window.goalloom.smart({type:'status',generation})).status})
async function signIn(id) {
  await app.evaluate((_electron,id)=>{globalThis.credentialFixture.activeUserId=id},id)
  const before = await app.evaluate(()=>globalThis.credentialFixture.browser)
  const pending=page.evaluate(()=>window.goalloom.sync({type:'sign-in',provider:'apple',purpose:'ai'}))
  await page.waitForFunction(async()=>(await window.goalloom.sync({type:'status'})).status.phase==='signing-in')
  await app.evaluate(async(_electron,before)=>{const until=Date.now()+5000;while(globalThis.credentialFixture.browser<=before){if(Date.now()>until)throw Error('No OAuth browser');await new Promise(r=>setTimeout(r,10))}},before)
  const response=await fetch('http://127.0.0.1:53682/callback?code=synthetic-code',{headers:{Connection:'close'}})
  assert.equal(response.status,200);await pending
  await page.waitForFunction(async()=>(await window.goalloom.sync({type:'status'})).status.phase==='account')
}
const byok = Buffer.from('synthetic-byok-secret').map(byte=>byte^0x5a)
await mkdir(join(profile,'smart-input'),{recursive:true})
await writeFile(join(profile,'smart-input','openrouter.key'),byok)
try {
  app=await electron.launch({args:[resolve('tests/fixtures/credential-entry.mjs'),`--user-data-dir=${profile}`],env,timeout:30000})
  page=await app.firstWindow();report.runtime=await app.evaluate(()=>process.versions)
  report.rendererErrors=[];page.on('pageerror',error=>report.rendererErrors.push(error.message))
  await page.locator('.start-cards').waitFor()
  const before=await aiStatus();assert.equal(before.hostedAccountId,null)
  const a='11111111-1111-4111-8111-111111111111',b='33333333-3333-4333-8333-333333333333'
  await signIn(a)
  await page.locator('.calendar-modes').waitFor()
  await page.waitForFunction(()=>document.querySelectorAll('.onboarding-steps li').length===2)
  const logged=await aiStatus();assert.equal(logged.hostedEligible,true);assert.equal(logged.providers.hosted.consentedAt,null);assert.equal(logged.features.smart.enabled,false)
  assert.equal((await snapshot()).workspace.setupConfirmedAt,null)
  assert.equal(await app.evaluate(()=>globalThis.credentialFixture.modelCalls??0),0)
  assert(!(await app.evaluate(()=>globalThis.credentialFixture.requests)).some(path=>path.startsWith('/rest/')))
  check('Account-only login performs no sync RPC, does not confirm the calendar or consent/enable/call AI, and shows two setup steps')
  await page.locator('.onboarding-actions button').last().click();await page.locator('.direction-input').fill('')
  await page.locator('.onboarding-actions button').last().click();await page.locator('.board').waitFor()
  assert.equal(await page.locator('.onboarding').count(),0)
  check('Explicit calendar confirmation enters the board directly without optional AI or duplicate direction creation')
  await page.locator('.settings-toggle').click();const settings=page.locator('dialog.settings-modal')
  await settings.getByRole('button',{name:'AI 服务',exact:true}).click()
  const consentPath=join(profile,'smart-input',`hosted-${a}.json`),legacy=JSON.parse(await readFile(consentPath,'utf8'))
  for(const scopeVersion of [1,2]) {
    legacy.scope=scopeVersion;legacy.provider.consentedAt='2026-10-23T00:00:00.000Z';legacy.provider.capabilities={jev:legacy.provider.consentedAt,chat:legacy.provider.consentedAt}
    await writeFile(consentPath,JSON.stringify(legacy))
    assert.equal((await aiStatus()).providers.hosted.consentedAt,null)
    assert.equal(await page.evaluate(async ({accountId,scopeVersion})=>{const generation=(await window.goalloom.getSnapshot()).workspace.generation;try{await window.goalloom.smart({type:'consentHosted',generation,accountId,scopeVersion,consent:true});return false}catch{return true}},{accountId:a,scopeVersion}),true)
  }
  assert.equal(await app.evaluate(()=>globalThis.credentialFixture.modelCalls??0),0)
  check('Prior supplier/privacy consent files and scope-v1/v2 actions cannot authorize scope-v3 or call a model')
  await settings.getByRole('button',{name:'我同意发送这些数据',exact:true}).click()
  for (const locale of ['en','ja','es','fr','zh']) {
    const names = { en: 'English', ja: '日本語', es: 'Español', fr: 'Français', zh: '简体中文' }
    await settings.locator('.settings-nav-label').filter({hasText:/^(外观|Appearance|外観|Apariencia|Apparence)$/}).click()
    await settings.locator('.settings-select').click()
    await page.getByRole('option',{name:names[locale],exact:true}).click()
    await page.waitForFunction(locale=>document.documentElement.lang.split('-')[0]===locale,locale)
    await settings.locator('.settings-nav-label').filter({hasText:/^(AI 服务|AI services|AI サービス|Servicios de IA|Services d’IA)$/}).click()
    if (['en','es','fr'].includes(locale)) assert(!/[一-鿿]/.test((await settings.innerText()).replaceAll('简体中文','').replaceAll('日本語','')))
    await settings.getByText(/DeepInfra/).first().waitFor({state:'visible'})
    assert((await settings.innerText()).includes('DeepInfra') && (await settings.innerText()).includes('DeepSeek'))
    const policyTerms={en:/retain submitted content and use it for model training/,ja:/送信内容を保持し、モデルの学習/,es:/conservar el contenido enviado y usarlo para entrenar/,fr:/conserver le contenu envoyé et l’utiliser pour entraîner/,zh:/留存发送的内容，并可能用于模型训练/}
    assert.match(await settings.innerText(),policyTerms[locale])
    await settings.screenshot({path:join(out,`hosted-consent-${locale}.png`)})
  }
  await settings.getByRole('button',{name:'智能输入',exact:true}).click()
  await settings.getByRole('radio').filter({hasText:'Goalloom 内置 AI'}).click()
  await settings.getByRole('switch',{name:'智能输入',exact:true}).click()
  assert.equal((await aiStatus()).features.smart.enabled,true)
  assert.equal(await app.evaluate(()=>globalThis.credentialFixture.modelCalls??0),0)
  await page.screenshot({path:join(out,'consented-enabled.png')})
  check('Explicit account-bound consent, source selection and feature enabling use no connection test or model call')
  await page.keyboard.press('Escape')
  await app.evaluate(()=>{globalThis.credentialFixture.holdHosted=true})
  await page.keyboard.press('Meta+n');const input=page.locator('.composer-input').first();await input.fill('今天整理合成测试材料')
  await input.press('Enter')
  await page.waitForFunction(async()=>(await window.goalloom.getSnapshot()).items.some(item=>item.title==='今天整理合成测试材料'))
  await app.evaluate(async()=>{const until=Date.now()+5000;while(!globalThis.credentialFixture.pendingHosted){if(Date.now()>until)throw Error('No pending hosted capture');await new Promise(r=>setTimeout(r,10))}})
  await page.evaluate(()=>window.goalloom.sync({type:'sign-out'}))
  await app.evaluate(()=>globalThis.releaseHosted?.())
  const after=await aiStatus();assert.equal(after.hostedAccountId,null);assert.equal(after.features.smart.enabled,false);assert.equal(after.features.smart.provider,'hosted')
  assert.equal((await snapshot()).items.find(item=>item.title==='今天整理合成测试材料').placement.horizon,'later')
  check('Enter saves before the held model; sign-out cancels ownership and late completion cannot move the saved task or fall back to BYOK')
  await signIn(b);const other=await aiStatus();assert.equal(other.hostedAccountId,b);assert.equal(other.providers.hosted.consentedAt,null);assert.equal(other.features.smart.enabled,false)
  check('A new account inherits neither consent nor enabled hosted features')
  await page.keyboard.press('Meta+n');const unsent=page.locator('.composer-input');await unsent.fill('Keep this draft local until I resend')
  const beforeLogin=await app.evaluate(()=>globalThis.credentialFixture.modelCalls??0)
  await page.evaluate(()=>window.goalloom.sync({type:'sign-out'}));await signIn(a)
  await page.getByRole('button',{name:'发送给当前服务整理',exact:true}).waitFor()
  assert.equal(await unsent.inputValue(),'Keep this draft local until I resend')
  assert.equal(await app.evaluate(()=>globalThis.credentialFixture.modelCalls??0),beforeLogin)
  await unsent.fill('');await page.keyboard.press('Escape')
  check('Restoring a hosted account preserves an unsent draft and requires explicit resend without a model call')
  const restored=await aiStatus();assert.equal(restored.hostedAccountId,a);assert(restored.providers.hosted.consentedAt);assert.equal(restored.features.smart.enabled,true)
  await app.evaluate(()=>{globalThis.credentialFixture.holdHosted=false})
  const writing = await page.evaluate(async accountId=>{
    const api=window.goalloom, state=await api.getSnapshot(), generation=state.workspace.generation
    await api.smart({type:'feature',generation,accountId,feature:'insight',provider:'hosted',enabled:true})
    const currentStatus=(await api.smart({type:'status',generation})).status
    const source={provider:'hosted',accountId,revision:currentStatus.features.insight.revision,sessionRevision:currentStatus.sessionRevision}
    const prefs={about:'',stepSize:'smallest',stepNotes:'',tone:'direct',focus:[]}
    const board={today:'2026-10-23',periods:{},goals:[],unlinked:{half:[],cycle:[],month:[],week:[],day:[]}}
    const draft=await api.smart({type:'draft',source,request:{requestId:crypto.randomUUID(),generation,board,prefs,tasks:[{id:'synthetic',parent:'Publish a synthetic guide',goal:null,target:'Today',targetHorizon:'day',siblings:[]}]}})
    const review=await api.smart({type:'review',source,request:{requestId:crypto.randomUUID(),generation,scope:'week',board,prefs,signals:[]}})
    const itemId=state.items[0].id, sessionId=crypto.randomUUID()
    const preflight=await api.smart({type:'prepareAssistance',request:{sessionId,itemId,generation,locale:'zh'}})
    if(preflight.type!=='assistancePrepared')throw Error('No assistance preflight')
    const p=preflight.prepared
    const assistance=await api.smart({type:'assist',source,request:{requestId:crypto.randomUUID(),sessionId,itemId,generation,inputRevision:0,manualRevision:0,featureRevision:p.featureRevision,contextId:p.contextId,locale:'zh',turn:1,mode:'rewrite',text:'Make the next step small',answer:null,adjustment:null}})
    if(assistance.type!=='assistance'||assistance.reply.status!=='ready'||assistance.reply.value.kind!=='rewrite')throw Error('No hosted rewrite')
    const current=await api.getItem(itemId)
    const saved=await api.execute({type:'applyAssistance',itemId,generation,operationId:crypto.randomUUID(),expectedVersion:current.item.version,expectedGuidanceRevision:0,guidance:{kind:'keep'},guard:p.context.guard,contextId:p.contextId,description:assistance.reply.value.description})
    if(!saved.ok)throw Error(saved.message)
    return {draftStatus:draft.reply.status,reviewStatus:review.reply.status,description:(await api.getItem(itemId)).item.description}
  },a)
  assert.deepEqual(writing,{draftStatus:'ready',reviewStatus:'ready',description:'- [ ] Draft one synthetic paragraph'})
  check('Hosted drafting, review and note rewriting use the same source; exact-output adoption writes through the existing guarded transaction')
  await app.close()
  app=await electron.launch({args:[resolve('tests/fixtures/credential-entry.mjs'),`--user-data-dir=${profile}`],env,timeout:30000})
  page=await app.firstWindow();await page.locator('.board').waitFor()
  await page.waitForFunction(async()=>(await window.goalloom.sync({type:'status'})).status.phase==='account')
  assert.equal((await aiStatus()).features.smart.enabled,true)
  assert(!(await app.evaluate(()=>globalThis.credentialFixture.requests)).some(path=>path.startsWith('/rest/')))
  assert.equal(await app.evaluate(()=>globalThis.credentialFixture.modelCalls??0),0)
  await page.locator('.settings-toggle').click()
  await page.locator('dialog.settings-modal').getByRole('button',{name:'智能输入',exact:true}).click()
  await page.locator('dialog.settings-modal').getByRole('switch',{name:'智能输入',exact:true}).waitFor()
  await page.keyboard.press('Escape')
  await app.evaluate(()=>{globalThis.credentialFixture.hostedFailure=true})
  await page.keyboard.press('Meta+n');await page.locator('.composer-input').fill('今天整理费用保护合成样例')
  const failure=page.locator('.composer-modal').getByRole('alert');await failure.waitFor()
  assert((await failure.innerText()).includes('费用保护'))
  assert.equal(await page.locator('.composer-modal').getByRole('button',{name:'打开官方控制台获取 Key',exact:true}).count(),0)
  await page.locator('.composer-input').fill('');await page.keyboard.press('Escape')
  check('Hosted cost protection retains manual entry and never offers a provider-key recovery or automatic fallback')
  await page.evaluate(()=>window.goalloom.sync({type:'sign-out'}));assert.equal((await aiStatus()).features.smart.enabled,false)
  assert.deepEqual(await readFile(join(profile,'smart-input','openrouter.key')),byok)
  check('The original account restores across restart without sync or model calls; sign-out stays paused and preserves the encrypted BYOK key')
  assert.deepEqual(report.rendererErrors,[]);assert.deepEqual(await app.evaluate(()=>globalThis.credentialFixture.unexpected),[])
  await page.screenshot({path:join(out,'signed-out-board.png')});report.ok=true
} catch(error){
  report.error='hosted_desktop_incomplete'
  report.failureKind=['AssertionError','TimeoutError','Error'].includes(error.name)?error.name:'Error'
  report.failureState=await page?.evaluate(()=>({visible:document.visibilityState==='visible',inputFocused:document.activeElement?.matches('.composer-input')??false,unsentDraftIntact:document.querySelector('.composer-input')?.value==='Keep this draft local until I resend'})).catch(()=>null)
  report.nativeWindow=await app?.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];return window?{focused:window.isFocused(),visible:window.isVisible()}:null}).catch(()=>null)
  await page?.screenshot({path:join(out,'failure.png')}).catch(()=>{})
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n')
  // Discard only the isolated failing fixture, without racing its unsaved-draft dialog.
  await app?.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.destroy()}).catch(()=>{})
  process.exitCode=1
}
finally{await app?.close();await rm(profile,{recursive:true,force:true});await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(`Evidence: ${join(out,'report.json')}`)}
