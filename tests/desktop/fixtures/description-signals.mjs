/**
 * [INPUT]: The descriptions Electron page, its create/stored helpers and screenshot hook.
 * [OUTPUT]: Board note-signal and read-only peek assertions (progress, next item, link host +N, excerpt, no signal
 *           without a note, hover/focus opening, Escape, drag/detail isolation, saved bytes untouched) with screenshots.
 * [POS]: Task-description acceptance fixture for the D5 "signal + peek" board presentation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { urls } from './link-preview-cache.mjs'

export async function verifyDescriptionSignals({ page, create, stored, detail, shot }) {
  const checks = []
  const checklist = await create('Signal checklist fixture', `Launch plan\n\n- [x] Draft the brief\n- [ ] Ship **the build** ${urls.youtube}\n- [ ] Tell the team ${urls.x}\n\n\`https://example.com/code\` stays literal`)
  const prose = await create('Signal prose fixture', '## Why this matters\n\nKeep the sidebar calm.')
  const plain = await create('Signal empty fixture')
  const signal = id => page.locator(`#item-${id} .note-signal`)
  const peek = () => page.locator('.note-peek-panel')

  await signal(checklist).waitFor()
  assert.equal(await signal(checklist).innerText().then(text => text.replace(/\s+/g, ' ').trim()), '1/3 YouTube +1 Ship the build')
  assert.equal(await signal(prose).innerText().then(text => text.trim()), 'Why this matters')
  assert.equal(await signal(plain).count(), 0, 'Rows without a description have no signal')
  checks.push('Signals show checklist progress, the first open item and link source +N (code spans excluded), a plain first line, and nothing for empty notes')

  const before = await stored(checklist)
  await signal(checklist).hover()
  await peek().waitFor()
  assert.match(await peek().innerText(), /Launch plan/)
  assert.equal(await peek().locator('[contenteditable="true"]').count(), 0, 'The peek is read-only')
  assert.equal(await detail().count(), 0, 'Hovering never opens the detail')
  await shot('signal-peek-hover')
  await peek().getByRole('checkbox').first().click({ position: { x: 8, y: 12 } })
  assert.deepEqual(await stored(checklist), before, 'Peek checklist markers never write')
  await page.keyboard.press('Escape')
  await peek().waitFor({ state: 'hidden' })
  checks.push('Hover opens a read-only peek with the full note; markers cannot write; Escape closes it without opening the detail')

  await page.mouse.move(2, 2)
  await signal(prose).focus()
  await peek().waitFor()
  assert.match(await peek().innerText(), /Keep the sidebar calm/)
  await page.keyboard.press('Escape')
  await peek().waitFor({ state: 'hidden' })
  await signal(prose).click()
  await peek().waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dragging ?? null), null, 'Pressing the signal never starts a drag')
  await page.keyboard.press('Escape')
  checks.push('Keyboard focus and click open the same peek; pressing the signal does not drag the row')
  return checks
}
