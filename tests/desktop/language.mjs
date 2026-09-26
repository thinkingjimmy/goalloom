import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'

// Multi-language acceptance in a real window: system detection, setup and settings switching without remounting,
// main/worker messages following the choice, persistence across relaunch, and no untranslated Chinese in en/es/fr.
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2]
// ASCII profile path: the settings panes show backup paths, which must not trip the untranslated-text check.
const profile = await mkdtemp(join(tmpdir(), 'goalloom-language-'))
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const tags = { zh: 'zh-CN', en: 'en', ja: 'ja-JP', es: 'es', fr: 'fr-FR' }
const shots = 'output/tests/screenshots'
const report = { packaged: Boolean(packaged), system: null, detected: null, locales: {}, relaunch: null }
await mkdir(shots, { recursive: true })

const han = /[一-鿿]/
// Language names are intentionally shown in their own script in every UI language.
const visibleText = page => page.evaluate(() => document.body.innerText.replaceAll('简体中文', '').replaceAll('日本語', ''))
async function assertTranslated(page, where) {
  const text = await visibleText(page)
  const leak = text.split('\n').find(line => /[一-鿿]/.test(line))
  assert.equal(leak, undefined, `${where} still shows Chinese: ${leak}`)
}
// A command with a stale generation is rejected inside the storage worker, so its message proves the worker's language.
const workerMessage = page => page.evaluate(async () => (await window.goalloom.execute({ type: 'preferences', theme: 'dark', operationId: crypto.randomUUID(), generation: 'stale-generation' })).message)
const settingsDialog = (page, name) => page.getByRole('dialog', { name, exact: true })
const names = { zh: '简体中文', en: 'English', ja: '日本語', es: 'Español', fr: 'Français' }
// shadcn Select: open the trigger, then pick the option from the portaled listbox.
async function choose(page, trigger, code) {
  await trigger.click()
  await page.getByRole('option', { name: names[code], exact: true }).click()
}

const workerText = {
  zh: '工作区已更换，请刷新后重试',
  en: 'The workspace was replaced. Refresh and try again.',
  ja: 'ワークスペースが置き換えられました。更新してから再試行してください',
  es: 'El espacio de trabajo ha cambiado. Actualiza y vuelve a intentarlo',
  fr: 'L’espace de travail a été remplacé. Actualisez puis réessayez',
}
const ui = {
  en: { settings: 'Settings & data', board: 'Timeline board', smart: 'Smart input', day: 'Today' },
  ja: { settings: '設定とデータ', board: 'タイムボード', smart: 'スマート入力', day: '今日' },
  es: { settings: 'Ajustes y datos', board: 'Tablero', smart: 'Entrada inteligente', day: 'Hoy' },
  fr: { settings: 'Réglages et données', board: 'Tableau', smart: 'Saisie intelligente', day: 'Aujourd’hui' },
  zh: { settings: '设置与数据', board: '时间看板', smart: '智能输入', day: '今天' },
}

