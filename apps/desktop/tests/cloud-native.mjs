/**
 * [INPUT]: Current source Electron build, existing credential harness and fixed synthetic retained log.
 * [OUTPUT]: Native retrieval/privacy/locale evidence, finite notice dismissal/restart and trusted-stage checks, readable exports and protected replacement.
 * [POS]: D2 native acceptance through production renderer/preload/IPC/main/worker; no live account/provider/model.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { cpus, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { _electron as electron } from 'playwright'
import { finishSetup } from './fixtures/setup.mjs'
import { pollPage } from './fixtures/poll.mjs'

const noticesOnly = process.argv.includes('--notices')
const out = resolve(`../../output/tests/billing/desktop/d2-native/runs/${Date.now()}`), profile = await mkdtemp(join(tmpdir(), 'goalloom-cloud-native-'))
await mkdir(out, { recursive: true }); await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
await build({ configFile: false, build: { target: 'node24', outDir: 'output/tests/build/cloud-native', emptyOutDir: true, lib: { entry: 'tests/cloud/native-fixture.ts', formats: ['es'], fileName: () => 'fixture.mjs' }, rollupOptions: { external: [/^node:/, 'electron'] } } })
const files = []
for (const directory of ['src', '../../packages/contracts/src', '../../packages/crypto/src', '../../packages/sync/src', '../../packages/schema/src', '../../packages/store-core/src', 'out']) {
  for (const name of await readdir(directory, { recursive: true })) if (/\.(?:ts|tsx|js|cjs|css|html)$/.test(name)) files.push(resolve(directory, name))
}
files.push(resolve('tests/cloud-native.mjs'), resolve('tests/cloud/native-fixture.ts'), resolve('tests/fixtures/credential-entry.mjs'))
const hashes = async () => Object.fromEntries(await Promise.all(files.sort().map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])))
const before = await hashes(); await writeFile(join(out, 'source-build.json'), JSON.stringify({ recordedBeforeExecution: true, files: before }, null, 2))
const env = { ...process.env, GOALLOOM_SUPABASE_URL: 'https://abcdefghijklmnopqrst.invalid', GOALLOOM_SUPABASE_ANON_KEY: 'synthetic-anon', GOALLOOM_BILLING_FIXTURE: '1', GOALLOOM_HOSTED_FIXTURE: '1', GOALLOOM_CLOUD_FIXTURE: resolve('output/tests/build/cloud-native/fixture.mjs') }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
let app, page
const report = { ok: false, selection: noticesOnly ? 'notices' : 'all', checks: [], blockers: [], errors: [], mainLogs: [], host: { os: release(), arch: process.arch, cpu: cpus()[0]?.model, physicalMachineOrVm: 'not independently established' }, scope: 'Actual source Electron UI/preload/IPC/main/SQLite/retrieval worker and real crypto with synthetic Auth, signed retained HTTP responses, save picker and terminal receipt facts. Controlled 60-second renderer callback. No live account, remote deployment, provider/model, packaged or Windows claim.' }
const check = name => { report.checks.push(name); writeFileSync(join(out, 'progress.json'), JSON.stringify(report, null, 2)); console.log(`PASS ${name}`) }
const launch = async () => {
  app = await electron.launch({ args: [resolve('tests/fixtures/credential-entry.mjs'), `--user-data-dir=${profile}`], env, timeout: 30000 })
  app.process().stderr.on('data', bytes => { report.mainLogs.push(String(bytes)); if (report.mainLogs.length > 100) report.mainLogs.shift() })
  page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.message))
  await page.locator('.start-cards, .calendar-modes, .board').first().waitFor()
  await app.evaluate(async () => { const deadline = Date.now() + 10000; while (!globalThis.credentialFixture.cloud) { if (Date.now() > deadline) throw Error('Synthetic cloud transport not ready'); await new Promise(resolve => setTimeout(resolve, 10)) } })
  await page.addInitScript(() => {
    const schedule = window.setInterval.bind(window), cancel = window.clearInterval.bind(window), timers = new Map()
    window.setInterval = (work, ms, ...args) => { const timer = schedule(work, ms, ...args); if (ms === 60000 && typeof work === 'function') timers.set(timer, () => work(...args)); return timer }
    window.clearInterval = timer => { timers.delete(timer); cancel(timer) }
    window.advanceCloudMinute = () => { for (const callback of timers.values()) callback(); return timers.size }
  })
  await page.reload(); await page.emulateMedia({ reducedMotion: 'reduce' })
}
const openCloud = async (name = 'Sync') => { await page.locator('.settings-toggle').click(); await page.locator('dialog.settings-modal').getByRole('button', { name, exact: true }).click(); await page.locator('.cloud-data').waitFor(); assert.equal(await page.locator('.cloud-notice').count(), 0) }
const state = () => page.evaluate(() => window.goalloom.cloud({ type: 'status' }))
const evidence = () => app.evaluate(() => globalThis.credentialFixture.cloud.localEvidence())
const idleCloud = () => page.waitForFunction(() => document.querySelector('.cloud-data')?.getAttribute('aria-busy') === 'false')
const billing = () => page.evaluate(async () => { const reply = await window.goalloom.billing({ type: 'refresh' }); return { accountId: reply.accountId, access: reply.access } })
const chooseLocale = async locale => {
  const names = { en: 'English', zh: '简体中文', ja: '日本語', es: 'Español', fr: 'Français' }
  const tags = { en: 'en', zh: 'zh-CN', ja: 'ja-JP', es: 'es', fr: 'fr-FR' }, sync = { en: 'Sync', zh: '同步', ja: '同期', es: 'Sincronizar', fr: 'Synchro' }
  if (await page.evaluate(tag => document.documentElement.lang === tag, tags[locale])) return
  await page.locator('.settings-nav button').first().click()
  await page.locator('dialog.settings-modal').getByRole('combobox').first().click()
  await page.getByRole('option', { name: names[locale], exact: true }).click()
  await page.waitForFunction(tag => document.documentElement.lang === tag, tags[locale])
  await page.locator('.settings-nav').getByRole('button', { name: sync[locale], exact: true }).click()
  await page.locator('.cloud-data').waitFor()
}
const localeCopy = {
  en: { content: 'Online data', contentDeleted: 'Online cloud data deleted', accountDeleted: 'Account deleted', title: 'Cloud data and privacy', refresh: 'Check cloud status', inspect: 'View tasks', sqlite: 'Export SQLite', replace: 'Replace current workspace…', cloudDelete: 'Delete this cloud data…', accountDelete: 'Delete account and cloud data…', prepare: 'Review deletion', warning: 'This stops retrieval and deletes this cloud data. Your subscription and account remain active.', confirm: 'Confirm deletion', cancel: 'Cancel', password: 'Sync password', download: 'Download copy', downloading: 'Downloading and verifying…', wrong: 'The sync password did not unlock this copy.', progress: 'Deletion progress', accepted: 'Access closed', auth: 'Account', renewal: 'Web renewal', notApplicable: 'Not applicable' },
  zh: { content: '在线数据', contentDeleted: '在线云端数据已删除', accountDeleted: '账户已删除', title: '云端数据与隐私', refresh: '检查云端状态', inspect: '查看任务', sqlite: '导出 SQLite', replace: '替换当前工作区…', cloudDelete: '删除这份云端数据…', accountDelete: '删除账户与云端数据…', prepare: '查看删除范围', warning: '这会停止取回并删除这份云端数据。订阅和账户会保留。', confirm: '确认删除', cancel: '取消', password: '同步密码', download: '下载副本', downloading: '正在下载并验证…', wrong: '同步密码未能解锁此副本。', progress: '删除进度', accepted: '访问已关闭', auth: '账户', renewal: '网页订阅续费', notApplicable: '不适用' },
  ja: { content: 'オンラインデータ', contentDeleted: 'オンラインデータ削除済み', accountDeleted: 'アカウント削除済み', title: 'クラウドデータとプライバシー', refresh: 'クラウドの状態を確認', inspect: 'タスクを表示', sqlite: 'SQLite を書き出す', replace: '現在のワークスペースを置き換える…', cloudDelete: 'このクラウドデータを削除…', accountDelete: 'アカウントとクラウドデータを削除…', prepare: '削除内容を確認', warning: '取得を停止し、このクラウドデータを削除します。契約とアカウントは残ります。', confirm: '削除を確定', cancel: 'キャンセル', password: '同期パスワード', download: 'コピーをダウンロード', downloading: 'ダウンロードして検証中…', wrong: '同期パスワードでコピーを開けませんでした。', progress: '削除の進行状況', accepted: 'アクセス停止済み', auth: 'アカウント', renewal: 'ウェブ契約の更新', notApplicable: '対象外' },
  es: { content: 'Datos en línea', contentDeleted: 'Datos en línea eliminados', accountDeleted: 'Cuenta eliminada', title: 'Datos en la nube y privacidad', refresh: 'Consultar estado', inspect: 'Ver tareas', sqlite: 'Exportar SQLite', replace: 'Reemplazar el espacio actual…', cloudDelete: 'Eliminar estos datos de la nube…', accountDelete: 'Eliminar cuenta y datos…', prepare: 'Revisar eliminación', warning: 'Detiene la recuperación y elimina estos datos de la nube. La cuenta y la suscripción permanecen activas.', confirm: 'Confirmar eliminación', cancel: 'Cancelar', password: 'Contraseña de sincronización', download: 'Descargar copia', downloading: 'Descargando y verificando…', wrong: 'La contraseña no pudo abrir esta copia.', progress: 'Progreso de eliminación', accepted: 'Acceso cerrado', auth: 'Cuenta', renewal: 'Renovación web', notApplicable: 'No aplicable' },
  fr: { content: 'Données en ligne', contentDeleted: 'Données en ligne supprimées', accountDeleted: 'Compte supprimé', title: 'Données cloud et confidentialité', refresh: 'Vérifier le cloud', inspect: 'Voir les tâches', sqlite: 'Exporter en SQLite', replace: 'Remplacer l’espace actuel…', cloudDelete: 'Supprimer ces données cloud…', accountDelete: 'Supprimer le compte et les données…', prepare: 'Examiner la suppression', warning: 'Arrête la récupération et supprime ces données cloud. Le compte et l’abonnement restent actifs.', confirm: 'Confirmer la suppression', cancel: 'Annuler', password: 'Mot de passe de synchronisation', download: 'Télécharger la copie', downloading: 'Téléchargement et vérification…', wrong: 'Le mot de passe n’a pas permis d’ouvrir cette copie.', progress: 'Progression de la suppression', accepted: 'Accès fermé', auth: 'Compte', renewal: 'Renouvellement web', notApplicable: 'Sans objet' },
}
const signIn = async (userId = '11111111-1111-4111-8111-111111111111') => {
  const browserBefore = await app.evaluate(() => globalThis.credentialFixture.browser)
  await app.evaluate((_, userId) => { globalThis.credentialFixture.activeUserId = userId }, userId)
  const signing = page.evaluate(() => window.goalloom.sync({ type: 'sign-in', provider: 'apple', purpose: 'ai' }))
  await pollPage(page, async () => { const status = (await window.goalloom.sync({ type: 'status' })).status; return status.phase === 'signing-in' || !!status.error })
  const status = (await page.evaluate(() => window.goalloom.sync({ type: 'status' }))).status
  assert.equal(status.phase, 'signing-in', JSON.stringify(status))
  await app.evaluate(async (_, before) => { const deadline = Date.now() + 5000; while (globalThis.credentialFixture.browser <= before) { if (Date.now() > deadline) throw Error('No current synthetic browser'); await new Promise(resolve => setTimeout(resolve, 10)) } }, browserBefore)
  assert.equal((await fetch('http://127.0.0.1:53682/callback?code=synthetic-cloud-code', { headers: { Connection: 'close' } })).status, 200)
  const reply = await signing; assert.equal(reply.status.accountId, userId, JSON.stringify(reply))
}
async function acceptNotices() {
  const copy = {
    en: { deadline: 'Retrieval deadline', ended: 'Cloud access ended. You can save a copy before the date shown.', week: 'Seven days or less remain to save your cloud copy.', cutoff: 'The retrieval period ended. This cloud data cannot be restored.', deleted: 'Online cloud deletion is confirmed.' },
    zh: { deadline: '取回截止时间', ended: '云端访问已结束。你可以在下方日期前保存副本。', week: '保存云端副本的剩余时间不超过 7 天。', cutoff: '取回期限已结束，这份云端数据无法恢复。', deleted: '已确认删除在线云端数据。' },
    ja: { deadline: '取得期限', ended: 'クラウドへのアクセスが終了しました。表示された期限までにコピーを保存できます。', week: 'クラウドのコピーを保存できる期間は残り7日以内です。', cutoff: '取得期間が終了しました。このクラウドデータは復元できません。', deleted: 'オンラインデータの削除を確認しました。' },
    es: { deadline: 'Plazo de recuperación', ended: 'El acceso terminó. Guarda una copia antes de la fecha indicada.', week: 'Quedan siete días o menos para guardar una copia.', cutoff: 'El plazo de recuperación terminó. Estos datos de la nube no se pueden restaurar.', deleted: 'La eliminación de los datos en línea está confirmada.' },
    fr: { deadline: 'Date limite de récupération', ended: 'L’accès au cloud a pris fin. Enregistrez une copie avant la date indiquée.', week: 'Il reste au plus sept jours pour enregistrer une copie.', cutoff: 'La période de récupération est terminée. Ces données cloud ne peuvent plus être restaurées.', deleted: 'La suppression des données en ligne est confirmée.' },
  }
  const syncNames = { en: 'Sync', zh: '同步', ja: '同期', es: 'Sincronizar', fr: 'Synchro' }
  const refresh = async (stage, remainingDays = null, locale = 'en') => {
    await app.evaluate((_, control) => Object.assign(globalThis.credentialFixture.cloud, control), { stage, remainingDays })
    await page.locator('.cloud-data').getByRole('button', { name: localeCopy[locale].refresh, exact: true }).click(); await idleCloud()
    const current = (await state()).state; assert.equal(current.error, null)
    return current
  }
  const closeSettings = async () => { await page.keyboard.press('Escape'); await page.locator('dialog.settings-modal').waitFor({ state: 'detached' }) }
  report.noticeEvidence = { before: await app.evaluate(() => globalThis.credentialFixture.cloud.localEvidenceDetails()), outboxBefore: await app.evaluate(() => globalThis.credentialFixture.cloud.outboxEvidence()) }
  await openCloud()
  report.noticeLocales = []
  for (const [locale, words] of Object.entries(copy)) {
    await chooseLocale(locale)
    for (const [stage, days] of [['ended', 8], ['week', 7], ['cutoff', 0], ['deleted', 0]]) {
      const current = await refresh(stage, days, locale)
      assert.equal(current.notices.length, 1); assert.equal(current.notices[0].stage, stage)
      if (current.entries[0].state === 'deleted') assert.deepEqual(current.entries[0].initialization, { state: 'not_applicable' })
      await closeSettings()
      const notice = page.locator('.cloud-notice'); await notice.getByText(words[stage], { exact: false }).waitFor()
      assert.equal(await notice.count(), 1)
      const date = await page.evaluate(({ value, locale }) => new Date(value).toLocaleDateString(locale), { value: current.notices[0].retrieveUntil, locale })
      assert((await notice.innerText()).includes(`${words.deadline} ${date}`))
      await page.screenshot({ path: join(out, `notice-${locale}-${stage}.png`) })
      await openCloud(syncNames[locale])
    }
    report.noticeLocales.push({ locale, stages: ['ended', 'week', 'cutoff', 'deleted'], sevenDayBoundary: true, trustedDeadline: true })
  }
  check('Five locale notices use the latest stage and trusted deadline at eight-day, seven-day and cutoff boundaries')
  await chooseLocale('en'); await refresh('ended'); await closeSettings()
  report.noticeEvidence.afterLocales = await app.evaluate(() => globalThis.credentialFixture.cloud.localEvidenceDetails())
  const outboxAfterLocales = await app.evaluate(() => globalThis.credentialFixture.cloud.outboxEvidence())
  const originals = new Map(report.noticeEvidence.outboxBefore.map(row => [row.opId, row]))
  assert.deepEqual(outboxAfterLocales.filter(row => originals.has(row.opId)), report.noticeEvidence.outboxBefore)
  const languageChanges = outboxAfterLocales.filter(row => !originals.has(row.opId))
  assert.equal(languageChanges.length, 5)
  for (const row of languageChanges) { assert.equal(row.state, 'never_sent'); assert.deepEqual(row.actions, [{ type: 'pref.set', key: 'language' }]) }
  assert.deepEqual(report.noticeEvidence.afterLocales.workspace, report.noticeEvidence.before.workspace)
  for (const [table, hash] of Object.entries(report.noticeEvidence.before.tables)) if (table !== 'sync_ops') assert.equal(report.noticeEvidence.afterLocales.tables[table], hash)
  report.noticeEvidence.languageChanges = languageChanges
  report.noticeEvidence.beforeNotices = await app.evaluate(() => globalThis.credentialFixture.cloud.localEvidenceDetails())
  const localBefore = await evidence()
  check('Five explicit language changes append only their expected language preferences and preserve every original outbox row and business/history table')
  await page.locator('.cloud-notice').getByRole('button', { name: 'Dismiss', exact: true }).click(); await page.locator('.cloud-notice').waitFor({ state: 'detached' })
  await openCloud(); const dismissed = await refresh('ended')
  assert.equal(dismissed.notices.length, 0); assert.equal(dismissed.entries[0].state, 'retained')
  const deadline = await page.evaluate(value => new Date(value).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }), dismissed.entries[0].retrieveUntil)
  await page.locator('.cloud-data').getByText(`Save a copy before ${deadline}`, { exact: true }).waitFor()
  assert.equal(await page.locator('.cloud-data summary').count(), 1)
  await closeSettings(); assert.equal(await page.locator('.cloud-notice').count(), 0)
  await app.close(); await launch(); await page.locator('.board').waitFor()
  await openCloud(); const afterRestart = await refresh('ended'); assert.equal(afterRestart.notices.length, 0)
  assert.equal(afterRestart.accountId, dismissed.accountId); assert.deepEqual(afterRestart.entries[0].target, dismissed.entries[0].target)
  await closeSettings(); assert.equal(await page.locator('.cloud-notice').count(), 0)
  check('Real dismissal survives trusted refresh and normal restart for the same account/project/generation/stage; Settings retains deadline and retrieval')
  await openCloud(); const week = await refresh('week', 7); assert.equal(week.notices[0].stage, 'week')
  await closeSettings(); await page.locator('.cloud-notice').getByText(copy.en.week, { exact: false }).waitFor()
  await openCloud(); const active = await refresh('active'); assert.equal(active.entries[0].state, 'active'); assert.deepEqual(active.notices, [])
  await closeSettings(); assert.equal(await page.locator('.cloud-notice').count(), 0)
  await openCloud(); const none = await refresh('none'); assert.deepEqual(none.entries, []); assert.deepEqual(none.notices, [])
  await closeSettings(); assert.equal(await page.locator('.cloud-notice').count(), 0)
  check('A new stage appears after older-stage dismissal; restored active and none states clear expiry and deletion notices')
  await app.evaluate(() => { globalThis.credentialFixture.billingStatus = 'active'; globalThis.credentialFixture.cloud.canCreateCloud = true })
  assert.equal((await billing()).access?.eligible, true)
  await openCloud()
  report.unconfirmedDeletion = []
  for (const stage of ['cutoff', 'deleting', 'deleted-unconfirmed']) {
    const current = await refresh(stage, 0)
    assert.equal(current.entries[0].onlineDeletedAt, null); assert.equal(current.entries[0].retrievalWindowOpen, false)
    if (current.entries[0].state === 'deleted') assert.deepEqual(current.entries[0].initialization, { state: 'not_applicable' })
    assert.equal(current.notices.length, 1); assert.equal(current.notices[0].stage, 'cutoff')
    assert.equal(await page.locator('.cloud-data summary').count(), 0)
    assert(!(await page.locator('.cloud-data').innerText()).includes(copy.en.deleted), 'Settings requires trusted deletion metadata before claiming deletion')
    assert.equal(await page.locator('.cloud-data').getByRole('button', { name: 'Create a new cloud workspace…', exact: true }).count(), 1)
    await closeSettings(); const notice = page.locator('.cloud-notice'); await notice.getByText(copy.en.cutoff, { exact: false }).waitFor()
    assert(!(await notice.innerText()).includes(copy.en.deleted))
    report.unconfirmedDeletion.push({ state: current.entries[0].state, notice: current.notices[0].stage, initialization: current.entries[0].initialization, onlineDeletedAt: null, paid: true, retrievalWindowOpen: false })
    await page.screenshot({ path: join(out, `notice-${stage}-without-deletion-proof.png`) }); await openCloud()
  }
  report.noticeEvidence.after = await app.evaluate(() => globalThis.credentialFixture.cloud.localEvidenceDetails())
  report.noticeEvidence.outboxAfter = await app.evaluate(() => globalThis.credentialFixture.cloud.outboxEvidence())
  assert.equal(await evidence(), localBefore)
  assert.equal((await app.evaluate(() => globalThis.credentialFixture.cloud.creationEvidence())).target, null)
  check('Paid qualification does not reopen a closed generation; closed/deleting/deleted without trusted deletion metadata show cutoff and only explicit separate creation')
  check('Notice decisions and normal restart preserve local tasks/history/outbox without automatic cloud creation')
}
try {
  await launch(); await finishSetup(page)
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const localId = await page.evaluate(async () => { const generation = (await window.goalloom.getSnapshot()).workspace.generation; const reply = await window.goalloom.execute({ type: 'create', title: 'Local task kept during cloud retrieval', horizon: 'day', generation, operationId: crypto.randomUUID() }); if (!reply.ok) throw Error(reply.message); return reply.result.itemId })
  await signIn()
  if (noticesOnly) await acceptNotices()
  else {
  await openCloud()
  let cloud = page.locator('.cloud-data')
  await cloud.getByRole('button', { name: 'Check cloud status', exact: true }).click()
  await cloud.getByText('Available to retrieve', { exact: false }).waitFor()
  const unchanged = await evidence()
  await cloud.locator('summary').click(); const password = cloud.getByLabel('Sync password', { exact: true })
  await password.fill('Wrong synthetic password'); await cloud.getByRole('button', { name: 'Download copy', exact: true }).click()
  await cloud.getByText('The sync password did not unlock this copy.', { exact: true }).waitFor()
  assert.equal((await state()).state.copies.length, 0); assert.equal(await evidence(), unchanged)
  await password.fill('Synthetic-cloud-copy-password')
  await app.evaluate(() => { globalThis.credentialFixture.cloud.holdRead = true })
  await cloud.getByRole('button', { name: 'Download copy', exact: true }).click()
  await pollPage(page, () => document.querySelector('.cloud-data')?.getAttribute('aria-busy') === 'true')
  await app.evaluate(async () => { const deadline = Date.now() + 10000; while (!globalThis.credentialFixture.cloud.readStarted) { if (Date.now() > deadline) throw Error('Held retrieval did not start'); await new Promise(resolve => setTimeout(resolve, 10)) } })
  await cloud.getByRole('button', { name: 'Cancel', exact: true }).press('Enter')
  await page.waitForFunction(() => document.querySelector('.cloud-data')?.getAttribute('aria-busy') === 'false')
  assert.equal((await state()).state.copies.length, 0); assert.equal(await evidence(), unchanged)
  await page.waitForFunction(() => document.activeElement?.textContent === 'Download copy')
  assert(await cloud.getByRole('button', { name: 'Download copy', exact: true }).evaluate(node => node === document.activeElement))
  assert.equal((await state()).state.error, null)
  check('Wrong password and keyboard cancellation publish no copy, preserve current tasks/history/outbox and return focus to Download')
  await app.evaluate(() => { globalThis.credentialFixture.cloud.readStarted = false })
  await cloud.getByRole('button', { name: 'Download copy', exact: true }).click()
  await app.evaluate(async () => { const deadline = Date.now() + 10000; while (!globalThis.credentialFixture.cloud.readStarted) { if (Date.now() > deadline) throw Error('Held retrieval did not start'); await new Promise(resolve => setTimeout(resolve, 10)) } })
  await page.evaluate(() => window.goalloom.sync({ type: 'sign-out' }))
  await signIn('22222222-2222-4222-8222-222222222222')
  await page.waitForFunction(() => document.querySelector('.cloud-data')?.getAttribute('aria-busy') === 'false')
  assert.equal((await state()).state.copies.length, 0); assert.equal(await evidence(), unchanged)
  await page.evaluate(() => window.goalloom.sync({ type: 'sign-out' })); await signIn()
  await cloud.getByRole('button', { name: 'Check cloud status', exact: true }).click()
  await cloud.locator('summary').click()
  assert.equal(await password.inputValue(), '')
  await password.fill('Synthetic-cloud-copy-password')
  check('Account replacement cancels the original in-flight grant and clears the prior account’s password without changing local work')
  await app.evaluate(() => { globalThis.credentialFixture.cloud.holdRead = false; globalThis.credentialFixture.cloud.wrongIntegrity = true })
  await cloud.getByRole('button', { name: 'Download copy', exact: true }).click(); await cloud.getByText('A complete cloud copy could not be verified. Original data is kept.', { exact: true }).waitFor()
  assert.equal((await state()).state.copies.length, 0)
  await app.evaluate(() => { globalThis.credentialFixture.cloud.wrongIntegrity = false })
  await cloud.getByRole('button', { name: 'Download copy', exact: true }).click(); await cloud.getByRole('button', { name: 'View tasks', exact: true }).waitFor()
  assert.equal(await password.inputValue(), ''); assert.equal(await evidence(), unchanged)
  await cloud.getByRole('button', { name: 'View tasks', exact: true }).click()
  const inspection = cloud.getByRole('region', { name: 'View tasks', exact: true })
  await inspection.getByText('Retained title without a description', { exact: true }).waitFor(); assert.equal(await inspection.locator('input,textarea,[contenteditable=true]').count(), 0)
  await inspection.getByRole('button', { name: 'Dismiss', exact: true }).click()
  await cloud.getByRole('button', { name: 'Export JSON', exact: true }).click(); await idleCloud(); assert.equal(await evidence(), unchanged)
  await app.evaluate((_, file) => { globalThis.credentialFixture.cloud.savePath = file }, join(out, 'cloud-copy.json'))
  await cloud.getByRole('button', { name: 'Export JSON', exact: true }).click(); await idleCloud()
  await app.evaluate((_, file) => { globalThis.credentialFixture.cloud.savePath = file }, join(out, 'cloud-copy.sqlite'))
  await cloud.getByRole('button', { name: 'Export SQLite', exact: true }).click(); await idleCloud()
  report.exports = {}
  for (const format of ['json', 'sqlite']) report.exports[format] = await app.evaluate((_, { file, format }) => globalThis.credentialFixture.cloud.verifyCopy(file, format), { file: join(out, `cloud-copy.${format}`), format })
  assert.deepEqual(report.exports.sqlite.items, report.exports.json.items); assert.deepEqual(report.exports.sqlite.guidance, report.exports.json.guidance)
  assert.equal(await evidence(), unchanged)
  check('Integrity failure grants nothing; verified ready copy supports title-bearing read-only inspection and separate JSON/SQLite export without current-workspace changes')
  await cloud.getByRole('button', { name: 'Replace current workspace…', exact: true }).click()
  await page.locator('.transfer-stats').waitFor()
  await page.locator('.settings-footer').getByRole('button', { name: 'Create protective backup and continue', exact: true }).click()
  const pendingReplacement = page.locator('.settings-alert')
  await pendingReplacement.waitFor()
  assert.equal(await pendingReplacement.locator('span').innerText(), 'Current pending or unconfirmed sync changes prevent replacement. You can still export this copy.')
  assert(!/goalloom:data|Error invoking/.test(await pendingReplacement.innerText()))
  assert.equal(await evidence(), unchanged)
  await cloud.waitFor()
  await app.evaluate(() => { globalThis.credentialFixture.cloud.settleLocalOutbox(); globalThis.credentialFixture.cloud.retiredUnknown() })
  const beforePreview = await evidence()
  await cloud.getByRole('button', { name: 'Replace current workspace…', exact: true }).click(); await page.locator('.transfer-stats').waitFor()
  await page.locator('.settings-footer').getByRole('button', { name: 'Cancel', exact: true }).click(); await cloud.waitFor(); assert.equal(await evidence(), beforePreview)
  await cloud.getByRole('button', { name: 'Replace current workspace…', exact: true }).click(); await page.locator('.settings-footer').getByRole('button', { name: 'Create protective backup and continue', exact: true }).click()
  const acknowledgement = page.locator('.settings-footer input[type=checkbox]'); await acknowledgement.waitFor(); assert.equal(await acknowledgement.isChecked(), false)
  assert.equal(await page.getByRole('button', { name: 'Confirm workspace restore', exact: true }).isDisabled(), true)
  const oldGeneration = (await page.evaluate(() => window.goalloom.getSnapshot())).workspace.generation
  const backupPath = await page.locator('.receipt-row .settings-path').innerText()
  const preservedBackup = join(out, 'protective-before-replacement.sqlite'); await copyFile(backupPath, preservedBackup)
  report.protectiveBackup = await app.evaluate((_, { file, itemId }) => globalThis.credentialFixture.cloud.verifyProtectiveBackup(file, itemId), { file: preservedBackup, itemId: localId })
  assert.equal(report.protectiveBackup.generation, oldGeneration)
  await acknowledgement.check(); await page.getByRole('button', { name: 'Confirm workspace restore', exact: true }).click()
  await pollPage(page, async localId => !(await window.goalloom.getSnapshot()).items.some(item => item.id === localId), localId)
  await page.locator('dialog.settings-modal').waitFor({ state: 'detached' }); await openCloud()
  report.replacement = await app.evaluate(() => globalThis.credentialFixture.cloud.verifyReplacement())
  assert.notEqual(report.replacement.generation, oldGeneration)
  check('Current pending writes block replacement; retired unknown evidence permits separate preview/cancel and verified-backup, unchecked-acknowledgement commit')
  report.locales = []
  for (const [locale, copy] of Object.entries(localeCopy)) {
    await chooseLocale(locale)
    await cloud.getByRole('heading', { name: copy.title, exact: true }).waitFor()
    for (const name of [copy.refresh, copy.inspect, copy.sqlite, copy.replace, copy.cloudDelete, copy.accountDelete]) assert.equal(await cloud.getByRole('button', { name, exact: true }).count(), 1, `${locale}: ${name}`)
    const beforeLocale = await evidence(), copies = (await state()).state.copies.length
    const beforeLocaleDetails = await app.evaluate(() => globalThis.credentialFixture.cloud.localEvidenceDetails())
    const details = cloud.locator('details'); if (await details.getAttribute('open') === null) await details.locator('summary').click()
    const input = cloud.getByLabel(copy.password, { exact: true })
    await input.fill('Wrong synthetic password'); await cloud.getByRole('button', { name: copy.download, exact: true }).click()
    await cloud.getByText(copy.wrong, { exact: true }).waitFor(); await idleCloud()
    await page.screenshot({ path: join(out, `cloud-${locale}-error.png`) })
    await input.fill('Synthetic-cloud-copy-password')
    await app.evaluate(() => { globalThis.credentialFixture.cloud.holdRead = true; globalThis.credentialFixture.cloud.readStarted = false })
    await cloud.getByRole('button', { name: copy.download, exact: true }).click()
    await cloud.getByText(copy.downloading, { exact: true }).waitFor()
    await page.screenshot({ path: join(out, `cloud-${locale}-retrieval-progress.png`) })
    await cloud.getByRole('button', { name: copy.cancel, exact: true }).click(); await idleCloud()
    await app.evaluate(() => { globalThis.credentialFixture.cloud.holdRead = false })
    report.localeEvidence ??= []; report.localeEvidence.push({ locale, before: beforeLocaleDetails, after: await app.evaluate(() => globalThis.credentialFixture.cloud.localEvidenceDetails()) })
    assert.equal((await state()).state.copies.length, copies); assert.equal(await evidence(), beforeLocale)
    await cloud.getByRole('button', { name: copy.cloudDelete, exact: true }).click()
    const confirmation = cloud.getByRole('group', { name: copy.prepare, exact: true }); await confirmation.waitFor()
    await confirmation.getByText(copy.warning, { exact: true }).waitFor()
    assert.equal(await confirmation.getByRole('checkbox').isChecked(), false)
    assert.equal(await confirmation.getByRole('button', { name: copy.confirm, exact: true }).isDisabled(), true)
    await confirmation.getByRole('checkbox').check(); assert.equal(await confirmation.getByRole('button', { name: copy.confirm, exact: true }).isEnabled(), true)
    const geometry = await cloud.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }))
    assert(geometry.scroll <= geometry.width + 1, locale)
    await page.screenshot({ path: join(out, `cloud-${locale}-confirmation.png`) })
    await confirmation.getByRole('button', { name: copy.cancel, exact: true }).click(); await confirmation.waitFor({ state: 'detached' })
    assert.equal(await evidence(), beforeLocale)
    report.locales.push({ locale, expectedTitle: copy.title, controls: true, retrievalProgress: true, error: true, uncheckedConfirmation: true, noHorizontalOverflow: true })
  }
  await chooseLocale('en')
  check('Five locales show expected translated controls, real retrieval error/progress and unchecked deletion confirmation without horizontal overflow')
  await page.keyboard.press('Escape'); await page.locator('dialog.settings-modal').waitFor({ state: 'detached' })
  await page.keyboard.press('ControlOrMeta+n'); const draft = page.locator('.composer-input').first(); await draft.fill('Draft kept through retention notices')
  await draft.evaluate(node => { node.focus(); node.setSelectionRange(5, 9); window.cloudDraftNode = node })
  for (const stage of ['week', 'cutoff', 'deleted']) {
    await app.evaluate((_, stage) => { globalThis.credentialFixture.cloud.stage = stage }, stage)
    assert((await page.evaluate(() => window.advanceCloudMinute())) > 0)
    const text = stage === 'week' ? 'Seven days or less remain to save your cloud copy.' : stage === 'cutoff' ? 'The retrieval period ended. This cloud data cannot be restored.' : 'Online cloud deletion is confirmed.'
    const notice = page.locator('.workspace-notice-copy').filter({ hasText: text }); await notice.waitFor()
    const authoritative = (await state()).state.notices
    assert.equal(authoritative.length, 1); assert.equal(authoritative[0].stage, stage)
    const deadline = await page.evaluate(value => new Date(value).toLocaleDateString('en'), authoritative[0].retrieveUntil)
    assert((await notice.innerText()).includes(`Retrieval deadline ${deadline}`))
    for (const older of ['Cloud access ended. You can save a copy before the date shown.', 'Seven days or less remain to save your cloud copy.', 'The retrieval period ended. This cloud data cannot be restored.', 'Online cloud deletion is confirmed.'].filter(value => value !== text)) assert.equal(await page.locator('.workspace-notice-copy').filter({ hasText: older }).count(), 0)
    assert(await draft.evaluate(node => node === window.cloudDraftNode && node === document.activeElement && node.selectionStart === 5 && node.selectionEnd === 9))
  }
  await draft.fill(''); await page.keyboard.press('Escape'); await page.locator('.composer-input').waitFor({ state: 'detached' })
  await app.evaluate(() => { globalThis.credentialFixture.cloud.stage = 'ended' }); await openCloud()
  await cloud.getByRole('button', { name: 'Check cloud status', exact: true }).click()
  check('Trusted latest retention notice stages preserve the same composer node, text, caret and keyboard focus')
  await cloud.getByRole('button', { name: 'Delete this cloud data…', exact: true }).click()
  let confirm = cloud.getByRole('group', { name: 'Review deletion', exact: true }); await confirm.waitFor()
  assert.equal(await confirm.getByRole('checkbox').isChecked(), false); assert(await confirm.getByRole('button', { name: 'Confirm deletion', exact: true }).isDisabled())
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click(); await confirm.waitFor({ state: 'detached' })
  const localBeforeDelete = await evidence()
  await app.evaluate(() => { globalThis.credentialFixture.billingStatus = 'active' })
  const billingBeforeDelete = await billing(), accountBeforeDelete = (await state()).state.accountId
  assert.equal(billingBeforeDelete.access?.eligible, true); assert.equal(billingBeforeDelete.accountId, accountBeforeDelete)
  await cloud.getByRole('button', { name: 'Delete this cloud data…', exact: true }).click(); await confirm.waitFor()
  assert.equal(await confirm.getByRole('checkbox').isChecked(), false)
  const preparedCloud = (await state()).state.prepared
  assert.equal(preparedCloud.scope, 'cloud')
  await confirm.getByRole('checkbox').check(); await confirm.getByRole('button', { name: 'Confirm deletion', exact: true }).click()
  await confirm.waitFor({ state: 'detached' }); await cloud.getByLabel('Deletion progress', { exact: true }).last().waitFor()
  const cloudProgress = (await state()).state.progress.find(row => row.requestId === preparedCloud.requestId)
  assert(cloudProgress?.accepted && cloudProgress.scope === 'cloud' && cloudProgress.content === 'deleted')
  assert.equal(cloudProgress.auth, 'not_applicable'); assert.equal(cloudProgress.renewal, 'not_applicable')
  assert.equal((await state()).state.accountId, accountBeforeDelete)
  assert.equal((await page.evaluate(() => window.goalloom.sync({ type: 'status' }))).status.accountId, accountBeforeDelete)
  assert.deepEqual(await billing(), billingBeforeDelete); assert.equal(await evidence(), localBeforeDelete)
  const target = await app.evaluate(() => globalThis.credentialFixture.cloud.target)
  const cloudRequest = await app.evaluate((_, id) => globalThis.credentialFixture.cloud.actions.find(row => row.path.endsWith('/prepare') && row.requestId === id), preparedCloud.requestId)
  assert.equal(cloudRequest.scope, 'cloud'); assert.deepEqual(cloudRequest.target, target)
  report.cloudDeletion = { requestId: preparedCloud.requestId, target, progress: cloudProgress, accountId: accountBeforeDelete, billing: billingBeforeDelete }
  for (const [locale, copy] of Object.entries(localeCopy)) {
    await chooseLocale(locale)
    const progress = cloud.getByLabel(copy.progress, { exact: true }).last(); await progress.waitFor()
    await progress.getByText(`${copy.content}: ${copy.contentDeleted}`, { exact: true }).waitFor()
    await progress.getByText(`${copy.auth}: ${copy.notApplicable}`, { exact: true }).waitFor()
    await progress.getByText(`${copy.renewal}: ${copy.notApplicable}`, { exact: true }).waitFor()
    assert((await progress.innerText()).includes(copy.accepted))
    report.locales.find(row => row.locale === locale).deletionProgress = true
    await page.screenshot({ path: join(out, `cloud-${locale}-deletion-progress.png`) })
  }
  await chooseLocale('en')
  await cloud.getByRole('button', { name: 'Acknowledge completion', exact: true }).last().click(); await idleCloud()
  check('Successful cloud-only confirmation targets the original generation, preserves account/subscription/local work and shows translated deletion progress in five locales')
  report.retrievalActions = await app.evaluate(() => globalThis.credentialFixture.cloud.actions)
  assert(!report.retrievalActions.some(row => /\/(register_device|complete_recovery|push_ops|create_new_workspace)$/.test(row.path)))
  report.retrievalRpcRequests = await app.evaluate(() => globalThis.credentialFixture.requests)
  assert(!report.retrievalRpcRequests.some(path => /\/(register_device|complete_recovery|push_ops|bootstrap_workspace|create_new_workspace)$/.test(path)))
  await app.evaluate(() => { globalThis.credentialFixture.cloud.canCreateCloud = true; globalThis.credentialFixture.cloud.allowNewCloud = true })
  await cloud.getByRole('button', { name: 'Check cloud status', exact: true }).click(); await idleCloud()
  const deletedView = (await state()).state.entries.find(entry => entry.state === 'deleted')
  assert.deepEqual(deletedView?.initialization, { state: 'not_applicable' })
  report.cloudDeletion.generationInitialization = deletedView.initialization
  const beforeNewCloud = await app.evaluate(() => globalThis.credentialFixture.cloud.businessEvidence())
  await cloud.getByRole('button', { name: 'Create a new cloud workspace…', exact: true }).click()
  const recovery = page.locator('.sync-recovery-modal'); await recovery.waitFor()
  await recovery.getByText(/^Current cloud state\. Original local history and undo are not included\.\s+\d+ · \d+$/).waitFor()
  assert.equal(await recovery.getByRole('checkbox').isChecked(), false)
  assert.equal(await recovery.getByRole('button', { name: 'Create and sync', exact: true }).isDisabled(), true)
  const previewCancel = recovery.getByRole('button', { name: 'Cancel', exact: true })
  await previewCancel.scrollIntoViewIfNeeded()
  report.newCloudPreview = await previewCancel.evaluate(button => {
    const box = button.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return { cancelReachable: !!hit && button.contains(hit), persistentNotices: document.querySelectorAll('.workspace-notice').length, rendererFocused: document.hasFocus(), visibility: document.visibilityState }
  })
  assert(report.newCloudPreview.cancelReachable, 'Persistent feedback must not cover the new-cloud preview Cancel button')
  await previewCancel.click(); await recovery.waitFor({ state: 'detached' })
  assert.equal(await app.evaluate(() => globalThis.credentialFixture.cloud.businessEvidence()), beforeNewCloud)
  assert.equal((await app.evaluate(() => globalThis.credentialFixture.cloud.creationEvidence())).target, null)
  await cloud.getByRole('button', { name: 'Create a new cloud workspace…', exact: true }).click(); await recovery.waitFor()
  await recovery.getByLabel('New password', { exact: true }).fill('Synthetic-new-cloud-password')
  await recovery.getByLabel('Enter it again', { exact: true }).fill('Synthetic-new-cloud-password')
  assert.equal(await recovery.getByRole('checkbox').isChecked(), false)
  assert.equal(await recovery.getByRole('button', { name: 'Create and sync', exact: true }).isDisabled(), true)
  await recovery.getByRole('checkbox').check()
  await page.waitForFunction(() => document.querySelector('.sync-recovery-modal button[type=submit]')?.disabled === false)
  await recovery.getByRole('button', { name: 'Create and sync', exact: true }).click()
  await pollPage(page, async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'ready' || !!document.querySelector('.sync-recovery-modal [role=alert]'))
  const createdStatus = (await page.evaluate(() => window.goalloom.sync({ type: 'status' }))).status
  if (createdStatus.phase === 'ready' && !createdStatus.error) {
    await recovery.waitFor({ state: 'detached' })
    await pollPage(page, async () => { const status = (await window.goalloom.sync({ type: 'status' })).status; return status.phase === 'ready' && !status.syncing && status.pending === 0 && !status.error })
    report.newCloud = await app.evaluate(() => globalThis.credentialFixture.cloud.creationEvidence())
    assert(report.newCloud.receipt); assert.notEqual(report.newCloud.target.workspaceId, target.workspaceId); assert.notEqual(report.newCloud.target.generation, target.generation)
    assert.equal(report.newCloud.receipt.initialization, 'complete')
    assert.equal(await app.evaluate(() => globalThis.credentialFixture.cloud.businessEvidence()), beforeNewCloud)
    const creationActions = await app.evaluate(() => globalThis.credentialFixture.cloud.actions)
    report.newCloud.actions = creationActions.slice(report.retrievalActions.length)
    assert(creationActions.some(row => row.path.endsWith('/create_new_workspace')))
    assert(!creationActions.some(row => row.path.endsWith('/bootstrap_workspace')))
    check('Eligible explicit new-cloud entry reviews local state, cancels without creation and confirms through actual SDK seed/final-receipt actions with local history preserved')
  } else {
    report.blockers.push({ scenario: 'explicit-new-cloud-confirmation', status: createdStatus, message: await recovery.getByRole('alert').innerText(), explanation: 'The real account-only action did not complete. No phase, IPC result, transition or success receipt was substituted.' })
    assert.equal(await app.evaluate(() => globalThis.credentialFixture.cloud.businessEvidence()), beforeNewCloud)
    await page.screenshot({ path: join(out, 'new-cloud-confirmation-blocked.png') })
    await recovery.getByRole('button', { name: 'Cancel', exact: true }).click(); await recovery.waitFor({ state: 'detached' })
  }
  const afterNewCloud = await evidence()
  await cloud.getByRole('button', { name: 'Delete account and cloud data…', exact: true }).click(); await confirm.waitFor()
  await app.evaluate(() => { globalThis.credentialFixture.cloud.expired = true }); await confirm.getByRole('checkbox').check(); await confirm.getByRole('button', { name: 'Confirm deletion', exact: true }).click()
  await confirm.waitFor({ state: 'detached' }); await app.evaluate(() => { globalThis.credentialFixture.cloud.expired = false; globalThis.credentialFixture.cloud.loseConfirm = true })
  await cloud.getByRole('button', { name: 'Delete account and cloud data…', exact: true }).click(); await confirm.waitFor(); await confirm.getByRole('checkbox').check(); await confirm.getByRole('button', { name: 'Confirm deletion', exact: true }).click()
  await confirm.waitFor({ state: 'detached' }); assert.equal(await evidence(), afterNewCloud)
  const pending = (await state()).state.pendingReceipts.find(row => row.confirmationSent); assert(pending)
  await page.evaluate(() => window.goalloom.sync({ type: 'sign-out' }))
  await app.close(); await launch(); cloud = page.locator('.cloud-data'); await page.locator('.board').waitFor(); await openCloud()
  await cloud.getByRole('button', { name: 'Check progress', exact: true }).first().click()
  const accountProgress = cloud.getByLabel('Deletion progress', { exact: true }).last(); await accountProgress.waitFor()
  for (const [locale, copy] of Object.entries(localeCopy)) {
    await chooseLocale(locale)
    const receipt = cloud.getByLabel(copy.progress, { exact: true }).last()
    await receipt.getByText(`${copy.content}: ${copy.contentDeleted}`, { exact: true }).waitFor()
    await receipt.getByText(`${copy.auth}: ${copy.accountDeleted}`, { exact: true }).waitFor()
    await page.screenshot({ path: join(out, `account-receipt-${locale}-complete.png`) })
  }
  await chooseLocale('en')
  assert(!(await accountProgress.innerText()).includes('Account: Online cloud deletion is confirmed.'))
  let progress = (await state()).state.progress.find(row => row.requestId === pending.requestId)
  assert(progress?.accepted && progress.renewal === 'pending'); assert.equal(await accountProgress.getByRole('button', { name: 'Acknowledge completion', exact: true }).count(), 0)
  assert.equal((await page.evaluate(() => window.goalloom.sync({ type: 'status' }))).status.accountId, null)
  await app.evaluate(() => { globalThis.credentialFixture.cloud.renewal = 'stopped' })
  await accountProgress.getByRole('button', { name: 'Check progress', exact: true }).click(); await accountProgress.getByRole('button', { name: 'Acknowledge completion', exact: true }).click()
  assert.equal((await state()).state.pendingReceipts.length, 0)
  assert.equal(await evidence(), afterNewCloud)
  const actions = await app.evaluate(() => globalThis.credentialFixture.cloud.actions)
  assert(actions.filter(row => row.path.endsWith('/deletion-receipt')).every(row => !row.auth))
  assert.equal(await app.evaluate(() => globalThis.credentialFixture.modelCalls ?? 0), 0)
  assert(!(await app.evaluate(() => globalThis.credentialFixture.requests)).some(path => path.includes('register_device')))
  await page.screenshot({ path: join(out, 'signed-out-original-receipt-complete.png') })
  check('Unchecked cloud/account deletion supports cancel/expired prepare; lost accepted response survives sign-out/restart with original no-Auth receipt and renewal-pending retention')
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.blockers, [], 'Native acceptance has an unresolved real-action blocker'); report.ok = true
} catch (error) {
  report.error = error.stack ?? String(error)
  report.sync = await page?.evaluate(() => window.goalloom.sync({ type: 'status' })).catch(() => null)
  report.cloud = await page?.evaluate(() => window.goalloom.cloud({ type: 'status' })).catch(() => null)
  report.fixture = await app?.evaluate(() => ({ browser: globalThis.credentialFixture.browser, requests: globalThis.credentialFixture.requests, unexpected: globalThis.credentialFixture.unexpected, cloudActions: globalThis.credentialFixture.cloud?.actions })).catch(() => null)
  report.windows = await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible() }))).catch(() => null)
  report.input = await page?.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML.slice(0, 500) })).catch(() => null)
  await page?.screenshot({ path: join(out, 'failure.png') }).catch(() => undefined)
  throw error
} finally {
  await app?.close(); const unchanged = JSON.stringify(before) === JSON.stringify(await hashes())
  report.sourceStable = unchanged; report.sourceBuild = join(out, 'source-build.json')
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); await writeFile(resolve('../../output/tests/billing/desktop/d2-native/latest.json'), JSON.stringify({ reportPath: join(out, 'report.json'), ok: report.ok && unchanged }, null, 2))
  await rm(profile, { recursive: true, force: true }); assert(unchanged, 'Source/build changed during native acceptance')
}
