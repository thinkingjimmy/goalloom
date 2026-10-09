/**
 * [INPUT]: Native description harness, real text ranges, language preferences and production theme controls.
 * [OUTPUT]: Repeatable empty/typed/saved text and field-edge geometry across locales, themes and window zoom.
 * [POS]: Description typography regression; no mocked font metrics or synthetic caret styling.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { waitForDetailSave } from './detail-save.mjs'

// Failure cases: the placeholder and typed first character have different baselines; theme/locale/zoom changes
// reintroduce drift; the focused fill's edge meets the placeholder or caret; focus alone writes an empty note;
// adjusting typography collapses the minimum editing target; the fill protrudes beyond the content column;
// saved/reopened text retains editing padding or outdents; long text escapes the column or changes source.
export async function verifyDescriptionAlignment({ app, page, create, stored, detail, output, shot }) {
  const id = await create('Description alignment fixture'), checks = [], geometry = []
  let complete = false
  const note = () => detail().locator('.description-content')
  const finishEditing = async () => { await detail().locator('.modal-context').click(); await waitForDetailSave(page) }
  const firstGlyph = element => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode(), range = document.createRange()
    range.setStart(text, 0); range.setEnd(text, 1)
    const rect = range.getBoundingClientRect()
    return { top: rect.top, left: rect.left, height: rect.height }
  }
  const fieldGeometry = () => note().evaluate(element => {
    const field = element.getBoundingClientRect(), column = element.closest('.detail-body').querySelector('.detail-props').getBoundingClientRect()
    const body = element.closest('.detail-body')
    return { left: field.left, right: field.right, columnLeft: column.left, columnRight: column.right,
      focused: element.contains(document.activeElement), horizontalOverflow: body.scrollWidth > body.clientWidth + 1 }
  })
  const assertColumnEdges = (field, label) => {
    assert(Math.abs(field.left - field.columnLeft) <= .5, `${label}: the field left edge must align with the content column`)
    assert(Math.abs(field.right - field.columnRight) <= .5, `${label}: the field right edge must align with the content column`)
    assert.equal(field.horizontalOverflow, false, `${label}: the description must not scroll sideways`)
  }
  try {
    for (const locale of ['zh', 'en', 'ja', 'es', 'fr']) {
      await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
      await page.reload(); await page.locator('main.board').waitFor()
      for (const style of ['paper', 'minimal']) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ style, theme }) => {
          const { workspace } = await window.goalloom.getSnapshot()
          const reply = await window.goalloom.execute({ type: 'preferences', style, theme, generation: workspace.generation, operationId: crypto.randomUUID() })
          if (!reply.ok) throw Error(reply.message)
        }, { style, theme })
        await page.waitForFunction(({ style, theme }) => document.documentElement.dataset.style === style && document.documentElement.dataset.theme === theme, { style, theme })
        for (const { width, height, zoom } of [{ width: 1440, height: 920, zoom: 1 }, { width: 720, height: 640, zoom: 1.5 }]) {
          await app.evaluate(({ BrowserWindow }, { width, height, zoom }) => {
            const window = BrowserWindow.getAllWindows()[0]
            window.setContentSize(width, height); window.webContents.setZoomFactor(zoom)
          }, { width, height, zoom })
          await page.locator(`#item-${id} .task-title`).press('Enter')
          await note().waitFor()
          const before = await stored(id)
          await note().click({ position: { x: 12, y: 12 } })
          const placeholder = detail().locator('.description-placeholder')
          await placeholder.waitFor()
          const label = `${locale}-${style}-${theme}-${width}-zoom-${zoom}`, character = (await placeholder.innerText())[0]
          const empty = await placeholder.evaluate(firstGlyph)
          const layout = await note().evaluate(element => {
            const style = getComputedStyle(element), promptNode = element.parentElement.querySelector('.description-placeholder'), prompt = getComputedStyle(promptNode)
            const box = element.getBoundingClientRect(), promptBox = promptNode.getBoundingClientRect(), body = element.closest('.detail-body')
            return { height: box.height, focused: document.activeElement === element,
              lineHeight: style.lineHeight, marginTop: style.marginTop, paddingTop: style.paddingTop, placeholderLineHeight: prompt.lineHeight, placeholderTop: prompt.top,
              fieldInset: promptBox.left - box.left, horizontalOverflow: body.scrollWidth > body.clientWidth + 1 }
          })
          assert.equal(layout.focused, true)
          assert(layout.height >= 64, 'Typography preserves the compact note editing target')
          assert(layout.fieldInset >= 10, `${label}: placeholder must sit inside the focused field (${layout.fieldInset}px from its edge)`)
          assert.equal(layout.horizontalOverflow, false, `${label}: the field inset must not make the detail scroll sideways`)
          assert.deepEqual(await stored(id), before, 'Focusing an empty description does not save or dirty it')
          if (locale === 'zh' || (locale === 'en' && style === 'paper' && theme === 'light')) await shot(`alignment-${label}-empty`)
          await note().pressSequentially(character)
          await placeholder.waitFor({ state: 'hidden' })
          const typed = await note().locator('p').first().evaluate(firstGlyph)
          const evidence = { label, empty, typed, layout, verticalDrift: typed.top - empty.top, horizontalDrift: typed.left - empty.left }
          geometry.push(evidence)
          evidence.editing = await fieldGeometry()
          assertColumnEdges(evidence.editing, `${label}: editing`)
          assert(Math.abs(evidence.verticalDrift) <= .5, `${label}: typing must preserve the placeholder baseline (${evidence.verticalDrift}px drift)`)
          assert(Math.abs(evidence.horizontalDrift) <= .5, `${label}: typing must preserve the placeholder inset`)
          assert(Math.abs(typed.height - empty.height) <= .5, `${label}: placeholder and input share font metrics`)
          const source = `${character} Saved notes stay aligned. ${'Long text wraps inside the content column. '.repeat(8)}`.trim()
          await note().fill(source)
          await finishEditing()
          evidence.saved = { ...await fieldGeometry(), glyph: await note().locator('p').first().evaluate(firstGlyph) }
          assertColumnEdges(evidence.saved, `${label}: saved`)
          assert.equal(evidence.saved.focused, false)
          assert(Math.abs(evidence.saved.glyph.left - evidence.saved.columnLeft) <= .5, `${label}: saved text must have no extra indentation or outdent`)
          assert.equal((await stored(id)).description, source, 'Changing presentation never adds indentation to the saved Markdown')
          const capture = locale === 'en' && style === 'paper' && theme === 'light'
          if (capture) await shot(`alignment-${label}-saved`)
          await page.keyboard.press('Escape'); await detail().waitFor({ state: 'hidden' })
          await page.locator(`#item-${id} .task-title`).press('Enter'); await note().waitFor()
          evidence.reopened = { ...await fieldGeometry(), glyph: await note().locator('p').first().evaluate(firstGlyph) }
          assertColumnEdges(evidence.reopened, `${label}: reopened`)
          assert.equal(evidence.reopened.focused, false)
          assert(Math.abs(evidence.reopened.glyph.left - evidence.reopened.columnLeft) <= .5, `${label}: reopened text must align with the content column`)
          await note().click()
          evidence.refocused = { ...await fieldGeometry(), glyph: await note().locator('p').first().evaluate(firstGlyph) }
          assertColumnEdges(evidence.refocused, `${label}: refocused`)
          assert(evidence.refocused.glyph.left - evidence.refocused.left >= 10, `${label}: editing text must stay inside the fill`)
          if (capture) await shot(`alignment-${label}-editing`)
          await note().press('ControlOrMeta+a')
          await note().press('Backspace')
          await placeholder.waitFor()
          await finishEditing()
          evidence.idlePlaceholder = await placeholder.evaluate(firstGlyph)
          assert(Math.abs(evidence.idlePlaceholder.left - evidence.saved.columnLeft) <= .5, `${label}: the unfocused prompt aligns with saved text`)
          await page.keyboard.press('Escape'); await detail().waitFor({ state: 'hidden' })
          assert.equal((await stored(id)).description, '')
          checks.push(`${label}: field edges stay in the column; saved/reopened text has no extra indent; placeholder/typed metrics match; focus does not write; editor height is retained`)
        }
      }
    }
    complete = true
    return checks
  } catch (error) {
    geometry.push({ failure: error.message, nativeWindows: await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getContentBounds() }))),
      document: await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML,
        note: document.querySelector('dialog.detail .description-editor')?.outerHTML, selection: window.getSelection()?.toString() })) })
    throw error
  } finally {
    await writeFile(`${output}/alignment-geometry.json`, JSON.stringify(geometry, null, 2))
    if (complete) {
      await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]
        window.webContents.setZoomFactor(1); window.setContentSize(1440, 920)
      })
      await page.evaluate(() => window.goalloom.setLanguage('en'))
      await page.reload(); await page.locator('main.board').waitFor()
    }
  }
}