let application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
try {
  const page = await application.firstWindow()
  page.on('pageerror', error => console.error(error.message))
  const language = page.locator('#setup-language')
  await language.waitFor()

  // 1. No preference file: the UI follows the system's preferred languages (unsupported ones fall back to English).
  const system = await application.evaluate(({ app }) => app.getPreferredSystemLanguages())
  const detected = system.map(tag => tag.toLowerCase().split(/[-_]/)[0]).find(code => code in tags) ?? 'en'
  Object.assign(report, { system, detected })
  assert.equal(await page.evaluate(() => document.documentElement.lang), tags[detected])
  assert.match(await language.innerText(), new RegExp(`· ${names[detected]}$`))
  assert.deepEqual(await page.evaluate(() => window.goalloom.getLanguage()), { language: 'system', locale: detected, system: detected })

  // 2. Setup page switches instantly, before the calendar is confirmed; typed setup values survive the switch.
  await choose(page, language, 'en')
  await page.getByRole('button', { name: 'Skip', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en')
  await assertTranslated(page, 'en direction step')
  await page.screenshot({ path: `${shots}/language-setup-en.png` })
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and start', exact: true }).waitFor()
  await assertTranslated(page, 'en calendar step')
  await page.getByRole('button', { name: 'Confirm and start', exact: true }).click()
  await page.getByRole('button', { name: 'Connect Jev', exact: true }).waitFor()
  await assertTranslated(page, 'en Jev step')
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
  await page.getByRole('main', { name: ui.en.board }).waitFor()

  // 3. Completion stays quiet; its keyboard undo and the worker error both speak English.
  await page.getByRole('button', { name: 'Add to Later', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'New item in Later', exact: true })
  await input.fill('Write report')
  await input.press('Enter')
  await input.press('Escape')
  await page.getByRole('button', { name: 'Complete Write report', exact: true }).click()
  await page.waitForFunction(async () => (await window.goalloom.getSnapshot()).items.find(item => item.title === 'Write report')?.status === 'done')
  assert.equal(await page.locator('.toast').count(), 0)
  await page.keyboard.press('ControlOrMeta+z')
  await page.getByRole('button', { name: 'Complete Write report', exact: true }).waitFor()
  await page.locator('.toast [role="status"]').filter({ hasText: 'Undone · Complete “Write report”' }).waitFor()
  assert.equal(await workerMessage(page), workerText.en)
  await assertTranslated(page, 'en board')
  await page.screenshot({ path: `${shots}/language-board-en.png` })

  // 4. Settings: every pane is translated; switching language keeps the dialog open (no remount) and updates main + worker.
  await page.getByRole('button', { name: ui.en.settings, exact: true }).click()
  let dialog = settingsDialog(page, ui.en.settings)
  await dialog.waitFor()
  for (const code of ['en', 'es', 'fr', 'ja', 'zh']) {
    if (code !== 'en') {
      await dialog.locator('.settings-nav button').first().click()
      await choose(page, dialog.locator('.settings-select'), code)
      dialog = settingsDialog(page, ui[code].settings)
      await dialog.waitFor()
    }
    assert.equal(await page.evaluate(() => document.documentElement.lang), tags[code])
    await dialog.locator('.settings-nav').getByText(ui[code].smart, { exact: true }).waitFor()
    await page.getByRole('main', { name: ui[code].board }).getByText(ui[code].day, { exact: true }).first().waitFor()
    assert.equal(await workerMessage(page), workerText[code])
    const panes = await dialog.locator('.settings-nav button').count()
    for (let index = 0; index < panes; index++) {
      await dialog.locator('.settings-nav button').nth(index).click()
      if (['en', 'es', 'fr'].includes(code)) await assertTranslated(page, `${code} settings pane ${index + 1}`)
    }
    await dialog.locator('.settings-nav button').first().click()
    await page.screenshot({ path: `${shots}/language-settings-${code}.png` })
    report.locales[code] = { lang: tags[code], panes, worker: 'ok', untranslatedCheck: ['en', 'es', 'fr'].includes(code) }
  }

  // 5. Choose French and quit: the preference lives outside the workspace and is read before storage starts.
  await dialog.locator('.settings-nav button').first().click()
  await choose(page, dialog.locator('.settings-select'), 'fr')
  await settingsDialog(page, ui.fr.settings).waitFor()
  assert.deepEqual(JSON.parse(await readFile(join(profile, 'preferences.json'), 'utf8')), { language: 'fr' })
} finally { await application.close() }

try {
  application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
  const page = await application.firstWindow()
  await page.getByRole('main', { name: ui.fr.board }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'fr-FR')
  // The worker is started with the saved language, not switched afterwards.
  assert.equal(await workerMessage(page), workerText.fr)
  await assertTranslated(page, 'fr board after relaunch')
  await page.screenshot({ path: `${shots}/language-board-fr.png` })
  // Back to "match system" resolves to the detected language again.
  const state = await page.evaluate(() => window.goalloom.setLanguage('system'))
  assert.deepEqual(state, { language: 'system', locale: report.detected, system: report.detected })
  report.relaunch = { lang: 'fr-FR', worker: 'ok', backToSystem: state.locale }
  await writeFile('output/tests/language.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await application.close()
  await rm(profile, { recursive: true, force: true })
}
