/**
 * [INPUT]: Live Settings dialog, connected synthetic OpenRouter account and the owning Electron journey.
 * [OUTPUT]: Compact-row geometry, four-appearance screenshots, offline logos and icon/hint/form/removal acceptance.
 * [POS]: AI-service checks owned by insight-generation; no real provider calls or personal data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'

export async function verifyAiServices(page, mode, out) {
  const settings = page.locator('dialog.settings-modal')
  const rows = settings.locator('.smart-provider')
  const connected = rows.filter({ hasText: 'OpenRouter' })
  const available = rows.filter({ hasText: 'Vercel AI Gateway' })
  await rows.first().waitFor()
  assert.equal(await settings.locator('.settings-card:has(.smart-provider)').count(), 1)
  assert.equal(await rows.count(), 2)
  await connected.getByText('已连接', { exact: true }).waitFor()
  await available.getByText('未连接', { exact: true }).waitFor()
  assert.equal(await settings.locator('.capability-chip').count(), 0)
  assert.doesNotMatch((await rows.allTextContents()).join(' '), /Jev|DeepSeek|正在使用/)
  assert.equal(await rows.locator('.provider-logo').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true)
  for (const action of ['更换 Key', '移除']) {
    const button = connected.getByRole('button', { name: action, exact: true })
    assert.equal(await button.innerText(), '')
    assert.equal(await button.locator('svg').count(), 1)
    const box = await button.boundingBox()
    assert(box.width >= 40 && box.height >= 40)
  }

  const originalAppearance = await page.evaluate(() => ({ style: document.documentElement.dataset.style, theme: document.documentElement.dataset.theme }))
  const geometry = []
  for (const style of ['paper', 'minimal']) for (const theme of ['light', 'dark']) {
    await page.evaluate(value => Object.assign(document.documentElement.dataset, value), { style, theme })
    geometry.push({ style, theme, rows: await rows.evaluateAll(nodes => nodes.map(node => {
      const row = node.querySelector('.provider-row'), rect = row.getBoundingClientRect()
      return { width: rect.width, height: rect.height, overflow: row.scrollWidth > row.clientWidth }
    })) })
    assert(geometry.at(-1).rows.every(row => !row.overflow))
    await settings.screenshot({ path: `${out}/${mode}-ai-services-${style}-${theme}.png` })
  }
  await page.evaluate(value => Object.assign(document.documentElement.dataset, value), originalAppearance)
  const replace = connected.getByRole('button', { name: '更换 Key', exact: true })
  await replace.hover()
  const hint = settings.getByRole('tooltip', { name: '更换 Key', exact: true })
  await hint.waitFor()
  assert.equal(await hint.evaluate(node => !!node.closest('dialog[open]')), true)
  await settings.screenshot({ path: `${out}/${mode}-ai-services-tooltip.png` })
  await page.keyboard.press('Escape')
  await hint.waitFor({ state: 'hidden' })
  assert.equal(await settings.isVisible(), true)
  await page.mouse.move(1, 1)

  const add = available.getByRole('button', { name: '添加 Key', exact: true })
  await add.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await settings.getByRole('tooltip', { name: '添加 Key', exact: true }).waitFor()
  await add.click()
  assert.equal(await settings.getByRole('tooltip').count(), 0)
  await available.getByLabel('Vercel AI Gateway API Key').waitFor()
  assert.equal(await available.getByRole('checkbox').isChecked(), false)
  await available.getByRole('button', { name: '收起', exact: true }).click()
  await available.locator('form').waitFor({ state: 'detached' })

  await connected.getByRole('button', { name: '移除', exact: true }).click()
  await connected.getByRole('alert').waitFor()
  assert.match(await connected.getByRole('alert').innerText(), /智能输入、洞察会停用/)
  await settings.screenshot({ path: `${out}/${mode}-ai-services-remove-confirm.png` })
  await connected.getByRole('button', { name: '保留', exact: true }).click()
  await connected.getByText('已连接', { exact: true }).waitFor()
  await replace.click()
  await connected.getByLabel('OpenRouter API Key').fill('synthetic-replacement-key')
  await connected.getByRole('checkbox').check()
  await connected.getByRole('button', { name: '测试并保存', exact: true }).click()
  await connected.locator('form').waitFor({ state: 'detached' })
  await connected.getByText('已连接', { exact: true }).waitFor()
  await settings.screenshot({ path: `${out}/${mode}-settings-ai.png` })
  return { geometry, logos: 'Bundled official website assets', hints: ['pointer', 'keyboard', 'scoped Escape'], actions: ['add form', 'replace with consent and test', 'remove warning', 'keep'] }
}
