/**
 * [INPUT]: The freshly installed Windows executable and an ephemeral runner directory.
 * [OUTPUT]: Synthetic setup, local task persistence and unconfigured sync evidence.
 * [POS]: Hosted smoke for the exact public Windows candidate.
 */
// Failure cases: launch uses the wrong version or profile, paid sync is available,
// default setup fails, a task is lost after restart, or the renderer throws.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const [executable, version, evidence] = process.argv.slice(2)
assert(executable && version === '1.12.3' && evidence && process.env.RUNNER_TEMP)
const profile = await mkdtemp(join(resolve(process.env.RUNNER_TEMP), 'goalloom-runtime-'))
const env = { ...process.env }
for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'NODE_PATH', 'GOALLOOM_SUPABASE_URL', 'GOALLOOM_SUPABASE_ANON_KEY']) delete env[key]
const title = 'Windows installer synthetic task'
const report = { passed: false, source: process.env.GITHUB_SHA, version, checks: [], rendererErrors: [] }
let app

async function launch() {
  app = await electron.launch({ executablePath: executable, cwd: dirname(executable), args: [`--user-data-dir=${profile}`], env, timeout: 30000 })
  const identity = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion(), profile: app.getPath('userData') }))
  assert(identity.packaged && identity.version === version && resolve(identity.profile) === profile, 'Installed application must use the synthetic profile')
  const page = await app.firstWindow({ timeout: 30000 })
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => {
    if (report.rendererErrors.length < 5) report.rendererErrors.push(error.message.slice(0, 250))
  })
  return page
}

try {
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
  const page = await launch()
  await page.locator('.calendar-modes').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  assert.equal(report.runtime.platform, 'win32')
  assert.equal(report.runtime.arch, 'x64')
  assert.match(report.runtime.sqlite, /^\d+\.\d+\.\d+$/)
  const { status } = await page.evaluate(() => window.goalloom.sync({ type: 'status' }))
  assert.equal(status.phase, 'unconfigured')
  assert(!status.accountId)
  report.checks.push('Installed win32 x64 package has SQLite and local-only sync status')

  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.locator('.direction-input').waitFor()
  await page.getByRole('button', { name: 'Confirm and start', exact: true }).click()
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
  await page.locator('.board').waitFor()
  const workspace = await page.evaluate(() => window.goalloom.getSnapshot())
  assert.equal(workspace.workspace.calendar.mode, 'rolling')
  assert.equal(workspace.items.length, 0)
  report.checks.push('English setup confirms the default calendar and enters an empty board')

  const later = page.locator('[data-horizon="later"]')
  await later.locator('[data-add-item]').click()
  const input = later.getByRole('textbox')
  await input.fill(title)
  await input.press('Enter')
  await page.getByRole('button', { name: title, exact: true }).waitFor()
  const item = await page.evaluate(expected => window.goalloom.getSnapshot().then(snapshot => snapshot.items.find(task => task.title === expected)), title)
  assert(item?.id)
  await app.close()
  app = undefined

  const restarted = await launch()
  await restarted.getByRole('button', { name: title, exact: true }).waitFor()
  assert(await restarted.evaluate(({ id, title }) => window.goalloom.getSnapshot().then(snapshot => snapshot.items.some(task => task.id === id && task.title === title)), { id: item.id, title }))
  await app.close()
  app = undefined
  assert.deepEqual(report.rendererErrors, [])
  report.checks.push('The same task ID and title persist after a full process restart')
  report.passed = true
} catch (error) {
  report.failure = String(error.stack ?? error).slice(0, 2000)
  throw error
} finally {
  try { await app?.close() }
  finally {
    await mkdir(dirname(evidence), { recursive: true })
    await writeFile(evidence, JSON.stringify(report, null, 2) + '\n')
  }
}
