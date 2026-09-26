import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, tmpdir, version } from 'node:os'
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
// Assertions use Chinese copy; pin the device language instead of following the machine's system language.
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
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
  assert.match(await month.getByRole('button', { name: /后来完成样本/ }).innerText(), /未完成/)
  assert.match(await month.getByRole('button', { name: /后来完成样本/ }).innerText(), /现在 已完成/)
  assert.equal(await month.getByRole('button', { name: '在本月新建' }).count(), 0)
  assert.equal(await month.locator('.drag-handle').count(), 0)
  await month.getByRole('button', { name: '返回当前' }).focus()
  await page.keyboard.press('ControlOrMeta+n')
  await page.getByRole('textbox', { name: '写下想法', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  // 在设置里浏览已完成后关闭，看板历史状态不丢失。
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await page.getByRole('dialog', { name: '设置与数据' }).getByRole('button', { name: '已完成', exact: true }).click()
  await page.getByRole('dialog', { name: '设置与数据' }).getByRole('button', { name: '关闭', exact: true }).click()
  await month.getByRole('button', { name: /后来完成样本/ }).waitFor()
  await month.getByRole('button', { name: '返回当前' }).click()
  await month.getByRole('button', { name: '往期未完成 · 1' }).click()
  await page.getByRole('checkbox', { name: '选择 往期待办样本' }).check()
  await page.getByRole('button', { name: '安排到当前本月' }).click()
  await page.getByRole('button', { name: '暂不处理' }).click()
  await month.getByRole('button', { name: '往期待办样本', exact: true }).waitFor()
  assert.equal(await page.locator('.toast').count(), 0, 'Arranging backlog stays quiet')
  await page.keyboard.press('ControlOrMeta+z')
  await month.getByRole('button', { name: '往期未完成 · 1' }).waitFor()
  await page.locator('.toast [role="status"]').filter({ hasText: '已撤销' }).waitFor()
  const item = await page.evaluate(id => window.goalloom.getItem(id), fixture.waitingId)
  assert(item.item.placement.holdPeriodId)
  assert.equal(item.item.placement.periodId.split(':').at(-1), fixture.sourceDate)
  // Restore a completed past-period item through the real trash UI without changing its placement or state.
  if (await page.locator('.toast').count()) await page.getByRole('button', { name: '关闭操作提示', exact: true }).click()
  const deleted = await page.evaluate(async id => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const current = (await window.goalloom.getItem(id)).item
    const reply = await window.goalloom.execute({ type: 'delete', itemId: id, expectedVersion: current.version, generation, operationId: crypto.randomUUID() })
    return { reply, title: current.title, periodId: current.placement.periodId, status: current.status }
  }, fixture.completedId)
  assert.equal(deleted.reply.ok, true)
  assert.equal(deleted.status, 'done')
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置与数据', exact: true })
  await settings.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '回收站', exact: true }).click()
  await settings.locator('.items-row').filter({ hasText: deleted.title }).getByRole('button', { name: '还原', exact: true }).click()
  await page.locator('.toast-detail').filter({ hasText: '往期' }).waitFor()
  const destination = await page.locator('.toast-detail').innerText()
  assert.match(destination, /本月/)
  assert.match(destination, /往期/)
  assert.match(destination, /已完成/)
  await page.waitForFunction(async id => !(await window.goalloom.getItem(id)).item.deletedAt, fixture.completedId)
  const restored = (await page.evaluate(id => window.goalloom.getItem(id), fixture.completedId)).item
  assert.equal(restored.placement.periodId, deleted.periodId)
  assert.equal(restored.status, deleted.status)
  await mkdir('output/tests/screenshots', { recursive: true })
  const screenshot = 'output/tests/screenshots/feedback-past-restore.png'
  await page.screenshot({ path: screenshot })
  await settings.getByRole('button', { name: '关闭', exact: true }).click()
  if (await page.locator('.toast').count()) await page.getByRole('button', { name: '关闭操作提示', exact: true }).click()
  // 恢复一个仍含任务的工作区必须销毁旧代次的历史页和新建请求。
  await month.getByRole('button', { name: '查看本月上一期' }).click()
  await month.getByText('这个周期没有安排过条目。').waitFor()
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '备份与恢复', exact: true }).click()
  await page.getByRole('button', { name: '立即备份', exact: true }).click()
  const manual = page.locator('.backup-record').filter({ hasText: '手动' }).first()
  await manual.getByRole('button', { name: '用它恢复', exact: true }).click()
  await page.getByRole('button', { name: '创建保护备份并继续', exact: true }).click()
  await page.getByRole('checkbox', { name: '我已了解旧数据只能从保护备份恢复' }).check()
  await page.getByRole('button', { name: '确认恢复工作区', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await month.getByRole('button', { name: '在本月新建', exact: true }).isEnabled(), true)
  assert.equal(await page.locator('.history-rows').count(), 0)
  assert.equal(await page.locator('.quick-add').count(), 0)
  const runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const report = {
    passed: true, packaged: Boolean(packaged), runtime,
    environment: { platform: platform(), release: release(), version: version(), arch: arch(), cpu: cpus()[0]?.model, machineScope: process.env.GOALLOOM_TEST_MACHINE_SCOPE ?? 'Host OS reported; physical/VM status not independently verified' },
    pastRestore: { destination, screenshot, periodId: restored.placement.periodId, status: restored.status },
    checks: ['empty history', 'end state and later outcome', 'read-only history', 'session retains column history', 'backlog batch', 'undo returns old period with hold', 'past completed restore confirms original month and status', 'restore clears old history and pending create'],
  }
  await writeFile('output/tests/history.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally { await app.close(); await rm(profile, { recursive: true, force: true }) }
