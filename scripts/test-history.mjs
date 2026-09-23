import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

await build({ configFile: false, build: { outDir: '.electron-test', emptyOutDir: false, lib: { entry: 'tests/fixtures/history-seed.ts', formats: ['cjs'], fileName: () => 'history-seed.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
const profile = await mkdtemp(join(tmpdir(), 'Goalloom 历史测试 '))
const seed = spawnSync(electronPath, ['.electron-test/history-seed.cjs', profile], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
assert.equal(seed.status, 0, seed.stderr)
const fixture = JSON.parse(await readFile(join(profile, 'fixture.json'), 'utf8'))
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2]
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const app = await electron.launch({ ...options, env: environment })
try {
  const page = await app.firstWindow()
  const month = page.getByRole('region', { name: '本月列', exact: true })
  await month.getByRole('button', { name: '往期未完成 · 1' }).waitFor()
  await month.getByRole('button', { name: '查看本月上一期' }).click()
  await month.getByText('这个周期没有安排过条目。').waitFor()
  await month.getByRole('button', { name: '查看本月上一期' }).click()
  await month.getByRole('button', { name: /后来完成样本/ }).waitFor()
  assert.match(await month.getByRole('button', { name: /后来完成样本/ }).innerText(), /期末：未完成/)
  assert.match(await month.getByRole('button', { name: /后来完成样本/ }).innerText(), /后来：状态变化/)
  assert.equal(await month.getByRole('button', { name: '在本月新建' }).isDisabled(), true)
  assert.equal(await month.locator('.drag-handle').count(), 0)
  await month.getByRole('button', { name: '返回当前' }).focus()
  await page.keyboard.press('ControlOrMeta+n')
  await page.getByRole('textbox', { name: '新建到Later', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '已完成', exact: true }).click()
  await page.getByRole('button', { name: '时间看板', exact: true }).click()
  await month.getByRole('button', { name: /后来完成样本/ }).waitFor()
  await month.getByRole('button', { name: '返回当前' }).click()
  await month.getByRole('button', { name: '往期未完成 · 1' }).click()
  await page.getByRole('checkbox', { name: '选择 往期待办样本' }).check()
  await page.getByRole('button', { name: '安排到当前本月' }).click()
  await page.getByRole('button', { name: '暂不处理' }).click()
  await month.getByRole('button', { name: '往期待办样本', exact: true }).waitFor()
  await page.locator('.toast').getByRole('button', { name: '撤销', exact: true }).click()
  await month.getByRole('button', { name: '往期未完成 · 1' }).waitFor()
  const item = await page.evaluate(id => window.goalloom.getItem(id), fixture.waitingId)
  assert(item.item.placement.holdPeriodId)
  assert.equal(item.item.placement.periodId.split(':').at(-1), fixture.sourceDate)
  const runtime = await page.evaluate(() => window.goalloom.getRuntime())
  console.log(JSON.stringify({ packaged: Boolean(packaged), runtime, checks: ['empty history', 'end state and later outcome', 'read-only history', 'session retains column history', 'backlog batch', 'undo returns old period with hold'] }))
} finally { await app.close(); await rm(profile, { recursive: true, force: true }) }
