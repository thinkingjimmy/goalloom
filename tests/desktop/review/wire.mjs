/** Failure matrix, written before changing wire validation:
 * Invalid leap days, month/day overflow, signed years, trailing text and offset/unknown zones must fail.
 * Year zero, Gregorian leap rules, UTC and IANA aliases must retain their existing acceptance.
 * The real sandboxed preload must reject malformed output in all five languages and extra fields.
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'

const profile = await mkdtemp(join(tmpdir(), 'goalloom-wire-'))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2]
const app = await electron.launch(packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`], env } : { args: ['.', `--user-data-dir=${profile}`], env })
const checks = []
try {
  const page = await app.firstWindow()
  await page.waitForFunction(() => Boolean(window.goalloom))
  assert.equal((await page.evaluate(() => window.goalloom.getLanguage())).locale, 'en')
  const fixture = await page.evaluate(async () => {
    const snapshot = await window.goalloom.getSnapshot(), generation = snapshot.workspace.generation
    const run = action => window.goalloom.execute({ ...action, generation, operationId: crypto.randomUUID() })
    const configured = await run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-09-01', confirmed: true })
    if (!configured.ok) throw Error(configured.message)
    const created = await run({ type: 'create', title: 'Wire validation fixture', description: '', horizon: 'later' })
    if (!created.ok) throw Error(created.message)
    return { detail: await window.goalloom.getItem(created.result.itemId), snapshot: await window.goalloom.getSnapshot() }
  })
  await app.evaluate(({ ipcMain }, fixture) => {
    ipcMain.removeHandler('goalloom:query')
    globalThis.wireFixture = fixture
    ipcMain.handle('goalloom:query', (_, query) => (query.type === 'item' ? globalThis.wireFixture.detail : globalThis.wireFixture.snapshot))
  }, fixture)
  const valid = ['0000-02-29', '2000-02-29', '2024-02-29', '1900-02-28', '2026-12-31', '9999-12-31']
  const invalid = ['1900-02-29', '2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '+002026-01-01', '26-01-01', '2026-1-01', '2026-01-01junk', '2026-01-01\n', '2026-01-01T00:00:00Z']
  const messages = { zh: '日期无效', en: 'Invalid date', ja: '日付が無効です', es: 'Fecha no válida', fr: 'Date non valide' }
  for (const locale of ['zh', 'en', 'ja', 'es', 'fr']) {
    await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
    for (const dueDate of [...valid, ...invalid]) {
      await app.evaluate((_, date) => { globalThis.wireFixture.detail.item.dueDate = date }, dueDate)
      const result = await page.evaluate(async () => {
        try { await window.goalloom.getItem('fixture'); return { ok: true } } catch (error) { return { ok: false, message: error.message } }
      })
      assert.equal(result.ok, valid.includes(dueDate), `${locale}: ${dueDate}`)
      if (!result.ok) assert.ok(result.message.includes(messages[locale]), `${locale} validation message`)
    }
    checks.push(`${locale}: valid and invalid dates`)
  }
  for (const timezone of ['UTC', 'Etc/GMT+8', 'Asia/Shanghai', 'US/Eastern', 'Europe/Paris', '+08:00', '08:00', 'Invalid/Zone', 'Asia/Shanghai\n']) {
    await app.evaluate((_, zone) => { globalThis.wireFixture.snapshot.workspace.calendar.timezone = zone }, timezone)
    const accepted = await page.evaluate(async () => { try { await window.goalloom.getSnapshot(); return true } catch { return false } })
    assert.equal(accepted, ['UTC', 'Etc/GMT+8', 'Asia/Shanghai', 'US/Eastern', 'Europe/Paris'].includes(timezone), timezone)
  }
  await app.evaluate(() => { globalThis.wireFixture.detail.item.dueDate = null; globalThis.wireFixture.detail.item.extra = true })
  assert.equal(await page.evaluate(async () => { try { await window.goalloom.getItem('fixture'); return true } catch { return false } }), false)
  checks.push('IANA zone boundaries', 'strict output fields')
  await mkdir('output/tests/review-fixes', { recursive: true })
  await writeFile('output/tests/review-fixes/wire.json', JSON.stringify({ packaged: Boolean(packaged), checks, runtime: await page.evaluate(() => window.goalloom.getRuntime()) }, null, 2))
  console.log(JSON.stringify({ checks }))
} finally { await app.close() }
