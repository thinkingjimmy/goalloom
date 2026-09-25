import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'

// Live composer against the real OpenRouter Jev: needs OPENROUTER_API_KEY in the git-ignored .env.local; never printed or saved.
// Not part of verify (costs a few calls). Artifacts: output/tests/screenshots/composer-live-*.png and output/tests/composer-live.json.
const key = (await readFile('.env.local', 'utf8').catch(() => '')).match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1]?.trim()
if (!key) { console.error('OPENROUTER_API_KEY missing in .env.local'); process.exit(1) }
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2]
const profile = await mkdtemp(join(tmpdir(), 'Goalloom 实测输入 '))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
const shot = name => page.screenshot({ path: `output/tests/screenshots/composer-live-${name}.png` })
const page = await application.firstWindow()
const checks = []
try {
  await mkdir('output/tests/screenshots', { recursive: true })
  await page.setViewportSize({ width: 1200, height: 860 })
  page.on('pageerror', error => console.error(error.message))
  const direction = page.getByRole('textbox', { name: '三个月的方向', exact: true })
  await direction.fill('副业收入提升到 $5k'); await direction.press('Enter')
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  await page.getByRole('button', { name: '连接 Jev', exact: true }).click()
  await page.getByRole('radio', { name: 'OpenRouter', exact: true }).click()
  await page.getByLabel('OpenRouter API Key').fill(key)
  await page.getByRole('checkbox', { name: /我同意/ }).check()
  await page.getByRole('button', { name: '测试并启用', exact: true }).click()
  await page.getByRole('main', { name: '时间看板' }).waitFor({ timeout: 30_000 })
  checks.push('connect OpenRouter via onboarding')
  await page.evaluate(async () => {
    const snapshot = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ type: 'create', title: 'Bottega 正式对外，同时开启商业化', horizon: 'month', generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw new Error(reply.message)
  })
  const composer = page.getByRole('textbox', { name: '写下想法', exact: true })
  const dialog = page.getByRole('dialog', { name: '新建' })
  const snapshot = () => page.evaluate(() => window.goalloom.getSnapshot())

  // --- ① A goal reached by project name is adopted into the recommendation: linked and moved to 本周 before ↵. ---
  await page.keyboard.press('ControlOrMeta+n')
  await composer.fill('Bottega 远端控制功能完成验收（Web 控制 PC）')
  await dialog.getByText(/归到「Bottega 正式对外，同时开启商业化」下/).waitFor({ timeout: 20_000 })
  await dialog.getByRole('button', { name: /创建到本周/ }).waitFor()
  await shot('1-recommendation')
  await composer.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  let board = await snapshot()
  const acceptance = board.items.find(item => item.title === 'Bottega 远端控制功能完成验收（Web 控制 PC）')
  const goal = board.items.find(item => item.title === 'Bottega 正式对外，同时开启商业化')
  assert.equal(acceptance.placement.horizon, 'week')
  assert(board.relations.some(edge => edge.parentId === goal.id && edge.childId === acceptance.id))
  checks.push('half-sure parent adopted by default, ↵ created in 本周 under Bottega')

  // --- ② A feature description stays one item; its wording lands in the notes verbatim. ---
  await page.keyboard.press('ControlOrMeta+n')
  await composer.fill('搞个个人网站（放一些碎碎念，学习笔记等），然后里面有个判断排行榜，专门用于记录自己的各类判断。')
  await dialog.locator('.composer-plan').waitFor({ timeout: 20_000 })
  await shot('2-website')
  await composer.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  board = await snapshot()
  const site = board.items.find(item => item.title === '搞个个人网站（放一些碎碎念，学习笔记等）')
  assert.equal((await page.evaluate(id => window.goalloom.getItem(id), site.id)).item.description, '然后里面有个判断排行榜，专门用于记录自己的各类判断。')
  checks.push('one item, notes keep original punctuation')

  // --- ③ A written list keeps written columns and the named project's goal. ---
  await page.keyboard.press('ControlOrMeta+n')
  await composer.fill('今天去银行办卡\n本周把 Bottega 官网上线\n以后有空学做饭')
  await dialog.getByRole('button', { name: /创建 3 项/ }).waitFor({ timeout: 20_000 })
  await shot('3-list')
  await composer.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  board = await snapshot()
  const placed = Object.fromEntries(['今天去银行办卡', '本周把 Bottega 官网上线', '以后有空学做饭'].map(title => [title, board.items.find(item => item.title === title)?.placement.horizon]))
  assert.deepEqual(placed, { '今天去银行办卡': 'day', '本周把 Bottega 官网上线': 'week', '以后有空学做饭': 'later' })
  checks.push('three items in 今天/本周/Later')
  const runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const record = { packaged: Boolean(packaged), provider: 'openrouter', runtime, checks }
  await writeFile('output/tests/composer-live.json', JSON.stringify(record, null, 2))
  console.log(JSON.stringify(record))
} catch (error) { await shot('failure').catch(() => undefined); throw error }
finally { await application.close(); await rm(profile, { recursive: true, force: true }) }
