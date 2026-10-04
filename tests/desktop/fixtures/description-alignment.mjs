/**
 * [INPUT]: Native description harness, real text ranges, language preferences and production theme controls.
 * [OUTPUT]: Repeatable empty/typed first-line geometry and screenshots across locales, themes and window zoom.
 * [POS]: Description typography regression; no mocked font metrics or synthetic caret styling.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

// Failure cases: the placeholder and typed first character have different baselines; theme/locale/zoom changes
// reintroduce drift; focus alone writes an empty note; adjusting typography collapses the full-height editor.
export async function verifyDescriptionAlignment({ app, page, create, stored, detail, output, shot }) {
  const id = await create('Description alignment fixture'), checks = [], geometry = []
  let complete = false
  const note = () => detail().locator('.description-content')
  const firstGlyph = element => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode(), range = document.createRange()
    range.setStart(text, 0); range.setEnd(text, 1)
    const rect = range.getBoundingClientRect()
    return { top: rect.top, left: rect.left, height: rect.height }
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
            const style = getComputedStyle(element), prompt = getComputedStyle(element.parentElement.querySelector('.description-placeholder'))
            return { height: element.getBoundingClientRect().height, focused: document.activeElement === element,
              lineHeight: style.lineHeight, marginTop: style.marginTop, paddingTop: style.paddingTop, placeholderLineHeight: prompt.lineHeight, placeholderTop: prompt.top }
          })
          assert.equal(layout.focused, true)
          assert(layout.height >= 160, 'Typography preserves the full-height description area')
          assert.deepEqual(await stored(id), before, 'Focusing an empty description does not save or dirty it')
          if (locale === 'zh' || (locale === 'en' && style === 'paper' && theme === 'light')) await shot(`alignment-${label}-empty`)
          await note().pressSequentially(character)
          await placeholder.waitFor({ state: 'hidden' })
          const typed = await note().locator('p').first().evaluate(firstGlyph)
          const evidence = { label, empty, typed, layout, verticalDrift: typed.top - empty.top, horizontalDrift: typed.left - empty.left }
          geometry.push(evidence)
          assert(Math.abs(evidence.verticalDrift) <= .5, `${label}: typing must preserve the placeholder baseline (${evidence.verticalDrift}px drift)`)
          assert(Math.abs(evidence.horizontalDrift) <= .5, `${label}: typing must preserve the placeholder inset`)
          assert(Math.abs(typed.height - empty.height) <= .5, `${label}: placeholder and input share font metrics`)
          await note().press('Backspace')
          await placeholder.waitFor()
          await page.keyboard.press('Escape'); await detail().waitFor({ state: 'hidden' })
          assert.equal((await stored(id)).description, '')
          checks.push(`${label}: placeholder/typed baseline and inset match; focus is read-only; editor height is retained`)
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
