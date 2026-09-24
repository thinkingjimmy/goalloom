/**
 * [INPUT]: A source or packaged Electron executable and operator-driven native file dialogs.
 * [OUTPUT]: Isolated export/restore assertions, runtime evidence and a restored-window screenshot.
 * [POS]: Packaged desktop acceptance for native paths; no dialog mocks or real workspace data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
const root = await mkdtemp(join(tmpdir(), 'Goalloom 原生对话框 ')), profile = join(root, 'profile'), exported = join(root, '工作区 导出.json')
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2]
// Prompts below are Chinese; pin the device language instead of following the machine's system language.
await mkdir(profile, { recursive: true })
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const application = await electron.launch({ ...options, env: environment })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  const page = await application.firstWindow()
  await page.getByRole('button', { name: '先跳过', exact: true }).click()
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  const original = await page.evaluate(async () => {
    const snapshot = await window.goalloom.getSnapshot(), generation = snapshot.workspace.generation
    const reply = await window.goalloom.execute({ type: 'create', title: '原生导出恢复样本', description: '中文路径 / 空格 / emoji 🌱', horizon: 'later', generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw new Error(reply.message)
    return { generation, id: reply.result.itemId }
  })
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '备份与恢复', exact: true }).click()
  await page.getByRole('button', { name: '导出', exact: true }).click()
  console.log(JSON.stringify({ stage: 'native-save-dialog', destination: exported }))
  let exists = false
  for (let n = 0; n < 360 && !exists; n++) { await pause(500); exists = await stat(exported).then(info => info.size > 0).catch(() => false) }
  assert(exists, '原生保存对话框未完成')
  const data = JSON.parse(await readFile(exported, 'utf8'))
  assert.equal(data.items[0].id, original.id)
  assert.equal(data.items[0].description, '中文路径 / 空格 / emoji 🌱')
  await page.getByRole('button', { name: '选择文件', exact: true }).click()
  console.log(JSON.stringify({ stage: 'native-open-dialog', source: exported }))
  await page.getByRole('button', { name: '创建保护备份并继续', exact: true }).waitFor({ timeout: 180_000 })
  await page.getByRole('button', { name: '创建保护备份并继续', exact: true }).click()
  await page.getByText('已创建并校验', { exact: true }).waitFor()
  const checkbox = page.getByRole('dialog', { name: '设置与数据' }).getByRole('checkbox')
  assert.equal(await checkbox.isChecked(), false)
  await checkbox.check()
  await page.getByRole('button', { name: '确认恢复工作区', exact: true }).click()
  await page.getByRole('button', { name: '确认按设置处理', exact: true }).waitFor()
  const restored = await page.evaluate(() => window.goalloom.getSnapshot())
  assert.notEqual(restored.workspace.generation, original.generation)
  assert.equal(restored.items[0].id, original.id)
  assert.equal((await page.evaluate(id => window.goalloom.getItem(id), restored.items[0].id)).item.description, '中文路径 / 空格 / emoji 🌱')
  assert.equal(restored.workspace.pausedAfterRestore, true)
  const evidence = { packaged: Boolean(packaged), runtime: await page.evaluate(() => window.goalloom.getRuntime()), checks: ['native save dialog', 'atomic JSON export', 'Chinese space path and emoji', 'native open dialog', 'validated JSON preview', 'protective backup', 'full JSON restore with new generation and pause'] }
  await mkdir('output/tests/review-fixes', { recursive: true })
  await page.screenshot({ path: 'output/tests/review-fixes/native-dialogs-restored.png' })
  await writeFile('output/tests/review-fixes/native-dialogs.json', JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence))
} finally { await application.close(); await rm(root, { recursive: true, force: true }) }
