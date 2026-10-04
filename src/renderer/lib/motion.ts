/**
 * [INPUT]: A synchronous DOM write, usually an appearance token on <html>.
 * [OUTPUT]: That write, with transitions suspended until the frame after next paint.
 * [POS]: Renderer-only guard so theme, style and checkbox swaps do not tween every color.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
let holds = 0

/** Suspend transitions around a token swap. Overlapping calls share one hold until each has painted. */
export function withoutTransitions(apply: () => void): void {
  const root = document.documentElement
  holds += 1
  root.classList.add('no-transitions')
  try { apply() } finally {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        holds -= 1
        if (holds === 0) root.classList.remove('no-transitions')
      })
    })
  }
}
