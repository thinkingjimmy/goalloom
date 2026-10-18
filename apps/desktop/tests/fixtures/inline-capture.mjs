/**
 * [INPUT]: Isolated Electron capture transport, mounted board and synthetic goal identities.
 * [OUTPUT]: Visible inline matching, failure/retry, stale-answer and delayed-status evidence without live calls.
 * [POS]: Composer-owned acceptance; real renderer, IPC and SQLite with only the Jev transport controlled.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { pollPage } from './poll.mjs'

export async function runInlineCaptureFeedback({ app, page, out, ids, check }) {
  const field = page.locator('[data-horizon="day"] .quick-add-title')
  const feedback = page.locator('.quick-add-smart')
  const snapshot = () => page.evaluate(() => window.goalloom.getSnapshot())
  const set = values => app.evaluate((_, values) => Object.assign(globalThis.captureFixture, values), values)
  const release = () => app.evaluate(() => {
    const fixture = globalThis.captureFixture
    fixture.hold = false
    fixture.waiters.splice(0).forEach(resolve => resolve())
  })
  const save = async title => {
    await field.press('Enter')
    await pollPage(page, async title => (await window.goalloom.getSnapshot()).items.some(item => item.title === title), title)
    return (await snapshot()).items.find(item => item.title === title)
  }
  const linked = id => pollPage(page, async ({ id, parent }) => (await window.goalloom.getSnapshot()).relations.some(edge => edge.childId === id && edge.parentId === parent), { id, parent: ids.target })

  await page.getByRole('button', { name: '在今天新建', exact: true }).click()
  await set({ hold: true })
  const title = '完善 Delivery 的键盘导航体验'
  await field.fill(title)
  await feedback.filter({ hasText: 'Jev 正在匹配上级' }).waitFor()
  assert.equal(await field.evaluate(node => node === document.activeElement), true)
  assert(!(await snapshot()).items.some(item => item.title === title), 'Typing and preview never create items')
  await page.screenshot({ path: `${out}/inline-pending.png` })
  await release()
  await feedback.filter({ hasText: 'Delivery target' }).waitFor()
  assert.equal(await field.inputValue(), title)
  assert.equal(await field.evaluate(node => node === document.activeElement), true)
  const tags = { zh: 'zh-CN', en: 'en', ja: 'ja-JP', es: 'es', fr: 'fr-FR' }
  const languageNames = { zh: '简体中文', en: 'English', ja: '日本語', es: 'Español', fr: 'Français' }
  for (const language of ['zh', 'en', 'ja', 'es', 'fr']) {
    await page.locator('.settings-toggle').click()
    await page.locator('.settings-modal .settings-select').click()
    await page.getByRole('option', { name: languageNames[language], exact: true }).click()
    await page.waitForFunction(tag => document.documentElement.lang === tag, tags[language])
    await page.keyboard.press('Escape')
    await page.locator('.settings-modal').waitFor({ state: 'hidden' })
    await feedback.filter({ hasText: 'Delivery target' }).waitFor()
    const geometry = await feedback.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth, text: node.textContent }))
    assert(geometry.scroll <= geometry.width + 1, `Inline suggestion must fit ${language}`)
    await page.screenshot({ path: `${out}/inline-ready-${language}.png` })
  }
  await page.locator('.settings-toggle').click()
  await page.locator('.settings-modal .settings-select').click()
  await page.getByRole('option', { name: languageNames.zh, exact: true }).click()
  await page.waitForFunction(() => document.documentElement.lang === 'zh-CN')
  await page.keyboard.press('Escape')
  await page.locator('.settings-modal').waitFor({ state: 'hidden' })
  const callsBeforeSave = await app.evaluate(() => globalThis.captureFixture.calls.length)
  const created = await save(title)
  await linked(created.id)
  const receipt = await app.evaluate((_, id) => globalThis.captureFixture.receipts.find(row => row.itemId === id), created.id)
  assert.equal(receipt.capture.pending, false)
  assert.equal(await app.evaluate(() => globalThis.captureFixture.calls.length), callsBeforeSave, 'Saving reuses the displayed matching result')
  check('Inline pending and parent suggestions are visible in five languages and the ready result joins creation')

  await set({ hold: true })
  await field.fill('Old Delivery draft with a held answer')
  await feedback.filter({ hasText: 'Jev 正在匹配上级' }).waitFor()
  await field.fill('A separate errand without a matching goal')
  await set({ noMatches: true })
  await release()
  await feedback.filter({ hasText: 'Jev 未找到合适的上级' }).waitFor()
  assert.equal(await feedback.filter({ hasText: 'Delivery target' }).count(), 0)
  assert.equal(await field.inputValue(), 'A separate errand without a matching goal')
  const unmatched = await save('A separate errand without a matching goal')
  assert(!(await snapshot()).relations.some(edge => edge.childId === unmatched.id))
  check('No-match feedback belongs only to the current draft; an older answer cannot overwrite it')

  await set({ noMatches: false, failAll: true })
  const retryTitle = 'Retry the Delivery validation task'
  await field.fill(retryTitle)
  await feedback.getByRole('button', { name: '重试', exact: true }).waitFor()
  await page.screenshot({ path: `${out}/inline-failed.png` })
  await set({ failAll: false })
  await feedback.getByRole('button', { name: '重试', exact: true }).click()
  await feedback.filter({ hasText: 'Delivery target' }).waitFor()
  assert.equal(await field.inputValue(), retryTitle)
  assert.equal(await field.evaluate(node => node === document.activeElement), true)
  await linked((await save(retryTitle)).id)
  check('Inline failures expose retry while retaining the input and returning focus to it')

  await set({ failAll: true })
  const failedTitle = 'Save Delivery locally after a failed match'
  await field.fill(failedTitle)
  await feedback.getByRole('button', { name: '重试', exact: true }).waitFor()
  const savedAfterFailure = await save(failedTitle)
  assert.equal(savedAfterFailure.placement.horizon, 'day')
  await set({ failAll: false })
  await field.press('Escape')
  check('A matching failure still allows immediate Enter in the specified column')

  await set({ holdStatus: true })
  await page.reload()
  await page.locator('.board').waitFor()
  await page.getByRole('button', { name: '在今天新建', exact: true }).click()
  const earlyTitle = 'Delivery draft typed before AI status arrives'
  await field.fill(earlyTitle)
  await app.evaluate(() => {
    const fixture = globalThis.captureFixture
    fixture.holdStatus = false
    fixture.statusWaiters.splice(0).forEach(resolve => resolve())
  })
  await feedback.getByRole('button', { name: '发送给当前服务整理', exact: true }).waitFor()
  assert(!(await app.evaluate(() => globalThis.captureFixture.calls)).some(call => call.text === earlyTitle), 'Pre-consent input is not forwarded')
  await page.screenshot({ path: `${out}/inline-consent.png` })
  await feedback.getByRole('button', { name: '发送给当前服务整理', exact: true }).click()
  await feedback.filter({ hasText: 'Delivery target' }).waitFor()
  await linked((await save(earlyTitle)).id)
  await field.press('Escape')
  check('Delayed AI status offers explicit resend and can then associate the saved item')
}
