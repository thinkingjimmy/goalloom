/**
 * [INPUT]: Isolated Electron board and controlled complete/held Jev answers.
 * [OUTPUT]: Persisted ready/late recognition parity, explicit ownership, existing-child and untimed-context evidence.
 * [POS]: Capture regression journey through production planning, composer, IPC and SQLite; no live provider.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { pollPage } from './poll.mjs'

export async function runCaptureRecognitionUI({ app, page, out, check, report }) {
  const ids = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const create = async values => {
      const reply = await window.goalloom.execute({ type: 'create', operationId: crypto.randomUUID(), generation, ...values })
      if (!reply.ok) throw Error(reply.message)
      return reply.result.itemId
    }
    const release = await create({ title: 'Release Solara with billing', horizon: 'month', flowColor: 4 })
    const owner = await create({ title: 'Complete Solara 2 development', horizon: 'week', parentId: release,
      expectedParentVersion: (await window.goalloom.getItem(release)).item.version })
    const child = await create({ title: 'Implement Solara account AI settings', horizon: 'week', nesting: { parentId: owner,
      expectedParentVersion: (await window.goalloom.getItem(owner)).item.version,
      expectedParentPlacementVersion: (await window.goalloom.getItem(owner)).item.placement.version } })
    return { release, owner, child }
  })
  const cases = [
    { id: 'written-week', text: '本周实现 Solara 账号 AI', horizon: 'week', owner: ids.owner },
    { id: 'future', text: '下周实现 Solara 账号 AI', horizon: 'future', expected: 'later', owner: null },
    { id: 'explicit-owner', text: '本周核验 Solara AI 归入「Complete Solara 2 development」', horizon: 'week', owner: ids.owner, noMatches: true },
    { id: 'explicit-owner-en', text: 'Verify Solara AI this week put under "Complete Solara 2 development"', horizon: 'week', owner: ids.owner, noMatches: true },
    { id: 'existing-child', text: '本周完善 Solara 账号 AI 设置', horizon: 'week', owner: ids.owner, leaf: true },
    { id: 'untimed', text: '完成 Solara 中心化 AI 服务功能', horizon: 'later', inferred: 'week', owner: ids.owner },
    { id: 'untimed-existing-child', text: '完善 Solara 账号 AI 设置交互', horizon: 'later', inferred: 'week', owner: ids.owner, leaf: true },
    { id: 'untimed-weak-month', text: '建设 Solara 服务集成能力', horizon: 'later', inferred: 'month', weak: true, owner: ids.owner, leaf: true },
    { id: 'untimed-strong-month', text: '重建 Solara 服务架构', horizon: 'later', inferred: 'month', expected: 'month', owner: null },
    { id: 'untimed-later', text: '以后考虑 Solara 辅助功能', horizon: 'later', inferred: 'later', expected: 'later', owner: null },
    { id: 'explicit-link', text: '本周校验 Solara AI 关联「Complete Solara 2 development」', horizon: 'week', owner: null },
    { id: 'negated-owner', text: '本周编写旅行清单，不要归入「Complete Solara 2 development」', horizon: 'week', owner: null, noMatches: true },
  ]
  report.recognition = []
  for (const test of cases) for (const timing of ['ready', 'late']) {
    await app.evaluate((_, test) => Object.assign(globalThis.captureFixture, {
      hold: test.timing === 'late', ignoreAnnual: true, horizon: test.horizon, inferred: test.inferred ?? 'week', weakInference: !!test.weak, noMatches: !!test.noMatches, modifiers: test.id === 'negated-owner',
      target: 'Complete Solara 2 development', extraTarget: test.id === 'untimed-strong-month' ? null : 'Release Solara with billing',
      targets: test.leaf ? ['Implement Solara account AI settings'] : [],
    }), { ...test, timing })
    await page.keyboard.press('ControlOrMeta+n')
    const field = page.getByRole('textbox', { name: '写下想法', exact: true })
    const text = `${test.text} (${test.id} ${timing})`
    await field.fill(text)
    let sentence = null
    if (timing === 'ready') {
      await page.locator('.plan-sentence').waitFor()
      sentence = await page.locator('.plan-sentence').innerText()
      assert(sentence.includes(test.expected === 'later' ? 'Later' : test.expected === 'month' ? '本月' : '本周'), sentence)
      assert.equal(sentence.includes('设为其二级'), !!test.owner, sentence)
    }
    const before = await page.evaluate(async () => (await window.goalloom.getSnapshot()).items.map(item => item.id))
    await field.press('Enter')
    await page.getByRole('dialog', { name: '新建', exact: true }).waitFor({ state: 'hidden' })
    const saved = await page.evaluate(async before => (await window.goalloom.getSnapshot()).items.find(item => !before.includes(item.id)), before)
    assert(saved)
    if (timing === 'late') {
      assert.equal(saved.placement.horizon, 'later')
      await app.evaluate(() => { const f = globalThis.captureFixture; f.hold = false; f.waiters.splice(0).forEach(resolve => resolve()) })
      await pollPage(page, async text => {
        const history = await window.goalloom.getSnapshot()
        return !!history.items.find(item => item.title === text)
      }, text)
      await app.evaluate(async (_, text) => {
        const deadline = Date.now() + 10000
        while (!globalThis.captureFixture.calls.some(row => row.text === text) || globalThis.captureFixture.calls.some(row => row.text === text && !row.settled)) {
          if (Date.now() > deadline) throw Error('Recognition analysis did not settle')
          await new Promise(resolve => setTimeout(resolve, 20))
        }
      }, text)
    }
    const expected = test.expected ?? 'week'
    await pollPage(page, async ({ id, expected, owner }) => {
      const item = (await window.goalloom.getItem(id)).item
      return item.placement.horizon === expected && (item.placement.nestingParentId ?? null) === owner
    }, { id: saved.id, expected, owner: test.owner })
    const detail = await page.evaluate(id => window.goalloom.getItem(id), saved.id)
    assert.equal(detail.item.placement.horizon, expected)
    assert.equal(detail.item.placement.nestingParentId ?? null, test.owner)
    if (test.owner) assert(detail.relations.some(edge => edge.parentId === ids.release && edge.inheritedFrom?.rootId === ids.owner))
    if (test.id === 'explicit-link') assert(!detail.relations.some(edge => edge.parentId === ids.owner))
    if (expected === 'later' || test.id === 'negated-owner') assert.equal(detail.relations.length, 0)
    const calls = await app.evaluate((_, text) => globalThis.captureFixture.calls.filter(call => call.text === text), text)
    if (test.inferred) assert(calls.some(call => call.planningGoals?.some(goal => goal.title === 'Complete Solara 2 development')), 'Untimed inference receives bounded board context')
    report.recognition.push({ id: test.id, timing, sentence, itemId: saved.id, placement: detail.item.placement, relations: detail.relations, planningGoals: calls.flatMap(call => call.planningGoals ?? []) })
    await page.screenshot({ path: `${out}/recognition-${test.id}-${timing}.png` })
    await page.keyboard.press('ControlOrMeta+z')
    await pollPage(page, async id => !!(await window.goalloom.getItem(id)).item.deletedAt, saved.id)
    check(`Recognition ${test.id}/${timing}: ${expected}, ${test.owner ? 'second-level under eligible root' : 'independent'}, one undo`)
  }
  await app.evaluate(() => Object.assign(globalThis.captureFixture, { hold: false, conflict: true, modifiers: false, noMatches: false,
    horizon: 'week', inferred: 'week', target: 'Complete Solara 2 development', extraTarget: 'Implement Solara account AI settings' }))
  await page.keyboard.press('ControlOrMeta+n')
  const list = page.getByRole('textbox', { name: '写下想法', exact: true })
  await list.fill('本周实现 Solara 账号 AI\n本周完善 Solara 账号 AI 设置')
  await page.locator('.plan-line').nth(1).waitFor()
  const lines = await page.locator('.plan-line .plan-where').allInnerTexts()
  assert(lines.every(line => line.includes('本周') && !line.includes('今天')))
  const before = await page.evaluate(async () => (await window.goalloom.getSnapshot()).items.map(item => item.id))
  await list.press('Enter')
  await page.getByRole('dialog', { name: '新建', exact: true }).waitFor({ state: 'hidden' })
  const created = await page.evaluate(async before => (await window.goalloom.getSnapshot()).items.filter(item => !before.includes(item.id)), before)
  assert.equal(created.length, 2)
  assert(created.every(item => item.placement.horizon === 'week' && !item.placement.nestingParentId))
  await page.screenshot({ path: `${out}/recognition-written-list.png` })
  report.recognition.push({ id: 'written-list', lines, placements: created.map(item => item.placement) })
  await page.keyboard.press('ControlOrMeta+z')
  await pollPage(page, async ids => (await Promise.all(ids.map(id => window.goalloom.getItem(id)))).every(row => !!row.item.deletedAt), created.map(item => item.id))
  check('Written Week survives conflicting candidate goals in both list items without automatic nesting')
  await app.evaluate(() => Object.assign(globalThis.captureFixture, { target: 'Delivery target', extraTarget: null, targets: [], noMatches: false, conflict: false, modifiers: false, ignoreAnnual: false, weakInference: false, horizon: null, inferred: null }))
}
