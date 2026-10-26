/**
 * [INPUT]: The mounted production renderer document and its computed styles.
 * [OUTPUT]: Layout evidence and failures for missing utilities, broken owning surfaces and clipped dialogs.
 * [POS]: Review E2E checks; verifies presentation independently of error text and scenario readiness.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export function inspectLayout(document: Document) {
  const view = document.defaultView!
  const problems: string[] = []
  const measured: { selector: string; display: string; direction: string; padding: string; gap: string }[] = []
  const probe = document.createElement('div')
  probe.className = 'flex flex-col gap-4 px-4 rounded-[10px]'
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none'
  document.body.append(probe)
  const utilities = view.getComputedStyle(probe)
  const utilityState = { display: utilities.display, direction: utilities.flexDirection, gap: utilities.gap, paddingLeft: utilities.paddingLeft, borderRadius: utilities.borderRadius }
  if (utilityState.display !== 'flex' || utilityState.direction !== 'column' || parseFloat(utilityState.gap) <= 0 || parseFloat(utilityState.paddingLeft) <= 0 || parseFloat(utilityState.borderRadius) !== 10) problems.push(`Product utilities are missing: ${JSON.stringify(utilityState)}`)
  probe.remove()
  for (const selector of ['.settings-body', '.settings-row-text', '.settings-hero', '.stepper', '.settings-alert', '.composer-body', '.jev-connect', '.review-layout', '.sync-pane', '.start-form', '.shortcut-row', '.provider-row']) {
    const node = document.querySelector<HTMLElement>(selector)
    if (!node || !node.getClientRects().length) continue
    const style = view.getComputedStyle(node)
    measured.push({ selector, display: style.display, direction: style.flexDirection, padding: style.padding, gap: style.gap })
    if (style.display !== 'flex') problems.push(`${selector} must use the product flex layout; found ${style.display}`)
    if (node.classList.contains('flex-col') && style.flexDirection !== 'column') problems.push(`${selector} lost its column layout`)
    if (selector === '.settings-body' && (parseFloat(style.paddingLeft) === 0 || parseFloat(style.gap) === 0 || style.gap === 'normal')) problems.push('Settings pane spacing is missing')
  }
  const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].map(node => {
    const rect = node.getBoundingClientRect()
    const bounds = { className: node.className, x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    if (rect.x < -1 || rect.y < -1 || rect.right > view.innerWidth + 1 || rect.bottom > view.innerHeight + 1) problems.push(`Dialog exceeds its viewport: ${JSON.stringify(bounds)}`)
    return bounds
  })
  return { utilityState, measured, dialogs, problems }
}
