/**
 * [INPUT]: Review URL, the complete product CSS entry and a synthetic bridge installed before product modules load.
 * [OUTPUT]: Isolated full-size production renderer and scenario readiness signals.
 * [POS]: Review iframe bootstrap; excluded from the packaged Electron entry.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import './product.css'
import { setLocale } from '../src/renderer/i18n'
import { buildScenarios } from './catalog'

async function main() {
  if (!('Temporal' in globalThis)) Object.assign(globalThis, { Temporal: (await import('@js-temporal/polyfill')).Temporal })
  const params = new URLSearchParams(location.search)
  const locale = params.get('locale') ?? 'zh'
  await setLocale(['zh', 'en', 'ja', 'es', 'fr'].includes(locale) ? locale as 'zh' | 'en' | 'ja' | 'es' | 'fr' : 'zh')
  const all = buildScenarios()
  const scenario = all.find(scene => scene.id === params.get('scene')) ?? all[0]!
  if (scenario.surface === 'native') {
    createRoot(document.getElementById('root')!).render(<main style={{ height: '100vh', display: 'grid', placeContent: 'center', background: '#f2f2ef', gap: 16 }}><p style={{ textAlign: 'center', fontSize: 12, color: '#66705e' }}>macOS 原生系统弹窗 · 实际截图</p><img style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 80px)', objectFit: 'contain' }} alt={scenario.message} src={`/__native-captures/${scenario.id}.png`} onLoad={() => { document.documentElement.dataset.reviewReady = scenario.id; parent.postMessage({ type: 'goalloom-review-ready', id: scenario.id }, location.origin) }} /></main>)
    return
  }
  const style = params.get('style'), theme = params.get('theme') === 'dark' ? 'dark' : 'light'
  localStorage.clear()
  localStorage.setItem('goalloom.visiblePlanningColumns', JSON.stringify(['cycle', 'month', 'week', 'day']))
  localStorage.setItem('goalloom.hiddenColumns', JSON.stringify(['later']))
  const [{ installBridge }, { drive }] = await Promise.all([import('./bridge'), import('./drive')])
  const bridge = installBridge(scenario, style === 'minimal' || style === 'macos' ? style : 'paper', theme)
  const { Scene } = await import('./scene')
  createRoot(document.getElementById('root')!).render(<React.StrictMode><Scene scenario={scenario} initial={bridge.snapshot} /></React.StrictMode>)
  await drive(scenario)
  document.documentElement.dataset.reviewReady = scenario.id
  parent.postMessage({ type: 'goalloom-review-ready', id: scenario.id }, location.origin)
}
void main().catch(error => {
  document.documentElement.dataset.reviewError = String(error)
  parent.postMessage({ type: 'goalloom-review-error', message: String(error) }, location.origin)
})
