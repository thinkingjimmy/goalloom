import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

await build({ configFile: false, build: { outDir: 'output/tests/build/history', emptyOutDir: false, lib: { entry: 'tests/desktop/fixtures/history-seed.ts', formats: ['cjs'], fileName: () => 'history-seed.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
const profile = await mkdtemp(join(tmpdir(), 'Goalloom 历史测试 '))
const seed = spawnSync(electronPath, ['output/tests/build/history/history-seed.cjs', profile], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
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
  assert.equal(await month.getByRole('button', { name: '在本月新建' }).count(), 0)
  assert.equal(await month.locator('.drag-handle').count(), 0)
  await month.getByRole('button', { name: '返回当前' }).focus()
  await page.keyboard.press('ControlOrMeta+n')
  await page.getByRole('textbox', { name: '新建到Later', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '视图', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '已完成', exact: true }).click()
  await page.getByRole('button', { name: '视图', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '时间看板', exact: true }).click()
  await month.getByRole('button', { name: /后来完成样本/ }).waitFor()
  await month.getByRole('button', { name: '返回当前' }).click()
  await month.getByRole('button', { name: '往期未完成 · 1' }).click()
  await page.getByRole('checkbox', { name: '选择 往期待办样本' }).check()
  await page.getByRole('button', { name: '安排到当前本月' }).click()
  await page.getByRole('button', { name: '暂不处理' }).click()
  await month.getByRole('button', { name: '往期待办样本', exact: true }).waitFor()
  await page.locator('.toast').getByRole('button', { name: /^撤销/ }).click()
  await month.getByRole('button', { name: '往期未完成 · 1' }).waitFor()
  const item = await page.evaluate(id => window.goalloom.getItem(id), fixture.waitingId)
  assert(item.item.placement.holdPeriodId)
  assert.equal(item.item.placement.periodId.split(':').at(-1), fixture.sourceDate)
  // 恢复一个仍含任务的工作区必须销毁旧代次的历史页和新建请求。
  await month.getByRole('button', { name: '查看本月上一期' }).click()
  await month.getByText('这个周期没有安排过条目。').waitFor()
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '备份', exact: true }).click()
  await page.getByRole('button', { name: '立即备份', exact: true }).click()
  const manual = page.locator('.backup-record').filter({ hasText: '手动' }).first()
  await manual.getByRole('button', { name: '预览恢复', exact: true }).click()
  await page.getByRole('button', { name: '创建保护备份并继续', exact: true }).click()
  await page.getByRole('checkbox', { name: '我已了解旧数据只能从保护备份恢复' }).check()
  await page.getByRole('button', { name: '确认恢复工作区', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await month.getByRole('button', { name: '在本月新建', exact: true }).isEnabled(), true)
  assert.equal(await page.locator('.history-rows').count(), 0)
  assert.equal(await page.locator('.quick-add').count(), 0)
  const runtime = await page.evaluate(() => window.goalloom.getRuntime())
  console.log(JSON.stringify({ packaged: Boolean(packaged), runtime, checks: ['empty history', 'end state and later outcome', 'read-only history', 'session retains column history', 'backlog batch', 'undo returns old period with hold', 'restore clears old history and pending create'] }))
} finally { await app.close(); await rm(profile, { recursive: true, force: true }) }
