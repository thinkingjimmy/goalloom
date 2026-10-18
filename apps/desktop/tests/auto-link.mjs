/**
 * [INPUT]: Built Electron, isolated profiles, a held synthetic Jev transport and optional --inline-feedback selection.
 * [OUTPUT]: Visible inline feedback, immediate capture, manual priority and grouped undo evidence in output/tests/auto-link.
 * [POS]: Native UI acceptance through production preload/main/SQLite; provider transport alone is synthetic.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, release, tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { finishSetup } from './fixtures/setup.mjs'
import { pollPage } from './fixtures/poll.mjs'
import { runInlineCaptureFeedback } from './fixtures/inline-capture.mjs'

const out = resolve('output/tests/auto-link')
await mkdir(out, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'Goalloom automatic capture '))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
let page
const report = { passed: false, scope: 'Source Electron, real IPC/SQLite, synthetic Jev; no packaged/Windows acceptance', host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model }, checks: [], captures: [] }
const check = value => { report.checks.push(value); console.log(`✓ ${value}`) }
try {
  page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow, safeStorage, ipcMain }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)
    safeStorage.isEncryptionAvailable = () => true
    safeStorage.encryptString = value => Buffer.from(value)
    safeStorage.decryptString = value => value.toString()
    const f = globalThis.captureFixture = { hold: false, waiters: [], holdStatus: false, statusWaiters: [], calls: [], analyses: [], receipts: [], target: 'Delivery target', extraTarget: null, fail: false, failAll: false, conflict: false, noMatches: false, peakConcurrency: 0, dropReplyTitle: null }
    const analyze = ipcMain._invokeHandlers.get('goalloom:smart'), execute = ipcMain._invokeHandlers.get('goalloom:command')
    ipcMain.removeHandler('goalloom:smart'); ipcMain.removeHandler('goalloom:command')
    ipcMain.handle('goalloom:smart', async (...args) => {
      if (args[1].type === 'status' && f.holdStatus) await new Promise(resolve => f.statusWaiters.push(resolve))
      const reply = await analyze(...args)
      if (args[1].type === 'analyze') f.analyses.push({ text: args[1].request.text, status: reply.reply.status })
      return reply
    })
    ipcMain.handle('goalloom:command', async (...args) => {
      const reply = await execute(...args)
      if (reply.ok && ['create', 'createPlan'].includes(args[1].type)) f.receipts.push({ ...reply.result, committedAtMs: Date.now() })
      const title = args[1].title ?? args[1].items?.[0]?.title
      if (reply.ok && title === f.dropReplyTitle) { f.dropReplyTitle = null; throw Error('Synthetic lost command reply') }
      return reply
    })
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/chat/completions')) return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] })
      if (!String(url).endsWith('/systemone')) throw Error('Unexpected provider URL')
      const body = JSON.parse(init.body)
      if (body.questions.task) return Response.json({ model: 'typesafe/jev-1.14-20261014', answers: {
        horizon: { type: 'choice', choice: 'day', probabilities: { day: 0.97, week: 0.02, later: 0.01 } }, task: { type: 'noul', noul: 0.99 },
      } })
      const call = { text: body.state.text ?? body.state.task?.original, count: Object.keys(body.questions).length, bytes: Buffer.byteLength(init.body), model: body.model, settled: false, startedAtMs: Date.now(),
        historicalChild: Object.values(body.questions).some(question => typeof question.instructions === 'object' && question.instructions.candidate?.title === 'Delivery target' && question.instructions.existingChildren.some(child => child.title === 'Archived Delivery precedent')) }
      f.calls.push(call)
      f.peakConcurrency = Math.max(f.peakConcurrency, f.calls.filter(row => !row.settled).length)
      if (f.hold) try { await new Promise((resolve, reject) => {
        f.waiters.push(resolve)
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      }) } catch (error) { call.settled = true; call.elapsedMs = Date.now() - call.startedAtMs; throw error }
      call.settled = true; call.elapsedMs = Date.now() - call.startedAtMs
      if (f.failAll || f.fail && Object.values(body.questions).some(question => typeof question.instructions === 'object' && question.instructions.candidate?.title === 'Budget candidate 59')) return Response.json({ error: { code: 503 } }, { status: 503 })
      const answers = Object.fromEntries(Object.entries(body.questions).map(([id, q]) => {
        if (q.type === 'noul' || q.type === 'boolean') {
          const candidate = typeof q.instructions === 'object' ? q.instructions.candidate : null
          return [id, { type: 'noul', noul: !f.noMatches && candidate && [f.target, f.extraTarget, 'Annual delivery'].includes(candidate.title) ? 0.99 : 0.01 }]
        }
        const keys = Object.keys(q.criteria)
        const choice = id === 'layout' ? f.conflict ? 'list' : 'single' : id.startsWith('role_') ? 'task' : id.startsWith('horizon_') || id.startsWith('infer_') ? f.conflict && id.endsWith('s2') ? 'week' : 'day' : keys.includes('other') ? 'other' : keys[0]
        return [id, { type: 'choice', choice, probabilities: Object.fromEntries(keys.map(key => [key, key === choice ? 1 : 0])) }]
      }))
      return Response.json({ model: 'typesafe/jev-1.14-20261014', answers, usage: { input_tokens: 1000 } })
    }
  })
  await finishSetup(page, { skipAi: false })
  await page.getByRole('button', { name: '连接 AI 服务', exact: true }).click()
  await page.getByLabel('OpenRouter API Key').fill('synthetic-capture-key')
  await page.getByRole('checkbox', { name: '我同意把智能输入和洞察需要的内容发送给 OpenRouter' }).check()
  await page.getByRole('button', { name: '测试并开启', exact: true }).click()
  await page.getByRole('heading', { name: '已连接 OpenRouter', exact: true }).waitFor()
  await page.getByRole('button', { name: '进入看板', exact: true }).click()
  await page.locator('.board').waitFor()
  if (await page.locator('#later-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('#later-toggle').click()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const ids = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const create = async values => {
      const result = await window.goalloom.execute({ type: 'create', operationId: crypto.randomUUID(), generation, ...values })
      if (!result.ok) throw Error(result.message)
      return result.result.itemId
    }
    const root = await create({ title: 'Annual delivery', horizon: 'year', flowColor: 0 })
    for (let i = 0; i < 10; i++) await create({ title: `Unrelated goal ${i}`, horizon: 'month' })
    const target = await create({ title: 'Delivery target', horizon: 'week', parentId: root, expectedParentVersion: (await window.goalloom.getItem(root)).item.version })
    const precedent = await create({ title: 'Archived Delivery precedent', horizon: 'day', parentId: target, expectedParentVersion: (await window.goalloom.getItem(target)).item.version })
    const archived = await window.goalloom.execute({ type: 'archive', operationId: crypto.randomUUID(), generation, itemId: precedent, expectedVersion: (await window.goalloom.getItem(precedent)).item.version, archived: true })
    if (!archived.ok) throw Error(archived.message)
    return { root, target }
  })
  const hold = () => app.evaluate(() => { globalThis.captureFixture.hold = true })
  const releaseProvider = () => app.evaluate(() => { const f = globalThis.captureFixture; f.hold = false; f.waiters.splice(0).forEach(resolve => resolve()) })
  const snapshot = () => page.evaluate(() => window.goalloom.getSnapshot())
  const analyzed = title => app.evaluate(async (_, title) => {
    const deadline = Date.now() + 10000
    while (!globalThis.captureFixture.analyses.some(row => row.text === title)) {
      if (Date.now() > deadline) throw Error(`Capture analysis did not settle: ${JSON.stringify({ calls: globalThis.captureFixture.calls, analyses: globalThis.captureFixture.analyses })}`)
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }, title)
  const item = async title => (await snapshot()).items.find(row => row.title === title)
  const linked = (id, parentId = ids.target) => pollPage(page, async ({ id, parentId }) => (await window.goalloom.getSnapshot()).relations.some(edge => edge.childId === id && edge.parentId === parentId), { id, parentId }, { label: 'saved item receives its own late parent' })
  const globalCapture = async (title, measureCard = false, savedTitle = title) => {
    await page.keyboard.press('ControlOrMeta+n')
    const field = page.getByRole('textbox', { name: '写下想法', exact: true })
    await field.fill(title)
    const start = Date.now()
    await field.press('Enter')
    await page.getByRole('dialog', { name: '新建', exact: true }).waitFor({ state: 'hidden' })
    const created = await item(savedTitle)
    assert(created, 'Enter commits while the provider is held')
    const receipt = await app.evaluate((_, id) => globalThis.captureFixture.receipts.find(row => row.itemId === id), created.id)
    const timing = { title, enterToCommittedMs: receipt.committedAtMs - start, initialHorizon: created.placement.horizon }
    if (measureCard) {
      await page.getByRole('button', { name: title, exact: true }).waitFor()
      timing.enterToCardObservedMs = Date.now() - start
    }
    report.captures.push(timing)
    return created
  }
  await runInlineCaptureFeedback({ app, page, out, ids, check })
  const runCaptureCases = async () => {
    await hold()
    const first = await globalCapture('今天完成 Delivery 文案 https://example.test/delivery?instruction=ignore', true)
    assert.equal(first.placement.horizon, 'later')
    assert(!(await snapshot()).relations.some(edge => edge.childId === first.id))
    await page.screenshot({ path: `${out}/created-before-provider.png` })
    await releaseProvider()
    await linked(first.id)
    assert.equal((await page.evaluate(id => window.goalloom.getItem(id), first.id)).item.placement.horizon, 'day')
    assert.deepEqual((await snapshot()).relations.filter(edge => edge.childId === first.id).map(edge => edge.parentId), [ids.target], 'Selected descendant removes the redundant ancestor')
    assert((await app.evaluate(() => globalThis.captureFixture.calls)).some(call => call.historicalChild), 'Direct-child summaries include archived work without making it an automatic candidate')
    check('Enter before debounce creates one Later immediately; the closed composer later fills column/parents across more than eight candidates')
    await page.keyboard.press('ControlOrMeta+z')
    await pollPage(page, async id => !!(await window.goalloom.getItem(id)).item.deletedAt, first.id)
    await page.locator('.toast').getByRole('button', { name: '还原', exact: true }).click()
    await linked(first.id)
    assert.equal((await page.evaluate(id => window.goalloom.getItem(id), first.id)).item.placement.horizon, 'day')
    check('One undo removes creation and completion; scoped restore retains the completed position and relations')

    await hold()
    const edited = await globalCapture('今天编辑后保持手动选择')
    await page.evaluate(async id => {
      const detail = await window.goalloom.getItem(id), generation = (await window.goalloom.getSnapshot()).workspace.generation
      const result = await window.goalloom.execute({ type: 'edit', operationId: crypto.randomUUID(), generation, itemId: id, expectedVersion: detail.item.version, title: 'Manual title wins', description: '', dueDate: null })
      if (!result.ok) throw Error(result.message)
    }, edited.id)
    await releaseProvider()
    await pollPage(page, () => true)
    await app.evaluate(async () => {
      const deadline = Date.now() + 5000
      while (globalThis.captureFixture.calls.some(call => !call.settled)) {
        if (Date.now() > deadline) throw Error('Synthetic capture transport did not settle')
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    })
    const manual = await page.evaluate(id => window.goalloom.getItem(id), edited.id)
    assert.equal(manual.item.title, 'Manual title wins')
    assert.equal(manual.item.placement.horizon, 'later')
    assert.equal(manual.relations.length, 0)
    check('A manual edit before the late answer cancels every automatic completion field')

    await hold()
    await page.getByRole('button', { name: '在今天新建', exact: true }).click()
    const inline = page.getByRole('textbox', { name: '新建到今天', exact: true })
    await inline.fill('Ship the Delivery acceptance checklist')
    const inlineStart = Date.now()
    await inline.press('Enter')
    await page.getByRole('button', { name: 'Ship the Delivery acceptance checklist', exact: true }).waitFor()
    const inlineItem = await item('Ship the Delivery acceptance checklist')
    const inlineReceipt = await app.evaluate((_, id) => globalThis.captureFixture.receipts.find(row => row.itemId === id), inlineItem.id)
    report.captures.push({ title: inlineItem.title, enterToCommittedMs: inlineReceipt.committedAtMs - inlineStart, enterToCardObservedMs: Date.now() - inlineStart, initialHorizon: inlineItem.placement.horizon })
    assert.equal(inlineItem.placement.horizon, 'day')
    await inline.fill('Next draft stays untouched')
    await releaseProvider()
    await linked(inlineItem.id)
    assert.equal(await inline.inputValue(), 'Next draft stays untouched')
    assert.equal(await inline.evaluate(node => document.activeElement === node), true)
    await page.screenshot({ path: `${out}/inline-late-link.png` })
    check('Inline Enter keeps its column and continuous input/focus while the previous item receives a late parent')
    await inline.fill(''); await inline.press('Escape')

    await hold()
    const undone = await globalCapture('Undo before the late Delivery answer')
    await page.keyboard.press('ControlOrMeta+z')
    await pollPage(page, async id => !!(await window.goalloom.getItem(id)).item.deletedAt, undone.id)
    await releaseProvider()
    const deleted = await page.evaluate(id => window.goalloom.getItem(id), undone.id)
    assert(deleted.item.deletedAt)
    assert.equal(deleted.relations.length, 0)
    check('Undo wins when the provider has not completed')

    const callsBefore = await app.evaluate(() => globalThis.captureFixture.calls.length)
    const url = await globalCapture('https://example.test/delivery')
    assert.equal(url.placement.horizon, 'later')
    assert.equal(await app.evaluate(() => globalThis.captureFixture.calls.length), callsBefore, 'URL-only input is not sent for inference')
    check('URL-only input stays unlinked without a provider request')

    await app.evaluate(() => { globalThis.captureFixture.conflict = true })
    await hold()
    const conflicting = await globalCapture('今天准备发布材料\n下周整理验收记录', false, '今天准备发布材料')
    await releaseProvider()
    await app.evaluate(async () => {
      const deadline = Date.now() + 10000
      while (globalThis.captureFixture.calls.some(call => !call.settled)) {
        if (Date.now() > deadline) throw Error('Conflicting-time capture did not settle')
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    })
    const conflictDetail = await page.evaluate(id => window.goalloom.getItem(id), conflicting.id)
    assert.equal(conflictDetail.item.description, '今天准备发布材料\n下周整理验收记录')
    assert.equal(conflictDetail.item.placement.horizon, 'later')
    assert.equal(conflictDetail.relations.length, 0)
    await app.evaluate(() => { globalThis.captureFixture.conflict = false })
    check('A late multi-task result with conflicting times retains one raw Later item and its description')

    await page.getByRole('button', { name: '在今天新建', exact: true }).click()
    const ready = page.getByRole('textbox', { name: '新建到今天', exact: true })
    const readyTitle = 'Ready result joins the Delivery creation transaction'
    await ready.fill(readyTitle)
    await analyzed(readyTitle)
    await ready.press('Enter')
    await page.getByRole('button', { name: readyTitle, exact: true }).waitFor()
    const readyItem = await item(readyTitle)
    const receipt = await app.evaluate((_, id) => globalThis.captureFixture.receipts.find(row => row.itemId === id), readyItem.id)
    assert.equal(receipt.capture.pending, false)
    assert((await snapshot()).relations.some(edge => edge.childId === readyItem.id && edge.parentId === ids.target))
    check('A ready inline result is included in the original creation transaction')

    await ready.fill('An explicit no-flow choice stays unlinked')
    await page.locator('.quick-add').getByRole('button').first().click()
    await page.getByRole('option', { name: '不加入流程', exact: true }).click()
    await ready.press('Enter')
    const noFlow = await item('An explicit no-flow choice stays unlinked')
    assert(noFlow)
    assert(!(await snapshot()).relations.some(edge => edge.childId === noFlow.id))
    check('Explicit no-flow selection wins over an in-flight or future suggestion')
    await ready.fill('My manually chosen new flow')
    await page.locator('.quick-add').getByRole('button').first().click()
    await page.locator('.flow-picker .swatch').last().click()
    await ready.press('Enter')
    const newFlow = await item('My manually chosen new flow')
    assert.equal(newFlow.flowColor, 7)
    assert(!(await snapshot()).relations.some(edge => edge.childId === newFlow.id))
    await ready.press('Escape')
    check('A manually created flow retains its colour and never receives an automatic parent')

    await app.evaluate(() => { globalThis.captureFixture.dropReplyTitle = 'Lost reply Delivery capture' })
    await hold()
    const lost = await globalCapture('Lost reply Delivery capture')
    await releaseProvider(); await linked(lost.id)
    await page.keyboard.press('ControlOrMeta+z')
    await pollPage(page, async id => !!(await window.goalloom.getItem(id)).item.deletedAt, lost.id)
    assert.equal((await page.evaluate(id => window.goalloom.getItem(id), readyItem.id)).item.deletedAt, null)
    check('An unknown creation reply recovers its receipt and retains one correctly ordered undo entry')

    const future = await page.evaluate(async () => {
      const snapshot = await window.goalloom.getSnapshot(), day = snapshot.periods.find(period => period.horizon === 'day')
      const later = new Date(`${day.startDate}T12:00:00Z`); later.setUTCDate(later.getUTCDate() + 40)
      const startDate = later.toISOString().slice(0, 10), generation = snapshot.workspace.generation
      later.setUTCDate(later.getUTCDate() - ((later.getUTCDay() || 7) - snapshot.workspace.calendar.weekStart + 7) % 7)
      const weekStart = later.toISOString().slice(0, 10)
      const created = await window.goalloom.execute({ type: 'create', operationId: crypto.randomUUID(), generation, title: 'Future delivery target', horizon: 'week', period: { kind: 'date', startDate: weekStart } })
      if (!created.ok) throw Error(created.message)
      return { parentId: created.result.itemId, startDate }
    })
    await app.evaluate(() => { globalThis.captureFixture.target = 'Future delivery target' })
    await hold()
    const futureCapture = await page.evaluate(async ({ startDate }) => {
      const snapshot = await window.goalloom.getSnapshot(), generation = snapshot.workspace.generation
      const request = { requestId: crypto.randomUUID(), draftSessionId: crypto.randomUUID(), inputRevision: 1, manualRevision: 0,
        generation, providerRevision: (await window.goalloom.smart({ type: 'status', generation })).status.features.smart.revision,
        contextRevision: snapshot.workspace.revision, referenceTime: snapshot.observedAt, text: 'Deliver the future release checklist', parentHints: [], target: { horizon: 'day', startDate } }
      const created = await window.goalloom.execute({ type: 'create', operationId: crypto.randomUUID(), generation, title: request.text, horizon: 'day', period: { kind: 'date', startDate }, smartCapture: { request, allowPlacement: false, allowParents: true } })
      if (!created.ok) throw Error(created.message)
      return created.result.itemId
    }, future)
    await releaseProvider(); await linked(futureCapture, future.parentId)
    assert.equal((await page.evaluate(id => window.goalloom.getItem(id), futureCapture)).period.startDate, future.startDate)
    check('Explicit future capture sees the longer-horizon goals for that date and retains its chosen period')
    await app.evaluate(() => { globalThis.captureFixture.target = 'Delivery target' })

    await app.evaluate(() => { globalThis.captureFixture.noMatches = true })
    await hold()
    const unmatched = await globalCapture('今天取回不属于任何目标的快递')
    await releaseProvider()
    await pollPage(page, async id => (await window.goalloom.getItem(id)).item.placement.horizon === 'day', unmatched.id)
    assert.equal((await page.evaluate(id => window.goalloom.getItem(id), unmatched.id)).relations.length, 0)
    await hold()
    const negative = await globalCapture('今天写邮件，不关联「Delivery target」，do not relink to Annual delivery')
    await releaseProvider()
    await pollPage(page, async id => (await window.goalloom.getItem(id)).item.placement.horizon === 'day', negative.id)
    assert.equal((await page.evaluate(id => window.goalloom.getItem(id), negative.id)).relations.length, 0)
    check('Chinese negation and English relink wording cannot become forced explicit parents')
    await hold()
    const explicit = await globalCapture('今天关联「Delivery target」并写发布邮件')
    await releaseProvider(); await linked(explicit.id)
    check('An unambiguous explicit parent reference remains selected independently of the model probability')
    await app.evaluate(() => { globalThis.captureFixture.noMatches = false })
    check('No semantic match leaves parents empty while a clear execution time can still complete')

    await page.evaluate(async () => {
      const generation = (await window.goalloom.getSnapshot()).workspace.generation
      for (let index = 0; index < 60; index++) {
        const result = await window.goalloom.execute({ type: 'create', title: `Budget candidate ${index}`, horizon: 'month', operationId: crypto.randomUUID(), generation })
        if (!result.ok) throw Error(result.message)
      }
      const result = await window.goalloom.execute({ type: 'create', title: 'Independent budget goal', horizon: 'month', flowColor: 1, operationId: crypto.randomUUID(), generation })
      if (!result.ok) throw Error(result.message)
    })
    await app.evaluate(() => { globalThis.captureFixture.extraTarget = 'Independent budget goal' })
    await hold()
    const multi = await globalCapture('今天完成两个目标共同需要的验收材料')
    await releaseProvider(); await linked(multi.id)
    await pollPage(page, async id => (await window.goalloom.getSnapshot()).relations.filter(edge => edge.childId === id).length === 2, multi.id)
    assert((await app.evaluate(() => globalThis.captureFixture.calls)).every(call => call.count <= 64 && call.bytes <= 64 * 1024 && call.model === 'typesafe/jev-1.14'))
    assert.equal(await app.evaluate(() => globalThis.captureFixture.peakConcurrency), 2)
    check('Budget batches cover more than 64 candidates and retain two independent parents')
    await app.evaluate(() => { globalThis.captureFixture.extraTarget = null; globalThis.captureFixture.fail = true })
    await hold()
    const failedTitle = '今天保存后网络失败也保留原文'
    const failed = await globalCapture(failedTitle)
    await releaseProvider()
    await app.evaluate(async (_, title) => {
      const deadline = Date.now() + 10000
      while (true) {
        const calls = globalThis.captureFixture.calls.filter(call => call.text === title)
        if (calls.length && calls.every(call => call.settled)) break
        if (Date.now() > deadline) throw Error('Failed capture transport did not settle')
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    }, failedTitle)
    const unchanged = await page.evaluate(id => window.goalloom.getItem(id), failed.id)
    assert.equal(unchanged.item.placement.horizon, 'later')
    assert.equal(unchanged.relations.length, 0)
    check('A failed batch leaves the successful capture untouched without partial parent assignment')
    await app.evaluate(() => { globalThis.captureFixture.fail = false })
    await hold()
    const timedOut = await globalCapture('今天保存后等待 Jev 超时')
    const timeoutCalls = await app.evaluate(async () => {
      const deadline = Date.now() + 12000
      while (true) {
        const calls = globalThis.captureFixture.calls.filter(call => call.text === '今天保存后等待 Jev 超时')
        if (calls.length && calls.every(call => call.settled)) return calls
        if (Date.now() > deadline) throw Error('Production provider deadline did not abort the held transport')
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    })
    assert(timeoutCalls.some(call => call.elapsedMs >= 7900))
    report.timeoutCalls = timeoutCalls
    await releaseProvider()
    assert.equal((await page.evaluate(id => window.goalloom.getItem(id), timedOut.id)).item.placement.horizon, 'later')
    check('The production Jev timeout leaves the already committed raw item usable in Later')

    await hold()
    const reloaded = await globalCapture('Reload cancels saved Delivery completion')
    await page.reload(); await page.locator('.board').waitFor()
    await releaseProvider()
    assert.equal((await page.evaluate(id => window.goalloom.getItem(id), reloaded.id)).item.placement.horizon, 'later')
    check('Renderer reload cancels pending saved work and does not resume the old request')

    await hold()
    const disabled = await globalCapture('Disable smart input before the Delivery result')
    await page.evaluate(async () => {
      const generation = (await window.goalloom.getSnapshot()).workspace.generation
      await window.goalloom.smart({ type: 'feature', generation, feature: 'smart', provider: 'openrouter', enabled: false })
    })
    await releaseProvider()
    assert.equal((await page.evaluate(id => window.goalloom.getItem(id), disabled.id)).item.placement.horizon, 'later')
    assert.equal((await page.evaluate(id => window.goalloom.getItem(id), disabled.id)).relations.length, 0)
    check('Disabling smart input cancels pending saved work without changing the successful capture')
  }
  if (!process.argv.includes('--inline-feedback')) await runCaptureCases()
  report.peakProviderConcurrency = await app.evaluate(() => globalThis.captureFixture.peakConcurrency)
  report.passed = true
} catch (error) {
  report.error = error.stack
  report.transport = await app.evaluate(() => ({ calls: globalThis.captureFixture.calls, analyses: globalThis.captureFixture.analyses })).catch(() => null)
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {})
  throw error
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
  await app.close()
  await rm(profile, { recursive: true, force: true })
}
