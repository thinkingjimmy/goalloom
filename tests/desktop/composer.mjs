import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'

// 真实窗口：可跳过 Onboarding、全局 composer 普通模式、会话草稿、列头＋键盘路径与拆解入口；不调用任何云服务。
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2]
const profile = await mkdtemp(join(tmpdir(), 'Goalloom 输入测试 '))
// Assertions use Chinese copy; pin the device language instead of following the machine's system language.
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
const tabSteps = {}
try {
  const page = await application.firstWindow()
  page.on('pageerror', error => console.error(error.message))
  // --- Onboarding 第 1 步：写下三个月的方向，Enter 前进；第 2 步预览把它放进 3个月，确认前不写入。 ---
  const direction = page.getByRole('textbox', { name: '三个月的方向', exact: true })
  await direction.fill('上线 2.0 版本')
  await direction.press('Enter')
  await page.getByRole('heading', { name: '「上线 2.0 版本」会放进 3个月', exact: true }).waitFor()
  await page.getByRole('figure', { name: '确认后，你的看板会是这样' }).getByText('待确认', { exact: true }).waitFor()
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).items.length, 0)
  await page.screenshot({ path: 'output/tests/screenshots/onboarding-calendar.png' })
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  // --- Onboarding 第 3 步：预设示例与两个按钮；选择连接才出现 Key 表单，同意默认未勾选，提交按钮在底栏。 ---
  const connect = page.getByRole('button', { name: '连接 Jev', exact: true }), skip = page.getByRole('button', { name: '暂时跳过', exact: true })
  await connect.waitFor()
  assert.equal(await skip.isVisible(), true)
  await page.getByRole('figure', { name: 'Jev 示例：一句话整理成三项行动' }).waitFor()
  await page.screenshot({ path: 'output/tests/screenshots/onboarding-jev.png' })
  assert.equal(await page.getByLabel(/API Key/).count(), 0)
  await connect.click()
  await page.getByLabel('TypeSafe API Key').waitFor()
  assert.equal(await page.getByRole('checkbox', { name: '我同意把上述内容发送给所选服务处理' }).isChecked(), false)
  assert.equal(await page.getByRole('button', { name: '测试并启用', exact: true }).isDisabled(), true)
  await page.getByRole('radio', { name: 'Vercel AI Gateway', exact: true }).click()
  await page.getByLabel('AI Gateway API Key').waitFor()
  await page.getByText('模型：typesafe-ai/jev（固定，不可修改）').waitFor()
  await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  await page.getByRole('button', { name: '上线 2.0 版本', exact: true }).waitFor()
  const first = await page.evaluate(() => window.goalloom.getSnapshot())
  assert.equal(first.items.length, 1)
  assert.deepEqual([first.items[0].title, first.items[0].placement.horizon, first.items[0].flowColor], ['上线 2.0 版本', 'cycle', 0])
  assert(first.workspace.setupConfirmedAt)
  // --- 列头＋键盘路径：记录 Tab 从顶栏设置按钮到「在今天新建」的实际步数，随前方任务控件增长。 ---
  const measure = async label => {
    await page.getByRole('button', { name: '设置与数据', exact: true }).focus()
    for (let step = 1; step <= 2000; step++) {
      await page.keyboard.press('Tab')
      if (await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === '在今天新建')) { tabSteps[label] = step; return }
    }
    throw new Error('Tab 无法到达今天列＋')
  }
  await measure('direction only')
  // --- 设置 → 智能输入：已有用户入口；未启用。 ---
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '智能输入', exact: true }).click()
  await page.getByText('未启用 · 全局＋保存为 Later').waitFor()
  await page.getByRole('dialog', { name: '设置与数据' }).getByRole('button', { name: '关闭', exact: true }).click()
  // --- 全局 composer 会话草稿：关闭保留，重新打开恢复，清空放弃。 ---
  await page.getByRole('button', { name: '新建', exact: true }).click()
  const composer = page.getByRole('textbox', { name: '写下想法', exact: true })
  await composer.fill('本月发布内测版；本周完成登录功能；今天写文案')
  await page.getByText('全局＋用于收集或智能整理；列头＋仍在对应列快速录入。').waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: '新建' }).waitFor({ state: 'hidden' })
  await page.keyboard.press('ControlOrMeta+n')
  assert.equal(await composer.inputValue(), '本月发布内测版；本周完成登录功能；今天写文案')
  await page.getByRole('button', { name: '清空草稿', exact: true }).click()
  await page.getByRole('dialog', { name: '新建' }).waitFor({ state: 'hidden' })
  await page.keyboard.press('ControlOrMeta+n')
  assert.equal(await composer.inputValue(), '')
  await composer.fill('一段想法')
  await page.getByRole('button', { name: /保存到 Later/ }).click()
  await page.getByRole('dialog', { name: '新建' }).waitFor({ state: 'hidden' })
  await page.locator('.toast').getByText('已创建事项「一段想法」').waitFor()
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).items.filter(item => item.placement.horizon === 'later').length, 1)
  const seed = count => page.evaluate(async count => {
    const snapshot = await window.goalloom.getSnapshot()
    for (let index = 0; index < count; index++) {
      const reply = await window.goalloom.execute({ type: 'create', title: `前方任务 ${index}`, horizon: ['later', 'cycle', 'month', 'week'][index % 4], generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw new Error(reply.message)
    }
  }, count)
  await measure('1 task (Later)')
  await seed(11); await page.getByRole('button', { name: '前方任务 10', exact: true }).waitFor(); await measure('12 tasks')
  await seed(48); await page.getByRole('button', { name: '前方任务 47', exact: true }).waitFor(); await measure('60 tasks')
  assert(tabSteps['60 tasks'] > tabSteps['12 tasks'] && tabSteps['12 tasks'] > tabSteps['1 task (Later)'] && tabSteps['1 task (Later)'] >= tabSteps['direction only'])
  // Enter 与 Space 都启动今天列 QuickAdd，保留列名与连续输入；全局 Cmd/Ctrl+N 仍是 composer。
  await page.keyboard.press('Enter')
  const today = page.getByRole('textbox', { name: '新建到今天', exact: true })
  await today.waitFor()
  await today.fill('列内连续一'); await today.press('Enter')
  await page.getByRole('button', { name: '列内连续一', exact: true }).waitFor()
  await today.fill('列内连续二'); await today.press('Enter')
  await page.getByRole('button', { name: '列内连续二', exact: true }).waitFor()
  await today.press('Escape')
  await page.getByRole('button', { name: '在今天新建', exact: true }).focus()
  await page.keyboard.press('Space')
  await today.waitFor()
  await today.press('Escape')
  const created = (await page.evaluate(() => window.goalloom.getSnapshot())).items.filter(item => item.title.startsWith('列内连续'))
  assert(created.every(item => item.placement.horizon === 'day'))
  await page.getByRole('button', { name: '在今天新建', exact: true }).focus()
  await page.keyboard.press('ControlOrMeta+n')
  await composer.waitFor()
  await page.keyboard.press('Escape')
  // 详情「拆解下一步」保留带上级的显式创建。
  await page.getByRole('button', { name: '列内连续一', exact: true }).click()
  await page.getByRole('button', { name: /拆解下一步/ }).first().click()
  const split = page.locator('.quick-add input')
  await split.waitFor()
  await split.fill('拆解出的下一步'); await split.press('Enter')
  await page.getByRole('button', { name: '拆解出的下一步', exact: true }).waitFor()
  const final = await page.evaluate(() => window.goalloom.getSnapshot())
  const child = final.items.find(item => item.title === '拆解出的下一步'), parent = final.items.find(item => item.title === '列内连续一')
  assert(final.relations.some(edge => edge.parentId === parent.id && edge.childId === child.id))
  await split.press('Escape')
  // Failure cases: a committed write leaves a cached draft after closing, or its
  // delayed receipt clears newer input. Only receipt delivery is held; IPC and SQLite stay real.
  await application.evaluate(({ipcMain})=>{
    const original=ipcMain._invokeHandlers.get('goalloom:command')
    globalThis.reviewCommand=original
    ipcMain.removeHandler('goalloom:command')
    ipcMain.handle('goalloom:command',async(...args)=>{
      const reply=await original(...args), gate=globalThis.reviewReceipt
      if(gate) await new Promise(resolve=>gate.release=resolve)
      return reply
    })
  })
  for(const outcome of ['closed','edited']) {
    await page.keyboard.press('ControlOrMeta+n')
    const title=`Close during save ${outcome}`
    await composer.fill(title)
    await application.evaluate(()=>{globalThis.reviewReceipt={}})
    await page.getByRole('button',{name:/保存到 Later/}).click()
    await application.evaluate(async()=>{
      for(let i=0;i<200;i++) {
        if(globalThis.reviewReceipt.release)return
        await new Promise(resolve=>setTimeout(resolve,10))
      }
      throw Error('Receipt gate was not reached')
    })
    await page.locator('.composer-modal .modal-header').getByRole('button',{name:'关闭',exact:true}).click()
    if(outcome==='edited') {
      await page.keyboard.press('ControlOrMeta+n')
      await composer.fill('New text after save dialog closed')
    }
    await application.evaluate(()=>{globalThis.reviewReceipt.release();delete globalThis.reviewReceipt})
    await page.waitForFunction(()=>!document.querySelector('.fab').disabled)
    if(outcome==='closed')await page.locator('.fab').click()
    assert.equal(await composer.inputValue(),outcome==='closed'?'':'New text after save dialog closed')
    assert.equal((await page.evaluate(()=>window.goalloom.getSnapshot())).items.filter(item=>item.title===title).length,1)
    if(outcome==='edited')await page.getByRole('button',{name:'清空草稿',exact:true}).click()
    else await page.keyboard.press('Escape')
  }
  await application.evaluate(({ipcMain})=>{
    ipcMain.removeHandler('goalloom:command')
    ipcMain.handle('goalloom:command',globalThis.reviewCommand)
    delete globalThis.reviewCommand
  })
  const runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const record = { packaged: Boolean(packaged), runtime, tabStepsToTodayAdd: tabSteps, checks: ['direction draft not written before confirm', 'direction becomes 3-month flow root', 'onboarding two choices', 'form only after connect', 'consent unchecked', 'skip keeps calendar', 'settings entry', 'composer session draft', 'plain single Later', 'column + Enter/Space', 'continuous column entry', 'Cmd+N stays composer', 'split keeps parent', 'closed composer consumes a committed receipt', 'reopened input survives an earlier receipt'] }
  await mkdir('output/tests', { recursive: true })
  await writeFile('output/tests/composer.json', JSON.stringify(record, null, 2))
  console.log(JSON.stringify(record))
} finally { await application.close(); await rm(profile, { recursive: true, force: true }) }
