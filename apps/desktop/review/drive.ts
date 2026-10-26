/**
 * [INPUT]: One scene and the mounted product DOM.
 * [OUTPUT]: The actual user-facing failure reached through existing controls.
 * [POS]: Review preparation; event-driven waits report missing states instead of hiding failures.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Scenario } from './catalog'
import { messages, settingsMessages as settings, smartMessages } from '../src/renderer/i18n'
import { hostedCatalog } from '../src/shared/i18n/hosted'
import { currentLocale } from '../src/renderer/i18n'

export async function until<T>(read: () => T | null | undefined | false, label: string): Promise<T> {
  const started = performance.now()
  while (performance.now() - started < 10000) {
    const result = read()
    if (result) return result
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }
  throw new Error(`Review state not reached: ${label}`)
}
const element = (selector: string) => until(() => document.querySelector<HTMLElement>(selector), selector)
const click = async (selector: string) => (await element(selector)).click()
async function button(text: string, root = 'dialog[open]') {
  const target = await until(() => [...document.querySelectorAll<HTMLButtonElement>(`${root} button`)].find(node => node.textContent?.trim() === text || node.getAttribute('aria-label') === text), `button: ${text}`)
  target.click()
}
async function input(selector: string, value: string) {
  const node = await element(selector) as HTMLInputElement | HTMLTextAreaElement
  const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value)
  node.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}
async function submit(selector = 'dialog[open] form') { (await element(selector)).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }

export async function drive(s: Scenario) {
  await element('.board, .start-entry')
  switch (s.surface) {
    case 'banner':
      await click('.board button.check:not(:disabled)')
      await element('.error-banner')
      break
    case 'notice': await element('.notice-banner'); break
    case 'future': case 'past': case 'picker': {
      await click('[data-horizon="month"] [data-period-switch]')
      if (s.surface !== 'picker') await click(`.period-picker-quick button:${s.surface === 'future' ? 'last-child' : 'first-child'}`)
      await element('[role="alert"]')
      break
    }
    case 'search':
      await input('dialog[open] input', '产品')
      await element('dialog[open] [role="alert"]')
      break
    case 'detail':
      if (s.code === 'load') { await element('.detail-save-error'); break }
      await element('dialog[open] .detail-body')
      if (s.code === 'relation') {
        await click('.detail-props .detail-chip')
        await input('.flow-dot-relations input', '目标')
      } else {
        await click('dialog[open] .detail-title .check')
      }
      await element('dialog[open] [role="alert"]')
      break
    case 'assist':
      if (s.code === 'unavailable') { await element('.assistance-unavailable'); break }
      if (s.code !== 'prepare') { await click('.help-option'); await submit('.assistance-panel') }
      await element('.assistance-panel .inline-error'); break
    case 'composer':
      await input('.composer-input', '检查报错提示，今天完成')
      await element('.composer-cand [role="alert"]')
      break
    case 'quick':
      await click('[data-horizon="day"] [data-add-item]')
      await input('[data-horizon="day"] textarea, [data-horizon="day"] .quick-add input', '检查报错提示')
      await element('[data-horizon="day"] .quick-add [role="status"], [data-horizon="day"] .quick-add-hint')
      await until(() => document.querySelector('[data-horizon="day"]')?.textContent?.includes(s.message), s.message)
      break
    case 'provider':
      await until(() => document.querySelectorAll('.smart-provider').length > 0, 'provider list')
      await click('.smart-provider .provider-actions button')
      await input('.jev-connect input[type="password"]', 'review-key-only')
      await click('.jev-connect input[type="checkbox"]')
      await submit('.jev-connect')
      await element('.jev-result p[data-ok="false"]')
      break
    case 'settings':
      if (s.code === 'update') { await element('.update-status, .about-update'); break }
      await element('.settings-body')
      if (s.code === 'status') { await element('.settings-alert'); break }
      if (s.code === 'export') await button(settings.exportAction)
      else if (s.code === 'reset') await button(settings.reset)
      else if (['prepare', 'commit', 'cancel'].includes(s.code ?? '')) {
        await button(settings.chooseFile)
        if (s.code === 'cancel') await button(messages.cancel)
        else {
          await button(messages.prepareBackup)
          if (s.code === 'commit') { await click('.settings-modal .settings-footer input[type="checkbox"]'); await button(messages.restoreConfirm) }
        }
      } else if (s.code === 'backup') await button(messages.backupNow)
      else await button(settings.chooseFile)
      await element('.settings-alert, .danger-text')
      break
    case 'items':
      if (s.code === 'cancelled' || s.code === 'archived') await click(`.settings-modal .segmented [role="radio"]:nth-child(${s.code === 'cancelled' ? 2 : 3})`)
      await element('.settings-alert')
      break
    case 'password': case 'recovery': {
      if (s.surface === 'recovery' && s.code === 'destructive') { await click('.sync-recovery-form summary'); await click('.sync-recovery-alternative') }
      await input('dialog[open] input[type="password"]', 'review-password')
      const fields = [...document.querySelectorAll<HTMLInputElement>('dialog[open] input[type="password"]')]
      const second = fields[1]!
      second.dataset.reviewSecond = 'true'
      await input('[data-review-second]', s.code === 'mismatch' ? 'different-password' : 'review-password')
      if (s.code === 'mismatch') { second.focus(); second.blur() }
      if (s.code !== 'mismatch') {
        if (s.surface === 'recovery' && s.code === 'destructive') await input('.sync-recovery-form input[type="text"]', 'DELETE ALL CLOUD DATA')
        await submit()
      }
      await element('dialog[open] [role="alert"]')
      break
    }
    case 'signout':
      await click('input[value="clear"]')
      await submit()
      await until(() => document.querySelector('dialog[open]')?.textContent?.includes(settings.sync.errors.storage), 'sign-out failure')
      break
    case 'sync-review':
      await button(settings.sync.reviewDetails, '.sync-review-notice')
      if (s.code !== 'load') { await element('.sync-review-compare'); await click('.sync-review-footer button:last-child') }
      await element('.sync-review-error')
      break
    case 'review':
      await element('.review-drawer')
      if (s.code === 'refresh') { await element('.review-headline'); await click('.review-summary-refresh') }
      if (s.code === 'save' || s.code === 'draft') { await click('dialog[open] .review-foot button:last-child'); await click('dialog[open] .review-foot button:last-child') }
      await element('dialog[open] [role="alert"]')
      break
    case 'seed': await element('.seeded-composer [role="alert"]'); break
    case 'hosted':
      await button(hostedCatalog[currentLocale()].consent)
      await element('dialog[open] [role="alert"]')
      break
    case 'shortcuts':
      await click('.shortcut-row:first-child .shortcut-keys')
      await element('.shortcut-row[data-recording="true"]')
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', metaKey: true, bubbles: true, cancelable: true }))
      await element('.shortcut-conflict, .shortcut-recording[data-problem="true"]')
      break
    case 'link': await click('dialog[open] a'); await element('dialog[open] [role="alert"]'); break
    case 'start': await element('[role="alert"], .start-password-error'); break
    case 'sync':
      if (s.code === 'request') { await button(settings.sync.retry) }
      await element('.sync-pane')
      break
    case 'ai':
      await element('.smart-provider')
      if (s.code === 'remove') { await button(smartMessages.remove, '.smart-provider'); await element('.provider-remove') }
      break
    case 'backlog': await element('.backlog-error'); break
    case 'flow':
      await click('[data-item-id="today"] .flow-dot-button')
      if (s.code === 'search') await input('.relation-picker input', '目标')
      else await click('.relation-picker [aria-checked="true"]')
      await element('.flow-dot-relations [role="alert"]')
      break
    case 'nest':
      if (s.code === 'search') await input('.nesting-picker input', '目标')
      else await click('.nesting-choices button')
      await element('.nesting-picker [role="alert"]')
      break
    case 'feature': await element('.settings-hero'); break
    case 'toast':
      await click('[data-item-id="today"] .task-title')
      await click('.detail .modal-footer button')
      await element('.toast[data-warning="true"]')
      break
    case 'native': break
  }
  // Freeze only animations in the review document; errors and their real controls stay interactive.
  document.getAnimations().forEach(animation => { if (animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity) animation.finish() })
}
