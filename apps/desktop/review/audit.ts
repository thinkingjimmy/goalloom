/**
 * [INPUT]: Review catalog, real product iframe and an optional comma-separated scene selector.
 * [OUTPUT]: Repeatable DOM evidence and a machine-readable verification report.
 * [POS]: Review-only E2E harness; uses the same entry a reviewer opens.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { scenarios } from './catalog'
import { inspectLayout } from './layout'

const frame = document.querySelector<HTMLIFrameElement>('iframe')!
const progress = document.getElementById('progress')!
const params = new URLSearchParams(location.search)
const requested = params.get('scenes')?.split(',')
const selected = requested ? scenarios.filter(scene => requested.includes(scene.id) || requested.includes(scene.surface)) : scenarios
const results: Record<string, unknown>[] = []
for (const scene of selected) {
  progress.textContent = `${results.length + 1}/${selected.length}: ${scene.id}`
  const result = await new Promise<Record<string, unknown>>(resolve => {
    const started = performance.now()
    const finish = (state: string, error?: string) => {
      clearTimeout(timer); window.removeEventListener('message', receive)
      const doc = frame.contentDocument!
      const alerts = [...doc.querySelectorAll('[role="alert"], .notice-banner, .quick-add-smart[data-phase="failed"], .jev-result, .provider-state[data-state="issue"], .sync-status[data-state="bad"], .shortcut-conflict, .about-status[data-phase="failed"]')].map(node => node.textContent || node.getAttribute('aria-label'))
      const text = doc.body.innerText
      const native = scene.surface === 'native'
      const rendered = native ? [...doc.images].some(image => image.complete && image.naturalWidth > 0) : !scene.message || (text + alerts.join(' ')).replaceAll(/\s/gu, '').includes(scene.message.replaceAll(/\s/gu, ''))
      const board = !!doc.querySelector('.board')
      const layout = native ? null : inspectLayout(doc)
      const passed = state === 'passed' && rendered && (native || board || scene.surface === 'start') && !layout?.problems.length
      resolve({ id: scene.id, surface: scene.surface, state: passed ? 'passed' : 'failed', error: error ?? (!rendered ? 'Expected error copy was not rendered' : layout?.problems.length ? layout.problems.join('; ') : !passed ? 'Real board context missing' : null), elapsed: Math.round(performance.now() - started), board, dialogs: doc.querySelectorAll('dialog[open]').length, layout, alerts, text, source: scene.source })
    }
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow) return
      if (event.data?.type === 'goalloom-review-ready') finish('passed')
      if (event.data?.type === 'goalloom-review-error') finish('failed', event.data.message)
    }
    const timer = setTimeout(() => finish('failed', 'No readiness message after 15 seconds'), 15000)
    window.addEventListener('message', receive)
    frame.src = `/app.html?${new URLSearchParams({ scene: scene.id, style: params.get('style') ?? 'paper', theme: params.get('theme') ?? 'light', locale: params.get('locale') ?? 'zh' })}`
  })
  results.push(result)
  document.getElementById('report')!.textContent = JSON.stringify(results.map(({ text: _text, ...entry }) => entry), null, 2)
}
const report = { scope: 'Real desktop renderer components with synthetic browser preload; no packaged/native acceptance', total: results.length, passed: results.filter(result => result.state === 'passed').length, results }
progress.textContent = `${report.passed}/${report.total} passed`
document.documentElement.dataset.auditComplete = 'true'
document.getElementById('report')!.textContent = JSON.stringify(report, null, 2)
await fetch('/__review-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) })
