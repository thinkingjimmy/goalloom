/**
 * [INPUT]: An isolated native weekly review with two monthly sources and a first/last-day fixture.
 * [OUTPUT]: Shared review/invitation styling, current dates, no completed-period note after close/reload and retained linked creation evidence.
 * [POS]: Invitation-only group of weekly-review; uses real UI, IPC and SQLite with no model provider.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'

const appearance = card => {
  const pick = node => {
    const style = getComputedStyle(node)
    return Object.fromEntries(['backgroundColor', 'color', 'borderTopWidth', 'borderRadius', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontSize', 'fontWeight', 'lineHeight'].map(key => [key, style[key]]))
  }
  return { frame: pick(card), meta: pick(card.querySelector('.review-guide-meta')), title: pick(card.querySelector('h3')), action: pick(card.querySelector('button')) }
}

export async function verifyReviewInvitation({ page, fixture, mode, out, scenario, check }) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reference = await page.locator('.review-guide').evaluate(appearance)
  await page.locator('[data-review]').click()
  const drawer = page.locator('.review-drawer[open]')
  for (let step = 0; step < 3; step++) {
    await drawer.locator('.review-body[aria-busy=false]').waitFor()
    if (await drawer.locator('.review-plan-list').count()) break
    if (mode === 'week-first') {
      const choices = drawer.locator('.review-close-row [role=combobox]')
      for (let row = 0; row < await choices.count(); row++) {
        await choices.nth(row).click()
        await drawer.getByRole('option', { name: '留在原处', exact: true }).click()
      }
    }
    const previous = await drawer.locator('.review-steps [aria-current=step]').textContent()
    await drawer.locator('.review-foot .primary:not(:disabled)').click()
    await page.waitForFunction(previous => document.querySelector('.review-drawer[open] [aria-current=step]')?.textContent !== previous, previous)
  }
  await drawer.getByRole('button', { name: '不排入', exact: true }).click()
  await drawer.waitFor({ state: 'detached' })
  const invitation = page.locator('[data-horizon=week] .review-plan-invitation')
  await invitation.waitFor()
  assert.equal(await invitation.getByRole('heading').innerText(), '安排 本周')
  assert.equal(await invitation.locator('.review-guide-meta svg').count(), 1)
  assert.equal(await invitation.locator('button.primary.review-guide-action').count(), 1)
  assert.equal(await page.locator('[data-review]').count(), 0)
  const week = page.locator('[data-horizon=week]')
  const completedLabel = `${mode === 'week-first' ? '上周' : '本周'}已复盘`
  assert.equal(await week.locator('.reviewed-note').count(), 0)
  assert.equal(await week.getByText(completedLabel, { exact: true }).count(), 0)
  const formatted = date => new Intl.DateTimeFormat('zh', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
  const end = new Date(`${fixture.current.endDate}T12:00:00Z`); end.setUTCDate(end.getUTCDate() - 1)
  const range = `${formatted(fixture.current.startDate)} – ${formatted(end.toISOString().slice(0, 10))}`
  assert.equal(await invitation.locator('.review-guide-meta').innerText(), range)
  const styles = await invitation.evaluate(appearance)
  assert.deepEqual(styles, reference, 'The invitation shares the complete review frame/meta/title/action appearance')
  scenario.invitation = { range, reference, styles }
  await invitation.screenshot({ path: `${out}/${mode}-planning-card.png` })
  await page.reload()
  await page.locator('.board').waitFor()
  await invitation.waitFor()
  assert.equal(await page.locator('[data-review]').count(), 0)
  assert.equal(await week.locator('.reviewed-note').count(), 0)
  assert.equal(await week.getByText(completedLabel, { exact: true }).count(), 0)
  await week.screenshot({ path: `${out}/${mode}-completed-column.png` })
  check('Completed-period notes stay absent after review and reload while the planning invitation remains available')
  await invitation.getByRole('button', { name: '起草本周待办', exact: true }).click()
  const composer = page.getByRole('dialog', { name: '新建', exact: true })
  await composer.locator('.seed-heading').waitFor()
  assert.equal(await composer.locator('.seed-heading').innerText(), '起草本周待办')
  const title = `Current invitation step ${mode}`
  await composer.locator('.seed-title').first().fill(title)
  await composer.getByRole('button', { name: /^创建 1 项/ }).click()
  await composer.waitFor({ state: 'detached' })
  const result = await page.evaluate(async title => {
    const snapshot = await window.goalloom.getSnapshot()
    return { item: snapshot.items.find(item => item.title === title), relations: snapshot.relations }
  }, title)
  assert.equal(result.item.placement.periodId, fixture.current.id)
  assert(result.relations.some(edge => edge.parentId === fixture.parent && edge.childId === result.item.id))
  await invitation.waitFor({ state: 'detached' })
  scenario.created = result.item.id
  check('Post-review planning shares review styling/current dates and creates a linked current-week task through its original action')
}
