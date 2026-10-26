/**
 * [INPUT]: Current source Electron build, isolated synthetic account/billing transport and actual renderer/preload/IPC/SQLite.
 * [OUTPUT]: Repeatable explicit trial, preserved setup draft/focus and five-language subscription UI evidence.
 * [POS]: Billing native acceptance. No real account, provider, model, packaged or Windows claim.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { cpus, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const out = resolve('../../output/tests/billing/desktop/d1-client/native'), profile = await mkdtemp(join(tmpdir(), 'goalloom-billing-native-'))
await mkdir(out, { recursive: true }); await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const env = { ...process.env, GOALLOOM_SUPABASE_URL: 'https://credential-fixture.invalid', GOALLOOM_SUPABASE_ANON_KEY: 'synthetic-anon', GOALLOOM_BILLING_FIXTURE: '1', GOALLOOM_HOSTED_FIXTURE: '1' }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
let app, page
const report = { ok: false, checks: [], rendererErrors: [], syncAdmission: [], host: { os: release(), arch: process.arch, cpu: cpus()[0]?.model, physicalMachineOrVm: 'not independently established' },
  scope: 'Actual source Electron renderer/preload/IPC/main/SQLite with synthetic OAuth/cipher/billing facts; controlled timer trigger. No real Auth, Stripe/browser payment, native keychain, packaged client, Windows or model.' }
const check = name => { report.checks.push(name); console.log(`PASS ${name}`) }
try {
  app = await electron.launch({ args: [resolve('tests/fixtures/credential-entry.mjs'), `--user-data-dir=${profile}`], env, timeout: 30000 })
  page = await app.firstWindow(); page.on('pageerror', error => report.rendererErrors.push(error.message))
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  await page.locator('.start-cards').waitFor()
  const signing = page.evaluate(() => window.goalloom.sync({ type: 'sign-in', provider: 'apple', purpose: 'ai' }))
  await page.waitForFunction(async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'signing-in')
  await app.evaluate(async () => { const deadline = Date.now() + 5000; while (!globalThis.credentialFixture.browser) { if (Date.now() > deadline) throw Error('No synthetic browser'); await new Promise(resolve => setTimeout(resolve, 10)) } })
  assert.equal((await fetch('http://127.0.0.1:53682/callback?code=synthetic-billing-code', { headers: { Connection: 'close' } })).status, 200)
  await signing
  const plus = page.locator('.billing-card')
  await plus.getByRole('button', { name: 'Start 8-day free trial', exact: true }).waitFor()
  assert.equal((await app.evaluate(() => globalThis.credentialFixture.billingActions)).length, 0)
  assert(!(await app.evaluate(() => globalThis.credentialFixture.requests)).some(path => path.startsWith('/rest/')))
  assert.equal(await page.locator('.calendar-modes').count(), 0)
  await page.screenshot({ path: join(out, 'signed-in-no-trial.png') })
  check('Verified account login offers an explicit trial without claiming it, configuring sync, uploading or confirming the calendar')
  await plus.getByRole('button', { name: 'Start 8-day free trial', exact: true }).click()
  await page.getByRole('button', { name: 'Set up sync', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Continue locally', exact: true }).click()
  await page.locator('.calendar-modes').waitFor()
  assert.equal(await page.locator('.onboarding-steps li').count(), 2)
  assert.equal(await app.evaluate(() => globalThis.credentialFixture.billingActions.filter(value => value.action === 'claim_trial').length), 1)
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.setupConfirmedAt, null)
  await page.locator('.onboarding-actions button').last().click()
  const draft = page.locator('.direction-input'); await draft.fill('Synthetic direction kept during billing refresh')
  await draft.evaluate(input => { input.focus(); input.setSelectionRange(10, 14); window.billingDraftNode = input })
  await app.evaluate(() => globalThis.credentialFixture.advanceBillingMinute())
  await page.waitForFunction(async () => !(await window.goalloom.billing({ type: 'status' })).busy)
  assert.equal(await draft.inputValue(), 'Synthetic direction kept during billing refresh')
  assert(await draft.evaluate(input => input === window.billingDraftNode && input === document.activeElement && input.selectionStart === 10 && input.selectionEnd === 14))
  await page.screenshot({ path: join(out, 'setup-draft-after-refresh.png') })
  check('A periodic eligibility refresh preserves the same setup node, text, selection and keyboard focus')
  await app.evaluate(() => { globalThis.credentialFixture.billingStatus = 'expired' })
  await page.evaluate(() => window.goalloom.billing({ type: 'refresh' }))
  assert.equal(await draft.inputValue(), 'Synthetic direction kept during billing refresh')
  assert(await draft.evaluate(input => input === window.billingDraftNode && input === document.activeElement))
  await app.evaluate(() => { globalThis.credentialFixture.billingStatus = 'trialing' })
  await page.evaluate(() => window.goalloom.billing({ type: 'refresh' }))
  await draft.fill(''); await page.locator('.onboarding-actions button').last().click(); await page.locator('.board').waitFor()
  check('An actual trusted expiry does not discard an entered setup draft; explicit calendar confirmation remains required')
  assert.equal(await app.evaluate(() => globalThis.credentialFixture.modelCalls ?? 0), 0)
  const generation = (await page.evaluate(() => window.goalloom.getSnapshot())).workspace.generation
  await page.locator('.settings-toggle').click(); const settings = page.locator('dialog.settings-modal')
  await settings.getByRole('button', { name: 'Sync', exact: true }).click()
  await app.evaluate(() => { globalThis.credentialFixture.billingStatus = 'active'; globalThis.credentialFixture.billingCycle = 'annual' })
  await page.evaluate(() => window.goalloom.billing({ type: 'refresh' }))
  await plus.getByText('Next payment:', { exact: false }).waitFor()
  const line = await plus.innerText(); assert(line.includes('$79.00') && line.includes('Yearly'))
  assert(!line.includes('$79.00 · Monthly'))
  await app.evaluate(() => { globalThis.credentialFixture.billingCycle = 'monthly'; globalThis.credentialFixture.billingNextCycle = 'annual' })
  await page.evaluate(() => window.goalloom.billing({ type: 'refresh' }))
  await plus.getByRole('button', { name: 'Keep current cycle', exact: true }).click()
  const confirm = plus.getByRole('group', { name: 'Confirm', exact: true })
  assert(await confirm.getByRole('button', { name: 'Back', exact: true }).evaluate(node => node === document.activeElement))
  assert((await confirm.innerText()).includes('$8.99') && (await confirm.innerText()).includes('Monthly'))
  assert(!(await confirm.innerText()).includes('$79'))
  await confirm.getByRole('button', { name: 'Confirm', exact: true }).focus()
  await app.evaluate(() => globalThis.credentialFixture.advanceBillingMinute())
  await page.waitForFunction(async () => !(await window.goalloom.billing({ type: 'status' })).busy)
  assert(await confirm.getByRole('button', { name: 'Confirm', exact: true }).evaluate(node => node === document.activeElement), 'Background refresh must not move confirmation focus back')
  await page.keyboard.press('Escape'); await confirm.waitFor({ state: 'detached' })
  assert(await plus.getByRole('button', { name: 'Keep current cycle', exact: true }).evaluate(node => node === document.activeElement))
  check('Annual renewal and removal of a scheduled change show the correct trusted amount, cycle and effective date')
  const names = { en: 'Sync', zh: '同步', ja: '同期', es: 'Sincronizar', fr: 'Synchro' }
  for (const locale of ['en', 'zh', 'ja', 'es', 'fr']) {
    await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
    await page.reload(); await page.locator('.board').waitFor()
    await page.locator('.settings-toggle').click()
    await settings.getByRole('button', { name: names[locale], exact: true }).click()
    const geometry = await plus.evaluate(node => ({ scroll: node.scrollWidth, width: node.clientWidth, controls: [...node.querySelectorAll('button,input')].map(control => ({ label: control.getAttribute('aria-label') ?? control.textContent, width: control.getBoundingClientRect().width })) }))
    assert(geometry.scroll <= geometry.width + 1, `${locale} Plus card overflows`)
    const admission = await page.evaluate(async () => {
      const sync = (await window.goalloom.sync({ type: 'status' })).status, billing = await window.goalloom.billing({ type: 'status' })
      return { phase: sync.phase, syncAccountId: sync.accountId, billingAccountId: billing.accountId, eligible: billing.access?.eligible, busy: billing.busy }
    })
    const start = settings.locator('.sync-account').getByRole('button', { name: /^(开始同步|Start sync|同期を始める|Empezar a sincronizar|Démarrer la synchro)$/ })
    const disabled = await start.isDisabled()
    report.syncAdmission.push({ locale, ...admission, disabled })
    assert.equal(admission.phase, 'account'); assert.equal(admission.syncAccountId, admission.billingAccountId); assert.equal(admission.eligible, true)
    assert.equal(disabled, false, `${locale} qualified account must allow explicit sync setup`)
    await page.screenshot({ path: join(out, `billing-${locale}.png`) })
  }
  check('All five languages render the shared Plus card and finite management controls without horizontal overflow')
  await app.evaluate(() => { globalThis.credentialFixture.billingStatus = 'none'; globalThis.credentialFixture.billingReturnToThisDevice = false })
  await page.evaluate(() => window.goalloom.billing({ type: 'refresh' }))
  await page.evaluate(async () => window.goalloom.billing({ type: 'checkout', cycle: 'monthly', expectedAccountId: (await window.goalloom.sync({ type: 'status' })).status.accountId }))
  assert.equal((await page.evaluate(() => window.goalloom.billing({ type: 'status' }))).pending.returnToThisDevice, false)
  const manualCopy = { en: 'This is the original checkout from another device.', zh: '这是另一台设备发起的原结账。', ja: '別の端末で開始した元の支払い画面です。', es: 'Es el pago original iniciado en otro dispositivo.', fr: 'Ce paiement initial a été lancé sur un autre appareil.' }
  for (const locale of ['en', 'zh', 'ja', 'es', 'fr']) {
    await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
    await page.reload(); await page.locator('.board').waitFor(); await page.locator('.settings-toggle').click()
    await settings.getByRole('button', { name: names[locale], exact: true }).click()
    await plus.getByText(manualCopy[locale], { exact: false }).waitFor()
    await page.screenshot({ path: join(out, `billing-other-device-${locale}.png`) })
  }
  check('Another device’s original checkout has explicit manual status-check guidance in all five languages without exposing provider identities')
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.generation, generation)
  assert.equal(await app.evaluate(() => globalThis.credentialFixture.modelCalls ?? 0), 0)
  const ai = await page.evaluate(async () => { const api = window.goalloom, state = await api.getSnapshot(); return (await api.smart({ type: 'status', generation: state.workspace.generation })).status })
  assert.equal(ai.providers.hosted.consentedAt, null); assert.equal(ai.features.smart.enabled, false)
  assert.deepEqual(report.rendererErrors, [])
  check('Trial and paid UI do not grant AI consent, enable a feature, call a model or replace the local workspace')
  report.ok = true
} catch (error) {
  report.error = error.stack ?? String(error)
  report.appState = await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible() }))).catch(() => null)
  report.activeElement = await page?.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label') })).catch(() => null)
  await page?.screenshot({ path: join(out, 'failure.png') }).catch(() => undefined)
  throw error
} finally {
  await app?.close(); await rm(profile, { recursive: true, force: true })
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
}
