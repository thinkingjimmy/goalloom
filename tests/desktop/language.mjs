/**
 * [INPUT]: Built Electron, isolated profiles, an explicit week-start choice and the five supported locale catalogs.
 * [OUTPUT]: Language-switching acceptance, app-local diagnostics and settings/calendar, detail/flow menus, review guides and custom choices in every locale.
 * [POS]: Desktop localization acceptance through real renderer, main process and worker boundaries.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { finishSetup } from './fixtures/setup.mjs'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, release, tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'

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
const report = { packaged: Boolean(packaged), host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model }, system: null, detected: null, locales: {}, relaunch: null }
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
const reviewChoices = {
  zh: { move: /^移入 /, keep: '留在原处' }, en: { move: /^Move to /, keep: 'Keep in place' },
  ja: { move: /へ移動$/, keep: 'そのまま残す' }, es: { move: /^Mover a /, keep: 'Dejar en su lugar' },
  fr: { move: /^Déplacer vers /, keep: 'Laisser en place' },
}
// shadcn Select: open the trigger, then pick the option from the portaled listbox.
async function choose(page, trigger, code) {
  await trigger.click()
  report.languageMenus ??= []
  report.languageMenus.push({ requested: code, native: await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getContentBounds() }))),
    renderer: await trigger.evaluate(node => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML,
      expanded: node.getAttribute('aria-expanded'), options: [...document.querySelectorAll('[role="option"]')].map(option => option.textContent) })) })
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
const weeklyGuides = {
  zh: { heading: '回顾 本周，安排 下周', start: '开始 本周复盘', continue: '继续复盘' },
  en: { heading: 'Review This week, plan next week', start: 'Review This week', continue: 'Continue review' },
  ja: { heading: '今週を振り返り、来週を計画', start: '今週の振り返りを始める', continue: '振り返りを続ける' },
  es: { heading: 'Revisa Esta semana, planifica la próxima semana', start: 'Revisar Esta semana', continue: 'Continuar revisión' },
  fr: { heading: 'Bilan de Cette semaine, préparer la semaine prochaine', start: 'Bilan de Cette semaine', continue: 'Poursuivre le bilan' },
}
const parentLabels = { zh: '关联到上级', en: 'Link to a parent', ja: '上位に関連付け', es: 'Vincular a un superior', fr: 'Lier à un parent' }

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
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en')
  await assertTranslated(page, 'en calendar step')
  await page.screenshot({ path: `${shots}/language-setup-en.png` })
  const weekStart = await page.evaluate(() => (new Date().getDay() + 1) % 7 || 7)
  await finishSetup(page, { weekStart, skipAi: false })
  await page.getByRole('button', { name: 'Connect an AI service', exact: true }).click()
  await page.getByLabel('OpenRouter API Key').waitFor()
  await assertTranslated(page, 'en AI service step')
  await page.getByRole('radio', { name: /^Vercel AI Gateway/ }).click()
  await page.getByLabel('Vercel AI Gateway API Key').waitFor()
  await assertTranslated(page, 'en AI service step (Vercel AI Gateway)')
  await page.getByRole('button', { name: 'Back to example', exact: true }).click()
  await assertTranslated(page, 'en AI example step')
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
  await page.getByRole('main', { name: ui.en.board }).waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  report.reviewScope = await page.evaluate(async () => {
    const snapshot = await window.goalloom.getSnapshot()
    const today = snapshot.periods.find(period => period.horizon === 'day').startDate
    const month = snapshot.periods.find(period => period.horizon === 'month')
    if (today === month.startDate) return 'previousMonth'
    const tomorrow = new Date(`${today}T00:00:00Z`)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    return tomorrow.toISOString().slice(0, 10) === month.endDate ? 'both' : 'week'
  })

  // 3. Completion stays quiet; its keyboard undo and the worker error both speak English.
  await page.getByRole('button', { name: 'Add to Later', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'New item in Later', exact: true })
  await input.fill('Write report')
  await input.press('Enter')
  await input.press('Escape')
  await page.getByRole('button', { name: 'Complete Write report', exact: true }).click()
  await pollPage(page, async () => (await window.goalloom.getSnapshot()).items.find(item => item.title === 'Write report')?.status === 'done')
  assert.equal(await page.locator('.toast').count(), 0)
  await page.keyboard.press('ControlOrMeta+z')
  await page.getByRole('button', { name: 'Complete Write report', exact: true }).waitFor()
  await page.locator('.toast [role="status"]').filter({ hasText: 'Undone · Complete “Write report”' }).waitFor()
  assert.equal(await workerMessage(page), workerText.en)
  await assertTranslated(page, 'en board')
  await page.screenshot({ path: `${shots}/language-board-en.png` })
  const flowChoiceId = await page.evaluate(async () => {
    const { workspace } = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ type: 'create', title: 'Flow choice label fixture', horizon: 'week', generation: workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return reply.result.itemId
  })

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
      if (await dialog.locator('.calendar-facts').count()) await dialog.screenshot({ path: `${shots}/language-calendar-${code}.png` })
    }
    await dialog.locator('.settings-nav button').first().click()
    await page.screenshot({ path: `${shots}/language-settings-${code}.png` })
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    await page.locator(`#item-${flowChoiceId} .task-title`).hover()
    await page.locator(`#item-${flowChoiceId} .flow-dot-button`).click()
    const flowMenu = page.locator('.popover-floating .flow-choose')
    await flowMenu.waitFor()
    assert.equal(await flowMenu.locator('.menu-rich > span').nth(1).innerText(), parentLabels[code])
    const flowGeometry = await flowMenu.evaluate(node => {
      const rect = node.getBoundingClientRect()
      return { width: rect.width, left: rect.left, right: rect.right, viewport: innerWidth,
        hints: [...node.querySelectorAll('.menu-rich small')].map(hint => ({ text: hint.textContent, height: hint.getBoundingClientRect().height,
          lineHeight: parseFloat(getComputedStyle(hint).lineHeight), overflow: hint.scrollWidth > hint.clientWidth })) }
    })
    assert(flowGeometry.left >= 8 && flowGeometry.right <= flowGeometry.viewport - 8, `${code}: flow choices fit the window`)
    assert(flowGeometry.hints.every(hint => !hint.overflow), `${code}: explanations stay inside their buttons`)
    if (code === 'zh') assert(flowGeometry.hints.every(hint => hint.height <= hint.lineHeight + 1), 'Chinese hints fit without an orphaned character')
    await page.screenshot({ path: `${shots}/language-flow-choice-${code}.png` })
    await page.keyboard.press('Escape')
    await flowMenu.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: 'Write report', exact: true }).click()
    const detail = page.locator('dialog.detail')
    const rail = detail.locator('.detail-rail')
    await rail.waitFor()
    assert.equal(await rail.locator('.detail-rail-actions button').count(), 3, `${code}: rail contains cancel, archive and trash`)
    if (['en', 'es', 'fr'].includes(code)) await assertTranslated(page, `${code} detail rail`)
    await page.screenshot({ path: `${shots}/language-detail-actions-${code}.png` })
    await page.keyboard.press('Escape')
    await detail.waitFor({ state: 'detached' })
    const entry = page.locator('[data-review]')
    assert.equal(await entry.count(), 1, 'Combined reviews have a single entry')
    const guide = page.locator('.review-guide')
    assert.equal(await guide.count(), 1, 'Weekly and monthly reviews share the unified guide')
    if (report.reviewScope === 'week') {
      assert.equal(await guide.locator('h3').innerText(), weeklyGuides[code].heading)
      assert.equal((await entry.innerText()).trim(), code === 'en' ? weeklyGuides[code].start : weeklyGuides[code].continue)
      assert.equal(await page.locator('[data-horizon=week] .backlog-entry, [data-horizon=week] .insight-empty, [data-horizon=week] .empty-column').count(), 0)
    }
    const entryTitle = await entry.getAttribute('title')
    assert(entryTitle)
    if (report.reviewScope !== 'week') {
      const start = await page.evaluate(() => window.goalloom.getSnapshot().then(snapshot => snapshot.periods.find(period => period.horizon === 'month').startDate))
      const [year, month] = start.split('-').map(Number)
      const date = new Date(Date.UTC(year, month - (report.reviewScope === 'previousMonth' ? 2 : 1), 1))
      assert(entryTitle.includes(new Intl.DateTimeFormat(tags[code], { month: 'short', timeZone: 'UTC' }).format(date)), 'Monthly review names its actual month')
    }
    await page.screenshot({ path: `${shots}/language-review-entry-${code}.png` })
    await entry.click()
    const review = page.locator('dialog.review-drawer[open]')
    await review.locator('.review-body[aria-busy="false"]').waitFor()
    if (['en', 'es', 'fr'].includes(code)) assert(!/[\u4e00-\u9fff]/u.test(await review.innerText()), 'Review controls are translated')
    await review.locator('.review-foot .primary:not(:disabled)').waitFor()
    const reviewTitle = await review.locator('.review-head h2').innerText()
    await review.screenshot({ path: `${shots}/language-review-drawer-${code}.png` })
    let closingMenu = 'No unfinished review step in this calendar window'
    if (await review.locator('.review-metrics').count() && await review.locator('.review-steps li').count() >= 3) {
      await review.locator('.review-foot .primary').click()
      const choice = review.locator('.review-close-row').first().getByRole('combobox')
      await choice.waitFor()
      assert.match(await choice.innerText(), reviewChoices[code].move)
      assert.equal(await review.locator('.review-close-row small').count(), 0)
      await choice.click()
      const list = review.getByRole('listbox')
      await list.waitFor()
      await list.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)))
      assert.equal(await list.getByRole('option').count(), 3)
      assert.equal(await list.getByRole('option', { name: reviewChoices[code].keep, exact: true }).count(), 1)
      if (['en', 'es', 'fr'].includes(code)) assert(!/[\u4e00-\u9fff]/u.test(await review.innerText()), 'Default-move guidance and options are translated')
      const bounds = await list.evaluate(node => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, viewport: innerWidth } })
      assert(bounds.left >= 0 && bounds.right <= bounds.viewport, 'Translated options stay within the window')
      await review.screenshot({ path: `${shots}/language-review-menu-${code}.png` })
      await page.keyboard.press('Escape')
      await list.waitFor({ state: 'detached' })
      await page.waitForFunction(label => document.activeElement?.getAttribute('aria-labelledby') === label, await choice.getAttribute('aria-labelledby'))
      assert.equal(await choice.evaluate(node => document.activeElement === node), true)
      assert.equal(await review.isVisible(), true)
      await review.locator('.review-foot .review-text-button').click()
      closingMenu = { defaultMove: 'ok', optionCount: 3, keepLabel: reviewChoices[code].keep, escapeFocus: 'ok', ...bounds }
    }
    await review.locator('.review-head .icon-button').click()
    await review.waitFor({ state: 'hidden' })
    report.locales[code] = { lang: tags[code], panes, worker: 'ok', untranslatedCheck: ['en', 'es', 'fr'].includes(code), entryTitle, reviewTitle,
      flowMenu: { parentLabel: parentLabels[code], ...flowGeometry }, detailActions: 'Three visible rail actions; Escape closes details', closingMenu }
    await page.getByRole('button', { name: ui[code].settings, exact: true }).click()
    dialog = settingsDialog(page, ui[code].settings)
    await dialog.waitFor()
  }

  // 5. Choose French and quit: the preference lives outside the workspace and is read before storage starts.
  await dialog.locator('.settings-nav button').first().click()
  await choose(page, dialog.locator('.settings-select'), 'fr')
  await settingsDialog(page, ui.fr.settings).waitFor()
  assert.deepEqual(JSON.parse(await readFile(join(profile, 'preferences.json'), 'utf8')), { language: 'fr' })
} catch (error) {
  const page = await application.firstWindow()
  report.failure = { error: String(error), native: await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getContentBounds() }))),
    renderer: await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML,
      language: document.querySelector('#setup-language')?.outerHTML, options: [...document.querySelectorAll('[role="option"]')].map(option => option.textContent) })) }
  await writeFile('output/tests/language-failure.json', JSON.stringify(report, null, 2))
  await page.screenshot({ path: `${shots}/language-failure.png` })
  throw error
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
