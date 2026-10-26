/**
 * [INPUT]: Real settings preview clicks and the production Canvas player in an isolated Electron page.
 * [OUTPUT]: Nine deterministic draw-path, origin, sprite-release and screenshot checks.
 * [POS]: Celebration acceptance helper; only the next shape-selection random value is controlled.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'

const shapes = [null, '🎉', '❤️', '✨', '🎊', '⭐️', '🌈', '🔥', '🥳']

export async function observeCelebrationShapes(page) {
  await page.evaluate(() => {
    const evidence = window.celebrationShapes = { next: null, rounds: [] }
    const sprites = new WeakMap()
    const show = HTMLCanvasElement.prototype.showPopover
    HTMLCanvasElement.prototype.showPopover = function (...args) {
      const result = show.apply(this, args)
      if (!this.matches('.completion-celebration')) return result
      evidence.rounds.push({ glyphs: [], sprites: [], origins: [], rects: 0, images: 0, frameImages: 0, maxFrameImages: 0, frameRects: 0, maxFrameRects: 0, distorted: false })
      if (evidence.next !== null) {
        const choice = evidence.next
        evidence.next = null
        const random = Math.random
        // Production selects the shape synchronously after opening its canvas. Particle randomness stays real.
        Math.random = () => { Math.random = random; return choice }
      }
      return result
    }
    const active = context => context.canvas instanceof HTMLCanvasElement && context.canvas.matches('.completion-celebration') ? evidence.rounds.at(-1) : null
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      if (['🎉', '❤️', '✨', '🎊', '⭐️', '🌈', '🔥', '🥳'].includes(text)) {
        sprites.set(this.canvas, text)
        const round = evidence.rounds.at(-1)
        if (round) { round.glyphs.push(text); round.sprites.push(this.canvas) }
      }
      return fillText.call(this, text, ...args)
    }
    const translate = CanvasRenderingContext2D.prototype.translate
    CanvasRenderingContext2D.prototype.translate = function (x, y) {
      const round = active(this)
      if (round && round.origins.length < 2) round.origins.push({ x, y })
      return translate.call(this, x, y)
    }
    const clear = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      const round = active(this)
      if (round) { round.frameImages = 0; round.frameRects = 0 }
      return clear.apply(this, args)
    }
    const drawImage = CanvasRenderingContext2D.prototype.drawImage
    CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
      const round = active(this)
      if (round) {
        round.images++
        round.maxFrameImages = Math.max(round.maxFrameImages, ++round.frameImages)
        const matrix = this.getTransform()
        round.distorted ||= !sprites.has(source) || Math.abs(Math.hypot(matrix.a, matrix.b) - Math.hypot(matrix.c, matrix.d)) > 0.001 || args[2] !== args[3]
      }
      return drawImage.call(this, source, ...args)
    }
    const fillRect = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      const round = active(this)
      if (round) { round.rects++; round.maxFrameRects = Math.max(round.maxFrameRects, ++round.frameRects) }
      return fillRect.apply(this, args)
    }
  })
}

export async function verifyCelebrationShapes({ page, preview, waitForCleanup, shot }) {
  const results = []
  for (const [index, emoji] of shapes.entries()) {
    await page.evaluate(index => { window.celebrationShapes.next = (index + 0.5) / 9 }, index)
    await preview.click()
    await page.waitForFunction(emoji => {
      const round = window.celebrationShapes.rounds.at(-1)
      return emoji ? round?.maxFrameImages === 96 : round?.maxFrameRects === 180
    }, emoji)
    await shot(`completion-shape-${index}`)
    await waitForCleanup()
    const result = await page.evaluate(() => {
      const { sprites, ...round } = window.celebrationShapes.rounds.at(-1)
      return { ...round, released: sprites.every(sprite => sprite.width === 1 && sprite.height === 1), viewport: { width: innerWidth, height: innerHeight } }
    })
    assert.deepEqual(result.origins, [{ x: 0, y: result.viewport.height }, { x: result.viewport.width, y: result.viewport.height }])
    assert.deepEqual(result.glyphs, emoji ? [emoji] : [], 'Rasterize only the selected glyph, exactly once')
    assert.equal(result.distorted, false, 'Emoji keeps square dimensions without confetti squash')
    assert.equal(result.released, true, 'Cleanup releases the cached glyph backing store')
    if (emoji) {
      assert.equal(result.rects, 0, 'Emoji bursts contain no confetti rectangles')
      assert.equal(result.maxFrameImages, 96, 'Both sides draw 48 copies of the same sprite')
    } else {
      assert.equal(result.images, 0)
      assert.equal(result.maxFrameRects, 180)
    }
    results.push({ emoji, ...result })
  }
  return results
}
