/**
 * [INPUT]: A Playwright page and an async predicate evaluated in the renderer (usually over window.goalloom).
 * [OUTPUT]: pollPage, resolving once the predicate returns truthy and throwing with its label on timeout.
 * [POS]: Shared desktop-test wait. page.waitForFunction treats an async predicate's pending Promise as truthy and returns
 *        at once, so bridge reads (getSnapshot/getItem) must be polled here instead.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export async function pollPage(page, predicate, arg, { timeout = 30_000, label = predicate.toString() } = {}) {
  const deadline = Date.now() + timeout
  while (!(await page.evaluate(predicate, arg))) {
    if (Date.now() > deadline) throw new Error(`pollPage timed out after ${timeout}ms: ${label}`)
    await page.waitForTimeout(50)
  }
}
