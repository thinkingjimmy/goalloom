/**
 * [INPUT]: Isolated native description harness, production IPC and controlled link metadata.
 * [OUTPUT]: Repeatable Markdown task-list rendering, input, draft/clipboard and read-only evidence.
 * [POS]: Description-feature acceptance; checklist state belongs only to the saved Markdown.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { urls } from './link-preview-cache.mjs'
import { pollPage } from './poll.mjs'

export async function verifyDescriptionChecklists({ app, page, create, open, close, save, paste, stored, detail, note, shot }) {
  const checks = []
  const source = `## Before publishing\n\n- [ ] Read **the brief**\n- [x] Collect references\n    - [X] Check nested example\n    - [ ] Compare [the reference](${urls.youtube})\n- [ ] Review a long checklist label that wraps naturally while keeping its checkbox beside the first line, then confirm that every word remains readable.\n\n\`- [ ] inline example\`\n\n\`\`\`md\n- [x] code example\n\`\`\``
  const id = await create('Markdown task-list fixture', source)
  await open(id)
  await note().locator('h2').waitFor()
  const boxes = () => note().getByRole('checkbox')
  const first = () => boxes().first()
  assert.equal(await boxes().count(), 5, 'Task markers render as checkboxes, excluding code and nested-list wrappers')
  assert.deepEqual(await boxes().evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-checked'))), ['false', 'true', 'true', 'false', 'false'])
  assert.equal(await note().locator('ul ul [role="checkbox"]').count(), 2)
  assert.match(await note().locator('.description-code').innerText(), /- \[ \] inline example/)
  assert.match(await note().locator('.description-code-block').innerText(), /- \[x\] code example/)
  assert.equal(await detail().locator('.save-bar').count(), 0)
  assert.equal((await stored(id)).description, source)
  await shot('checklist-import')

  await detail().getByRole('button', { name: 'Edit title', exact: true }).click()
  await detail().locator('.title-input').fill('Renamed task-list fixture'); await save()
  assert.equal((await stored(id)).description, source, 'An unrelated title save retains uppercase markers and exact original bytes')
  const before = await stored(id)
  await first().click({ position: { x: 8, y: 12 } })
  assert.equal(await first().getAttribute('aria-checked'), 'true')
  assert.deepEqual(await stored(id), before, 'Toggling only changes the description draft')
  await page.keyboard.press('ControlOrMeta+z')
  await pollPage(page, () => document.querySelector('.description-content [role="checkbox"]')?.getAttribute('aria-checked') === 'false')
  assert.equal(await detail().locator('.save-bar').count(), 0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await pollPage(page, () => document.querySelector('.description-content [role="checkbox"]')?.getAttribute('aria-checked') === 'true')
  await detail().getByRole('button', { name: 'Discard', exact: true }).click()
  assert.equal(await first().getAttribute('aria-checked'), 'false')
  await first().press('Space')
  assert.equal(await first().getAttribute('aria-checked'), 'true', 'Space toggles a focused checklist marker')

  await note().press('ControlOrMeta+a')
  const copied = await note().evaluate(element => {
    const data = new DataTransfer()
    element.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data }))
    return data.getData('text/plain')
  })
  assert.match(copied, /- \[x\] Read \*\*the brief\*\*/)
  assert.match(copied, /- \[x\] Check nested example/)
  assert(copied.includes(`[the reference](${urls.youtube})`))
  await save(); await close(); await open(id)
  assert.equal(await first().getAttribute('aria-checked'), 'true')
  const saved = await stored(id)
  assert.equal(saved.status, before.status, 'Checklist completion never completes the owning task')
  assert.match(saved.description, /- \[x\] Read \*\*the brief\*\*/)
  assert.match(saved.description, /- \[x\] Check nested example/)
  assert.equal(await detail().locator('.save-bar').count(), 0)
  const originalStates = await boxes().evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-checked')))
  await note().getByRole('link', { name: 'the reference', exact: true }).click()
  assert.equal((await app.evaluate(() => globalThis.descriptionProbe.external)).at(-1), urls.youtube)
  assert.deepEqual(await boxes().evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-checked'))), originalStates)
  await first().locator('strong').click()
  assert.equal(await first().getAttribute('aria-checked'), 'true', 'Editing text does not toggle its checkbox')
  checks.push('Existing/nested/uppercase checklists render without writes; code stays literal and title-only saves retain original source')
  checks.push('Pointer/Space, undo/redo, Discard, Save/reopen and Markdown copy retain state, formatting and original URLs without completing the parent')

  const execute = action => page.evaluate(async action => {
    const { workspace } = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ ...action, generation: workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
  }, action)
  await execute({ type: 'preferences', theme: 'dark', style: 'minimal' })
  await pollPage(page, () => document.documentElement.dataset.theme === 'dark' && document.documentElement.dataset.style === 'minimal')
  await shot('checklist-dark-minimal')
  await execute({ type: 'preferences', theme: 'light', style: 'paper' })
  await execute({ type: 'delete', itemId: id, expectedVersion: saved.version })
  await pollPage(page, () => document.querySelector('.description-content')?.getAttribute('contenteditable') === 'false')
  const deleted = await stored(id)
  await first().click({ position: { x: 8, y: 12 } }); await first().press('Space')
  assert.deepEqual(await boxes().evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-checked'))), originalStates)
  assert.deepEqual(await stored(id), deleted)
  assert.equal(await detail().locator('.save-bar').count(), 0)
  await close()
  checks.push('Dark/minimal and light/paper share readable markers; deleted descriptions cannot toggle or save')

  const typed = await create('Typed checklist fixture')
  await open(typed); await note().focus()
  await note().pressSequentially('- [ ] ')
  assert.equal(await boxes().count(), 1, 'Typing a full task marker converts the existing bullet shortcut')
  await page.keyboard.type('First step'); await page.keyboard.press('Enter'); await page.keyboard.type('Nested step'); await page.keyboard.press('Tab')
  assert.equal(await note().locator('ul ul [role="checkbox"]').count(), 1)
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.type('After the checklist')
  assert.equal(await boxes().count(), 2)
  assert.match(await note().locator('p').last().innerText(), /After the checklist/)
  await save()
  assert.match((await stored(typed)).description, /- \[ \] First step\n- \[ \] Nested step/)

  await note().press('ControlOrMeta+a'); await paste('- Keep an ordinary bullet\n    - Keep a nested bullet')
  await page.keyboard.press('End'); await page.keyboard.press('Enter'); await note().pressSequentially('[ ] '); await page.keyboard.type('Nested task')
  assert.equal(await boxes().count(), 1, 'The shortcut converts only the current nested bullet')
  assert.equal(await note().locator('ul ul [role="checkbox"]').count(), 1)
  await save()
  const mixed = (await stored(typed)).description
  assert.match(mixed, /^- Keep an ordinary bullet\n {4}- Keep a nested bullet\n {4}- \[ \] Nested task/)

  await note().press('ControlOrMeta+a'); await paste('- [X] Pasted done\n- [ ] Pasted next')
  assert.deepEqual(await boxes().evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-checked'))), ['true', 'false'])
  await save()
  await note().press('ControlOrMeta+a'); await page.keyboard.press('Backspace')
  assert.equal((await note().innerText()).trim(), '', 'Keyboard deletion clears the previous checklist')
  await note().pressSequentially('- [x] '); await page.keyboard.type('Completed step'); await page.keyboard.press('Enter'); await page.keyboard.type('New step')
  assert.deepEqual(await boxes().evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-checked'))), ['true', 'false'], 'Enter continues a checked item with an unchecked item')
  await save(); await close(); await open(typed)
  assert.deepEqual(await boxes().evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-checked'))), ['true', 'false'])
  await shot('checklist-typed'); await close()
  checks.push('Typed checked/unchecked markers, Enter continuation/exit, nesting/outdent and pasted tasks survive save/reopen')
  return checks
}
