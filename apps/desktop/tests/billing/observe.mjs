/**
 * [INPUT]: Owner-only Backend checkpoint/session files, shared async IPC polling and a paused development Test stage.
 * [OUTPUT]: Actual production BillingService/UI observations and the latest original session, with no remote cleanup.
 * [POS]: Attach-only D3 test adapter; legacy provider provisioning is never imported here.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { cpus, release } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { build } from 'vite'
import { _electron as electron } from 'playwright'
import { finishSetup } from '../fixtures/setup.mjs'
import { pollPage } from '../fixtures/poll.mjs'

const desktop = fileURLToPath(new URL('../../', import.meta.url)), repo = resolve(desktop, '../..')
const origin = 'https://asqyvcnxdltzzfutbbqy.supabase.co'
const instant = z.iso.datetime({ offset: true }), cycle = z.enum(['monthly', 'annual']).nullable()
const period = z.strictObject({ status: z.string().min(1).max(64), cycle, nextCycle: cycle, endsAt: instant.nullable(), cancelAtPeriodEnd: z.boolean() })
const inputSchema = z.strictObject({
  journeyId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/), scenarioId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
  sessionPath: z.string().refine(isAbsolute), ownerId: z.uuid(), apiOrigin: z.literal(origin), anonKey: z.string().min(20),
  outputDirectory: z.string().refine(isAbsolute),
  expected: z.strictObject({ status: z.enum(['none', 'trialing', 'active', 'verification_pending', 'expired', 'revoked']), eligible: z.boolean(), grace: z.boolean(), effectiveEnd: instant.nullable() }),
  expectedPeriod: period.nullable(),
  retainedTarget: z.strictObject({ workspaceId: z.uuid(), generation: z.uuid(), retrieveUntil: instant, retrievalWindowOpen: z.boolean() }).optional(),
})
export async function readPrivateJson(path) {
  const info = await stat(path)
  assert(info.isFile() && (info.mode & 0o077) === 0 && info.uid === process.getuid?.(), 'Owner-only input file required')
  return JSON.parse(await readFile(path, 'utf8'))
}
function originalSession(document, ownerId) {
  const fixture = Array.isArray(document.fixtures) ? document.fixtures.find(row => row.ownerId === ownerId) : document
  assert(fixture, 'Original Backend fixture missing')
  const session = fixture.sessions?.[0] ?? fixture.session ?? fixture
  assert(typeof session.access_token === 'string' && typeof session.refresh_token === 'string', 'Original Backend session missing')
  const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url'))
  assert.equal(claims.sub, ownerId, 'Original session owner mismatch')
  assert(z.uuid().safeParse(claims.session_id).success && typeof claims.email === 'string' && claims.email.endsWith('@goalloom.test'), 'Synthetic original session required')
  return { id: ownerId, sessionId: claims.session_id, session: { access_token: session.access_token, refresh_token: session.refresh_token } }
}
const labels = { none: 'Not started', trialing: 'Trial active', active: 'Plus active', verification_pending: 'Payment verification pending', expired: 'Access ended', revoked: 'Payment access stopped' }

export async function observeNativeCheckpoint(raw, { reconcile = false, validateOnly = false } = {}) {
  const input = inputSchema.parse(raw), attached = originalSession(await readPrivateJson(input.sessionPath), input.ownerId)
  if (validateOnly) return { ok: true, validated: true }
  const out = input.outputDirectory, profile = join(repo, 'output/tests/billing/desktop/d3-native/profiles', input.journeyId, input.ownerId)
  await mkdir(dirname(out), { recursive: true }); await mkdir(out, { mode: 0o700 })
  await mkdir(profile, { recursive: true, mode: 0o700 })
  const scopePath = join(profile, 'observer-scope.json'), scope = { journeyId: input.journeyId, ownerId: input.ownerId, sessionId: attached.sessionId, apiOrigin: input.apiOrigin }
  try { assert.deepEqual(await readPrivateJson(scopePath), scope, 'Native profile belongs to another original session') }
  catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(scopePath, JSON.stringify(scope), { mode: 0o600 }) }
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }), { mode: 0o600 })
  const identityPath = join(out, 'session-input.json'), sessionPath = join(out, 'session-result.json'), reportPath = join(out, 'report.json')
  await writeFile(identityPath, JSON.stringify(attached), { mode: 0o600 })
  const prefix = `billing-observe-${randomUUID()}`, main = join(desktop, 'out/main'), entry = join(main, `${prefix}.js`)
  const report = { ok: false, journeyId: input.journeyId, scenarioId: input.scenarioId, reconcile, stage: 'build', requests: [], rendererErrors: [],
    host: { os: release(), arch: process.arch, cpu: cpus()[0]?.model, physicalOrVM: 'Not independently established' },
    scope: 'Real development Auth/status through production desktop BillingService/IPC/UI; existing synthetic OS cipher. No new identity, provider purchase, remote cleanup, model, production, packaged or Windows acceptance.' }
  let app, page, latestSession = false
  try {
    await build({ configFile: false, ssr: { noExternal: true }, define: { __GOALLOOM_BAKED_SUPABASE_ANON_KEY__: '""', __GOALLOOM_BAKED_SUPABASE_URL__: '""' }, build: {
      ssr: true, target: 'node24', minify: false, outDir: main, emptyOutDir: false,
      lib: { entry: join(desktop, 'tests/billing/provider-entry.ts'), formats: ['es'], fileName: () => `${prefix}.js` },
      rollupOptions: { external: [/^node:/, 'electron', 'electron-updater'], output: { entryFileNames: `${prefix}.js`, chunkFileNames: `${prefix}-[name]-[hash].js` } },
    } })
    const env = { ...process.env, GOALLOOM_SUPABASE_URL: input.apiOrigin, GOALLOOM_SUPABASE_ANON_KEY: input.anonKey,
      GOALLOOM_BILLING_IDENTITY: identityPath, GOALLOOM_BILLING_OBSERVE: '1', GOALLOOM_BILLING_RECONCILE: reconcile ? '1' : '0' }
    delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
    report.stage = 'attach'
    app = await electron.launch({ args: [entry, `--user-data-dir=${profile}`], env, timeout: 30_000 })
    page = await app.firstWindow(); page.on('pageerror', error => report.rendererErrors.push(error.name))
    await page.locator('.start-cards, .board').first().waitFor()
    await app.evaluate(async () => { await globalThis.billingProviderFixture.started })
    if (await page.locator('.start-cards').count()) await finishSetup(page)
    const marker = `D3 local marker ${input.journeyId}`
    let snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
    if (!snapshot.items.some(item => item.title === marker)) {
      const created = await page.evaluate(async ({ marker, generation }) => window.goalloom.execute({ type: 'create', title: marker, horizon: 'later', generation, operationId: crypto.randomUUID() }), { marker, generation: snapshot.workspace.generation })
      assert(created.ok, 'Local observation marker failed')
    }
    snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
    report.localBefore = snapshot.items.map(({ id, title, status, version }) => ({ id, title, status, version }))
    await page.locator('.settings-toggle').click()
    await page.locator('dialog.settings-modal').getByRole('button', { name: 'Sync', exact: true }).click()
    const current = await page.evaluate(() => window.goalloom.sync({ type: 'status' }))
    if (!current.status.accountId) await page.locator('.sync-account').getByRole('button', { name: /Apple/ }).click()
    await pollPage(page, async owner => { const { status } = await window.goalloom.sync({ type: 'status' }); return status.accountId === owner && status.phase === 'account' && !status.error }, input.ownerId)
    report.stage = 'status'
    const card = page.locator('.billing-card')
    if (reconcile) await card.getByRole('button', { name: 'Check status', exact: true }).click()
    await pollPage(page, async owner => { const s = await window.goalloom.billing({ type: 'status' }); return s.accountId === owner && !s.busy && (s.access !== null || s.error !== null) }, input.ownerId)
    const state = await page.evaluate(() => window.goalloom.billing({ type: 'status' }))
    report.billing = state
    assert.equal(state.error, null); assert.equal(state.environment, 'development'); assert(state.access)
    for (const [key, value] of Object.entries(input.expected)) assert.deepEqual(state.access[key], value, `Unexpected billing ${key}`)
    const subscription = state.access.subscriptions.find(row => row.cycle !== null && !['canceled', 'incomplete_expired'].includes(row.status)) ?? null
    if (input.expectedPeriod) {
      assert(subscription, 'Expected actual subscription missing')
      for (const [key, value] of Object.entries(input.expectedPeriod)) assert.deepEqual(subscription[key], value, `Unexpected subscription ${key}`)
    } else assert.equal(subscription, null, 'Unexpected displayed subscription period')
    await card.getByText(labels[state.access.status], { exact: true }).waitFor()
    report.visibleBilling = await card.innerText()
    for (const date of [state.access.effectiveEnd, subscription && !subscription.cancelAtPeriodEnd ? subscription.endsAt : null].filter(Boolean)) {
      const displayed = await page.evaluate(value => new Date(value).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }), date)
      assert(report.visibleBilling.includes(displayed), 'Actual trusted date is missing from UI')
    }
    if (state.access.grace) assert(report.visibleBilling.includes('Payment needs attention.'))
    if (state.access.effectiveEnd && subscription?.cancelAtPeriodEnd && !state.access.grace) assert(report.visibleBilling.includes('Renewal cancelled'))
    if (subscription?.nextAmount !== null && subscription && !subscription.cancelAtPeriodEnd) {
      const amount = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(subscription.nextAmount / 100)
      assert(report.visibleBilling.includes(`${amount} · ${(subscription.nextCycle ?? subscription.cycle) === 'annual' ? 'Yearly' : 'Monthly'}`), 'Actual next period/amount is missing from UI')
    }
    if (input.retainedTarget) {
      report.stage = 'retained-status'
      await page.locator('.cloud-data').getByRole('button', { name: 'Check cloud status', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('.cloud-data')?.getAttribute('aria-busy') === 'false')
      const cloud = await page.evaluate(() => window.goalloom.cloud({ type: 'status' }))
      report.cloud = cloud
      const row = cloud.state.entries.find(entry => entry.target?.workspaceId === input.retainedTarget.workspaceId && entry.target.generation === input.retainedTarget.generation)
      assert(row, 'Original retained target missing'); assert.equal(row.state, 'retained'); assert.equal(row.retrieveUntil, input.retainedTarget.retrieveUntil); assert.equal(row.retrievalWindowOpen, input.retainedTarget.retrievalWindowOpen)
    }
    await page.screenshot({ path: join(out, 'native-status.png') })
    report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
    report.localAfter = (await page.evaluate(() => window.goalloom.getSnapshot())).items.map(({ id, title, status, version }) => ({ id, title, status, version }))
    assert.deepEqual(report.localAfter, report.localBefore)
    assert.deepEqual(report.rendererErrors, [])
    report.ok = true
  } catch (error) {
    report.failure = { stage: report.stage, kind: error.name, code: 'native_observation_failed' }
    report.sync = await page?.evaluate(() => window.goalloom.sync({ type: 'status' })).catch(() => null)
    await page?.screenshot({ path: join(out, 'failure.png') }).catch(() => undefined)
  } finally {
    if (app) {
      try {
        const result = await app.evaluate(async () => ({ session: await globalThis.billingProviderFixture.readSession(), requests: globalThis.billingProviderFixture.requests, denied: globalThis.billingProviderFixture.denied, modelCalls: globalThis.billingProviderFixture.modelCalls }))
        if (result.session) { await writeFile(sessionPath, JSON.stringify(result.session), { mode: 0o600 }); latestSession = true }
        report.requests = result.requests; report.denied = result.denied; report.modelCalls = result.modelCalls
        if (result.denied.length || result.modelCalls || !latestSession) report.ok = false
      } catch { report.ok = false; report.sessionExportFailed = true }
      await app.close().catch(() => { report.ok = false; report.closeFailed = true })
    }
    for (const name of await readdir(main).catch(() => [])) if (name.startsWith(prefix)) await unlink(join(main, name)).catch(() => { report.ok = false; report.bundleCleanupFailed = true })
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  }
  return { ok: report.ok, reportPath, ...(latestSession ? { sessionPath } : {}) }
}
export async function runObserverCli(args) {
  try {
    assert(args.length >= 2 && args[0] === '--input' && args.filter(value => !['--validate', '--reconcile'].includes(value)).length === 2 && args.every((value, index) => index < 2 || ['--validate', '--reconcile'].includes(value)), 'Use --observe --input <owner-only.json> [--validate] [--reconcile]')
    const result = await observeNativeCheckpoint(await readPrivateJson(resolve(args[1])), { reconcile: args.includes('--reconcile'), validateOnly: args.includes('--validate') })
    console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 1
  } catch {
    console.error(JSON.stringify({ ok: false, code: 'native_observer_input_or_stage_failed' }))
    process.exitCode = 1
  }
}
