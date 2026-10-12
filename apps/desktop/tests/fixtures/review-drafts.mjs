/**
 * [INPUT]: A live native review at a held planning step, real IPC/storage and synthetic provider counters.
 * [OUTPUT]: Close/reopen/edit, remount/cache, input invalidation and recovery evidence for review suggestions.
 * [POS]: Planning-specific acceptance called by insight-generation in both renderer build modes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'

export async function verifyReviewDrafts({ page, application, mode, out, calls, check, changePreference }) {
  const drawer = () => page.locator('.review-drawer[open]')
  const rows = () => drawer().locator('.review-plan-row')
  const draftCount = async () => (await calls()).filter(call => call.kind === 'draft').length
  const close = async () => {
    await drawer().locator('.review-head .icon-button').click()
    await drawer().waitFor({ state: 'hidden' })
  }
  const settled = () => drawer().locator('.seed-title[placeholder="正在起草…"]').first().waitFor({ state: 'detached' })
  const remount = async () => {
    await page.reload()
    await page.locator('.board').waitFor()
    await page.locator('[data-review]').click()
    for (let step = 0; step < 5; step++) {
      await drawer().locator('.review-foot .primary:not(:disabled)').waitFor()
      if (await rows().count()) { await settled(); return }
      const previous = await drawer().locator('.review-steps [aria-current=step]').textContent()
      await drawer().locator('.review-foot .primary').click()
      await page.waitForFunction(previous => (document.querySelector('.review-drawer[open] [aria-current=step]')?.textContent ?? 'done') !== previous, previous)
    }
    throw Error('Review did not reach its suggestions')
  }
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('goalloom.review-drafts')))
  await application.evaluate(async () => {
    const deadline = Date.now() + 5000
    while (!globalThis.generationFixture.waiters.length) {
      if (Date.now() > deadline) throw Error('Planning request did not reach the held provider')
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  })
  const before = await draftCount()
  const beforeRevision = await page.evaluate(() => window.goalloom.getSnapshot().then(snapshot => snapshot.workspace.revision))
  await rows().first().locator('.seed-title').fill('Edited review suggestion')
  await rows().first().getByRole('combobox').click()
  await drawer().getByRole('option', { name: '不排入', exact: true }).click()
  await close()
  await page.locator('[data-review]').click()
  await drawer().locator('.review-body[aria-busy=false]').waitFor()
  assert.equal(await draftCount(), before, 'Closing a held request does not start another')
  assert.equal(await rows().first().locator('.seed-title').inputValue(), 'Edited review suggestion')
  assert.equal(await rows().first().getByRole('combobox').innerText(), '不排入')
  await application.evaluate(() => {
    const fixture = globalThis.generationFixture
    fixture.hold = false
    for (const release of fixture.waiters.splice(0)) release()
  })
  await settled()
  assert.equal(await rows().first().locator('.seed-title').inputValue(), 'Edited review suggestion', 'Late draft preserves typed text')
  const cache = await stored()
  assert.equal(cache.entries.length, 1)
  assert.match(cache.entries[0].fingerprint, /^[a-f0-9]{64}$/)
  assert(!JSON.stringify(cache).includes('synthetic-key-only'))
  assert(!JSON.stringify(cache).includes('你是 Goalloom'))
  await close()
  await page.locator('[data-review]').click()
  await drawer().locator('.review-body[aria-busy=false]').waitFor()
  assert.equal(await rows().first().locator('.seed-title').inputValue(), 'Edited review suggestion')
  assert.equal(await rows().first().getByRole('combobox').innerText(), '不排入')
  assert.equal(await draftCount(), before)
  assert.equal(await page.evaluate(() => window.goalloom.getSnapshot().then(snapshot => snapshot.workspace.revision)), beforeRevision)
  await drawer().screenshot({ path: `${out}/${mode}-planning-cached-choices.png` })
  check('held and successful review drafts survive close/reopen, retaining edits and exclusions without requests or writes')

  await remount()
  assert.equal(await draftCount(), before, 'A renderer remount reuses persisted generated suggestions')
  const cachedTitles = cache.entries[0].value.map(value => value.title)
  assert(cachedTitles.includes(await rows().first().locator('.seed-title').inputValue()))
  await drawer().screenshot({ path: `${out}/${mode}-planning-remounted-cache.png` })
  check('generated review suggestions persist locally and remount without another provider request')

  await close()
  await changePreference('最小一步', '拆解')
  await remount()
  assert.equal(await draftCount(), before + 1, 'Draft preferences invalidate generated suggestions')
  const newFingerprint = (await stored()).entries[0].fingerprint
  assert.notEqual(newFingerprint, cache.entries[0].fingerprint)
  await close()
  await changePreference('直接', '复盘')
  await remount()
  assert.equal(await draftCount(), before + 1, 'Review-only preferences do not invalidate drafts')
  await close()
  await page.evaluate(async () => {
    const snapshot = await window.goalloom.getSnapshot()
    const source = snapshot.items.find(item => item.title === 'Pending planning source month')
    const { item } = await window.goalloom.getItem(source.id)
    const reply = await window.goalloom.execute({ type: 'edit', itemId: source.id, expectedVersion: item.version, title: 'Changed planning source month', description: item.description, dueDate: item.dueDate, generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
  })
  await remount()
  assert.equal(await draftCount(), before + 2, 'Changed source text invalidates suggestions')
  check('draft inputs and drafting preferences invalidate suggestions while review-only preferences preserve them')

  await close()
  await page.evaluate(() => localStorage.setItem('goalloom.review-drafts', 'invalid cache'))
  await application.evaluate(() => { globalThis.generationFixture.mode = 'unavailable' })
  await remount()
  assert.equal((await stored()).entries.length, 0)
  await remount()
  assert.equal(await draftCount(), before + 4, 'Failed suggestions are not cached')
  await application.evaluate(() => { globalThis.generationFixture.mode = 'ready' })
  await remount()
  assert.equal(await draftCount(), before + 5)
  assert.equal((await stored()).entries.length, 1)
  await remount()
  assert.equal(await draftCount(), before + 5)
  check('corrupt cache data degrades to generation, failed attempts remain retryable and successful recovery is reused')
  return { initialDraftCalls: before, finalDraftCalls: await draftCount(), cachedTitles, storage: await stored() }
}
